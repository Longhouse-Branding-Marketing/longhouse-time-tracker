import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computePersonOperations } from "./personOperations.ts";
import { applyFilters, withoutDepartments } from "./filtering.ts";
import type { EntryRow, OperationsKpi, PersonDailyTracking } from "./types.ts";

function entry(
  person: string,
  date: string,
  hours: number,
  extra: Partial<EntryRow> = {}
): EntryRow {
  return {
    id: Number(`${date.replaceAll("-", "")}${hours}`),
    person,
    date,
    department: extra.department ?? "Operations",
    role: extra.role ?? "Operations Manager",
    task: extra.task ?? "Team Meeting",
    type: extra.type ?? "Internal Meeting",
    billable: extra.billable ?? "Non-Billable",
    hours,
    comments: null,
    is_billable: extra.is_billable ?? false,
    year_month: date.slice(0, 7),
    source_time_range: null,
  };
}

function day(
  person: string,
  date: string,
  hours: number,
  counted: boolean,
  goal = 6.5
): PersonDailyTracking {
  return {
    person,
    date,
    tracked_hours: hours,
    daily_goal: goal,
    include_in_operations_kpi: true,
    scheduled_to_work: counted,
    is_stat_holiday: false,
    is_time_off: false,
    context: null,
    counted_working_day: counted,
  };
}

function kpi(
  person: string,
  status = "On track",
  extra: Partial<OperationsKpi> = {}
): OperationsKpi {
  return {
    person,
    tracked_hours: extra.tracked_hours ?? 10,
    counted_working_days: extra.counted_working_days ?? 2,
    avg_working_day: extra.avg_working_day ?? 7,
    median_active_day: extra.median_active_day ?? 7,
    status,
    context: extra.context ?? null,
  };
}

const filters = {
  from: "2026-09-01",
  to: "2026-09-03",
  people: [] as string[],
  departments: [] as string[],
  roles: [] as string[],
  tasks: [] as string[],
  types: [] as string[],
};

describe("computePersonOperations", () => {
  it("averages counted working days in the date range", () => {
    const rows = [
      entry("Hailey", "2026-09-01", 8),
      entry("Hailey", "2026-09-02", 6),
      entry("Hailey", "2026-09-03", 2),
    ];
    const daily = [
      day("Hailey", "2026-09-01", 8, true),
      day("Hailey", "2026-09-02", 6, true),
      day("Hailey", "2026-09-03", 2, false),
    ];
    const [row] = computePersonOperations(rows, daily, filters, [
      kpi("Hailey"),
    ]);
    assert.equal(row.person, "Hailey");
    assert.equal(row.trackedHours, 16);
    assert.equal(row.countedWorkingDays, 2);
    assert.equal(row.avgWorkingDay, 7);
    assert.equal(row.medianActiveDay, 7);
    assert.equal(row.status, "On track");
  });

  it("keeps schedule-needed status even when hours look on track", () => {
    const rows = [entry("Matt", "2026-09-01", 8)];
    const daily = [day("Matt", "2026-09-01", 8, true)];
    const [row] = computePersonOperations(rows, daily, filters, [
      kpi("Matt", "Schedule needed"),
    ]);
    assert.equal(row.status, "Schedule needed");
  });

  it("limits the list to people with matching role hours", () => {
    const rows = applyFilters(
      [
        entry("Hailey", "2026-09-01", 7, { role: "Designer" }),
        entry("Benton", "2026-09-01", 7, { role: "Operations Manager" }),
      ],
      { ...filters, roles: ["Designer"] }
    );
    const daily = [
      day("Hailey", "2026-09-01", 7, true),
      day("Benton", "2026-09-01", 7, true),
    ];
    const result = computePersonOperations(
      rows,
      daily,
      { ...filters, roles: ["Designer"] },
      [kpi("Hailey"), kpi("Benton")]
    );
    assert.deepEqual(
      result.map((r) => r.person),
      ["Hailey"]
    );
    assert.equal(result[0].trackedHours, 7);
    assert.equal(result[0].countedWorkingDays, 1);
  });

  it("ignores department when withoutDepartments is applied", () => {
    const all = [
      entry("Hailey", "2026-09-01", 4, { department: "Web Design" }),
      entry("Hailey", "2026-09-01", 4, { department: "Operations" }),
    ];
    const scoped = withoutDepartments({
      ...filters,
      departments: ["Operations"],
    });
    const rows = applyFilters(all, scoped);
    const [row] = computePersonOperations(
      rows,
      [day("Hailey", "2026-09-01", 8, true)],
      scoped,
      [kpi("Hailey")]
    );
    assert.equal(row.trackedHours, 8);
  });

  it("marks below-goal slices as needs review", () => {
    const rows = [entry("Hai", "2026-09-01", 4)];
    const daily = [day("Hai", "2026-09-01", 4, true, 6.5)];
    const [row] = computePersonOperations(rows, daily, filters, [
      kpi("Hai", "On track"),
    ]);
    assert.equal(row.status, "Needs review");
    assert.equal(row.avgWorkingDay, 4);
  });
});
