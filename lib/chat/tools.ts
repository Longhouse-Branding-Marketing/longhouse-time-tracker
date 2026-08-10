import {
  chooseGranularity,
  computeByDimension,
  computePersonSummaries,
  computeSummary,
  computeTimeSeries,
  computeWorkingDayAvg,
  type Granularity,
} from "@/lib/aggregate";
import { getDashboardBundle } from "@/lib/bundles";
import {
  applyFilters,
  dateBounds,
  extractOptions,
  type Filters,
} from "@/lib/filtering";
import { n } from "@/lib/formatters";
import { KPI_EXCLUDED_STATUS } from "@/lib/types";
import { mergeSliceFilters, type SliceFilters } from "./filters";

export type ChatToolContext = {
  baseFilters: Filters | null;
  useDashboardFilters: boolean;
};

async function loadSlice(ctx: ChatToolContext, override: SliceFilters = {}) {
  const bundle = await getDashboardBundle();
  const activePeople = new Set(
    bundle.employees.filter((e) => e.active).map((e) => e.person)
  );
  const activeEntries = bundle.entries.filter((r) => activePeople.has(r.person));
  const filters = mergeSliceFilters(
    ctx.baseFilters,
    ctx.useDashboardFilters,
    override
  );
  const rows = applyFilters(activeEntries, filters);
  const eligiblePeople = bundle.kpis
    .filter((k) => k.status !== KPI_EXCLUDED_STATUS)
    .map((k) => k.person);

  return { bundle, activeEntries, filters, rows, eligiblePeople };
}

export async function buildCatalog(ctx: ChatToolContext) {
  const { bundle, activeEntries, filters } = await loadSlice(ctx);
  const bounds = dateBounds(activeEntries);
  const options = extractOptions(activeEntries);
  return {
    date_span: bounds,
    active_people: options.people,
    departments: options.departments,
    roles: options.roles.slice(0, 40),
    tasks_sample: options.tasks.slice(0, 40),
    types: options.types,
    total_entries: activeEntries.length,
    dashboard_filters_applied: ctx.useDashboardFilters,
    effective_filters: filters,
    people_kpi_count: bundle.kpis.filter(
      (k) => k.status !== KPI_EXCLUDED_STATUS
    ).length,
  };
}

export async function toolGetSummary(
  ctx: ChatToolContext,
  args: SliceFilters
) {
  const { rows, filters, eligiblePeople, bundle } = await loadSlice(ctx, args);
  const summary = computeSummary(rows);
  const workingDayAvg = computeWorkingDayAvg(
    rows,
    bundle.dailyTracking,
    filters,
    eligiblePeople
  );
  return {
    filters,
    ...summary,
    avg_working_day_hours: Math.round(workingDayAvg * 10) / 10,
  };
}

export async function toolGetPeopleStatus(
  ctx: ChatToolContext,
  args: SliceFilters & { people?: string[]; status?: string }
) {
  const { bundle, filters } = await loadSlice(ctx, args);
  let kpis = bundle.kpis.filter((k) => k.status !== KPI_EXCLUDED_STATUS);

  const peopleFilter =
    args.people?.length
      ? new Set(args.people)
      : filters.people.length
        ? new Set(filters.people)
        : null;
  if (peopleFilter) {
    kpis = kpis.filter((k) => peopleFilter.has(k.person));
  }
  if (args.status) {
    const needle = args.status.toLowerCase();
    kpis = kpis.filter((k) => k.status.toLowerCase().includes(needle));
  }

  return {
    filters,
    people: kpis.map((k) => ({
      person: k.person,
      tracked_hours: n(k.tracked_hours),
      counted_working_days: n(k.counted_working_days),
      avg_working_day: n(k.avg_working_day),
      median_active_day: n(k.median_active_day),
      status: k.status,
      context: k.context,
    })),
  };
}

export async function toolBreakdown(
  ctx: ChatToolContext,
  args: SliceFilters & {
    dimension?: "department" | "role" | "task" | "type" | "person";
    limit?: number;
  }
) {
  const { rows, filters } = await loadSlice(ctx, args);
  const dimension = args.dimension ?? "department";
  const limit = Math.min(Math.max(args.limit ?? 15, 1), 40);

  if (dimension === "person") {
    return {
      filters,
      dimension,
      rows: computePersonSummaries(rows).slice(0, limit),
    };
  }

  return {
    filters,
    dimension,
    rows: computeByDimension(rows, dimension).slice(0, limit),
  };
}

export async function toolTimeSeries(
  ctx: ChatToolContext,
  args: SliceFilters & { granularity?: Granularity }
) {
  const { rows, filters } = await loadSlice(ctx, args);
  const granularity =
    args.granularity ??
    chooseGranularity(filters.from || "2026-01-01", filters.to || "2026-12-31");
  return {
    filters,
    granularity,
    points: computeTimeSeries(rows, granularity, filters.from, filters.to),
  };
}

export async function toolSampleEntries(
  ctx: ChatToolContext,
  args: SliceFilters & { limit?: number }
) {
  const { rows, filters } = await loadSlice(ctx, args);
  const limit = Math.min(Math.max(args.limit ?? 25, 1), 40);
  const sample = rows.slice(0, limit).map((r) => ({
    id: r.id,
    person: r.person,
    date: r.date,
    hours: n(r.hours),
    department: r.department,
    role: r.role,
    task: r.task,
    type: r.type,
    billable: r.billable,
  }));
  return {
    filters,
    matched_entries: rows.length,
    returned: sample.length,
    entries: sample,
  };
}
