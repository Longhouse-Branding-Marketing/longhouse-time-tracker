"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BRAND } from "@/lib/brand";
import { hours as fmtHours } from "@/lib/formatters";
import type { Granularity, TimePoint } from "@/lib/aggregate";
import type { EntryRow } from "@/lib/types";
import { ChartEmpty } from "./ChartEmpty";
import { HourlyBars } from "./HourlyBars";
import { MonthWeekBars } from "./MonthWeekBars";
import { WeekDayBars } from "./WeekDayBars";
import {
  AXIS_TICK,
  BAR_FILL,
  CHART_HEIGHT,
  GRID_STROKE,
  hoursTick,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_STYLE,
} from "./chartTheme";
import {
  BAR_HIT_BACKGROUND,
  buildBuckets,
  fullLabel,
  handleChartBarClick,
} from "./hoursChartShared";

export { DayDetailDrawer } from "./DayDetailDrawer";

export function HoursOverTime({
  data,
  granularity,
  onBarClick,
  selectedDay,
  selectedHour,
  onHourClick,
  rows = [],
  scopeFrom,
  scopeTo,
  photoOf,
}: {
  data: TimePoint[];
  granularity: Granularity;
  onBarClick?: (key: string) => void;
  selectedDay?: string | null;
  selectedHour?: number | null;
  onHourClick?: (hour: number) => void;
  /** Needed for week day-bars and hourly breakdown. */
  rows?: EntryRow[];
  scopeFrom?: string;
  scopeTo?: string;
  photoOf?: Map<string, string | null>;
}) {
  if (selectedDay && rows.length > 0) {
    return (
      <HourlyBars
        rows={rows}
        day={selectedDay}
        selectedHour={selectedHour}
        onHourClick={onHourClick}
        photoOf={photoOf}
      />
    );
  }

  if (granularity === "month" && rows.length > 0 && scopeFrom && scopeTo) {
    return (
      <MonthWeekBars
        rows={rows}
        scopeFrom={scopeFrom}
        scopeTo={scopeTo}
        onBarClick={onBarClick}
      />
    );
  }

  if (granularity === "week" && rows.length > 0 && scopeFrom && scopeTo) {
    return (
      <WeekDayBars
        rows={rows}
        scopeFrom={scopeFrom}
        scopeTo={scopeTo}
        onBarClick={onBarClick}
      />
    );
  }

  if (data.length === 0) return <ChartEmpty />;

  const chartData = buildBuckets(data, granularity);
  const dense = chartData.length > 16;
  const emphasizeDay = granularity === "day" && Boolean(selectedDay);

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT.time}>
      <BarChart
        data={chartData}
        margin={{ top: 8, right: 8, bottom: 6, left: 0 }}
        barCategoryGap="8%"
        onClick={(state) => handleChartBarClick(state, chartData, onBarClick)}
        style={onBarClick ? { cursor: "pointer" } : undefined}
      >
        <CartesianGrid stroke={GRID_STROKE} vertical={false} strokeDasharray="4 4" />
        <XAxis
          dataKey="key"
          interval={0}
          tickLine={false}
          axisLine={{ stroke: GRID_STROKE }}
          height={dense ? 48 : 44}
          tick={(p) => {
            const b = chartData[p.index];
            if (!b) return <g />;
            return (
              <g transform={`translate(${p.x},${p.y})`}>
                <text
                  x={0}
                  dy={14}
                  textAnchor="middle"
                  fontSize={dense ? 9 : 11}
                  fill={BRAND.muted}
                >
                  {b.primary}
                </text>
                {b.secondary ? (
                  <text
                    x={0}
                    dy={dense ? 26 : 30}
                    textAnchor="middle"
                    fontSize={dense ? 9 : 11}
                    fontWeight={600}
                    fill={BRAND.ink}
                  >
                    {b.secondary}
                  </text>
                ) : null}
              </g>
            );
          }}
        />
        <YAxis
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          width={44}
          tickFormatter={hoursTick}
        />
        <Tooltip
          cursor={{ fill: BRAND.tint }}
          contentStyle={TOOLTIP_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          formatter={(value: unknown) => [fmtHours(Number(value)), "Tracked"]}
          labelFormatter={(_label: unknown, payload: readonly { payload?: { key?: string } }[]) => {
            const key = payload?.[0]?.payload?.key;
            return key ? fullLabel(key, granularity) : "";
          }}
        />
        <Bar
          dataKey="hours"
          fill={BAR_FILL}
          radius={[4, 4, 0, 0]}
          maxBarSize={dense ? 14 : 28}
          background={onBarClick ? BAR_HIT_BACKGROUND : false}
          cursor={onBarClick ? "pointer" : undefined}
          onClick={(event: unknown) => {
            const key = (event as { payload?: { key?: string } }).payload?.key;
            if (key) onBarClick?.(key);
          }}
        >
          {emphasizeDay
            ? chartData.map((entry) => (
                <Cell
                  key={entry.key}
                  fill={BAR_FILL}
                  fillOpacity={entry.key === selectedDay ? 1 : 0.35}
                />
              ))
            : null}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
