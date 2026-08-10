"use client";

import { Suspense } from "react";
import { SettingsView } from "@/components/settings/SettingsView";
import { PageError, PageLoading } from "@/components/PageStatus";
import { invalidateApiCache, useApiData } from "@/lib/api";
import { useAppendHubAccessToken } from "@/lib/hub/HubSessionContext";
import type {
  Employee,
  EmployeeSchedule,
  StatHoliday,
  TimeOff,
} from "@/lib/types";
import type { ActionResult } from "@/app/settings/actions";
import {
  deleteEmployee,
  deleteHoliday,
  deleteTimeOff,
  saveEmployee,
  saveHoliday,
  saveSchedule,
  saveTimeOff,
} from "@/app/settings/actions";

type SettingsPayload = {
  employees: Employee[];
  schedules: EmployeeSchedule[];
  timeOff: TimeOff[];
  holidays: StatHoliday[];
  accessEnabled: boolean;
};

function withRefetch(
  action: (fd: FormData) => Promise<ActionResult>,
  appendAuth: (fd: FormData) => void
) {
  return async (fd: FormData): Promise<ActionResult> => {
    appendAuth(fd);
    const result = await action(fd);
    if (result.ok) {
      // Clears Home / People / Settings client caches and notifies mounted hooks.
      invalidateApiCache();
    }
    return result;
  };
}

export default function SettingsPage() {
  const state = useApiData<SettingsPayload>("/api/settings");
  const appendAuth = useAppendHubAccessToken();

  if (state.status === "loading") return <PageLoading label="Loading settings…" />;
  if (state.status === "error") {
    return <PageError message={state.message} onRetry={state.refetch} />;
  }

  return (
    <Suspense fallback={<PageLoading label="Loading settings…" />}>
      <SettingsView
        employees={state.data.employees}
        schedules={state.data.schedules}
        timeOff={state.data.timeOff}
        holidays={state.data.holidays}
        accessEnabled={state.data.accessEnabled}
        saveEmployee={withRefetch(saveEmployee, appendAuth)}
        deleteEmployee={withRefetch(deleteEmployee, appendAuth)}
        saveSchedule={withRefetch(saveSchedule, appendAuth)}
        saveTimeOff={withRefetch(saveTimeOff, appendAuth)}
        deleteTimeOff={withRefetch(deleteTimeOff, appendAuth)}
        saveHoliday={withRefetch(saveHoliday, appendAuth)}
        deleteHoliday={withRefetch(deleteHoliday, appendAuth)}
      />
    </Suspense>
  );
}
