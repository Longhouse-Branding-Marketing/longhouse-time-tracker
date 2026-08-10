import type { EntryRow, PersonDailyTracking } from "./types";
import type { Filters } from "./filtering";
import { formatClockHourShort, n } from "./formatters";

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const pctOf = (part: number, whole: number) =>
  whole > 0 ? Math.round((100 * part) / whole) : 0;

export interface Summary {
  trackedHours: number;
  entries: number;
  people: number;
  billablePct: number;
  nonBillablePct: number;
}

export function computeSummary(rows: EntryRow[]): Summary {
  let hours = 0;
  let billable = 0;
  const people = new Set<string>();
  for (const row of rows) {
    const h = n(row.hours);
    hours += h;
    if (row.is_billable) billable += h;
    people.add(row.person);
  }
  return {
    trackedHours: r1(hours),
    entries: rows.length,
    people: people.size,
    billablePct: pctOf(billable, hours),
    nonBillablePct: hours > 0 ? 100 - pctOf(billable, hours) : 0,
  };
}

/**
 * Average hours per counted working day for the current filter scope.
 *
 * Mirrors `v_operations_kpi`: only days flagged `counted_working_day` count
 * (scheduled workdays minus holidays / time-off). When department/role/task/
 * type filters are active, both numerator and denominator use only counted
 * days that have filtered hours > 0.
 */
export function computeWorkingDayAvg(
  rows: EntryRow[],
  daily: PersonDailyTracking[],
  filters: Filters,
  eligiblePeople: Iterable<string>
): number {
  const hasDimFilters =
    filters.departments.length > 0 ||
    filters.roles.length > 0 ||
    filters.tasks.length > 0 ||
    filters.types.length > 0;

  let people: Set<string>;
  if (filters.people.length > 0) {
    people = new Set(filters.people);
  } else if (hasDimFilters) {
    people = new Set(rows.map((r) => r.person));
  } else {
    people = new Set(eligiblePeople);
  }

  if (people.size === 0) return 0;

  let hoursByPersonDate: Map<string, number> | null = null;
  if (hasDimFilters) {
    hoursByPersonDate = new Map();
    for (const row of rows) {
      if (!people.has(row.person)) continue;
      const key = `${row.person}\0${row.date}`;
      hoursByPersonDate.set(key, (hoursByPersonDate.get(key) ?? 0) + n(row.hours));
    }
  }

  let countedHours = 0;
  let countedDays = 0;
  for (const day of daily) {
    if (!people.has(day.person)) continue;
    if (filters.from && day.date < filters.from) continue;
    if (filters.to && day.date > filters.to) continue;
    if (!day.counted_working_day) continue;

    if (hoursByPersonDate) {
      const dayHours = hoursByPersonDate.get(`${day.person}\0${day.date}`) ?? 0;
      if (dayHours <= 0) continue;
      countedDays += 1;
      countedHours += dayHours;
    } else {
      countedDays += 1;
      countedHours += n(day.tracked_hours);
    }
  }

  return countedDays > 0 ? countedHours / countedDays : 0;
}

/** Label for the working-day average StatCard based on the people filter. */
export function workingDayAvgLabel(filters: Filters): string {
  if (filters.people.length === 1) {
    return `${filters.people[0]} Avg / Working Day`;
  }
  return "Team Avg / Working Day";
}

// --- Time series -----------------------------------------------------------

export type Granularity = "day" | "week" | "month";

/** Pick a bucket size that follows the selected zoom (date-range span). */
export function chooseGranularity(from: string, to: string): Granularity {
  if (!from || !to) return "month";
  const days =
    (new Date(`${to}T00:00:00`).getTime() -
      new Date(`${from}T00:00:00`).getTime()) /
    86_400_000;
  if (days <= 31) return "day";
  if (days <= 180) return "week";
  return "month";
}

function bucketKey(date: string, g: Granularity): string {
  if (g === "month") return date.slice(0, 7); // YYYY-MM
  if (g === "day") return date; // YYYY-MM-DD
  // Week: Monday-start key.
  const d = new Date(`${date}T00:00:00`);
  const day = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function addMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Every bucket from `from` through `to` — zero-filled for even chart spacing. */
function bucketRange(from: string, to: string, g: Granularity): string[] {
  if (!from || !to) return [];
  const keys: string[] = [];

  if (g === "day") {
    let cur = from;
    while (cur <= to) {
      keys.push(cur);
      cur = addDays(cur, 1);
    }
    return keys;
  }

  if (g === "week") {
    let cur = bucketKey(from, "week");
    const end = bucketKey(to, "week");
    while (cur <= end) {
      keys.push(cur);
      cur = addDays(cur, 7);
    }
    return keys;
  }

  let cur = from.slice(0, 7);
  const end = to.slice(0, 7);
  while (cur <= end) {
    keys.push(cur);
    cur = addMonth(cur);
  }
  return keys;
}

export interface TimePoint {
  key: string;
  hours: number;
}

export function computeTimeSeries(
  rows: EntryRow[],
  g: Granularity,
  from?: string,
  to?: string
): TimePoint[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const k = bucketKey(row.date, g);
    map.set(k, (map.get(k) ?? 0) + n(row.hours));
  }

  const keys =
    from && to ? bucketRange(from, to, g) : Array.from(map.keys()).sort();

  if (keys.length === 0) {
    return Array.from(map.entries())
      .map(([key, hours]) => ({ key, hours: r1(hours) }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  return keys.map((key) => ({ key, hours: r1(map.get(key) ?? 0) }));
}

export const WEEKDAY_KEYS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

export type WeekDayCluster = {
  key: string; // Monday of the week
  hours: number;
  mon: number;
  tue: number;
  wed: number;
  thu: number;
  fri: number;
  sat: number;
  sun: number;
};

/** Hours per weekday (Mon–Sun) inside each week bucket for grouped bars. */
export function computeWeekDayClusters(
  rows: EntryRow[],
  from?: string,
  to?: string
): WeekDayCluster[] {
  const weeks =
    from && to
      ? bucketRange(from, to, "week")
      : [
          ...new Set(
            rows.map((r) => bucketKey(r.date, "week")).filter(Boolean)
          ),
        ].sort();

  const byWeek = new Map<string, number[]>();
  for (const week of weeks) {
    byWeek.set(week, [0, 0, 0, 0, 0, 0, 0]);
  }

  for (const row of rows) {
    if (from && row.date < from) continue;
    if (to && row.date > to) continue;
    const week = bucketKey(row.date, "week");
    const days = byWeek.get(week) ?? [0, 0, 0, 0, 0, 0, 0];
    const dow = (new Date(`${row.date}T00:00:00`).getDay() + 6) % 7; // Mon=0
    days[dow] += n(row.hours);
    byWeek.set(week, days);
  }

  return weeks.map((key) => {
    const days = byWeek.get(key) ?? [0, 0, 0, 0, 0, 0, 0];
    const rounded = days.map((h) => r1(h));
    const hours = r1(rounded.reduce((a, b) => a + b, 0));
    return {
      key,
      hours,
      mon: rounded[0],
      tue: rounded[1],
      wed: rounded[2],
      thu: rounded[3],
      fri: rounded[4],
      sat: rounded[5],
      sun: rounded[6],
    };
  });
}

export type HourPoint = {
  key: string; // "0".."23"
  hour: number;
  label: string;
  hours: number;
};

/** Parse "9:45 a.m." / "14:30" → minutes from midnight. */
function parseClockToMinutes(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;

  const ampm = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)$/i);
  if (ampm) {
    let h = Number(ampm[1]);
    const m = Number(ampm[2] ?? 0);
    const meridiem = ampm[3].replace(/\./g, "");
    if (Number.isNaN(h) || Number.isNaN(m) || h > 12) return null;
    if (meridiem.startsWith("p") && h < 12) h += 12;
    if (meridiem.startsWith("a") && h === 12) h = 0;
    return h * 60 + m;
  }

  const hm = s.match(/^(\d{1,2}):(\d{2})$/);
  if (hm) {
    const h = Number(hm[1]);
    const m = Number(hm[2]);
    if (Number.isNaN(h) || Number.isNaN(m) || h > 23 || m > 59) return null;
    return h * 60 + m;
  }

  return null;
}

/**
 * Split a Memtime time range across clock-hour slots.
 * Returns null if the range cannot be parsed.
 */
export function allocateRangeToHours(
  range: string | null | undefined,
  totalHours: number
): number[] | null {
  if (!range || totalHours <= 0) return null;
  const parts = range.split(/\s*[-–—]\s*/);
  if (parts.length < 2) return null;
  const start = parseClockToMinutes(parts[0]);
  let end = parseClockToMinutes(parts[1]);
  if (start == null || end == null) return null;
  if (end <= start) end += 24 * 60; // overnight

  const slots = Array.from({ length: 24 }, () => 0);
  const duration = end - start;
  if (duration <= 0) return null;

  let cursor = start;
  while (cursor < end) {
    const hourStart = Math.floor(cursor / 60) * 60;
    const nextBoundary = Math.min(hourStart + 60, end);
    const mins = nextBoundary - cursor;
    const hour = Math.floor(cursor / 60) % 24;
    slots[hour] += (mins / duration) * totalHours;
    cursor = nextBoundary;
  }
  return slots;
}

/** Hours inputted per clock hour for a single calendar day. */
export function computeHourlyBreakdown(
  rows: EntryRow[],
  day: string
): { points: HourPoint[]; timedHours: number; untimedHours: number } {
  const slots = Array.from({ length: 24 }, () => 0);
  let timedHours = 0;
  let untimedHours = 0;

  for (const row of rows) {
    if (row.date !== day) continue;
    const h = n(row.hours);
    const allocated = allocateRangeToHours(row.source_time_range, h);
    if (!allocated) {
      untimedHours += h;
      continue;
    }
    timedHours += h;
    for (let i = 0; i < 24; i++) slots[i] += allocated[i];
  }

  const points = slots.map((hours, hour) => ({
    key: String(hour),
    hour,
    label: formatClockHourShort(hour),
    hours: r1(hours),
  }));

  return {
    points,
    timedHours: r1(timedHours),
    untimedHours: r1(untimedHours),
  };
}

export const MONTH_WEEK_KEYS = [
  "w1",
  "w2",
  "w3",
  "w4",
  "w5",
  "w6",
] as const;
export type MonthWeekKey = (typeof MONTH_WEEK_KEYS)[number];

export type MonthWeekCluster = {
  key: string; // YYYY-MM
  hours: number;
  w1: number;
  w2: number;
  w3: number;
  w4: number;
  w5: number;
  w6: number;
  /** Monday ISO date for each week slot (null if unused). */
  weekKeys: (string | null)[];
};

function lastDayOfMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const d = new Date(y, m, 0); // last day of month m
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Hours per calendar week inside each month bucket (grouped bars), matching
 * the week→day cluster pattern.
 */
export function computeMonthWeekClusters(
  rows: EntryRow[],
  from?: string,
  to?: string
): MonthWeekCluster[] {
  const months =
    from && to
      ? bucketRange(from, to, "month")
      : [
          ...new Set(
            rows.map((r) => bucketKey(r.date, "month")).filter(Boolean)
          ),
        ].sort();

  return months.map((month) => {
    const monthStart = `${month}-01`;
    const monthEnd = lastDayOfMonth(month);
    const rangeStart = from && from > monthStart ? from : monthStart;
    const rangeEnd = to && to < monthEnd ? to : monthEnd;

    const weekMondays: string[] = [];
    if (rangeStart <= rangeEnd) {
      const seen = new Set<string>();
      let cur = rangeStart;
      while (cur <= rangeEnd) {
        const wk = bucketKey(cur, "week");
        if (!seen.has(wk)) {
          seen.add(wk);
          weekMondays.push(wk);
        }
        cur = addDays(cur, 1);
      }
      weekMondays.sort();
    }

    const weekHours = weekMondays.map(() => 0);
    for (const row of rows) {
      if (row.date < rangeStart || row.date > rangeEnd) continue;
      if (bucketKey(row.date, "month") !== month) continue;
      const wk = bucketKey(row.date, "week");
      const idx = weekMondays.indexOf(wk);
      if (idx < 0) continue;
      weekHours[idx] += n(row.hours);
    }

    const slots = MONTH_WEEK_KEYS.map((_, i) => r1(weekHours[i] ?? 0));
    const weekKeys = MONTH_WEEK_KEYS.map((_, i) => weekMondays[i] ?? null);
    const hours = r1(slots.reduce((a, b) => a + b, 0));

    return {
      key: month,
      hours,
      w1: slots[0],
      w2: slots[1],
      w3: slots[2],
      w4: slots[3],
      w5: slots[4],
      w6: slots[5],
      weekKeys,
    };
  });
}

export type PersonHourRow = {
  person: string;
  hours: number;
};

/** People with clock-placed hours in a given hour on a day. */
export function computePeopleForHour(
  rows: EntryRow[],
  day: string,
  hour: number
): PersonHourRow[] {
  const map = new Map<string, number>();
  const h = ((Math.floor(hour) % 24) + 24) % 24;

  for (const row of rows) {
    if (row.date !== day) continue;
    const total = n(row.hours);
    const allocated = allocateRangeToHours(row.source_time_range, total);
    if (!allocated) continue;
    const slice = allocated[h];
    if (slice <= 0) continue;
    map.set(row.person, (map.get(row.person) ?? 0) + slice);
  }

  return Array.from(map.entries())
    .map(([person, hours]) => ({ person, hours: r1(hours) }))
    .sort((a, b) => b.hours - a.hours);
}

// --- Categorical breakdowns ------------------------------------------------

export interface DimensionRow {
  name: string;
  hours: number;
  entries: number;
  people: number;
  billableHours: number;
  nonBillableHours: number;
  billablePct: number;
  avgEntryLength: number;
}

type DimensionKey = "department" | "role" | "task" | "type";

export function computeByDimension(
  rows: EntryRow[],
  key: DimensionKey
): DimensionRow[] {
  const map = new Map<
    string,
    { hours: number; entries: number; billable: number; people: Set<string> }
  >();
  for (const row of rows) {
    const value = row[key];
    if (!value) continue;
    const agg =
      map.get(value) ??
      { hours: 0, entries: 0, billable: 0, people: new Set<string>() };
    const h = n(row.hours);
    agg.hours += h;
    agg.entries += 1;
    if (row.is_billable) agg.billable += h;
    agg.people.add(row.person);
    map.set(value, agg);
  }
  return Array.from(map.entries())
    .map(([name, a]) => ({
      name,
      hours: r1(a.hours),
      entries: a.entries,
      people: a.people.size,
      billableHours: r1(a.billable),
      nonBillableHours: r1(a.hours - a.billable),
      billablePct: pctOf(a.billable, a.hours),
      avgEntryLength: a.entries ? r2(a.hours / a.entries) : 0,
    }))
    .sort((a, b) => b.hours - a.hours);
}

export interface BillableSplit {
  billableHours: number;
  nonBillableHours: number;
  billablePct: number;
}

export function computeBillableSplit(rows: EntryRow[]): BillableSplit {
  let billable = 0;
  let nonBillable = 0;
  for (const row of rows) {
    const h = n(row.hours);
    if (row.is_billable) billable += h;
    else nonBillable += h;
  }
  return {
    billableHours: r1(billable),
    nonBillableHours: r1(nonBillable),
    billablePct: pctOf(billable, billable + nonBillable),
  };
}

// --- Per-person summaries (Home team cards + People list) -------------------

export interface PersonSummary {
  person: string;
  hours: number;
  entries: number;
  billablePct: number;
  nonBillablePct: number;
}

export function computePersonSummaries(rows: EntryRow[]): PersonSummary[] {
  const map = new Map<
    string,
    { hours: number; entries: number; billable: number }
  >();
  for (const row of rows) {
    const agg = map.get(row.person) ?? { hours: 0, entries: 0, billable: 0 };
    const h = n(row.hours);
    agg.hours += h;
    agg.entries += 1;
    if (row.is_billable) agg.billable += h;
    map.set(row.person, agg);
  }
  return Array.from(map.entries())
    .map(([person, a]) => ({
      person,
      hours: r1(a.hours),
      entries: a.entries,
      billablePct: pctOf(a.billable, a.hours),
      nonBillablePct: a.hours > 0 ? 100 - pctOf(a.billable, a.hours) : 0,
    }))
    .sort((a, b) => b.hours - a.hours);
}

// --- Hierarchy for the sunburst (Department -> Role -> Task) ----------------

export interface HierarchyNode {
  name: string;
  value?: number;
  children?: HierarchyNode[];
}

/**
 * Build a Department -> Role -> Task tree of tracked hours for the sunburst.
 * Missing department/role/task fall back to "Unspecified" so every hour is
 * included and the root total matches `computeSummary`. Leaf values keep full
 * precision — round only when formatting for display.
 */
export function computeHierarchy(
  rows: EntryRow[],
  rootName = "All"
): HierarchyNode {
  const depts = new Map<string, Map<string, Map<string, number>>>();
  for (const row of rows) {
    const dept = row.department?.trim() || "Unspecified";
    const role = row.role?.trim() || "Unspecified";
    const task = row.task?.trim() || "Unspecified";
    const roles = depts.get(dept) ?? new Map();
    const tasks = roles.get(role) ?? new Map<string, number>();
    tasks.set(task, (tasks.get(task) ?? 0) + n(row.hours));
    roles.set(role, tasks);
    depts.set(dept, roles);
  }

  const children: HierarchyNode[] = Array.from(depts.entries())
    .map(([dept, roles]) => ({
      name: dept,
      children: Array.from(roles.entries())
        .map(([role, tasks]) => ({
          name: role,
          children: Array.from(tasks.entries())
            .map(([task, hrs]) => ({ name: task, value: hrs }))
            .sort((a, b) => (b.value ?? 0) - (a.value ?? 0)),
        }))
        .sort((a, b) => sumChildren(b) - sumChildren(a)),
    }))
    .sort((a, b) => sumChildren(b) - sumChildren(a));

  return { name: rootName, children };
}

function sumChildren(node: HierarchyNode): number {
  if (node.value != null) return node.value;
  return (node.children ?? []).reduce((acc, c) => acc + sumChildren(c), 0);
}
