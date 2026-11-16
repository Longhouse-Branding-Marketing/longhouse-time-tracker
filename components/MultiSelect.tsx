"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { CaretDownIcon } from "@phosphor-icons/react";
import { matchesContains } from "@/lib/contains";
import { useMenuPlacement } from "@/lib/useMenuPlacement";

export { matchesContains };

function useIsClient(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  fullWidth = false,
  searchable = false,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  fullWidth?: boolean;
  /** Type in the field to filter options with contains matching. */
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mounted = useIsClient();
  const showSearch = searchable || options.length > 8;
  const placement = useMenuPlacement(ref, open);

  function close() {
    setOpen(false);
    setQuery("");
  }

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
      setQuery("");
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = (value: string) =>
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    );

  const summary =
    selected.length === 0
      ? "All"
      : selected.length === 1
        ? selected[0]
        : `${selected.length} selected`;

  const filtered =
    showSearch && query ? options.filter((o) => matchesContains(o, query)) : options;

  const menu =
    open && mounted && placement
      ? createPortal(
          <div
            ref={listRef}
            role="listbox"
            aria-label={label}
            className="lh-dropdown-panel fixed z-[80] overflow-hidden p-1.5"
            style={{
              top: placement.top,
              left: placement.left,
              width: Math.max(placement.width, fullWidth ? placement.width : 256),
              maxHeight: placement.maxHeight,
              transformOrigin: placement.openUp ? "bottom left" : "top left",
            }}
          >
            {selected.length ? (
              <button
                type="button"
                onClick={() => onChange([])}
                className={`lh-dropdown-option mb-1 w-full rounded-md px-2.5 text-left font-semibold text-brand-600 touch-manipulation ${
                  fullWidth ? "py-2.5 text-base" : "py-1.5 text-xs"
                }`}
              >
                Clear {label.toLowerCase()}
              </button>
            ) : null}
            <div
              className="lh-scroll overflow-auto"
              style={{ maxHeight: placement.maxHeight - (selected.length ? 40 : 8) }}
            >
              {filtered.length === 0 ? (
                <p className={`px-2.5 py-2 text-muted ${fullWidth ? "text-base" : "text-xs"}`}>
                  No matches
                </p>
              ) : (
                filtered.map((opt) => (
                  <label
                    key={opt}
                    className={`lh-dropdown-option flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 touch-manipulation ${
                      fullWidth ? "py-2.5 text-base" : "py-2 text-[13px]"
                    } ${selected.includes(opt) ? "bg-info-soft text-ink" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(opt)}
                      onChange={() => toggle(opt)}
                      className={`accent-[color:var(--color-brand)] ${
                        fullWidth ? "h-4 w-4" : "h-3.5 w-3.5"
                      }`}
                    />
                    <span className="min-w-0 truncate">{opt}</span>
                  </label>
                ))
              )}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className={fullWidth ? "relative w-full" : "relative"} ref={ref}>
      <div
        aria-haspopup="listbox"
        aria-expanded={open}
        data-open={open}
        className={`lh-dropdown-trigger flex items-center rounded-md border touch-manipulation ${
          fullWidth
            ? "h-12 w-full max-w-none justify-between gap-3 px-3.5 text-base"
            : "h-10 max-w-[220px] gap-1.5 px-2.5 text-[13px] md:h-8"
        } ${selected.length ? "border-brand-600 text-ink" : "text-ink"}`}
      >
        <span className="shrink-0 text-muted">{label}</span>
        {showSearch ? (
          <input
            ref={inputRef}
            type="text"
            value={open ? query : summary}
            placeholder={summary}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            aria-label={`Search ${label}`}
            onFocus={() => {
              setQuery("");
              setOpen(true);
            }}
            onClick={() => {
              setQuery("");
              setOpen(true);
            }}
            onChange={(e) => {
              setOpen(true);
              setQuery(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                close();
                inputRef.current?.blur();
              }
              if (e.key === "Enter") e.preventDefault();
            }}
            className={`min-w-0 flex-1 bg-transparent font-medium outline-none placeholder:text-ink ${
              fullWidth ? "text-right text-base" : "text-right text-[13px]"
            }`}
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              if (open) close();
              else setOpen(true);
            }}
            className="flex min-w-0 flex-1 items-center justify-end gap-2 bg-transparent"
          >
            <span className="truncate text-right font-medium">{summary}</span>
          </button>
        )}
        <button
          type="button"
          tabIndex={-1}
          aria-label={open ? "Close" : "Open"}
          onClick={() => {
            if (open) close();
            else {
              setQuery("");
              setOpen(true);
              if (showSearch) inputRef.current?.focus();
            }
          }}
          className="shrink-0 text-muted"
        >
          <CaretDownIcon
            size={fullWidth ? 16 : 14}
            weight="bold"
            aria-hidden
            className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>
      {menu}
    </div>
  );
}
