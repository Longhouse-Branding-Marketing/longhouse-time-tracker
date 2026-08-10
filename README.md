# Longhouse · Time Tracking Dashboard

A calm, supportive internal dashboard that helps Longhouse leadership understand
how the team is tracking time — against a **6.5 hour daily goal** for regular
staff. It is built for review and coaching, not scoring.

Built with **Next.js (App Router) · TypeScript · Tailwind CSS · Recharts · Supabase**.

## What it answers

- Are regular staff tracking close to the 6.5 hour daily goal?
- Who might need time-tracking support?
- Where is time going by department?
- How much time is billable vs. non-billable?
- Are notes/comments useful enough?
- What should leadership review this month?

Language is intentionally supportive ("needs review", "may need support",
"context exception", "notes need more detail") rather than punitive.

## Layout

One page (`/`), title **Time Tracking**, with simple tabs. No sidebar, hero, or
subtitles — Notion-style restraint.

| Tab          | Content                                                       |
| ------------ | ------------------------------------------------------------ |
| Overview     | Monthly tracked hours, billable vs. non-billable, review flags |
| People       | Regular staff (vs. 6.5h daily goal) and part-time staff, separately |
| Departments  | Hours-by-department chart + breakdown table                  |
| Tasks        | Top tasks (hours, entries, people, departments, billable %, avg entry) |
| Notes        | Comment quality by person ("Notes to Review", supportive)    |
| Raw Data     | Compact searchable/sortable table with pagination + CSV export |

A small KPI row sits above the tabs: **Tracked Hours · Entries · People ·
Billable % · Notes to Review.**

## Global filters

A compact filter bar drives the whole dashboard (client-side, instant):

- **Date** range (default **Feb 1 – Jun 29, 2026**)
- **Person**, **Department**, **Role**, **Task**, **Type** (multi-select)
- **Billable** — All / Billable / Non-billable
- **Comment quality** — All / Useful / Auto-captured / Too short / Blank
- **Clear filters**

The dashboard loads every current-employee entry once (paginated server fetch of
`v_time_tracking_enriched`) and applies all filters + aggregations in the
browser, so Overview/Departments/Tasks/Notes/Raw Data and the KPI row all respond
to every filter consistently. The People tab reads the goal-based KPI views
(`v_regular_staff_kpis`, `v_part_time_staff_kpis`) and honors the Person filter.
Former employees (e.g. Jay) are excluded; Adria's documented holiday shows as a
neutral "Context exception" rather than a low-tracking issue.

## Data model

All calculations live in **Supabase views** (see [`supabase/views.sql`](supabase/views.sql)).
The app never recomputes them — it reads:

`v_team_kpi_summary`, `v_monthly_overview`, `v_regular_staff_kpis`,
`v_part_time_staff_kpis`, `v_department_breakdown`, `v_top_tasks`,
`v_billable_summary`, `v_comment_quality_by_person`, `v_review_flags`,
`v_time_tracking_enriched`.

These read from the base tables `"Time Tracking"`, `staff_dimension`,
`staff_kpi_context`, and `stat_holidays`. The 6.5h target is computed per
regular employee across working days (weekdays minus stat holidays), reduced by
any documented context exceptions (e.g. vacation) so people are never unfairly
compared.

## Security model

- **Tools Hub auth:** The app wraps all routes in `ToolAuthGate` (slug `time-tracking`). Users sign in with Google on this origin; access is checked via `user_can_access_tool_by_slug` on the **Tools Hub Supabase** project.
- **API enforcement:** All `/api/*` routes and server actions require a valid Supabase JWT (`Authorization: Bearer …`) and tool access — not just the UI gate.
- **Data:** Time-tracking tables and views live in the **same Supabase project as Tools Hub**. Server reads/writes use the **service_role** key after the JWT gate; RLS limits direct `authenticated` access to users with tool access.
- Register the tool in Hub **Manage Tools**, assign users in **Manage Access**, and add this app’s URL to Supabase **Redirect URLs** and Google **Authorized JavaScript origins** (`http://localhost:3007` for local dev). See [TOOL_INTEGRATION.md](https://github.com/longhouse/Longhouse-Tools/blob/main/docs/TOOL_INTEGRATION.md) in the hub repo.

### Migrating from the legacy time-tracking Supabase project

1. In the **Hub** SQL editor, run [`supabase/migrations/006_hub_time_tracking_schema.sql`](supabase/migrations/006_hub_time_tracking_schema.sql), then [`supabase/views.sql`](supabase/views.sql) (skip `GRANT … TO anon`), then migrations `001`–`005`.
2. Set `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` to the **Hub** project service role (Supabase → Project Settings → API).
3. Keep `LEGACY_SUPABASE_URL` and `LEGACY_SUPABASE_SERVICE_ROLE_KEY` pointing at the old project.
4. Run `node --env-file=.env.local scripts/migrate-time-tracking-data.mjs`.
5. Run `node --env-file=.env.local scripts/verify-supabase.mjs` and remove legacy env vars when satisfied.

## Getting started

```bash
npm install
npm run dev
# open http://localhost:3007
```

Connection settings live in `.env.local` (see [`.env.example`](.env.example)):

```
SUPABASE_URL=…                    # Tools Hub project
SUPABASE_SERVICE_ROLE_KEY=…       # Hub service role (imports + server reads)
NEXT_PUBLIC_SUPABASE_URL=…
NEXT_PUBLIC_SUPABASE_ANON_KEY=…
NEXT_PUBLIC_TOOL_SLUG=time-tracking
NEXT_PUBLIC_HUB_URL=http://localhost:5173
ANTHROPIC_API_KEY=…               # optional — Ask AI
```

All Supabase reads happen in **server components** — keys are never shipped to
the browser. The Ask AI panel (top-right) calls Claude server-side with
tool-based filtered aggregates; set `ANTHROPIC_API_KEY` to enable it.

## Memtime CSV import (`/import`)

1. Apply [`supabase/migrations/001_time_entries_entry_hash.sql`](supabase/migrations/001_time_entries_entry_hash.sql) and [`002_time_entries_entry_hash_memtime.sql`](supabase/migrations/002_time_entries_entry_hash_memtime.sql) in the Supabase SQL editor.
2. Set `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` so the app can read/write base `time_entries`.
3. Open **Import** in the dock and upload a **raw Memtime CSV** (no manual column renames).

Memtime mapping (by column position for the three `Booked on` headers):

| Memtime | Stored as |
| --- | --- |
| User | `person` (matched to `employees.person` when possible) |
| 1st Booked on | `department` |
| 2nd Booked on | `role` |
| 3rd Booked on | `task` |
| Activity Type | `type` |
| Type of Logged Work | `billable` (`Billable` / `Non-Billable`) |
| Logged Time | `hours` = minutes ÷ 60 |
| Date | `date` |
| Comment | `comments` |
| Time | `source_time_range` (also used in `entry_hash`) |

`entry_hash` covers person, date, department, role, task, type, billable, logged minutes, normalized comment, and Time. Imports also soft-match against legacy rows that lack Time so overlapping Memtime exports stay duplicate-safe. Existing rows are never overwritten. Use **Repair duplicates** on `/import` (or `node --env-file=.env.local scripts/repair-import-duplicates.mjs`) to remove leftover null-Time duplicates after a fuller re-import.

## Project structure

```
app/                       # single page (/) + layout + globals
components/                 # Dashboard, FilterBar, KpiRow, MultiSelect, charts/, tables/, ui
lib/                        # supabase client, types, formatters, filtering, aggregate, brand
supabase/views.sql          # the calculations (source of truth for the DB views)
scripts/verify-supabase.mjs # quick connectivity check against the views
```

## Brand

Longhouse Brand Guidelines 2025, light mode: Figtree type, white cards on a soft
blue-tint page, navy text, and blues (`#08447F`, `#0898CC`, `#22BBF2`) leading.
Green = positive, yellow = needs review, red reserved for serious issues only.
