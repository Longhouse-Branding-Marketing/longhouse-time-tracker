/** Panel titles — Title Case, shared `.lh-section-title` style across dashboards. */
export const CHART_TITLES = {
  billable: "Billable vs. Non-Billable",
  hoursOverTime: "Tracked Hours Over Time",
  hierarchy: "Time by Department, Role, and Task",
  department: "Time by Department",
  role: "Time by Role",
  task: "Time by Task",
  type: "Task Types",
  dailyPattern: "Daily Tracking Pattern",
  teamMembers: "Team Members",
} as const;

export function timeEntriesTitle(count: number): string {
  return `Time Entries (${count.toLocaleString()})`;
}
