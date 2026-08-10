import {
  entryHash,
  softFingerprint,
  type HashFields,
} from "./hash";

export type ExistingEntryForDedup = {
  id: number;
  entry_hash: string | null;
  person: string;
  date: string;
  department: string | null;
  role: string | null;
  task: string | null;
  type: string | null;
  billable: string | null;
  hours: number;
  comments: string | null;
  source_time_range: string | null;
  source_file: string | null;
  created_at: string | null;
};

export function toHashFields(row: {
  person: string;
  date: string;
  department: string | null;
  role: string | null;
  task: string | null;
  type: string | null;
  billable: string | null;
  hours: number;
  comments: string | null;
  source_time_range: string | null;
}): HashFields {
  return {
    person: row.person,
    date: typeof row.date === "string" ? row.date.slice(0, 10) : String(row.date),
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

/** Stored hash may be stale (pre-v3); always consider a recomputed hash too. */
export function existingEntryHashes(existing: ExistingEntryForDedup): string[] {
  const fields = toHashFields(existing);
  const recomputed = entryHash(fields);
  if (existing.entry_hash && existing.entry_hash !== recomputed) {
    return [existing.entry_hash, recomputed];
  }
  return [existing.entry_hash || recomputed];
}

function hasTime(value: string | null | undefined): boolean {
  return Boolean(value && String(value).trim());
}

/**
 * True when an incoming Memtime row is the same logical entry as an existing
 * DB row: exact hash, or soft match where at least one side lacks Time
 * (legacy import), or both Times match.
 */
export function isDuplicateOfExisting(
  incoming: HashFields,
  existing: ExistingEntryForDedup
): boolean {
  const incomingHash = entryHash(incoming);
  const existingFields = toHashFields(existing);
  const recomputedExisting = entryHash(existingFields);
  // Match either the stored hash (may be legacy) or a freshly computed v3 hash.
  if (
    incomingHash === existing.entry_hash ||
    incomingHash === recomputedExisting
  ) {
    return true;
  }

  if (softFingerprint(incoming) !== softFingerprint(existingFields)) {
    return false;
  }

  const inTime = hasTime(incoming.timeRange);
  const exTime = hasTime(existing.source_time_range);
  if (!inTime || !exTime) return true;
  return (
    String(incoming.timeRange).trim().toLowerCase() ===
    String(existing.source_time_range).trim().toLowerCase()
  );
}

export type SoftDupGroup = {
  keepId: number;
  deleteIds: number[];
};

/**
 * Prefer rows with a Time value, then newer created_at, then higher id.
 * Only delete siblings that are soft-duplicates under the null-Time rule
 * (never collapse two distinct timed blocks).
 */
export function planSoftDuplicateCleanup(
  rows: ExistingEntryForDedup[]
): SoftDupGroup[] {
  const bySoft = new Map<string, ExistingEntryForDedup[]>();
  for (const row of rows) {
    const key = softFingerprint(toHashFields(row));
    const list = bySoft.get(key) ?? [];
    list.push(row);
    bySoft.set(key, list);
  }

  const plans: SoftDupGroup[] = [];

  for (const group of bySoft.values()) {
    if (group.length < 2) continue;

    const timed = group.filter((r) => hasTime(r.source_time_range));
    const untimed = group.filter((r) => !hasTime(r.source_time_range));

    // Distinct timed blocks that only share soft key are legitimate — leave them.
    // Only remove untimed legacy rows when a timed counterpart exists.
    if (timed.length >= 1 && untimed.length >= 1) {
      const keep = [...timed].sort(preferNewer)[0];
      plans.push({
        keepId: keep.id,
        deleteIds: untimed.map((r) => r.id),
      });
      continue;
    }

    // All untimed (or identical times): keep one, delete the rest.
    if (untimed.length >= 2 && timed.length === 0) {
      const ranked = [...untimed].sort(preferNewer);
      plans.push({
        keepId: ranked[0].id,
        deleteIds: ranked.slice(1).map((r) => r.id),
      });
      continue;
    }

    // Same soft key + same non-empty time (true dup across imports)
    const byTime = new Map<string, ExistingEntryForDedup[]>();
    for (const r of timed) {
      const t = String(r.source_time_range).trim().toLowerCase();
      const list = byTime.get(t) ?? [];
      list.push(r);
      byTime.set(t, list);
    }
    for (const sameTime of byTime.values()) {
      if (sameTime.length < 2) continue;
      const ranked = [...sameTime].sort(preferNewer);
      plans.push({
        keepId: ranked[0].id,
        deleteIds: ranked.slice(1).map((r) => r.id),
      });
    }
  }

  return plans;
}

function preferNewer(a: ExistingEntryForDedup, b: ExistingEntryForDedup): number {
  const aFile = scoreSourceFile(a.source_file);
  const bFile = scoreSourceFile(b.source_file);
  if (bFile !== aFile) return bFile - aFile;
  const ac = a.created_at ?? "";
  const bc = b.created_at ?? "";
  if (bc !== ac) return bc.localeCompare(ac);
  return b.id - a.id;
}

function scoreSourceFile(_name: string | null): number {
  // Prefer created_at / id in preferNewer — no filename heuristics.
  return 0;
}
