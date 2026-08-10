"use client";

import { startTransition, useActionState, useState } from "react";
import { Badge, EmptyRow } from "@/components/ui";
import { EditModal } from "./EditModal";
import type { ActionResult } from "@/app/settings/actions";
import { formatDate } from "@/lib/formatters";
import type { TimeOff } from "@/lib/types";

type SaveAction = (fd: FormData) => Promise<ActionResult>;

const inputClass =
  "h-8 w-full rounded-md border border-line bg-card px-2 text-[13px] text-ink outline-none transition-colors hover:border-[#b8c7d6] focus:border-brand-600 focus:ring-3 focus:ring-brand-600/15";

/**
 * Editable time-off table scoped to one person. Person is locked from the
 * left-rail selection; saves/deletes sync through server actions → Supabase.
 * Edit/Add open a viewport-centered modal so fields stay on screen.
 */
export function PersonTimeOffTable({
  person,
  rows,
  saveAction,
  deleteAction,
}: {
  person: string;
  rows: TimeOff[];
  saveAction: SaveAction;
  deleteAction: SaveAction;
}) {
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const editingEntry =
    typeof editingId === "number"
      ? (rows.find((entry) => entry.id === editingId) ?? null)
      : null;

  function closeEditor() {
    setEditingId(null);
  }

  return (
    <div>
      <div className="lh-scroll overflow-x-auto">
        <table className="lh-table">
          <thead>
            <tr>
              <th>Start</th>
              <th>End</th>
              <th>Reason</th>
              <th>Working day</th>
              <th>Notes</th>
              <th className="w-[1%] text-right"> </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => (
              <tr
                key={entry.id}
                className={editingId === entry.id ? "!bg-blue-1/45" : ""}
              >
                <td className="whitespace-nowrap">{formatDate(entry.start_date)}</td>
                <td className="whitespace-nowrap">{formatDate(entry.end_date)}</td>
                <td className="font-medium text-ink">{entry.reason}</td>
                <td>
                  <Badge tone={entry.counts_as_working_day ? "review" : "neutral"}>
                    {entry.counts_as_working_day ? "Yes" : "No"}
                  </Badge>
                </td>
                <td className="max-w-[220px] truncate text-muted">
                  {entry.notes || "—"}
                </td>
                <td className="text-right">
                  <button
                    type="button"
                    onClick={() => setEditingId(entry.id)}
                    className="text-[12px] font-medium text-brand-600 hover:underline"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}

            {rows.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyRow>No time off for this person yet.</EmptyRow>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="border-t border-line px-4 py-3">
        <button
          type="button"
          onClick={() => setEditingId("new")}
          className="rounded-md border border-line bg-card px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-tint"
        >
          Add time off
        </button>
      </div>

      {editingId !== null && (editingId === "new" || editingEntry) ? (
        <EditModal
          title={editingId === "new" ? "Add Time Off" : "Edit Time Off"}
          onClose={closeEditor}
        >
          <TimeOffForm
            key={editingId === "new" ? "__new__" : editingId}
            person={person}
            entry={editingEntry}
            saveAction={saveAction}
            deleteAction={deleteAction}
            onDone={closeEditor}
          />
        </EditModal>
      ) : null}
    </div>
  );
}

function TimeOffForm({
  person,
  entry,
  saveAction,
  deleteAction,
  onDone,
}: {
  person: string;
  entry: TimeOff | null;
  saveAction: SaveAction;
  deleteAction: SaveAction;
  onDone: () => void;
}) {
  const isNew = entry === null;
  const [saveState, save, saving] = useActionState(
    async (_p: ActionResult | null, fd: FormData) => {
      const start = String(fd.get("start_date") ?? "");
      const end = String(fd.get("end_date") ?? "");
      if (start && end && end < start) {
        return {
          ok: false as const,
          error: "End date must be on or after the start date",
        };
      }
      const result = await saveAction(fd);
      if (result.ok) onDone();
      return result;
    },
    null
  );
  const [delState, del, deleting] = useActionState(
    async (_p: ActionResult | null, fd: FormData) => {
      const result = await deleteAction(fd);
      if (result.ok) onDone();
      return result;
    },
    null
  );
  const error = saveState?.error ?? delState?.error;

  return (
    <form action={save} className="px-5 py-4">
      {entry ? <input type="hidden" name="id" value={entry.id} /> : null}
      <input type="hidden" name="person" value={person} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="lh-meta-label">Start</span>
          <input
            type="date"
            name="start_date"
            required
            defaultValue={entry?.start_date ?? ""}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="lh-meta-label">End</span>
          <input
            type="date"
            name="end_date"
            required
            defaultValue={entry?.end_date ?? ""}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="lh-meta-label">Reason</span>
          <input
            type="text"
            name="reason"
            placeholder="Vacation"
            defaultValue={entry?.reason ?? ""}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="lh-meta-label">Notes</span>
          <input
            type="text"
            name="notes"
            defaultValue={entry?.notes ?? ""}
            className={inputClass}
          />
        </label>
        <label className="flex items-center gap-1.5 text-[12px] text-muted sm:col-span-2">
          <input
            type="checkbox"
            name="counts_as_working_day"
            defaultChecked={entry?.counts_as_working_day ?? false}
            className="h-3.5 w-3.5 accent-[color:var(--color-brand)]"
          />
          Counts as working day
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
        {error ? (
          <span className="mr-auto text-[12px] text-serious">{error}</span>
        ) : null}
        <button
          type="button"
          onClick={onDone}
          className="h-8 rounded-md border border-line px-2.5 text-[13px] font-medium text-muted hover:bg-tint"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="h-8 rounded-md bg-brand px-3 text-[13px] font-medium text-white hover:bg-navy disabled:opacity-50"
        >
          {saving ? "Saving…" : isNew ? "Add" : "Save"}
        </button>
        {!isNew ? (
          <button
            type="button"
            disabled={deleting}
            onClick={(event) => {
              if (
                !window.confirm(
                  "Delete this time off entry? This cannot be undone."
                )
              ) {
                return;
              }
              const form = event.currentTarget.form;
              if (!form) return;
              startTransition(() => {
                del(new FormData(form));
              });
            }}
            className="h-8 rounded-md border border-line px-2.5 text-[13px] font-medium text-serious hover:bg-serious-soft disabled:opacity-50"
          >
            {deleting ? "…" : "Delete"}
          </button>
        ) : null}
      </div>
    </form>
  );
}
