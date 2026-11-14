import crosswalk from "./category-map/crosswalk.json" with { type: "json" };
import type { Num } from "./types";

export type MappingStatus = "mapped" | "new_structure" | "unmapped";

type CategorySource = {
  department: string | null;
  role: string | null;
  task: string | null;
  type: string | null;
  raw_department?: string | null;
  raw_role?: string | null;
  raw_task?: string | null;
  raw_type?: string | null;
  billable?: string | null;
  is_billable?: boolean | null;
  hours?: Num;
};

type ActivityType = (typeof crosswalk.activityTypes)[number];
type DepartmentRow = (typeof crosswalk.departments)[number];
type RoleRow = (typeof crosswalk.roles)[number];
type TaskRow = (typeof crosswalk.tasks)[number];

export type MappedFields = {
  raw_department: string | null;
  raw_role: string | null;
  raw_task: string | null;
  raw_type: string | null;
  mapping_status: MappingStatus;
};

const activityTypes: ActivityType[] = crosswalk.activityTypes;
const departments: DepartmentRow[] = crosswalk.departments;
const roles: RoleRow[] = crosswalk.roles;
const tasks: TaskRow[] = crosswalk.tasks;

const activityNames = new Set(activityTypes.map((row) => row.name));
const newDepartments = new Set(departments.map((row) => row.newName));
const renamedOldDepartments = new Set(
  departments
    .filter((row) => row.oldName !== row.newName)
    .map((row) => row.oldName)
);

function lookupKey(department: string, role: string, task: string): string {
  return `${department}\0${role}\0${task}`;
}

const exactTasks = new Map<string, TaskRow>();
const normalizedTasks = new Map<string, TaskRow>();

for (const row of tasks) {
  const role = row.oldRole ?? "";
  for (const department of [row.oldDepartment, row.oldDepartmentMemtime]) {
    exactTasks.set(lookupKey(department, role, row.oldTask), row);
    if (row.oldTaskNormalized && row.oldTaskNormalized !== row.oldTask) {
      const key = lookupKey(department, role, row.oldTaskNormalized);
      if (!normalizedTasks.has(key)) normalizedTasks.set(key, row);
    }
  }
}

function text(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function lookupTaskMap(
  department: string | null,
  role: string | null,
  task: string | null
): TaskRow | null {
  const departmentKey = text(department);
  const roleKey = text(role);
  const taskKey = text(task);
  if (!departmentKey || !taskKey) return null;
  const key = lookupKey(departmentKey, roleKey, taskKey);
  return exactTasks.get(key) ?? normalizedTasks.get(key) ?? null;
}

/** Logged on the new Memtime shape: new department, no "(old)" suffix, known activity type. */
export function isNewStructureEntry(
  department: string | null,
  type: string | null
): boolean {
  const departmentName = text(department);
  const typeName = text(type);
  if (!departmentName || departmentName.endsWith(" (old)")) return false;
  if (renamedOldDepartments.has(departmentName)) return false;
  if (!newDepartments.has(departmentName)) return false;
  return Boolean(typeName && activityNames.has(typeName));
}

export function applyCategoryMap<T extends CategorySource>(
  row: T
): T & MappedFields {
  const rawDepartment = row.raw_department ?? row.department;
  const rawRole = row.raw_role ?? row.role;
  const rawTask = row.raw_task ?? row.task;
  const rawType = row.raw_type ?? row.type;

  const base = {
    ...row,
    raw_department: rawDepartment,
    raw_role: rawRole,
    raw_task: rawTask,
    raw_type: rawType,
    task: rawTask,
  };

  if (isNewStructureEntry(rawDepartment, rawType)) {
    return {
      ...base,
      department: rawDepartment,
      role: rawRole,
      type: rawType,
      mapping_status: "new_structure",
    };
  }

  const match = lookupTaskMap(rawDepartment, rawRole, rawTask);
  if (!match) {
    return {
      ...base,
      department: rawDepartment,
      role: rawRole,
      type: rawType,
      mapping_status: "unmapped",
    };
  }

  return {
    ...base,
    department: match.newDepartment,
    role: match.newRole,
    type: match.activityType,
    mapping_status: "mapped",
  };
}

export function applyCategoryMapToEntries<T extends CategorySource>(
  rows: T[]
): Array<T & MappedFields> {
  return rows.map((row) => applyCategoryMap(row));
}

function originalNames(row: CategorySource): string[] {
  const names =
    "raw_department" in row
      ? [row.raw_department, row.raw_role, row.raw_task, row.raw_type]
      : [row.department, row.role, row.task, row.type];
  return names.filter((name): name is string => Boolean(name && name.trim()));
}

/** Partner exception uses original logged names only, never the mapped activity type. */
export function isPartnerBillableReview(row: CategorySource): boolean {
  if (row.is_billable === true) return false;
  if (row.billable === "Billable") return false;
  return originalNames(row).some((name) => name.toLowerCase().includes("partner"));
}

export interface UnmappedGroup {
  department: string;
  role: string;
  task: string;
  entries: number;
  hours: number;
}

export function unmappedGroups(
  rows: Array<CategorySource & MappedFields & { hours?: Num }>
): UnmappedGroup[] {
  const groups = new Map<string, UnmappedGroup>();
  for (const row of rows) {
    if (row.mapping_status !== "unmapped") continue;
    const department = text(row.raw_department) || "—";
    const role = text(row.raw_role) || "—";
    const task = text(row.raw_task) || "—";
    const key = `${department}\0${role}\0${task}`;
    const current = groups.get(key) ?? {
      department,
      role,
      task,
      entries: 0,
      hours: 0,
    };
    current.entries += 1;
    const hours = Number(row.hours);
    current.hours += Number.isFinite(hours) ? hours : 0;
    groups.set(key, current);
  }
  return Array.from(groups.values()).sort((a, b) => b.entries - a.entries);
}

export interface CatalogIssue {
  kind: string;
  name: string;
  detail: string;
}

export function catalogIssues(): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  for (const row of activityTypes) {
    if (!row.existsInMemtime) {
      issues.push({
        kind: "Not in Memtime",
        name: row.name,
        detail: row.id,
      });
    } else if (row.isNewType) {
      issues.push({
        kind: "Not verified live",
        name: row.name,
        detail: row.id,
      });
    }
    if (!row.description) {
      issues.push({
        kind: "No description",
        name: row.name,
        detail: row.id,
      });
    }
  }
  for (const row of roles) {
    if (
      !row.verifiedLive &&
      (row.newRole === "People & Culture Manager" ||
        row.newRole === "Office Administrator")
    ) {
      issues.push({
        kind: "Role not verified",
        name: `${row.newDepartment} / ${row.newRole}`,
        detail: row.oldRole,
      });
    }
  }
  for (const row of departments) {
    if (!row.verifiedLive) {
      issues.push({
        kind: "Department not verified",
        name: row.newName,
        detail: row.oldName,
      });
    }
  }
  return issues;
}

export function activityTypeCount(): number {
  return activityTypes.length;
}
