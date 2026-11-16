"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CaretLeftIcon, CaretRightIcon, XIcon } from "@phosphor-icons/react";
import type { ActionResult } from "@/app/review/actions";
import { FilterBar } from "@/components/FilterBar";
import { MultiSelect } from "@/components/MultiSelect";
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
import {
  applyFilters,
  dateBounds,
  defaultFilters,
  extractOptions,
  type Filters,
} from "@/lib/filtering";
import { formatDate, hours } from "@/lib/formatters";
import type { EntryRow } from "@/lib/types";
import { EntryEditor } from "./EntryEditor";
import { MappingEditor } from "./MappingEditor";

type SaveAction = (fd: FormData) => Promise<ActionResult>;

export type ReviewPayload = {
  comments?: Array<{ id: number; comments: string }>;
  tasks: TaskRow[];
  departments: { oldName: string; newName: string }[];
  activityNames: string[];
  catalog: ReviewCatalog;
  checks: CatalogIssue[];
};

type Section = "Mappings" | "Entries" | "Checks";
type MappingFilter = "Unmapped" | "Confirmed" | "Exceptions";
type EntryFilter = "All" | "Unmapped" | "Exceptions";

const PAGE_SIZE = 200;

const SECTIONS: Section[] = ["Mappings", "Entries", "Checks"];
const MAPPING_FILTERS: MappingFilter[] = ["Unmapped", "Confirmed", "Exceptions"];
const ENTRY_FILTERS: EntryFilter[] = ["All", "Unmapped", "Exceptions"];
const BILLABLE_OPTIONS = ["Billable", "Non-Billable", "Billable Review"];

function blank(value: string | null | undefined): string {
  const text = value?.trim();
  return text ? text : "—";
}

function matchesBillable(
  row: EntryRow,
  selected: string[]
): boolean {
  if (selected.length === 0) return true;
  return selected.some((item) => {
    if (item === "Billable Review") return isPartnerBillableReview(row);
    if (item === "Billable") return row.billable === "Billable" || row.is_billable === true;
    return row.billable !== "Billable" && row.is_billable !== true;
  });
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
  const bounds = useMemo(() => dateBounds(entries), [entries]);
  const filterOptions = useMemo(() => extractOptions(entries), [entries]);
  const fallbackFilters = useMemo(() => defaultFilters(bounds), [bounds]);
  const [filters, setFilters] = useState<Filters | null>(null);
  const [billableFilter, setBillableFilter] = useState<string[]>([]);
  const activeFilters = filters ?? fallbackFilters;
  const comments = useMemo(() => {
    const map = new Map<number, string>();
    for (const row of review.comments ?? []) {
      if (row.comments.trim()) map.set(row.id, row.comments);
    }
    return map;
  }, [review.comments]);
  const [scope, setScope] = useState<MappingListRow | null>(null);
  const [mappingChoice, setMappingChoice] = useState<MappingListRow | null>(null);
  const [queryDismissed, setQueryDismissed] = useState(false);
  const [entry, setEntry] = useState<EntryRow | null>(null);
  const [markError, setMarkError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const mapping = queryDismissed ? mappingChoice : (mappingChoice ?? requestedMapping);
  const listKey = [
    section,
    mappingFilter,
    entryFilter,
    query,
    scope?.key ?? "",
    activeFilters.from,
    activeFilters.to,
    activeFilters.people.join("\0"),
    activeFilters.departments.join("\0"),
    activeFilters.roles.join("\0"),
    activeFilters.types.join("\0"),
    billableFilter.join("\0"),
  ].join("|");
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
    return applyFilters(entries, activeFilters).filter((row) => {
      if (!matchesBillable(row, billableFilter)) return false;
      if (scope && !entryMatchesMapping(row, scope, index)) return false;
      if (entryFilter === "Unmapped" && row.mapping_status !== "unmapped") return false;
      if (entryFilter === "Exceptions" && row.mapping_status !== "override") return false;
      return true;
    });
  }, [activeFilters, billableFilter, entries, entryFilter, index, scope]);

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

  const reviewIds = visibleEntries
    .filter((row) => isPartnerBillableReview(row))
    .map((row) => row.id);

  async function onMarkBillable() {
    const fd = new FormData();
    fd.set("entry_ids", JSON.stringify(reviewIds));
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

      {section === "Entries" && bounds.min ? (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <FilterBar
            filters={activeFilters}
            options={filterOptions}
            bounds={bounds}
            onChange={(next) =>
              setFilters((current) => ({ ...(current ?? activeFilters), ...next }))
            }
            onClear={() => {
              setFilters(defaultFilters(bounds));
              setBillableFilter([]);
            }}
          />
          <MultiSelect
            label="Billable"
            options={BILLABLE_OPTIONS}
            selected={billableFilter}
            onChange={setBillableFilter}
          />
          {billableFilter.includes("Billable Review") && reviewIds.length > 0 ? (
            <button
              type="button"
              onClick={onMarkBillable}
              disabled={marking}
              className="h-8 rounded-md bg-brand px-3 text-[13px] font-medium text-white hover:bg-navy disabled:opacity-50"
            >
              {marking ? "Saving…" : `Mark ${reviewIds.length.toLocaleString()} Billable`}
            </button>
          ) : null}
        </div>
      ) : null}

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
                className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-[13px] font-medium text-brand-600 hover:bg-tint"
              >
                <XIcon size={14} weight="bold" aria-hidden />
                {scope.task || "Task"}
              </button>
            ) : null}
            {section === "Mappings" ? (
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Search"
                placeholder="Search"
                className="lh-dropdown-input ml-auto h-8 w-52 px-2.5 text-[13px] placeholder:text-muted"
              />
            ) : (
              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Previous"
                  onClick={() => setPage(Math.max(0, currentPage - 1))}
                  disabled={currentPage === 0}
                  className="lh-dropdown-trigger inline-flex h-8 w-8 items-center justify-center rounded-md text-ink disabled:opacity-40"
                >
                  <CaretLeftIcon size={14} weight="bold" aria-hidden />
                </button>
                <span className="min-w-14 text-center text-[13px] tabular-nums text-muted">
                  {currentPage + 1} / {pageCount}
                </span>
                <button
                  type="button"
                  aria-label="Next"
                  onClick={() => setPage(Math.min(pageCount - 1, currentPage + 1))}
                  disabled={currentPage >= pageCount - 1}
                  className="lh-dropdown-trigger inline-flex h-8 w-8 items-center justify-center rounded-md text-ink disabled:opacity-40"
                >
                  <CaretRightIcon size={14} weight="bold" aria-hidden />
                </button>
              </div>
            )}
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
                    <th className="whitespace-nowrap text-right">Entries</th>
                    <th className="whitespace-nowrap text-right">Hours</th>
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
                      <td className="whitespace-nowrap text-right tabular-nums">
                        {row.entries.toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap text-right tabular-nums">
                        {hours(row.hours)}
                      </td>
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
                    <th className="whitespace-nowrap text-right">Hours</th>
                    <th>Department</th>
                    <th>Role</th>
                    <th>Activity Type</th>
                    <th>Billable</th>
                    <th>Comments</th>
                  </tr>
                </thead>
                <tbody>
                  {pageEntries.map((row) => (
                    <tr
                      key={row.id}
                      tabIndex={0}
                      className="cursor-pointer"
                        onClick={() => setEntry({ ...row, comments: comments.get(row.id) ?? null })}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            setEntry({ ...row, comments: comments.get(row.id) ?? null });
                          }
                        }}
                      >
                      <td className="whitespace-nowrap tabular-nums">{formatDate(row.date)}</td>
                      <td className="whitespace-nowrap">{row.person}</td>
                      <td className="whitespace-nowrap text-right tabular-nums">{hours(row.hours)}</td>
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
                      <td className="whitespace-nowrap">{blank(row.billable)}</td>
                      <td className="max-w-[220px]">
                        <span className="line-clamp-2 text-[12px] text-muted">
                          {comments.get(row.id)?.trim() || "—"}
                        </span>
                      </td>
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
