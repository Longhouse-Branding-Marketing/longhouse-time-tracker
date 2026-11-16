import type { ReviewCatalog } from "@/lib/categoryMap";

export const fieldClass =
  "lh-select-trigger h-8 w-full rounded-md border border-line bg-card px-2 text-[13px] text-ink outline-none";

export const primaryButtonClass =
  "h-8 rounded-md bg-brand px-3 text-[13px] font-medium text-white hover:bg-navy disabled:opacity-50";

export const quietButtonClass =
  "h-8 rounded-md border border-line px-2.5 text-[13px] font-medium text-muted hover:bg-tint disabled:opacity-50";

export function withCurrent(options: string[], current: string): string[] {
  const value = current.trim();
  if (!value || options.includes(value)) return options;
  return [value, ...options];
}

/** Keep a value only when it already belongs to the new catalog list. */
export function catalogValue(options: string[], current: string | null | undefined): string {
  const value = (current ?? "").trim();
  return value && options.includes(value) ? value : "";
}

/** Department roles first, then every other catalog role so options like Executive stay available. */
export function rolesForDepartment(catalog: ReviewCatalog, department: string): string[] {
  const all = Array.from(new Set(catalog.roles.map((row) => row.role))).sort((a, b) =>
    a.localeCompare(b)
  );
  const departmentName = department.trim();
  if (!departmentName) return all;

  const matched = Array.from(
    new Set(
      catalog.roles
        .filter((row) => row.department === departmentName)
        .map((row) => row.role)
    )
  ).sort((a, b) => a.localeCompare(b));
  if (matched.length === 0) return all;

  const primary = new Set(matched);
  return [...matched, ...all.filter((role) => !primary.has(role))];
}

export function ReadValue({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="lh-meta-label">{label}</dt>
      <dd className="mt-1 text-[13px] text-ink">{value?.trim() || "—"}</dd>
    </div>
  );
}
