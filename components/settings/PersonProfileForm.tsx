"use client";

import { startTransition, useActionState, useEffect, useId, useRef, useState } from "react";
import { CameraIcon } from "@phosphor-icons/react";
import { Avatar } from "@/components/ui";
import type { ActionResult } from "@/app/settings/actions";
import type { Employee } from "@/lib/types";

type SaveAction = (fd: FormData) => Promise<ActionResult>;

function draftFrom(employee: Employee | null) {
  return {
    person: employee?.person ?? "",
    photo_url: employee?.photo_url ?? "",
    active: employee?.active ?? true,
  };
}

/**
 * Inline identity editor — photo, name, and active status edit on the
 * profile display itself (no separate Name / Photo URL / Active fields).
 */
export function PersonProfileForm({
  employee,
  saveAction,
  deleteAction,
  onSaved,
  onCancel,
  onDeleted,
}: {
  employee: Employee | null;
  saveAction: SaveAction;
  deleteAction: SaveAction;
  onSaved?: (person: string) => void;
  onCancel?: () => void;
  onDeleted?: () => void;
}) {
  const isNew = employee === null;
  const photoPopoverId = useId();
  const baseline = draftFrom(employee);
  const [person, setPerson] = useState(baseline.person);
  const [photoUrl, setPhotoUrl] = useState(baseline.photo_url);
  const [active, setActive] = useState(baseline.active);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoDraft, setPhotoDraft] = useState(baseline.photo_url);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const photoPanelRef = useRef<HTMLDivElement>(null);
  const photoTriggerRef = useRef<HTMLButtonElement>(null);

  // Reset draft when switching people / entering create mode.
  useEffect(() => {
    const next = draftFrom(employee);
    setPerson(next.person);
    setPhotoUrl(next.photo_url);
    setActive(next.active);
    setPhotoDraft(next.photo_url);
    setPhotoOpen(false);
  }, [employee]);

  useEffect(() => {
    if (isNew) nameInputRef.current?.focus();
  }, [isNew, employee?.id]);

  useEffect(() => {
    if (!photoOpen) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        photoPanelRef.current?.contains(target) ||
        photoTriggerRef.current?.contains(target)
      ) {
        return;
      }
      setPhotoOpen(false);
      setPhotoDraft(photoUrl);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPhotoOpen(false);
        setPhotoDraft(photoUrl);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [photoOpen, photoUrl]);

  const dirty =
    person.trim() !== baseline.person ||
    (photoUrl || "") !== (baseline.photo_url || "") ||
    active !== baseline.active;

  const [saveState, save, saving] = useActionState(
    async (_p: ActionResult | null, fd: FormData) => {
      fd.set("person", person.trim());
      if (photoUrl.trim()) fd.set("photo_url", photoUrl.trim());
      else fd.delete("photo_url");
      if (active) fd.set("active", "on");
      else fd.delete("active");
      const result = await saveAction(fd);
      if (result.ok) onSaved?.(person.trim());
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

  const error = saveState?.error ?? delState?.error;
  const saved = saveState?.ok === true && !dirty;

  function applyPhoto() {
    setPhotoUrl(photoDraft.trim());
    setPhotoOpen(false);
  }

  function clearPhoto() {
    setPhotoDraft("");
    setPhotoUrl("");
    setPhotoOpen(false);
  }

  return (
    <form action={save} className="px-5 py-4">
      {employee ? <input type="hidden" name="id" value={employee.id} /> : null}

      {/* Avatar + status on one row; name full-width below so it is not
          clipped beside the photo (native inputs clip without ellipsis). */}
      <div className="flex items-start justify-between gap-3">
        <div className="relative shrink-0">
          <button
            ref={photoTriggerRef}
            type="button"
            aria-expanded={photoOpen}
            aria-controls={photoPopoverId}
            aria-label="Change profile photo"
            onClick={() => {
              setPhotoDraft(photoUrl);
              setPhotoOpen((open) => !open);
            }}
            className="group relative rounded-full outline-none focus-visible:ring-3 focus-visible:ring-brand-600/25"
          >
            <Avatar
              name={person.trim() || "New person"}
              photoUrl={photoUrl || null}
              size="lg"
            />
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-ink/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <CameraIcon size={20} weight="regular" aria-hidden />
            </span>
          </button>

          {photoOpen ? (
            <div
              ref={photoPanelRef}
              id={photoPopoverId}
              role="dialog"
              aria-label="Profile photo URL"
              className="absolute left-0 top-[calc(100%+8px)] z-20 w-[min(280px,calc(100vw-3rem))] rounded-lg border border-line bg-card p-3 shadow-[0_8px_24px_rgba(2,22,61,0.12)]"
            >
              <label className="flex flex-col gap-1">
                <span className="lh-meta-label">Photo URL</span>
                <input
                  type="url"
                  value={photoDraft}
                  onChange={(e) => setPhotoDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      applyPhoto();
                    }
                  }}
                  placeholder="https://…"
                  autoFocus
                  className="h-8 w-full rounded-md border border-line bg-card px-2 text-[13px] text-ink outline-none transition-colors hover:border-[#b8c7d6] focus:border-brand-600 focus:ring-3 focus:ring-brand-600/15"
                />
              </label>
              <div className="mt-2.5 flex items-center justify-end gap-2">
                {photoUrl || photoDraft ? (
                  <button
                    type="button"
                    onClick={clearPhoto}
                    className="h-7 rounded-md px-2 text-[12px] font-medium text-muted hover:bg-tint hover:text-ink"
                  >
                    Remove
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={applyPhoto}
                  className="h-7 rounded-md bg-brand px-2.5 text-[12px] font-medium text-white hover:bg-navy"
                >
                  Apply
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setActive((v) => !v)}
          aria-pressed={active}
          aria-label={active ? "Mark inactive" : "Mark active"}
          title="Toggle active status"
          className={`inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-600/30 ${
            active
              ? "bg-positive-soft text-[color:var(--color-positive)] hover:brightness-95"
              : "bg-tint text-muted hover:bg-line/80 hover:text-ink"
          }`}
        >
          {active ? "Active" : "Inactive"}
        </button>
      </div>

      <label className="mt-3 flex flex-col gap-1">
        <span className="lh-meta-label">Name</span>
        <input
          ref={nameInputRef}
          type="text"
          name="person"
          value={person}
          onChange={(e) => setPerson(e.target.value)}
          placeholder="Full name"
          required
          aria-label="Name"
          className="h-9 w-full rounded-md border border-line bg-card px-2.5 text-[14px] font-medium text-ink outline-none transition-colors hover:border-[#b8c7d6] focus:border-brand-600 focus:ring-3 focus:ring-brand-600/15"
        />
      </label>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
        {error ? (
          <span className="mr-auto text-[12px] text-serious">{error}</span>
        ) : saved ? (
          <span className="mr-auto text-[11px] font-medium text-positive">Saved</span>
        ) : dirty && !isNew ? (
          <span className="mr-auto text-[11px] text-muted">Unsaved changes</span>
        ) : null}

        {isNew && onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="h-8 rounded-md border border-line px-2.5 text-[13px] font-medium text-muted hover:bg-tint"
          >
            Cancel
          </button>
        ) : null}

        {(isNew || dirty) && (
          <button
            type="submit"
            disabled={saving || !person.trim()}
            className="h-8 rounded-md bg-brand px-3 text-[13px] font-medium text-white hover:bg-navy disabled:opacity-50"
          >
            {saving ? "Saving…" : isNew ? "Create Person" : "Save"}
          </button>
        )}

        {!isNew ? (
          <button
            type="button"
            disabled={deleting}
            onClick={(event) => {
              if (
                !window.confirm(
                  `Delete ${employee?.person ?? "this person"}? This cannot be undone.`
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
