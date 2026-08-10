import { entryHash } from "./hash";
import {
  planSoftDuplicateCleanup,
  toHashFields,
  type ExistingEntryForDedup,
} from "./dedup";

export type RepairHashUpdate = { id: number; entry_hash: string };

export type RepairWorkPlanCore = {
  updates: RepairHashUpdate[];
  clearHashIds: number[];
  deleteIds: number[];
  kept: number;
  totalSteps: number;
};

/**
 * Collapse multiple rows that want the same v3 hash: keep the highest id,
 * clear the rest so unique constraint races cannot occur during writes.
 */
export function collapseRehashUpdates(updates: RepairHashUpdate[]): {
  apply: RepairHashUpdate[];
  clearIds: number[];
} {
  const byHash = new Map<string, number[]>();
  for (const u of updates) {
    const list = byHash.get(u.entry_hash) ?? [];
    list.push(u.id);
    byHash.set(u.entry_hash, list);
  }
  const apply: RepairHashUpdate[] = [];
  const clearIds: number[] = [];
  for (const [entry_hash, ids] of byHash) {
    ids.sort((a, b) => b - a);
    apply.push({ id: ids[0], entry_hash });
    clearIds.push(...ids.slice(1));
  }
  return { apply, clearIds };
}

/** Pure planning from already-loaded rows (mutates entry_hash in place for soft-dedup). */
export function computeRepairWork(
  existing: ExistingEntryForDedup[]
): RepairWorkPlanCore {
  const rawUpdates: RepairHashUpdate[] = [];
  for (const row of existing) {
    const next = entryHash(toHashFields(row));
    if (row.entry_hash !== next) {
      rawUpdates.push({ id: row.id, entry_hash: next });
      row.entry_hash = next;
    }
  }
  const { apply, clearIds } = collapseRehashUpdates(rawUpdates);
  const plans = planSoftDuplicateCleanup(existing);
  const deleteIds = [...new Set(plans.flatMap((p) => p.deleteIds))];
  return {
    updates: apply,
    clearHashIds: clearIds,
    deleteIds,
    kept: plans.length,
    totalSteps: clearIds.length + apply.length + deleteIds.length,
  };
}
