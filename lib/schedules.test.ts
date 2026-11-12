import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computePersonOperations } from "./personOperations.ts";
import type { OperationsKpi, PersonDailyTracking } from "./types.ts";
import {
  WEEKDAY_FIELDS,
  addIsoDays,
  applyScheduleHistory,
  planScheduleChange,
  planScheduleDelete,
  previewCountedDays,
  scheduleForDate,
  validateScheduleWindow,
  weekdayField,
  type DatedSchedule,
  type WeekdayField,
} from "./schedules.ts";

function pattern(
  overrides: Partial<DatedSchedule> & Pick<DatedSchedule, "id">
): DatedSchedule {
  return {
    effective_start_date: null,
    effective_end_date: null,
    monday: false,
    tuesday: false,
    wednesday: false,
    thursday: false,
    friday: false,
    saturday: false,
    sunday: false,
    daily_goal: 6.5,
    include_in_operations_kpi: true,
    notes: null,
    ...overrides,
  };
}

function withGoalHours(days: PersonDailyTracking[], hours: number): PersonDailyTracking[] {
  return days.map((day) =>
    day.counted_working_day ? { ...day, tracked_hours: hours } : day
  );
}

function countedAverage(
  days: PersonDailyTracking[],
  from: string,
  to: string
): { average: number; days: number } {
  let hours = 0;
  let counted = 0;
  for (const day of days) {
    if (day.date < from || day.date > to) continue;
    if (!day.counted_working_day) continue;
    counted += 1;
    hours += Number(day.tracked_hours);
  }
  return { average: counted > 0 ? hours / counted : 0, days: counted };
}

function hoursMap(days: PersonDailyTracking[]): Record<string, number> {
  const hours: Record<string, number> = {};
  for (const day of days) {
    if (day.counted_working_day) hours[day.date] = Number(day.tracked_hours);
  }
  return hours;
}

function kpi(person: string): OperationsKpi {
  return {
    person,
    tracked_hours: 0,
    counted_working_days: 0,
    avg_working_day: 0,
    median_active_day: 0,
    status: "On track",
    context: null,
  };
}

const emptyFilters = {
  people: [] as string[],
  departments: [] as string[],
  roles: [] as string[],
  tasks: [] as string[],
  types: [] as string[],
};

describe("schedule periods", () => {
  it("treats a legacy null/null schedule as covering every day", () => {
    const schedule = pattern({
      id: 1,
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
    });
    assert.equal(weekdayField("2026-01-01"), "thursday");
    assert.equal(scheduleForDate([schedule], "2024-06-03")?.id, 1);
    assert.equal(scheduleForDate([schedule], "2026-11-12")?.id, 1);

    const days = previewCountedDays({
      person: "Mary",
      from: "2026-01-05",
      to: "2026-01-09",
      schedules: [schedule],
    });
    assert.deepEqual(
      days.map((day) => day.counted_working_day),
      [true, true, true, true, true]
    );
  });

  it("uses the schedule that covers each date, including the boundary day", () => {
    const end = "2026-03-31";
    const start = "2026-04-01";
    const endKey = weekdayField(end);
    const startKey = weekdayField(start);
    assert.notEqual(endKey, startKey);

    const flags = (on: WeekdayField) =>
      Object.fromEntries(WEEKDAY_FIELDS.map((key) => [key, key === on])) as Pick<
        DatedSchedule,
        WeekdayField
      >;

    const partTime = pattern({ id: 1, effective_end_date: end, ...flags(endKey) });
    const fullTime = pattern({
      id: 2,
      effective_start_date: start,
      ...flags(startKey),
    });

    assert.equal(scheduleForDate([partTime, fullTime], end)?.id, 1);
    assert.equal(scheduleForDate([partTime, fullTime], start)?.id, 2);

    const days = previewCountedDays({
      person: "Mary",
      from: end,
      to: start,
      schedules: [partTime, fullTime],
    });
    assert.equal(days[0].counted_working_day, true);
    assert.equal(days[1].counted_working_day, true);
  });

  it("keeps Mary's part-time average when she moves to five days a week", () => {
    assert.equal(weekdayField("2026-01-05"), "monday");

    const partTime = pattern({
      id: 1,
      effective_end_date: "2026-03-31",
      monday: true,
      wednesday: true,
      friday: true,
      daily_goal: 6.5,
    });
    const fullTime = pattern({
      id: 2,
      effective_start_date: "2026-04-01",
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
      daily_goal: 6.5,
    });

    // A full week after the change, so both periods are in the span.
    let aprilMonday = "2026-04-01";
    aprilMonday = addIsoDays(
      aprilMonday,
      -WEEKDAY_FIELDS.indexOf(weekdayField(aprilMonday))
    );
    if (aprilMonday < "2026-04-01") aprilMonday = addIsoDays(aprilMonday, 7);
    const aprilFriday = addIsoDays(aprilMonday, 4);

    const from = "2026-01-05";
    const to = aprilFriday;
    const aware = withGoalHours(
      previewCountedDays({
        person: "Mary",
        from,
        to,
        schedules: [partTime, fullTime],
      }),
      6.5
    );

    const january = countedAverage(aware, "2026-01-05", "2026-01-09");
    assert.equal(january.days, 3);
    assert.equal(january.average, 6.5);

    const april = countedAverage(aware, aprilMonday, aprilFriday);
    assert.equal(april.days, 5);
    assert.equal(april.average, 6.5);

    const combined = countedAverage(aware, from, to);
    assert.equal(combined.average, 6.5);

    // What today does: measure every past weekday against the new 5-day schedule.
    const latestOnly = pattern({
      id: 9,
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
    });
    const distorted = previewCountedDays({
      person: "Mary",
      from,
      to,
      schedules: [latestOnly],
      hoursByDate: hoursMap(aware),
    });
    const distortedJanuary = countedAverage(distorted, "2026-01-05", "2026-01-09");
    assert.equal(distortedJanuary.days, 5);
    assert.ok(distortedJanuary.average < 6);
    assert.ok(countedAverage(distorted, from, to).average < combined.average);

    const filters = { ...emptyFilters, from: "2026-01-05", to: "2026-01-09", people: ["Mary"] };
    const [row] = computePersonOperations([], aware, filters, [kpi("Mary")]);
    assert.equal(row.countedWorkingDays, 3);
    assert.equal(row.avgWorkingDay, 6.5);
    assert.equal(row.status, "On track");

    const [distortedRow] = computePersonOperations([], distorted, filters, [kpi("Mary")]);
    assert.equal(distortedRow.countedWorkingDays, 5);
    assert.equal(distortedRow.status, "Needs review");
  });

  it("corrects a latest-schedule spine without dropping holiday exclusions", () => {
    const partTime = {
      ...pattern({
        id: 1,
        effective_end_date: "2026-03-31",
        monday: true,
        wednesday: true,
        friday: true,
      }),
      person: "Mary",
    };
    const fullTime = {
      ...pattern({
        id: 2,
        effective_start_date: "2026-04-01",
        monday: true,
        tuesday: true,
        wednesday: true,
        thursday: true,
        friday: true,
      }),
      person: "Mary",
    };
    const asLatestOnly = previewCountedDays({
      person: "Mary",
      from: "2026-01-05",
      to: "2026-01-09",
      schedules: [{ ...fullTime, effective_start_date: null, effective_end_date: null }],
      statHolidays: new Set(["2026-01-05"]),
    });
    assert.equal(
      asLatestOnly.find((day) => day.date === "2026-01-06")?.counted_working_day,
      true
    );

    const fixed = applyScheduleHistory(asLatestOnly, [partTime, fullTime]);
    const byDate = new Map(fixed.map((day) => [day.date, day]));
    assert.equal(byDate.get("2026-01-05")?.is_stat_holiday, true);
    assert.equal(byDate.get("2026-01-05")?.counted_working_day, false);
    assert.equal(byDate.get("2026-01-06")?.counted_working_day, false);
    assert.equal(byDate.get("2026-01-07")?.counted_working_day, true);
  });

  it("closes the open period the day before a logged change", () => {
    const current = pattern({ id: 4, notes: "part time" });
    const plan = planScheduleChange([current], "2026-04-01");
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(plan.mode, "insert");
    assert.deepEqual(plan.closeIds, [4]);
    assert.equal(plan.closeEnd, "2026-03-31");
    assert.equal(current.monday, false);
  });

  it("refuses a change that starts on the current period's start date", () => {
    const current = pattern({ id: 4, effective_start_date: "2026-04-01" });
    const plan = planScheduleChange([current], "2026-04-01");
    assert.equal(plan.ok, false);
  });

  it("finishes a close when the new period was inserted but the previous one is still open", () => {
    const previous = pattern({ id: 4 });
    const inserted = pattern({ id: 5, effective_start_date: "2026-04-01" });
    const plan = planScheduleChange([previous, inserted], "2026-04-01");
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(plan.mode, "update");
    assert.equal(plan.updateId, 5);
    assert.deepEqual(plan.closeIds, [4]);
  });

  it("reopens the previous period when the current one is deleted", () => {
    const previous = pattern({ id: 4, effective_end_date: "2026-03-31" });
    const current = pattern({ id: 5, effective_start_date: "2026-04-01" });
    const plan = planScheduleDelete([previous, current], 5);
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.deepEqual(plan.reopen, { id: 4, previousEnd: "2026-03-31" });
  });

  it("rejects overlapping edits", () => {
    const other = pattern({
      id: 2,
      effective_start_date: "2026-04-01",
      effective_end_date: null,
    });
    const error = validateScheduleWindow(
      { effective_start_date: null, effective_end_date: "2026-06-01" },
      [other]
    );
    assert.match(error ?? "", /overlaps/i);
  });
});
