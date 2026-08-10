"use client";

import type { BillableSplit } from "@/lib/aggregate";
import { BILLABLE_COLORS } from "./chartTheme";
import { ProportionBreakdown } from "./ProportionBreakdown";

export function BillableDonut({ split }: { split: BillableSplit }) {
  return (
    <ProportionBreakdown
      heroName="Billable"
      heroPct={split.billablePct}
      slices={[
        { name: "Billable", hours: split.billableHours, color: BILLABLE_COLORS.billable },
        {
          name: "Non-Billable",
          hours: split.nonBillableHours,
          color: BILLABLE_COLORS.nonBillable,
        },
      ]}
    />
  );
}
