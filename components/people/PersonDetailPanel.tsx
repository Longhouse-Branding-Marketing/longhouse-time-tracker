"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FilterBar } from "@/components/FilterBar";
import { EditModal } from "@/components/settings/EditModal";
import { Avatar, Badge, EmptyRow } from "@/components/ui";
import { computePersonOperations } from "@/lib/aggregate";
import { refetchApi } from "@/lib/api";
import { applyFilters, type DateBounds, type FilterOptions, type Filters } from "@/lib/filtering";
import { useHubAccessToken } from "@/lib/hub/HubSessionContext";
import { formatDate, hours, n, pct, statusTone } from "@/lib/formatters";
import type {
  Employee,
  OperationsKpi,
  PersonDailyTracking,
  PersonEntryDetail,
} from "@/lib/types";

type PersonPayload = {
  person: string;
  employee: Employee | null;
  kpi: OperationsKpi | null;
  entries: PersonEntryDetail[];
};

function formatCreatedAt(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function PersonDetailPanel({
  person,
  onClose,
  filters,
  options,
  bounds,
  onFiltersChange,
  onClearFilters,
  dailyTracking,
  kpis,
}: {
  person: string;
  onClose: () => void;
  filters: Filters;
  options: FilterOptions;
  bounds: DateBounds;
  onFiltersChange: (next: Partial<Filters>) => void;
  onClearFilters: () => void;
  dailyTracking: PersonDailyTracking[];
  kpis: OperationsKpi[];
}) {
  const accessToken = useHubAccessToken();
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; data: PersonPayload }
  >({ status: "loading" });

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    setState({ status: "loading" });

    const url = `/api/person?person=${encodeURIComponent(person)}`;
    refetchApi<PersonPayload>(url, accessToken)
      .then((data) => {
        if (active) setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            status: "error",
            message:
              error instanceof Error ? error.message : "Failed to load person",
          });
        }
      });

    return () => {
      active = false;
    };
  }, [person, accessToken]);

  const scopedFilters = useMemo(
    () => ({ ...filters, people: [] as string[] }),
    [filters]
  );

  const visibleEntries = useMemo(() => {
    if (state.status !== "ready") return [];
    return applyFilters(state.data.entries, scopedFilters);
  }, [state, scopedFilters]);

  const ops = useMemo(() => {
    if (state.status !== "ready") return null;
    const personFilters: Filters = { ...scopedFilters, people: [person] };
    return (
      computePersonOperations(visibleEntries, dailyTracking, personFilters, kpis)[0] ??
      null
    );
  }, [state, visibleEntries, dailyTracking, scopedFilters, person, kpis]);

  const stats = useMemo(() => {
    if (state.status !== "ready") return null;
    let billableHours = 0;
    let totalHours = 0;
    for (const row of visibleEntries) {
      const h = n(row.hours);
      totalHours += h;
      if (row.is_billable) billableHours += h;
    }
    return {
      entries: visibleEntries.length,
      tracked: ops ? ops.trackedHours : totalHours,
      avg: ops ? ops.avgWorkingDay : 0,
      countedDays: ops ? ops.countedWorkingDays : 0,
      median: ops ? ops.medianActiveDay : 0,
      billablePct: totalHours > 0 ? (100 * billableHours) / totalHours : 0,
      status: ops?.status ?? state.data.kpi?.status ?? null,
    };
  }, [state, visibleEntries, ops]);

  return (
    <EditModal
      title={person}
      onClose={onClose}
      size="xl"
      headerRight={
        <Link
          href={`/settings?person=${encodeURIComponent(person)}`}
          className="rounded-md px-2.5 py-1.5 text-[13px] font-medium text-brand-600 hover:bg-tint"
        >
          Settings
        </Link>
      }
    >
      {bounds.min ? (
        <div className="border-b border-line px-5 py-3">
          <FilterBar
            filters={filters}
            options={options}
            bounds={bounds}
            onChange={onFiltersChange}
            onClear={onClearFilters}
            hide={["department", "person"]}
          />
        </div>
      ) : null}

      {state.status === "loading" ? (
        <div className="px-5 py-10 text-center text-[13px] text-muted">
          Loading entries…
        </div>
      ) : null}

      {state.status === "error" ? (
        <div className="px-5 py-10 text-center text-[13px] text-serious">
          {state.message}
        </div>
      ) : null}

      {state.status === "ready" && stats ? (
        <div className="px-5 py-5">
          <div className="flex flex-wrap items-center gap-4">
            <Avatar
              name={person}
              photoUrl={state.data.employee?.photo_url}
              size="lg"
            />
            <div className="min-w-0">
              <p className="text-[18px] font-semibold tracking-normal text-ink">
                {person}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {stats.status ? (
                  <Badge tone={statusTone(stats.status)}>{stats.status}</Badge>
                ) : null}
                {state.data.employee && !state.data.employee.active ? (
                  <Badge tone="neutral">Inactive</Badge>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Tracked Hours" value={hours(stats.tracked)} />
            <Stat
              label="Avg / Working Day"
              value={stats.countedDays > 0 ? hours(stats.avg) : "—"}
            />
            <Stat
              label="Median Active Day"
              value={stats.median > 0 ? hours(stats.median) : "—"}
            />
            <Stat
              label="Counted Days"
              value={stats.countedDays.toLocaleString()}
            />
            <Stat label="Entries" value={stats.entries.toLocaleString()} />
            <Stat label="Billable" value={pct(stats.billablePct)} />
          </div>

          <div className="mt-6">
            <h3 className="lh-section-title">Time Entries</h3>
            {visibleEntries.length === 0 ? (
              <EmptyRow>No entries for this person in the current filters.</EmptyRow>
            ) : (
              <div className="lh-scroll mt-3 max-h-[min(48vh,420px)] overflow-auto rounded-lg border border-line">
                <table className="lh-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Entered</th>
                      <th className="text-right">Hours</th>
                      <th>Department</th>
                      <th>Role</th>
                      <th>Activity Type</th>
                      <th>Original Task</th>
                      <th>Billable</th>
                      <th>Comments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleEntries.map((row) => (
                      <tr key={row.id}>
                        <td className="whitespace-nowrap tabular-nums">
                          {formatDate(row.date)}
                        </td>
                        <td className="whitespace-nowrap text-[12px] text-muted tabular-nums">
                          {formatCreatedAt(row.created_at)}
                        </td>
                        <td className="text-right tabular-nums">
                          {hours(row.hours)}
                        </td>
                        <td>{row.department || "—"}</td>
                        <td>{row.role || "—"}</td>
                        <td>{row.type || "—"}</td>
                        <td>{row.raw_task || row.task || "—"}</td>
                        <td>{row.billable || "—"}</td>
                        <td className="max-w-[220px]">
                          <span className="line-clamp-2 text-[12px] text-muted">
                            {row.comments?.trim() || "—"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </EditModal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-tint/60 px-3 py-2.5">
      <p className="lh-meta-label text-navy">{label}</p>
      <p className="mt-1 font-sans text-[18px] font-normal tabular-nums tracking-normal text-accent-deep">
        {value}
      </p>
    </div>
  );
}
