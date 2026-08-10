"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { TIME_TRACKING_TAG } from "@/lib/cache-tags";
import { HubAccessError, requireHubAccessToken } from "@/lib/hub/verifyHubAccess";
import { entryHash } from "@/lib/import";
import {
  planSoftDuplicateCleanup,
  toHashFields,
} from "@/lib/import/dedup";
import { isUniqueViolation } from "@/lib/import/pg-errors";
import { computeRepairWork } from "@/lib/import/repair-plan";
import type {
  RepairChunkResult,
  RepairDuplicateRow,
  RepairHashUpdate,
  RepairPreviewResult,
  RepairResult,
  RepairWorkPlan,
} from "@/lib/import/repair-types";
import { bustMemoryCache } from "@/lib/memory-cache";
import {
  getSupabaseServiceRole,
  hasSupabaseServiceRole,
} from "@/lib/supabase";
import { loadExistingInRange } from "./entry-db";

/** Cap duplicate rows returned to the UI for review modals. */
const DUPLICATE_LIST_LIMIT = 200;
const REPAIR_REHASH_PARALLEL = 20;

async function repairAuthError(
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

function revalidateAfterRepair() {
  bustMemoryCache();
  revalidateTag(TIME_TRACKING_TAG, { expire: 0 });
  revalidatePath("/");
  revalidatePath("/people");
  revalidatePath("/import");
}

async function buildRepairWork(
  from: string,
  to: string
): Promise<RepairWorkPlan> {
  const existing = await loadExistingInRange(from, to);
  const core = computeRepairWork(existing);
  return {
    ok: true,
    from,
    to,
    ...core,
  };
}

/**
 * Dry-run: rehash count + soft-duplicate rows that would be deleted.
 * Does not write or delete.
 */
export async function previewRepairDuplicates(options?: {
  from?: string;
  to?: string;
  accessToken?: string | null;
}): Promise<RepairPreviewResult> {
  const from = options?.from ?? "2020-01-01";
  const to = options?.to ?? "2100-12-31";
  const empty = (error?: string): RepairPreviewResult => ({
    ok: false,
    error,
    from,
    to,
    wouldRehash: 0,
    wouldDelete: 0,
    kept: 0,
    duplicates: [],
    duplicatesTotal: 0,
  });

  const denied = await repairAuthError(options?.accessToken);
  if (denied) return empty(denied);

  try {
    const existing = await loadExistingInRange(from, to);
    let wouldRehash = 0;
    for (const row of existing) {
      const next = entryHash(toHashFields(row));
      if (row.entry_hash !== next) wouldRehash += 1;
    }

    const plans = planSoftDuplicateCleanup(existing);
    const byId = new Map(existing.map((r) => [r.id, r]));
    const allDuplicates: RepairDuplicateRow[] = [];

    for (const plan of plans) {
      for (const id of plan.deleteIds) {
        const row = byId.get(id);
        if (!row) continue;
        allDuplicates.push({
          id: row.id,
          person: row.person,
          date:
            typeof row.date === "string" ? row.date.slice(0, 10) : String(row.date),
          hours: Number(row.hours),
          task: row.task,
          department: row.department,
          role: row.role,
          timeRange: row.source_time_range,
          entry_hash: row.entry_hash,
          keepId: plan.keepId,
          sourceFile: row.source_file,
        });
      }
    }

    return {
      ok: true,
      from,
      to,
      wouldRehash,
      wouldDelete: allDuplicates.length,
      kept: plans.length,
      duplicates: allDuplicates.slice(0, DUPLICATE_LIST_LIMIT),
      duplicatesTotal: allDuplicates.length,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return empty(msg);
  }
}

/**
 * Build the rehash + delete work list after user confirmation.
 * Prefer applyRepairDuplicates for an atomic apply when the RPC is available.
 */
export async function prepareRepairDuplicates(options: {
  from?: string;
  to?: string;
  confirm: true;
}): Promise<RepairWorkPlan> {
  const from = options?.from ?? "2020-01-01";
  const to = options?.to ?? "2100-12-31";
  const empty = (error: string): RepairWorkPlan => ({
    ok: false,
    error,
    from,
    to,
    updates: [],
    clearHashIds: [],
    deleteIds: [],
    kept: 0,
    totalSteps: 0,
  });

  if (options?.confirm !== true) {
    return empty("Repair requires explicit confirmation.");
  }

  try {
    return await buildRepairWork(from, to);
  } catch (e) {
    return empty(e instanceof Error ? e.message : String(e));
  }
}

/** Null out colliding hashes before applying unique rehash targets (fallback path). */
export async function repairClearHashChunk(
  ids: number[]
): Promise<RepairChunkResult> {
  if (!ids.length) return { ok: true, processed: 0 };
  try {
    const supabase = getSupabaseServiceRole();
    const { error } = await supabase
      .from("time_entries")
      .update({ entry_hash: null })
      .in("id", ids);
    if (error) throw new Error(error.message);
    return { ok: true, processed: ids.length };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      processed: 0,
    };
  }
}

/**
 * Apply a chunk of rehash updates (fallback when apply_import_repair is unavailable).
 */
export async function repairRehashChunk(
  updates: RepairHashUpdate[]
): Promise<RepairChunkResult> {
  if (!updates.length) return { ok: true, processed: 0 };
  try {
    const supabase = getSupabaseServiceRole();
    let processed = 0;

    for (let i = 0; i < updates.length; i += REPAIR_REHASH_PARALLEL) {
      const slice = updates.slice(i, i + REPAIR_REHASH_PARALLEL);
      const results = await Promise.all(
        slice.map(async (u) => {
          const { error } = await supabase
            .from("time_entries")
            .update({ entry_hash: u.entry_hash })
            .eq("id", u.id);
          if (!error) return { ok: true as const };
          if (isUniqueViolation(error)) {
            await supabase
              .from("time_entries")
              .update({ entry_hash: null })
              .eq("id", u.id);
            return { ok: true as const, cleared: true };
          }
          return { ok: false as const, error: error.message };
        })
      );
      for (const r of results) {
        if (!r.ok) throw new Error(r.error);
        if (!("cleared" in r && r.cleared)) processed += 1;
      }
    }

    return { ok: true, processed };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isUniqueViolation({ message: msg })) {
      return {
        ok: false,
        error:
          "Repair hit overlapping hashes. Re-run repair after clearing duplicates, or import again — duplicates will be skipped.",
        processed: 0,
      };
    }
    return { ok: false, error: msg, processed: 0 };
  }
}

export async function repairDeleteChunk(
  ids: number[]
): Promise<RepairChunkResult> {
  if (!ids.length) return { ok: true, processed: 0 };
  try {
    const supabase = getSupabaseServiceRole();
    const { error, count } = await supabase
      .from("time_entries")
      .delete({ count: "exact" })
      .in("id", ids);
    if (error) throw new Error(error.message);
    return { ok: true, processed: count ?? ids.length };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      processed: 0,
    };
  }
}

export async function finalizeRepairDuplicates(): Promise<{ ok: boolean }> {
  revalidateAfterRepair();
  return { ok: true };
}

async function applyRepairViaRpc(plan: RepairWorkPlan): Promise<RepairResult> {
  const supabase = getSupabaseServiceRole();
  const rehash_pairs = plan.updates.map((u) => ({
    id: u.id,
    entry_hash: u.entry_hash,
  }));

  const { data, error } = await supabase.rpc("apply_import_repair", {
    clear_ids: plan.clearHashIds,
    rehash_pairs,
    delete_ids: plan.deleteIds,
  });

  if (error) throw new Error(error.message);

  const cleared = Number(
    (data as { cleared?: number } | null)?.cleared ?? plan.clearHashIds.length
  );
  const rehashed = Number(
    (data as { rehashed?: number } | null)?.rehashed ?? plan.updates.length
  );
  const deleted = Number(
    (data as { deleted?: number } | null)?.deleted ?? plan.deleteIds.length
  );

  void cleared;
  await finalizeRepairDuplicates();
  return {
    ok: true,
    rehashed,
    deleted,
    kept: plan.kept,
    transactional: true,
  };
}

async function applyRepairChunked(plan: RepairWorkPlan): Promise<RepairResult> {
  if (plan.clearHashIds.length) {
    const clear = await repairClearHashChunk(plan.clearHashIds);
    if (!clear.ok) throw new Error(clear.error);
  }

  let rehashed = 0;
  for (let i = 0; i < plan.updates.length; i += 50) {
    const chunk = plan.updates.slice(i, i + 50);
    const r = await repairRehashChunk(chunk);
    if (!r.ok) {
      return {
        ok: false,
        error:
          (r.error ?? "Chunked repair failed") +
          " Partial writes may have occurred — re-run repair to finish.",
        rehashed: 0,
        deleted: 0,
        kept: 0,
        transactional: false,
      };
    }
    rehashed += r.processed;
  }

  let deleted = 0;
  for (let i = 0; i < plan.deleteIds.length; i += 100) {
    const chunk = plan.deleteIds.slice(i, i + 100);
    const r = await repairDeleteChunk(chunk);
    if (!r.ok) {
      return {
        ok: false,
        error:
          (r.error ?? "Chunked delete failed") +
          " Partial writes may have occurred — re-run repair to finish.",
        rehashed,
        deleted: 0,
        kept: 0,
        transactional: false,
      };
    }
    deleted += r.processed;
  }

  await finalizeRepairDuplicates();
  return {
    ok: true,
    rehashed,
    deleted,
    kept: plan.kept,
    transactional: false,
  };
}

/**
 * Preferred apply path: one transactional RPC (clear → rehash → delete).
 * Falls back to chunked client updates only when the RPC is missing/unavailable;
 * chunked path is not all-or-nothing — errors call that out.
 */
export async function applyRepairDuplicates(options: {
  from?: string;
  to?: string;
  confirm: true;
  accessToken?: string | null;
}): Promise<RepairResult> {
  if (options?.confirm !== true) {
    return {
      ok: false,
      error: "Repair requires explicit confirmation.",
      rehashed: 0,
      deleted: 0,
      kept: 0,
    };
  }

  const denied = await repairAuthError(options?.accessToken);
  if (denied) {
    return {
      ok: false,
      error: denied,
      rehashed: 0,
      deleted: 0,
      kept: 0,
    };
  }

  if (!hasSupabaseServiceRole()) {
    return {
      ok: false,
      error:
        "Missing SUPABASE_SERVICE_ROLE_KEY. Repair needs the service-role key.",
      rehashed: 0,
      deleted: 0,
      kept: 0,
    };
  }

  try {
    const from = options?.from ?? "2020-01-01";
    const to = options?.to ?? "2100-12-31";
    const plan = await buildRepairWork(from, to);

    if (plan.totalSteps === 0) {
      await finalizeRepairDuplicates();
      return {
        ok: true,
        rehashed: 0,
        deleted: 0,
        kept: plan.kept,
        transactional: true,
      };
    }

    try {
      return await applyRepairViaRpc(plan);
    } catch (rpcErr) {
      const msg = rpcErr instanceof Error ? rpcErr.message : String(rpcErr);
      // Missing function / permission → careful chunked fallback.
      const rpcMissing =
        /function .*apply_import_repair/i.test(msg) ||
        /could not find the function/i.test(msg) ||
        /PGRST202/i.test(msg) ||
        /404/.test(msg);
      if (!rpcMissing) {
        return {
          ok: false,
          error: msg,
          rehashed: 0,
          deleted: 0,
          kept: 0,
        };
      }
      return await applyRepairChunked(plan);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isUniqueViolation({ message: msg })) {
      return {
        ok: false,
        error:
          "Repair hit overlapping hashes. Re-run repair after clearing duplicates, or import again — duplicates will be skipped.",
        rehashed: 0,
        deleted: 0,
        kept: 0,
      };
    }
    return {
      ok: false,
      error: msg,
      rehashed: 0,
      deleted: 0,
      kept: 0,
    };
  }
}

/**
 * One-shot repair (scripts / fallback). Prefer applyRepairDuplicates from the UI.
 */
export async function repairImportDuplicates(options: {
  from?: string;
  to?: string;
  confirm: true;
  accessToken?: string | null;
}): Promise<RepairResult> {
  return applyRepairDuplicates(options);
}
