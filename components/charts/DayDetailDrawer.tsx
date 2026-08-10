"use client";

import { CaretDownIcon } from "@phosphor-icons/react";
import type { EntryRow } from "@/lib/types";
import { DayDetail } from "./DayDetail";

/** Hanging drawer tab + expanding sheet, attached under the hours panel. */
export function DayDetailDrawer({
  open,
  onToggle,
  selectedDay,
  scopeFrom,
  scopeTo,
  dayEntries = [],
  dayOptions = [],
  onDayChange,
  photoOf,
}: {
  open: boolean;
  onToggle: () => void;
  selectedDay?: string | null;
  scopeFrom: string;
  scopeTo: string;
  dayEntries?: EntryRow[];
  dayOptions?: string[];
  onDayChange?: (day: string) => void;
  photoOf?: Map<string, string | null>;
}) {
  const canOpen = dayOptions.length > 0 || Boolean(selectedDay);
  const tabLabel = open ? "Close Details" : "Open Details";
  const detailKey = selectedDay ?? `${scopeFrom}-${scopeTo}`;

  return (
    <div className="relative z-0 mx-5 -mt-1 sm:mx-7">
      <div className="overflow-hidden rounded-b-xl border border-t-0 border-line bg-card shadow-[0_10px_24px_rgba(2,22,61,0.10)]">
        <button
          type="button"
          onClick={onToggle}
          disabled={!canOpen}
          aria-expanded={open}
          aria-controls="hours-over-time-day-detail"
          className={`flex w-full items-center justify-center px-4 py-2.5 text-[13px] font-semibold tracking-normal transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-40 ${
            open
              ? "border-b border-line bg-card text-ink"
              : "bg-surface text-heading hover:bg-tint hover:text-ink"
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            {tabLabel}
            <CaretDownIcon
              size={14}
              weight="bold"
              aria-hidden
              className={`text-brand-600 transition-transform duration-200 ease-out ${
                open ? "rotate-180" : ""
              }`}
            />
          </span>
        </button>

        <div
          id="hours-over-time-day-detail"
          className={`grid transition-[grid-template-rows] duration-300 ease-out ${
            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            {open ? (
              <div
                className={`bg-card px-4 pb-4 pt-3 transition-opacity duration-200 ${
                  open ? "opacity-100" : "opacity-0"
                }`}
              >
                <DayDetail
                  key={detailKey}
                  focusDay={selectedDay ?? null}
                  scopeFrom={scopeFrom}
                  scopeTo={scopeTo}
                  entries={dayEntries}
                  dayOptions={dayOptions}
                  onDayChange={onDayChange}
                  photoOf={photoOf ?? new Map()}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
