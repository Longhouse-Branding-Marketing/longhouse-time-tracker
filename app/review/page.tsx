"use client";

import { Suspense, useMemo, useState } from "react";
import {
  clearEntryCategory,
  saveEntryOverride,
  saveMapping,
  updateEntries,
} from "@/app/review/actions";
import { PageError, PageLoading } from "@/components/PageStatus";
import { ReviewView, type ReviewPayload } from "@/components/review/ReviewView";
import { withRefetch } from "@/components/review/withRefetch";
import { useApiData } from "@/lib/api";
import { useAppendHubAccessToken } from "@/lib/hub/HubSessionContext";
import type { Employee, EntryRow } from "@/lib/types";

type DashboardPayload = {
  entries: EntryRow[];
  employees: Employee[];
};

function ReviewPageBody() {
  const entriesState = useApiData<DashboardPayload>("/api/dashboard");
  const reviewState = useApiData<ReviewPayload>("/api/review");
  const [entriesData, setEntriesData] = useState<DashboardPayload | null>(null);
  const [reviewData, setReviewData] = useState<ReviewPayload | null>(null);
  if (entriesState.status === "ready" && entriesState.data !== entriesData) {
    setEntriesData(entriesState.data);
  }
  if (reviewState.status === "ready" && reviewState.data !== reviewData) {
    setReviewData(reviewState.data);
  }
  const appendAuth = useAppendHubAccessToken();

  const actions = useMemo(
    () => ({
      saveMapping: withRefetch(saveMapping, appendAuth),
      saveEntry: withRefetch(saveEntryOverride, appendAuth),
      clearCategory: withRefetch(clearEntryCategory, appendAuth),
      updateEntries: withRefetch(updateEntries, appendAuth),
    }),
    [appendAuth]
  );

  if (!entriesData || !reviewData) {
    if (entriesState.status === "error") {
      return <PageError message={entriesState.message} onRetry={entriesState.refetch} />;
    }
    if (reviewState.status === "error") {
      return <PageError message={reviewState.message} onRetry={reviewState.refetch} />;
    }
    return <PageLoading label="Loading review…" />;
  }

  return (
    <ReviewView
      entries={entriesData.entries}
      employees={entriesData.employees}
      review={reviewData}
      saveMapping={actions.saveMapping}
      saveEntry={actions.saveEntry}
      clearCategory={actions.clearCategory}
      updateEntries={actions.updateEntries}
    />
  );
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading review…" />}>
      <ReviewPageBody />
    </Suspense>
  );
}
