"use client";

import { XIcon } from "@phosphor-icons/react";
import { MultiSelect } from "./MultiSelect";
import { DateRangePicker } from "./DateRangePicker";
import {
  isDefault,
  type DateBounds,
  type FilterOptions,
  type Filters,
} from "@/lib/filtering";

export type FilterField =
  | "person"
  | "department"
  | "role"
  | "task"
  | "type";

export function FilterBar({
  filters,
  options,
  bounds,
  onChange,
  onClear,
  hide = [],
}: {
  filters: Filters;
  options: FilterOptions;
  bounds: DateBounds;
  onChange: (next: Partial<Filters>) => void;
  onClear: () => void;
  hide?: FilterField[];
}) {
  const hidden = new Set(hide);
  const defaultCheck: Filters = {
    ...filters,
    people: hidden.has("person") ? [] : filters.people,
    departments: hidden.has("department") ? [] : filters.departments,
    roles: hidden.has("role") ? [] : filters.roles,
    tasks: [],
    types: hidden.has("type") ? [] : filters.types,
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DateRangePicker
        value={{ from: filters.from, to: filters.to }}
        min={bounds.min}
        max={bounds.max}
        onChange={(r) => onChange({ from: r.from, to: r.to })}
      />

      {hidden.has("person") ? null : (
        <MultiSelect
          label="Person"
          options={options.people}
          selected={filters.people}
          onChange={(v) => onChange({ people: v })}
        />
      )}
      {hidden.has("department") ? null : (
        <MultiSelect
          label="Department"
          options={options.departments}
          selected={filters.departments}
          onChange={(v) => onChange({ departments: v })}
        />
      )}
      {hidden.has("role") ? null : (
        <MultiSelect
          label="Role"
          options={options.roles}
          selected={filters.roles}
          onChange={(v) => onChange({ roles: v })}
        />
      )}
      {hidden.has("type") ? null : (
        <MultiSelect
          label="Activity Type"
          options={options.types}
          selected={filters.types}
          onChange={(v) => onChange({ types: v })}
        />
      )}

      {!isDefault(defaultCheck, bounds) ? (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-[13px] font-medium text-brand-600 hover:bg-tint"
        >
          <XIcon size={14} weight="bold" aria-hidden />
          Clear
        </button>
      ) : null}
    </div>
  );
}
