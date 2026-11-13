"use client";

import { startTransition, useActionState, useState } from "react";
import type { ActionResult } from "@/app/settings/actions";
import { Badge } from "@/components/ui";
import { formatDate } from "@/lib/formatters";
import { addIsoDays, currentSchedule, sortSchedules } from "@/lib/schedules";
import type { EmployeeSchedule, Num } from "@/lib/types";
import { EditModal } from "./EditModal";

type SaveAction = (fd: FormData) => Promise<ActionResult>;

const WEEKDAYS = [
  { key: "monday", label: "Mon" },
  { key: "tuesday", label: "Tue" },
  { key: "wednesday", label: "Wed" },
  { key: "thursday", label: "Thu" },
  { key: "friday", label: "Fri" },
  { key: "saturday", label: "Sat" },
  { key: "sunday", label: "Sun" },
] as const;

type WeekdayKey = (typeof WEEKDAYS)[number]["key"];

const inputClass =
  "h-9 w-full rounded-md border border-line bg-card px-2.5 text-[13px] text-ink outline-none transition-colors hover:border-[#b8c7d6] focus:border-brand-600 focus:ring-3 focus:ring-brand-600/15";

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function daysFrom(schedule: EmployeeSchedule | null): Record<WeekdayKey, boolean> {
  return {
    monday: schedule?.monday ?? true,
    tuesday: schedule?.tuesday ?? true,
    wednesday: schedule?.wednesday ?? true,
    thursday: schedule?.thursday ?? true,
    friday: schedule?.friday ?? true,
    saturday: schedule?.saturday ?? false,
    sunday: schedule?.sunday ?? false,
  };
}

function writeDays(fd: FormData, days: Record<WeekdayKey, boolean>) {
  for (const { key } of WEEKDAYS) {
    if (days[key]) fd.set(key, "on");
    else fd.delete(key);
  }
}

function writeKpi(fd: FormData, active: boolean, include: boolean) {
  if (active && include) fd.set("include_in_operations_kpi", "on");
  else fd.delete("include_in_operations_kpi");
}

export function scheduleFormKey(
  person: string,
  active: boolean,
  schedules: EmployeeSchedule[]
): string {
  const body = schedules
    .map((schedule) =>
      [
        schedule.id,
        schedule.effective_start_date ?? "",
        schedule.effective_end_date ?? "",
        schedule.daily_goal ?? "",
        schedule.monday ? 1 : 0,
        schedule.tuesday ? 1 : 0,
        schedule.wednesday ? 1 : 0,
        schedule.thursday ? 1 : 0,
        schedule.friday ? 1 : 0,
        schedule.saturday ? 1 : 0,
        schedule.sunday ? 1 : 0,
        schedule.include_in_operations_kpi ? 1 : 0,
        schedule.notes ?? "",
      ].join(":")
    )
    .join("|");
  return `${person}:${active ? 1 : 0}:${body}`;
}

function periodLabel(schedule: EmployeeSchedule): string {
  const start = schedule.effective_start_date;
  const end = schedule.effective_end_date;
  if (!start && !end) return "Since the Beginning";
  if (start && !end) return `Since ${formatDate(start)}`;
  if (!start && end) return `Beginning – ${formatDate(end)}`;
  if (start && end) return `${formatDate(start)} – ${formatDate(end)}`;
  return "—";
}

function daysLabel(schedule: EmployeeSchedule): string {
  const on = WEEKDAYS.filter(({ key }) => schedule[key]).map(({ label }) => label);
  return on.length > 0 ? on.join(", ") : "No days";
}

function goalText(value: Num): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return `${num} h`;
}

function WeekdayToggles({
  days,
  onToggle,
}: {
  days: Record<WeekdayKey, boolean>;
  onToggle: (key: WeekdayKey) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {WEEKDAYS.map(({ key, label }) => {
        const on = days[key];
        return (
          <button
            key={key}
            type="button"
            onClick={() => onToggle(key)}
            aria-pressed={on}
            className={`h-8 min-w-12 rounded-md px-3 text-[13px] font-medium transition-colors ${
              on ? "bg-brand text-white" : "bg-tint text-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function KpiSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2.5 pb-1.5">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? "bg-brand" : "bg-line"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
      <span className="text-[13px] font-medium text-ink">
        Include in Operations KPI
      </span>
    </div>
  );
}

/**
 * Schedule History is the only schedule control. Add Schedule starts a new
 * period. Edit changes one existing row.
 */
export function PersonScheduleForm({
  person,
  active,
  schedules,
  saveAction,
  deleteAction,
}: {
  person: string;
  active: boolean;
  schedules: EmployeeSchedule[];
  saveAction: SaveAction;
  deleteAction: SaveAction;
}) {
  const ordered = sortSchedules(schedules);
  const schedule = currentSchedule(ordered);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const editing = ordered.find((row) => row.id === editingId) ?? null;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h2 className="lh-section-title">Schedule History</h2>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-md bg-brand px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-navy"
        >
          Add Schedule
        </button>
      </div>
        {ordered.length > 0 ? (
          <div className="lh-scroll overflow-x-auto">
            <table className="lh-table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Days</th>
                  <th>Daily Goal</th>
                  <th>Notes</th>
                  <th className="w-[1%] text-right"> </th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((row) => {
                  const current = schedule?.id === row.id;
                  return (
                    <tr key={row.id}>
                      <td className="whitespace-nowrap">
                        <span className="inline-flex flex-wrap items-center gap-2">
                          <span className="font-medium text-ink">{periodLabel(row)}</span>
                          {current ? (
                            <Badge tone="info">Current</Badge>
                          ) : row.effective_end_date == null ? (
                            <Badge>Open</Badge>
                          ) : null}
                        </span>
                      </td>
                      <td>{daysLabel(row)}</td>
                      <td className="whitespace-nowrap tabular-nums">
                        {goalText(row.daily_goal)}
                      </td>
                      <td className="max-w-[220px] truncate text-muted">
                        {row.notes || "—"}
                      </td>
                      <td className="text-right">
                        <button
                          type="button"
                          onClick={() => setEditingId(row.id)}
                          className="text-[12px] font-medium text-brand-600 hover:underline"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

      {editing ? (
        <EditModal title="Edit Schedule" onClose={() => setEditingId(null)}>
          <SchedulePeriodForm
            key={editing.id}
            person={person}
            active={active}
            entry={editing}
            isCurrent={schedule?.id === editing.id}
            schedules={ordered}
            saveAction={saveAction}
            deleteAction={deleteAction}
            onDone={() => setEditingId(null)}
          />
        </EditModal>
      ) : null}

      {adding ? (
        <EditModal title="Add Schedule" onClose={() => setAdding(false)}>
          <SchedulePeriodForm
            key="add"
            person={person}
            active={active}
            entry={null}
            isCurrent={false}
            schedules={ordered}
            saveAction={saveAction}
            deleteAction={deleteAction}
            onDone={() => setAdding(false)}
          />
        </EditModal>
      ) : null}
    </div>
  );
}

function SchedulePeriodForm({
  person,
  active,
  entry,
  isCurrent,
  schedules,
  saveAction,
  deleteAction,
  onDone,
}: {
  person: string;
  active: boolean;
  entry: EmployeeSchedule | null;
  isCurrent: boolean;
  schedules: EmployeeSchedule[];
  saveAction: SaveAction;
  deleteAction: SaveAction;
  onDone: () => void;
}) {
  const isNew = entry == null;
  const source = entry ?? currentSchedule(schedules);
  const [days, setDays] = useState<Record<WeekdayKey, boolean>>(() =>
    daysFrom(source)
  );
  const [startDate, setStartDate] = useState(todayIso);
  const [includeInKpi, setIncludeInKpi] = useState(
    active ? (source?.include_in_operations_kpi ?? true) : false
  );

  const [saveState, save, saving] = useActionState(
    async (_previous: ActionResult | null, fd: FormData) => {
      writeDays(fd, days);
      writeKpi(fd, active, includeInKpi);
      const result = await saveAction(fd);
      if (result.ok) onDone();
      return result;
    },
    null
  );
  const [delState, del, deleting] = useActionState(
    async (_previous: ActionResult | null, fd: FormData) => {
      const result = await deleteAction(fd);
      if (result.ok) onDone();
      return result;
    },
    null
  );
  const error = saveState?.error ?? delState?.error;

  return (
    <form action={save} className="px-5 py-4">
      {entry ? <input type="hidden" name="id" value={entry.id} /> : null}
      <input type="hidden" name="person" value={person} />
      <input type="hidden" name="intent" value={isNew ? "change" : "correct"} />
      {entry ? <input type="hidden" name="dates_present" value="1" /> : null}
      <input type="hidden" name="notes_present" value="1" />

      <div className="space-y-4">
        <div>
          <div className="lh-meta-label">Workdays</div>
          <WeekdayToggles
            days={days}
            onToggle={(key) => setDays((prev) => ({ ...prev, [key]: !prev[key] }))}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {isNew ? (
            <label className="flex flex-col gap-1">
              <span className="lh-meta-label">Start Date</span>
              <input
                type="date"
                name="effective_start_date"
                required
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className={inputClass}
              />
            </label>
          ) : (
            <>
              <label className="flex flex-col gap-1">
                <span className="lh-meta-label">Start Date</span>
                <input
                  type="date"
                  name="effective_start_date"
                  defaultValue={entry.effective_start_date ?? ""}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="lh-meta-label">End Date</span>
                <input
                  type="date"
                  name="effective_end_date"
                  defaultValue={entry.effective_end_date ?? ""}
                  className={inputClass}
                />
              </label>
            </>
          )}
          <label className="flex flex-col gap-1">
            <span className="lh-meta-label">Daily Goal</span>
            <input
              type="number"
              name="daily_goal"
              step="0.5"
              min="0"
              required
              defaultValue={
                source?.daily_goal != null ? String(source.daily_goal) : "6.5"
              }
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="lh-meta-label">Notes</span>
            <input
              type="text"
              name="notes"
              defaultValue={entry?.notes ?? ""}
              className={inputClass}
            />
          </label>
        </div>

        {active && (isCurrent || isNew) ? (
          <KpiSwitch checked={includeInKpi} onChange={setIncludeInKpi} />
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
        {error ? (
          <span className="mr-auto text-[12px] text-serious">{error}</span>
        ) : null}
        <button
          type="button"
          onClick={onDone}
          className="h-8 rounded-md border border-line px-2.5 text-[13px] font-medium text-muted hover:bg-tint"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || (isNew && !startDate)}
          className="h-8 rounded-md bg-brand px-3 text-[13px] font-medium text-white hover:bg-navy disabled:opacity-50"
        >
          {saving ? "Saving…" : isNew ? "Add Schedule" : "Save"}
        </button>
        {entry ? (
        <button
          type="button"
          disabled={deleting}
          onClick={(event) => {
            const boundary = entry.effective_start_date
              ? addIsoDays(entry.effective_start_date, -1)
              : null;
            const reopens =
              entry.effective_end_date == null &&
              boundary != null &&
              schedules.some(
                (row) => row.id !== entry.id && row.effective_end_date === boundary
              );
            const message = reopens
              ? "Delete this current period? The previous period becomes the current schedule again."
              : "Delete this schedule period? Days it covered will no longer use it.";
            if (!window.confirm(message)) return;
            const form = event.currentTarget.form;
            if (!form) return;
            startTransition(() => {
              del(new FormData(form));
            });
          }}
          className="h-8 rounded-md border border-line px-2.5 text-[13px] font-medium text-serious hover:bg-serious-soft disabled:opacity-50"
        >
          {deleting ? "…" : "Delete"}
        </button>
        ) : null}
      </div>
    </form>
  );
}
