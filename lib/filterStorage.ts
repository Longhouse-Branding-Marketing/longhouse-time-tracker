import type { DateBounds, FilterOptions, Filters } from "./filtering";
import { defaultFilters } from "./filtering";

const STORAGE_KEY = "lh-dashboard-filters-v1";

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function parseStoredFilters(raw: string): Filters | null {
  try {
    const parsed = JSON.parse(raw) as Partial<Filters>;
    if (typeof parsed.from !== "string" || typeof parsed.to !== "string") {
      return null;
    }
    if (
      !isStringArray(parsed.people) ||
      !isStringArray(parsed.departments) ||
      !isStringArray(parsed.roles) ||
      !isStringArray(parsed.tasks) ||
      !isStringArray(parsed.types)
    ) {
      return null;
    }
    return {
      from: parsed.from,
      to: parsed.to,
      people: parsed.people,
      departments: parsed.departments,
      roles: parsed.roles,
      tasks: parsed.tasks,
      types: parsed.types,
    };
  } catch {
    return null;
  }
}

export function loadStoredFilters(): Filters | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return parseStoredFilters(raw);
  } catch {
    return null;
  }
}

export function saveStoredFilters(filters: Filters): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    /* quota / private mode */
  }
}

/** Clamp dates and drop dimension values that no longer exist in the dataset. */
export function reconcileStoredFilters(
  stored: Filters,
  bounds: DateBounds,
  options: FilterOptions
): Filters {
  if (!bounds.min || !bounds.max) return stored;

  const pick = (selected: string[], available: string[]) => {
    const set = new Set(available);
    return selected.filter((v) => set.has(v));
  };

  let from = stored.from;
  let to = stored.to;
  if (from < bounds.min) from = bounds.min;
  if (to > bounds.max) to = bounds.max;
  if (from > to) {
    from = bounds.min;
    to = bounds.max;
  }

  return {
    from,
    to,
    people: pick(stored.people, options.people),
    departments: pick(stored.departments, options.departments),
    roles: pick(stored.roles, options.roles),
    tasks: pick(stored.tasks, options.tasks),
    types: pick(stored.types, options.types),
  };
}

export function initialDashboardFilters(
  bounds: DateBounds,
  options: FilterOptions
): Filters {
  const stored = loadStoredFilters();
  if (stored) return reconcileStoredFilters(stored, bounds, options);
  return defaultFilters(bounds);
}
