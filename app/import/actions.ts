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
import { isEntryHashConflict, isIdentitySequenceConflict, isUniqueViolation } from "@/lib/import/pg-errors";
import { bustMemoryCache } from "@/lib/memory-cache";
import { getSupabaseServiceRole } from "@/lib/supabase";
import type {
  ImportCommitResult,
  ImportDuplicateRow,
  ImportPreviewResult,
} from "@/lib/import/import-action-types";
import { countTimeEntries, existingHashSet, loadExistingInRange } from "./entry-db";

function supabaseProjectRef(): string {
  const url = process.env.SUPABASE_URL ?? "";
  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  return match?.[1] ?? "unknown";
}

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
  const loggedMinutes = Math.round(Number(row.hours) * 60);
  return {
    person: row.person,
    date: row.date.slice(0, 10),
    department: row.department,
    role: row.role,
    task: row.task,
    type: row.type,
    billable: row.billable,
    loggedMinutes,
    comments: row.comments,
    timeRange: row.source_time_range,
  };
}

/** RPC payload shape — no employee_id (function does not set FK). */
function stripForRpc(rows: TimeEntryInsert[]): Omit<TimeEntryInsert, "employee_id">[] {
  return rows.map(({ employee_id: _e, ...row }) => row);
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
  knownHashes: Set<string>,
  options?: { hashOnly?: boolean }
): { newRows: TimeEntryInsert[]; skippedRows: TimeEntryInsert[] } {
  const newRows: TimeEntryInsert[] = [];
  const skippedRows: TimeEntryInsert[] = [];
  const accepted = new Set<string>();
  const hashOnly = options?.hashOnly ?? false;

  for (const row of unique) {
    const canonical = canonicalizeInsert(row);

    if (
      knownHashes.has(canonical.entry_hash) ||
      accepted.has(canonical.entry_hash)
    ) {
      skippedRows.push(canonical);
      continue;
    }

    if (!hashOnly) {
      const fields = insertToHashFields(canonical);
      if (existing.some((ex) => isDuplicateOfExisting(fields, ex))) {
        skippedRows.push(canonical);
        knownHashes.add(canonical.entry_hash);
        continue;
      }
    }

    accepted.add(canonical.entry_hash);
    knownHashes.add(canonical.entry_hash);
    newRows.push(canonical);
  }
  return { newRows, skippedRows };
}

/** Parse CSV and dedupe against DB — shared by preview and commit. */
async function resolveImportNewRows(
  csvText: string,
  sourceFile?: string | null
): Promise<{
  parsed: ReturnType<typeof parseMemtimeCsv>;
  unique: TimeEntryInsert[];
  newRows: TimeEntryInsert[];
  intraDuplicates: TimeEntryInsert[];
  skippedRows: TimeEntryInsert[];
}> {
  const employees = await getEmployees();
  const employeeNames = employees.map((e) => e.person);
  const parsed = parseMemtimeCsv(csvText, { sourceFile, employeeNames });
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
  return { parsed, unique, newRows, intraDuplicates, skippedRows };
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
  let lastError: string | undefined;

  async function rpcInsert(payload: Omit<TimeEntryInsert, "employee_id">[]): Promise<number> {
    const { data, error } = await supabase.rpc("import_time_entries_ignore_dups", {
      payload,
    });
    if (error) {
      lastError = error.message;
      return -1;
    }
    return Number(data ?? 0);
  }

  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const chunk = rows.slice(i, i + INSERT_BATCH);
    const rpcPayload = stripForRpc(chunk);

    const batchWrote = await rpcInsert(rpcPayload);
    if (batchWrote > 0) {
      inserted += batchWrote;
      skipped += Math.max(0, chunk.length - batchWrote);
      continue;
    }

    if (batchWrote < 0) {
      return { inserted, skipped, hardError: lastError };
    }

    // RPC returned 0 — row-by-row so one duplicate does not fail the whole batch.
    for (const row of chunk) {
      const onePayload = stripForRpc([row]);
      const oneWrote = await rpcInsert(onePayload);
      if (oneWrote < 0) {
        return { inserted, skipped, hardError: lastError };
      }
      if (oneWrote > 0) inserted += 1;
      else skipped += 1;
    }
  }

  return { inserted, skipped, hardError: lastError };
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
    dbTimeEntryCount: 0,
    dbProjectRef: supabaseProjectRef(),
    sample: [],
  });

  const denied = await authError(accessToken);
  if (denied) return empty(denied);

  if (!csvText?.trim()) {
    return empty("CSV text is empty");
  }

  try {
    const parsedOnly = parseMemtimeCsv(csvText, {
      sourceFile,
      employeeNames: (await getEmployees()).map((e) => e.person),
    });

    if (parsedOnly.valid.length === 0 && parsedOnly.rejected.length > 0) {
      return {
        ...empty(
          parsedOnly.rejected[0]?.rowNumber === 0
            ? parsedOnly.rejected[0].reason
            : undefined
        ),
        ok: parsedOnly.rejected[0]?.rowNumber !== 0,
        totalRows: parsedOnly.totalRows,
        rejectedCount: parsedOnly.rejected.length,
        dateMin: parsedOnly.dateMin,
        dateMax: parsedOnly.dateMax,
        totalHours: parsedOnly.totalHours,
        rejected: parsedOnly.rejected.slice(0, 50),
      };
    }

    const dbTimeEntryCount = await countTimeEntries();
    const dbProjectRef = supabaseProjectRef();

    const { parsed, unique, newRows, intraDuplicates, skippedRows } =
      await resolveImportNewRows(csvText, sourceFile);
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
      dbTimeEntryCount,
      dbProjectRef,
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
  csvText: string,
  sourceFile?: string | null,
  meta?: { rejectedCount?: number; totalRows?: number }
): Promise<ImportCommitResult> {
  const rejected = meta?.rejectedCount ?? 0;
  const processed = meta?.totalRows ?? 0;

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

  if (!csvText?.trim()) {
    return {
      ok: false,
      error: "CSV text is empty",
      processed,
      inserted: 0,
      skippedDuplicate: 0,
      rejected,
    };
  }

  try {
    const dbTimeEntryCount = await countTimeEntries();
    const dbProjectRef = supabaseProjectRef();

    const { parsed, newRows, intraDuplicates, skippedRows } =
      await resolveImportNewRows(csvText, sourceFile);
    const totalRows = meta?.totalRows ?? parsed.totalRows;
    let skippedDuplicate = intraDuplicates.length + skippedRows.length;
    const resultMeta = { dbTimeEntryCount, dbProjectRef };

    if (newRows.length === 0) {
      return {
        ok: true,
        processed: totalRows,
        inserted: 0,
        skippedDuplicate,
        rejected,
        ...resultMeta,
      };
    }

    const withIds = await withEmployeeIds(newRows);
    const result = await insertIgnoringDuplicates(withIds);
    skippedDuplicate += result.skipped;

    if (result.hardError) {
      if (isIdentitySequenceConflict({ message: result.hardError })) {
        return {
          ok: false,
          error:
            "New rows could not get an id — the time_entries id sequence is out of sync after the legacy migration. " +
            "Run supabase/migrations/011_reset_identity_sequences.sql in the Hub SQL editor, then import again.",
          processed: totalRows,
          inserted: result.inserted,
          skippedDuplicate,
          rejected,
          dbTimeEntryCount,
          dbProjectRef,
        };
      }
      if (isEntryHashConflict({ message: result.hardError })) {
        skippedDuplicate += Math.max(
          0,
          newRows.length - result.inserted - result.skipped
        );
      } else {
        return {
          ok: false,
          error: result.hardError,
          processed: totalRows,
          inserted: result.inserted,
          skippedDuplicate,
          rejected,
          ...resultMeta,
        };
      }
    }

    if (newRows.length > 0 && result.inserted === 0) {
      if (result.skipped >= newRows.length) {
        return {
          ok: false,
          error:
            `All ${newRows.length} rows were skipped at insert time (matching entry_hash already in the database). ` +
            "Re-upload to refresh preview, or run supabase/migrations/010_find_existing_entry_hashes.sql if preview still shows rows as New.",
          processed: totalRows,
          inserted: 0,
          skippedDuplicate,
          rejected,
          dbTimeEntryCount,
          dbProjectRef,
        };
      }
      const detail = result.hardError
        ? ` Database said: ${result.hardError}`
        : "";
      return {
        ok: false,
        error:
          `Import could not insert rows (${newRows.length} expected).${detail} ` +
          "If the message mentions time_entries_pkey, run supabase/migrations/011_reset_identity_sequences.sql.",
        processed: totalRows,
        inserted: 0,
        skippedDuplicate,
        rejected,
        ...resultMeta,
      };
    }

    revalidateAfterImport();
    const afterCount = await countTimeEntries();
    return {
      ok: true,
      processed: totalRows,
      inserted: result.inserted,
      skippedDuplicate,
      rejected,
      dbTimeEntryCount: afterCount,
      dbProjectRef,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isUniqueViolation({ message: msg })) {
      return {
        ok: false,
        error:
          "Rows conflicted with existing entries (entry_hash). Try Repair Duplicates or re-upload after refreshing.",
        processed,
        inserted: 0,
        skippedDuplicate: 0,
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
