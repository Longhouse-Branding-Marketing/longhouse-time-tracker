-- entry_hash v3: comments normalized with collapsed whitespace (see lib/import/hash.ts).
-- Recompute hashes so overlapping Memtime re-exports match after comment formatting changes.

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
    lower(trim(regexp_replace(coalesce(comments, ''), '\s+', ' ', 'g'))),
    lower(trim(coalesce(source_time_range, '')))
  )
);

-- If recompute creates collisions, keep lowest id.
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
