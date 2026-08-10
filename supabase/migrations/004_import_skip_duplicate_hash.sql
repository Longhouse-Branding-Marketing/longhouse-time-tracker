-- Make entry_hash conflict-safe for PostgREST upsert + app imports.
-- 1) Promote unique INDEX → UNIQUE CONSTRAINT (PostgREST on_conflict is more reliable)
-- 2) RPC that inserts with ON CONFLICT DO NOTHING so duplicates never error

DROP INDEX IF EXISTS public.time_entries_entry_hash_key;

ALTER TABLE public.time_entries
  DROP CONSTRAINT IF EXISTS time_entries_entry_hash_key;

ALTER TABLE public.time_entries
  ADD CONSTRAINT time_entries_entry_hash_key UNIQUE (entry_hash);

CREATE OR REPLACE FUNCTION public.import_time_entries_ignore_dups(payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n bigint;
BEGIN
  INSERT INTO public.time_entries (
    person,
    date,
    hours,
    department,
    role,
    task,
    type,
    billable,
    comments,
    source_file,
    source_row_number,
    source_month,
    source_time_range,
    source_status,
    entry_hash
  )
  SELECT
    x.person,
    x.date::date,
    x.hours,
    x.department,
    x.role,
    x.task,
    x.type,
    x.billable,
    x.comments,
    x.source_file,
    x.source_row_number,
    x.source_month,
    x.source_time_range,
    x.source_status,
    x.entry_hash
  FROM jsonb_to_recordset(payload) AS x(
    person text,
    date text,
    hours numeric,
    department text,
    role text,
    task text,
    type text,
    billable text,
    comments text,
    source_file text,
    source_row_number integer,
    source_month text,
    source_time_range text,
    source_status text,
    entry_hash text
  )
  ON CONFLICT (entry_hash) DO NOTHING;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.import_time_entries_ignore_dups(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_time_entries_ignore_dups(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.import_time_entries_ignore_dups(jsonb) TO postgres;
