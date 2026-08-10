"use client";

import { useMemo } from "react";
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
import { formatClockHour, hours as fmtHours } from "@/lib/formatters";
import { computeHourlyBreakdown, computePeopleForHour } from "@/lib/aggregate";
import type { EntryRow } from "@/lib/types";
import { Avatar } from "@/components/ui";
import { ChartEmpty } from "./ChartEmpty";
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
  SINGLE_BAR_SIZE,
  resolveChartIndex,
} from "./hoursChartShared";

export function HourlyBars({
  rows,
  day,
  selectedHour,
  onHourClick,
  photoOf,
}: {
  rows: EntryRow[];
  day: string;
  selectedHour?: number | null;
  onHourClick?: (hour: number) => void;
  photoOf?: Map<string, string | null>;
}) {
  const { points, timedHours, untimedHours } = useMemo(
    () => computeHourlyBreakdown(rows, day),
    [rows, day]
  );

  const people =
    selectedHour != null
      ? computePeopleForHour(rows, day, selectedHour)
      : [];

  if (timedHours <= 0 && untimedHours <= 0) return <ChartEmpty />;

  return (
    <div>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT.time}>
        <BarChart
          data={points}
          margin={{ top: 8, right: 12, bottom: 10, left: 0 }}
          barCategoryGap="12%"
          onClick={(state) => {
            if (!onHourClick) return;
            const index = resolveChartIndex(state.activeTooltipIndex);
            if (index == null) return;
            const point = points[index];
            if (point && point.hours > 0) onHourClick(point.hour);
          }}
          style={onHourClick ? { cursor: "pointer" } : undefined}
        >
          <CartesianGrid stroke={GRID_STROKE} vertical={false} strokeDasharray="4 4" />
          <XAxis
            dataKey="label"
            interval={2}
            tickLine={false}
            axisLine={{ stroke: GRID_STROKE }}
            tick={{ ...AXIS_TICK, fontSize: 10 }}
            height={40}
            minTickGap={0}
          />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={hoursTick}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: BRAND.tint }}
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            formatter={(value: unknown) => [fmtHours(Number(value)), "Tracked"]}
            labelFormatter={(label) => `${label}`}
          />
          <Bar
            dataKey="hours"
            fill={BAR_FILL}
            radius={[3, 3, 0, 0]}
            barSize={SINGLE_BAR_SIZE}
            minPointSize={timedHours > 0 ? 2 : 0}
            background={onHourClick ? BAR_HIT_BACKGROUND : false}
            cursor={onHourClick ? "pointer" : undefined}
            onClick={(event: unknown) => {
              const hour = (event as { payload?: { hour?: number; hours?: number } })
                .payload?.hour;
              const hrs = (event as { payload?: { hours?: number } }).payload
                ?.hours;
              if (hour == null || !hrs || hrs <= 0) return;
              onHourClick?.(hour);
            }}
          >
            {selectedHour != null
              ? points.map((entry) => (
                  <Cell
                    key={entry.key}
                    fill={BAR_FILL}
                    fillOpacity={entry.hour === selectedHour ? 1 : 0.35}
                  />
                ))
              : null}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-2 text-center text-[11px] text-muted">
        {timedHours > 0
          ? `${fmtHours(timedHours)} placed by clock time`
          : "No clock times on entries for this day"}
        {untimedHours > 0
          ? ` · ${fmtHours(untimedHours)} without a time range`
          : ""}
      </p>

      {selectedHour != null ? (
        <div className="mt-4 rounded-xl border border-line bg-surface/60 px-4 py-3">
          <div className="text-[13px] font-semibold text-ink">
            {formatClockHour(selectedHour)}
          </div>
          <p className="mt-0.5 text-[12px] text-muted">
            {people.length === 0
              ? "No one with clock time in this hour."
              : `${people.length} ${people.length === 1 ? "person" : "people"} tracking`}
          </p>
          {people.length > 0 ? (
            <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {people.map((p) => (
                <li
                  key={p.person}
                  className="flex items-center gap-3 rounded-lg border border-line bg-card px-3 py-2"
                >
                  <Avatar
                    name={p.person}
                    photoUrl={photoOf?.get(p.person) ?? null}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-ink">
                      {p.person}
                    </div>
                    <div className="text-[12px] tabular-nums text-muted">
                      {fmtHours(p.hours)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : timedHours > 0 ? (
        <p className="mt-3 text-center text-[12px] text-muted">
          Click an hour to see who was tracking.
        </p>
      ) : null}
    </div>
  );
}
