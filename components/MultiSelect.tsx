"use client";

import { useEffect, useRef, useState } from "react";
import { CaretDownIcon } from "@phosphor-icons/react";

export function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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

  const filtered = query
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-open={open}
        className={`lh-dropdown-trigger flex h-8 max-w-[180px] items-center gap-1.5 rounded-md border px-2.5 text-[13px] ${
          selected.length
            ? "border-brand-600 text-ink"
            : "text-ink"
        }`}
      >
        <span className="text-muted">{label}</span>
        <span className="truncate font-medium">{summary}</span>
        <CaretDownIcon
          size={14}
          weight="bold"
          aria-hidden
          className={`shrink-0 text-muted transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open ? (
        <div className="lh-dropdown-panel absolute left-0 z-30 mt-1.5 w-64 p-1.5">
          {options.length > 8 ? (
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}…`}
              className="lh-dropdown-input mb-1 w-full px-2.5 py-1.5 text-[13px]"
            />
          ) : null}
          {selected.length ? (
            <button
              type="button"
              onClick={() => onChange([])}
              className="lh-dropdown-option mb-1 w-full rounded-md px-2 py-1.5 text-left text-xs font-semibold text-brand-600"
            >
              Clear {label.toLowerCase()}
            </button>
          ) : null}
            <div className="lh-scroll max-h-56 overflow-auto" role="listbox" aria-label={label}>
            {filtered.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted">No matches</p>
            ) : (
              filtered.map((opt) => (
                <label
                  key={opt}
                  className={`lh-dropdown-option flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-[13px] ${
                    selected.includes(opt) ? "bg-info-soft text-ink" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(opt)}
                    onChange={() => toggle(opt)}
                    className="h-3.5 w-3.5 accent-[color:var(--color-brand)]"
                  />
                  <span className="truncate">{opt}</span>
                </label>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
