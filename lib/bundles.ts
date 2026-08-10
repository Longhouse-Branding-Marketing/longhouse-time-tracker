import { unstable_cache } from "next/cache";
import { TIME_TRACKING_TAG } from "./cache-tags";
import {
  getEmployees,
  getEntries,
  getOperationsKpis,
  getPersonDailyTracking,
  getSchedules,
  getStatHolidays,
  getTimeOff,
} from "./data";
import { memoryCached } from "./memory-cache";
import { hasSupabaseServiceRole } from "./supabase";
import type {
  Employee,
  EmployeeSchedule,
  EntryRow,
  OperationsKpi,
  PersonDailyTracking,
  StatHoliday,
  TimeOff,
} from "./types";

export { TIME_TRACKING_TAG };

export type DashboardBundle = {
  entries: EntryRow[];
  employees: Employee[];
  kpis: OperationsKpi[];
  dailyTracking: PersonDailyTracking[];
};

export type PeopleBundle = {
  kpis: OperationsKpi[];
  employees: Employee[];
};

export type SettingsBundle = {
  employees: Employee[];
  schedules: EmployeeSchedule[];
  timeOff: TimeOff[];
  holidays: StatHoliday[];
  accessEnabled: boolean;
};

/**
 * Cached loaders — the only place pages/API routes should read analytics data.
 * Supabase is never queried from React render trees directly.
 *
 * The dashboard bundle is ~5MB (all time entries), which exceeds Next.js
 * `unstable_cache`'s hard 2MB per-entry limit and was failing `/api/dashboard`
 * with 500s. It uses a process-local memory cache instead; call
 * `bustMemoryCache()` whenever `revalidateTag(TIME_TRACKING_TAG)` runs.
 */
export async function getDashboardBundle(): Promise<DashboardBundle> {
  return memoryCached("dashboard-bundle-v7", async () => {
    const [entries, employees, kpis, dailyTracking] = await Promise.all([
      getEntries(),
      getEmployees(),
      getOperationsKpis(),
      getPersonDailyTracking(),
    ]);
    return { entries, employees, kpis, dailyTracking };
  });
}

export const getPeopleBundle = unstable_cache(
  async (): Promise<PeopleBundle> => {
    const [kpis, employees] = await Promise.all([
      getOperationsKpis(),
      getEmployees(),
    ]);
    return { kpis, employees };
  },
  ["people-bundle-v4"],
  { tags: [TIME_TRACKING_TAG], revalidate: false }
);

export const getSettingsBundle = unstable_cache(
  async (): Promise<SettingsBundle> => {
    const [employees, schedules, timeOff, holidays] = await Promise.all([
      getEmployees(),
      getSchedules(),
      getTimeOff(),
      getStatHolidays(),
    ]);
    return {
      employees,
      schedules,
      timeOff,
      holidays,
      /** Server must use Hub service_role to read/write RLS-protected base tables. */
      accessEnabled: hasSupabaseServiceRole(),
    };
  },
  ["settings-bundle"],
  { tags: [TIME_TRACKING_TAG], revalidate: false }
);
