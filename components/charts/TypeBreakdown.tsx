"use client";

import { useMemo, useRef, useState, type MouseEvent } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { BRAND, CHART_BLUES } from "@/lib/brand";
import { hours as fmtHours, n, pct } from "@/lib/formatters";
import type { EntryRow } from "@/lib/types";
import { ChartEmpty } from "./ChartEmpty";

const PIE_SIZE = 300;
const INNER = 85;
const OUTER = 140;

interface Slice {
  name: string;
  hours: number;
  color: string;
}

function aggregateTypes(rows: EntryRow[]): Slice[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (!row.type) continue;
    map.set(row.type, (map.get(row.type) ?? 0) + n(row.hours));
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, hours], i) => ({
      name,
      hours,
      color: CHART_BLUES[i % CHART_BLUES.length],
    }));
}

function aggregateTasks(rows: EntryRow[], type: string): Slice[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (row.type !== type || !row.task) continue;
    map.set(row.task, (map.get(row.task) ?? 0) + n(row.hours));
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, hours], i) => ({
      name,
      hours,
      color: CHART_BLUES[i % CHART_BLUES.length],
    }));
}

export function TypeBreakdown({ rows }: { rows: EntryRow[] }) {
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{
    name: string;
    x: number;
    y: number;
  } | null>(null);
  const chartHostRef = useRef<HTMLDivElement>(null);

  const types = useMemo(() => aggregateTypes(rows), [rows]);
  const total = useMemo(
    () => types.reduce((sum, t) => sum + t.hours, 0),
    [types]
  );

  const tasks = useMemo(
    () => (selectedType ? aggregateTasks(rows, selectedType) : []),
    [rows, selectedType]
  );

  if (total <= 0) return <ChartEmpty />;

  const selectedTypeSlice = selectedType
    ? types.find((t) => t.name === selectedType)
    : null;
  const selectedTaskSlice = selectedTask
    ? tasks.find((t) => t.name === selectedTask)
    : null;

  const centerHours = selectedTaskSlice
    ? selectedTaskSlice.hours
    : selectedTypeSlice
      ? selectedTypeSlice.hours
      : total;

  const panelLabel = selectedTask
    ? "Task"
    : selectedType
      ? "Task"
      : "Task Type";

  const panelItems: Slice[] = selectedTask
    ? tasks.filter((t) => t.name === selectedTask)
    : selectedType
      ? tasks
      : types;

  const reset = () => {
    setSelectedType(null);
    setSelectedTask(null);
  };

  /** One level up — same pattern as the sunburst center "Back". */
  const zoomOut = () => {
    if (selectedTask) {
      setSelectedTask(null);
      return;
    }
    if (selectedType) {
      setSelectedType(null);
    }
  };

  const drilledIn = !!selectedType || !!selectedTask;

  const selectType = (name: string) => {
    if (selectedType === name && !selectedTask) {
      zoomOut();
      return;
    }
    setSelectedTask(null);
    setSelectedType(name);
  };

  const selectTask = (name: string) => {
    if (selectedTask === name) {
      zoomOut();
      return;
    }
    setSelectedTask(name);
  };

  const moveTooltip = (name: string, event: MouseEvent) => {
    const host = chartHostRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    setTooltip({
      name,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
  };

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-12">
      <div
        ref={chartHostRef}
        className="relative mx-auto shrink-0 lg:mx-0"
        style={{ width: PIE_SIZE, height: PIE_SIZE }}
        onMouseLeave={() => setTooltip(null)}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={types}
              dataKey="hours"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={INNER}
              outerRadius={OUTER}
              startAngle={90}
              endAngle={-270}
              paddingAngle={types.length > 1 ? 2 : 0}
              cornerRadius={5}
              stroke="none"
              onClick={(_, index) => {
                const slice = types[index];
                if (slice) selectType(slice.name);
              }}
              onMouseEnter={(data, _index, event) => {
                const name =
                  typeof data?.name === "string"
                    ? data.name
                    : String(data?.payload?.name ?? "");
                if (name) moveTooltip(name, event);
              }}
              onMouseMove={(data, _index, event) => {
                const name =
                  typeof data?.name === "string"
                    ? data.name
                    : String(data?.payload?.name ?? "");
                if (name) moveTooltip(name, event);
              }}
              onMouseLeave={() => setTooltip(null)}
            >
              {types.map((d) => {
                const active =
                  !selectedType ||
                  d.name === selectedType ||
                  (selectedTask && d.name === selectedType);
                const isSelected = d.name === selectedType;
                return (
                  <Cell
                    key={d.name}
                    fill={d.color}
                    opacity={active ? 1 : 0.22}
                    stroke={isSelected ? BRAND.white : undefined}
                    strokeWidth={isSelected ? 2.5 : 0}
                    style={{ cursor: "pointer" }}
                  />
                );
              })}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        <button
          type="button"
          className={`absolute left-1/2 top-1/2 flex h-[120px] w-[120px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-card text-center ${
            drilledIn ? "cursor-pointer" : ""
          }`}
          onClick={zoomOut}
          onMouseEnter={() => setTooltip(null)}
          aria-label={drilledIn ? "Back" : "Hours total"}
        >
          <span className="text-[22px] font-semibold tabular-nums leading-none text-ink">
            {fmtHours(centerHours).replace(" h", "")}
          </span>
          <span className="mt-1.5 max-w-[104px] break-words text-[11px] font-medium leading-tight text-muted">
            {drilledIn ? "Back" : "Hours"}
          </span>
        </button>

        {tooltip ? (
          <div
            className="pointer-events-none absolute z-10 max-w-[220px] truncate rounded-md border border-line bg-card px-2.5 py-1.5 text-[12px] font-medium text-ink shadow-[0_4px_12px_rgba(2,22,61,0.12)]"
            style={{
              left: tooltip.x + 12,
              top: tooltip.y + 12,
            }}
          >
            {tooltip.name}
          </div>
        ) : null}
      </div>

      <div className="w-full min-w-0 flex-1">
        {drilledIn ? (
          <div className="lh-breadcrumb mb-3 flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <button
              type="button"
              className="text-brand-600 hover:underline"
              onClick={reset}
            >
              All
            </button>
            {selectedType ? (
              <span className="inline-flex items-center gap-x-1.5">
                <span className="text-muted">›</span>
                <button
                  type="button"
                  className={
                    selectedTask
                      ? "text-brand-600 hover:underline"
                      : "font-semibold text-ink"
                  }
                  onClick={() => setSelectedTask(null)}
                >
                  {selectedType}
                </button>
              </span>
            ) : null}
            {selectedTask ? (
              <span className="inline-flex items-center gap-x-1.5">
                <span className="text-muted">›</span>
                <span className="font-semibold text-ink">{selectedTask}</span>
              </span>
            ) : null}
            <button
              type="button"
              onClick={reset}
              className="ml-2 rounded-md px-2 py-0.5 font-semibold text-brand-600 transition-colors hover:bg-tint"
            >
              Reset
            </button>
          </div>
        ) : null}

        <h3 className="lh-section-title">{panelLabel}</h3>

        <ul className="lh-scroll mt-2 max-h-[300px] space-y-0.5 overflow-y-auto pr-1">
          {panelItems.map((item) => {
            const share = total > 0 ? Math.round((100 * item.hours) / total) : 0;
            const isActive = selectedType
              ? item.name === selectedTask
              : item.name === selectedType;
            return (
              <li key={item.name}>
                <button
                  type="button"
                  className={`grid w-full grid-cols-[auto_1fr_auto] items-start gap-x-2 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-tint ${
                    isActive ? "bg-tint" : ""
                  }`}
                  onClick={() => {
                    if (selectedType) selectTask(item.name);
                    else selectType(item.name);
                  }}
                >
                  <span
                    className="mt-0.5 h-2 w-2 shrink-0 rounded-[2px]"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-[12px] leading-snug text-ink">
                    {item.name}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted">
                    {fmtHours(item.hours)} · {pct(share)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
