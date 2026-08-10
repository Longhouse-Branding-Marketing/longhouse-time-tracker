"use client";

import { useId, useMemo, useState } from "react";
import { CaretDownIcon, CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { Avatar } from "@/components/ui";
import { formatDate, hours as fmtHours, n, pct } from "@/lib/formatters";
import type { EntryRow } from "@/lib/types";

type Drill =
  | { level: "department" }
  | { level: "role"; department: string }
  | { level: "task"; department: string; role: string };

type Bucket = {
  name: string;
  hours: number;
  entries: number;
  people: number;
};

function bucketKey(row: EntryRow, field: "department" | "role" | "task") {
  const raw = row[field]?.trim();
  return raw || "Unspecified";
}

function aggregate(
  rows: EntryRow[],
  field: "department" | "role" | "task"
): Bucket[] {
  const map = new Map<
    string,
    { hours: number; entries: number; people: Set<string> }
  >();
  for (const row of rows) {
    const name = bucketKey(row, field);
    const agg =
      map.get(name) ??
      { hours: 0, entries: 0, people: new Set<string>() };
    agg.hours += n(row.hours);
    agg.entries += 1;
    agg.people.add(row.person);
    map.set(name, agg);
  }
  return Array.from(map.entries())
    .map(([name, a]) => ({
      name,
      hours: a.hours,
      entries: a.entries,
      people: a.people.size,
    }))
    .sort((a, b) => b.hours - a.hours);
}

function personHours(rows: EntryRow[]) {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.person, (map.get(row.person) ?? 0) + n(row.hours));
  }
  return Array.from(map.entries())
    .map(([person, hours]) => ({ person, hours }))
    .sort((a, b) => b.hours - a.hours);
}

export function DayDetail({
  focusDay,
  scopeFrom,
  scopeTo,
  entries,
  dayOptions = [],
  onDayChange,
  photoOf,
}: {
  focusDay: string | null;
  scopeFrom: string;
  scopeTo: string;
  entries: EntryRow[];
  dayOptions?: string[];
  onDayChange?: (day: string) => void;
  photoOf: Map<string, string | null>;
}) {
  const [drill, setDrill] = useState<Drill>({ level: "department" });
  const [focusedPerson, setFocusedPerson] = useState<string | null>(null);
  const [hierarchyExpanded, setHierarchyExpanded] = useState(true);
  const hierarchyPanelId = useId();

  const scopedEntries = useMemo(() => {
    if (focusDay) return entries.filter((row) => row.date === focusDay);
    return entries.filter(
      (row) => row.date >= scopeFrom && row.date <= scopeTo
    );
  }, [entries, focusDay, scopeFrom, scopeTo]);

  const title = focusDay
    ? formatDate(focusDay)
    : scopeFrom === scopeTo
      ? formatDate(scopeFrom)
      : `${formatDate(scopeFrom)} – ${formatDate(scopeTo)}`;

  const dayIndex = focusDay ? dayOptions.indexOf(focusDay) : -1;
  const canPrevDay = dayIndex > 0;
  const canNextDay = dayIndex >= 0 && dayIndex < dayOptions.length - 1;
  const showDayNav = Boolean(focusDay) && dayOptions.length > 1 && onDayChange;

  const scoped = useMemo(() => {
    if (!focusedPerson) return scopedEntries;
    return scopedEntries.filter((row) => row.person === focusedPerson);
  }, [scopedEntries, focusedPerson]);

  const people = useMemo(() => personHours(scopedEntries), [scopedEntries]);

  const listRows = useMemo(() => {
    if (drill.level === "department") {
      return { field: "department" as const, items: aggregate(scoped, "department") };
    }
    const inDept = scoped.filter(
      (row) => bucketKey(row, "department") === drill.department
    );
    if (drill.level === "role") {
      return { field: "role" as const, items: aggregate(inDept, "role") };
    }
    const inRole = inDept.filter(
      (row) => bucketKey(row, "role") === drill.role
    );
    return { field: "task" as const, items: aggregate(inRole, "task") };
  }, [scoped, drill]);

  const listTotal = listRows.items.reduce((sum, item) => sum + item.hours, 0);

  function openBucket(name: string) {
    if (drill.level === "department") {
      setDrill({ level: "role", department: name });
      return;
    }
    if (drill.level === "role") {
      setDrill({
        level: "task",
        department: drill.department,
        role: name,
      });
    }
  }

  const canDrill = drill.level !== "task";
  const sectionLabel =
    drill.level === "department"
      ? "Departments"
      : drill.level === "role"
        ? "Roles"
        : "Tasks";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {showDayNav ? (
          <button
            type="button"
            disabled={!canPrevDay}
            onClick={() => onDayChange!(dayOptions[dayIndex - 1])}
            aria-label="Previous day"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-line text-muted transition-colors hover:border-brand-600/40 hover:bg-tint hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <CaretLeftIcon size={14} weight="bold" aria-hidden />
          </button>
        ) : null}
        <p className="lh-section-title">{title}</p>
        {showDayNav ? (
          <button
            type="button"
            disabled={!canNextDay}
            onClick={() => onDayChange!(dayOptions[dayIndex + 1])}
            aria-label="Next day"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-line text-muted transition-colors hover:border-brand-600/40 hover:bg-tint hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <CaretRightIcon size={14} weight="bold" aria-hidden />
          </button>
        ) : null}
        {focusedPerson ? (
          <button
            type="button"
            onClick={() => setFocusedPerson(null)}
            className="text-[12px] font-medium text-brand-600 hover:underline"
          >
            Clear {focusedPerson.split(" ")[0]}
          </button>
        ) : null}
      </div>

      {/* People who tracked — compact equal grid */}
      <div className="mt-3.5">
        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {people.map((p) => {
            const active = focusedPerson === p.person;
            const firstName = p.person.split(" ")[0];
            return (
              <li key={p.person} className="min-w-0">
                <button
                  type="button"
                  onClick={() =>
                    setFocusedPerson((current) =>
                      current === p.person ? null : p.person
                    )
                  }
                  title={`${p.person} · ${fmtHours(p.hours)}`}
                  aria-pressed={active}
                  className={`flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                    active
                      ? "border-brand bg-blue-1/70 text-ink"
                      : "border-line bg-page text-ink hover:border-brand-600/40 hover:bg-tint"
                  }`}
                >
                  <Avatar
                    name={p.person}
                    photoUrl={photoOf.get(p.person)}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold leading-tight text-ink">
                      {firstName}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-none tabular-nums text-muted">
                      {fmtHours(p.hours)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Hierarchy drill-down */}
      <div className="mt-5">
        <div className="mb-2 flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <button
            type="button"
            onClick={() => setHierarchyExpanded((v) => !v)}
            aria-expanded={hierarchyExpanded}
            aria-controls={hierarchyPanelId}
            className="inline-flex items-center gap-1 rounded-md text-left transition-colors hover:text-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            <CaretDownIcon
              size={14}
              weight="bold"
              aria-hidden
              className={`shrink-0 text-muted transition-transform duration-150 ${
                hierarchyExpanded ? "rotate-180" : ""
              }`}
            />
            <span className="lh-meta-label text-navy">{sectionLabel}</span>
          </button>
          {drill.level !== "department" ? (
            <nav
              aria-label="Day breakdown"
              className="lh-breadcrumb flex flex-wrap items-center gap-x-1 text-[12px]"
            >
              <button
                type="button"
                className="text-brand-600 hover:underline"
                onClick={() => setDrill({ level: "department" })}
              >
                Departments
              </button>
              <span className="text-muted">›</span>
              {drill.level === "role" ? (
                <span className="font-semibold text-ink">{drill.department}</span>
              ) : (
                <>
                  <button
                    type="button"
                    className="text-brand-600 hover:underline"
                    onClick={() =>
                      setDrill({
                        level: "role",
                        department: drill.department,
                      })
                    }
                  >
                    {drill.department}
                  </button>
                  <span className="text-muted">›</span>
                  <span className="font-semibold text-ink">{drill.role}</span>
                </>
              )}
            </nav>
          ) : null}
        </div>

        {hierarchyExpanded ? (
          <div id={hierarchyPanelId}>
            {listRows.items.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-[12px] text-muted">
                No time tracked in this slice.
              </p>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                {listRows.items.map((item) => {
                  const share = listTotal > 0 ? (100 * item.hours) / listTotal : 0;
                  return (
                    <li key={item.name}>
                      <button
                        type="button"
                        disabled={!canDrill}
                        onClick={() => canDrill && openBucket(item.name)}
                        className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                          canDrill
                            ? "hover:bg-tint/80"
                            : "cursor-default"
                        }`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-ink">
                            {item.name}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-muted">
                            {item.entries.toLocaleString()}{" "}
                            {item.entries === 1 ? "entry" : "entries"}
                            <span className="mx-1 text-line">·</span>
                            {item.people.toLocaleString()}{" "}
                            {item.people === 1 ? "person" : "people"}
                          </span>
                        </span>
                        <span className="hidden w-24 sm:block">
                          <span className="block h-1.5 overflow-hidden rounded-full bg-tint">
                            <span
                              className="block h-full rounded-full bg-brand-600/80"
                              style={{ width: `${Math.max(share, 2)}%` }}
                            />
                          </span>
                        </span>
                        <span className="w-[4.5rem] text-right text-[13px] font-medium tabular-nums text-ink">
                          {fmtHours(item.hours)}
                        </span>
                        <span className="w-10 text-right text-[11px] tabular-nums text-muted">
                          {pct(share)}
                        </span>
                        {canDrill ? (
                          <CaretRightIcon
                            size={14}
                            className="shrink-0 text-muted"
                            aria-hidden
                          />
                        ) : (
                          <span className="w-3.5 shrink-0" aria-hidden />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
