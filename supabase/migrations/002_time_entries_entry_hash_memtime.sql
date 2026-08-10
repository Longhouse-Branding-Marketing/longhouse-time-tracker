-- Memtime-aligned entry_hash (v2).
-- Inputs: person|date|department|role|task|type|billable|logged_minutes|comments|source_time_range
-- logged_minutes = round(hours * 60). Must match lib/import/hash.ts.
--
-- Apply after 001_time_entries_entry_hash.sql (or alone if entry_hash already exists).
-- Re-hashing existing rows cannot recover Memtime "Time" when source_time_range is null;
-- those rows keep prior hashes. New Memtime imports always set source_time_range.

ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS entry_hash text;

UPDATE public.time_entries
SET entry_hash = md5(
  concat_ws(
    '|',
    lower(trim(coalesce(person, ''))),
    to_char(date::date, 'YYYY-MM-DD'),
    lower(trim(coalesce(department, ''))),
    lower(trim(coalesce(role, ''))),
    lower(trim(coalesce(task, ''))),
    lower(trim(coalesce(type, ''))),
    lower(trim(coalesce(billable, ''))),
    round(coalesce(hours, 0)::numeric * 60)::text,
    lower(trim(coalesce(comments, ''))),
    lower(trim(coalesce(source_time_range, '')))
  )
)
WHERE source_time_range IS NOT NULL
   OR entry_hash IS NULL;

-- Keep one row per hash (lowest id) so the unique index can be created.
UPDATE public.time_entries AS t
SET entry_hash = NULL
WHERE t.entry_hash IS NOT NULL
  AND t.id NOT IN (
    SELECT min(id)
    FROM public.time_entries
    WHERE entry_hash IS NOT NULL
    GROUP BY entry_hash
  );

CREATE UNIQUE INDEX IF NOT EXISTS time_entries_entry_hash_key
  ON public.time_entries (entry_hash);
