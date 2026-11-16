"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { ActionResult } from "@/app/review/actions";
import { EditModal } from "@/components/settings/EditModal";
import type { MappingListRow, ReviewCatalog } from "@/lib/categoryMap";
import { n } from "@/lib/formatters";
import {
  fieldClass,
  primaryButtonClass,
  quietButtonClass,
  ReadValue,
  rolesForDepartment,
  withCurrent,
} from "./fields";

type SaveAction = (fd: FormData) => Promise<ActionResult>;

function impact(row: MappingListRow): string {
  const hours = n(row.hours).toLocaleString(undefined, { maximumFractionDigits: 1 });
  return `${row.entries.toLocaleString()} Entries · ${hours} Hours`;
}

export function MappingEditor({
  mapping,
  catalog,
  saveAction,
  onClose,
  onViewEntries,
  onSaved,
}: {
  mapping: MappingListRow;
  catalog: ReviewCatalog;
  saveAction: SaveAction;
  onClose: () => void;
  onViewEntries: () => void;
  onSaved?: () => void;
}) {
  const initialActivity =
    catalog.activityTypes.find((row) => row.name === mapping.activityType)?.id ?? "";
  const [department, setDepartment] = useState(mapping.newDepartment ?? "");
  const [role, setRole] = useState(mapping.newRole ?? "");
  const [activityId, setActivityId] = useState(initialActivity);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const roleOptions = useMemo(
    () => withCurrent(rolesForDepartment(catalog, department), role),
    [catalog, department, role]
  );
  const departmentOptions = useMemo(
    () => withCurrent(catalog.departments, department),
    [catalog.departments, department]
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!department || !role || !activityId) return;
    const fd = new FormData();
    if (mapping.ruleId) fd.set("rule_id", mapping.ruleId);
    fd.set("old_department", mapping.department);
    if (mapping.role) fd.set("old_role", mapping.role);
    fd.set("old_task", mapping.task);
    fd.set("new_department", department);
    fd.set("new_role", role);
    fd.set("activity_type_id", activityId);
    setPending(true);
    setError(null);
    const result = await saveAction(fd);
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? "Save failed");
      return;
    }
    onSaved?.();
    onClose();
  }

  return (
    <EditModal title="Edit Mapping" onClose={onClose} headerRight={impact(mapping)}>
      <form onSubmit={onSubmit} className="px-5 py-5">
        <h3 className="lh-section-title">Logged</h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          <ReadValue label="Department" value={mapping.department} />
          <ReadValue label="Role" value={mapping.role} />
          <ReadValue label="Task" value={mapping.task} />
        </dl>

        <h3 className="lh-section-title mt-6">Category</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
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
              value={activityId}
              onChange={(event) => setActivityId(event.target.value)}
              className={fieldClass}
            >
              <option value="">—</option>
              {catalog.activityTypes.map((row) => (
                <option key={row.id || row.name} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <button type="button" onClick={onViewEntries} className={quietButtonClass}>
            View Entries
          </button>
          {error ? <span className="text-[12px] text-serious">{error}</span> : null}
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={onClose} className={quietButtonClass}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending || !department || !role || !activityId}
              className={primaryButtonClass}
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </form>
    </EditModal>
  );
}
