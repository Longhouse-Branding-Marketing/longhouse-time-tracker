"use client";

import { ReviewView } from "@/components/review/ReviewView";
import { PageError, PageLoading } from "@/components/PageStatus";
import { useApiData } from "@/lib/api";
import type { MappedFields } from "@/lib/categoryMap";
import type { EntryRow } from "@/lib/types";

type DashboardPayload = {
  entries: Array<EntryRow & MappedFields>;
};

export default function ReviewPage() {
  const state = useApiData<DashboardPayload>("/api/dashboard");

  if (state.status === "loading") return <PageLoading label="Loading review…" />;
  if (state.status === "error") {
    return <PageError message={state.message} onRetry={state.refetch} />;
  }

  return <ReviewView entries={state.data.entries} />;
}
