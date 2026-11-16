"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { ActionResult } from "@/app/review/actions";
import { SearchableSelect } from "@/components/SearchableSelect";
import { EditModal } from "@/components/settings/EditModal";
import {
  isNewStructureEntry,
  lookupTaskMap,
  ruleCategory,
  text,
  type CategoryIndex,
  type ReviewCatalog,
} from "@/lib/categoryMap";
import { formatDate, hours } from "@/lib/formatters";
import type { Num } from "@/lib/types";
import {
  catalogValue,
  fieldClass,
  primaryButtonClass,
  quietButtonClass,
  ReadValue,
  rolesForDepartment,
} from "./fields";

type SaveAction = (fd: FormData) => Promise<ActionResult>;

export type EntrySavePatch = {
  id: number;
  department: string | null;
  role: string | null;
  type: string | null;
  billable: string | null;
  is_billable: boolean;
  mapping_status: "mapped" | "new_structure" | "unmapped" | "override";
};

export type EditableEntry = {
  id: number;
  person: string;
  date: string;
  hours: Num;
  department: string | null;
  role: string | null;
  task: string | null;
  type: string | null;
  billable: string | null;
  raw_department?: string | null;
  raw_role?: string | null;
  raw_task?: string | null;
  raw_type?: string | null;
  raw_billable?: string | null;
  mapping_status?: string;
  comments?: string | null;
};

function shownBillable(value: string | null | undefined): "Billable" | "Non-Billable" {
  return value === "Billable" ? "Billable" : "Non-Billable";
}

export function EntryEditor({
  entry,
  index,
  catalog,
  saveAction,
  clearAction,
  onClose,
  onEditMapping,
  onSaved,
}: {
  entry: EditableEntry;
  index: CategoryIndex;
  catalog: ReviewCatalog;
  saveAction: SaveAction;
  clearAction: SaveAction;
  onClose: () => void;
  onEditMapping?: () => void;
  onSaved?: (patch: EntrySavePatch) => void;
}) {
  const followed = useMemo(() => ruleCategory(entry, index), [entry, index]);
  const loggedBillable = shownBillable(entry.raw_billable ?? entry.billable);
  const activityNames = useMemo(
    () => catalog.activityTypes.map((row) => row.name),
    [catalog.activityTypes]
  );
  const [department, setDepartment] = useState(() =>
    catalogValue(catalog.departments, entry.department)
  );
  const [role, setRole] = useState(() =>
    catalogValue(rolesForDepartment(catalog, entry.department ?? ""), entry.role)
  );
  const [activityType, setActivityType] = useState(() =>
    catalogValue(
      catalog.activityTypes.map((row) => row.name),
      entry.type
    )
  );
  const [billable, setBillable] = useState(shownBillable(entry.billable));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"save" | "clear" | null>(null);

  const isNew = isNewStructureEntry(
    entry.raw_department ?? entry.department,
    entry.raw_type ?? entry.type,
    index
  );
  const roleOptions = useMemo(
    () => rolesForDepartment(catalog, department),
    [catalog, department]
  );
  const departmentOptions = catalog.departments;
  const activityOptions = activityNames;

  function statusWithoutOverride(): EntrySavePatch["mapping_status"] {
    if (isNew) return "new_structure";
    const match = lookupTaskMap(
      entry.raw_department ?? entry.department,
      entry.raw_role ?? entry.role,
      entry.raw_task ?? entry.task,
      index
    );
    return match ? "mapped" : "unmapped";
  }

  async function finish(result: ActionResult, patch: EntrySavePatch) {
    setPending(null);
    if (!result.ok) {
      setError(result.error ?? "Save failed");
      return;
    }
    onSaved?.(patch);
    onClose();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sameCategory =
      text(department) === text(followed.department) &&
      text(role) === text(followed.role) &&
      text(activityType) === text(followed.activityType);
    const fd = new FormData();
    fd.set("entry_id", String(entry.id));
    fd.set("clear_category", sameCategory ? "1" : "0");
    if (!sameCategory) {
      if (department) fd.set("department", department);
      if (role) fd.set("role", role);
      if (activityType) fd.set("activity_type", activityType);
    }
    if (billable !== loggedBillable) fd.set("billable", billable);
    setPending("save");
    setError(null);
    const patch: EntrySavePatch = {
      id: entry.id,
      department: department || null,
      role: role || null,
      type: activityType || null,
      billable,
      is_billable: billable === "Billable",
      mapping_status: sameCategory ? statusWithoutOverride() : "override",
    };
    await finish(await saveAction(fd), patch);
  }

  async function onUseMapping() {
    const fd = new FormData();
    fd.set("entry_id", String(entry.id));
    setPending("clear");
    setError(null);
    const patch: EntrySavePatch = {
      id: entry.id,
      department: followed.department,
      role: followed.role,
      type: followed.activityType,
      billable,
      is_billable: billable === "Billable",
      mapping_status: statusWithoutOverride(),
    };
    await finish(await clearAction(fd), patch);
  }

  return (
    <EditModal
      title="Edit Entry"
      onClose={onClose}
      headerRight={`${formatDate(entry.date)} · ${hours(entry.hours)}`}
    >
      <form onSubmit={onSubmit} className="px-5 py-5">
        <h3 className="lh-section-title">Logged</h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          <ReadValue label="Department" value={entry.raw_department ?? null} />
          <ReadValue label="Role" value={entry.raw_role ?? null} />
          <ReadValue label="Task" value={entry.raw_task ?? null} />
          <ReadValue label="Activity Type" value={entry.raw_type ?? null} />
          <ReadValue label="Billable" value={entry.raw_billable ?? entry.billable} />
          <ReadValue label="Person" value={entry.person} />
        </dl>
        <div className="mt-3">
          <p className="lh-meta-label">Comments</p>
          <p className="mt-1 whitespace-pre-wrap text-[13px] text-ink">
            {entry.comments?.trim() || "—"}
          </p>
        </div>

        <h3 className="lh-section-title mt-6">Category</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
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

        <h3 className="lh-section-title mt-6">Billable</h3>
        <label className="mt-3 flex max-w-xs flex-col gap-1">
          <span className="lh-meta-label">Status</span>
          <select
            value={billable}
            onChange={(event) =>
              setBillable(event.target.value === "Billable" ? "Billable" : "Non-Billable")
            }
            className={fieldClass}
          >
            <option value="Billable">Billable</option>
            <option value="Non-Billable">Non-Billable</option>
          </select>
        </label>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {onEditMapping && !isNew ? (
            <button type="button" onClick={onEditMapping} className={quietButtonClass}>
              Edit Mapping
            </button>
          ) : null}
          {entry.mapping_status === "override" ? (
            <button
              type="button"
              onClick={onUseMapping}
              disabled={pending !== null}
              className={quietButtonClass}
            >
              {pending === "clear" ? "Saving…" : "Use Mapping"}
            </button>
          ) : null}
          {error ? <span className="text-[12px] text-serious">{error}</span> : null}
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={onClose} className={quietButtonClass}>
              Cancel
            </button>
            <button type="submit" disabled={pending !== null} className={primaryButtonClass}>
              {pending === "save" ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </form>
    </EditModal>
  );
}
