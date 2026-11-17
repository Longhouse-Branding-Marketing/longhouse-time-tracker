import type { PersonDailyTracking } from "./types";

/**
 * Work-schedule periods on `employee_schedules`.
 *
 * NULL `effective_start_date` covers the beginning of tracking.
 * NULL `effective_end_date` is the current, open-ended period.
 * A legacy row with both dates NULL still applies to every day — that is how
 * existing schedules were saved, and it stays the open period until a change
 * is logged.
 *
 * `v_person_daily_tracking` resolves the row for a date with the same rules
 * as `scheduleForDate` (later start wins, then newer `created_at`, then id).
 * The current period used for KPI inclusion and context notes follows
 * `currentSchedule` (open-ended first, then the same ordering).
 */

export interface ScheduleWindow {
  id: number;
  effective_start_date: string | null;
  effective_end_date: string | null;
  created_at?: string | null;
}

export interface SchedulePattern {
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
  daily_goal: number | string | null;
  include_in_operations_kpi?: boolean;
  notes?: string | null;
}

export type DatedSchedule = ScheduleWindow & SchedulePattern;

export const WEEKDAY_FIELDS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type WeekdayField = (typeof WEEKDAY_FIELDS)[number];

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string | null | undefined): value is string {
  if (!value || !ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/** Add calendar days to an ISO date. Uses UTC so the result does not drift. */
export function addIsoDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function eachDate(from: string, to: string): string[] {
  const dates: string[] = [];
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) return dates;
  let cursor = from;
  while (cursor <= to) {
    dates.push(cursor);
    cursor = addIsoDays(cursor, 1);
  }
  return dates;
}

/** Monday = monday … Sunday = sunday, matching Postgres `isodow`. */
export function weekdayField(iso: string): WeekdayField {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return WEEKDAY_FIELDS[(dow + 6) % 7];
}

export function isOpenEnded(schedule: {
  effective_end_date: string | null;
}): boolean {
  return schedule.effective_end_date == null;
}

function compareStringDesc(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? 1 : -1;
}

/** Later start dates first. NULL start sorts last (least specific). */
function compareStartDescNullsLast(
  a: string | null,
  b: string | null
): number {
  if (a === b) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return compareStringDesc(a, b);
}

/**
 * Which overlapping row wins on a single date.
 * Later effective start, then newer created_at, then higher id.
 */
export function compareScheduleSpecificity(
  a: ScheduleWindow,
  b: ScheduleWindow
): number {
  const start = compareStartDescNullsLast(
    a.effective_start_date,
    b.effective_start_date
  );
  if (start !== 0) return start;
  const created = compareStringDesc(a.created_at ?? "", b.created_at ?? "");
  if (created !== 0) return created;
  return b.id - a.id;
}

/**
 * Display / "current schedule" order: the open-ended period first, then
 * more recent starts. Matches `v_operations_kpi`'s current_schedule CTE.
 */
export function compareScheduleRecency(
  a: ScheduleWindow,
  b: ScheduleWindow
): number {
  const aOpen = isOpenEnded(a) ? 1 : 0;
  const bOpen = isOpenEnded(b) ? 1 : 0;
  if (aOpen !== bOpen) return bOpen - aOpen;
  return compareScheduleSpecificity(a, b);
}

export function sortSchedules<T extends ScheduleWindow>(
  schedules: readonly T[]
): T[] {
  return schedules.slice().sort(compareScheduleRecency);
}

export function currentSchedule<T extends ScheduleWindow>(
  schedules: readonly T[]
): T | null {
  if (schedules.length === 0) return null;
  return sortSchedules(schedules)[0];
}

export function scheduleCoversDate(
  schedule: Pick<ScheduleWindow, "effective_start_date" | "effective_end_date">,
  date: string
): boolean {
  if (schedule.effective_start_date && date < schedule.effective_start_date) {
    return false;
  }
  if (schedule.effective_end_date && date > schedule.effective_end_date) {
    return false;
  }
  return true;
}

export function scheduleForDate<T extends ScheduleWindow>(
  schedules: readonly T[],
  date: string
): T | null {
  const matches = schedules.filter((schedule) =>
    scheduleCoversDate(schedule, date)
  );
  if (matches.length === 0) return null;
  matches.sort(compareScheduleSpecificity);
  return matches[0];
}

function rangesOverlap(
  a: Pick<ScheduleWindow, "effective_start_date" | "effective_end_date">,
  b: Pick<ScheduleWindow, "effective_start_date" | "effective_end_date">
): boolean {
  const aStart = a.effective_start_date ?? "0001-01-01";
  const aEnd = a.effective_end_date ?? "9999-12-31";
  const bStart = b.effective_start_date ?? "0001-01-01";
  const bEnd = b.effective_end_date ?? "9999-12-31";
  return aStart <= bEnd && bStart <= aEnd;
}

/**
 * Reject a period that ends before it starts or overlaps another one.
 * Callers omit the row being edited from `others`.
 */
export function validateScheduleWindow(
  candidate: Pick<ScheduleWindow, "effective_start_date" | "effective_end_date">,
  others: readonly Pick<
    ScheduleWindow,
    "effective_start_date" | "effective_end_date"
  >[]
): string | null {
  const start = candidate.effective_start_date;
  const end = candidate.effective_end_date;
  if (start != null && !isIsoDate(start)) return "Start date is not a real date.";
  if (end != null && !isIsoDate(end)) return "End date is not a real date.";
  if (start && end && end < start) {
    return "End date must be on or after the start date.";
  }
  if (others.some((other) => rangesOverlap(candidate, other))) {
    return "That date range overlaps another schedule. Adjust the dates so each day belongs to one period.";
  }
  return null;
}

export type ScheduleChangePlan =
  | {
      ok: true;
      mode: "insert" | "update";
      /** Set when a row already starts on this date and an earlier period is still open. */
      updateId: number | null;
      /** Open periods to close on `closeEnd` (the day before the new start). */
      closeIds: number[];
      closeEnd: string;
    }
  | { ok: false; error: string };

/**
 * Plan a new open-ended period starting on `start`.
 * Earlier open periods are closed the day before. Their weekdays are not
 * rewritten — that is what keeps historical averages stable.
 *
 * If a previous attempt already inserted the new row but failed to close the
 * prior period, a second save updates that row and finishes the close.
 */
export function planScheduleChange(
  existing: readonly ScheduleWindow[],
  start: string | null
): ScheduleChangePlan {
  if (!isIsoDate(start)) {
    return { ok: false, error: "Choose the date this schedule starts." };
  }

  const closeEnd = addIsoDays(start, -1);
  const exact =
    existing.find((schedule) => schedule.effective_start_date === start) ??
    null;

  let updateId: number | null = null;
  if (exact) {
    if (exact.effective_end_date != null) {
      return {
        ok: false,
        error:
          "A schedule already starts on that date. Edit that period, or pick a different start date.",
      };
    }
    const earlierOpen = existing.filter(
      (schedule) =>
        schedule.id !== exact.id &&
        schedule.effective_end_date == null &&
        (schedule.effective_start_date == null ||
          schedule.effective_start_date < start)
    );
    if (earlierOpen.length === 0) {
      return {
        ok: false,
        error:
          "The current schedule already starts on that date. Pick a later date, or apply the edit to this period.",
      };
    }
    updateId = exact.id;
  }

  const toClose = existing.filter((schedule) => {
    if (updateId != null && schedule.id === updateId) return false;
    if (schedule.effective_end_date != null) return false;
    if (schedule.effective_start_date && schedule.effective_start_date >= start) {
      return false;
    }
    return true;
  });

  for (const schedule of toClose) {
    if (
      schedule.effective_start_date &&
      schedule.effective_start_date > closeEnd
    ) {
      return {
        ok: false,
        error:
          "That date is too soon after the current schedule starts. Pick a later date, or edit the current period.",
      };
    }
  }

  const nextWindow = {
    effective_start_date: start,
    effective_end_date: null as string | null,
  };
  const ignore = new Set<number>(toClose.map((schedule) => schedule.id));
  if (updateId != null) ignore.add(updateId);
  const blocked = existing.some(
    (schedule) => !ignore.has(schedule.id) && rangesOverlap(nextWindow, schedule)
  );
  if (blocked) {
    return {
      ok: false,
      error:
        "That date falls inside an existing schedule period. Edit that period instead.",
    };
  }

  return {
    ok: true,
    mode: updateId != null ? "update" : "insert",
    updateId,
    closeIds: toClose.map((schedule) => schedule.id),
    closeEnd,
  };
}

export type ScheduleDeletePlan =
  | {
      ok: true;
      /**
       * When the deleted row is the current period and the previous one ends
       * the day before it, reopen that previous period so the timeline stays
       * continuous. `previousEnd` is restored if the delete itself fails.
       */
      reopen: { id: number; previousEnd: string } | null;
    }
  | { ok: false; error: string };

export function planScheduleDelete(
  existing: readonly ScheduleWindow[],
  id: number
): ScheduleDeletePlan {
  const target = existing.find((schedule) => schedule.id === id);
  if (!target) return { ok: false, error: "Schedule not found." };

  // Only an open period with a real start has a predecessor we can reopen.
  // Deleting the original "since the beginning" row leaves other periods as they are.
  if (target.effective_end_date != null || !target.effective_start_date) {
    return { ok: true, reopen: null };
  }

  const previousEnd = addIsoDays(target.effective_start_date, -1);
  const predecessor = existing.find(
    (schedule) =>
      schedule.id !== id && schedule.effective_end_date === previousEnd
  );
  if (!predecessor) return { ok: true, reopen: null };

  const reopened = { ...predecessor, effective_end_date: null };
  const others = existing.filter(
    (schedule) => schedule.id !== id && schedule.id !== predecessor.id
  );
  if (others.some((schedule) => rangesOverlap(reopened, schedule))) {
    return { ok: true, reopen: null };
  }

  return { ok: true, reopen: { id: predecessor.id, previousEnd } };
}

function isExcludingTimeOff(
  date: string,
  timeOff: readonly {
    start_date: string;
    end_date: string;
    counts_as_working_day?: boolean;
  }[]
): boolean {
  return timeOff.some(
    (entry) =>
      entry.counts_as_working_day !== true &&
      date >= entry.start_date &&
      date <= entry.end_date
  );
}

/**
 * Replace schedule-dependent fields on daily rows with the period that covers
 * each date. Holiday and time-off flags stay as loaded (they do not depend on
 * which schedule was current). Safe to run on top of either the legacy view,
 * which applied only the newest schedule, or the period-aware view.
 */
export function applyScheduleHistory<T extends PersonDailyTracking>(
  daily: readonly T[],
  schedules: readonly (DatedSchedule & { person: string })[]
): T[] {
  if (daily.length === 0 || schedules.length === 0) return daily.slice();

  const byPerson = new Map<string, (DatedSchedule & { person: string })[]>();
  for (const schedule of schedules) {
    const list = byPerson.get(schedule.person);
    if (list) list.push(schedule);
    else byPerson.set(schedule.person, [schedule]);
  }

  return daily.map((day) => {
    const periods = byPerson.get(day.person);
    if (!periods || periods.length === 0) return day;

    const schedule = scheduleForDate(periods, day.date);
    if (!schedule) {
      return {
        ...day,
        daily_goal: 0,
        scheduled_to_work: false,
        counted_working_day: false,
      };
    }

    const scheduled = Boolean(schedule[weekdayField(day.date)]);
    const blocked = day.is_stat_holiday === true || day.is_time_off === true;
    return {
      ...day,
      daily_goal: schedule.daily_goal ?? 0,
      include_in_operations_kpi:
        schedule.include_in_operations_kpi ?? day.include_in_operations_kpi,
      scheduled_to_work: scheduled,
      counted_working_day: scheduled && !blocked,
    };
  });
}

/**
 * Mirror of `v_person_daily_tracking` for tests and for explaining which
 * days a schedule history would count. Production averages read the view,
 * then `applyScheduleHistory` applies the same schedule rules in the app.
 */
export function previewCountedDays(input: {
  person: string;
  from: string;
  to: string;
  schedules: readonly DatedSchedule[];
  hoursByDate?: Readonly<Record<string, number>>;
  /** Holidays that do not count as working days (`counts_as_working_day = false`). */
  statHolidays?: ReadonlySet<string>;
  timeOff?: readonly {
    start_date: string;
    end_date: string;
    counts_as_working_day?: boolean;
  }[];
}): PersonDailyTracking[] {
  const holidays = input.statHolidays ?? new Set<string>();
  const timeOff = input.timeOff ?? [];
  const hoursByDate = input.hoursByDate ?? {};

  return eachDate(input.from, input.to).map((date) => {
    const schedule = scheduleForDate(input.schedules, date);
    const scheduled = schedule ? Boolean(schedule[weekdayField(date)]) : false;
    const isStatHoliday = holidays.has(date);
    const isTimeOff = isExcludingTimeOff(date, timeOff);
    const tracked = hoursByDate[date] ?? 0;
    return {
      person: input.person,
      date,
      tracked_hours: tracked,
      daily_goal: schedule?.daily_goal ?? 0,
      include_in_operations_kpi: schedule?.include_in_operations_kpi ?? false,
      scheduled_to_work: scheduled,
      is_stat_holiday: isStatHoliday,
      is_time_off: isTimeOff,
      context: null,
      counted_working_day: scheduled && !isStatHoliday && !isTimeOff,
    };
  });
}
