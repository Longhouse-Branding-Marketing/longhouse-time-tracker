import crosswalkJson from "./category-map/crosswalk.json" with { type: "json" };
import type { Num } from "./types";

export type MappingStatus = "mapped" | "new_structure" | "unmapped" | "override";

type CategorySource = {
  id?: number;
  department: string | null;
  role: string | null;
  task: string | null;
  type: string | null;
  raw_department?: string | null;
  raw_role?: string | null;
  raw_task?: string | null;
  raw_type?: string | null;
  raw_billable?: string | null;
  billable?: string | null;
  is_billable?: boolean | null;
  hours?: Num;
};

export type ActivityType = {
  id: string;
  name: string;
  billableType: string;
  existsInMemtime: boolean;
  isNewType: boolean;
  group: string | null;
  description: string | null;
  sortOrder: number;
};

export type DepartmentRow = {
  oldId: string;
  oldName: string;
  oldMemtimeName: string;
  newId: string;
  newName: string;
  verifiedLive: boolean;
};

export type RoleRow = {
  oldId: string;
  oldDepartment: string;
  oldRole: string;
  newDepartment: string;
  newRole: string;
  verifiedLive: boolean;
};

export type TaskRow = {
  id: string;
  oldDepartment: string;
  oldDepartmentMemtime: string;
  oldRole: string | null;
  oldTask: string;
  oldTaskNormalized: string;
  newDepartment: string;
  newRole: string;
  activityTypeId: string;
  activityType: string;
  billableType: string;
  historicalBillableRule: string;
};

export type CategoryCrosswalk = {
  activityTypes: ActivityType[];
  departments: DepartmentRow[];
  roles: RoleRow[];
  tasks: TaskRow[];
};

export type EntryOverride = {
  entryId: number;
  department: string | null;
  role: string | null;
  activityType: string | null;
  billable: string | null;
};

export type CategoryIndex = {
  tasks: TaskRow[];
  activityNames: Set<string>;
  newDepartments: Set<string>;
  renamedOldDepartments: Set<string>;
  exactTasks: Map<string, TaskRow>;
  normalizedTasks: Map<string, TaskRow>;
};

export type MappedFields = {
  raw_department: string | null;
  raw_role: string | null;
  raw_task: string | null;
  raw_type: string | null;
  raw_billable: string | null;
  mapping_status: MappingStatus;
};

export type ApplyCategoryOptions = {
  index?: CategoryIndex;
  override?: EntryOverride | null;
  overrides?: EntryOverride[];
};

export const bundledCrosswalk = crosswalkJson as CategoryCrosswalk;

const defaultIndex = createCategoryIndex(bundledCrosswalk);

export function createCategoryIndex(crosswalk: CategoryCrosswalk): CategoryIndex {
  const exactTasks = new Map<string, TaskRow>();
  const normalizedTasks = new Map<string, TaskRow>();

  for (const row of crosswalk.tasks) {
    const role = row.oldRole ?? "";
    for (const department of [row.oldDepartment, row.oldDepartmentMemtime]) {
      if (!department) continue;
      exactTasks.set(lookupKey(department, role, row.oldTask), row);
      if (row.oldTaskNormalized && row.oldTaskNormalized !== row.oldTask) {
        const key = lookupKey(department, role, row.oldTaskNormalized);
        if (!normalizedTasks.has(key)) normalizedTasks.set(key, row);
      }
    }
  }

  return {
    tasks: crosswalk.tasks,
    activityNames: new Set(crosswalk.activityTypes.map((row) => row.name)),
    newDepartments: new Set(crosswalk.departments.map((row) => row.newName)),
    renamedOldDepartments: new Set(
      crosswalk.departments
        .filter((row) => row.oldName !== row.newName)
        .map((row) => row.oldName)
    ),
    exactTasks,
    normalizedTasks,
  };
}

function lookupKey(department: string, role: string, task: string): string {
  return `${department}\0${role}\0${task}`;
}

export function text(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function lookupTaskMap(
  department: string | null,
  role: string | null,
  task: string | null,
  index: CategoryIndex = defaultIndex
): TaskRow | null {
  const departmentKey = text(department);
  const roleKey = text(role);
  const taskKey = text(task);
  if (!departmentKey) return null;
  const key = lookupKey(departmentKey, roleKey, taskKey);
  return index.exactTasks.get(key) ?? index.normalizedTasks.get(key) ?? null;
}

/** Logged on the new Memtime shape: new department, no "(old)" suffix, known activity type. */
export function isNewStructureEntry(
  department: string | null,
  type: string | null,
  index: CategoryIndex = defaultIndex
): boolean {
  const departmentName = text(department);
  const typeName = text(type);
  if (!departmentName || departmentName.endsWith(" (old)")) return false;
  if (index.renamedOldDepartments.has(departmentName)) return false;
  if (!index.newDepartments.has(departmentName)) return false;
  return Boolean(typeName && index.activityNames.has(typeName));
}

function hasCategoryOverride(override: EntryOverride | null | undefined): boolean {
  if (!override) return false;
  return Boolean(
    text(override.department) || text(override.role) || text(override.activityType)
  );
}

function pick(value: string | null | undefined, fallback: string | null): string | null {
  const next = text(value);
  return next || fallback;
}

function applyBillable<T extends CategorySource>(
  row: T,
  override: EntryOverride | null | undefined
): T {
  const billable = text(override?.billable);
  if (!billable) return row;
  return {
    ...row,
    billable,
    is_billable: billable === "Billable",
  };
}

export function applyCategoryMap<T extends CategorySource>(
  row: T,
  options?: ApplyCategoryOptions
): T & MappedFields {
  const index = options?.index ?? defaultIndex;
  const rawDepartment = row.raw_department ?? row.department;
  const rawRole = row.raw_role ?? row.role;
  const rawTask = row.raw_task ?? row.task;
  const rawType = row.raw_type ?? row.type;
  const rawBillable = row.raw_billable ?? row.billable ?? null;
  const override =
    options?.override ??
    (typeof row.id === "number"
      ? (options?.overrides?.find((item) => item.entryId === row.id) ?? null)
      : null);

  const base = {
    ...row,
    raw_department: rawDepartment,
    raw_role: rawRole,
    raw_task: rawTask,
    raw_type: rawType,
    raw_billable: rawBillable,
    task: rawTask,
  };

  let mapped: T & MappedFields;
  if (isNewStructureEntry(rawDepartment, rawType, index)) {
    mapped = {
      ...base,
      department: rawDepartment,
      role: rawRole,
      type: rawType,
      mapping_status: "new_structure",
    };
  } else {
    const match = lookupTaskMap(rawDepartment, rawRole, rawTask, index);
    mapped = match
      ? {
          ...base,
          department: match.newDepartment,
          role: match.newRole,
          type: match.activityType,
          mapping_status: "mapped",
        }
      : {
          ...base,
          department: rawDepartment,
          role: rawRole,
          type: rawType,
          mapping_status: "unmapped",
        };
  }

  if (hasCategoryOverride(override)) {
    mapped = {
      ...mapped,
      department: pick(override?.department, mapped.department),
      role: pick(override?.role, mapped.role),
      type: pick(override?.activityType, mapped.type),
      mapping_status: "override",
    };
  }

  return applyBillable(mapped, override);
}

export function applyCategoryMapToEntries<T extends CategorySource>(
  rows: T[],
  options?: ApplyCategoryOptions
): Array<T & MappedFields> {
  const overrides = options?.overrides;
  const byId =
    overrides && overrides.length > 0
      ? new Map(overrides.map((row) => [row.entryId, row]))
      : null;
  return rows.map((row) =>
    applyCategoryMap(row, {
      index: options?.index,
      override:
        options?.override ??
        (byId && typeof row.id === "number" ? (byId.get(row.id) ?? null) : null),
    })
  );
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

export type MappingListStatus = "confirmed" | "unmapped";

export type MappingListRow = {
  key: string;
  ruleId: string | null;
  department: string;
  role: string;
  task: string;
  newDepartment: string | null;
  newRole: string | null;
  activityType: string | null;
  entries: number;
  hours: number;
  exceptions: number;
  status: MappingListStatus;
};

type MappingCount = {
  entries: number;
  hours: number;
  exceptions: number;
};

function addCount<T extends MappingCount>(
  current: T,
  hours: Num | undefined,
  exception: boolean
): T {
  const value = Number(hours);
  current.entries += 1;
  current.hours += Number.isFinite(value) ? value : 0;
  if (exception) current.exceptions += 1;
  return current;
}

/** One row per saved rule, plus logged combinations that still have no rule. */
export function mappingList(
  index: CategoryIndex,
  rows: Array<CategorySource & { mapping_status?: MappingStatus; hours?: Num }>
): MappingListRow[] {
  const byRule = new Map<string, MappingCount>();
  const unmatched = new Map<
    string,
    MappingCount & { department: string; role: string; task: string }
  >();

  for (const row of rows) {
    const rawDepartment = row.raw_department ?? row.department;
    const rawRole = row.raw_role ?? row.role;
    const rawTask = row.raw_task ?? row.task;
    const rawType = row.raw_type ?? row.type;
    if (isNewStructureEntry(rawDepartment, rawType, index)) continue;

    const department = text(rawDepartment);
    const role = text(rawRole);
    const task = text(rawTask);
    const exception = row.mapping_status === "override";
    const match = lookupTaskMap(rawDepartment, rawRole, rawTask, index);
    if (match) {
      const current = byRule.get(match.id) ?? { entries: 0, hours: 0, exceptions: 0 };
      byRule.set(match.id, addCount(current, row.hours, exception));
      continue;
    }

    const key = `${department}\0${role}\0${task}`;
    const current = unmatched.get(key) ?? {
      department,
      role,
      task,
      entries: 0,
      hours: 0,
      exceptions: 0,
    };
    unmatched.set(key, addCount(current, row.hours, exception));
  }

  const confirmed: MappingListRow[] = index.tasks.map((task) => {
    const count = byRule.get(task.id) ?? { entries: 0, hours: 0, exceptions: 0 };
    return {
      key: task.id,
      ruleId: task.id,
      department: task.oldDepartment,
      role: text(task.oldRole),
      task: task.oldTask,
      newDepartment: task.newDepartment,
      newRole: task.newRole,
      activityType: task.activityType,
      ...count,
      status: "confirmed",
    };
  });

  const missing: MappingListRow[] = Array.from(unmatched.values()).map((row) => ({
    key: `unmapped:${row.department}\0${row.role}\0${row.task}`,
    ruleId: null,
    department: row.department,
    role: row.role,
    task: row.task,
    newDepartment: null,
    newRole: null,
    activityType: null,
    entries: row.entries,
    hours: row.hours,
    exceptions: row.exceptions,
    status: "unmapped",
  }));

  return [...missing, ...confirmed].sort(
    (a, b) =>
      b.entries - a.entries ||
      a.department.localeCompare(b.department) ||
      a.role.localeCompare(b.role) ||
      a.task.localeCompare(b.task)
  );
}

export function entryMatchesMapping(
  row: CategorySource,
  mapping: Pick<MappingListRow, "ruleId" | "department" | "role" | "task">,
  index: CategoryIndex = defaultIndex
): boolean {
  const rawDepartment = row.raw_department ?? row.department;
  const rawRole = row.raw_role ?? row.role;
  const rawTask = row.raw_task ?? row.task;
  const rawType = row.raw_type ?? row.type;
  if (isNewStructureEntry(rawDepartment, rawType, index)) return false;
  if (mapping.ruleId) {
    return lookupTaskMap(rawDepartment, rawRole, rawTask, index)?.id === mapping.ruleId;
  }
  return (
    text(rawDepartment) === mapping.department &&
    text(rawRole) === mapping.role &&
    text(rawTask) === mapping.task
  );
}

/** Category the entry would show with no entry exception. */
export function ruleCategory(
  row: CategorySource,
  index: CategoryIndex = defaultIndex
): { department: string | null; role: string | null; activityType: string | null } {
  const rawDepartment = row.raw_department ?? row.department;
  const rawRole = row.raw_role ?? row.role;
  const rawTask = row.raw_task ?? row.task;
  const rawType = row.raw_type ?? row.type;
  if (isNewStructureEntry(rawDepartment, rawType, index)) {
    return { department: rawDepartment, role: rawRole, activityType: rawType };
  }
  const match = lookupTaskMap(rawDepartment, rawRole, rawTask, index);
  if (!match) {
    return { department: rawDepartment, role: rawRole, activityType: rawType };
  }
  return {
    department: match.newDepartment,
    role: match.newRole,
    activityType: match.activityType,
  };
}

export type ReviewCatalog = {
  departments: string[];
  roles: { department: string; role: string }[];
  activityTypes: { id: string; name: string; sortOrder: number }[];
};

export function indexFromReview(input: {
  tasks: TaskRow[];
  departments: { oldName: string; newName: string }[];
  activityNames: string[];
}): CategoryIndex {
  return createCategoryIndex({
    tasks: input.tasks,
    roles: [],
    activityTypes: input.activityNames.map((name, sortOrder) => ({
      id: name,
      name,
      billableType: "",
      existsInMemtime: true,
      isNewType: false,
      group: null,
      description: null,
      sortOrder,
    })),
    departments: input.departments.map((row) => ({
      oldId: row.oldName,
      oldName: row.oldName,
      oldMemtimeName: row.oldName,
      newId: row.newName,
      newName: row.newName,
      verifiedLive: true,
    })),
  });
}

/** Stable identity for a logged dept/role/task mapping rule. */
export function taskRuleKey(
  task: Pick<TaskRow, "oldDepartment" | "oldRole" | "oldTask">
): string {
  return `${task.oldDepartment}\0${task.oldRole ?? ""}\0${task.oldTask}`;
}

/**
 * Keep optimistic local rules when a refetch still returns a stale task_map
 * (common with process-local caches across serverless instances).
 */
export function mergeReviewTasks(
  serverTasks: TaskRow[],
  localTasks: TaskRow[]
): TaskRow[] {
  if (localTasks.length === 0) return serverTasks;
  const serverKeys = new Set(serverTasks.map((task) => taskRuleKey(task)));
  const extras = localTasks.filter((task) => !serverKeys.has(taskRuleKey(task)));
  return extras.length === 0 ? serverTasks : [...serverTasks, ...extras];
}

export interface CatalogIssue {
  kind: string;
  name: string;
  detail: string;
}

export function catalogIssues(
  crosswalk: CategoryCrosswalk = bundledCrosswalk
): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  for (const row of crosswalk.activityTypes) {
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
  for (const row of crosswalk.roles) {
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
  for (const row of crosswalk.departments) {
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

export function activityTypeCount(
  crosswalk: CategoryCrosswalk = bundledCrosswalk
): number {
  return crosswalk.activityTypes.length;
}
