-- ON CONFLICT (entry_hash) in import RPC requires a non-partial UNIQUE constraint.
-- Drop constraint before index: Postgres attaches the index to UNIQUE constraints.

ALTER TABLE public.time_entries
  DROP CONSTRAINT IF EXISTS time_entries_entry_hash_key;

DROP INDEX IF EXISTS public.time_entries_entry_hash_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'time_entries_entry_hash_key'
      AND conrelid = 'public.time_entries'::regclass
  ) THEN
    ALTER TABLE public.time_entries
      ADD CONSTRAINT time_entries_entry_hash_key UNIQUE (entry_hash);
  END IF;
END $$;

-- Reliable insert count (ROW_COUNT can be 0 in some client paths).
CREATE OR REPLACE FUNCTION public.import_time_entries_ignore_dups(payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n bigint;
BEGIN
  WITH ins AS (
    INSERT INTO public.time_entries (
      person,
      date,
      hours,
      department,
      "role",
      task,
      "type",
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
    FROM jsonb_to_recordset(COALESCE(payload, '[]'::jsonb)) AS x(
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
    ON CONFLICT (entry_hash) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::bigint INTO n FROM ins;

  RETURN COALESCE(n, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.import_time_entries_ignore_dups(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_time_entries_ignore_dups(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.import_time_entries_ignore_dups(jsonb) TO postgres;
