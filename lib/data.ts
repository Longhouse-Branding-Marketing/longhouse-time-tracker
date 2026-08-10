import { fetchAll, fetchView } from "./supabase";
import type {
  Employee,
  EmployeeSchedule,
  EntryRow,
  OperationsKpi,
  PersonDailyTracking,
  PersonEntryDetail,
  StatHoliday,
  TimeOff,
} from "./types";

// Comments are omitted from the list payload to keep client transfer smaller.
const LIST_COLUMNS =
  "id,person,date,department,role,task,type,billable,hours,is_billable,year_month,source_time_range";

const PERSON_ENTRY_COLUMNS =
  "id,person,date,department,role,task,type,billable,hours,comments,created_at,is_billable";

const DAILY_TRACKING_COLUMNS =
  "person,date,tracked_hours,daily_goal,counted_working_day";

/** All clean time entries for in-app filtering + aggregation. */
export function getEntries(): Promise<EntryRow[]> {
  return fetchAll<EntryRow>("v_time_entries_clean", LIST_COLUMNS, (q) =>
    q.order("date", { ascending: false }).order("id", { ascending: false })
  );
}

/** One person's entries with comments + created_at for the detail panel. */
export function getPersonEntries(person: string): Promise<PersonEntryDetail[]> {
  return fetchAll<PersonEntryDetail>("v_time_entries_clean", PERSON_ENTRY_COLUMNS, (q) =>
    q
      .eq("person", person)
      .order("date", { ascending: false })
      .order("id", { ascending: false })
  );
}

export function getOperationsKpis(): Promise<OperationsKpi[]> {
  return fetchView<OperationsKpi>("v_operations_kpi");
}

/** Per-person calendar days with schedule / holiday / time-off flags. */
export function getPersonDailyTracking(): Promise<PersonDailyTracking[]> {
  return fetchAll<PersonDailyTracking>(
    "v_person_daily_tracking",
    DAILY_TRACKING_COLUMNS,
    (q) =>
      q.order("date", { ascending: true }).order("person", { ascending: true })
  );
}

// --- Settings base tables (return [] until table access is enabled) --------

export function getEmployees(): Promise<Employee[]> {
  return fetchView<Employee>("employees", (q) =>
    q.order("person", { ascending: true })
  );
}

export function getEmployee(person: string): Promise<Employee | null> {
  return fetchView<Employee>("employees", (q) =>
    q.eq("person", person).limit(1)
  ).then((rows) => rows[0] ?? null);
}

export function getSchedules(): Promise<EmployeeSchedule[]> {
  return fetchView<EmployeeSchedule>("employee_schedules", (q) =>
    q.order("person", { ascending: true }).order("created_at", {
      ascending: false,
    })
  );
}

export function getTimeOff(): Promise<TimeOff[]> {
  return fetchView<TimeOff>("time_off", (q) =>
    q.order("start_date", { ascending: false })
  );
}

export function getStatHolidays(): Promise<StatHoliday[]> {
  return fetchView<StatHoliday>("stat_holidays", (q) =>
    q.order("date", { ascending: true })
  );
}
