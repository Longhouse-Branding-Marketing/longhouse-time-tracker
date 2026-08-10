"use client";

import { PeopleConsistencyView } from "@/components/people/PeopleConsistencyView";
import { PageError, PageLoading } from "@/components/PageStatus";
import { useApiData } from "@/lib/api";
import type { Employee, OperationsKpi } from "@/lib/types";

type PeoplePayload = {
  kpis: OperationsKpi[];
  employees: Employee[];
};

export default function PeoplePage() {
  const state = useApiData<PeoplePayload>("/api/people");

  if (state.status === "loading") return <PageLoading label="Loading people…" />;
  if (state.status === "error") {
    return <PageError message={state.message} onRetry={state.refetch} />;
  }

  return (
    <PeopleConsistencyView
      kpis={state.data.kpis}
      employees={state.data.employees}
    />
  );
}
