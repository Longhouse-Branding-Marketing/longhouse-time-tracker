type PgErrorLike = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string | number;
} | null;

/** True for Postgres unique violations (and close variants from PostgREST). */
export function isUniqueViolation(error: PgErrorLike): boolean {
  if (!error) return false;
  if (String(error.code ?? "") === "23505") return true;
  const text = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    text.includes("duplicate key") ||
    text.includes("unique constraint") ||
    text.includes("time_entries_entry_hash_key") ||
    text.includes("entry_hash_key")
  );
}

/** id sequence still at 1 after bulk copy with explicit ids — not an entry_hash dup. */
export function isIdentitySequenceConflict(error: PgErrorLike): boolean {
  if (!error) return false;
  const text = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return text.includes("duplicate key") && text.includes("_pkey");
}

/** Unique violation on entry_hash only (safe to skip duplicate rows). */
export function isEntryHashConflict(error: PgErrorLike): boolean {
  return isUniqueViolation(error) && !isIdentitySequenceConflict(error);
}
