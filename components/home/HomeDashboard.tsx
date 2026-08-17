"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import { FilterBar } from "@/components/FilterBar";
import { Avatar, PageHeader, PageShell, Panel, StatCard } from "@/components/ui";
import { HoursOverTime, DayDetailDrawer } from "@/components/charts/HoursOverTime";
import { BillableDonut } from "@/components/charts/BillableDonut";
import { TypeBreakdown } from "@/components/charts/TypeBreakdown";
import { Sunburst } from "@/components/charts/Sunburst";
import {
  chooseGranularity,
  computeBillableSplit,
  computeHierarchy,
  computePersonSummaries,
  computeSummary,
  computeTimeSeries,
  computeWorkingDayAvg,
  workingDayAvgLabel,
} from "@/lib/aggregate";
import { CHART_TITLES } from "@/lib/chartTitles";
import {
  summarizeFilters,
  useDashboardFilters,
} from "@/lib/dashboard-filters";
import {
  applyFilters,
  dateBounds,
  defaultFilters,
  extractOptions,
  isDefault,
  type Filters,
} from "@/lib/filtering";
import {
  initialDashboardFilters,
  reconcileStoredFilters,
  saveStoredFilters,
} from "@/lib/filterStorage";
import { hours, n, pct } from "@/lib/formatters";
import {
  KPI_EXCLUDED_STATUS,
  type Employee,
  type EntryRow,
  type OperationsKpi,
  type PersonDailyTracking,
} from "@/lib/types";

type DrillScope = {
  from: string;
  to: string;
  granularity: "week" | "day";
};

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function clampDate(date: string, min: string, max: string) {
  if (date < min) return min;
  if (date > max) return max;
  return date;
}

function monthRange(key: string, min: string, max: string) {
  const [year, month] = key.split("-").map(Number);
  const from = `${key}-01`;
  const to = `${year}-${String(month).padStart(2, "0")}-${String(
    new Date(year, month, 0).getDate()
  ).padStart(2, "0")}`;
  return {
    from: clampDate(from, min, max),
    to: clampDate(to, min, max),
  };
}

export function HomeDashboard({
  entries,
  employees,
  kpis,
  dailyTracking,
}: {
  entries: EntryRow[];
  employees: Employee[];
  kpis: OperationsKpi[];
  dailyTracking: PersonDailyTracking[];
}) {
  const activeEntries = useMemo(() => {
    const active = new Set(
      employees.filter((e) => e.active).map((e) => e.person)
    );
    return entries.filter((row) => active.has(row.person));
  }, [entries, employees]);

  const bounds = useMemo(() => dateBounds(activeEntries), [activeEntries]);
  const options = useMemo(() => extractOptions(activeEntries), [activeEntries]);
  const [filters, setFilters] = useState<Filters>(() =>
    initialDashboardFilters(bounds, options)
  );
  const [filtersReady, setFiltersReady] = useState(false);
  const [drillStack, setDrillStack] = useState<DrillScope[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [dayDetailOpen, setDayDetailOpen] = useState(false);
  const { setSnapshot, clearSnapshot } = useDashboardFilters();

  useEffect(() => {
    if (!bounds.min) return;
    setFilters((current) => reconcileStoredFilters(current, bounds, options));
    setFiltersReady(true);
  }, [bounds.min, bounds.max, options]);

  useEffect(() => {
    if (!filtersReady) return;
    saveStoredFilters(filters);
  }, [filters, filtersReady]);

  useEffect(() => {
    setSnapshot({
      filters,
      isActive: !isDefault(filters, bounds),
      summary: summarizeFilters(filters),
    });
    return () => clearSnapshot();
  }, [filters, bounds, setSnapshot, clearSnapshot]);

  const rows = useMemo(
    () => applyFilters(activeEntries, filters),
    [activeEntries, filters]
  );

  const summary = useMemo(() => computeSummary(rows), [rows]);
  const kpiPeople = useMemo(
    () => kpis.filter((k) => k.status !== KPI_EXCLUDED_STATUS),
    [kpis]
  );
  const eligiblePeople = useMemo(
    () => kpiPeople.map((k) => k.person),
    [kpiPeople]
  );
  const workingDayAvg = useMemo(
    () => computeWorkingDayAvg(rows, dailyTracking, filters, eligiblePeople),
    [rows, dailyTracking, filters, eligiblePeople]
  );
  const avgLabel = useMemo(() => workingDayAvgLabel(filters), [filters]);
  const opsSummary = useMemo(() => {
    let onTrack = 0;
    for (const k of kpiPeople) {
      if (k.status === "On track") onTrack += 1;
    }
    return { onTrack };
  }, [kpiPeople]);
  const drillScope: DrillScope | undefined =
    drillStack.length > 0 ? drillStack[drillStack.length - 1] : undefined;
  const scopeFrom = drillScope?.from ?? filters.from;
  const scopeTo = drillScope?.to ?? filters.to;
  const defaultGranularity = useMemo(
    () => chooseGranularity(filters.from, filters.to),
    [filters.from, filters.to]
  );
  const granularity = drillScope?.granularity ?? defaultGranularity;
  const timeSeries = useMemo(
    () => computeTimeSeries(rows, granularity, scopeFrom, scopeTo),
    [rows, granularity, scopeFrom, scopeTo]
  );
  const scopeEntries = useMemo(
    () => rows.filter((row) => row.date >= scopeFrom && row.date <= scopeTo),
    [rows, scopeFrom, scopeTo]
  );
  const detailEntries = useMemo(
    () =>
      selectedDay
        ? scopeEntries.filter((row) => row.date === selectedDay)
        : scopeEntries,
    [scopeEntries, selectedDay]
  );
  const dayOptions = useMemo(() => {
    const dates = new Set<string>();
    for (const row of rows) {
      if (row.date >= scopeFrom && row.date <= scopeTo) dates.add(row.date);
    }
    return Array.from(dates).sort();
  }, [rows, scopeFrom, scopeTo]);
  const billable = useMemo(() => computeBillableSplit(rows), [rows]);
  const hierarchy = useMemo(() => computeHierarchy(rows), [rows]);
  const people = useMemo(() => computePersonSummaries(rows), [rows]);

  const photoOf = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const e of employees) map.set(e.person, e.photo_url);
    return map;
  }, [employees]);

  const openDayDetail = (day?: string | null) => {
    if (day) setSelectedDay(day);
    setSelectedHour(null);
    setDayDetailOpen(true);
  };

  const toggleDayDetail = () => {
    setDayDetailOpen((open) => !open);
  };

  const update = (next: Partial<Filters>) => {
    if (next.from !== undefined || next.to !== undefined) {
      setDrillStack([]);
      setSelectedDay(null);
      setSelectedHour(null);
      setDayDetailOpen(false);
    }
    setFilters((f) => ({ ...f, ...next }));
  };

  const isIsoDay = (key: string) => /^\d{4}-\d{2}-\d{2}$/.test(key);

  const drillInto = (key: string) => {
    if (granularity === "month") {
      if (isIsoDay(key)) {
        // Week bar inside a month cluster → that week’s day bars.
        setDrillStack((current) => [
          ...current,
          {
            from: clampDate(key, scopeFrom, scopeTo),
            to: clampDate(addDays(key, 6), scopeFrom, scopeTo),
            granularity: "week",
          },
        ]);
      } else {
        setDrillStack((current) => [
          ...current,
          { ...monthRange(key, scopeFrom, scopeTo), granularity: "week" },
        ]);
      }
      setSelectedDay(null);
      setSelectedHour(null);
      setDayDetailOpen(false);
      return;
    }

    if (granularity === "week") {
      if (isIsoDay(key)) {
        openDayDetail(key);
        return;
      }
      setDrillStack((current) => [
        ...current,
        {
          from: clampDate(key, scopeFrom, scopeTo),
          to: clampDate(addDays(key, 6), scopeFrom, scopeTo),
          granularity: "day",
        },
      ]);
      setSelectedDay(null);
      setSelectedHour(null);
      setDayDetailOpen(false);
      return;
    }

    if (granularity === "day") {
      openDayDetail(key);
    }
  };

  const zoomOut = () => {
    if (selectedHour != null) {
      setSelectedHour(null);
      return;
    }
    if (selectedDay) {
      setSelectedDay(null);
      setDayDetailOpen(false);
      return;
    }
    setDrillStack((current) => current.slice(0, -1));
  };

  const zoomOutLabel =
    selectedHour != null
      ? "Back to Hours"
      : selectedDay
        ? "Back to Days"
        : drillScope?.granularity === "week"
          ? "Back to Months"
          : drillScope?.granularity === "day"
            ? "Back to Weeks"
            : "Zoom Out";

  return (
    <PageShell>
      <PageHeader title="Where Is Our Time Going?" />

      {!bounds.min ? (
        <p className="mt-5 rounded-lg border border-line bg-surface px-4 py-3 text-[13px] text-muted">
          There are no time entries in this database yet. Charts will stay empty until
          you import data or run the legacy migration script. See{" "}
          <Link href="/import" className="font-medium text-brand-600 hover:underline">
            Import
          </Link>
          .
        </p>
      ) : null}

      <div className="mt-5">
        <FilterBar
          filters={filters}
          options={options}
          bounds={bounds}
          onChange={update}
          onClear={() => {
            const cleared = defaultFilters(bounds);
            setFilters(cleared);
            saveStoredFilters(cleared);
            setDrillStack([]);
            setSelectedDay(null);
            setSelectedHour(null);
            setDayDetailOpen(false);
          }}
        />
      </div>

      <div className="mt-7 grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
        <div className="grid h-full grid-cols-2 gap-4">
          <StatCard
            className="h-full"
            label="Tracked Hours"
            value={hours(summary.trackedHours)}
          />
          <StatCard className="h-full" label="People Tracked" value={summary.people} />
          <StatCard
            className="h-full"
            label={avgLabel}
            value={
              workingDayAvg > 0
                ? `${n(workingDayAvg).toLocaleString(undefined, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })} Hours`
                : "—"
            }
          />
          <StatCard className="h-full" label="People On Track" value={opsSummary.onTrack} />
        </div>

        <Panel title={CHART_TITLES.billable} className="h-full">
          <BillableDonut split={billable} />
        </Panel>
      </div>

      <div className="mt-7 space-y-5">
        <Panel
          title={CHART_TITLES.hoursOverTime}
          right={
            drillStack.length || selectedDay || selectedHour != null ? (
              <button
                type="button"
                onClick={zoomOut}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold text-brand-600 transition-colors hover:bg-tint"
              >
                <ArrowLeftIcon size={14} weight="bold" aria-hidden />
                {zoomOutLabel}
              </button>
            ) : null
          }
          footer={
            <DayDetailDrawer
              open={dayDetailOpen}
              onToggle={toggleDayDetail}
              selectedDay={selectedDay}
              scopeFrom={scopeFrom}
              scopeTo={scopeTo}
              dayEntries={detailEntries}
              dayOptions={dayOptions}
              onDayChange={(day) => {
                setSelectedDay(day);
                setSelectedHour(null);
              }}
              photoOf={photoOf}
            />
          }
        >
          <HoursOverTime
            data={timeSeries}
            granularity={granularity}
            onBarClick={drillInto}
            selectedDay={selectedDay}
            selectedHour={selectedHour}
            onHourClick={setSelectedHour}
            rows={scopeEntries}
            scopeFrom={scopeFrom}
            scopeTo={scopeTo}
            photoOf={photoOf}
          />
        </Panel>

        <Panel title={CHART_TITLES.hierarchy}>
          <Sunburst data={hierarchy} size={440} />
        </Panel>
      </div>

      <Panel title={CHART_TITLES.type} className="mt-7">
        <TypeBreakdown rows={rows} />
      </Panel>

      <Panel
        title={CHART_TITLES.teamMembers}
        className="mt-7"
        bodyClassName={
          people.length > 0
            ? "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            : undefined
        }
      >
        {people.length === 0 ? (
          <p className="text-[13px] text-muted">
            No people match the current filters.
          </p>
        ) : (
          people.map((p) => (
            <div
              key={p.person}
              className="flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3.5"
            >
              <Avatar name={p.person} photoUrl={photoOf.get(p.person)} size="md" />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold leading-snug text-ink">
                  {p.person}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted">
                  <span className="font-medium tabular-nums text-ink">
                    {hours(p.hours)}
                  </span>
                  <span>{pct(p.billablePct)} billable</span>
                </div>
              </div>
            </div>
          ))
        )}
      </Panel>
    </PageShell>
  );
}
