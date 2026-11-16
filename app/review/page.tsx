"use client";

import { Suspense, useMemo } from "react";
import {
  clearEntryCategory,
  markEntriesBillable,
  saveEntryOverride,
  saveMapping,
} from "@/app/review/actions";
import { PageError, PageLoading } from "@/components/PageStatus";
import { ReviewView, type ReviewPayload } from "@/components/review/ReviewView";
import { withRefetch } from "@/components/review/withRefetch";
import { useApiData } from "@/lib/api";
import { useAppendHubAccessToken } from "@/lib/hub/HubSessionContext";
import type { EntryRow } from "@/lib/types";

type DashboardPayload = {
  entries: EntryRow[];
};

function ReviewPageBody() {
  const entriesState = useApiData<DashboardPayload>("/api/dashboard");
  const reviewState = useApiData<ReviewPayload>("/api/review");
  const appendAuth = useAppendHubAccessToken();

  const actions = useMemo(
    () => ({
      saveMapping: withRefetch(saveMapping, appendAuth),
      saveEntry: withRefetch(saveEntryOverride, appendAuth),
      clearCategory: withRefetch(clearEntryCategory, appendAuth),
      markBillable: withRefetch(markEntriesBillable, appendAuth),
    }),
    [appendAuth]
  );

  if (entriesState.status === "loading" || reviewState.status === "loading") {
    return <PageLoading label="Loading review…" />;
  }
  if (entriesState.status === "error") {
    return <PageError message={entriesState.message} onRetry={entriesState.refetch} />;
  }
  if (reviewState.status === "error") {
    return <PageError message={reviewState.message} onRetry={reviewState.refetch} />;
  }

  return (
    <ReviewView
      entries={entriesState.data.entries}
      review={reviewState.data}
      saveMapping={actions.saveMapping}
      saveEntry={actions.saveEntry}
      clearCategory={actions.clearCategory}
      markBillable={actions.markBillable}
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
