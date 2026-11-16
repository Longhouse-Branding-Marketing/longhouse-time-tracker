"use client";

import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CaretLeftIcon, CaretRightIcon, XIcon } from "@phosphor-icons/react";
import type { ActionResult } from "@/app/review/actions";
import { FilterBar } from "@/components/FilterBar";
import { MultiSelect } from "@/components/MultiSelect";
import { SearchableSelect } from "@/components/SearchableSelect";
import { EditModal } from "@/components/settings/EditModal";
import { EmptyRow, PageHeader, PageShell, Panel } from "@/components/ui";
import {
  applyCategoryMap,
  entryMatchesMapping,
  indexFromReview,
  isPartnerBillableReview,
  mappingList,
  mergeReviewTasks,
  taskRuleKey,
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
import { activeEmployeeEntries } from "@/lib/personLabels";
import type { Employee, EntryRow } from "@/lib/types";
import { EntryEditor, type EntrySavePatch } from "./EntryEditor";
import {
  fieldClass,
  primaryButtonClass,
  quietButtonClass,
  rolesForDepartment,
} from "./fields";
import { MappingEditor, type MappingSavePatch } from "./MappingEditor";

type SaveAction = (fd: FormData) => Promise<ActionResult>;

export type ReviewPayload = {
  comments?: Array<{ id: number; comments: string }>;
  tasks: TaskRow[];
  departments: { oldName: string; newName: string }[];
  activityNames: string[];
  catalog: ReviewCatalog;
  checks: CatalogIssue[];
};

type Section = "Mapping" | "Entries" | "Checks";

const PAGE_SIZE = 200;
const SAVED_FLASH_MS = 3200;

const SECTIONS: Section[] = ["Mapping", "Entries", "Checks"];
const BILLABLE_OPTIONS = ["Billable", "Non-Billable", "Billable Review"];

function blank(value: string | null | undefined): string {
  const text = value?.trim();
  return text ? text : "—";
}

function mappingIdentity(row: Pick<MappingListRow, "department" | "role" | "task">): string {
  return `${row.department}\0${row.role}\0${row.task}`;
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
  employees,
  review,
  saveMapping,
  saveEntry,
  clearCategory,
  updateEntries,
}: {
  entries: EntryRow[];
  employees: Employee[];
  review: ReviewPayload;
  saveMapping: SaveAction;
  saveEntry: SaveAction;
  clearCategory: SaveAction;
  updateEntries: SaveAction;
}) {
  const searchParams = useSearchParams();
  const [localEntries, setLocalEntries] = useState(entries);
  const [localReview, setLocalReview] = useState(review);
  const [entriesProp, setEntriesProp] = useState(entries);
  const [reviewProp, setReviewProp] = useState(review);
  // Logged combos the user successfully mapped this session. Survives stale
  // refetches that would otherwise put the row back in the unmapped list.
  const [resolvedMappingKeys, setResolvedMappingKeys] = useState<string[]>([]);
  if (entries !== entriesProp || review !== reviewProp) {
    const nextReview =
      review !== reviewProp
        ? { ...review, tasks: mergeReviewTasks(review.tasks, localReview.tasks) }
        : localReview;
    const nextIndex = indexFromReview(nextReview);
    const sourceEntries = entries !== entriesProp ? entries : localEntries;

    if (review !== reviewProp) {
      setReviewProp(review);
      setLocalReview(nextReview);
      const serverKeys = new Set(review.tasks.map((task) => taskRuleKey(task)));
      setResolvedMappingKeys((keys) =>
        keys.filter((key) => !serverKeys.has(key))
      );
    }
    if (entries !== entriesProp) setEntriesProp(entries);
    setLocalEntries(
      sourceEntries.map((row) =>
        row.mapping_status === "override"
          ? row
          : applyCategoryMap(row, { index: nextIndex })
      )
    );
  }

  // Former staff (Nick, Jay, Deleted User, …) stay in the DB but are excluded
  // from Review the same way Home/People already exclude them.
  const rosterEntries = useMemo(
    () => activeEmployeeEntries(localEntries, employees),
    [localEntries, employees]
  );

  const index = useMemo(() => indexFromReview(localReview), [localReview]);
  const mappings = useMemo(
    () => mappingList(index, rosterEntries),
    [index, rosterEntries]
  );
  const requestedMapping = useMemo(() => {
    const rule = searchParams.get("rule");
    const unmapped = searchParams.get("unmapped");
    if (rule) return mappings.find((item) => item.ruleId === rule) ?? null;
    if (unmapped) return mappings.find((item) => item.key === `unmapped:${unmapped}`) ?? null;
    return null;
  }, [mappings, searchParams]);

  const [section, setSection] = useState<Section>("Mapping");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [bulkCategory, setBulkCategory] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [savingBulk, setSavingBulk] = useState(false);
  const [recentMappings, setRecentMappings] = useState<MappingListRow[]>([]);
  const [flashEntryIds, setFlashEntryIds] = useState<number[]>([]);
  const noticeTimer = useRef<number | null>(null);
  const recentMappingTimers = useRef<Map<string, number>>(new Map());
  const entryFlashTimers = useRef<Map<number, number>>(new Map());
  const bounds = useMemo(() => dateBounds(rosterEntries), [rosterEntries]);
  const filterOptions = useMemo(() => extractOptions(rosterEntries), [rosterEntries]);
  const fallbackFilters = useMemo(() => defaultFilters(bounds), [bounds]);
  const [filters, setFilters] = useState<Filters | null>(null);
  const [billableFilter, setBillableFilter] = useState<string[]>([]);
  const activeFilters = filters ?? fallbackFilters;
  const comments = useMemo(() => {
    const map = new Map<number, string>();
    for (const row of localReview.comments ?? []) {
      if (row.comments.trim()) map.set(row.id, row.comments);
    }
    return map;
  }, [localReview.comments]);
  const [scope, setScope] = useState<MappingListRow | null>(null);
  const [mappingChoice, setMappingChoice] = useState<MappingListRow | null>(null);
  const [queryDismissed, setQueryDismissed] = useState(false);
  const [entry, setEntry] = useState<EntryRow | null>(null);
  const mapping = queryDismissed ? mappingChoice : (mappingChoice ?? requestedMapping);
  const listKey = [
    section,
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

  function patchEntries(ids: number[], fields: Partial<EntryRow>) {
    const idSet = new Set(ids);
    setLocalEntries((current) =>
      current.map((row) => (idSet.has(row.id) ? { ...row, ...fields } : row))
    );
    setSelected((current) => current.filter((id) => !idSet.has(id)));
  }

  function showSaved(message = "Saved") {
    setNotice(message);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), SAVED_FLASH_MS);
  }

  function pinRecentMapping(row: MappingListRow) {
    const identity = mappingIdentity(row);
    setRecentMappings((current) => [
      row,
      ...current.filter((item) => mappingIdentity(item) !== identity),
    ]);
    const existing = recentMappingTimers.current.get(identity);
    if (existing) window.clearTimeout(existing);
    const timer = window.setTimeout(() => {
      setRecentMappings((current) =>
        current.filter((item) => mappingIdentity(item) !== identity)
      );
      recentMappingTimers.current.delete(identity);
    }, SAVED_FLASH_MS);
    recentMappingTimers.current.set(identity, timer);
  }

  function flashEntries(ids: number[]) {
    if (ids.length === 0) return;
    setFlashEntryIds((current) => Array.from(new Set([...current, ...ids])));
    for (const id of ids) {
      const existing = entryFlashTimers.current.get(id);
      if (existing) window.clearTimeout(existing);
      const timer = window.setTimeout(() => {
        setFlashEntryIds((current) => current.filter((item) => item !== id));
        entryFlashTimers.current.delete(id);
      }, SAVED_FLASH_MS);
      entryFlashTimers.current.set(id, timer);
    }
  }

  function applyEntrySaved(patch: EntrySavePatch) {
    patchEntries([patch.id], {
      department: patch.department,
      role: patch.role,
      type: patch.type,
      billable: patch.billable,
      is_billable: patch.is_billable,
      mapping_status: patch.mapping_status,
    });
    flashEntries([patch.id]);
    showSaved("Entry updated");
  }

  function applyMappingSaved(patch: MappingSavePatch) {
    const task: TaskRow = {
      id: `local-${patch.department}\0${patch.role}\0${patch.task}`,
      oldDepartment: patch.department,
      oldDepartmentMemtime: patch.department,
      oldRole: patch.role || null,
      oldTask: patch.task,
      oldTaskNormalized: patch.task,
      newDepartment: patch.newDepartment,
      newRole: patch.newRole,
      activityTypeId: patch.activityTypeId,
      activityType: patch.activityType,
      billableType: "",
      historicalBillableRule: "keep_original",
    };
    const sameRule = (row: TaskRow) =>
      row.oldDepartment === task.oldDepartment &&
      (row.oldRole ?? "") === (task.oldRole ?? "") &&
      row.oldTask === task.oldTask;
    const tasks = localReview.tasks.some(sameRule)
      ? localReview.tasks.map((row) => (sameRule(row) ? { ...row, ...task, id: row.id } : row))
      : [...localReview.tasks, task];
    const nextReview = { ...localReview, tasks };
    const nextIndex = indexFromReview(nextReview);
    const prior = mappings.find(
      (row) =>
        row.department === patch.department &&
        row.role === patch.role &&
        row.task === patch.task
    );
    const affectedIds = rosterEntries
      .filter((row) => {
        if (row.mapping_status === "override") return false;
        return entryMatchesMapping(
          row,
          {
            ruleId: null,
            department: patch.department,
            role: patch.role,
            task: patch.task,
          },
          index
        );
      })
      .map((row) => row.id);

    const resolvedKey = mappingIdentity(patch);
    setLocalReview(nextReview);
    setLocalEntries((rows) =>
      rows.map((row) =>
        row.mapping_status === "override"
          ? row
          : applyCategoryMap(row, { index: nextIndex })
      )
    );
    setResolvedMappingKeys((keys) =>
      keys.includes(resolvedKey) ? keys : [...keys, resolvedKey]
    );
    pinRecentMapping({
      key: `recent:${resolvedKey}`,
      ruleId: task.id,
      department: patch.department,
      role: patch.role,
      task: patch.task,
      newDepartment: patch.newDepartment,
      newRole: patch.newRole,
      activityType: patch.activityType,
      entries: prior?.entries ?? affectedIds.length,
      hours: prior?.hours ?? 0,
      exceptions: prior?.exceptions ?? 0,
      status: "confirmed",
    });
    flashEntries(affectedIds);
    showSaved("Mapping saved");
  }

  const needle = query.trim().toLowerCase();
  const flashEntrySet = useMemo(() => new Set(flashEntryIds), [flashEntryIds]);
  const recentMappingIdentities = useMemo(
    () => new Set(recentMappings.map((row) => mappingIdentity(row))),
    [recentMappings]
  );
  const resolvedMappingSet = useMemo(
    () => new Set(resolvedMappingKeys),
    [resolvedMappingKeys]
  );

  const visibleMappings = useMemo(() => {
    const unmapped = mappings.filter((row) => {
      if (row.status !== "unmapped") return false;
      const identity = mappingIdentity(row);
      // Saved this session — never show as unmapped again, even if a stale
      // refetch temporarily drops the new rule from the server payload.
      if (resolvedMappingSet.has(identity)) return false;
      if (recentMappingIdentities.has(identity)) return false;
      return matchesQuery(needle, [
        row.department,
        row.role,
        row.task,
        row.newDepartment,
        row.newRole,
        row.activityType,
      ]);
    });
    const recent = recentMappings.filter((row) =>
      matchesQuery(needle, [
        row.department,
        row.role,
        row.task,
        row.newDepartment,
        row.newRole,
        row.activityType,
      ])
    );
    return [...recent, ...unmapped];
  }, [
    mappings,
    needle,
    recentMappingIdentities,
    recentMappings,
    resolvedMappingSet,
  ]);

  const visibleEntries = useMemo(() => {
    const matchesRow = (row: EntryRow) => {
      if (!matchesBillable(row, billableFilter)) return false;
      if (scope && !entryMatchesMapping(row, scope, index)) return false;
      return true;
    };
    const filtered = applyFilters(rosterEntries, activeFilters).filter(matchesRow);
    if (flashEntrySet.size === 0) return filtered;
    const filteredIds = new Set(filtered.map((row) => row.id));
    const held = rosterEntries.filter(
      (row) => flashEntrySet.has(row.id) && !filteredIds.has(row.id)
    );
    return held.length > 0 ? [...held, ...filtered] : filtered;
  }, [
    activeFilters,
    billableFilter,
    flashEntrySet,
    index,
    rosterEntries,
    scope,
  ]);

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
    setSection("Mapping");
    chooseMapping(match);
  }

  const selectedOnPage = pageEntries.filter((row) => selected.includes(row.id)).length;
  const pageIds = pageEntries.map((row) => row.id);

  function toggleRow(id: number) {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  function togglePage() {
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));
    setSelected((current) => {
      if (allSelected) return current.filter((id) => !pageIds.includes(id));
      return Array.from(new Set([...current, ...pageIds]));
    });
  }

  async function applyToSelected(fields: {
    billable?: "Billable" | "Non-Billable";
    department?: string;
    role?: string;
    activityType?: string;
  }) {
    const fd = new FormData();
    fd.set("entry_ids", JSON.stringify(selected));
    if (fields.billable) fd.set("billable", fields.billable);
    if (fields.department && fields.role && fields.activityType) {
      fd.set("department", fields.department);
      fd.set("role", fields.role);
      fd.set("activity_type", fields.activityType);
    }
    setSavingBulk(true);
    setBulkError(null);
    const result = await updateEntries(fd);
    setSavingBulk(false);
    if (!result.ok) {
      setBulkError(result.error ?? "Save failed");
      return;
    }
    const patch: Partial<EntryRow> = {};
    if (fields.billable) {
      patch.billable = fields.billable;
      patch.is_billable = fields.billable === "Billable";
    }
    if (fields.department && fields.role && fields.activityType) {
      patch.department = fields.department;
      patch.role = fields.role;
      patch.type = fields.activityType;
      patch.mapping_status = "override";
    }
    patchEntries(selected, patch);
    flashEntries(selected);
    setBulkCategory(false);
    showSaved(selected.length === 1 ? "Entry updated" : "Entries updated");
  }

  const countLabel =
    section === "Mapping"
      ? visibleMappings.length.toLocaleString()
      : section === "Entries"
        ? visibleEntries.length.toLocaleString()
        : review.checks.length.toLocaleString();

  return (
    <PageShell>
      <PageHeader title="Review">
        <div className="flex items-center gap-3">
          {notice ? (
            <span className="text-[13px] font-medium text-positive" role="status">
              {notice}
            </span>
          ) : null}
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
        </div>
      </PageHeader>

      {section === "Entries" && bounds.min ? (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <FilterBar
            filters={activeFilters}
            options={filterOptions}
            bounds={bounds}
            extraActive={billableFilter.length > 0}
            onChange={(next) =>
              setFilters((current) => ({ ...(current ?? activeFilters), ...next }))
            }
            onClear={() => {
              setFilters(defaultFilters(bounds));
              setBillableFilter([]);
            }}
            extras={(fullWidth) => (
              <MultiSelect
                fullWidth={fullWidth}
                label="Billable"
                options={BILLABLE_OPTIONS}
                selected={billableFilter}
                onChange={setBillableFilter}
              />
            )}
          />
        </div>
      ) : null}

      {section === "Entries" && selected.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-card px-3 py-2">
          <span className="text-[13px] font-medium text-ink">
            {selected.length.toLocaleString()} Selected
          </span>
          <button
            type="button"
            disabled={savingBulk}
            onClick={() => applyToSelected({ billable: "Billable" })}
            className={primaryButtonClass}
          >
            Billable
          </button>
          <button
            type="button"
            disabled={savingBulk}
            onClick={() => applyToSelected({ billable: "Non-Billable" })}
            className={quietButtonClass}
          >
            Non-Billable
          </button>
          <button
            type="button"
            disabled={savingBulk}
            onClick={() => {
              setBulkError(null);
              setBulkCategory(true);
            }}
            className={quietButtonClass}
          >
            Category
          </button>
          <button
            type="button"
            onClick={() => setSelected([])}
            className="ml-auto inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-[13px] font-medium text-brand-600 hover:bg-tint"
          >
            <XIcon size={14} weight="bold" aria-hidden />
            Clear
          </button>
          {bulkError ? <span className="text-[12px] text-serious">{bulkError}</span> : null}
        </div>
      ) : null}

      <Panel
        title={section}
        className="mt-5"
        noBodyPadding
        right={
          <div className="flex items-center gap-3">
            {section === "Mapping" ? (
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Search"
                placeholder="Search"
                className="lh-dropdown-input h-8 w-44 px-2.5 text-[13px] placeholder:text-muted"
              />
            ) : null}
            {section === "Entries" ? (
              <div className="flex items-center gap-1">
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
            ) : null}
            <span className="text-[12px] tabular-nums text-muted">{countLabel}</span>
          </div>
        }
      >
        {section === "Entries" && scope ? (
          <div className="flex items-center border-b border-line px-5 py-3">
            <button
              type="button"
              onClick={() => setScope(null)}
              className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-[13px] font-medium text-brand-600 hover:bg-tint"
            >
              <XIcon size={14} weight="bold" aria-hidden />
              {scope.task || scope.department || "Mapped Group"}
            </button>
          </div>
        ) : null}

        {section === "Mapping" ? (
          visibleMappings.length === 0 ? (
            <EmptyRow>No Unmapped Entries</EmptyRow>
          ) : (
            <div className="lh-scroll max-h-[min(70vh,760px)] overflow-auto">
              <table className="lh-table">
                <thead>
                  <tr>
                    <th>Department</th>
                    <th>Role</th>
                    <th>Task</th>
                    <th>Mapped Department</th>
                    <th>Mapped Role</th>
                    <th>Activity Type</th>
                    <th className="whitespace-nowrap text-right">Entries</th>
                    <th className="whitespace-nowrap text-right">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleMappings.map((row) => {
                    const justSaved = recentMappingIdentities.has(mappingIdentity(row));
                    return (
                      <tr
                        key={row.key}
                        tabIndex={0}
                        className={`cursor-pointer ${
                          justSaved ? "bg-positive-soft/90" : ""
                        }`}
                        onClick={() => chooseMapping(row)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") chooseMapping(row);
                        }}
                      >
                        <td>{blank(row.department)}</td>
                        <td>{blank(row.role)}</td>
                        <td className="font-medium text-ink">{blank(row.task)}</td>
                        <td className={justSaved ? "font-medium text-positive" : undefined}>
                          {blank(row.newDepartment)}
                        </td>
                        <td className={justSaved ? "font-medium text-positive" : undefined}>
                          {blank(row.newRole)}
                        </td>
                        <td className={justSaved ? "font-medium text-positive" : undefined}>
                          {blank(row.activityType)}
                        </td>
                        <td className="whitespace-nowrap text-right tabular-nums">
                          {row.entries.toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap text-right tabular-nums">
                          {hours(row.hours)}
                        </td>
                      </tr>
                    );
                  })}
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
                    <th className="w-8">
                      <input
                        type="checkbox"
                        aria-label="Select page"
                        checked={pageIds.length > 0 && selectedOnPage === pageIds.length}
                        onChange={togglePage}
                        className="h-3.5 w-3.5 accent-[color:var(--color-brand)]"
                      />
                    </th>
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
                  {pageEntries.map((row) => {
                    const justSaved = flashEntrySet.has(row.id);
                    return (
                      <tr
                        key={row.id}
                        tabIndex={0}
                        className={`cursor-pointer ${
                          justSaved ? "bg-positive-soft/90" : ""
                        }`}
                        onClick={() => setEntry({ ...row, comments: comments.get(row.id) ?? null })}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            setEntry({ ...row, comments: comments.get(row.id) ?? null });
                          }
                        }}
                      >
                        <td
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            aria-label={`Select ${row.person} ${row.date}`}
                            checked={selected.includes(row.id)}
                            onChange={() => toggleRow(row.id)}
                            className="h-3.5 w-3.5 accent-[color:var(--color-brand)]"
                          />
                        </td>
                        <td className="whitespace-nowrap tabular-nums">{formatDate(row.date)}</td>
                        <td className="whitespace-nowrap">{row.person}</td>
                        <td className="whitespace-nowrap text-right tabular-nums">{hours(row.hours)}</td>
                        <td className={justSaved ? "font-medium text-positive" : undefined}>
                          {blank(row.department)}
                        </td>
                        <td className={justSaved ? "font-medium text-positive" : undefined}>
                          {blank(row.role)}
                        </td>
                        <td className={justSaved ? "font-medium text-positive" : undefined}>
                          {blank(row.type)}
                        </td>
                        <td className="whitespace-nowrap">{blank(row.billable)}</td>
                        <td className="max-w-[220px]">
                          <span className="line-clamp-2 text-[12px] text-muted">
                            {comments.get(row.id)?.trim() || "—"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
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
          catalog={localReview.catalog}
          saveAction={saveMapping}
          onClose={() => chooseMapping(null)}
          onSaved={applyMappingSaved}
          onViewEntries={() => {
            setScope(mapping);
            setSection("Entries");
            setQuery("");
            chooseMapping(null);
          }}
        />
      ) : null}

      {entry ? (
        <EntryEditor
          entry={entry}
          index={index}
          catalog={localReview.catalog}
          saveAction={saveEntry}
          clearAction={clearCategory}
          onClose={() => setEntry(null)}
          onSaved={applyEntrySaved}
          onEditMapping={() => openMappingForEntry(entry)}
        />
      ) : null}

      {bulkCategory ? (
        <BulkCategoryEditor
          count={selected.length}
          catalog={localReview.catalog}
          pending={savingBulk}
          error={bulkError}
          onClose={() => setBulkCategory(false)}
          onSave={(fields) => applyToSelected(fields)}
        />
      ) : null}
    </PageShell>
  );
}

function BulkCategoryEditor({
  count,
  catalog,
  pending,
  error,
  onClose,
  onSave,
}: {
  count: number;
  catalog: ReviewCatalog;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (fields: { department: string; role: string; activityType: string }) => void;
}) {
  const [department, setDepartment] = useState("");
  const [role, setRole] = useState("");
  const [activityType, setActivityType] = useState("");
  const roleOptions = rolesForDepartment(catalog, department);
  const departmentOptions = catalog.departments;
  const activityOptions = catalog.activityTypes.map((row) => row.name);

  return (
    <EditModal
      title="Category"
      onClose={onClose}
      headerRight={`${count.toLocaleString()} Entries`}
    >
      <form
        className="px-5 py-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!department || !role || !activityType) return;
          onSave({ department, role, activityType });
        }}
      >
        <div className="grid gap-3">
          <label className="flex flex-col gap-1">
            <span className="lh-meta-label">Department</span>
            <select
              value={department}
              onChange={(event) => {
                const next = event.target.value;
                setDepartment(next);
                const roles = rolesForDepartment(catalog, next);
                if (role && roles.length > 0 && !roles.includes(role)) setRole("");
              }}
              className={fieldClass}
            >
              <option value="">—</option>
              {departmentOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="lh-meta-label">Role</span>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value)}
              className={fieldClass}
            >
              <option value="">—</option>
              {roleOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="lh-meta-label">Activity Type</span>
            <SearchableSelect
              value={activityType}
              onChange={setActivityType}
              placeholder="Search activity type…"
              options={activityOptions.map((name) => ({ value: name, label: name }))}
            />
          </label>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2 border-t border-line pt-4">
          {error ? <span className="mr-auto text-[12px] text-serious">{error}</span> : null}
          <button type="button" onClick={onClose} className={quietButtonClass}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending || !department || !role || !activityType}
            className={primaryButtonClass}
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </EditModal>
  );
}
