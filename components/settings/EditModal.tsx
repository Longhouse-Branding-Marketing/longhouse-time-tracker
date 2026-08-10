"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { XIcon } from "@phosphor-icons/react";

/**
 * Viewport-centered settings edit popout. Closes on backdrop click or Escape
 * (discard unsaved draft — same as Cancel).
 */
export function EditModal({
  title,
  onClose,
  children,
  size = "md",
  headerRight,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: "md" | "xl";
  headerRight?: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const [mounted, setMounted] = useState(false);
  onCloseRef.current = onClose;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusable = panel?.querySelector<HTMLElement>(
      'button, input:not([type="hidden"]), select, textarea, a[href]'
    );
    focusable?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
      }
    }
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [mounted]);

  if (!mounted) return null;

  const widthClass =
    size === "xl"
      ? "max-h-[min(92vh,900px)] max-w-5xl"
      : "max-h-[min(90vh,720px)] max-w-lg";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-[#02163d]/35 backdrop-blur-[1px]"
        onClick={() => onClose()}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative z-10 flex w-full flex-col overflow-hidden rounded-xl border border-line bg-card shadow-[0_12px_40px_rgba(2,22,61,0.18)] ${widthClass}`}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 id={titleId} className="lh-section-title">
            {title}
          </h2>
          <div className="flex items-center gap-2">
            {headerRight}
            <button
              type="button"
              onClick={() => onClose()}
              aria-label="Close"
              className="rounded-md p-1.5 text-muted transition-colors hover:bg-tint hover:text-ink"
            >
              <XIcon size={16} weight="bold" aria-hidden />
            </button>
          </div>
        </div>
        <div className="lh-scroll min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body
  );
}
