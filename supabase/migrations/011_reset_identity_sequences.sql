-- After copying rows with explicit id values (legacy migration / upsert), Postgres
-- sequences stay at 1 and new INSERTs collide on the primary key.

DO $$
DECLARE
  t text;
  seq regclass;
  max_id bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'employees',
    'stat_holidays',
    'employee_schedules',
    'time_off',
    'time_entries'
  ]
  LOOP
    seq := pg_get_serial_sequence(format('public.%I', t), 'id');
    IF seq IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('SELECT coalesce(max(id), 0) FROM public.%I', t) INTO max_id;
    PERFORM setval(seq, GREATEST(max_id, 1), max_id > 0);
  END LOOP;
END $$;
