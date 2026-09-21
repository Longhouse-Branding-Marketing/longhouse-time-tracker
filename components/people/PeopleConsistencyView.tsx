"use client";

import { useEffect, useMemo, useState } from "react";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { FilterBar } from "@/components/FilterBar";
import { PersonDetailPanel } from "@/components/people/PersonDetailPanel";
import {
  Avatar,
  Badge,
  EmptyRow,
  PageHeader,
  PageShell,
  Panel,
} from "@/components/ui";
import { computePersonOperations } from "@/lib/aggregate";
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
  withoutDepartments,
  type Filters,
} from "@/lib/filtering";
import {
  initialDashboardFilters,
  reconcileStoredFilters,
  saveStoredFilters,
} from "@/lib/filterStorage";
import { hours, statusTone } from "@/lib/formatters";
import type {
  Employee,
  EntryRow,
  OperationsKpi,
  PersonDailyTracking,
} from "@/lib/types";

export function PeopleConsistencyView({
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
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const { setSnapshot, clearSnapshot } = useDashboardFilters();

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

  useEffect(() => {
    if (!bounds.min) return;
    setFilters((current) => reconcileStoredFilters(current, bounds, options));
    setFiltersReady(true);
  }, [bounds.min, bounds.max, options]);

  useEffect(() => {
    if (!filtersReady) return;
    saveStoredFilters(filters);
  }, [filters, filtersReady]);

  const peopleFilters = useMemo(() => withoutDepartments(filters), [filters]);

  useEffect(() => {
    setSnapshot({
      filters: peopleFilters,
      isActive: !isDefault(peopleFilters, bounds),
      summary: summarizeFilters(peopleFilters),
    });
    return () => clearSnapshot();
  }, [peopleFilters, bounds, setSnapshot, clearSnapshot]);

  const rows = useMemo(
    () => applyFilters(activeEntries, peopleFilters),
    [activeEntries, peopleFilters]
  );

  const opsRows = useMemo(
    () => computePersonOperations(rows, dailyTracking, peopleFilters, kpis),
    [rows, dailyTracking, peopleFilters, kpis]
  );

  const scheduleNeeded = opsRows.filter(
    (k) => k.status === "Schedule needed"
  ).length;

  const photoOf = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const e of employees) map.set(e.person, e.photo_url);
    return map;
  }, [employees]);

  const update = (next: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...next }));
  };

  const clearFilters = () => {
    const cleared = defaultFilters(bounds);
    setFilters(cleared);
    saveStoredFilters(cleared);
  };

  return (
    <PageShell>
      <PageHeader title="People" />

      {bounds.min ? (
        <div className="mt-5">
          <FilterBar
            filters={peopleFilters}
            options={options}
            bounds={bounds}
            onChange={update}
            onClear={clearFilters}
            hide={["department"]}
          />
        </div>
      ) : null}

      {scheduleNeeded > 0 ? (
        <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-review-soft bg-review-soft px-4 py-3 text-[13px] text-[color:var(--color-review)]">
          <WarningCircleIcon
            size={18}
            weight="fill"
            aria-hidden
            className="mt-0.5 shrink-0"
          />
          <span>
            {scheduleNeeded}{" "}
            {scheduleNeeded === 1 ? "person needs" : "people need"} a working
            schedule set in Settings before their working-day average can be
            measured.
          </span>
        </div>
      ) : null}

      <Panel title="Tracking Consistency" className="mt-6" noBodyPadding>
        {opsRows.length === 0 ? (
          <EmptyRow>No people match the current filters.</EmptyRow>
        ) : (
          <div className="lh-scroll overflow-auto">
            <table className="lh-table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th className="text-center">Avg / Working Day</th>
                  <th className="text-center">Median Active Day</th>
                  <th className="text-center">Working Days</th>
                  <th className="text-center">Tracked Hours</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {opsRows.map((k) => {
                  const hasDays = k.countedWorkingDays > 0;
                  const selected = selectedPerson === k.person;
                  return (
                    <tr
                      key={k.person}
                      className={selected ? "bg-tint/80" : undefined}
                    >
                      <td>
                        <button
                          type="button"
                          onClick={() => setSelectedPerson(k.person)}
                          className="inline-flex items-center gap-2.5 text-left font-medium text-ink transition-colors hover:text-brand"
                        >
                          <Avatar
                            name={k.person}
                            photoUrl={photoOf.get(k.person)}
                            size="sm"
                          />
                          <span className="hover:underline">{k.person}</span>
                        </button>
                      </td>
                      <td className="text-center tabular-nums">
                        {hasDays ? hours(k.avgWorkingDay) : "—"}
                      </td>
                      <td className="text-center tabular-nums">
                        {k.medianActiveDay > 0 ? hours(k.medianActiveDay) : "—"}
                      </td>
                      <td className="text-center tabular-nums">
                        {k.countedWorkingDays.toLocaleString()}
                      </td>
                      <td className="text-center tabular-nums">
                        {hours(k.trackedHours)}
                      </td>
                      <td>
                        <Badge tone={statusTone(k.status)}>{k.status}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {selectedPerson ? (
        <PersonDetailPanel
          person={selectedPerson}
          onClose={() => setSelectedPerson(null)}
          filters={peopleFilters}
          options={options}
          bounds={bounds}
          onFiltersChange={update}
          onClearFilters={clearFilters}
          dailyTracking={dailyTracking}
          kpis={kpis}
        />
      ) : null}
    </PageShell>
  );
}
