"use client";

import { startTransition, useActionState } from "react";
import type { ActionResult } from "@/app/settings/actions";

export type FieldType =
  | "text"
  | "date"
  | "number"
  | "checkbox"
  | "textarea"
  | "select"
  | "hidden";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  placeholder?: string;
  defaultValue?: string | boolean;
  grow?: boolean;
  /** When true, the control is shown but not editable. */
  readOnly?: boolean;
}

type Row = { id: number };
type SaveAction = (fd: FormData) => Promise<ActionResult>;

function fieldValue(row: Row | null, key: string): unknown {
  return row ? (row as Record<string, unknown>)[key] : undefined;
}

export function TableEditor({
  fields,
  rows,
  saveAction,
  deleteAction,
  addLabel = "Add",
  showNew = true,
  layout = "row",
  onSaved,
  onCancel,
  onDeleted,
}: {
  fields: FieldDef[];
  rows: Row[];
  saveAction: SaveAction;
  deleteAction: SaveAction;
  addLabel?: string;
  showNew?: boolean;
  /** `row` = compact inline strip; `form` = stacked fields for modals. */
  layout?: "row" | "form";
  onSaved?: () => void;
  onCancel?: () => void;
  onDeleted?: () => void;
}) {
  return (
    <div className={layout === "form" ? "space-y-0" : "space-y-2 p-3"}>
      {rows.map((row) => (
        <RecordForm
          key={row.id}
          fields={fields}
          row={row}
          saveAction={saveAction}
          deleteAction={deleteAction}
          layout={layout}
          onSaved={onSaved}
          onCancel={onCancel}
          onDeleted={onDeleted}
        />
      ))}
      {showNew ? (
        <RecordForm
          key="__new__"
          fields={fields}
          row={null}
          saveAction={saveAction}
          deleteAction={deleteAction}
          addLabel={addLabel}
          layout={layout}
          onSaved={onSaved}
          onCancel={onCancel}
        />
      ) : null}
    </div>
  );
}

function RecordForm({
  fields,
  row,
  saveAction,
  deleteAction,
  addLabel,
  layout,
  onSaved,
  onCancel,
  onDeleted,
}: {
  fields: FieldDef[];
  row: Row | null;
  saveAction: SaveAction;
  deleteAction: SaveAction;
  addLabel?: string;
  layout: "row" | "form";
  onSaved?: () => void;
  onCancel?: () => void;
  onDeleted?: () => void;
}) {
  const isNew = row === null;
  const isForm = layout === "form";
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
      if (result.ok) onSaved?.();
      return result;
    },
    null
  );
  const [delState, del, deleting] = useActionState(
    async (_p: ActionResult | null, fd: FormData) => {
      const result = await deleteAction(fd);
      if (result.ok) onDeleted?.();
      return result;
    },
    null
  );
  const saved = saveState?.ok === true && !onSaved;
  const error = saveState?.error ?? delState?.error;

  const visibleFields = fields.filter((f) => f.type !== "hidden");
  const hiddenFields = fields.filter((f) => f.type === "hidden");

  return (
    <form
      action={save}
      className={
        isForm
          ? "px-5 py-4"
          : `rounded-md border px-3 py-2.5 ${
              isNew ? "border-dashed border-line bg-tint/40" : "border-line bg-card"
            }`
      }
    >
      {row ? <input type="hidden" name="id" value={row.id} /> : null}
      {hiddenFields.map((f) => (
        <Field key={f.key} field={f} row={row} layout={layout} />
      ))}

      {isForm ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {visibleFields.map((f) => (
            <div
              key={f.key}
              className={
                f.type === "checkbox" || f.grow || f.type === "textarea"
                  ? "sm:col-span-2"
                  : ""
              }
            >
              <Field field={f} row={row} layout={layout} />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
          {visibleFields.map((f) => (
            <Field key={f.key} field={f} row={row} layout={layout} />
          ))}
          <div className="ml-auto flex items-center gap-2 pb-0.5">
            <FormActions
              saved={saved}
              error={null}
              saving={saving}
              deleting={deleting}
              isNew={isNew}
              addLabel={addLabel}
              del={del}
              onCancel={onCancel}
            />
          </div>
        </div>
      )}

      {isForm ? (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
          <FormActions
            saved={saved}
            error={error}
            saving={saving}
            deleting={deleting}
            isNew={isNew}
            addLabel={addLabel}
            del={del}
            onCancel={onCancel}
          />
        </div>
      ) : error ? (
        <div className="mt-1.5 text-[12px] text-serious">{error}</div>
      ) : null}
    </form>
  );
}

function FormActions({
  saved,
  error,
  saving,
  deleting,
  isNew,
  addLabel,
  del,
  onCancel,
}: {
  saved: boolean;
  error: string | null | undefined;
  saving: boolean;
  deleting: boolean;
  isNew: boolean;
  addLabel?: string;
  del: (payload: FormData) => void;
  onCancel?: () => void;
}) {
  return (
    <>
      {error ? (
        <span className="mr-auto text-[12px] text-serious">{error}</span>
      ) : null}
      {saved ? (
        <span className="text-[11px] font-medium text-positive">Saved</span>
      ) : null}
      {onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          className="h-8 rounded-md border border-line px-2.5 text-[13px] font-medium text-muted hover:bg-tint"
        >
          Cancel
        </button>
      ) : null}
      <button
        type="submit"
        disabled={saving}
        className="h-8 rounded-md bg-brand px-3 text-[13px] font-medium text-white hover:bg-navy disabled:opacity-50"
      >
        {saving ? "Saving…" : isNew ? addLabel : "Save"}
      </button>
      {!isNew ? (
        <button
          type="button"
          disabled={deleting}
          onClick={(event) => {
            if (
              !window.confirm(
                "Delete this record? This cannot be undone."
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
    </>
  );
}

function Field({
  field,
  row,
  layout,
}: {
  field: FieldDef;
  row: Row | null;
  layout: "row" | "form";
}) {
  const raw = row ? fieldValue(row, field.key) : field.defaultValue;
  const inputBase =
    "h-8 rounded-md border border-line bg-card px-2 text-[13px] text-ink outline-none transition-colors hover:border-[#b8c7d6] focus:border-brand-600 focus:ring-3 focus:ring-brand-600/15";
  const fullWidth = layout === "form" ? "w-full" : "";

  if (field.type === "hidden") {
    const value = raw == null ? "" : String(raw);
    return <input type="hidden" name={field.key} value={value} />;
  }

  if (field.type === "checkbox") {
    const checked = row ? Boolean(raw) : Boolean(field.defaultValue);
    return (
      <label className="flex select-none items-center gap-1.5 pb-1.5 text-[12px] text-muted">
        <input
          type="checkbox"
          name={field.key}
          defaultChecked={checked}
          className="h-3.5 w-3.5 accent-[color:var(--color-brand)]"
        />
        {field.label}
      </label>
    );
  }

  const value = raw == null ? "" : String(raw);

  return (
    <label
      className={`flex flex-col gap-1 ${
        layout === "form"
          ? "w-full"
          : field.grow
            ? "min-w-[180px] flex-1"
            : ""
      }`}
    >
      <span className="lh-meta-label">{field.label}</span>
      {field.type === "textarea" ? (
        <textarea
          name={field.key}
          defaultValue={value}
          placeholder={field.placeholder}
          rows={layout === "form" ? 2 : 1}
          readOnly={field.readOnly}
          className={`${inputBase} ${fullWidth} ${
            layout === "form" ? "min-h-[64px]" : "h-8 min-w-[160px]"
          } resize-y py-1.5 ${field.readOnly ? "bg-tint text-muted" : ""}`}
        />
      ) : field.type === "select" ? (
        <select
          name={field.key}
          defaultValue={value}
          disabled={field.readOnly}
          className={`lh-select-trigger ${inputBase} ${fullWidth}`}
        >
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={field.type}
          name={field.key}
          defaultValue={value}
          placeholder={field.placeholder}
          readOnly={field.readOnly}
          step={field.type === "number" ? "0.5" : undefined}
          className={`${inputBase} ${
            layout === "form"
              ? "w-full"
              : field.type === "date"
                ? "w-[140px]"
                : field.grow
                  ? "w-full"
                  : "w-[150px]"
          } ${field.readOnly ? "bg-tint text-muted" : ""}`}
        />
      )}
    </label>
  );
}
