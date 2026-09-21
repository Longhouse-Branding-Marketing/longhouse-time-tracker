import type {
  ImportCommitResult,
  ImportProgressEvent,
  ImportStreamEvent,
} from "./import-action-types";

export const IMPORT_NOTIFY_AFTER_MS = 120_000;

export function formatElapsed(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 60) return `${sec} sec`;
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;
  if (seconds === 0) return `${minutes} min`;
  return `${minutes} min ${seconds} sec`;
}

export function parseSseBuffer(buffer: string): {
  events: ImportStreamEvent[];
  rest: string;
} {
  const events: ImportStreamEvent[] = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";

  for (const block of parts) {
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("");
    if (!data) continue;
    try {
      const parsed = JSON.parse(data) as ImportStreamEvent;
      if (parsed && typeof parsed === "object" && "type" in parsed) {
        events.push(parsed);
      }
    } catch {
      // Drop a malformed chunk; the next complete event can still land.
    }
  }

  return { events, rest };
}

export async function readImportCommitStream(
  res: Response,
  onProgress?: (event: ImportProgressEvent) => void
): Promise<ImportCommitResult> {
  if (!res.body) {
    throw new Error("Import stream was empty");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: ImportCommitResult | null = null;
  let streamError: string | null = null;

  const applyEvents = (events: ImportStreamEvent[]) => {
    for (const event of events) {
      if (event.type === "progress") {
        onProgress?.({
          phase: event.phase,
          done: event.done,
          total: event.total,
          label: event.label,
        });
      } else if (event.type === "complete") {
        result = event.result;
      } else if (event.type === "error") {
        streamError = event.error;
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSseBuffer(buffer);
    buffer = parsed.rest;
    applyEvents(parsed.events);
  }

  if (buffer.trim()) {
    applyEvents(parseSseBuffer(`${buffer}\n\n`).events);
  }

  if (streamError) throw new Error(streamError);
  if (!result) throw new Error("Import ended without a result");
  return result;
}
