import { createHash } from "crypto";

/** Normalize text for hash comparison: trim, lower-case, blank → "". */
export function normText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim().toLowerCase();
}

/** Collapse whitespace so Memtime comment formatting does not split hashes. */
export function normComment(value: unknown): string {
  if (value == null) return "";
  return String(value).trim().toLowerCase().replace(/\s+/g, " ");
}

/** Round decimal hours for display/storage stability (4 dp matches Memtime minutes/60). */
export function normHours(value: number): string {
  return (Math.round(value * 10000) / 10000).toFixed(4);
}

export type HashFields = {
  person: string;
  date: string; // YYYY-MM-DD
  department: string | null;
  role: string | null;
  task: string | null;
  type: string | null;
  billable: string | null;
  /** Raw Logged Time from Memtime (minutes). */
  loggedMinutes: number;
  comments: string | null;
  /** Raw "Time" column (time range / stamp) — distinguishes same-duration rows. */
  timeRange: string | null;
};

/**
 * Deterministic MD5 hex — must match
 * supabase/migrations/003_time_entries_entry_hash_v3.sql
 */
export function entryHash(fields: HashFields): string {
  const canonical = [
    normText(fields.person),
    fields.date,
    normText(fields.department),
    normText(fields.role),
    normText(fields.task),
    normText(fields.type),
    normText(fields.billable),
    String(Math.round(fields.loggedMinutes)),
    normComment(fields.comments),
    normText(fields.timeRange),
  ].join("|");
  return createHash("md5").update(canonical, "utf8").digest("hex");
}

/**
 * Soft fingerprint without Time — used to match legacy rows that were imported
 * without source_time_range against a full Memtime re-export of the same block.
 */
export function softFingerprint(fields: Omit<HashFields, "timeRange">): string {
  return [
    normText(fields.person),
    fields.date,
    normText(fields.department),
    normText(fields.role),
    normText(fields.task),
    normText(fields.type),
    normText(fields.billable),
    String(Math.round(fields.loggedMinutes)),
    normComment(fields.comments),
  ].join("|");
}

/** Preview-only slug — not stored (no employee_key column in Supabase). */
export function employeeKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
