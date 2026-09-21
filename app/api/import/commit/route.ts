import { NextResponse } from "next/server";
import { commitImport } from "@/app/import/actions";
import {
  HubAccessError,
  requireHubAccessFromRequest,
} from "@/lib/hub/verifyHubAccess";

export const maxDuration = 300;

function bearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}

function intField(form: FormData, key: string): number | undefined {
  const raw = form.get(key);
  if (raw == null) return undefined;
  const n = Number(String(raw));
  return Number.isFinite(n) ? n : undefined;
}

function ssePayload(obj: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}

/** Multipart CSV upload — avoids the 1MB Server Actions body limit. Streams insert progress. */
export async function POST(req: Request) {
  try {
    await requireHubAccessFromRequest(req);
    const token = bearerToken(req);
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ ok: false, error: "Missing CSV file" }, { status: 400 });
    }

    const rejectedCount = intField(form, "rejectedCount") ?? 0;
    const totalRows = intField(form, "totalRows");
    const sourceFile = file.name || null;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (obj: unknown) => {
          controller.enqueue(ssePayload(obj));
        };
        try {
          send({
            type: "progress",
            phase: "matching",
            done: 0,
            total: 1,
            label: "Reading CSV…",
          });
          const csvText = await file.text();
          send({
            type: "progress",
            phase: "matching",
            done: 0,
            total: 1,
            label: "Checking Duplicates…",
          });
          const result = await commitImport(token, csvText, sourceFile, {
            rejectedCount,
            totalRows,
            onProgress: (event) => send({ type: "progress", ...event }),
          });
          send({ type: "complete", result });
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Failed to commit import";
          try {
            send({ type: "error", error: message });
          } catch {
            // Client already disconnected.
          }
        } finally {
          try {
            controller.close();
          } catch {
            // Already closed.
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    if (err instanceof HubAccessError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Failed to commit import";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
