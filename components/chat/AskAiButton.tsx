"use client";

import { useEffect, useRef, useState } from "react";
import { SparkleIcon } from "@phosphor-icons/react";
import { ChatPanel } from "./ChatPanel";

const ICON_GRAD_ID = "ask-ai-icon-grad";

/** Dock-style Ask AI trigger — sits above the bottom-left workspace menu. */
export function AskAiButton() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative flex flex-col items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Ask AI about time tracking data"
        aria-expanded={open}
        className={`group relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
          open ? "bg-white/35" : "bg-white/25 hover:bg-white/35"
        }`}
      >
        <svg width={0} height={0} className="absolute" aria-hidden>
          <defs>
            <linearGradient
              id={ICON_GRAD_ID}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stopColor="var(--color-brand)" />
              <stop offset="100%" stopColor="var(--color-brand-600)" />
            </linearGradient>
          </defs>
        </svg>
        <span className="relative inline-flex size-5 items-center justify-center">
          <SparkleIcon
            size={20}
            weight="regular"
            aria-hidden
            className={`text-heading/70 transition-opacity duration-200 ${
              open ? "opacity-0" : "opacity-100 group-hover:opacity-0"
            }`}
          />
          <SparkleIcon
            size={20}
            weight="regular"
            aria-hidden
            color={`url(#${ICON_GRAD_ID})`}
            className={`absolute inset-0 transition-opacity duration-200 ${
              open ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
          />
        </span>
        {!open ? (
          <span
            role="tooltip"
            className="lh-dock-tooltip pointer-events-none absolute top-1/2 left-[calc(100%+10px)] z-[var(--z-dock-tooltip)] -translate-y-1/2 whitespace-nowrap rounded-md border border-line bg-card px-2.5 py-1 text-[12px] font-medium text-ink opacity-0 shadow-[0_4px_14px_rgba(2,22,61,0.12)] transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            Ask AI
          </span>
        ) : null}
      </button>
      {open ? <ChatPanel onClose={() => setOpen(false)} /> : null}
    </div>
  );
}
