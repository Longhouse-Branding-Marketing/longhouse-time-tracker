import type { Filters } from "@/lib/filtering";

/** Optional filter overrides the model can pass into tools. */
export type SliceFilters = {
  from?: string;
  to?: string;
  people?: string[];
  departments?: string[];
  roles?: string[];
  tasks?: string[];
  types?: string[];
};

/**
 * Merge dashboard base filters with tool overrides.
 * When useDashboardFilters is false, only tool args apply (with empty defaults).
 * Tool arrays replace (not union) when provided; dates replace when provided.
 */
export function mergeSliceFilters(
  base: Filters | null,
  useDashboardFilters: boolean,
  override: SliceFilters = {}
): Filters {
  const empty: Filters = {
    from: "",
    to: "",
    people: [],
    departments: [],
    roles: [],
    tasks: [],
    types: [],
  };
  const start = useDashboardFilters && base ? { ...base } : empty;

  return {
    from: override.from ?? start.from,
    to: override.to ?? start.to,
    people: override.people ?? start.people,
    departments: override.departments ?? start.departments,
    roles: override.roles ?? start.roles,
    tasks: override.tasks ?? start.tasks,
    types: override.types ?? start.types,
  };
}

export const SLICE_FILTER_SCHEMA = {
  type: "object",
  properties: {
    from: {
      type: "string",
      description: "Start date YYYY-MM-DD (inclusive)",
    },
    to: {
      type: "string",
      description: "End date YYYY-MM-DD (inclusive)",
    },
    people: {
      type: "array",
      items: { type: "string" },
      description: "Person names to include",
    },
    departments: {
      type: "array",
      items: { type: "string" },
      description: "Departments to include",
    },
    roles: {
      type: "array",
      items: { type: "string" },
      description: "Roles to include",
    },
    tasks: {
      type: "array",
      items: { type: "string" },
      description: "Tasks to include",
    },
    types: {
      type: "array",
      items: { type: "string" },
      description: "Entry types to include",
    },
  },
} as const;
