"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CaretDownIcon } from "@phosphor-icons/react";
import { matchesContains } from "@/lib/contains";

export type SearchableOption = {
  value: string;
  label: string;
};

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Search…",
  emptyLabel = "—",
  allowEmpty = true,
  disabled = false,
  className = "",
}: {
  value: string;
  onChange: (next: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  emptyLabel?: string;
  allowEmpty?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const listId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = options.find((option) => option.value === value) ?? null;
  const display = open ? query : selected?.label ?? "";

  const filtered = useMemo(() => {
    if (!open || !query.trim()) return options;
    return options.filter((option) => matchesContains(option.label, query));
  }, [open, options, query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function openMenu() {
    if (disabled) return;
    setQuery("");
    setOpen(true);
  }

  function pick(next: string) {
    onChange(next);
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  }

  return (
    <div className={`relative ${className}`} ref={ref}>
      <div
        data-open={open}
        className={`lh-select-trigger flex h-8 w-full items-center gap-1 rounded-md border bg-card px-2 touch-manipulation ${
          disabled ? "cursor-not-allowed opacity-50" : ""
        } ${open ? "border-brand-600" : ""}`}
      >
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          disabled={disabled}
          value={display}
          placeholder={selected ? selected.label : placeholder}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          onFocus={openMenu}
          onClick={openMenu}
          onChange={(event) => {
            setOpen(true);
            setQuery(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
              setQuery("");
              inputRef.current?.blur();
            }
            if (event.key === "Enter") {
              event.preventDefault();
              const first = filtered[0];
              if (first) pick(first.value);
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-muted md:text-[13px] max-md:text-base"
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label="Toggle options"
          onClick={() => {
            if (open) {
              setOpen(false);
              setQuery("");
            } else {
              openMenu();
              inputRef.current?.focus();
            }
          }}
          className="shrink-0 rounded p-0.5 text-muted hover:text-ink"
        >
          <CaretDownIcon
            size={14}
            weight="bold"
            aria-hidden
            className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {open ? (
        <div
          id={listId}
          role="listbox"
          className="lh-dropdown-panel absolute left-0 right-0 z-40 mt-1.5 max-h-56 overflow-auto p-1.5"
        >
          {allowEmpty ? (
            <button
              type="button"
              role="option"
              aria-selected={!value}
              onClick={() => pick("")}
              className={`lh-dropdown-option w-full rounded-md px-2.5 py-2 text-left text-[13px] touch-manipulation ${
                !value ? "bg-info-soft text-ink" : "text-muted"
              }`}
            >
              {emptyLabel}
            </button>
          ) : null}
          {filtered.length === 0 ? (
            <p className="px-2.5 py-2 text-[13px] text-muted">No matches</p>
          ) : (
            filtered.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => pick(option.value)}
                className={`lh-dropdown-option w-full rounded-md px-2.5 py-2 text-left text-[13px] touch-manipulation ${
                  option.value === value ? "bg-info-soft font-medium text-ink" : "text-ink"
                }`}
              >
                <span className="block truncate">{option.label}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
