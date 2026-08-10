"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Filters } from "./filtering";

export type DashboardFilterSnapshot = {
  filters: Filters | null;
  /** True when filters differ from full date-range / no dimension filters. */
  isActive: boolean;
  summary: string | null;
};

type DashboardFilterContextValue = DashboardFilterSnapshot & {
  setSnapshot: (next: DashboardFilterSnapshot) => void;
  clearSnapshot: () => void;
};

const EMPTY: DashboardFilterSnapshot = {
  filters: null,
  isActive: false,
  summary: null,
};

const DashboardFilterContext = createContext<DashboardFilterContextValue | null>(
  null
);

export function DashboardFilterProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshotState] =
    useState<DashboardFilterSnapshot>(EMPTY);

  const setSnapshot = useCallback((next: DashboardFilterSnapshot) => {
    setSnapshotState(next);
  }, []);

  const clearSnapshot = useCallback(() => {
    setSnapshotState(EMPTY);
  }, []);

  const value = useMemo(
    () => ({ ...snapshot, setSnapshot, clearSnapshot }),
    [snapshot, setSnapshot, clearSnapshot]
  );

  return (
    <DashboardFilterContext.Provider value={value}>
      {children}
    </DashboardFilterContext.Provider>
  );
}

export function useDashboardFilters(): DashboardFilterContextValue {
  const ctx = useContext(DashboardFilterContext);
  if (!ctx) {
    throw new Error(
      "useDashboardFilters must be used within DashboardFilterProvider"
    );
  }
  return ctx;
}

/** Human-readable one-liner for the chat panel filter toggle. */
export function summarizeFilters(f: Filters): string {
  const parts: string[] = [];
  if (f.from && f.to) parts.push(`${f.from} → ${f.to}`);
  if (f.people.length) parts.push(`${f.people.length} person(s)`);
  if (f.departments.length) parts.push(`${f.departments.length} dept(s)`);
  if (f.roles.length) parts.push(`${f.roles.length} role(s)`);
  if (f.tasks.length) parts.push(`${f.tasks.length} task(s)`);
  if (f.types.length) parts.push(`${f.types.length} type(s)`);
  return parts.join(" · ") || "All data";
}
