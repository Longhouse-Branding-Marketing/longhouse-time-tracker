"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { hours as fmtHours, pct } from "@/lib/formatters";
import { ChartEmpty } from "./ChartEmpty";

export interface ProportionSlice {
  name: string;
  hours: number;
  color: string;
}

export function ProportionBreakdown({
  slices,
  heroName,
  heroPct,
}: {
  slices: ProportionSlice[];
  heroName: string;
  heroPct: number;
}) {
  const total = slices.reduce((sum, s) => sum + s.hours, 0);
  if (total <= 0) return <ChartEmpty />;

  const withShare = slices.map((s) => ({
    ...s,
    share: total > 0 ? Math.round((100 * s.hours) / total) : 0,
  }));

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
      <div className="shrink-0 sm:w-[120px]">
        <div className="font-sans text-[28px] font-normal leading-none tracking-normal tabular-nums text-accent-deep">
          {pct(heroPct)}
        </div>
        <div className="mt-1.5 text-[13px] leading-snug text-muted">{heroName}</div>
      </div>

      <div className="relative mx-auto h-[108px] w-[108px] shrink-0 sm:mx-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={withShare}
              dataKey="hours"
              nameKey="name"
              innerRadius={36}
              outerRadius={50}
              startAngle={90}
              endAngle={-270}
              paddingAngle={withShare.length > 1 ? 3 : 0}
              cornerRadius={6}
              stroke="none"
            >
              {withShare.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="min-w-0 flex-1 space-y-3">
        {withShare.map((s) => (
          <LegendRow
            key={s.name}
            color={s.color}
            label={s.name}
            value={s.hours}
            share={s.share}
          />
        ))}
      </div>
    </div>
  );
}

function LegendRow({
  color,
  label,
  value,
  share,
}: {
  color: string;
  label: string;
  value: number;
  share: number;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-start gap-x-3 text-[13px]">
      <span
        className="mt-1 h-2.5 w-2.5 shrink-0 rounded-[3px]"
        style={{ backgroundColor: color }}
      />
      <span className="font-medium leading-snug text-ink">{label}</span>
      <span className="shrink-0 text-right tabular-nums text-muted">
        {fmtHours(value)} · {pct(share)}
      </span>
    </div>
  );
}
