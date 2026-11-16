"use client";

import { useEffect, useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { SlidersHorizontalIcon, XIcon } from "@phosphor-icons/react";
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

function activeFilterCount(filters: Filters, bounds: DateBounds, hidden: Set<FilterField>) {
  let count = 0;
  if (filters.from !== bounds.min || filters.to !== bounds.max) count += 1;
  if (!hidden.has("person") && filters.people.length) count += 1;
  if (!hidden.has("department") && filters.departments.length) count += 1;
  if (!hidden.has("role") && filters.roles.length) count += 1;
  if (!hidden.has("type") && filters.types.length) count += 1;
  return count;
}

export function FilterBar({
  filters,
  options,
  bounds,
  onChange,
  onClear,
  hide = [],
  extraActive = false,
  extras,
}: {
  filters: Filters;
  options: FilterOptions;
  bounds: DateBounds;
  onChange: (next: Partial<Filters>) => void;
  onClear: () => void;
  hide?: FilterField[];
  /** Extra controls, such as Billable, count as an active filter on the phone button. */
  extraActive?: boolean;
  extras?: (fullWidth: boolean) => ReactNode;
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
  const active = activeFilterCount(filters, bounds, hidden) + (extraActive ? 1 : 0);
  const [open, setOpen] = useState(false);

  function fields(fullWidth: boolean) {
    return (
      <>
        <DateRangePicker
          fullWidth={fullWidth}
          value={{ from: filters.from, to: filters.to }}
          min={bounds.min}
          max={bounds.max}
          onChange={(range) => onChange({ from: range.from, to: range.to })}
        />
        {hidden.has("person") ? null : (
          <MultiSelect
            fullWidth={fullWidth}
            label="Person"
            options={options.people}
            selected={filters.people}
            onChange={(value) => onChange({ people: value })}
          />
        )}
        {hidden.has("department") ? null : (
          <MultiSelect
            fullWidth={fullWidth}
            label="Department"
            options={options.departments}
            selected={filters.departments}
            onChange={(value) => onChange({ departments: value })}
          />
        )}
        {hidden.has("role") ? null : (
          <MultiSelect
            fullWidth={fullWidth}
            label="Role"
            options={options.roles}
            selected={filters.roles}
            onChange={(value) => onChange({ roles: value })}
          />
        )}
        {hidden.has("type") ? null : (
          <MultiSelect
            fullWidth={fullWidth}
            searchable
            label="Activity Type"
            options={options.types}
            selected={filters.types}
            onChange={(value) => onChange({ types: value })}
          />
        )}
        {extras?.(fullWidth)}
        {!isDefault(defaultCheck, bounds) || extraActive ? (
          <button
            type="button"
            onClick={onClear}
            className={`inline-flex items-center gap-1 rounded-md font-medium text-brand-600 touch-manipulation hover:bg-tint ${
              fullWidth
                ? "h-11 w-full justify-center px-3 text-base"
                : "h-10 px-2.5 text-[13px] md:h-8"
            }`}
          >
            <XIcon size={fullWidth ? 16 : 14} weight="bold" aria-hidden />
            Clear
          </button>
        ) : null}
      </>
    );
  }

  return (
    <>
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`lh-dropdown-trigger inline-flex h-10 items-center gap-2 rounded-md border px-3 text-base font-medium touch-manipulation ${
            active ? "border-brand-600 text-ink" : "text-ink"
          }`}
        >
          <SlidersHorizontalIcon size={16} weight="bold" aria-hidden />
          Filters
          {active > 0 ? (
            <span className="rounded-md bg-brand px-1.5 py-0.5 text-[12px] font-medium text-white">
              {active}
            </span>
          ) : null}
        </button>
        {open ? (
          <FilterSheet onClose={() => setOpen(false)}>{fields(true)}</FilterSheet>
        ) : null}
      </div>
      <div className="hidden flex-wrap items-center gap-2 md:flex">{fields(false)}</div>
    </>
  );
}

function FilterSheet({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  useEffect(() => {
    if (!mounted) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [mounted, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 touch-manipulation md:hidden">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-[#02163d]/35"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-x-0 bottom-0 flex max-h-[min(88dvh,720px)] flex-col overflow-hidden rounded-t-2xl bg-card px-4 pt-3 shadow-[0_-12px_40px_rgba(2,22,61,0.16)] pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-line" />
        <div className="mb-3 flex shrink-0 items-center justify-between">
          <h2 id={titleId} className="lh-section-title">
            Filters
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-md p-2 text-muted touch-manipulation hover:bg-tint hover:text-ink"
          >
            <XIcon size={18} weight="bold" aria-hidden />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-x-hidden overflow-y-auto overscroll-contain">
          {children}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 h-12 w-full shrink-0 rounded-md bg-brand text-base font-medium text-white touch-manipulation"
        >
          Done
        </button>
      </div>
    </div>,
    document.body
  );
}
