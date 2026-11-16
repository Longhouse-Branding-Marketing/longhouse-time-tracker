"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { TIME_TRACKING_TAG } from "@/lib/cache-tags";
import { getCategoryCrosswalk } from "@/lib/categoryMapData";
import { requireAuthFromFormData } from "@/lib/hub/serverActionAuth";
import { HubAccessError } from "@/lib/hub/verifyHubAccess";
import { bustMemoryCache } from "@/lib/memory-cache";
import {
  getSupabase,
  getSupabaseServiceRole,
  hasSupabaseServiceRole,
  withSupabaseRetry,
} from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function writeClient(): SupabaseClient {
  return hasSupabaseServiceRole() ? getSupabaseServiceRole() : getSupabase();
}

async function ensureAuth(fd: FormData): Promise<ActionResult | null> {
  try {
    await requireAuthFromFormData(fd);
    return null;
  } catch (err) {
    const message =
      err instanceof HubAccessError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Unauthorized";
    return { ok: false, error: message };
  }
}

function str(fd: FormData, key: string): string | null {
  const value = fd.get(key);
  if (value === null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function revalidateAll() {
  bustMemoryCache();
  revalidateTag(TIME_TRACKING_TAG, { expire: 0 });
  revalidatePath("/");
  revalidatePath("/people");
  revalidatePath("/review");
}

function fail(err: unknown): ActionResult {
  return {
    ok: false,
    error: err instanceof Error ? err.message : "Save failed",
  };
}

function entryId(fd: FormData): number | null {
  const value = str(fd, "entry_id");
  if (!value) return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function billableValue(value: string | null): "Billable" | "Non-Billable" | null {
  if (value === "Billable" || value === "Non-Billable") return value;
  return null;
}

export async function saveMapping(fd: FormData): Promise<ActionResult> {
  const denied = await ensureAuth(fd);
  if (denied) return denied;

  const oldDepartment = str(fd, "old_department");
  const oldRole = str(fd, "old_role");
  const oldTask = fd.get("old_task") === null ? "" : String(fd.get("old_task")).trim();
  const newDepartment = str(fd, "new_department");
  const newRole = str(fd, "new_role");
  const activityTypeId = str(fd, "activity_type_id");
  const ruleId = str(fd, "rule_id");

  if (!oldDepartment || !newDepartment || !newRole || !activityTypeId) {
    return { ok: false, error: "Department, role, and activity type are required" };
  }

  try {
    const crosswalk = await getCategoryCrosswalk();
    const activity = crosswalk.activityTypes.find((row) => row.id === activityTypeId);
    if (!activity) return { ok: false, error: "Unknown activity type" };

    await withSupabaseRetry(async () => {
      const supabase = writeClient();
      if (ruleId) {
        const { data, error } = await supabase
          .from("task_map")
          .update({
            new_department: newDepartment,
            new_role: newRole,
            new_activity_type_id: activity.id,
            new_activity_type: activity.name,
            billable_type: activity.billableType,
          })
          .eq("row_id", ruleId)
          .select("row_id");
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) {
          throw new Error("Mapping table is not ready");
        }
        return;
      }

      const { error } = await supabase.from("task_map").insert({
        row_id: `U${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`,
        old_department: oldDepartment,
        old_department_memtime_name: oldDepartment,
        old_role: oldRole,
        old_task: oldTask,
        old_task_normalized: oldTask,
        new_department: newDepartment,
        new_role: newRole,
        new_activity_type_id: activity.id,
        new_activity_type: activity.name,
        billable_type: activity.billableType,
        historical_billable_rule: "keep_original",
      });
      if (error) throw new Error(error.message);
    });
  } catch (err) {
    return fail(err);
  }

  revalidateAll();
  return { ok: true };
}

type OverrideWrite = {
  entry_id: number;
  department: string | null;
  role: string | null;
  activity_type: string | null;
  billable: string | null;
  updated_at: string;
};

async function writeOverride(row: OverrideWrite): Promise<void> {
  await withSupabaseRetry(async () => {
    const supabase = writeClient();
    if (!row.department && !row.role && !row.activity_type && !row.billable) {
      const { error } = await supabase
        .from("time_entry_overrides")
        .delete()
        .eq("entry_id", row.entry_id);
      if (error) throw new Error(error.message);
      return;
    }
    const { error } = await supabase.from("time_entry_overrides").upsert(row, {
      onConflict: "entry_id",
    });
    if (error) throw new Error(error.message);
  });
}

export async function saveEntryOverride(fd: FormData): Promise<ActionResult> {
  const denied = await ensureAuth(fd);
  if (denied) return denied;

  const id = entryId(fd);
  if (!id) return { ok: false, error: "Missing entry" };

  const clearCategory = fd.get("clear_category") === "1";
  const department = clearCategory ? null : str(fd, "department");
  const role = clearCategory ? null : str(fd, "role");
  const activityType = clearCategory ? null : str(fd, "activity_type");
  const billable = billableValue(str(fd, "billable"));

  try {
    await writeOverride({
      entry_id: id,
      department,
      role,
      activity_type: activityType,
      billable,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    return fail(err);
  }

  revalidateAll();
  return { ok: true };
}

export async function clearEntryCategory(fd: FormData): Promise<ActionResult> {
  const denied = await ensureAuth(fd);
  if (denied) return denied;

  const id = entryId(fd);
  if (!id) return { ok: false, error: "Missing entry" };

  try {
    await withSupabaseRetry(async () => {
      const supabase = writeClient();
      const { data, error } = await supabase
        .from("time_entry_overrides")
        .select("billable")
        .eq("entry_id", id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const billable = billableValue(
        typeof data?.billable === "string" ? data.billable : null
      );
      if (!billable) {
        const { error: deleteError } = await supabase
          .from("time_entry_overrides")
          .delete()
          .eq("entry_id", id);
        if (deleteError) throw new Error(deleteError.message);
        return;
      }
      const { error: updateError } = await supabase
        .from("time_entry_overrides")
        .update({
          department: null,
          role: null,
          activity_type: null,
          updated_at: new Date().toISOString(),
        })
        .eq("entry_id", id);
      if (updateError) throw new Error(updateError.message);
    });
  } catch (err) {
    return fail(err);
  }

  revalidateAll();
  return { ok: true };
}

export async function markEntriesBillable(fd: FormData): Promise<ActionResult> {
  const denied = await ensureAuth(fd);
  if (denied) return denied;

  let ids: number[] = [];
  try {
    const parsed = JSON.parse(str(fd, "entry_ids") ?? "[]") as unknown;
    if (!Array.isArray(parsed)) throw new Error("No entries");
    ids = Array.from(
      new Set(
        parsed.filter(
          (value): value is number =>
            typeof value === "number" && Number.isInteger(value) && value > 0
        )
      )
    );
  } catch {
    return { ok: false, error: "No entries" };
  }
  if (ids.length === 0) return { ok: false, error: "No entries" };

  const updatedAt = new Date().toISOString();
  try {
    await withSupabaseRetry(async () => {
      const supabase = writeClient();
      const size = 400;
      for (let start = 0; start < ids.length; start += size) {
        const rows = ids.slice(start, start + size).map((id) => ({
          entry_id: id,
          billable: "Billable",
          updated_at: updatedAt,
        }));
        const { error } = await supabase.from("time_entry_overrides").upsert(rows, {
          onConflict: "entry_id",
        });
        if (error) throw new Error(error.message);
      }
    });
  } catch (err) {
    return fail(err);
  }

  revalidateAll();
  return { ok: true };
}
