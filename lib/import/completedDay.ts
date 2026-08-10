import { n } from "@/lib/formatters";
import type { PersonDailyTracking } from "@/lib/types";

/** Share of expected people who must have logged hours for a day to count as complete. */
export const COMPLETE_DAY_COVERAGE = 0.75;

/** Share of summed daily goals that tracked hours must reach. */
export const COMPLETE_DAY_HOURS_RATIO = 0.55;

/** Ignore tiny leftovers (seconds of idle capture). */
const MIN_PERSON_HOURS = 0.25;

export type DayCoverage = {
  date: string;
  expectedPeople: number;
  trackedPeople: number;
  coverage: number;
  expectedHours: number;
  trackedHours: number;
  hoursRatio: number;
  complete: boolean;
};

export type CompletedDayStatus = {
  /** Most recent counted working day that meets completeness thresholds. */
  lastCompleteDate: string | null;
  /** Day after last complete — suggested Memtime extract start. */
  extractFrom: string | null;
  /** Latest date that has any tracked hours (may be incomplete). */
  latestPartialDate: string | null;
  latestPartial: DayCoverage | null;
  lastComplete: DayCoverage | null;
  /** Recent days (newest first) for context. */
  recent: DayCoverage[];
};

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildDayMap(daily: PersonDailyTracking[]): Map<string, PersonDailyTracking[]> {
  const byDate = new Map<string, PersonDailyTracking[]>();
  for (const row of daily) {
    const list = byDate.get(row.date) ?? [];
    list.push(row);
    byDate.set(row.date, list);
  }
  return byDate;
}

export function measureDay(rows: PersonDailyTracking[]): DayCoverage | null {
  const expected = rows.filter((r) => r.counted_working_day);
  if (expected.length === 0) return null;

  let trackedPeople = 0;
  let trackedHours = 0;
  let expectedHours = 0;

  for (const r of expected) {
    expectedHours += n(r.daily_goal);
    const h = n(r.tracked_hours);
    if (h >= MIN_PERSON_HOURS) {
      trackedPeople += 1;
      trackedHours += h;
    }
  }

  const coverage = trackedPeople / expected.length;
  const hoursRatio =
    expectedHours > 0 ? trackedHours / expectedHours : trackedPeople > 0 ? 1 : 0;

  return {
    date: expected[0].date,
    expectedPeople: expected.length,
    trackedPeople,
    coverage,
    expectedHours: Math.round(expectedHours * 100) / 100,
    trackedHours: Math.round(trackedHours * 100) / 100,
    hoursRatio,
    complete:
      coverage >= COMPLETE_DAY_COVERAGE &&
      hoursRatio >= COMPLETE_DAY_HOURS_RATIO,
  };
}

/**
 * Find the most recent "full" working day and suggest the next extract start.
 * Completeness = enough scheduled people logged meaningful hours + total hours
 * are a sufficient share of daily goals (filters out stub/partial uploads).
 */
export function computeCompletedDayStatus(
  daily: PersonDailyTracking[],
  recentLimit = 14
): CompletedDayStatus {
  const byDate = buildDayMap(daily);
  const dates = [...byDate.keys()].sort(); // ascending

  const measured: DayCoverage[] = [];
  for (const date of dates) {
    const m = measureDay(byDate.get(date) ?? []);
    if (m) measured.push(m);
  }

  const withAnyHours = [...measured].reverse().find((d) => d.trackedPeople > 0) ?? null;
  const lastComplete =
    [...measured].reverse().find((d) => d.complete) ?? null;

  return {
    lastCompleteDate: lastComplete?.date ?? null,
    extractFrom: lastComplete ? addDaysIso(lastComplete.date, 1) : null,
    latestPartialDate: withAnyHours?.date ?? null,
    latestPartial: withAnyHours,
    lastComplete,
    recent: [...measured].reverse().slice(0, recentLimit),
  };
}
