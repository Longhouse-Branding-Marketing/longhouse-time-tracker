"use client";

import type { ReactNode } from "react";
import type { ImportDuplicateRow } from "@/lib/import/import-action-types";
import { EditModal } from "@/components/settings/EditModal";

export function DuplicateTable({ children }: { children: ReactNode }) {
  return (
    <div className="max-h-[min(50vh,420px)] overflow-auto rounded-md border border-line">
      <table className="w-full min-w-[640px] text-left text-[12px]">
        {children}
      </table>
    </div>
  );
}

export function shortHash(hash: string | null | undefined): string {
  if (!hash) return "—";
  return hash.length > 10 ? `${hash.slice(0, 8)}…` : hash;
}

export function HowToImportModal({ onClose }: { onClose: () => void }) {
  return (
    <EditModal title="How To Import" onClose={onClose}>
      <div className="space-y-4 px-5 py-4">
        <ol className="list-decimal space-y-2.5 pl-4 text-[13px] leading-snug text-ink marker:text-muted">
          <li>
            Open{" "}
            <a
              href="https://projects.memtime.com/insights"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-brand-600 underline-offset-2 hover:underline"
            >
              projects.memtime.com/insights
            </a>
            .
          </li>
          <li>Pick the date range you want.</li>
          <li>
            Click <span className="font-medium">Export</span> in the top right.
          </li>
          <li>
            Set <span className="font-medium">Report Type</span> to{" "}
            <span className="font-medium">Time Tracking Report</span>.
          </li>
          <li>
            Turn on all three options:
            <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[12px] text-muted">
              <li>
                Include Element Hierarchy in &quot;Booked On&quot; Columns
              </li>
              <li>Represent time in minutes without the unit(s)</li>
              <li>Shorten long URLs and file paths</li>
            </ul>
          </li>
          <li>
            Set <span className="font-medium">File Format</span> to{" "}
            <span className="font-medium">CSV File</span> and{" "}
            <span className="font-medium">Delimiter</span> to{" "}
            <span className="font-medium">Comma ,</span>.
          </li>
          <li>
            Click <span className="font-medium">Export</span>, then upload the
            file on this page.
          </li>
        </ol>
        <div className="flex justify-end border-t border-line pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-brand px-4 py-2 text-[13px] font-medium text-white transition hover:bg-brand-600"
          >
            Got It
          </button>
        </div>
      </div>
    </EditModal>
  );
}

export function ImportDuplicatesModal({
  duplicates,
  total,
  wouldInsert,
  pending,
  onCancel,
  onConfirm,
}: {
  duplicates: ImportDuplicateRow[];
  total: number;
  wouldInsert: number;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const showing = duplicates.length;
  return (
    <EditModal
      title={`Duplicates Found (${total.toLocaleString()})`}
      size="xl"
      onClose={onCancel}
    >
      <div className="space-y-4 px-5 py-4">
        <p className="text-[13px] text-muted">
          These rows are already in the system (or repeated in this file). They
          will be skipped — nothing is deleted. Only{" "}
          <span className="font-medium text-ink">
            {wouldInsert.toLocaleString()} new row
            {wouldInsert === 1 ? "" : "s"}
          </span>{" "}
          will be imported.
        </p>
        {showing < total ? (
          <p className="text-[12px] text-muted">
            Showing first {showing.toLocaleString()} of {total.toLocaleString()}
          </p>
        ) : null}
        <DuplicateTable>
          <thead>
            <tr className="border-b border-line text-muted">
              <th className="py-2 pr-3 font-medium">Person</th>
              <th className="py-2 pr-3 font-medium">Date</th>
              <th className="py-2 pr-3 font-medium">Hours</th>
              <th className="py-2 pr-3 font-medium">Task</th>
              <th className="py-2 pr-3 font-medium">Time</th>
              <th className="py-2 pr-3 font-medium">Reason</th>
              <th className="py-2 font-medium">Hash</th>
            </tr>
          </thead>
          <tbody>
            {duplicates.map((row, i) => (
              <tr
                key={`${row.entry_hash}-${i}`}
                className="border-b border-line/60"
              >
                <td className="py-2 pr-3 text-ink">{row.person}</td>
                <td className="py-2 pr-3 tabular-nums">{row.date}</td>
                <td className="py-2 pr-3 tabular-nums">{row.hours}</td>
                <td className="py-2 pr-3 text-ink">{row.task ?? "—"}</td>
                <td className="py-2 pr-3 text-muted">{row.timeRange ?? "—"}</td>
                <td className="py-2 pr-3 text-muted">
                  {row.reason === "in_file" ? "In file" : "Already imported"}
                </td>
                <td className="py-2 font-mono text-[11px] text-muted">
                  {shortHash(row.entry_hash)}
                </td>
              </tr>
            ))}
          </tbody>
        </DuplicateTable>
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-md px-3 py-2 text-[13px] text-muted transition hover:bg-tint hover:text-ink disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending || wouldInsert === 0}
            className="rounded-md bg-brand px-4 py-2 text-[13px] font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending
              ? "Importing…"
              : wouldInsert === 0
                ? "Nothing To Import"
                : `Import ${wouldInsert.toLocaleString()} New · Skip Duplicates`}
          </button>
        </div>
      </div>
    </EditModal>
  );
}
