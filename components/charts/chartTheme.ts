import { BRAND } from "@/lib/brand";

export const CHART_HEIGHT = {
  time: 260,
  bars: 280,
  daily: 220,
  donut: 132,
} as const;

export const AXIS_TICK = { fill: BRAND.muted, fontSize: 11 } as const;
export const GRID_STROKE = BRAND.line;

/** Primary bar / series fill — brand navy for high-impact dashboard charts. */
export const BAR_FILL = BRAND.brand;

/** Billable donut: brand navy vs soft companion tint. */
export const BILLABLE_COLORS = {
  billable: BRAND.brand,
  nonBillable: BRAND.accentSoft,
} as const;

export const TOOLTIP_STYLE = {
  borderRadius: 8,
  border: `1px solid ${BRAND.line}`,
  fontSize: 12,
  padding: "8px 12px",
  boxShadow: "0 8px 24px rgba(2,22,61,0.08)",
  backgroundColor: BRAND.white,
} as const;

export const TOOLTIP_LABEL_STYLE = {
  color: BRAND.ink,
  fontWeight: 600,
  marginBottom: 4,
  fontSize: 12,
} as const;

/** Compact hours label for axes and bar labels, e.g. "1.2k" / "84". */
export function hoursTick(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return `${Math.round(v)}`;
}
