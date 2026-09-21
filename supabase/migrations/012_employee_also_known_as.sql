-- Preferred name stays employees.person. also_known_as remembers Memtime User
-- strings, emails, and previous names so import + rename keep one identity.
-- Rename still cascades person text; hashes are rebuilt so re-imports dedupe.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS also_known_as text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.employees.also_known_as IS
  'Alternate Memtime / email / former names that resolve to this preferred person.';

-- ---------------------------------------------------------------------------
-- Hash helper — must stay aligned with lib/import/hash.ts entryHash().
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.time_entry_hash_value(
  p_person text,
  p_date date,
  p_department text,
  p_role text,
  p_task text,
  p_type text,
  p_billable text,
  p_hours numeric,
  p_comments text,
  p_time_range text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT md5(
    concat_ws(
      '|',
      lower(trim(coalesce(p_person, ''))),
      to_char(p_date, 'YYYY-MM-DD'),
      lower(trim(coalesce(p_department, ''))),
      lower(trim(coalesce(p_role, ''))),
      lower(trim(coalesce(p_task, ''))),
      lower(trim(coalesce(p_type, ''))),
      lower(trim(coalesce(p_billable, ''))),
      round(coalesce(p_hours, 0)::numeric * 60)::text,
      lower(trim(regexp_replace(coalesce(p_comments, ''), '\s+', ' ', 'g'))),
      lower(trim(coalesce(p_time_range, '')))
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.merge_person_aliases(
  p_preferred text,
  p_existing text[],
  p_incoming text[]
)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_pref text := lower(trim(coalesce(p_preferred, '')));
  v_seen text[] := ARRAY[v_pref];
  v_out text[] := '{}';
  v_item text;
  v_key text;
BEGIN
  FOREACH v_item IN ARRAY coalesce(p_existing, '{}') || coalesce(p_incoming, '{}')
  LOOP
    v_item := nullif(trim(v_item), '');
    IF v_item IS NULL THEN
      CONTINUE;
    END IF;
    v_key := lower(v_item);
    IF v_key = v_pref OR v_key = ANY (v_seen) THEN
      CONTINUE;
    END IF;
    v_seen := v_seen || v_key;
    v_out := v_out || v_item;
  END LOOP;
  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.employee_alias_owner(p_key text, p_exclude_id bigint)
RETURNS bigint
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT e.id
  FROM public.employees e
  WHERE (p_exclude_id IS NULL OR e.id <> p_exclude_id)
    AND (
      lower(e.person) = p_key
      OR p_key = ANY (
        SELECT lower(trim(a))
        FROM unnest(coalesce(e.also_known_as, '{}')) AS a
      )
      OR p_key = ANY (
        SELECT lower(split_part(trim(a), '@', 1))
        FROM unnest(coalesce(e.also_known_as, '{}')) AS a
        WHERE position('@' in a) > 0
      )
    )
  ORDER BY e.id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.assert_aliases_available(
  p_id bigint,
  p_preferred text,
  p_aliases text[]
)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_owner bigint;
  v_item text;
BEGIN
  v_key := lower(trim(coalesce(p_preferred, '')));
  IF v_key IS NULL OR v_key = '' THEN
    RAISE EXCEPTION 'Name is required';
  END IF;
  v_owner := public.employee_alias_owner(v_key, p_id);
  IF v_owner IS NOT NULL THEN
    RAISE EXCEPTION 'A person named "%" already exists', trim(p_preferred);
  END IF;

  FOREACH v_item IN ARRAY coalesce(p_aliases, '{}')
  LOOP
    v_key := lower(trim(v_item));
    IF v_key IS NULL OR v_key = '' THEN
      CONTINUE;
    END IF;
    IF position('@' in v_key) > 0 THEN
      v_owner := public.employee_alias_owner(v_key, p_id);
      IF v_owner IS NOT NULL THEN
        RAISE EXCEPTION 'Alias "%" is already used by another person', trim(v_item);
      END IF;
      v_key := split_part(v_key, '@', 1);
    END IF;
    v_owner := public.employee_alias_owner(v_key, p_id);
    IF v_owner IS NOT NULL THEN
      RAISE EXCEPTION 'Alias "%" is already used by another person', trim(v_item);
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.recompute_time_entry_hashes_for_person(
  p_id bigint,
  p_person text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  WITH computed AS (
    SELECT
      te.id,
      public.time_entry_hash_value(
        te.person,
        te.date,
        te.department,
        te.role,
        te.task,
        te.type,
        te.billable,
        te.hours,
        te.comments,
        te.source_time_range
      ) AS new_hash
    FROM public.time_entries te
    WHERE (p_id IS NOT NULL AND te.employee_id = p_id)
       OR te.person = p_person
  ),
  ranked AS (
    SELECT
      c.id,
      c.new_hash,
      row_number() OVER (PARTITION BY c.new_hash ORDER BY c.id) AS rn,
      EXISTS (
        SELECT 1
        FROM public.time_entries other
        WHERE other.entry_hash = c.new_hash
          AND other.id <> c.id
          AND NOT (
            (p_id IS NOT NULL AND other.employee_id = p_id)
            OR other.person = p_person
          )
      ) AS taken_elsewhere
    FROM computed c
  )
  UPDATE public.time_entries te
  SET entry_hash = CASE
    WHEN r.rn = 1 AND NOT r.taken_elsewhere THEN r.new_hash
    ELSE NULL
  END
  FROM ranked r
  WHERE te.id = r.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_employee_aliases(
  p_person text,
  p_aliases text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint;
  v_name text;
  v_merged text[];
BEGIN
  v_name := nullif(trim(p_person), '');
  IF v_name IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO v_id
  FROM public.employees
  WHERE person = v_name
  FOR UPDATE;
  IF v_id IS NULL THEN
    RETURN;
  END IF;

  v_merged := public.merge_person_aliases(
    v_name,
    (SELECT also_known_as FROM public.employees WHERE id = v_id),
    p_aliases
  );
  PERFORM public.assert_aliases_available(v_id, v_name, v_merged);

  UPDATE public.employees
  SET also_known_as = v_merged
  WHERE id = v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.add_employee_aliases(text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_employee_aliases(text, text[])
  TO service_role, authenticated;

GRANT EXECUTE ON FUNCTION public.recompute_time_entry_hashes_for_person(bigint, text)
  TO service_role, authenticated;

-- ---------------------------------------------------------------------------
-- Rename trigger: keep old name as an alias and rebuild hashes.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_employee_person_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.person IS DISTINCT FROM OLD.person THEN
    NEW.also_known_as := public.merge_person_aliases(
      NEW.person,
      coalesce(NEW.also_known_as, '{}'),
      ARRAY[OLD.person]
    );

    UPDATE public.employee_schedules
    SET person = NEW.person
    WHERE employee_id = NEW.id OR person = OLD.person;

    UPDATE public.time_off
    SET person = NEW.person
    WHERE employee_id = NEW.id OR person = OLD.person;

    UPDATE public.time_entries
    SET person = NEW.person
    WHERE employee_id = NEW.id OR person = OLD.person;

    PERFORM public.recompute_time_entry_hashes_for_person(NEW.id, NEW.person);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employees_sync_person_name ON public.employees;
-- BEFORE UPDATE so also_known_as is stored on the same row write.
CREATE TRIGGER employees_sync_person_name
  BEFORE UPDATE OF person ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_employee_person_name();

REVOKE ALL ON FUNCTION public.sync_employee_person_name() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Save / rename — now persists also_known_as.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.save_employee_profile(bigint, text, text, boolean);

CREATE OR REPLACE FUNCTION public.save_employee_profile(
  p_id bigint,
  p_person text,
  p_photo_url text,
  p_active boolean,
  p_also_known_as text[] DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint;
  v_name text := nullif(trim(p_person), '');
  v_aliases text[];
BEGIN
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Name is required';
  END IF;

  IF p_id IS NULL THEN
    v_aliases := public.merge_person_aliases(v_name, '{}', coalesce(p_also_known_as, '{}'));
    PERFORM public.assert_aliases_available(NULL, v_name, v_aliases);
    INSERT INTO public.employees (person, photo_url, active, also_known_as)
    VALUES (v_name, nullif(trim(p_photo_url), ''), coalesce(p_active, true), v_aliases)
    RETURNING id INTO v_id;
  ELSE
    SELECT public.merge_person_aliases(
      v_name,
      CASE
        WHEN p_also_known_as IS NULL THEN e.also_known_as
        ELSE p_also_known_as
      END,
      '{}'
    )
    INTO v_aliases
    FROM public.employees e
    WHERE e.id = p_id;

    IF v_aliases IS NULL THEN
      RAISE EXCEPTION 'Employee not found';
    END IF;

    PERFORM public.assert_aliases_available(p_id, v_name, v_aliases);

    UPDATE public.employees
    SET
      person = v_name,
      photo_url = nullif(trim(p_photo_url), ''),
      active = coalesce(p_active, true),
      also_known_as = v_aliases
    WHERE id = p_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Employee not found';
    END IF;
  END IF;

  IF coalesce(p_active, true) = false THEN
    UPDATE public.employee_schedules
    SET include_in_operations_kpi = false
    WHERE employee_id = v_id OR person = v_name;
  END IF;

  UPDATE public.employee_schedules
  SET employee_id = v_id
  WHERE person = v_name AND (employee_id IS NULL OR employee_id <> v_id);

  UPDATE public.time_off
  SET employee_id = v_id
  WHERE person = v_name AND (employee_id IS NULL OR employee_id <> v_id);

  UPDATE public.time_entries
  SET employee_id = v_id
  WHERE person = v_name AND (employee_id IS NULL OR employee_id <> v_id);

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_employee_profile(bigint, text, text, boolean, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_employee_profile(bigint, text, text, boolean, text[])
  TO service_role, authenticated;

-- ---------------------------------------------------------------------------
-- Seed aliases from Hub profiles + orphan email-as-person entries.
-- Prefix length 4 matches lib/import/resolvePerson.ts MIN_PREFIX_LEN.
-- ---------------------------------------------------------------------------

UPDATE public.employees e
SET also_known_as = public.merge_person_aliases(
  e.person,
  e.also_known_as,
  ARRAY[p.display_name, p.email]
)
FROM public.profiles p
WHERE
  lower(e.person) = lower(trim(p.display_name))
  OR lower(e.person) = lower(split_part(p.email, '@', 1))
  OR (
    lower(split_part(trim(p.display_name), ' ', 1)) = lower(e.person)
    AND NOT EXISTS (
      SELECT 1 FROM public.employees o
      WHERE o.id <> e.id
        AND lower(o.person) = lower(split_part(trim(p.display_name), ' ', 1))
    )
  )
  OR (
    lower(split_part(e.person, ' ', 1)) = lower(trim(p.display_name))
    AND NOT EXISTS (
      SELECT 1 FROM public.employees o
      WHERE o.id <> e.id
        AND lower(split_part(o.person, ' ', 1)) = lower(trim(p.display_name))
    )
  )
  OR (
    char_length(lower(e.person)) >= 4
    AND (
      lower(split_part(p.email, '@', 1)) LIKE lower(e.person) || '%'
      OR lower(trim(p.display_name)) LIKE lower(e.person) || '%'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.employees o
      WHERE o.id <> e.id
        AND char_length(lower(o.person)) >= 4
        AND (
          lower(split_part(p.email, '@', 1)) LIKE lower(o.person) || '%'
          OR lower(trim(p.display_name)) LIKE lower(o.person) || '%'
        )
    )
  );

-- james@longhouse.co already stored as a person string on a few rows.
UPDATE public.employees e
SET also_known_as = public.merge_person_aliases(
  e.person,
  e.also_known_as,
  ARRAY[te.person]
)
FROM (
  SELECT DISTINCT person
  FROM public.time_entries
  WHERE position('@' in person) > 0
) te
WHERE lower(split_part(te.person, '@', 1)) = lower(e.person)
  AND NOT EXISTS (
    SELECT 1 FROM public.employees o
    WHERE o.id <> e.id
      AND lower(o.person) = lower(split_part(te.person, '@', 1))
  );

UPDATE public.time_entries te
SET
  person = e.person,
  employee_id = e.id
FROM public.employees e
WHERE position('@' in te.person) > 0
  AND lower(split_part(te.person, '@', 1)) = lower(e.person)
  AND NOT EXISTS (
    SELECT 1 FROM public.employees o
    WHERE o.id <> e.id
      AND lower(o.person) = lower(split_part(te.person, '@', 1))
  );

DO $$
DECLARE emp record;
BEGIN
  FOR emp IN SELECT id, person FROM public.employees WHERE person = 'James'
  LOOP
    PERFORM public.recompute_time_entry_hashes_for_person(emp.id, emp.person);
  END LOOP;
END $$;
