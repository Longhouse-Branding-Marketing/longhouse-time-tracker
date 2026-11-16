import {
  bundledCrosswalk,
  createCategoryIndex,
  type ActivityType,
  type CategoryCrosswalk,
  type CategoryIndex,
  type DepartmentRow,
  type EntryOverride,
  type ReviewCatalog,
  type RoleRow,
  type TaskRow,
} from "./categoryMap";
import { memoryCached } from "./memory-cache";
import { fetchAll } from "./supabase";

type DbActivity = {
  activity_type_id: string;
  name: string;
  billable_type: string;
  exists_in_memtime: boolean;
  is_new_type: boolean;
  activity_group: string | null;
  description: string | null;
  sort_order: number;
};

type DbDepartment = {
  old_department_id: string;
  old_department: string;
  old_department_memtime_name: string;
  new_department_id: string;
  new_department: string;
  live_name_verified: boolean;
};

type DbRole = {
  old_role_id: string;
  old_department: string;
  old_role: string;
  new_department: string;
  new_role: string;
  new_role_verified_live: boolean;
};

type DbTask = {
  row_id: string;
  old_department: string;
  old_department_memtime_name: string;
  old_role: string | null;
  old_task: string;
  old_task_normalized: string;
  new_department: string;
  new_role: string;
  new_activity_type_id: string;
  new_activity_type: string;
  billable_type: string;
  historical_billable_rule: string;
};

type DbOverride = {
  entry_id: number;
  department: string | null;
  role: string | null;
  activity_type: string | null;
  billable: string | null;
};

const ACTIVITY_COLUMNS =
  "activity_type_id,name,billable_type,exists_in_memtime,is_new_type,activity_group,description,sort_order";
const DEPARTMENT_COLUMNS =
  "old_department_id,old_department,old_department_memtime_name,new_department_id,new_department,live_name_verified";
const ROLE_COLUMNS =
  "old_role_id,old_department,old_role,new_department,new_role,new_role_verified_live";
const TASK_COLUMNS =
  "row_id,old_department,old_department_memtime_name,old_role,old_task,old_task_normalized,new_department,new_role,new_activity_type_id,new_activity_type,billable_type,historical_billable_rule";
const OVERRIDE_COLUMNS = "entry_id,department,role,activity_type,billable";

function missingRelation(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("does not exist") ||
    normalized.includes("schema cache") ||
    normalized.includes("could not find the table") ||
    normalized.includes("pgrst205")
  );
}

function activityFromDb(row: DbActivity): ActivityType {
  return {
    id: row.activity_type_id,
    name: row.name,
    billableType: row.billable_type,
    existsInMemtime: row.exists_in_memtime,
    isNewType: row.is_new_type,
    group: row.activity_group,
    description: row.description,
    sortOrder: row.sort_order,
  };
}

function departmentFromDb(row: DbDepartment): DepartmentRow {
  return {
    oldId: row.old_department_id,
    oldName: row.old_department,
    oldMemtimeName: row.old_department_memtime_name,
    newId: row.new_department_id,
    newName: row.new_department,
    verifiedLive: row.live_name_verified,
  };
}

function roleFromDb(row: DbRole): RoleRow {
  return {
    oldId: row.old_role_id,
    oldDepartment: row.old_department,
    oldRole: row.old_role,
    newDepartment: row.new_department,
    newRole: row.new_role,
    verifiedLive: row.new_role_verified_live,
  };
}

function taskFromDb(row: DbTask): TaskRow {
  return {
    id: row.row_id,
    oldDepartment: row.old_department,
    oldDepartmentMemtime: row.old_department_memtime_name,
    oldRole: row.old_role,
    oldTask: row.old_task,
    oldTaskNormalized: row.old_task_normalized,
    newDepartment: row.new_department,
    newRole: row.new_role,
    activityTypeId: row.new_activity_type_id,
    activityType: row.new_activity_type,
    billableType: row.billable_type,
    historicalBillableRule: row.historical_billable_rule,
  };
}

async function loadCrosswalk(): Promise<CategoryCrosswalk> {
  try {
    const [activityTypes, departments, roles, tasks] = await Promise.all([
      fetchAll<DbActivity>("activity_types", ACTIVITY_COLUMNS, (query) =>
        query.order("activity_type_id", { ascending: true })
      ),
      fetchAll<DbDepartment>("department_map", DEPARTMENT_COLUMNS, (query) =>
        query.order("old_department_id", { ascending: true })
      ),
      fetchAll<DbRole>("role_map", ROLE_COLUMNS, (query) =>
        query.order("old_role_id", { ascending: true })
      ),
      fetchAll<DbTask>("task_map", TASK_COLUMNS, (query) =>
        query.order("row_id", { ascending: true })
      ),
    ]);
    if (tasks.length === 0) return bundledCrosswalk;
    return {
      activityTypes: activityTypes.map(activityFromDb),
      departments: departments.map(departmentFromDb),
      roles: roles.map(roleFromDb),
      tasks: tasks.map(taskFromDb),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (missingRelation(message)) return bundledCrosswalk;
    throw err;
  }
}

async function loadOverrides(): Promise<EntryOverride[]> {
  try {
    const rows = await fetchAll<DbOverride>(
      "time_entry_overrides",
      OVERRIDE_COLUMNS,
      (query) => query.order("entry_id", { ascending: true })
    );
    return rows.map((row) => ({
      entryId: row.entry_id,
      department: row.department,
      role: row.role,
      activityType: row.activity_type,
      billable: row.billable,
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (missingRelation(message)) return [];
    throw err;
  }
}

export async function getCategoryCrosswalk(): Promise<CategoryCrosswalk> {
  return memoryCached("category-crosswalk-v2", loadCrosswalk);
}

export async function getCategoryIndex(): Promise<CategoryIndex> {
  const crosswalk = await getCategoryCrosswalk();
  return createCategoryIndex(crosswalk);
}

export async function getEntryOverrides(): Promise<EntryOverride[]> {
  return memoryCached("entry-overrides-v1", loadOverrides);
}

export function reviewCatalog(crosswalk: CategoryCrosswalk): ReviewCatalog {
  const departmentNames = new Set(
    crosswalk.departments.map((row) => row.newName).filter(Boolean)
  );
  for (const row of crosswalk.tasks) {
    if (row.newDepartment) departmentNames.add(row.newDepartment);
  }
  const departments = Array.from(departmentNames).sort((a, b) => a.localeCompare(b));

  const roleKey = new Set<string>();
  const roles: ReviewCatalog["roles"] = [];
  const addRole = (department: string, role: string) => {
    const key = `${department}\0${role}`;
    if (!department || !role || roleKey.has(key)) return;
    roleKey.add(key);
    roles.push({ department, role });
  };
  for (const row of crosswalk.roles) addRole(row.newDepartment, row.newRole);
  for (const row of crosswalk.tasks) addRole(row.newDepartment, row.newRole);
  roles.sort(
    (a, b) => a.department.localeCompare(b.department) || a.role.localeCompare(b.role)
  );

  const activityTypes = crosswalk.activityTypes
    .map((row) => ({ id: row.id, name: row.name, sortOrder: row.sortOrder }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  return { departments, roles, activityTypes };
}
