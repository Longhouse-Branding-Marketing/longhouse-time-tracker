"use client";

import { useMemo } from "react";
import { EmptyRow, PageHeader, PageShell, Panel } from "@/components/ui";
import {
  catalogIssues,
  isPartnerBillableReview,
  unmappedGroups,
  type MappedFields,
} from "@/lib/categoryMap";
import { hours } from "@/lib/formatters";
import type { EntryRow } from "@/lib/types";

type ReviewEntry = EntryRow & MappedFields;

export function ReviewView({ entries }: { entries: ReviewEntry[] }) {
  const missing = useMemo(() => unmappedGroups(entries), [entries]);
  const partner = useMemo(
    () => entries.filter((row) => isPartnerBillableReview(row)),
    [entries]
  );
  const catalog = useMemo(() => catalogIssues(), []);
  const partnerHours = partner.reduce((sum, row) => {
    const value = Number(row.hours);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  return (
    <PageShell>
      <PageHeader title="Review" />
      <p className="mt-2 text-[13px] text-muted">
        Nothing on this page changes stored time.
      </p>

      <Panel title="Unmapped Entries" className="mt-5" noBodyPadding>
        {missing.length === 0 ? (
          <EmptyRow>Every logged task matches the category map.</EmptyRow>
        ) : (
          <div className="lh-scroll overflow-auto">
            <table className="lh-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Role</th>
                  <th>Task</th>
                  <th className="text-right">Entries</th>
                  <th className="text-right">Hours</th>
                </tr>
              </thead>
              <tbody>
                {missing.map((row) => (
                  <tr key={`${row.department}\0${row.role}\0${row.task}`}>
                    <td>{row.department}</td>
                    <td>{row.role}</td>
                    <td className="font-medium text-ink">{row.task}</td>
                    <td className="text-right tabular-nums">
                      {row.entries.toLocaleString()}
                    </td>
                    <td className="text-right tabular-nums">{hours(row.hours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        title="Partner Billable Review"
        className="mt-5"
        noBodyPadding
        right={
          <span className="text-[12px] text-muted">
            {partner.length.toLocaleString()} entries · {hours(partnerHours)}
          </span>
        }
      >
        {partner.length === 0 ? (
          <EmptyRow>
            No non-billable entries have Partner in the original logged name.
          </EmptyRow>
        ) : (
          <div className="lh-scroll max-h-[480px] overflow-auto">
            <table className="lh-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Person</th>
                  <th className="text-right">Hours</th>
                  <th>Department</th>
                  <th>Role</th>
                  <th>Task</th>
                  <th>Flag</th>
                  <th>Proposed</th>
                </tr>
              </thead>
              <tbody>
                {partner.slice(0, 200).map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap">{row.date}</td>
                    <td>{row.person}</td>
                    <td className="text-right tabular-nums">{hours(row.hours)}</td>
                    <td>{row.raw_department || "—"}</td>
                    <td>{row.raw_role || "—"}</td>
                    <td>{row.raw_task || "—"}</td>
                    <td>{row.billable || "Non-Billable"}</td>
                    <td>Billable</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {partner.length > 200 ? (
              <p className="px-5 py-3 text-[12px] text-muted">
                Showing 200 of {partner.length.toLocaleString()} entries.
              </p>
            ) : null}
          </div>
        )}
      </Panel>

      <Panel title="Category Checks" className="mt-5" noBodyPadding>
        <div className="lh-scroll overflow-auto">
          <table className="lh-table">
            <thead>
              <tr>
                <th>Check</th>
                <th>Name</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {catalog.map((issue) => (
                <tr key={`${issue.kind}\0${issue.name}\0${issue.detail}`}>
                  <td>{issue.kind}</td>
                  <td className="font-medium text-ink">{issue.name}</td>
                  <td className="text-muted">{issue.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </PageShell>
  );
}
