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
  type TooltipContentProps,
} from "recharts";
import { BRAND, CHART_BLUES } from "@/lib/brand";
import {
  formatDateShort,
  formatWeekdayLongDate,
  hours as fmtHours,
} from "@/lib/formatters";
import {
  WEEKDAY_KEYS,
  computeWeekDayClusters,
  type WeekDayCluster,
  type WeekdayKey,
} from "@/lib/aggregate";
import type { EntryRow } from "@/lib/types";
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
  CLUSTER_BAR_GAP,
  CLUSTER_BAR_SIZE,
  CLUSTER_CATEGORY_GAP,
  MONTH_ABBR,
  SINGLE_BAR_SIZE,
  SINGLE_CATEGORY_GAP,
  WEEKDAY_LABELS,
  handleChartBarClick,
  weekdayDate,
} from "./hoursChartShared";

function WeekDayBarTooltip(props: TooltipContentProps) {
  const { active, payload } = props;
  if (!active || !payload?.length) return null;

  const entry = payload[0];
  const dayKey = entry.dataKey as WeekdayKey | undefined;
  const weekKey = (entry.payload as WeekDayCluster | undefined)?.key;
  const value = Number(entry.value);
  if (!weekKey || !dayKey || !Number.isFinite(value) || value <= 0) return null;

  const label = formatWeekdayLongDate(weekdayDate(weekKey, dayKey));

  return (
    <div style={TOOLTIP_STYLE}>
      <div style={{ ...TOOLTIP_LABEL_STYLE, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, color: BRAND.ink }}>{fmtHours(value)}</div>
    </div>
  );
}

function weekAxisLabels(clusters: WeekDayCluster[]) {
  let prevMonth = "";
  let weekIdx = 0;
  return clusters.map((c) => {
    const dt = new Date(`${c.key}T00:00:00`);
    const monthKey = `${dt.getFullYear()}-${dt.getMonth()}`;
    const monthChanged = monthKey !== prevMonth;
    weekIdx = monthChanged ? 1 : weekIdx + 1;
    prevMonth = monthKey;
    return {
      key: c.key,
      primary: `W${weekIdx}`,
      secondary: monthChanged ? MONTH_ABBR[dt.getMonth()] : "",
    };
  });
}

export function WeekDayBars({
  rows,
  scopeFrom,
  scopeTo,
  onBarClick,
}: {
  rows: EntryRow[];
  scopeFrom: string;
  scopeTo: string;
  onBarClick?: (key: string) => void;
}) {
  const clusters = useMemo(
    () => computeWeekDayClusters(rows, scopeFrom, scopeTo),
    [rows, scopeFrom, scopeTo]
  );
  const labels = useMemo(() => weekAxisLabels(clusters), [clusters]);

  if (clusters.every((c) => c.hours <= 0)) return <ChartEmpty />;

  // One week in scope → labeled Mon–Sun bars (same shape as day→hour drill).
  if (clusters.length === 1) {
    const cluster = clusters[0];
    const dayRows = WEEKDAY_KEYS.map((day, i) => ({
      key: weekdayDate(cluster.key, day),
      day,
      label: WEEKDAY_LABELS[i],
      hours: cluster[day],
    }));

    return (
      <ResponsiveContainer width="100%" height={CHART_HEIGHT.time}>
        <BarChart
          data={dayRows}
          margin={{ top: 8, right: 8, bottom: 6, left: 0 }}
          barCategoryGap={SINGLE_CATEGORY_GAP}
          onClick={(state) => handleChartBarClick(state, dayRows, onBarClick)}
          style={onBarClick ? { cursor: "pointer" } : undefined}
        >
          <CartesianGrid stroke={GRID_STROKE} vertical={false} strokeDasharray="4 4" />
          <XAxis
            dataKey="label"
            interval={0}
            tickLine={false}
            axisLine={{ stroke: GRID_STROKE }}
            tick={{ ...AXIS_TICK, fontSize: 11 }}
            height={36}
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
            labelFormatter={(_label, payload) => {
              const key = (
                payload as readonly { payload?: { key?: string } }[] | undefined
              )?.[0]?.payload?.key;
              return key ? formatWeekdayLongDate(key) : "";
            }}
          />
          <Bar
            dataKey="hours"
            fill={BAR_FILL}
            radius={[3, 3, 0, 0]}
            barSize={SINGLE_BAR_SIZE}
            background={onBarClick ? BAR_HIT_BACKGROUND : false}
            cursor={onBarClick ? "pointer" : undefined}
            onClick={(event: unknown) => {
              const key = (event as { payload?: { key?: string } }).payload?.key;
              if (key) onBarClick?.(key);
            }}
          >
            {dayRows.map((row, i) => (
              <Cell key={row.key} fill={CHART_BLUES[i % CHART_BLUES.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  const dense = clusters.length > 10;

  return (
    <div>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT.time}>
        <BarChart
          data={clusters}
          margin={{ top: 8, right: 8, bottom: 6, left: 0 }}
          barCategoryGap={CLUSTER_CATEGORY_GAP}
          barGap={CLUSTER_BAR_GAP}
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
              const lab = labels[p.index];
              if (!lab) return <g />;
              return (
                <g transform={`translate(${p.x},${p.y})`}>
                  <text
                    x={0}
                    dy={14}
                    textAnchor="middle"
                    fontSize={dense ? 9 : 11}
                    fill={BRAND.muted}
                  >
                    {lab.primary}
                  </text>
                  {lab.secondary ? (
                    <text
                      x={0}
                      dy={dense ? 26 : 30}
                      textAnchor="middle"
                      fontSize={dense ? 9 : 11}
                      fontWeight={600}
                      fill={BRAND.ink}
                    >
                      {lab.secondary}
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
            shared={false}
            cursor={false}
            offset={10}
            reverseDirection={{ y: true }}
            allowEscapeViewBox={{ x: true, y: true }}
            content={WeekDayBarTooltip}
          />
          {WEEKDAY_KEYS.map((day, i) => (
            <Bar
              key={day}
              dataKey={day}
              fill={CHART_BLUES[i % CHART_BLUES.length]}
              radius={[2, 2, 0, 0]}
              barSize={dense ? 7 : CLUSTER_BAR_SIZE}
              background={onBarClick ? BAR_HIT_BACKGROUND : false}
              cursor={onBarClick ? "pointer" : undefined}
              onClick={(event: unknown) => {
                const weekKey = (event as { payload?: { key?: string } }).payload
                  ?.key;
                if (!weekKey) return;
                onBarClick?.(weekdayDate(weekKey, day));
              }}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
