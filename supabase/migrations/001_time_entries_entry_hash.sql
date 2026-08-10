-- entry_hash column + unique index (scaffold).
-- For Memtime-aligned hashing + backfill, also run:
--   002_time_entries_entry_hash_memtime.sql
--
-- App import writes require SUPABASE_SERVICE_ROLE_KEY.

ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS entry_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS time_entries_entry_hash_key
  ON public.time_entries (entry_hash);
