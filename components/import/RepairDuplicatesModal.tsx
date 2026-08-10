"use client";

import type {
  RepairDuplicateRow,
  RepairPreviewResult,
} from "@/lib/import/repair-types";
import { EditModal } from "@/components/settings/EditModal";
import { DuplicateTable, shortHash } from "./ImportModals";

export type RepairProgress = {
  phase: "preparing" | "applying" | "finishing";
  done: number;
  total: number;
  label: string;
};

export function RepairDuplicatesModal({
  preview,
  pending,
  progress,
  onCancel,
  onConfirm,
}: {
  preview: RepairPreviewResult;
  pending: boolean;
  progress: RepairProgress | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const total = preview.duplicatesTotal;
  const showing = preview.duplicates.length;
  const pct = progress
    ? Math.min(
        100,
        Math.round((100 * progress.done) / Math.max(1, progress.total))
      )
    : 0;
  const running = !!progress;

  return (
    <EditModal
      title={`Remove Duplicates (${total.toLocaleString()})`}
      size="xl"
      onClose={running ? () => undefined : onCancel}
    >
      <div className="space-y-4 px-5 py-4">
        {running ? (
          <div className="space-y-3">
            <p className="text-[13px] text-ink">{progress.label}</p>
            <div
              className="h-2 overflow-hidden rounded-full bg-tint"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              aria-label="Repair Progress"
            >
              <div
                className="h-full rounded-full bg-brand transition-[width] duration-200 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-[12px] tabular-nums text-muted">
              {progress.done.toLocaleString()} / {progress.total.toLocaleString()}{" "}
              · {pct}%
            </p>
          </div>
        ) : (
          <>
            <p className="text-[13px] text-muted">
              Review the list below, then confirm. We will update{" "}
              <span className="font-medium text-ink">
                {preview.wouldRehash.toLocaleString()}
              </span>{" "}
              entries and permanently delete{" "}
              <span className="font-medium text-[color:var(--color-serious)]">
                {total.toLocaleString()}
              </span>{" "}
              duplicate{total === 1 ? "" : "s"}. Cancel keeps everything as is.
            </p>
            {showing < total ? (
              <p className="text-[12px] text-muted">
                Showing first {showing.toLocaleString()} of{" "}
                {total.toLocaleString()}
              </p>
            ) : null}
            {total === 0 ? (
              <p className="text-[13px] text-ink">
                No rows to delete. Hash update only (
                {preview.wouldRehash.toLocaleString()}).
              </p>
            ) : (
              <DuplicateTable>
                <thead>
                  <tr className="border-b border-line text-muted">
                    <th className="py-2 pr-3 font-medium">ID</th>
                    <th className="py-2 pr-3 font-medium">Person</th>
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Hours</th>
                    <th className="py-2 pr-3 font-medium">Task</th>
                    <th className="py-2 pr-3 font-medium">Time</th>
                    <th className="py-2 pr-3 font-medium">Keep ID</th>
                    <th className="py-2 font-medium">Hash</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.duplicates.map((row: RepairDuplicateRow) => (
                    <tr key={row.id} className="border-b border-line/60">
                      <td className="py-2 pr-3 tabular-nums text-muted">
                        {row.id}
                      </td>
                      <td className="py-2 pr-3 text-ink">{row.person}</td>
                      <td className="py-2 pr-3 tabular-nums">{row.date}</td>
                      <td className="py-2 pr-3 tabular-nums">{row.hours}</td>
                      <td className="py-2 pr-3 text-ink">{row.task ?? "—"}</td>
                      <td className="py-2 pr-3 text-muted">
                        {row.timeRange ?? "—"}
                      </td>
                      <td className="py-2 pr-3 tabular-nums text-muted">
                        {row.keepId}
                      </td>
                      <td className="py-2 font-mono text-[11px] text-muted">
                        {shortHash(row.entry_hash)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DuplicateTable>
            )}
          </>
        )}
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
            disabled={pending}
            className="rounded-md bg-[color:var(--color-serious)] px-4 py-2 text-[13px] font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {running
              ? progress.label
              : total > 0
                ? `Remove ${total.toLocaleString()} Duplicate${total === 1 ? "" : "s"}`
                : `Update ${preview.wouldRehash.toLocaleString()} Entries`}
          </button>
        </div>
      </div>
    </EditModal>
  );
}
