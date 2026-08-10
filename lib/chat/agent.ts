import Anthropic from "@anthropic-ai/sdk";
import type { Filters } from "@/lib/filtering";
import { CHAT_TOOLS, SYSTEM_PROMPT } from "./prompt";
import {
  buildCatalog,
  toolBreakdown,
  toolGetPeopleStatus,
  toolGetSummary,
  toolSampleEntries,
  toolTimeSeries,
  type ChatToolContext,
} from "./tools";
import type { SliceFilters } from "./filters";
import type { ChatMessage } from "./types";

export type { ChatMessage } from "./types";

const MAX_TOOL_ROUNDS = 8;

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing ANTHROPIC_API_KEY. Add it to .env.local to enable Ask AI."
    );
  }
  return new Anthropic({ apiKey });
}

function modelName() {
  return process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-5";
}

async function runTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ChatToolContext
): Promise<unknown> {
  const slice = input as SliceFilters;
  switch (name) {
    case "get_summary":
      return toolGetSummary(ctx, slice);
    case "get_people_status":
      return toolGetPeopleStatus(ctx, {
        ...slice,
        status: typeof input.status === "string" ? input.status : undefined,
      });
    case "breakdown":
      return toolBreakdown(ctx, {
        ...slice,
        dimension: input.dimension as
          | "department"
          | "role"
          | "task"
          | "type"
          | "person"
          | undefined,
        limit: typeof input.limit === "number" ? input.limit : undefined,
      });
    case "time_series":
      return toolTimeSeries(ctx, {
        ...slice,
        granularity: input.granularity as
          | "day"
          | "week"
          | "month"
          | undefined,
      });
    case "sample_entries":
      return toolSampleEntries(ctx, {
        ...slice,
        limit: typeof input.limit === "number" ? input.limit : undefined,
      });
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

function textFromAssistant(
  content: Anthropic.Messages.ContentBlock[]
): string {
  return content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/** Emit text in small chunks so the UI can paint progressively. */
function emitText(text: string, onTextDelta: (t: string) => void) {
  if (!text) return;
  const size = 24;
  for (let i = 0; i < text.length; i += size) {
    onTextDelta(text.slice(i, i + size));
  }
}

/**
 * Tool-calling agent loop. Emits the final assistant text as deltas for SSE.
 */
export async function runChatAgent(opts: {
  messages: ChatMessage[];
  filters: Filters | null;
  useDashboardFilters: boolean;
  onTextDelta: (text: string) => void;
}): Promise<void> {
  const client = getClient();
  const ctx: ChatToolContext = {
    baseFilters: opts.filters,
    useDashboardFilters: opts.useDashboardFilters,
  };

  const catalog = await buildCatalog(ctx);
  const system = `${SYSTEM_PROMPT}

## Current catalog
\`\`\`json
${JSON.stringify(catalog, null, 2)}
\`\`\``;

  const history: Anthropic.Messages.MessageParam[] = opts.messages.map(
    (m) => ({
      role: m.role,
      content: m.content,
    })
  );

  let response = await client.messages.create({
    model: modelName(),
    max_tokens: 4096,
    system,
    tools: CHAT_TOOLS,
    messages: history,
  });

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (response.stop_reason !== "tool_use") break;

    const toolUses = response.content.filter(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use"
    );
    if (toolUses.length === 0) break;

    history.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      const input =
        typeof use.input === "object" && use.input !== null
          ? (use.input as Record<string, unknown>)
          : {};
      const result = await runTool(use.name, input, ctx);
      toolResults.push({
        type: "tool_result",
        tool_use_id: use.id,
        content: JSON.stringify(result),
      });
    }

    history.push({ role: "user", content: toolResults });

    response = await client.messages.create({
      model: modelName(),
      max_tokens: 4096,
      system,
      tools: CHAT_TOOLS,
      messages: history,
    });
  }

  let answer = textFromAssistant(response.content);

  // If the model stopped on tools after max rounds, force a text-only finish.
  if (!answer || response.stop_reason === "tool_use") {
    history.push({ role: "assistant", content: response.content });
    const final = await client.messages.create({
      model: modelName(),
      max_tokens: 4096,
      system: `${system}\n\nDo not call tools. Answer from the tool results already available.`,
      messages: [
        ...history,
        {
          role: "user",
          content: "Provide your final answer now without using tools.",
        },
      ],
    });
    answer = textFromAssistant(final.content);
  }

  if (!answer) {
    throw new Error("Claude returned an empty answer. Try again.");
  }

  emitText(answer, opts.onTextDelta);
}
