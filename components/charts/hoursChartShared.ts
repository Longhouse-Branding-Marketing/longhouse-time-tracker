import type { MouseHandlerDataParam } from "recharts";
import {
  WEEKDAY_KEYS,
  type Granularity,
  type TimePoint,
  type WeekdayKey,
} from "@/lib/aggregate";
import { formatDateShort, formatMonth } from "@/lib/formatters";

export const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export const DOW_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const WEEKDAY_LABELS = [
  "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun",
] as const;

/** Shared bar sizing so month / week / day drills feel consistent. */
export const CLUSTER_BAR_SIZE = 11;
export const CLUSTER_BAR_GAP = 2;
export const CLUSTER_CATEGORY_GAP = "22%";
export const SINGLE_BAR_SIZE = 28;
export const SINGLE_CATEGORY_GAP = "18%";

/** Full-height transparent band behind each bar for column-wide click targets. */
export const BAR_HIT_BACKGROUND = { fill: "transparent" } as const;

export function resolveChartIndex(
  activeTooltipIndex: MouseHandlerDataParam["activeTooltipIndex"]
): number | null {
  if (activeTooltipIndex == null) return null;
  if (typeof activeTooltipIndex === "number") return activeTooltipIndex;
  const parsed = Number.parseInt(String(activeTooltipIndex), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function handleChartBarClick(
  state: MouseHandlerDataParam,
  items: readonly { key: string }[],
  onBarClick?: (key: string) => void
) {
  if (!onBarClick) return;
  const index = resolveChartIndex(state.activeTooltipIndex);
  if (index == null) return;
  const item = items[index];
  if (item?.key) onBarClick(item.key);
}

export function weekdayDate(weekMonday: string, dayKey: WeekdayKey): string {
  const idx = WEEKDAY_KEYS.indexOf(dayKey);
  const dt = new Date(`${weekMonday}T00:00:00`);
  dt.setDate(dt.getDate() + idx);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export interface Bucket {
  key: string;
  hours: number;
  primary: string;
  secondary: string;
}

export function buildBuckets(data: TimePoint[], g: Granularity): Bucket[] {
  if (g === "month") {
    return data.map((d) => ({
      key: d.key,
      hours: d.hours,
      primary: formatMonth(d.key),
      secondary: "",
    }));
  }
  let prevMonth = "";
  let weekIdx = 0;
  return data.map((d) => {
    const dt = new Date(`${d.key}T00:00:00`);
    const monthKey = `${dt.getFullYear()}-${dt.getMonth()}`;
    const monthChanged = monthKey !== prevMonth;
    if (g === "week") weekIdx = monthChanged ? 1 : weekIdx + 1;
    prevMonth = monthKey;

    if (g === "week") {
      return {
        key: d.key,
        hours: d.hours,
        primary: `W${weekIdx}`,
        secondary: monthChanged ? MONTH_ABBR[dt.getMonth()] : "",
      };
    }

    return {
      key: d.key,
      hours: d.hours,
      primary: DOW_ABBR[dt.getDay()],
      secondary: monthChanged
        ? `${dt.getDate()} ${MONTH_ABBR[dt.getMonth()]}`
        : String(dt.getDate()),
    };
  });
}

export function fullLabel(key: string, g: Granularity): string {
  if (g === "month") return formatMonth(key);
  if (g === "week") return `Week of ${formatDateShort(key)}`;
  const dt = new Date(`${key}T00:00:00`);
  return `${DOW_ABBR[dt.getDay()]} ${formatDateShort(key)}`;
}
