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

export function FilterBar({
  filters,
  options,
  bounds,
  onChange,
  onClear,
}: {
  filters: Filters;
  options: FilterOptions;
  bounds: DateBounds;
  onChange: (next: Partial<Filters>) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <DateRangePicker
        value={{ from: filters.from, to: filters.to }}
        min={bounds.min}
        max={bounds.max}
        onChange={(r) => onChange({ from: r.from, to: r.to })}
      />

      <MultiSelect
        label="Person"
        options={options.people}
        selected={filters.people}
        onChange={(v) => onChange({ people: v })}
      />
      <MultiSelect
        label="Department"
        options={options.departments}
        selected={filters.departments}
        onChange={(v) => onChange({ departments: v })}
      />
      <MultiSelect
        label="Role"
        options={options.roles}
        selected={filters.roles}
        onChange={(v) => onChange({ roles: v })}
      />
      <MultiSelect
        label="Task"
        options={options.tasks}
        selected={filters.tasks}
        onChange={(v) => onChange({ tasks: v })}
      />
      <MultiSelect
        label="Type"
        options={options.types}
        selected={filters.types}
        onChange={(v) => onChange({ types: v })}
      />

      {!isDefault(filters, bounds) ? (
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
