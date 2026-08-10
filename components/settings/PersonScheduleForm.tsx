"use client";

import { useActionState, useState } from "react";
import type { ActionResult } from "@/app/settings/actions";
import type { EmployeeSchedule } from "@/lib/types";

type SaveAction = (fd: FormData) => Promise<ActionResult>;

const WEEKDAYS = [
  { key: "monday", label: "Mon" },
  { key: "tuesday", label: "Tue" },
  { key: "wednesday", label: "Wed" },
  { key: "thursday", label: "Thu" },
  { key: "friday", label: "Fri" },
] as const;

type WeekdayKey = (typeof WEEKDAYS)[number]["key"];

/**
 * One permanent work-schedule config per person — not a list of entries.
 * Saves upsert against the person's current schedule row.
 */
export function PersonScheduleForm({
  person,
  active,
  schedule,
  saveAction,
}: {
  person: string;
  active: boolean;
  schedule: EmployeeSchedule | null;
  saveAction: SaveAction;
}) {
  const [days, setDays] = useState<Record<WeekdayKey, boolean>>(() => ({
    monday: schedule?.monday ?? true,
    tuesday: schedule?.tuesday ?? true,
    wednesday: schedule?.wednesday ?? true,
    thursday: schedule?.thursday ?? true,
    friday: schedule?.friday ?? true,
  }));
  const [includeInKpi, setIncludeInKpi] = useState(
    active ? (schedule?.include_in_operations_kpi ?? true) : false
  );

  const [saveState, save, saving] = useActionState(
    async (_p: ActionResult | null, fd: FormData) => {
      // Reflect controlled toggles into FormData (unchecked boxes are omitted).
      for (const { key } of WEEKDAYS) {
        if (days[key]) fd.set(key, "on");
        else fd.delete(key);
      }
      if (active && includeInKpi) fd.set("include_in_operations_kpi", "on");
      else fd.delete("include_in_operations_kpi");
      return saveAction(fd);
    },
    null
  );

  const error = saveState?.error;
  const saved = saveState?.ok === true;

  function toggleDay(key: WeekdayKey) {
    setDays((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <form action={save} className="px-5 py-5">
      {schedule ? <input type="hidden" name="id" value={schedule.id} /> : null}
      <input type="hidden" name="person" value={person} />

      <div className="space-y-5">
        <div>
          <div className="lh-meta-label">Workdays</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {WEEKDAYS.map(({ key, label }) => {
              const on = days[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleDay(key)}
                  aria-pressed={on}
                  className={`h-8 min-w-12 rounded-md px-3 text-[13px] font-medium transition-colors ${
                    on
                      ? "bg-brand text-white"
                      : "bg-tint text-muted hover:text-ink"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
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
                defaultValue={
                  schedule?.daily_goal != null ? String(schedule.daily_goal) : "6.5"
                }
                className="h-9 w-[88px] rounded-md border border-line bg-card px-2.5 text-[13px] text-ink outline-none transition-colors hover:border-[#b8c7d6] focus:border-brand-600 focus:ring-3 focus:ring-brand-600/15"
              />
              <span className="text-[13px] text-muted">hours / day</span>
            </div>
          </label>

          {active ? (
            <div className="flex items-center gap-2.5 pb-1.5">
              <button
                type="button"
                role="switch"
                aria-checked={includeInKpi}
                onClick={() => setIncludeInKpi((v) => !v)}
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                  includeInKpi ? "bg-brand" : "bg-line"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                    includeInKpi ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
              <span className="text-[13px] font-medium text-ink">
                Include in Operations KPI
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-line pt-4">
          {saved ? (
            <span className="text-[12px] font-medium text-positive">Saved</span>
          ) : null}
          {error ? (
            <span className="text-[12px] text-serious">{error}</span>
          ) : null}
          <button
            type="submit"
            disabled={saving}
            className="h-9 rounded-md bg-brand px-4 text-[13px] font-medium text-white hover:bg-navy disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </form>
  );
}
