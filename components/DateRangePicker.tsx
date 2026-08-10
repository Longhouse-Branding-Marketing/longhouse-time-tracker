"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarBlankIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
} from "@phosphor-icons/react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DOW = ["S", "M", "T", "W", "T", "F", "S"];

interface Range {
  from: string;
  to: string;
}

const pad = (v: number) => String(v).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const today = () => {
  const date = new Date();
  return iso(date.getFullYear(), date.getMonth(), date.getDate());
};
function parse(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m: m - 1, d };
}
function viewOf(s: string) {
  const { y, m } = parse(s);
  return { y, m };
}
function addDays(s: string, delta: number) {
  const { y, m, d } = parse(s);
  const date = new Date(y, m, d + delta);
  return iso(date.getFullYear(), date.getMonth(), date.getDate());
}
function clamp(s: string, min: string, max: string) {
  if (s < min) return min;
  if (s > max) return max;
  return s;
}
function boundedRange(from: string, to: string, min: string, max: string): Range {
  const boundedFrom = clamp(from, min, max);
  const boundedTo = clamp(to, min, max);
  return boundedFrom <= boundedTo
    ? { from: boundedFrom, to: boundedTo }
    : { from: boundedTo, to: boundedFrom };
}
function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}
function firstDow(y: number, m: number) {
  return new Date(y, m, 1).getDay();
}
function shortFormat(s: string) {
  const { y, m, d } = parse(s);
  return `${d} ${MONTHS[m].slice(0, 3)} ${y}`;
}
function monthStart(s: string) {
  const { y, m } = parse(s);
  return iso(y, m, 1);
}
function monthEnd(s: string) {
  const { y, m } = parse(s);
  return iso(y, m, daysInMonth(y, m));
}
function shiftMonth(s: string, amount: number) {
  const { y, m } = parse(s);
  return iso(y, m + amount, 1);
}
/** Week starts on Sunday — matches the calendar grid headers. */
function weekStart(s: string) {
  const { y, m, d } = parse(s);
  const date = new Date(y, m, d);
  return addDays(s, -date.getDay());
}

export function DateRangePicker({
  value,
  min,
  max,
  onChange,
}: {
  value: Range;
  min: string;
  max: string;
  onChange: (range: Range) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Range>(value);
  const [view, setView] = useState(() => viewOf(value.to || max));
  const [selectingEnd, setSelectingEnd] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const syncFromValue = () => {
    setDraft(value);
    setView(viewOf(value.to || max));
    setSelectingEnd(false);
  };

  const commit = (range: Range, close = true) => {
    setDraft(range);
    setView(viewOf(range.to));
    setSelectingEnd(false);
    onChange(range);
    if (close) setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onDocumentMouseDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        syncFromValue();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value]);

  const presets = useMemo(() => {
    // Use wall-clock today for week identity so "Last Week" is not shifted
    // when the dataset's max date still falls in the prior calendar week.
    const now = today();
    const current = clamp(now, min, max);
    const currentWeek = weekStart(now);
    const previousWeekEnd = addDays(currentWeek, -1);
    const previousMonth = shiftMonth(current, -1);
    const currentYearStart = `${parse(current).y}-01-01`;
    return [
      { label: "This Week", range: boundedRange(currentWeek, current, min, max) },
      {
        label: "Last Week",
        range: boundedRange(addDays(currentWeek, -7), previousWeekEnd, min, max),
      },
      { label: "This Month", range: boundedRange(monthStart(current), current, min, max) },
      { label: "Last Month", range: boundedRange(monthStart(previousMonth), monthEnd(previousMonth), min, max) },
      { label: "Last 7 Days", range: boundedRange(addDays(current, -6), current, min, max) },
      { label: "Last 30 Days", range: boundedRange(addDays(current, -29), current, min, max) },
      { label: "Year to Date", range: boundedRange(currentYearStart, current, min, max) },
      { label: "All Time", range: { from: min, to: max } },
    ];
  }, [min, max]);

  const activePreset = presets.find(
    (preset) => preset.range.from === draft.from && preset.range.to === draft.to
  );

  function selectPreset(range: Range) {
    commit(range);
  }

  function selectDate(date: string) {
    if (!selectingEnd) {
      setDraft({ from: date, to: date });
      setSelectingEnd(true);
      return;
    }

    commit(date < draft.from ? { from: date, to: draft.from } : { from: draft.from, to: date });
  }

  function moveMonth(amount: number) {
    const date = new Date(view.y, view.m + amount, 1);
    setView({ y: date.getFullYear(), m: date.getMonth() });
  }

  const { y, m } = view;
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDow(y, m) }, () => null),
    ...Array.from({ length: daysInMonth(y, m) }, (_, index) => index + 1),
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          if (open) {
            syncFromValue();
            setOpen(false);
          } else {
            syncFromValue();
            setOpen(true);
          }
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-open={open}
        className="lh-dropdown-trigger flex h-8 items-center gap-2 rounded-md border px-2.5 text-[13px]"
      >
        <CalendarBlankIcon
          size={16}
          weight="regular"
          aria-hidden
          className="shrink-0 text-brand"
        />
        <span className="font-medium text-ink">
          {shortFormat(value.from)} – {shortFormat(value.to)}
        </span>
        <CaretDownIcon
          size={14}
          weight="bold"
          aria-hidden
          className={`shrink-0 text-muted transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Select date range"
          className="lh-dropdown-panel absolute left-0 top-10 z-40 w-[480px] max-w-[92vw] overflow-hidden"
        >
          <div className="border-b border-line px-4 py-3">
            <p className="text-[12px] text-muted">
              {selectingEnd ? "Select an end date" : "Select a start date"}
            </p>
            <p className="mt-0.5 text-[13px] font-semibold text-ink">
              {shortFormat(draft.from)} – {shortFormat(draft.to)}
            </p>
          </div>

          <div className="flex">
            <div className="w-[132px] shrink-0 border-r border-line p-2">
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => selectPreset(preset.range)}
                  className={`block w-full rounded-md px-2 py-1.5 text-left text-[13px] ${
                    activePreset?.label === preset.label
                      ? "bg-tint font-semibold text-ink"
                      : "text-muted hover:bg-tint hover:text-ink"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="min-w-0 flex-1 p-3">
              <div className="mb-3 flex items-center justify-between">
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() => moveMonth(-1)}
                  className="rounded-md p-1.5 text-muted hover:bg-tint hover:text-ink"
                >
                  <CaretLeftIcon size={16} weight="bold" aria-hidden />
                </button>
                <span className="text-[14px] font-semibold text-ink">
                  {MONTHS[m]} {y}
                </span>
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() => moveMonth(1)}
                  className="rounded-md p-1.5 text-muted hover:bg-tint hover:text-ink"
                >
                  <CaretRightIcon size={16} weight="bold" aria-hidden />
                </button>
              </div>

              <div className="grid grid-cols-7">
                {DOW.map((day, index) => (
                  <div key={index} className="pb-1 text-center text-[11px] font-semibold text-muted">
                    {day}
                  </div>
                ))}
                {cells.map((day, index) => {
                  if (day === null) return <div key={index} className="aspect-square" />;
                  const date = iso(y, m, day);
                  const disabled = date < min || date > max;
                  const inRange = date >= draft.from && date <= draft.to;
                  const endpoint = date === draft.from || date === draft.to;
                  const single = draft.from === draft.to;

                  return (
                    <div
                      key={index}
                      className="relative flex aspect-square items-center justify-center"
                    >
                      {inRange && !single ? (
                        <div
                          className={`absolute inset-y-0 bg-info-soft ${
                            date === draft.from
                              ? "left-1/2 right-0"
                              : date === draft.to
                                ? "left-0 right-1/2"
                                : "inset-x-0"
                          }`}
                        />
                      ) : null}
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => selectDate(date)}
                        className={`relative z-10 flex h-[84%] w-[84%] items-center justify-center rounded-full text-[13px] ${
                          disabled
                            ? "cursor-default text-muted/40"
                            : endpoint
                              ? "bg-brand font-semibold text-white"
                              : inRange
                                ? "text-ink hover:bg-black/5"
                                : "text-ink hover:bg-tint"
                        }`}
                      >
                        {day}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
