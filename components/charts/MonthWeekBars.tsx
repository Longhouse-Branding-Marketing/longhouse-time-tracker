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
import { formatDateShort, formatMonth, hours as fmtHours } from "@/lib/formatters";
import {
  MONTH_WEEK_KEYS,
  computeMonthWeekClusters,
  type MonthWeekCluster,
  type MonthWeekKey,
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
  SINGLE_BAR_SIZE,
  SINGLE_CATEGORY_GAP,
  handleChartBarClick,
} from "./hoursChartShared";

function MonthWeekBarTooltip(props: TooltipContentProps) {
  const { active, payload } = props;
  if (!active || !payload?.length) return null;

  const entry = payload[0];
  const weekSlot = entry.dataKey as MonthWeekKey | undefined;
  const cluster = entry.payload as MonthWeekCluster | undefined;
  const value = Number(entry.value);
  if (!cluster || !weekSlot || !Number.isFinite(value) || value <= 0) return null;

  const idx = MONTH_WEEK_KEYS.indexOf(weekSlot);
  const weekKey = idx >= 0 ? cluster.weekKeys[idx] : null;
  if (!weekKey) return null;

  return (
    <div style={TOOLTIP_STYLE}>
      <div style={{ ...TOOLTIP_LABEL_STYLE, marginBottom: 2 }}>
        Week of {formatDateShort(weekKey)}
      </div>
      <div style={{ fontSize: 12, color: BRAND.ink }}>{fmtHours(value)}</div>
    </div>
  );
}

function monthAxisLabels(clusters: MonthWeekCluster[]) {
  return clusters.map((c) => ({
    key: c.key,
    primary: formatMonth(c.key).split(" ")[0] ?? c.key,
    secondary: c.key.slice(0, 4),
  }));
}

export function MonthWeekBars({
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
    () => computeMonthWeekClusters(rows, scopeFrom, scopeTo),
    [rows, scopeFrom, scopeTo]
  );
  const labels = useMemo(() => monthAxisLabels(clusters), [clusters]);

  if (clusters.every((c) => c.hours <= 0)) return <ChartEmpty />;

  // One month in scope → labeled W1–Wn bars (same shape as week→day drill).
  if (clusters.length === 1) {
    const cluster = clusters[0];
    const weekRows = MONTH_WEEK_KEYS.map((slot, i) => {
      const weekKey = cluster.weekKeys[i];
      if (!weekKey) return null;
      return {
        key: weekKey,
        label: `W${i + 1}`,
        hours: cluster[slot],
      };
    }).filter((row): row is { key: string; label: string; hours: number } =>
      Boolean(row)
    );

    if (weekRows.every((r) => r.hours <= 0)) return <ChartEmpty />;

    return (
      <ResponsiveContainer width="100%" height={CHART_HEIGHT.time}>
        <BarChart
          data={weekRows}
          margin={{ top: 8, right: 8, bottom: 6, left: 0 }}
          barCategoryGap={SINGLE_CATEGORY_GAP}
          onClick={(state) => handleChartBarClick(state, weekRows, onBarClick)}
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
              return key ? `Week of ${formatDateShort(key)}` : "";
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
            {weekRows.map((row, i) => (
              <Cell key={row.key} fill={CHART_BLUES[i % CHART_BLUES.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  const dense = clusters.length > 10;
  const weekSlotCount = Math.max(
    1,
    ...clusters.map((c) => c.weekKeys.filter(Boolean).length)
  );
  const activeWeekKeys = MONTH_WEEK_KEYS.slice(0, Math.min(6, weekSlotCount));

  return (
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
          content={MonthWeekBarTooltip}
        />
        {activeWeekKeys.map((week, i) => (
          <Bar
            key={week}
            dataKey={week}
            fill={CHART_BLUES[i % CHART_BLUES.length]}
            radius={[2, 2, 0, 0]}
            barSize={dense ? 7 : CLUSTER_BAR_SIZE}
            background={onBarClick ? BAR_HIT_BACKGROUND : false}
            cursor={onBarClick ? "pointer" : undefined}
            onClick={(event: unknown) => {
              const cluster = (event as { payload?: MonthWeekCluster }).payload;
              if (!cluster) return;
              const weekKey = cluster.weekKeys[i];
              if (weekKey) onBarClick?.(weekKey);
            }}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
