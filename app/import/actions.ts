"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { TIME_TRACKING_TAG } from "@/lib/cache-tags";
import { requireHubAccessToken, HubAccessError } from "@/lib/hub/verifyHubAccess";
import { getEmployees } from "@/lib/data";
import {
  entryHash,
  parseMemtimeCsv,
  type TimeEntryInsert,
} from "@/lib/import";
import {
  existingEntryHashes,
  isDuplicateOfExisting,
  type ExistingEntryForDedup,
} from "@/lib/import/dedup";
import type { HashFields } from "@/lib/import/hash";
import { isUniqueViolation } from "@/lib/import/pg-errors";
import { bustMemoryCache } from "@/lib/memory-cache";
import { getSupabaseServiceRole } from "@/lib/supabase";
import type {
  ImportCommitResult,
  ImportDuplicateRow,
  ImportPreviewResult,
} from "@/lib/import/import-action-types";
import { existingHashSet, loadExistingInRange } from "./entry-db";

const DUPLICATE_LIST_LIMIT = 200;

async function authError(
  accessToken: string | null | undefined
): Promise<string | null> {
  try {
    await requireHubAccessToken(accessToken);
    return null;
  } catch (err) {
    return err instanceof HubAccessError
      ? err.message
      : err instanceof Error
        ? err.message
        : "Unauthorized";
  }
}

const INSERT_BATCH = 100;

function revalidateAfterImport() {
  bustMemoryCache();
  revalidateTag(TIME_TRACKING_TAG, { expire: 0 });
  revalidatePath("/");
  revalidatePath("/people");
  revalidatePath("/import");
}

function insertToHashFields(row: TimeEntryInsert): HashFields {
  return {
    person: row.person,
    date: row.date,
    department: row.department,
    role: row.role,
    task: row.task,
    type: row.type,
    billable: row.billable,
    loggedMinutes: Math.round(Number(row.hours) * 60),
    comments: row.comments,
    timeRange: row.source_time_range,
  };
}

/** Canonicalize insert so entry_hash always matches the hash function. */
function canonicalizeInsert(row: TimeEntryInsert): TimeEntryInsert {
  const fields = insertToHashFields(row);
  return { ...row, entry_hash: entryHash(fields) };
}

function uniqueByHash(rows: TimeEntryInsert[]): {
  unique: TimeEntryInsert[];
  intraDuplicates: TimeEntryInsert[];
} {
  const seen = new Set<string>();
  const unique: TimeEntryInsert[] = [];
  const intraDuplicates: TimeEntryInsert[] = [];
  for (const row of rows) {
    const canonical = canonicalizeInsert(row);
    if (seen.has(canonical.entry_hash)) {
      intraDuplicates.push(canonical);
      continue;
    }
    seen.add(canonical.entry_hash);
    unique.push(canonical);
  }
  return { unique, intraDuplicates };
}

function toImportDuplicateRow(
  row: TimeEntryInsert,
  reason: ImportDuplicateRow["reason"]
): ImportDuplicateRow {
  return {
    person: row.person,
    date: row.date,
    hours: row.hours,
    task: row.task,
    department: row.department,
    role: row.role,
    timeRange: row.source_time_range,
    entry_hash: row.entry_hash,
    reason,
  };
}

function seedKnownHashes(
  existing: ExistingEntryForDedup[],
  knownHashes: Set<string>
) {
  for (const row of existing) {
    for (const h of existingEntryHashes(row)) {
      knownHashes.add(h);
    }
  }
}

function partitionAgainstExisting(
  unique: TimeEntryInsert[],
  existing: ExistingEntryForDedup[],
  knownHashes: Set<string>
): { newRows: TimeEntryInsert[]; skippedRows: TimeEntryInsert[] } {
  const newRows: TimeEntryInsert[] = [];
  const skippedRows: TimeEntryInsert[] = [];
  const accepted = new Set<string>();

  for (const row of unique) {
    const canonical = canonicalizeInsert(row);

    if (
      knownHashes.has(canonical.entry_hash) ||
      accepted.has(canonical.entry_hash)
    ) {
      skippedRows.push(canonical);
      continue;
    }

    const fields = insertToHashFields(canonical);
    if (existing.some((ex) => isDuplicateOfExisting(fields, ex))) {
      skippedRows.push(canonical);
      knownHashes.add(canonical.entry_hash);
      continue;
    }

    accepted.add(canonical.entry_hash);
    knownHashes.add(canonical.entry_hash);
    newRows.push(canonical);
  }
  return { newRows, skippedRows };
}

/**
 * Attach nullable employee_id from the directory by person name.
 * Analytics still join on person text; this seeds stable FKs for future use.
 */
async function withEmployeeIds(
  rows: TimeEntryInsert[]
): Promise<TimeEntryInsert[]> {
  if (!rows.length) return rows;
  try {
    const employees = await getEmployees();
    const byPerson = new Map(employees.map((e) => [e.person, e.id]));
    return rows.map((row) => {
      const employee_id = byPerson.get(row.person) ?? null;
      return employee_id != null ? { ...row, employee_id } : row;
    });
  } catch {
    return rows;
  }
}

/**
 * Insert rows without ever surfacing entry_hash unique violations.
 * Prefers the SECURITY DEFINER RPC (ON CONFLICT DO NOTHING); falls back to
 * upsert / row-by-row, always treating 23505 as a skip.
 */
async function insertIgnoringDuplicates(
  rows: TimeEntryInsert[]
): Promise<{ inserted: number; skipped: number; hardError?: string }> {
  const supabase = getSupabaseServiceRole();
  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const chunk = rows.slice(i, i + INSERT_BATCH);

    const rpc = await supabase.rpc("import_time_entries_ignore_dups", {
      payload: chunk,
    });

    if (!rpc.error) {
      const wrote = Number(rpc.data ?? 0);
      inserted += wrote;
      skipped += Math.max(0, chunk.length - wrote);
      continue;
    }

    // RPC missing / permission — try PostgREST upsert.
    const upsert = await supabase
      .from("time_entries")
      .upsert(chunk, {
        onConflict: "entry_hash",
        ignoreDuplicates: true,
      })
      .select("id");

    if (!upsert.error) {
      const wrote = upsert.data?.length ?? 0;
      inserted += wrote;
      skipped += Math.max(0, chunk.length - wrote);
      continue;
    }

    // Batch conflict or on_conflict misconfigured — row-by-row.
    for (const row of chunk) {
      const one = await supabase
        .from("time_entries")
        .upsert(row, {
          onConflict: "entry_hash",
          ignoreDuplicates: true,
        })
        .select("id");

      if (!one.error) {
        const wrote = one.data?.length ?? 0;
        if (wrote === 0) skipped += 1;
        else inserted += wrote;
        continue;
      }

      if (isUniqueViolation(one.error)) {
        skipped += 1;
        continue;
      }

      const plain = await supabase.from("time_entries").insert(row).select("id");
      if (!plain.error) {
        inserted += plain.data?.length ?? 1;
        continue;
      }
      if (isUniqueViolation(plain.error)) {
        skipped += 1;
        continue;
      }
      return {
        inserted,
        skipped,
        hardError:
          plain.error.message || one.error.message || upsert.error.message,
      };
    }
  }

  return { inserted, skipped };
}

export async function previewImport(
  accessToken: string | null | undefined,
  csvText: string,
  sourceFile?: string | null
): Promise<ImportPreviewResult> {
  const empty = (error?: string): ImportPreviewResult => ({
    ok: false,
    error,
    totalRows: 0,
    validCount: 0,
    rejectedCount: 0,
    wouldInsert: 0,
    wouldSkipDuplicate: 0,
    dateMin: null,
    dateMax: null,
    totalHours: 0,
    newHours: 0,
    rejected: [],
    rows: [],
    duplicates: [],
    duplicatesTotal: 0,
    sample: [],
  });

  const denied = await authError(accessToken);
  if (denied) return empty(denied);

  if (!csvText?.trim()) {
    return empty("CSV text is empty");
  }

  try {
    const employees = await getEmployees();
    const employeeNames = employees.map((e) => e.person);

    const parsed = parseMemtimeCsv(csvText, {
      sourceFile,
      employeeNames,
    });

    if (parsed.valid.length === 0 && parsed.rejected.length > 0) {
      return {
        ...empty(
          parsed.rejected[0]?.rowNumber === 0
            ? parsed.rejected[0].reason
            : undefined
        ),
        ok: parsed.rejected[0]?.rowNumber !== 0,
        totalRows: parsed.totalRows,
        rejectedCount: parsed.rejected.length,
        dateMin: parsed.dateMin,
        dateMax: parsed.dateMax,
        totalHours: parsed.totalHours,
        rejected: parsed.rejected.slice(0, 50),
      };
    }

    const inserts = parsed.valid.map((v) => v.insert);
    const { unique, intraDuplicates } = uniqueByHash(inserts);

    const dateMin = parsed.dateMin ?? "1900-01-01";
    const dateMax = parsed.dateMax ?? "2100-01-01";
    const [existing, knownHashes] = await Promise.all([
      loadExistingInRange(dateMin, dateMax),
      existingHashSet(unique.map((r) => r.entry_hash)),
    ]);
    seedKnownHashes(existing, knownHashes);

    const { newRows, skippedRows } = partitionAgainstExisting(
      unique,
      existing,
      knownHashes
    );
    const wouldSkipDuplicate = intraDuplicates.length + skippedRows.length;

    const allDuplicates: ImportDuplicateRow[] = [
      ...intraDuplicates.map((r) => toImportDuplicateRow(r, "in_file")),
      ...skippedRows.map((r) => toImportDuplicateRow(r, "already_imported")),
    ];
    const duplicatesTotal = allDuplicates.length;
    const duplicates = allDuplicates.slice(0, DUPLICATE_LIST_LIMIT);

    let newHours = 0;
    const sample: ImportPreviewResult["sample"] = [];
    const newHashSet = new Set(newRows.map((r) => r.entry_hash));

    for (const row of unique) {
      const isDup = !newHashSet.has(row.entry_hash);
      if (!isDup) newHours += row.hours;
      if (sample.length < 12) {
        sample.push({
          person: row.person,
          date: row.date,
          hours: row.hours,
          task: row.task,
          department: row.department,
          entry_hash: row.entry_hash,
          status: isDup ? "duplicate" : "new",
        });
      }
    }

    return {
      ok: true,
      totalRows: parsed.totalRows,
      validCount: parsed.valid.length,
      rejectedCount: parsed.rejected.length,
      wouldInsert: newRows.length,
      wouldSkipDuplicate,
      dateMin: parsed.dateMin,
      dateMax: parsed.dateMax,
      totalHours: parsed.totalHours,
      newHours: Math.round(newHours * 10000) / 10000,
      rejected: parsed.rejected.slice(0, 50),
      rows: newRows,
      duplicates,
      duplicatesTotal,
      sample,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Preview never writes; unique violations should not appear — but never leak them.
    if (isUniqueViolation({ message: msg })) {
      return empty("Could not check duplicates. Please try again.");
    }
    return empty(msg);
  }
}

export async function commitImport(
  accessToken: string | null | undefined,
  rows: TimeEntryInsert[],
  meta?: { rejectedCount?: number; totalRows?: number }
): Promise<ImportCommitResult> {
  const rejected = meta?.rejectedCount ?? 0;
  const processed = meta?.totalRows ?? rows.length;

  const denied = await authError(accessToken);
  if (denied) {
    return {
      ok: false,
      error: denied,
      processed,
      inserted: 0,
      skippedDuplicate: 0,
      rejected,
    };
  }

  if (!rows?.length) {
    return {
      ok: true,
      processed,
      inserted: 0,
      skippedDuplicate: 0,
      rejected,
    };
  }

  try {
    const { unique, intraDuplicates } = uniqueByHash(rows);
    const dates = unique.map((r) => r.date).sort();
    const [existing, knownHashes] = await Promise.all([
      loadExistingInRange(dates[0], dates[dates.length - 1]),
      existingHashSet(unique.map((r) => r.entry_hash)),
    ]);
    seedKnownHashes(existing, knownHashes);

    const { newRows, skippedRows } = partitionAgainstExisting(
      unique,
      existing,
      knownHashes
    );
    let skippedDuplicate = intraDuplicates.length + skippedRows.length;

    const withIds = await withEmployeeIds(newRows);
    const result = await insertIgnoringDuplicates(withIds);
    skippedDuplicate += result.skipped;

    if (result.hardError) {
      // Last line of defense: never show entry_hash unique errors to the user.
      if (isUniqueViolation({ message: result.hardError })) {
        skippedDuplicate += Math.max(
          0,
          newRows.length - result.inserted - result.skipped
        );
      } else {
        return {
          ok: false,
          error: result.hardError,
          processed,
          inserted: result.inserted,
          skippedDuplicate,
          rejected,
        };
      }
    }

    revalidateAfterImport();
    return {
      ok: true,
      processed,
      inserted: result.inserted,
      skippedDuplicate,
      rejected,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isUniqueViolation({ message: msg })) {
      return {
        ok: true,
        processed,
        inserted: 0,
        skippedDuplicate: rows.length,
        rejected,
      };
    }
    return {
      ok: false,
      error: msg,
      processed,
      inserted: 0,
      skippedDuplicate: 0,
      rejected,
    };
  }
}

export async function getImportSetupStatus(
  accessToken: string | null | undefined
): Promise<{
  serviceRoleConfigured: boolean;
  error?: string;
}> {
  const denied = await authError(accessToken);
  if (denied) return { serviceRoleConfigured: false, error: denied };
  const { hasSupabaseServiceRole } = await import("@/lib/supabase");
  return { serviceRoleConfigured: hasSupabaseServiceRole() };
}
