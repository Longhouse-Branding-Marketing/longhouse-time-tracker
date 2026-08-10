import type { EntryRow } from "./types";

export interface Filters {
  from: string;
  to: string;
  people: string[];
  departments: string[];
  roles: string[];
  tasks: string[];
  types: string[];
}

export interface FilterOptions {
  people: string[];
  departments: string[];
  roles: string[];
  tasks: string[];
  types: string[];
}

export interface DateBounds {
  min: string;
  max: string;
}

function uniqueSorted(values: (string | null)[]): string[] {
  return Array.from(
    new Set(values.filter((v): v is string => Boolean(v && v.trim())))
  ).sort((a, b) => a.localeCompare(b));
}

/** Earliest / latest entry date, used to seed the date range control. */
export function dateBounds(rows: EntryRow[]): DateBounds {
  if (rows.length === 0) return { min: "", max: "" };
  let min = rows[0].date;
  let max = rows[0].date;
  for (const r of rows) {
    if (r.date < min) min = r.date;
    if (r.date > max) max = r.date;
  }
  return { min, max };
}

export function extractOptions(rows: EntryRow[]): FilterOptions {
  return {
    people: uniqueSorted(rows.map((r) => r.person)),
    departments: uniqueSorted(rows.map((r) => r.department)),
    roles: uniqueSorted(rows.map((r) => r.role)),
    tasks: uniqueSorted(rows.map((r) => r.task)),
    types: uniqueSorted(rows.map((r) => r.type)),
  };
}

export function defaultFilters(bounds: DateBounds): Filters {
  return {
    from: bounds.min,
    to: bounds.max,
    people: [],
    departments: [],
    roles: [],
    tasks: [],
    types: [],
  };
}

export function applyFilters(rows: EntryRow[], f: Filters): EntryRow[] {
  const people = new Set(f.people);
  const depts = new Set(f.departments);
  const roles = new Set(f.roles);
  const tasks = new Set(f.tasks);
  const types = new Set(f.types);

  return rows.filter((r) => {
    if (f.from && r.date < f.from) return false;
    if (f.to && r.date > f.to) return false;
    if (people.size && !people.has(r.person)) return false;
    if (depts.size && !(r.department && depts.has(r.department))) return false;
    if (roles.size && !(r.role && roles.has(r.role))) return false;
    if (tasks.size && !(r.task && tasks.has(r.task))) return false;
    if (types.size && !(r.type && types.has(r.type))) return false;
    return true;
  });
}

export function isDefault(f: Filters, bounds: DateBounds): boolean {
  return (
    f.from === bounds.min &&
    f.to === bounds.max &&
    f.people.length === 0 &&
    f.departments.length === 0 &&
    f.roles.length === 0 &&
    f.tasks.length === 0 &&
    f.types.length === 0
  );
}
