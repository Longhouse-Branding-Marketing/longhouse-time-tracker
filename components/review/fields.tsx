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

export function rolesForDepartment(catalog: ReviewCatalog, department: string): string[] {
  const matched = catalog.roles
    .filter((row) => row.department === department)
    .map((row) => row.role);
  if (matched.length > 0) return matched;
  return Array.from(new Set(catalog.roles.map((row) => row.role)));
}

export function ReadValue({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="lh-meta-label">{label}</dt>
      <dd className="mt-1 text-[13px] text-ink">{value?.trim() || "—"}</dd>
    </div>
  );
}
