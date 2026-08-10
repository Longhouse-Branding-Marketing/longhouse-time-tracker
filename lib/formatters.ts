import type { Num } from "./types";

/** Coerce a possibly-string numeric value to a number (0 fallback). */
export function n(value: Num | undefined): number {
  if (value === null || value === undefined) return 0;
  const num = typeof value === "string" ? parseFloat(value) : value;
  return Number.isFinite(num) ? num : 0;
}

/** Format hours like "1,234.5 h". */
export function hours(value: Num, digits = 1): string {
  return `${n(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} h`;
}

/** Plain number with thousands separators. */
export function count(value: Num): string {
  return n(value).toLocaleString();
}

/** Percent like "44%". */
export function pct(value: Num, digits = 0): string {
  return `${n(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

/** "Jun 12, 2026" from an ISO date string. */
export function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Short date "Jun 12" for dense axes/tables. */
export function formatDateShort(value: string | null): string {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Clock hour 0–23 → "12:00 AM" / "3:00 PM". */
export function formatClockHour(hour: number): string {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:00 ${suffix}`;
}

/** Compact axis label: "12 AM" / "3 PM". */
export function formatClockHourShort(hour: number): string {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${suffix}`;
}

/** "Friday, June 21" from yyyy-mm-dd. */
export function formatWeekdayLongDate(value: string): string {
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/** "2026-06" -> "Jun 2026". */
export function formatMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  if (!y || !m) return yearMonth;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

/** Initials for avatar fallbacks: "Benton Sorensen" -> "BS". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Tone buckets drive supportive color usage across the UI.
export type Tone = "positive" | "neutral" | "review" | "serious" | "info";

/** Map an Operations status label to a supportive tone. */
export function statusTone(status: string): Tone {
  switch (status) {
    case "On track":
      return "positive";
    case "Close to target":
      return "review";
    case "Needs review":
      return "serious";
    case "Context exception":
      return "info";
    case "Not included in current KPI":
    case "Schedule needed":
      return "neutral";
    default:
      return "neutral";
  }
}
