"use client";

import { useMemo, useState } from "react";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { PersonDetailPanel } from "@/components/people/PersonDetailPanel";
import {
  Avatar,
  Badge,
  EmptyRow,
  PageHeader,
  PageShell,
  Panel,
} from "@/components/ui";
import type { Employee, OperationsKpi } from "@/lib/types";
import { hours, n, statusTone } from "@/lib/formatters";

export function PeopleConsistencyView({
  kpis,
  employees,
}: {
  kpis: OperationsKpi[];
  employees: Employee[];
}) {
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const scheduleNeeded = kpis.filter((k) => k.status === "Schedule needed").length;

  const photoOf = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const e of employees) map.set(e.person, e.photo_url);
    return map;
  }, [employees]);

  return (
    <PageShell>
      <PageHeader title="People" />

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
            {scheduleNeeded === 1 ? "person needs" : "people need"} a working schedule
            set in Settings before their working-day average can be measured.
          </span>
        </div>
      ) : null}

      <Panel title="Tracking Consistency" className="mt-6" noBodyPadding>
        {kpis.length === 0 ? (
          <EmptyRow>No people to review.</EmptyRow>
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
                {kpis.map((k) => {
                  const hasDays = n(k.counted_working_days) > 0;
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
                        {hasDays ? hours(k.avg_working_day) : "—"}
                      </td>
                      <td className="text-center tabular-nums">
                        {n(k.median_active_day) > 0
                          ? hours(k.median_active_day)
                          : "—"}
                      </td>
                      <td className="text-center tabular-nums">
                        {n(k.counted_working_days).toLocaleString()}
                      </td>
                      <td className="text-center tabular-nums">
                        {hours(k.tracked_hours)}
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
        />
      ) : null}
    </PageShell>
  );
}
