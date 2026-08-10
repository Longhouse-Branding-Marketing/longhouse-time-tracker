"use client";

import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowUpIcon,
  CircleNotchIcon,
  DotsSixIcon,
  DotsSixVerticalIcon,
  SparkleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useDashboardFilters } from "@/lib/dashboard-filters";
import { useHubAccessToken } from "@/lib/hub/HubSessionContext";
import type { ChatMessage } from "@/lib/chat/types";

const EXAMPLE_PROMPTS = [
  "Who may need time-tracking support right now?",
  "Where is time going by department?",
  "How does billable vs non-billable look for this period?",
  "Summarize tracking against the daily goal.",
  "Who is closest to their working-day average target?",
];

const SIZE_STORAGE_KEY = "ask-ai-panel-size";
const DEFAULT_HEIGHT_DVH = 35;
const MIN_HEIGHT_DVH = 20;
const MAX_HEIGHT_DVH = 70;
const DEFAULT_WIDTH_PX = 360;
const MIN_WIDTH_PX = 280;
const MAX_WIDTH_PX = 560;

type PanelSize = { heightDvh: number; widthPx: number };
type ResizeEdge = "top" | "left" | "right";

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function loadPanelSize(): PanelSize {
  try {
    const raw = localStorage.getItem(SIZE_STORAGE_KEY);
    if (!raw) {
      return { heightDvh: DEFAULT_HEIGHT_DVH, widthPx: DEFAULT_WIDTH_PX };
    }
    const parsed = JSON.parse(raw) as Partial<PanelSize>;
    return {
      heightDvh: clamp(
        Number(parsed.heightDvh) || DEFAULT_HEIGHT_DVH,
        MIN_HEIGHT_DVH,
        MAX_HEIGHT_DVH
      ),
      widthPx: clamp(
        Number(parsed.widthPx) || DEFAULT_WIDTH_PX,
        MIN_WIDTH_PX,
        MAX_WIDTH_PX
      ),
    };
  } catch {
    return { heightDvh: DEFAULT_HEIGHT_DVH, widthPx: DEFAULT_WIDTH_PX };
  }
}

function savePanelSize(size: PanelSize) {
  try {
    localStorage.setItem(SIZE_STORAGE_KEY, JSON.stringify(size));
  } catch {
    /* ignore quota / private mode */
  }
}

let nextPromptIndex = 0;

function takeExamplePrompt() {
  const prompt = EXAMPLE_PROMPTS[nextPromptIndex % EXAMPLE_PROMPTS.length];
  nextPromptIndex += 1;
  return prompt;
}

async function streamChat(
  accessToken: string,
  body: {
    messages: ChatMessage[];
    filters: unknown;
    useDashboardFilters: boolean;
  },
  onDelta: (text: string) => void,
  signal: AbortSignal
): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(
      typeof payload.error === "string"
        ? payload.error
        : `Chat failed (${res.status})`
    );
  }

  if (!res.body) throw new Error("No response stream");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const lines = part.split("\n");
      let event = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      const parsed = JSON.parse(data) as { text?: string; message?: string };
      if (event === "delta" && parsed.text) onDelta(parsed.text);
      if (event === "error") {
        throw new Error(parsed.message || "Chat failed");
      }
    }
  }
}

export function ChatPanel({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const { filters, isActive, summary } = useDashboardFilters();
  const accessToken = useHubAccessToken();
  const [applyDashboardFilters, setApplyDashboardFilters] = useState(isActive);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState(() => takeExamplePrompt());
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [size, setSize] = useState<PanelSize>({
    heightDvh: DEFAULT_HEIGHT_DVH,
    widthPx: DEFAULT_WIDTH_PX,
  });
  const [resizing, setResizing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const sizeRef = useRef(size);
  sizeRef.current = size;

  useEffect(() => {
    setSize(loadPanelSize());
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    inputRef.current?.focus();
    inputRef.current?.select();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      abortRef.current?.abort();
    };
  }, []);

  function startResize(edge: ResizeEdge, e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const start = sizeRef.current;
    setResizing(true);

    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    function onMove(ev: PointerEvent) {
      const next: PanelSize = { ...sizeRef.current };

      if (edge === "top") {
        const deltaY = startY - ev.clientY;
        const deltaDvh = (deltaY / window.innerHeight) * 100;
        next.heightDvh = clamp(
          start.heightDvh + deltaDvh,
          MIN_HEIGHT_DVH,
          MAX_HEIGHT_DVH
        );
      } else {
        const deltaX = edge === "right" ? ev.clientX - startX : startX - ev.clientX;
        const maxForViewport = Math.min(
          MAX_WIDTH_PX,
          window.innerWidth - 80
        );
        next.widthPx = clamp(
          start.widthPx + deltaX,
          MIN_WIDTH_PX,
          maxForViewport
        );
      }

      sizeRef.current = next;
      setSize(next);
    }

    function onUp(ev: PointerEvent) {
      target.releasePointerCapture(ev.pointerId);
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
      setResizing(false);
      savePanelSize(sizeRef.current);
    }

    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
  }

  useEffect(() => {
    if (isActive) setApplyDashboardFilters(true);
  }, [isActive]);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, streaming]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || streaming) return;

    setError(null);
    setInput("");
    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content },
    ];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setStreaming(true);

    const ac = new AbortController();
    abortRef.current = ac;

    if (!accessToken) {
      setError("Not signed in");
      setStreaming(false);
      return;
    }

    try {
      await streamChat(
        accessToken,
        {
          messages: nextMessages,
          filters: applyDashboardFilters ? filters : null,
          useDashboardFilters: applyDashboardFilters,
        },
        (delta) => {
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last?.role === "assistant") {
              copy[copy.length - 1] = {
                role: "assistant",
                content: last.content + delta,
              };
            }
            return copy;
          });
        },
        ac.signal
      );
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last?.role === "assistant" && !last.content) copy.pop();
        return copy;
      });
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className={`group/panel fixed bottom-4 left-[var(--dock-gutter)] z-[var(--z-dock)] flex flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-[0_12px_40px_rgba(2,22,61,0.14),0_2px_8px_rgba(2,22,61,0.06)] transition-[opacity,transform] duration-200 ease-out ${
        visible
          ? "translate-y-0 opacity-100"
          : "translate-y-3 opacity-0"
      } ${resizing ? "select-none" : ""}`}
      style={{
        height: `${size.heightDvh}dvh`,
        maxHeight: `${size.heightDvh}dvh`,
        width: `min(${size.widthPx}px, calc(100vw - var(--dock-gutter) - 1.25rem))`,
      }}
    >
      {/* Resize handles — grip icons appear on panel hover */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize chat height"
        onPointerDown={(e) => startResize("top", e)}
        className={`absolute inset-x-0 top-0 z-20 flex h-3 cursor-ns-resize items-center justify-center text-muted/55 transition-opacity ${
          resizing
            ? "opacity-100"
            : "opacity-0 group-hover/panel:opacity-100"
        }`}
      >
        <DotsSixIcon size={12} weight="bold" aria-hidden />
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize chat width"
        onPointerDown={(e) => startResize("left", e)}
        className={`absolute inset-y-0 left-0 z-20 flex w-3 cursor-ew-resize items-center justify-center text-muted/55 transition-opacity ${
          resizing
            ? "opacity-100"
            : "opacity-0 group-hover/panel:opacity-100"
        }`}
      >
        <DotsSixVerticalIcon size={12} weight="bold" aria-hidden />
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize chat width"
        onPointerDown={(e) => startResize("right", e)}
        className={`absolute inset-y-0 right-0 z-20 flex w-3 cursor-ew-resize items-center justify-center text-muted/55 transition-opacity ${
          resizing
            ? "opacity-100"
            : "opacity-0 group-hover/panel:opacity-100"
        }`}
      >
        <DotsSixVerticalIcon size={12} weight="bold" aria-hidden />
      </div>

      <header className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <SparkleIcon
            size={16}
            weight="fill"
            className="shrink-0 text-brand-600"
            aria-hidden
          />
          <h2 id={titleId} className="lh-section-title text-[14px]">
            Ask AI
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-lg p-1 text-muted transition-colors hover:bg-tint hover:text-ink"
        >
          <XIcon size={16} aria-hidden />
        </button>
      </header>

      <div className="border-b border-line px-3.5 py-2.5">
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            className="mt-0.5 accent-[var(--color-brand)]"
            checked={applyDashboardFilters}
            onChange={(e) => setApplyDashboardFilters(e.target.checked)}
            disabled={!filters}
          />
          <span className="min-w-0">
            <span className="block text-[12px] font-medium text-ink">
              Use dashboard filters
            </span>
            <span className="mt-0.5 block text-[11px] leading-snug text-muted">
              {filters
                ? applyDashboardFilters
                  ? summary || "Current dashboard scope"
                  : "Full active-employee dataset"
                : "Open Time Dashboard to apply filters"}
            </span>
          </span>
        </label>
      </div>

      <div ref={listRef} className="lh-scroll flex-1 overflow-y-auto px-3.5 py-3">
        {messages.length === 0 ? (
          <p className="px-1 py-6 text-center text-[12px] leading-relaxed text-muted">
            Ask a question about the time-tracking data.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {messages.map((m, i) => (
              <li
                key={`${m.role}-${i}`}
                className={`flex ${
                  m.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[92%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[12.5px] leading-relaxed ${
                    m.role === "user"
                      ? "bg-brand text-white"
                      : "border border-line bg-tint/60 text-ink"
                  }`}
                >
                  {m.content ||
                    (streaming && i === messages.length - 1 ? (
                      <span className="inline-flex items-center gap-1.5 text-muted">
                        <CircleNotchIcon
                          size={13}
                          className="animate-spin"
                          aria-hidden
                        />
                        Analyzing…
                      </span>
                    ) : (
                      ""
                    ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error ? (
        <p
          role="alert"
          className="border-t border-serious-soft bg-serious-soft px-3.5 py-2 text-[11px] text-serious"
        >
          {error}
        </p>
      ) : null}

      <form
        className="border-t border-line p-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <div className="flex items-end gap-1.5 rounded-xl border border-line bg-page px-2 py-1.5 focus-within:border-brand-600/40">
          <textarea
            ref={inputRef}
            rows={3}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            placeholder="Ask about the data…"
            disabled={streaming}
            className="max-h-28 min-h-[64px] flex-1 resize-none bg-transparent px-1 py-1.5 text-[12.5px] text-ink outline-none placeholder:text-muted disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            aria-label="Send"
            className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {streaming ? (
              <CircleNotchIcon size={14} className="animate-spin" aria-hidden />
            ) : (
              <ArrowUpIcon size={14} weight="bold" aria-hidden />
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
