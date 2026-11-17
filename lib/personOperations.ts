import type { OperationsKpi, PersonDailyTracking } from "./types";
import type { Filters } from "./filtering";

function n(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const num = typeof value === "string" ? parseFloat(value) : value;
  return Number.isFinite(num) ? num : 0;
}

const STRUCTURAL_KPI_STATUSES = new Set([
  "Schedule needed",
  "Not included in current KPI",
  "Context exception",
]);

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface PersonOperationsRow {
  person: string;
  trackedHours: number;
  countedWorkingDays: number;
  avgWorkingDay: number;
  medianActiveDay: number;
  status: string;
  context: string | null;
}

/**
 * Per-person operations KPIs for the current filter scope.
 * Uses the same counted-working-day rules as `computeWorkingDayAvg`.
 * Those flags already follow the schedule in effect on each date, so a later
 * schedule change does not pull earlier days into the average.
 * On track / close / needs review compares the average with the daily goals
 * of the counted days in the filter (the goals that applied then).
 */
export function computePersonOperations(
  rows: Array<{ person: string; date: string; hours: number | string | null }>,
  daily: PersonDailyTracking[],
  filters: Filters,
  kpis: OperationsKpi[]
): PersonOperationsRow[] {
  const hasDimFilters =
    filters.departments.length > 0 ||
    filters.roles.length > 0 ||
    filters.tasks.length > 0 ||
    filters.types.length > 0;

  const kpiByPerson = new Map(kpis.map((k) => [k.person, k]));

  let people: Set<string>;
  if (filters.people.length > 0) {
    people = new Set(filters.people.filter((p) => kpiByPerson.has(p)));
  } else if (hasDimFilters) {
    people = new Set(
      rows.map((r) => r.person).filter((p) => kpiByPerson.has(p))
    );
  } else {
    people = new Set(kpiByPerson.keys());
  }

  const hoursByPerson = new Map<string, number>();
  const hoursByPersonDate = new Map<string, number>();
  for (const row of rows) {
    if (!people.has(row.person)) continue;
    const h = n(row.hours);
    hoursByPerson.set(row.person, (hoursByPerson.get(row.person) ?? 0) + h);
    const key = `${row.person}\0${row.date}`;
    hoursByPersonDate.set(key, (hoursByPersonDate.get(key) ?? 0) + h);
  }

  const countedHours = new Map<string, number>();
  const countedDays = new Map<string, number>();
  const activeDayHours = new Map<string, number[]>();
  const goalSum = new Map<string, number>();

  for (const day of daily) {
    if (!people.has(day.person)) continue;
    if (filters.from && day.date < filters.from) continue;
    if (filters.to && day.date > filters.to) continue;
    if (!day.counted_working_day) continue;

    const dayHours = hasDimFilters
      ? (hoursByPersonDate.get(`${day.person}\0${day.date}`) ?? 0)
      : n(day.tracked_hours);

    if (hasDimFilters && dayHours <= 0) continue;

    countedDays.set(day.person, (countedDays.get(day.person) ?? 0) + 1);
    countedHours.set(
      day.person,
      (countedHours.get(day.person) ?? 0) + dayHours
    );
    goalSum.set(day.person, (goalSum.get(day.person) ?? 0) + n(day.daily_goal));
    if (dayHours > 0) {
      const list = activeDayHours.get(day.person) ?? [];
      list.push(dayHours);
      activeDayHours.set(day.person, list);
    }
  }

  const result: PersonOperationsRow[] = [];
  for (const person of people) {
    const kpi = kpiByPerson.get(person);
    if (!kpi) continue;
    const days = countedDays.get(person) ?? 0;
    const hoursSum = countedHours.get(person) ?? 0;
    const avg = days > 0 ? hoursSum / days : 0;
    const goal = days > 0 ? (goalSum.get(person) ?? 0) / days : 6.5;
    let status = kpi.status;
    if (!STRUCTURAL_KPI_STATUSES.has(status)) {
      if (days === 0) status = "Needs review";
      else if (avg >= goal) status = "On track";
      else if (avg >= goal - 0.5) status = "Close to target";
      else status = "Needs review";
    }
    result.push({
      person,
      trackedHours: hoursByPerson.get(person) ?? 0,
      countedWorkingDays: days,
      avgWorkingDay: avg,
      medianActiveDay: median(activeDayHours.get(person) ?? []),
      status,
      context: kpi.context,
    });
  }

  return result.sort((a, b) => {
    if (b.avgWorkingDay !== a.avgWorkingDay) {
      return b.avgWorkingDay - a.avgWorkingDay;
    }
    return a.person.localeCompare(b.person);
  });
}
