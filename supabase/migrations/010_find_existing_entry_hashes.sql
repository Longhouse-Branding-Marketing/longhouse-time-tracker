-- Reliable hash lookup for import dedup (PostgREST .in() can miss under some filters).

CREATE OR REPLACE FUNCTION public.find_existing_entry_hashes(hashes text[])
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(t.entry_hash), '{}'::text[])
  FROM (
    SELECT DISTINCT te.entry_hash
    FROM public.time_entries te
    WHERE te.entry_hash = ANY(hashes)
  ) t;
$$;

REVOKE ALL ON FUNCTION public.find_existing_entry_hashes(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_existing_entry_hashes(text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.find_existing_entry_hashes(text[]) TO postgres;
