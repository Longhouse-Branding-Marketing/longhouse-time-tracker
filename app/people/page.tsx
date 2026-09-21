"use client";

import { PeopleConsistencyView } from "@/components/people/PeopleConsistencyView";
import { PageError, PageLoading } from "@/components/PageStatus";
import { useApiData } from "@/lib/api";
import type {
  Employee,
  EntryRow,
  OperationsKpi,
  PersonDailyTracking,
} from "@/lib/types";

type DashboardPayload = {
  entries: EntryRow[];
  employees: Employee[];
  kpis: OperationsKpi[];
  dailyTracking: PersonDailyTracking[];
};

export default function PeoplePage() {
  const state = useApiData<DashboardPayload>("/api/dashboard");

  if (state.status === "loading") return <PageLoading label="Loading people…" />;
  if (state.status === "error") {
    return <PageError message={state.message} onRetry={state.refetch} />;
  }

  return (
    <PeopleConsistencyView
      entries={state.data.entries}
      employees={state.data.employees}
      kpis={state.data.kpis}
      dailyTracking={state.data.dailyTracking}
    />
  );
}
