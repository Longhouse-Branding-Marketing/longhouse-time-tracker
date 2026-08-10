import type Anthropic from "@anthropic-ai/sdk";
import { SLICE_FILTER_SCHEMA } from "./filters";

export const SYSTEM_PROMPT = `You are the Longhouse Time Tracking assistant — a calm, supportive analyst for internal leadership review and coaching (not scoring).

## Data model
- Time entries cover active employees only (former staff excluded).
- Regular-staff daily goal is typically 6.5 hours, but each person may have their own schedule daily_goal.
- "Counted working days" = scheduled workdays minus statutory holidays and time-off that do not count as working days. Logging hours on a holiday does NOT make that day a counted working day.
- Status language: "On track", "Close to target", "Needs review", "Context exception", "Schedule needed", "Not included in current KPI". Prefer supportive phrasing ("may need support", "needs review") over punitive language.

## How you work
- You do NOT receive the full dataset. Use tools to query filtered aggregates and small samples.
- Always ground numbers in tool results. Never invent hours, people, or percentages.
- When the user has dashboard filters applied, those are the base scope unless they ask to widen.
- Prefer get_summary / get_people_status / breakdown / time_series before sample_entries.
- Keep answers concise and scannable. Use short bullets for comparisons.
- If a tool returns empty or sparse data, say so and suggest a broader filter.`;

export const CHAT_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "get_summary",
    description:
      "KPI summary for a filter slice: tracked hours, entries, people, billable %, avg hours per counted working day.",
    input_schema: {
      type: "object",
      properties: { ...SLICE_FILTER_SCHEMA.properties },
    },
  },
  {
    name: "get_people_status",
    description:
      "Per-person operations KPIs (status, avg working day, counted days). Optionally filter by person name(s) or status substring.",
    input_schema: {
      type: "object",
      properties: {
        ...SLICE_FILTER_SCHEMA.properties,
        status: {
          type: "string",
          description:
            'Optional status filter substring, e.g. "Needs review" or "On track"',
        },
      },
    },
  },
  {
    name: "breakdown",
    description:
      "Hours breakdown by department, role, task, type, or person (top N).",
    input_schema: {
      type: "object",
      properties: {
        ...SLICE_FILTER_SCHEMA.properties,
        dimension: {
          type: "string",
          enum: ["department", "role", "task", "type", "person"],
        },
        limit: { type: "number", description: "Max rows (default 15, max 40)" },
      },
    },
  },
  {
    name: "time_series",
    description: "Tracked hours over time for a slice (day, week, or month).",
    input_schema: {
      type: "object",
      properties: {
        ...SLICE_FILTER_SCHEMA.properties,
        granularity: {
          type: "string",
          enum: ["day", "week", "month"],
        },
      },
    },
  },
  {
    name: "sample_entries",
    description:
      "Small sample of matching entry rows (max 40). Use sparingly for qualitative digs — not for totals.",
    input_schema: {
      type: "object",
      properties: {
        ...SLICE_FILTER_SCHEMA.properties,
        limit: { type: "number", description: "Max rows (default 25, max 40)" },
      },
    },
  },
];
