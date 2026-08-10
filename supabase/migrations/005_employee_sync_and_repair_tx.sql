-- Transactional employee rename/delete + atomic import repair.
-- Person remains the display/join string used by analytics views; these RPCs
-- keep that string consistent across related tables in a single transaction.
-- Optional employee_id FKs are backfilled for future stable-identity work.

-- ---------------------------------------------------------------------------
-- Optional stable IDs (nullable) — backfilled; views still use person text.
-- ---------------------------------------------------------------------------

ALTER TABLE public.employee_schedules
  ADD COLUMN IF NOT EXISTS employee_id bigint REFERENCES public.employees(id) ON DELETE CASCADE;

ALTER TABLE public.time_off
  ADD COLUMN IF NOT EXISTS employee_id bigint REFERENCES public.employees(id) ON DELETE CASCADE;

ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS employee_id bigint REFERENCES public.employees(id) ON DELETE SET NULL;

UPDATE public.employee_schedules s
SET employee_id = e.id
FROM public.employees e
WHERE s.employee_id IS NULL AND s.person = e.person;

UPDATE public.time_off t
SET employee_id = e.id
FROM public.employees e
WHERE t.employee_id IS NULL AND t.person = e.person;

UPDATE public.time_entries te
SET employee_id = e.id
FROM public.employees e
WHERE te.employee_id IS NULL AND te.person = e.person;

CREATE INDEX IF NOT EXISTS employee_schedules_employee_id_idx
  ON public.employee_schedules (employee_id);

CREATE INDEX IF NOT EXISTS time_off_employee_id_idx
  ON public.time_off (employee_id);

CREATE INDEX IF NOT EXISTS time_entries_employee_id_idx
  ON public.time_entries (employee_id);

-- Keep person text in sync when an employee row is renamed (by id).
CREATE OR REPLACE FUNCTION public.sync_employee_person_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.person IS DISTINCT FROM OLD.person THEN
    UPDATE public.employee_schedules
    SET person = NEW.person
    WHERE employee_id = NEW.id OR person = OLD.person;

    UPDATE public.time_off
    SET person = NEW.person
    WHERE employee_id = NEW.id OR person = OLD.person;

    UPDATE public.time_entries
    SET person = NEW.person
    WHERE employee_id = NEW.id OR person = OLD.person;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employees_sync_person_name ON public.employees;
CREATE TRIGGER employees_sync_person_name
  AFTER UPDATE OF person ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_employee_person_name();

-- ---------------------------------------------------------------------------
-- Save / rename employee in one round-trip (trigger handles cascade).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.save_employee_profile(
  p_id bigint,
  p_person text,
  p_photo_url text,
  p_active boolean
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint;
  v_name text := nullif(trim(p_person), '');
BEGIN
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Name is required';
  END IF;

  IF p_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.employees WHERE person = v_name) THEN
      RAISE EXCEPTION 'A person named "%" already exists', v_name;
    END IF;
    INSERT INTO public.employees (person, photo_url, active)
    VALUES (v_name, nullif(trim(p_photo_url), ''), coalesce(p_active, true))
    RETURNING id INTO v_id;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.employees
      WHERE person = v_name AND id <> p_id
    ) THEN
      RAISE EXCEPTION 'A person named "%" already exists', v_name;
    END IF;

    UPDATE public.employees
    SET
      person = v_name,
      photo_url = nullif(trim(p_photo_url), ''),
      active = coalesce(p_active, true)
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

  -- Attach any orphaned related rows that still match by name.
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

REVOKE ALL ON FUNCTION public.save_employee_profile(bigint, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_employee_profile(bigint, text, text, boolean)
  TO service_role, authenticated;

-- ---------------------------------------------------------------------------
-- Delete employee: remove directory + schedule + time off; keep time history.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_employee_cascade(p_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_person text;
BEGIN
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'Missing id';
  END IF;

  SELECT person INTO v_person FROM public.employees WHERE id = p_id FOR UPDATE;
  IF v_person IS NULL THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;

  DELETE FROM public.time_off
  WHERE employee_id = p_id OR person = v_person;

  DELETE FROM public.employee_schedules
  WHERE employee_id = p_id OR person = v_person;

  -- Preserve historical time_entries; detach FK so employee row can be removed.
  UPDATE public.time_entries
  SET employee_id = NULL
  WHERE employee_id = p_id;

  DELETE FROM public.employees WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_employee_cascade(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_employee_cascade(bigint)
  TO service_role, authenticated;

-- ---------------------------------------------------------------------------
-- Atomic import repair: clear → rehash → delete in one transaction.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_import_repair(
  clear_ids bigint[],
  rehash_pairs jsonb,
  delete_ids bigint[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cleared bigint := 0;
  rehashed bigint := 0;
  deleted bigint := 0;
  pair jsonb;
  v_id bigint;
  v_hash text;
BEGIN
  IF clear_ids IS NOT NULL AND cardinality(clear_ids) > 0 THEN
    UPDATE public.time_entries
    SET entry_hash = NULL
    WHERE id = ANY (clear_ids);
    GET DIAGNOSTICS cleared = ROW_COUNT;
  END IF;

  IF rehash_pairs IS NOT NULL AND jsonb_typeof(rehash_pairs) = 'array' THEN
    FOR pair IN SELECT * FROM jsonb_array_elements(rehash_pairs)
    LOOP
      v_id := (pair->>'id')::bigint;
      v_hash := nullif(pair->>'entry_hash', '');
      IF v_id IS NULL OR v_hash IS NULL THEN
        CONTINUE;
      END IF;
      BEGIN
        UPDATE public.time_entries
        SET entry_hash = v_hash
        WHERE id = v_id;
        IF FOUND THEN
          rehashed := rehashed + 1;
        END IF;
      EXCEPTION
        WHEN unique_violation THEN
          UPDATE public.time_entries
          SET entry_hash = NULL
          WHERE id = v_id;
      END;
    END LOOP;
  END IF;

  IF delete_ids IS NOT NULL AND cardinality(delete_ids) > 0 THEN
    DELETE FROM public.time_entries WHERE id = ANY (delete_ids);
    GET DIAGNOSTICS deleted = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'cleared', cleared,
    'rehashed', rehashed,
    'deleted', deleted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_import_repair(bigint[], jsonb, bigint[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_import_repair(bigint[], jsonb, bigint[])
  TO service_role, authenticated;

-- Prefer setting employee_id on import when the CSV person matches the directory.
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
    entry_hash,
    employee_id
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
    x.entry_hash,
    coalesce(
      x.employee_id,
      (SELECT e.id FROM public.employees e WHERE e.person = x.person LIMIT 1)
    )
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
    entry_hash text,
    employee_id bigint
  )
  ON CONFLICT (entry_hash) DO NOTHING;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

