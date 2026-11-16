"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ActionResult } from "@/app/review/actions";
import { Badge, EmptyRow, PageHeader, PageShell, Panel } from "@/components/ui";
import {
  entryMatchesMapping,
  indexFromReview,
  isPartnerBillableReview,
  mappingList,
  type CatalogIssue,
  type MappingListRow,
  type ReviewCatalog,
  type TaskRow,
} from "@/lib/categoryMap";
import { formatDate, hours } from "@/lib/formatters";
import type { EntryRow } from "@/lib/types";
import { EntryEditor } from "./EntryEditor";
import { MappingEditor } from "./MappingEditor";

type SaveAction = (fd: FormData) => Promise<ActionResult>;

export type ReviewPayload = {
  tasks: TaskRow[];
  departments: { oldName: string; newName: string }[];
  activityNames: string[];
  catalog: ReviewCatalog;
  checks: CatalogIssue[];
};

type Section = "Mappings" | "Entries" | "Checks";
type MappingFilter = "Unmapped" | "Confirmed" | "Exceptions";
type EntryFilter = "All" | "Unmapped" | "Partner Review" | "Exceptions";

const PAGE_SIZE = 200;

const SECTIONS: Section[] = ["Mappings", "Entries", "Checks"];
const MAPPING_FILTERS: MappingFilter[] = ["Unmapped", "Confirmed", "Exceptions"];
const ENTRY_FILTERS: EntryFilter[] = ["All", "Unmapped", "Partner Review", "Exceptions"];

function blank(value: string | null | undefined): string {
  const text = value?.trim();
  return text ? text : "—";
}

function matchesQuery(query: string, values: Array<string | null | undefined>): boolean {
  if (!query) return true;
  return values.some((value) => (value ?? "").toLowerCase().includes(query));
}

export function ReviewView({
  entries,
  review,
  saveMapping,
  saveEntry,
  clearCategory,
  markBillable,
}: {
  entries: EntryRow[];
  review: ReviewPayload;
  saveMapping: SaveAction;
  saveEntry: SaveAction;
  clearCategory: SaveAction;
  markBillable: SaveAction;
}) {
  const searchParams = useSearchParams();
  const index = useMemo(() => indexFromReview(review), [review]);
  const mappings = useMemo(() => mappingList(index, entries), [index, entries]);
  const requestedMapping = useMemo(() => {
    const rule = searchParams.get("rule");
    const unmapped = searchParams.get("unmapped");
    if (rule) return mappings.find((item) => item.ruleId === rule) ?? null;
    if (unmapped) return mappings.find((item) => item.key === `unmapped:${unmapped}`) ?? null;
    return null;
  }, [mappings, searchParams]);

  const [section, setSection] = useState<Section>("Mappings");
  const [mappingFilter, setMappingFilter] = useState<MappingFilter>("Unmapped");
  const [entryFilter, setEntryFilter] = useState<EntryFilter>("All");
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<MappingListRow | null>(null);
  const [mappingChoice, setMappingChoice] = useState<MappingListRow | null>(null);
  const [queryDismissed, setQueryDismissed] = useState(false);
  const [entry, setEntry] = useState<EntryRow | null>(null);
  const [markError, setMarkError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const mapping = queryDismissed ? mappingChoice : (mappingChoice ?? requestedMapping);
  const listKey = `${section}|${mappingFilter}|${entryFilter}|${query}|${scope?.key ?? ""}`;
  const [pageState, setPageState] = useState({ key: listKey, page: 0 });
  const page = pageState.key === listKey ? pageState.page : 0;

  function setPage(next: number) {
    setPageState({ key: listKey, page: next });
  }

  function chooseMapping(row: MappingListRow | null) {
    setQueryDismissed(true);
    setMappingChoice(row);
  }

  const needle = query.trim().toLowerCase();

  const visibleMappings = useMemo(() => {
    return mappings.filter((row) => {
      if (mappingFilter === "Unmapped" && row.status !== "unmapped") return false;
      if (mappingFilter === "Confirmed" && row.status !== "confirmed") return false;
      if (mappingFilter === "Exceptions" && row.exceptions === 0) return false;
      return matchesQuery(needle, [
        row.department,
        row.role,
        row.task,
        row.newDepartment,
        row.newRole,
        row.activityType,
      ]);
    });
  }, [mappingFilter, mappings, needle]);

  const visibleEntries = useMemo(() => {
    return entries.filter((row) => {
      if (scope && !entryMatchesMapping(row, scope, index)) return false;
      if (entryFilter === "Unmapped" && row.mapping_status !== "unmapped") return false;
      if (entryFilter === "Exceptions" && row.mapping_status !== "override") return false;
      if (entryFilter === "Partner Review" && !isPartnerBillableReview(row)) return false;
      return matchesQuery(needle, [
        row.person,
        row.department,
        row.role,
        row.type,
        row.raw_task,
        row.billable,
      ]);
    });
  }, [entries, entryFilter, index, needle, scope]);

  const pageCount = Math.max(1, Math.ceil(visibleEntries.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageEntries = visibleEntries.slice(
    currentPage * PAGE_SIZE,
    currentPage * PAGE_SIZE + PAGE_SIZE
  );

  function openMappingForEntry(row: EntryRow) {
    const match = mappings.find((item) => entryMatchesMapping(row, item, index));
    if (!match) return;
    setEntry(null);
    setSection("Mappings");
    chooseMapping(match);
  }

  async function onMarkBillable() {
    const fd = new FormData();
    fd.set("entry_ids", JSON.stringify(visibleEntries.map((row) => row.id)));
    setMarking(true);
    setMarkError(null);
    const result = await markBillable(fd);
    setMarking(false);
    if (!result.ok) setMarkError(result.error ?? "Save failed");
  }

  const countLabel =
    section === "Mappings"
      ? visibleMappings.length.toLocaleString()
      : section === "Entries"
        ? visibleEntries.length.toLocaleString()
        : review.checks.length.toLocaleString();

  return (
    <PageShell>
      <PageHeader title="Review">
        <div className="flex rounded-lg border border-line bg-tint p-0.5">
          {SECTIONS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setSection(item)}
              className={`h-8 rounded-md px-3 text-[13px] font-medium ${
                section === item ? "bg-card text-ink shadow-sm" : "text-muted hover:text-ink"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </PageHeader>

      <Panel
        title={section}
        className="mt-5"
        noBodyPadding
        right={<span className="text-[12px] tabular-nums text-muted">{countLabel}</span>}
      >
        {section !== "Checks" ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
            {(section === "Mappings" ? MAPPING_FILTERS : ENTRY_FILTERS).map((item) => {
              const active = section === "Mappings" ? mappingFilter === item : entryFilter === item;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    if (section === "Mappings") setMappingFilter(item as MappingFilter);
                    else setEntryFilter(item as EntryFilter);
                  }}
                  className={`h-8 rounded-md px-2.5 text-[13px] font-medium ${
                    active
                      ? "bg-navy text-white"
                      : "border border-line bg-card text-muted hover:text-ink"
                  }`}
                >
                  {item}
                </button>
              );
            })}
            {scope ? (
              <button
                type="button"
                onClick={() => setScope(null)}
                className="h-8 rounded-md border border-line bg-card px-2.5 text-[13px] font-medium text-ink hover:bg-tint"
              >
                {scope.task || "Task"} ×
              </button>
            ) : null}
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search"
              placeholder="Search"
              className="h-8 min-w-[160px] flex-1 rounded-md border border-line bg-card px-2.5 text-[13px] text-ink outline-none placeholder:text-muted focus:border-brand-600 focus:ring-3 focus:ring-brand-600/15"
            />
            {section === "Entries" && entryFilter === "Partner Review" && visibleEntries.length > 0 ? (
              <button
                type="button"
                onClick={onMarkBillable}
                disabled={marking}
                className="h-8 rounded-md bg-brand px-3 text-[13px] font-medium text-white hover:bg-navy disabled:opacity-50"
              >
                {marking
                  ? "Saving…"
                  : `Mark ${visibleEntries.length.toLocaleString()} Billable`}
              </button>
            ) : null}
            {section === "Entries" && pageCount > 1 ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage(Math.max(0, currentPage - 1))}
                  disabled={currentPage === 0}
                  className="h-8 rounded-md border border-line px-2.5 text-[13px] font-medium text-muted hover:bg-tint disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage(Math.min(pageCount - 1, currentPage + 1))}
                  disabled={currentPage >= pageCount - 1}
                  className="h-8 rounded-md border border-line px-2.5 text-[13px] font-medium text-muted hover:bg-tint disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            ) : null}
            {markError ? <span className="text-[12px] text-serious">{markError}</span> : null}
          </div>
        ) : null}

        {section === "Mappings" ? (
          visibleMappings.length === 0 ? (
            <EmptyRow>
              {mappingFilter === "Unmapped"
                ? "No Unmapped Entries"
                : mappingFilter === "Exceptions"
                  ? "No Exceptions"
                  : "No Confirmed Mappings"}
            </EmptyRow>
          ) : (
            <div className="lh-scroll max-h-[min(70vh,760px)] overflow-auto">
              <table className="lh-table">
                <thead>
                  <tr>
                    <th>Department</th>
                    <th>Role</th>
                    <th>Task</th>
                    <th>Activity Type</th>
                    <th className="text-right">Entries</th>
                    <th className="text-right">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleMappings.map((row) => (
                    <tr
                      key={row.key}
                      tabIndex={0}
                      className="cursor-pointer"
                      onClick={() => chooseMapping(row)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") chooseMapping(row);
                      }}
                    >
                      <td>{blank(row.department)}</td>
                      <td>{blank(row.role)}</td>
                      <td className="font-medium text-ink">{blank(row.task)}</td>
                      <td>
                        <span className="inline-flex items-center gap-2">
                          {blank(row.activityType)}
                          {row.exceptions > 0 ? <Badge tone="review">Exception</Badge> : null}
                        </span>
                      </td>
                      <td className="text-right tabular-nums">{row.entries.toLocaleString()}</td>
                      <td className="text-right tabular-nums">{hours(row.hours)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}

        {section === "Entries" ? (
          pageEntries.length === 0 ? (
            <EmptyRow>No Entries</EmptyRow>
          ) : (
            <div className="lh-scroll max-h-[min(70vh,760px)] overflow-auto">
              <table className="lh-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Person</th>
                    <th className="text-right">Hours</th>
                    <th>Department</th>
                    <th>Role</th>
                    <th>Activity Type</th>
                    <th>Billable</th>
                  </tr>
                </thead>
                <tbody>
                  {pageEntries.map((row) => (
                    <tr
                      key={row.id}
                      tabIndex={0}
                      className="cursor-pointer"
                      onClick={() => setEntry(row)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") setEntry(row);
                      }}
                    >
                      <td className="whitespace-nowrap tabular-nums">{formatDate(row.date)}</td>
                      <td>{row.person}</td>
                      <td className="text-right tabular-nums">{hours(row.hours)}</td>
                      <td>{blank(row.department)}</td>
                      <td>{blank(row.role)}</td>
                      <td>
                        <span className="inline-flex items-center gap-2">
                          {blank(row.type)}
                          {row.mapping_status === "override" ? (
                            <Badge tone="review">Exception</Badge>
                          ) : null}
                        </span>
                      </td>
                      <td>{blank(row.billable)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}

        {section === "Checks" ? (
          review.checks.length === 0 ? (
            <EmptyRow>No Checks</EmptyRow>
          ) : (
            <div className="lh-scroll max-h-[min(70vh,760px)] overflow-auto">
              <table className="lh-table">
                <thead>
                  <tr>
                    <th>Check</th>
                    <th>Name</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {review.checks.map((issue) => (
                    <tr key={`${issue.kind}\0${issue.name}\0${issue.detail}`}>
                      <td>{issue.kind}</td>
                      <td className="font-medium text-ink">{issue.name}</td>
                      <td className="text-muted">{issue.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </Panel>

      {mapping ? (
        <MappingEditor
          mapping={mapping}
          catalog={review.catalog}
          saveAction={saveMapping}
          onClose={() => chooseMapping(null)}
          onViewEntries={() => {
            setScope(mapping);
            setSection("Entries");
            setEntryFilter("All");
            setQuery("");
            chooseMapping(null);
          }}
        />
      ) : null}

      {entry ? (
        <EntryEditor
          entry={entry}
          index={index}
          catalog={review.catalog}
          saveAction={saveEntry}
          clearAction={clearCategory}
          onClose={() => setEntry(null)}
          onEditMapping={() => openMappingForEntry(entry)}
        />
      ) : null}
    </PageShell>
  );
}
