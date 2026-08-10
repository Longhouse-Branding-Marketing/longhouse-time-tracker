import { NextResponse } from "next/server";
import { runChatAgent } from "@/lib/chat/agent";
import type { ChatMessage } from "@/lib/chat/types";
import type { Filters } from "@/lib/filtering";
import {
  HubAccessError,
  requireHubAccessFromRequest,
} from "@/lib/hub/verifyHubAccess";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  messages?: ChatMessage[];
  filters?: Filters | null;
  useDashboardFilters?: boolean;
};

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const m = value as ChatMessage;
  return (
    (m.role === "user" || m.role === "assistant") &&
    typeof m.content === "string" &&
    m.content.trim().length > 0
  );
}

export async function POST(req: Request) {
  try {
    await requireHubAccessFromRequest(req);
  } catch (err) {
    if (err instanceof HubAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "Ask AI is not configured. Add ANTHROPIC_API_KEY to .env.local and restart the dev server.",
      },
      { status: 503 }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const messages = Array.isArray(body.messages)
    ? body.messages.filter(isChatMessage).slice(-20)
    : [];
  if (messages.length === 0) {
    return NextResponse.json(
      { error: "At least one user message is required" },
      { status: 400 }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        await runChatAgent({
          messages,
          filters: body.filters ?? null,
          useDashboardFilters: Boolean(body.useDashboardFilters),
          onTextDelta: (text) => send("delta", { text }),
        });
        send("done", {});
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Chat request failed";
        send("error", { message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
