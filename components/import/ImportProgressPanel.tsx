"use client";

import { CheckCircleIcon } from "@phosphor-icons/react";
import type { ImportCommitResult, ImportProgressEvent } from "@/lib/import/import-action-types";
import { formatElapsed } from "@/lib/import/import-stream";
import { Panel } from "@/components/ui";

export function ImportProgressBar({
  label,
  done,
  total,
  indeterminate,
  elapsedMs,
}: {
  label: string;
  done: number;
  total: number;
  indeterminate?: boolean;
  elapsedMs?: number;
}) {
  const pct = indeterminate
    ? 0
    : Math.min(100, Math.round((100 * done) / Math.max(1, total)));

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-ink">{label}</p>
      <div
        className="h-2 overflow-hidden rounded-full bg-tint"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : pct}
        aria-label={label}
      >
        {indeterminate ? (
          <div className="lh-progress-indet h-full w-1/3 rounded-full bg-brand" />
        ) : (
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-200 ease-out"
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      <p className="text-[12px] tabular-nums text-muted">
        {indeterminate
          ? elapsedMs != null
            ? formatElapsed(elapsedMs)
            : "Working…"
          : `${done.toLocaleString()} / ${total.toLocaleString()} · ${pct}%`}
        {!indeterminate && elapsedMs != null ? ` · ${formatElapsed(elapsedMs)}` : null}
      </p>
    </div>
  );
}

export function ImportRunningPanel({
  kind,
  progress,
  elapsedMs,
}: {
  kind: "preview" | "commit";
  progress: ImportProgressEvent | null;
  elapsedMs: number;
}) {
  const indeterminate =
    kind === "preview" || !progress || progress.phase === "matching";
  const label =
    kind === "preview"
      ? "Checking File…"
      : progress?.label ?? "Starting Import…";

  return (
    <Panel title={kind === "preview" ? "Checking File" : "Importing"}>
      <ImportProgressBar
        label={label}
        done={progress?.done ?? 0}
        total={Math.max(1, progress?.total ?? 1)}
        indeterminate={indeterminate}
        elapsedMs={elapsedMs}
      />
      {kind === "commit" ? (
        <p className="mt-3 text-[12px] leading-snug text-muted">
          You can leave this tab. If import takes more than 2 minutes, we&apos;ll
          send a notification when the dashboard is up to date.
        </p>
      ) : null}
    </Panel>
  );
}

export function ImportCompletePanel({
  result,
  elapsedMs,
  onReset,
}: {
  result: ImportCommitResult;
  elapsedMs: number | null;
  onReset: () => void;
}) {
  return (
    <Panel title="Import Complete">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-positive-soft text-[color:var(--color-positive)]">
          <CheckCircleIcon size={22} weight="fill" aria-hidden />
        </div>
        <div>
          <p className="text-[15px] font-semibold text-ink">
            Dashboard is up to date
          </p>
          <p className="mt-0.5 text-[12px] text-muted">
            {elapsedMs != null ? `Finished in ${formatElapsed(elapsedMs)}.` : null}{" "}
            You can keep working — Home, People, and Reports now include this file.
          </p>
        </div>
      </div>

      {result.dbProjectRef != null && result.dbTimeEntryCount != null ? (
        <p className="mt-4 text-[12px] text-muted">
          Database{" "}
          <span className="font-mono font-medium text-ink">
            {result.dbProjectRef}
          </span>{" "}
          now has{" "}
          <span className="font-medium tabular-nums text-ink">
            {result.dbTimeEntryCount.toLocaleString()}
          </span>{" "}
          rows in time_entries.
        </p>
      ) : null}

      <p className="mt-3 text-[14px] text-ink">
        <span className="font-semibold tabular-nums">
          {result.processed.toLocaleString()}
        </span>{" "}
        rows processed
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <CompleteStat label="Inserted" value={result.inserted} tone="ok" />
        <CompleteStat
          label="Duplicates Skipped"
          value={result.skippedDuplicate}
          tone="muted"
        />
        <CompleteStat label="Rejected" value={result.rejected} tone="muted" />
      </div>
      <button
        type="button"
        onClick={onReset}
        className="mt-4 text-[13px] font-medium text-brand-600 hover:underline"
      >
        Import Another File
      </button>
    </Panel>
  );
}

function CompleteStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "muted";
}) {
  return (
    <div className="rounded-lg border border-line bg-surface/60 px-3 py-2.5">
      <div className="text-[11px] font-medium tracking-wide text-muted uppercase">
        {label}
      </div>
      <div
        className={`mt-0.5 text-xl font-semibold tabular-nums ${
          tone === "ok"
            ? "text-[color:var(--color-positive)]"
            : tone === "muted"
              ? "text-muted"
              : "text-ink"
        }`}
      >
        {value.toLocaleString()}
      </div>
    </div>
  );
}
