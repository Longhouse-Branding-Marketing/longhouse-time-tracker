-- Entry exceptions and editable mapping rules.
-- Logged time_entries rows are not rewritten.

CREATE TABLE IF NOT EXISTS public.time_entry_overrides (
  entry_id bigint PRIMARY KEY REFERENCES public.time_entries (id) ON DELETE CASCADE,
  department text,
  role text,
  activity_type text,
  billable text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT time_entry_overrides_billable_check
    CHECK (billable IS NULL OR billable IN ('Billable', 'Non-Billable'))
);

GRANT SELECT ON public.time_entry_overrides TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.time_entry_overrides TO service_role;

GRANT INSERT, UPDATE, DELETE ON public.task_map TO service_role;
