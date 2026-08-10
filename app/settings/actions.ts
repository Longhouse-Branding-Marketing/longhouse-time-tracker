"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { TIME_TRACKING_TAG } from "@/lib/cache-tags";
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
  const v = fd.get(key);
  if (v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function bool(fd: FormData, key: string): boolean {
  return fd.get(key) != null;
}

function idOf(fd: FormData): number | null {
  const v = str(fd, "id");
  return v ? Number(v) : null;
}

function revalidateAll() {
  // Expire cached Supabase bundles immediately after writes.
  bustMemoryCache();
  revalidateTag(TIME_TRACKING_TAG, { expire: 0 });
  revalidatePath("/settings");
  revalidatePath("/");
  revalidatePath("/people");
}

/** Prefer service-role for SECURITY DEFINER RPCs and base-table writes. */
function writeClient(): SupabaseClient {
  return hasSupabaseServiceRole() ? getSupabaseServiceRole() : getSupabase();
}

async function save(
  table: string,
  id: number | null,
  row: Record<string, unknown>
): Promise<ActionResult> {
  try {
    await withSupabaseRetry(async () => {
      const supabase = writeClient();
      const query = id
        ? supabase.from(table).update(row).eq("id", id)
        : supabase.from(table).insert(row);
      const { error } = await query;
      if (error) throw new Error(error.message);
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Save failed",
    };
  }
  revalidateAll();
  return { ok: true };
}

async function remove(table: string, id: number | null): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Missing id" };
  try {
    await withSupabaseRetry(async () => {
      const supabase = writeClient();
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw new Error(error.message);
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Delete failed",
    };
  }
  revalidateAll();
  return { ok: true };
}

// --- Employees -------------------------------------------------------------
// Prefer migration 005 RPCs (atomic + trigger cascade). When those are not
// applied yet, fall back to multi-step client writes (not fully atomic).

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (
    typeof err === "object" &&
    err !== null &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string"
  ) {
    return (err as { message: string }).message;
  }
  return String(err);
}

function errorCode(err: unknown): string {
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string"
  ) {
    return (err as { code: string }).code;
  }
  return "";
}

/** PostgREST missing RPC (migration 005 not applied / schema cache stale). */
function isMissingRpcError(err: unknown): boolean {
  const msg = errorMessage(err);
  const code = errorCode(err);
  return (
    code === "PGRST202" ||
    /PGRST202/i.test(msg) ||
    /could not find the function/i.test(msg) ||
    /schema cache/i.test(msg)
  );
}

function isMissingColumnError(err: unknown): boolean {
  const msg = errorMessage(err);
  const code = errorCode(err);
  return (
    code === "PGRST204" ||
    /could not find the .* column/i.test(msg) ||
    /column .* does not exist/i.test(msg)
  );
}

async function assertUniquePersonName(
  supabase: SupabaseClient,
  person: string,
  excludeId: number | null
): Promise<void> {
  let q = supabase.from("employees").select("id").eq("person", person).limit(1);
  if (excludeId != null) q = q.neq("id", excludeId);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(error.message);
  if (data) {
    throw new Error(`A person named "${person}" already exists`);
  }
}

/**
 * Non-atomic rename/create used when save_employee_profile is unavailable.
 * Cascades person text the same way as the migration trigger.
 */
async function saveEmployeeFallback(
  supabase: SupabaseClient,
  opts: {
    id: number | null;
    person: string;
    photo_url: string | null;
    active: boolean;
  }
): Promise<void> {
  const { person, photo_url, active } = opts;
  await assertUniquePersonName(supabase, person, opts.id);

  if (opts.id == null) {
    const { error } = await supabase.from("employees").insert({
      person,
      photo_url,
      active,
    });
    if (error) throw new Error(error.message);
  } else {
    const { data: existing, error: loadError } = await supabase
      .from("employees")
      .select("person")
      .eq("id", opts.id)
      .maybeSingle();
    if (loadError) throw new Error(loadError.message);
    if (!existing) throw new Error("Employee not found");

    const oldPerson = existing.person as string;
    const { error: updateError } = await supabase
      .from("employees")
      .update({ person, photo_url, active })
      .eq("id", opts.id);
    if (updateError) throw new Error(updateError.message);

    // Cascade rename before/after employee update is not transactional here —
    // migration 005 is required for true atomicity.
    if (oldPerson !== person) {
      for (const table of [
        "employee_schedules",
        "time_off",
        "time_entries",
      ] as const) {
        const { error } = await supabase
          .from(table)
          .update({ person })
          .eq("person", oldPerson);
        if (error) throw new Error(error.message);
      }
    }
  }

  if (!active) {
    const { error } = await supabase
      .from("employee_schedules")
      .update({ include_in_operations_kpi: false })
      .eq("person", person);
    if (error) throw new Error(error.message);
  }
}

/**
 * Non-atomic delete used when delete_employee_cascade is unavailable.
 * Keeps historical time_entries; only clears optional employee_id FK.
 */
async function deleteEmployeeFallback(
  supabase: SupabaseClient,
  id: number
): Promise<void> {
  const { data: existing, error: loadError } = await supabase
    .from("employees")
    .select("person")
    .eq("id", id)
    .maybeSingle();
  if (loadError) throw new Error(loadError.message);
  if (!existing) throw new Error("Employee not found");
  const person = existing.person as string;

  // Same order as migration 005: time_off → schedules → detach entries → employee.
  const { error: timeOffError } = await supabase
    .from("time_off")
    .delete()
    .eq("person", person);
  if (timeOffError) throw new Error(timeOffError.message);

  const { error: timeOffByIdError } = await supabase
    .from("time_off")
    .delete()
    .eq("employee_id", id);
  if (timeOffByIdError && !isMissingColumnError(timeOffByIdError)) {
    throw new Error(timeOffByIdError.message);
  }

  const { error: scheduleError } = await supabase
    .from("employee_schedules")
    .delete()
    .eq("person", person);
  if (scheduleError) throw new Error(scheduleError.message);

  const { error: scheduleByIdError } = await supabase
    .from("employee_schedules")
    .delete()
    .eq("employee_id", id);
  if (scheduleByIdError && !isMissingColumnError(scheduleByIdError)) {
    throw new Error(scheduleByIdError.message);
  }

  const { error: detachError } = await supabase
    .from("time_entries")
    .update({ employee_id: null })
    .eq("employee_id", id);
  if (detachError && !isMissingColumnError(detachError)) {
    throw new Error(detachError.message);
  }

  const { error: deleteError } = await supabase
    .from("employees")
    .delete()
    .eq("id", id);
  if (deleteError) throw new Error(deleteError.message);
}

export async function saveEmployee(fd: FormData): Promise<ActionResult> {
  const denied = await ensureAuth(fd);
  if (denied) return denied;

  const person = str(fd, "person");
  if (!person) return { ok: false, error: "Name is required" };
  const id = idOf(fd);
  const active = bool(fd, "active");
  const photo_url = str(fd, "photo_url");

  try {
    await withSupabaseRetry(async () => {
      const supabase = writeClient();
      const { error } = await supabase.rpc("save_employee_profile", {
        p_id: id,
        p_person: person,
        p_photo_url: photo_url,
        p_active: active,
      });
      if (!error) return;
      // Don't surface schema-cache noise when fallback can finish the save.
      if (isMissingRpcError(error)) {
        await saveEmployeeFallback(supabase, {
          id,
          person,
          photo_url,
          active,
        });
        return;
      }
      throw new Error(error.message);
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Save failed",
    };
  }

  revalidateAll();
  return { ok: true };
}

export async function deleteEmployee(fd: FormData): Promise<ActionResult> {
  const denied = await ensureAuth(fd);
  if (denied) return denied;

  const id = idOf(fd);
  if (!id) return { ok: false, error: "Missing id" };

  try {
    await withSupabaseRetry(async () => {
      const supabase = writeClient();
      // Deletes schedules + time_off; nulls time_entries.employee_id; keeps history.
      const { error } = await supabase.rpc("delete_employee_cascade", {
        p_id: id,
      });
      if (!error) return;
      if (isMissingRpcError(error)) {
        await deleteEmployeeFallback(supabase, id);
        return;
      }
      throw new Error(error.message);
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Delete failed",
    };
  }

  revalidateAll();
  return { ok: true };
}

// --- Employee schedules ----------------------------------------------------

export async function saveSchedule(fd: FormData): Promise<ActionResult> {
  const denied = await ensureAuth(fd);
  if (denied) return denied;

  const person = str(fd, "person");
  if (!person) return { ok: false, error: "Person is required" };

  let active = true;
  let id = idOf(fd);

  try {
    await withSupabaseRetry(async () => {
      const supabase = writeClient();
      const { data: employee, error: employeeError } = await supabase
        .from("employees")
        .select("active")
        .eq("person", person)
        .maybeSingle();
      if (employeeError) throw new Error(employeeError.message);
      active = employee?.active !== false;

      // One permanent schedule per person: update the latest row, or create one.
      if (!id) {
        const { data: existing, error } = await supabase
          .from("employee_schedules")
          .select("id")
          .eq("person", person)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw new Error(error.message);
        id = existing?.id ?? null;
      }
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Load failed",
    };
  }

  const daily = str(fd, "daily_goal");
  const row: Record<string, unknown> = {
    person,
    monday: bool(fd, "monday"),
    tuesday: bool(fd, "tuesday"),
    wednesday: bool(fd, "wednesday"),
    thursday: bool(fd, "thursday"),
    friday: bool(fd, "friday"),
    saturday: bool(fd, "saturday"),
    sunday: bool(fd, "sunday"),
    daily_goal: daily ? Number(daily) : 6.5,
    include_in_operations_kpi: active
      ? bool(fd, "include_in_operations_kpi")
      : false,
    // Permanent setting — no date window.
    effective_start_date: null,
    effective_end_date: null,
  };

  return save("employee_schedules", id, row);
}

export async function deleteSchedule(fd: FormData): Promise<ActionResult> {
  const denied = await ensureAuth(fd);
  if (denied) return denied;
  return remove("employee_schedules", idOf(fd));
}

// --- Time off --------------------------------------------------------------

export async function saveTimeOff(fd: FormData): Promise<ActionResult> {
  const denied = await ensureAuth(fd);
  if (denied) return denied;

  const person = str(fd, "person");
  const start_date = str(fd, "start_date");
  const end_date = str(fd, "end_date");
  if (!person) return { ok: false, error: "Person is required" };
  if (!start_date || !end_date)
    return { ok: false, error: "Start and end dates are required" };
  if (end_date < start_date)
    return { ok: false, error: "End date must be on or after the start date" };
  return save("time_off", idOf(fd), {
    person,
    start_date,
    end_date,
    reason: str(fd, "reason") ?? "Time off",
    counts_as_working_day: bool(fd, "counts_as_working_day"),
    notes: str(fd, "notes"),
  });
}

export async function deleteTimeOff(fd: FormData): Promise<ActionResult> {
  const denied = await ensureAuth(fd);
  if (denied) return denied;
  return remove("time_off", idOf(fd));
}

// --- Stat holidays ---------------------------------------------------------

export async function saveHoliday(fd: FormData): Promise<ActionResult> {
  const denied = await ensureAuth(fd);
  if (denied) return denied;

  const date = str(fd, "date");
  const holiday_name = str(fd, "holiday_name");
  if (!date) return { ok: false, error: "Date is required" };
  if (!holiday_name) return { ok: false, error: "Holiday name is required" };
  return save("stat_holidays", idOf(fd), {
    date,
    holiday_name,
    jurisdiction: str(fd, "jurisdiction") ?? "BC",
    holiday_type: str(fd, "holiday_type") ?? "statutory",
    counts_as_working_day: bool(fd, "counts_as_working_day"),
    source_url: str(fd, "source_url"),
    notes: str(fd, "notes"),
  });
}

export async function deleteHoliday(fd: FormData): Promise<ActionResult> {
  const denied = await ensureAuth(fd);
  if (denied) return denied;
  return remove("stat_holidays", idOf(fd));
}
