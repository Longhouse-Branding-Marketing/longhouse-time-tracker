"use client";

import { startTransition, useActionState, useRef, useState } from "react";
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

function initialChangeStart(schedule: EmployeeSchedule | null): string {
  const today = todayIso();
  if (!schedule?.effective_start_date) return today;
  const min = addIsoDays(schedule.effective_start_date, 1);
  return min > today ? min : today;
}

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
  if (!start && !end) return "Since the beginning";
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
 * Current work schedule plus the dated periods behind it.
 * Changing days logs a new period by default so earlier averages keep the
 * schedule that was in effect. "Apply to this period" rewrites the open row.
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
  const [days, setDays] = useState<Record<WeekdayKey, boolean>>(() =>
    daysFrom(schedule)
  );
  const [dailyGoal, setDailyGoal] = useState(
    schedule?.daily_goal != null ? String(schedule.daily_goal) : "6.5"
  );
  const [changeStart, setChangeStart] = useState(() =>
    initialChangeStart(schedule)
  );
  const [includeInKpi, setIncludeInKpi] = useState(
    active ? (schedule?.include_in_operations_kpi ?? true) : false
  );
  const [editingId, setEditingId] = useState<number | null>(null);
  const intentRef = useRef<"create" | "correct" | "change">("correct");

  const goalNumber = dailyGoal.trim() === "" ? 6.5 : Number(dailyGoal);
  const savedGoal = Number(schedule?.daily_goal ?? 6.5);
  const patternDirty = schedule
    ? WEEKDAYS.some(({ key }) => days[key] !== Boolean(schedule[key])) ||
      goalNumber !== savedGoal
    : false;

  const [saveState, save, saving] = useActionState(
    async (_previous: ActionResult | null, fd: FormData) => {
      writeDays(fd, days);
      writeKpi(fd, active, includeInKpi);
      if (!fd.get("intent")) fd.set("intent", intentRef.current);
      return saveAction(fd);
    },
    null
  );

  const error = saveState?.error;
  const saved = saveState?.ok === true;
  const editing = ordered.find((row) => row.id === editingId) ?? null;

  function toggleDay(key: WeekdayKey) {
    setDays((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div>
      <form action={save} className="px-5 py-5">
        {schedule ? <input type="hidden" name="id" value={schedule.id} /> : null}
        <input type="hidden" name="person" value={person} />

        <div className="space-y-5">
          <p className="text-[13px] text-muted">
            {schedule
              ? `Current period · ${periodLabel(schedule)}`
              : "No schedule yet. The first save applies to every tracked day until you log a change."}
          </p>

          <div>
            <div className="lh-meta-label">Workdays</div>
            <WeekdayToggles days={days} onToggle={toggleDay} />
          </div>

          <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
            <label className="flex flex-col gap-1.5">
              <span className="lh-meta-label">Daily goal</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  name="daily_goal"
                  step="0.5"
                  min="0"
                  value={dailyGoal}
                  onChange={(event) => setDailyGoal(event.target.value)}
                  className="h-9 w-[88px] rounded-md border border-line bg-card px-2.5 text-[13px] text-ink outline-none transition-colors hover:border-[#b8c7d6] focus:border-brand-600 focus:ring-3 focus:ring-brand-600/15"
                />
                <span className="text-[13px] text-muted">hours / day</span>
              </div>
            </label>

            {active ? (
              <KpiSwitch checked={includeInKpi} onChange={setIncludeInKpi} />
            ) : null}
          </div>

          {patternDirty && schedule ? (
            <div className="rounded-md bg-tint px-3 py-3">
              <label className="flex flex-col gap-1.5">
                <span className="lh-meta-label">Change starts</span>
                <input
                  type="date"
                  name="effective_start_date"
                  value={changeStart}
                  onChange={(event) => setChangeStart(event.target.value)}
                  className={`${inputClass} max-w-[180px]`}
                />
              </label>
              <p className="mt-2 text-[12px] leading-relaxed text-muted">
                Days before this date keep the current schedule, so earlier
                averages stay the same. Apply to this period only when these
                days should replace the whole current period.
              </p>
            </div>
          ) : (
            <p className="text-[12px] leading-relaxed text-muted">
              {schedule
                ? "Change the workdays or daily goal to log a new period. Earlier averages keep the schedule that was in effect."
                : "Later changes are logged as new periods and do not rewrite this one."}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
            {saved && !patternDirty ? (
              <span className="order-0 mr-auto text-[12px] font-medium text-positive">
                Saved
              </span>
            ) : null}
            {error ? (
              <span className="order-0 mr-auto text-[12px] text-serious">{error}</span>
            ) : null}
            <button
              type="submit"
              name="intent"
              value={schedule ? (patternDirty ? "change" : "correct") : "create"}
              disabled={saving || (patternDirty && !changeStart)}
              onClick={() => {
                intentRef.current = schedule
                  ? patternDirty
                    ? "change"
                    : "correct"
                  : "create";
              }}
              className="order-2 h-9 rounded-md bg-brand px-4 text-[13px] font-medium text-white hover:bg-navy disabled:opacity-50"
            >
              {saving
                ? "Saving…"
                : patternDirty && schedule
                  ? "Log change"
                  : "Save"}
            </button>
            {patternDirty && schedule ? (
              <button
                type="submit"
                name="intent"
                value="correct"
                disabled={saving}
                onClick={(event) => {
                  intentRef.current = "correct";
                  const range = periodLabel(schedule);
                  if (
                    !window.confirm(
                      `Apply these days to this period (${range})? Averages inside this period will use the new days. Log a change instead if earlier days should keep the previous schedule.`
                    )
                  ) {
                    event.preventDefault();
                  }
                }}
                className="order-1 h-9 rounded-md border border-line px-3 text-[13px] font-medium text-muted hover:bg-tint disabled:opacity-50"
              >
                Apply to this period
              </button>
            ) : null}
          </div>
        </div>
      </form>

      {ordered.length > 0 ? (
        <div className="border-t border-line">
          <div className="px-5 py-3">
            <div className="lh-meta-label">Schedule history</div>
            <p className="mt-1 text-[12px] text-muted">
              Averages use the schedule that was in effect on each day.
            </p>
          </div>
          <div className="lh-scroll overflow-x-auto">
            <table className="lh-table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Days</th>
                  <th>Daily goal</th>
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
        </div>
      ) : null}

      {editing ? (
        <EditModal
          title={schedule?.id === editing.id ? "Edit current schedule" : "Edit schedule period"}
          onClose={() => setEditingId(null)}
        >
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
  entry: EmployeeSchedule;
  isCurrent: boolean;
  schedules: EmployeeSchedule[];
  saveAction: SaveAction;
  deleteAction: SaveAction;
  onDone: () => void;
}) {
  const [days, setDays] = useState<Record<WeekdayKey, boolean>>(() =>
    daysFrom(entry)
  );
  const [includeInKpi, setIncludeInKpi] = useState(
    active ? entry.include_in_operations_kpi : false
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
      <input type="hidden" name="id" value={entry.id} />
      <input type="hidden" name="person" value={person} />
      <input type="hidden" name="intent" value="correct" />
      <input type="hidden" name="dates_present" value="1" />
      <input type="hidden" name="notes_present" value="1" />

      <div className="space-y-4">
        {isCurrent ? (
          <p className="text-[12px] leading-relaxed text-muted">
            This is the current period ({periodLabel(entry)}). Changing days
            here updates every day in this period. Log a new change from the
            schedule form if the new pattern should start later.
          </p>
        ) : (
          <p className="text-[12px] leading-relaxed text-muted">
            Edits apply only to this period. Other periods, including the
            current schedule, stay as they are.
          </p>
        )}

        <div>
          <div className="lh-meta-label">Workdays</div>
          <WeekdayToggles
            days={days}
            onToggle={(key) => setDays((prev) => ({ ...prev, [key]: !prev[key] }))}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="lh-meta-label">Starts</span>
            <input
              type="date"
              name="effective_start_date"
              defaultValue={entry.effective_start_date ?? ""}
              className={inputClass}
            />
            <span className="text-[12px] text-muted">Blank means the beginning of tracking.</span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="lh-meta-label">Ends</span>
            <input
              type="date"
              name="effective_end_date"
              defaultValue={entry.effective_end_date ?? ""}
              className={inputClass}
            />
            <span className="text-[12px] text-muted">Blank means this period is current.</span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="lh-meta-label">Daily goal</span>
            <input
              type="number"
              name="daily_goal"
              step="0.5"
              min="0"
              required
              defaultValue={
                entry.daily_goal != null ? String(entry.daily_goal) : "6.5"
              }
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="lh-meta-label">Notes</span>
            <input
              type="text"
              name="notes"
              defaultValue={entry.notes ?? ""}
              className={inputClass}
            />
          </label>
        </div>

        {active && isCurrent ? (
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
          disabled={saving}
          className="h-8 rounded-md bg-brand px-3 text-[13px] font-medium text-white hover:bg-navy disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
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
      </div>
    </form>
  );
}
