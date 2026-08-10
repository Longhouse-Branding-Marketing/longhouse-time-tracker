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
