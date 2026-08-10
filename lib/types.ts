// Row shapes for the reset Supabase structure.
// The dashboard reads the curated `v_*` views for analytics and the base
// tables (employees, employee_schedules, time_off, stat_holidays) for Settings.
// PostgREST returns numeric columns as strings, so formatters coerce safely.

export type Num = number | string | null;

// --- Analytics views -------------------------------------------------------

/** Slim subset of v_time_entries_clean the UI filters + aggregates in-app. */
export interface EntryRow {
  id: number;
  person: string;
  date: string; // yyyy-mm-dd
  department: string | null;
  role: string | null;
  task: string | null;
  type: string | null;
  billable: string | null; // "Billable" | "Non-Billable"
  hours: Num;
  comments: string | null;
  is_billable: boolean | null;
  year_month: string; // "YYYY-MM"
  /** Memtime time range, e.g. "9:45 a.m. - 11:35 a.m." */
  source_time_range: string | null;
}

/** Full entry row for the person detail panel (includes comments + created_at). */
export interface PersonEntryDetail {
  id: number;
  person: string;
  date: string;
  department: string | null;
  role: string | null;
  task: string | null;
  type: string | null;
  billable: string | null;
  hours: Num;
  comments: string | null;
  created_at: string | null;
  is_billable: boolean | null;
}

export interface HomeSummary {
  tracked_hours: Num;
  entries: Num;
  people_tracked: Num;
  average_entry_length: Num;
  billable_pct: Num;
  non_billable_pct: Num;
}

/** Status when a person has a schedule but is opted out of the ops KPI. */
export const KPI_EXCLUDED_STATUS = "Not included in current KPI";

export interface OperationsKpi {
  person: string;
  tracked_hours: Num;
  counted_working_days: Num;
  avg_working_day: Num;
  median_active_day: Num;
  status: string;
  context: string | null;
}

export interface PersonDailyTracking {
  person: string;
  date: string;
  tracked_hours: Num;
  daily_goal: Num;
  include_in_operations_kpi: boolean;
  scheduled_to_work: boolean;
  is_stat_holiday: boolean;
  is_time_off: boolean;
  context: string | null;
  counted_working_day: boolean;
}

// --- Base tables (Settings) ------------------------------------------------

export interface Employee {
  id: number;
  person: string;
  photo_url: string | null;
  active: boolean;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
}

export interface EmployeeSchedule {
  id: number;
  person: string;
  effective_start_date: string | null;
  effective_end_date: string | null;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
  daily_goal: Num;
  include_in_operations_kpi: boolean;
  notes: string | null;
}

export interface TimeOff {
  id: number;
  person: string;
  start_date: string;
  end_date: string;
  reason: string;
  counts_as_working_day: boolean;
  notes: string | null;
}

export interface StatHoliday {
  id: number;
  date: string;
  holiday_name: string;
  jurisdiction: string;
  holiday_type: string;
  counts_as_working_day: boolean;
  source_url: string | null;
  notes: string | null;
}
