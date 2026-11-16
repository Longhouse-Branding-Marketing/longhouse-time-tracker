"use client";

import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CaretLeftIcon, CaretRightIcon, XIcon } from "@phosphor-icons/react";
import type { ActionResult } from "@/app/review/actions";
import { FilterBar } from "@/components/FilterBar";
import { MultiSelect } from "@/components/MultiSelect";
import { EditModal } from "@/components/settings/EditModal";
import { EmptyRow, PageHeader, PageShell, Panel } from "@/components/ui";
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
import {
  fieldClass,
  primaryButtonClass,
  quietButtonClass,
  rolesForDepartment,
  withCurrent,
} from "./fields";
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

type Section = "Mapping" | "Entries" | "Checks";

const PAGE_SIZE = 200;

const SECTIONS: Section[] = ["Mapping", "Entries", "Checks"];
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
  updateEntries,
}: {
  entries: EntryRow[];
  review: ReviewPayload;
  saveMapping: SaveAction;
  saveEntry: SaveAction;
  clearCategory: SaveAction;
  updateEntries: SaveAction;
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

  const [section, setSection] = useState<Section>("Mapping");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [bulkCategory, setBulkCategory] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [savingBulk, setSavingBulk] = useState(false);
  const noticeTimer = useRef<number | null>(null);
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

  const needle = query.trim().toLowerCase();

  const visibleMappings = useMemo(() => {
    return mappings.filter((row) => {
      if (row.status !== "unmapped") return false;
      return matchesQuery(needle, [row.department, row.role, row.task]);
    });
  }, [mappings, needle]);

  const visibleEntries = useMemo(() => {
    return applyFilters(entries, activeFilters).filter((row) => {
      if (!matchesBillable(row, billableFilter)) return false;
      if (scope && !entryMatchesMapping(row, scope, index)) return false;
      return true;
    });
  }, [activeFilters, billableFilter, entries, index, scope]);

  const pageCount = Math.max(1, Math.ceil(visibleEntries.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageEntries = visibleEntries.slice(
    currentPage * PAGE_SIZE,
    currentPage * PAGE_SIZE + PAGE_SIZE
  );

  function showSaved() {
    setNotice("Saved");
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2500);
  }

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
    setSelected([]);
    setBulkCategory(false);
    showSaved();
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
                      <td>{blank(row.department)}</td>
                      <td>{blank(row.role)}</td>
                      <td>{blank(row.type)}</td>
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
          onSaved={showSaved}
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
          catalog={review.catalog}
          saveAction={saveEntry}
          clearAction={clearCategory}
          onClose={() => setEntry(null)}
          onSaved={showSaved}
          onEditMapping={() => openMappingForEntry(entry)}
        />
      ) : null}

      {bulkCategory ? (
        <BulkCategoryEditor
          count={selected.length}
          catalog={review.catalog}
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
  const roleOptions = withCurrent(rolesForDepartment(catalog, department), role);
  const departmentOptions = withCurrent(catalog.departments, department);
  const activityOptions = withCurrent(
    catalog.activityTypes.map((row) => row.name),
    activityType
  );

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
            <select
              value={activityType}
              onChange={(event) => setActivityType(event.target.value)}
              className={fieldClass}
            >
              <option value="">—</option>
              {activityOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
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
