"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { TIME_TRACKING_TAG } from "@/lib/cache-tags";
import { requireAuthFromFormData } from "@/lib/hub/serverActionAuth";
import { HubAccessError } from "@/lib/hub/verifyHubAccess";
import { bustMemoryCache } from "@/lib/memory-cache";
import { parseAliasInput } from "@/lib/import/resolvePerson";
import {
  currentSchedule,
  planScheduleChange,
  planScheduleDelete,
  validateScheduleWindow,
  type ScheduleWindow,
} from "@/lib/schedules";
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
    also_known_as: string[];
  }
): Promise<void> {
  const { person, photo_url, active, also_known_as } = opts;
  await assertUniquePersonName(supabase, person, opts.id);

  if (opts.id == null) {
    const { error } = await supabase.from("employees").insert({
      person,
      photo_url,
      active,
      also_known_as,
    });
    if (error) {
      if (isMissingColumnError(error)) {
        const { error: retry } = await supabase.from("employees").insert({
          person,
          photo_url,
          active,
        });
        if (retry) throw new Error(retry.message);
        return;
      }
      throw new Error(error.message);
    }
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
      .update({ person, photo_url, active, also_known_as })
      .eq("id", opts.id);
    if (updateError) {
      if (!isMissingColumnError(updateError)) {
        throw new Error(updateError.message);
      }
      const { error: retry } = await supabase
        .from("employees")
        .update({ person, photo_url, active })
        .eq("id", opts.id);
      if (retry) throw new Error(retry.message);
    }

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
      const { error: hashError } = await supabase.rpc(
        "recompute_time_entry_hashes_for_person",
        { p_id: opts.id, p_person: person }
      );
      if (hashError && !isMissingRpcError(hashError)) {
        throw new Error(hashError.message);
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
  const alsoKnownAs = parseAliasInput(str(fd, "also_known_as"));

  try {
    await withSupabaseRetry(async () => {
      const supabase = writeClient();
      const { error } = await supabase.rpc("save_employee_profile", {
        p_id: id,
        p_person: person,
        p_photo_url: photo_url,
        p_active: active,
        p_also_known_as: alsoKnownAs,
      });
      if (!error) return;
      // Don't surface schema-cache noise when fallback can finish the save.
      if (isMissingRpcError(error)) {
        await saveEmployeeFallback(supabase, {
          id,
          person,
          photo_url,
          active,
          also_known_as: alsoKnownAs,
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
// Several periods per person. NULL start = since tracking began. NULL end =
// the current open period. Logging a change closes the previous period; it
// does not rewrite that period's weekdays.

interface ScheduleRecord extends ScheduleWindow {
  person: string;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
  daily_goal: number | string | null;
  include_in_operations_kpi: boolean;
  notes: string | null;
  employee_id: number | null;
}

function asDate(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

function parseDailyGoal(fd: FormData): number | { error: string } {
  const daily = str(fd, "daily_goal");
  if (!daily) return 6.5;
  const goal = Number(daily);
  if (!Number.isFinite(goal) || goal < 0) {
    return { error: "Daily goal must be a number of hours." };
  }
  return goal;
}

function schedulePattern(fd: FormData, active: boolean, goal: number, notes: string | null) {
  return {
    monday: bool(fd, "monday"),
    tuesday: bool(fd, "tuesday"),
    wednesday: bool(fd, "wednesday"),
    thursday: bool(fd, "thursday"),
    friday: bool(fd, "friday"),
    saturday: bool(fd, "saturday"),
    sunday: bool(fd, "sunday"),
    daily_goal: goal,
    include_in_operations_kpi: active ? bool(fd, "include_in_operations_kpi") : false,
    notes,
  };
}

async function loadScheduleContext(
  supabase: SupabaseClient,
  person: string
): Promise<{ active: boolean; employeeId: number; schedules: ScheduleRecord[] }> {
  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("id, active")
    .eq("person", person)
    .maybeSingle();
  if (employeeError) throw new Error(employeeError.message);
  if (!employee) throw new Error("Person not found");

  const { data, error } = await supabase
    .from("employee_schedules")
    .select(
      "id, person, effective_start_date, effective_end_date, monday, tuesday, wednesday, thursday, friday, saturday, sunday, daily_goal, include_in_operations_kpi, notes, created_at, employee_id"
    )
    .eq("person", person);
  if (error) throw new Error(error.message);

  const schedules = ((data ?? []) as ScheduleRecord[]).map((row) => ({
    ...row,
    id: Number(row.id),
    effective_start_date: asDate(row.effective_start_date),
    effective_end_date: asDate(row.effective_end_date),
    employee_id: row.employee_id == null ? null : Number(row.employee_id),
  }));

  return {
    active: employee.active !== false,
    employeeId: Number(employee.id),
    schedules,
  };
}

async function writeSchedule(
  supabase: SupabaseClient,
  id: number | null,
  row: Record<string, unknown>
): Promise<void> {
  const query = id
    ? supabase.from("employee_schedules").update(row).eq("id", id)
    : supabase.from("employee_schedules").insert(row);
  const { error } = await query;
  if (error) throw new Error(error.message);
}

async function closeSchedulePeriods(
  supabase: SupabaseClient,
  ids: number[],
  closeEnd: string
): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from("employee_schedules")
    .update({ effective_end_date: closeEnd })
    .in("id", ids);
  if (error) throw new Error(error.message);
}

export async function saveSchedule(fd: FormData): Promise<ActionResult> {
  const denied = await ensureAuth(fd);
  if (denied) return denied;

  const person = str(fd, "person");
  if (!person) return { ok: false, error: "Person is required" };

  const goal = parseDailyGoal(fd);
  if (typeof goal !== "number") return { ok: false, error: goal.error };

  try {
    const context = await withSupabaseRetry(() =>
      loadScheduleContext(writeClient(), person)
    );
    const supabase = writeClient();
    const { active, employeeId, schedules } = context;

    let intent = str(fd, "intent");
    let id = idOf(fd);
    if (intent !== "create" && intent !== "change" && intent !== "correct") {
      intent = schedules.length === 0 ? "create" : "correct";
      if (intent === "correct" && id == null) {
        id = currentSchedule(schedules)?.id ?? null;
      }
    }

    const base = {
      person,
      employee_id: employeeId,
    };

    if (intent === "create") {
      if (schedules.length > 0) {
        return {
          ok: false,
          error:
            "This person already has a schedule. Log a change, or update the current period.",
        };
      }
      await writeSchedule(supabase, null, {
        ...base,
        ...schedulePattern(fd, active, goal, fd.has("notes_present") ? str(fd, "notes") : null),
        // First schedule covers every tracked day until a change is logged.
        effective_start_date: null,
        effective_end_date: null,
      });
    } else if (intent === "change") {
      const plan = planScheduleChange(schedules, str(fd, "effective_start_date"));
      if (!plan.ok) return { ok: false, error: plan.error };

      const current = currentSchedule(
        schedules.filter((schedule) => schedule.id !== plan.updateId)
      );
      const notes = fd.has("notes_present")
        ? str(fd, "notes")
        : plan.mode === "update"
          ? (schedules.find((schedule) => schedule.id === plan.updateId)?.notes ??
            null)
          : (current?.notes ?? null);

      const row = {
        ...base,
        ...schedulePattern(fd, active, goal, notes),
        effective_start_date: str(fd, "effective_start_date"),
        effective_end_date: null,
      };

      if (plan.mode === "update" && plan.updateId != null) {
        await writeSchedule(supabase, plan.updateId, row);
      } else {
        await writeSchedule(supabase, null, row);
      }

      try {
        await closeSchedulePeriods(supabase, plan.closeIds, plan.closeEnd);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Save failed";
        return {
          ok: false,
          error: `The new schedule was saved, but the previous period could not be closed (${message}). Save again to finish. Averages already use the new schedule from its start date.`,
        };
      }
    } else {
      if (id == null) {
        return { ok: false, error: "Schedule not found" };
      }
      const existing = schedules.find((schedule) => schedule.id === id);
      if (!existing) return { ok: false, error: "Schedule not found" };

      const start = fd.has("dates_present")
        ? str(fd, "effective_start_date")
        : existing.effective_start_date;
      const end = fd.has("dates_present")
        ? str(fd, "effective_end_date")
        : existing.effective_end_date;
      const notes = fd.has("notes_present") ? str(fd, "notes") : existing.notes;
      const windowError = validateScheduleWindow(
        { effective_start_date: start, effective_end_date: end },
        schedules.filter((schedule) => schedule.id !== id)
      );
      if (windowError) return { ok: false, error: windowError };

      await writeSchedule(supabase, id, {
        ...base,
        ...schedulePattern(fd, active, goal, notes),
        effective_start_date: start,
        effective_end_date: end,
      });
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Save failed",
    };
  }

  revalidateAll();
  return { ok: true };
}

export async function deleteSchedule(fd: FormData): Promise<ActionResult> {
  const denied = await ensureAuth(fd);
  if (denied) return denied;

  const id = idOf(fd);
  if (!id) return { ok: false, error: "Missing id" };

  try {
    const supabase = writeClient();
    const { data: row, error: rowError } = await supabase
      .from("employee_schedules")
      .select("id, person")
      .eq("id", id)
      .maybeSingle();
    if (rowError) throw new Error(rowError.message);
    if (!row?.person) return { ok: false, error: "Schedule not found" };

    const { schedules } = await loadScheduleContext(supabase, row.person as string);
    const plan = planScheduleDelete(schedules, id);
    if (!plan.ok) return { ok: false, error: plan.error };

    if (plan.reopen) {
      const { error: reopenError } = await supabase
        .from("employee_schedules")
        .update({ effective_end_date: null })
        .eq("id", plan.reopen.id);
      if (reopenError) throw new Error(reopenError.message);
    }

    const { error: deleteError } = await supabase
      .from("employee_schedules")
      .delete()
      .eq("id", id);
    if (deleteError) {
      if (plan.reopen) {
        await supabase
          .from("employee_schedules")
          .update({ effective_end_date: plan.reopen.previousEnd })
          .eq("id", plan.reopen.id);
      }
      throw new Error(deleteError.message);
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Delete failed",
    };
  }

  revalidateAll();
  return { ok: true };
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
