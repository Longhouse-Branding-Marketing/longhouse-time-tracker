"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { QuestionIcon } from "@phosphor-icons/react";
import {
  commitImport,
  getImportSetupStatus,
  previewImport,
} from "@/app/import/actions";
import {
  applyRepairDuplicates,
  previewRepairDuplicates,
} from "@/app/import/repair-actions";
import { invalidateApiCache, useApiData } from "@/lib/api";
import { useHubAccessToken } from "@/lib/hub/HubSessionContext";
import type { CompletedDayStatus } from "@/lib/import/completedDay";
import type {
  ImportCommitResult,
  ImportPreviewResult,
} from "@/lib/import/import-action-types";
import type { RepairPreviewResult } from "@/lib/import/repair-types";
import { formatDate, formatDateShort, hours } from "@/lib/formatters";
import {
  HowToImportModal,
  ImportDuplicatesModal,
} from "@/components/import/ImportModals";
import {
  RepairDuplicatesModal,
  type RepairProgress,
} from "@/components/import/RepairDuplicatesModal";
import { PageShell, Panel } from "@/components/ui";

const REPAIR_RANGE = { from: "2020-01-01", to: "2100-12-31" } as const;

export function ImportView() {
  const accessToken = useHubAccessToken();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [result, setResult] = useState<ImportCommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const coverage = useApiData<CompletedDayStatus>("/api/import/coverage");
  const [serviceRoleOk, setServiceRoleOk] = useState<boolean | null>(null);
  const [importDupOpen, setImportDupOpen] = useState(false);
  const [repairPreview, setRepairPreview] =
    useState<RepairPreviewResult | null>(null);
  const [repairProgress, setRepairProgress] = useState<RepairProgress | null>(
    null
  );
  const [howToOpen, setHowToOpen] = useState(false);
  const [duplicateCount, setDuplicateCount] = useState<number | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    getImportSetupStatus(accessToken).then((s) =>
      setServiceRoleOk(s.serviceRoleConfigured)
    );
  }, [accessToken]);

  useEffect(() => {
    if (!serviceRoleOk || !accessToken) return;
    let cancelled = false;
    void (async () => {
      const r = await previewRepairDuplicates({
        ...REPAIR_RANGE,
        accessToken,
      });
      if (cancelled || !r.ok) return;
      setDuplicateCount(r.wouldDelete);
    })();
    return () => {
      cancelled = true;
    };
  }, [serviceRoleOk, accessToken]);

  const runCommit = useCallback(() => {
    if (!csvText?.trim() || !accessToken) return;
    setImportDupOpen(false);
    setError(null);
    startTransition(async () => {
      const r = await commitImport(accessToken, csvText, fileName, {
        rejectedCount: preview?.rejectedCount ?? 0,
        totalRows: preview?.totalRows ?? 0,
      });
      setResult(r);
      if (!r.ok && r.error) setError(r.error);
      if (r.ok) {
        invalidateApiCache();
      }
    });
  }, [csvText, fileName, preview, accessToken]);

  const onConfirmImport = useCallback(() => {
    if (!csvText?.trim() || !preview?.ok || preview.wouldInsert === 0) return;
    if (preview.wouldSkipDuplicate > 0) {
      setImportDupOpen(true);
      return;
    }
    runCommit();
  }, [csvText, preview, runCommit]);

  const onPreviewRepair = useCallback(() => {
    if (!accessToken) return;
    setError(null);
    startTransition(async () => {
      const r = await previewRepairDuplicates({
        ...REPAIR_RANGE,
        accessToken,
      });
      if (!r.ok) {
        setError(r.error ?? "Could not preview repair.");
        setRepairPreview(null);
        return;
      }
      setDuplicateCount(r.wouldDelete);
      if (r.wouldDelete === 0 && r.wouldRehash === 0) {
        setRepairPreview(null);
        return;
      }
      setRepairPreview(r);
    });
  }, [accessToken]);

  const onConfirmRepair = useCallback(() => {
    if (!repairPreview || repairProgress || !accessToken) return;
    setError(null);

    void (async () => {
      const total = Math.max(
        1,
        repairPreview.wouldRehash + repairPreview.wouldDelete
      );
      setRepairProgress({
        phase: "preparing",
        done: 0,
        total,
        label: "Preparing Repair…",
      });

      // Brief prepare tick so the modal shows progress before the RPC.
      setRepairProgress({
        phase: "applying",
        done: Math.min(total, Math.ceil(total * 0.15)),
        total,
        label: "Applying Repair…",
      });

      const r = await applyRepairDuplicates({
        ...REPAIR_RANGE,
        confirm: true,
        accessToken,
      });

      if (!r.ok) {
        setRepairProgress(null);
        setError(r.error ?? "Repair failed.");
        return;
      }

      setRepairProgress({
        phase: "finishing",
        done: total,
        total,
        label: r.transactional
          ? "Repair Complete"
          : "Repair Complete (non-transactional fallback)",
      });

      setRepairProgress(null);
      setRepairPreview(null);
      setDuplicateCount(0);
      invalidateApiCache();
    })();
  }, [repairPreview, repairProgress, accessToken]);

  const reset = useCallback(() => {
    setFileName(null);
    setCsvText(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setImportDupOpen(false);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const onFile = useCallback((file: File | null) => {
    setResult(null);
    setPreview(null);
    setError(null);
    setImportDupOpen(false);
    if (!file) {
      setFileName(null);
      setCsvText(null);
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      setCsvText(text);
      startTransition(async () => {
        const p = await previewImport(accessToken, text, file.name);
        setPreview(p);
        if (!p.ok && p.error) setError(p.error);
      });
    };
    reader.onerror = () => setError("Could not read the selected file.");
    reader.readAsText(file);
  }, []);

  return (
    <PageShell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-h-9 flex-wrap items-center gap-3">
          <h1 className="lh-page-title">Import</h1>
          <button
            type="button"
            onClick={() => setHowToOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-card px-3 py-1.5 text-[13px] font-medium text-ink shadow-[0_1px_2px_rgba(2,22,61,0.04)] transition hover:border-brand/30 hover:bg-tint"
          >
            <QuestionIcon size={15} weight="regular" aria-hidden />
            How To Import
          </button>
        </div>

        {serviceRoleOk ? (
          <div className="flex min-h-9 flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-md border border-line bg-card px-3 py-1.5 text-[13px] font-medium tabular-nums text-ink shadow-[0_1px_2px_rgba(2,22,61,0.04)]">
              {duplicateCount === null
                ? "Checking…"
                : `${duplicateCount.toLocaleString()} Duplicate${duplicateCount === 1 ? "" : "s"}`}
            </span>
            <button
              type="button"
              onClick={onPreviewRepair}
              disabled={
                pending ||
                !!repairPreview ||
                !!repairProgress ||
                duplicateCount === null
              }
              className="rounded-md border border-line bg-card px-3 py-1.5 text-[13px] font-medium text-brand-600 shadow-[0_1px_2px_rgba(2,22,61,0.04)] transition hover:border-brand/30 hover:bg-tint disabled:opacity-40"
            >
              {pending && !repairPreview ? "Scanning…" : "Review Duplicates"}
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-6 space-y-5">
        {serviceRoleOk === false ? (
          <div className="rounded-lg border border-serious/30 bg-serious-soft px-4 py-3 text-[13px] text-[color:var(--color-serious)]">
            Import needs{" "}
            <code className="rounded bg-white/50 px-1 text-[12px]">
              SUPABASE_SERVICE_ROLE_KEY
            </code>{" "}
            in{" "}
            <code className="rounded bg-white/50 px-1 text-[12px]">
              .env.local
            </code>
            . Copy the{" "}
            <span className="font-medium">service_role</span> key from Supabase
            → Project Settings → API, then restart{" "}
            <code className="rounded bg-white/50 px-1 text-[12px]">
              npm run dev
            </code>
            . The publishable key cannot write to{" "}
            <code className="rounded bg-white/50 px-1 text-[12px]">
              time_entries
            </code>{" "}
            (RLS).
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-stretch">
          <CoveragePanel state={coverage} />

          <Panel title="CSV Import" className="h-full">
            <div className="flex h-full flex-col">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="block w-full max-w-md text-[13px] text-ink file:mr-3 file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-white hover:file:bg-brand-600"
                  onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                  disabled={pending}
                />
                {fileName ? (
                  <button
                    type="button"
                    onClick={reset}
                    className="text-[13px] font-medium text-brand-600 hover:underline"
                    disabled={pending}
                  >
                    Clear File
                  </button>
                ) : null}
              </div>
              <p className="mt-3 text-[12px] leading-snug text-muted">
                Upload a Memtime Time Tracking Report CSV. Matching rows already
                in the system are skipped. Blank task / activity type is fine.
              </p>
              {fileName ? (
                <p className="mt-2 truncate text-[12px] font-medium text-ink">
                  {fileName}
                </p>
              ) : null}
            </div>
          </Panel>
        </div>

        {error ? (
          <div className="rounded-lg border border-serious/30 bg-serious-soft px-4 py-3 text-[13px] text-[color:var(--color-serious)]">
            {error}
          </div>
        ) : null}

        {pending && !preview && !repairPreview ? (
          <p className="text-[13px] text-muted">Checking File…</p>
        ) : null}

        {preview && preview.ok ? (
          <Panel title="Preview">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="Rows" value={preview.totalRows} />
              <Stat label="New" value={preview.wouldInsert} tone="ok" />
              <Stat
                label="Duplicates"
                value={preview.wouldSkipDuplicate}
                tone="muted"
              />
              <Stat
                label="Rejected"
                value={preview.rejectedCount}
                tone="muted"
              />
              <StatHours label="Total Hours" value={preview.totalHours} />
              <StatHours label="New Hours" value={preview.newHours} tone="ok" />
            </div>
            {preview.dateMin && preview.dateMax ? (
              <p className="mt-3 text-[12px] text-muted">
                Date Range:{" "}
                <span className="font-medium text-ink">
                  {preview.dateMin} → {preview.dateMax}
                </span>
              </p>
            ) : null}

            {preview.wouldSkipDuplicate > 0 ? (
              <p className="mt-3 text-[12px] text-muted">
                Duplicate rows will be skipped — nothing is deleted.{" "}
                <button
                  type="button"
                  className="font-medium text-brand-600 hover:underline"
                  disabled={pending}
                  onClick={() => setImportDupOpen(true)}
                >
                  Review {preview.wouldSkipDuplicate.toLocaleString()}{" "}
                  Duplicate
                  {preview.wouldSkipDuplicate === 1 ? "" : "s"}
                </button>
              </p>
            ) : null}

            {preview.sample.length > 0 ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-line text-muted">
                      <th className="py-2 pr-3 font-medium">Person</th>
                      <th className="py-2 pr-3 font-medium">Date</th>
                      <th className="py-2 pr-3 font-medium">Hours</th>
                      <th className="py-2 pr-3 font-medium">Task</th>
                      <th className="py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample.map((row) => (
                      <tr
                        key={row.entry_hash + row.date}
                        className="border-b border-line/60"
                      >
                        <td className="py-2 pr-3 text-ink">{row.person}</td>
                        <td className="py-2 pr-3 tabular-nums">{row.date}</td>
                        <td className="py-2 pr-3 tabular-nums">{row.hours}</td>
                        <td className="py-2 pr-3 text-ink">{row.task ?? "—"}</td>
                        <td className="py-2">
                          <span
                            className={
                              row.status === "new"
                                ? "text-[color:var(--color-positive)]"
                                : "text-muted"
                            }
                          >
                            {row.status === "new" ? "New" : "Duplicate"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onConfirmImport}
                disabled={
                  pending ||
                  preview.wouldInsert === 0 ||
                  !!result?.ok ||
                  serviceRoleOk === false
                }
                className="rounded-md bg-brand px-4 py-2 text-[13px] font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pending
                  ? "Importing…"
                  : preview.wouldInsert === 0
                    ? "Nothing To Import"
                    : preview.wouldSkipDuplicate > 0
                      ? `Review & Import ${preview.wouldInsert} New`
                      : `Import ${preview.wouldInsert} New Row${preview.wouldInsert === 1 ? "" : "s"}`}
              </button>
              {csvText && !result?.ok ? (
                <button
                  type="button"
                  className="text-[13px] font-medium text-muted hover:text-ink"
                  disabled={pending}
                  onClick={() => {
                    if (!csvText || !fileName) return;
                    startTransition(async () => {
                      const p = await previewImport(accessToken, csvText, fileName);
                      setPreview(p);
                    });
                  }}
                >
                  Re-Check Duplicates
                </button>
              ) : null}
            </div>
          </Panel>
        ) : null}

        {preview && preview.rejected.length > 0 ? (
          <Panel title="Rejected Rows">
            <ul className="max-h-48 space-y-1.5 overflow-y-auto text-[12px] text-muted">
              {preview.rejected.map((r) => (
                <li key={`${r.rowNumber}-${r.reason}`}>
                  {r.rowNumber > 0 ? (
                    <span className="font-medium text-ink">
                      Row {r.rowNumber}:{" "}
                    </span>
                  ) : null}
                  {r.reason}
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}

        {result?.ok ? (
          <Panel title="Import Complete">
            <p className="text-[14px] text-ink">
              <span className="font-semibold tabular-nums">
                {result.processed.toLocaleString()}
              </span>{" "}
              rows processed
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="Inserted" value={result.inserted} tone="ok" />
              <Stat
                label="Duplicates Skipped"
                value={result.skippedDuplicate}
                tone="muted"
              />
              <Stat label="Rejected" value={result.rejected} tone="muted" />
            </div>
            <button
              type="button"
              onClick={reset}
              className="mt-4 text-[13px] font-medium text-brand-600 hover:underline"
            >
              Import Another File
            </button>
          </Panel>
        ) : null}
      </div>

      {howToOpen ? <HowToImportModal onClose={() => setHowToOpen(false)} /> : null}

      {importDupOpen && preview?.ok ? (
        <ImportDuplicatesModal
          duplicates={preview.duplicates}
          total={preview.duplicatesTotal}
          wouldInsert={preview.wouldInsert}
          pending={pending}
          onCancel={() => setImportDupOpen(false)}
          onConfirm={runCommit}
        />
      ) : null}

      {repairPreview?.ok ? (
        <RepairDuplicatesModal
          preview={repairPreview}
          pending={pending || !!repairProgress}
          progress={repairProgress}
          onCancel={() => {
            if (repairProgress) return;
            setRepairPreview(null);
          }}
          onConfirm={onConfirmRepair}
        />
      ) : null}
    </PageShell>
  );
}

function CoveragePanel({
  state,
}: {
  state: ReturnType<typeof useApiData<CompletedDayStatus>>;
}) {
  if (state.status === "loading") {
    return (
      <Panel title="Data Coverage">
        <p className="text-[13px] text-muted">Checking Recent Working Days…</p>
      </Panel>
    );
  }
  if (state.status === "error") {
    return (
      <Panel title="Data Coverage">
        <p className="text-[13px] text-[color:var(--color-serious)]">
          {state.message}
        </p>
      </Panel>
    );
  }

  const data = state.data;

  return (
    <Panel title="Data Coverage" className="h-full">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <div>
          <div className="text-[11px] font-medium tracking-wide text-muted uppercase">
            Last Complete Day
          </div>
          <div className="mt-0.5 text-lg font-semibold text-ink tabular-nums">
            {data.lastCompleteDate
              ? formatDate(data.lastCompleteDate)
              : "None Yet"}
          </div>
          {data.lastComplete ? (
            <p className="mt-0.5 text-[11px] text-muted">
              {data.lastComplete.trackedPeople}/
              {data.lastComplete.expectedPeople} People ·{" "}
              {hours(data.lastComplete.trackedHours)}
            </p>
          ) : null}
        </div>
        <div>
          <div className="text-[11px] font-medium tracking-wide text-muted uppercase">
            Extract Memtime From
          </div>
          <div className="mt-0.5 text-lg font-semibold text-brand-600 tabular-nums">
            {data.extractFrom ? formatDate(data.extractFrom) : "—"}
          </div>
        </div>
      </div>

      {data.recent.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[360px] text-left text-[12px]">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="py-1.5 pr-3 font-medium">Day</th>
                <th className="py-1.5 pr-3 font-medium">People</th>
                <th className="py-1.5 pr-3 font-medium">Hours</th>
                <th className="py-1.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.slice(0, 4).map((d) => (
                <tr key={d.date} className="border-b border-line/60">
                  <td className="py-1.5 pr-3 tabular-nums text-ink">
                    {formatDateShort(d.date)}
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums text-muted">
                    {d.trackedPeople}/{d.expectedPeople}
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums text-muted">
                    {hours(d.trackedHours)}
                  </td>
                  <td className="py-1.5">
                    <span
                      className={
                        d.complete
                          ? "text-[color:var(--color-positive)]"
                          : d.trackedPeople > 0
                            ? "text-[color:var(--color-review)]"
                            : "text-muted"
                      }
                    >
                      {d.complete
                        ? "Complete"
                        : d.trackedPeople > 0
                          ? "Partial"
                          : "Empty"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Panel>
  );
}

function Stat({
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

function StatHours({
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
        {value.toLocaleString(undefined, {
          maximumFractionDigits: 1,
          minimumFractionDigits: 0,
        })}
      </div>
    </div>
  );
}
