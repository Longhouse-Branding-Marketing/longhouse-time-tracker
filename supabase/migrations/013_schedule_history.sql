-- Schedule history: honor effective dates when counting working days.
--
-- Existing rows are left unchanged. The app previously saved one schedule per
-- person with both effective dates NULL. That row remains the current
-- open-ended period and still applies to every tracked day, so historical
-- averages do not move until someone logs a change.
--
-- Logging a change inserts a new open period and sets the previous period's
-- effective_end_date to the day before the new start. v_person_daily_tracking
-- then uses the period that covers each date. v_operations_kpi still reads
-- inclusion and context notes from the current (open-ended) period, and
-- compares the average to the daily goals of the counted days.

COMMENT ON COLUMN public.employee_schedules.effective_start_date IS
  'First day this schedule applies. NULL means it applies from the beginning of tracking.';
COMMENT ON COLUMN public.employee_schedules.effective_end_date IS
  'Last day this schedule applies. NULL means the schedule is current and open-ended.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.employee_schedules
    WHERE effective_start_date IS NOT NULL
      AND effective_end_date IS NOT NULL
      AND effective_end_date < effective_start_date
  ) THEN
    RAISE EXCEPTION 'employee_schedules has a period whose end date is before its start date';
  END IF;
END $$;

ALTER TABLE public.employee_schedules
  DROP CONSTRAINT IF EXISTS employee_schedules_effective_range_chk;

ALTER TABLE public.employee_schedules
  ADD CONSTRAINT employee_schedules_effective_range_chk
  CHECK (
    effective_end_date IS NULL
    OR effective_start_date IS NULL
    OR effective_end_date >= effective_start_date
  );

CREATE INDEX IF NOT EXISTS employee_schedules_person_effective_idx
  ON public.employee_schedules (person, effective_start_date, effective_end_date);

CREATE OR REPLACE VIEW public.v_person_daily_tracking AS
WITH bounds AS (
  SELECT min(time_entries.date) AS start_date,
         max(time_entries.date) AS end_date
  FROM time_entries
),
employee_days AS (
  SELECT e.person,
         gs.gs::date AS date
  FROM employees e
  CROSS JOIN bounds b
  CROSS JOIN LATERAL generate_series(
    GREATEST(COALESCE(e.start_date, b.start_date), b.start_date)::timestamp with time zone,
    LEAST(COALESCE(e.end_date, b.end_date), b.end_date)::timestamp with time zone,
    '1 day'::interval
  ) gs(gs)
  WHERE e.active = true OR COALESCE(e.end_date, b.end_date) >= b.start_date
),
daily_actuals AS (
  SELECT time_entries.person,
         time_entries.date,
         round(sum(time_entries.hours), 2) AS tracked_hours
  FROM time_entries
  GROUP BY time_entries.person, time_entries.date
),
-- Schedule in effect on that date. NULL effective_start_date covers the
-- beginning of tracking; NULL effective_end_date is the open current period.
-- A single legacy row with both dates NULL still applies to every day.
-- Overlaps prefer the later start, then created_at, then id — same order as
-- scheduleForDate() in lib/schedules.ts.
scheduled AS (
  SELECT ed.person,
         ed.date,
         s.daily_goal,
         s.include_in_operations_kpi,
         CASE EXTRACT(isodow FROM ed.date)
           WHEN 1 THEN s.monday
           WHEN 2 THEN s.tuesday
           WHEN 3 THEN s.wednesday
           WHEN 4 THEN s.thursday
           WHEN 5 THEN s.friday
           WHEN 6 THEN s.saturday
           WHEN 7 THEN s.sunday
           ELSE NULL::boolean
         END AS scheduled_to_work
  FROM employee_days ed
  LEFT JOIN LATERAL (
    SELECT s_1.*
    FROM employee_schedules s_1
    WHERE s_1.person = ed.person
      AND (s_1.effective_start_date IS NULL OR ed.date >= s_1.effective_start_date)
      AND (s_1.effective_end_date IS NULL OR ed.date <= s_1.effective_end_date)
    ORDER BY s_1.effective_start_date DESC NULLS LAST,
             s_1.created_at DESC NULLS LAST,
             s_1.id DESC
    LIMIT 1
  ) s ON true
),
labelled AS (
  SELECT s.person,
         s.date,
         COALESCE(a.tracked_hours, 0::numeric) AS tracked_hours,
         COALESCE(s.daily_goal, 0::numeric) AS daily_goal,
         COALESCE(s.include_in_operations_kpi, false) AS include_in_operations_kpi,
         COALESCE(s.scheduled_to_work, false) AS scheduled_to_work,
         (EXISTS (
           SELECT 1 FROM stat_holidays h
           WHERE h.date = s.date AND h.counts_as_working_day = false
         )) AS is_stat_holiday,
         (EXISTS (
           SELECT 1 FROM time_off t
           WHERE t.person = s.person
             AND s.date >= t.start_date AND s.date <= t.end_date
             AND t.counts_as_working_day = false
         )) AS is_time_off,
         (SELECT string_agg(DISTINCT t.reason, ', '::text)
          FROM time_off t
          WHERE t.person = s.person
            AND s.date >= t.start_date AND s.date <= t.end_date
         ) AS context
  FROM scheduled s
  LEFT JOIN daily_actuals a ON a.person = s.person AND a.date = s.date
)
SELECT person,
       date,
       tracked_hours,
       daily_goal,
       include_in_operations_kpi,
       scheduled_to_work,
       is_stat_holiday,
       is_time_off,
       context,
       CASE
         WHEN scheduled_to_work AND NOT is_stat_holiday AND NOT is_time_off THEN true
         ELSE false
       END AS counted_working_day
FROM labelled;

-- ---------------------------------------------------------------------------
-- Operations / People consistency KPIs (active employees)
-- Inclusion, context notes, and "schedule needed" use the current open period.
-- The average uses counted days from v_person_daily_tracking (schedule in
-- effect each day). Status compares that average to the average daily goal
-- of those counted days, so a new goal does not rescore earlier periods alone.
-- No gap_to_goal. Context = current schedule notes only.
-- ---------------------------------------------------------------------------

-- DROP first when removing columns (CREATE OR REPLACE cannot drop columns).
-- DROP VIEW IF EXISTS public.v_operations_kpi;

CREATE OR REPLACE VIEW public.v_operations_kpi AS
WITH current_schedule AS (
  SELECT DISTINCT ON (s.person)
    s.person,
    s.id AS schedule_id,
    s.include_in_operations_kpi,
    s.daily_goal,
    s.notes
  FROM employee_schedules s
  ORDER BY s.person,
           (s.effective_end_date IS NULL) DESC,
           s.effective_start_date DESC NULLS LAST,
           s.created_at DESC NULLS LAST,
           s.id DESC
),
eligible AS (
  SELECT e_1.person,
         cs.schedule_id,
         COALESCE(cs.include_in_operations_kpi, false) AS include_in_operations_kpi,
         COALESCE(cs.daily_goal, 6.5) AS daily_goal,
         cs.notes
  FROM employees e_1
  LEFT JOIN current_schedule cs ON cs.person = e_1.person
  WHERE e_1.active
),
daily AS (
  SELECT v.person,
         v.date,
         v.tracked_hours,
         v.daily_goal,
         v.include_in_operations_kpi,
         v.scheduled_to_work,
         v.is_stat_holiday,
         v.is_time_off,
         v.context,
         v.counted_working_day
  FROM v_person_daily_tracking v
  JOIN eligible e_1 ON e_1.person = v.person
),
median_source AS (
  SELECT d.person,
         percentile_cont(0.5::double precision)
           WITHIN GROUP (ORDER BY (d.tracked_hours::double precision)) AS median_active_day
  FROM daily d
  WHERE d.counted_working_day AND d.tracked_hours > 0::numeric
  GROUP BY d.person
),
totals AS (
  SELECT d.person,
         round(sum(d.tracked_hours), 2) AS tracked_hours,
         count(*) FILTER (WHERE d.counted_working_day) AS counted_working_days,
         round(avg(d.tracked_hours) FILTER (WHERE d.counted_working_day), 2) AS avg_working_day,
         round(avg(d.daily_goal) FILTER (WHERE d.counted_working_day), 2) AS applicable_goal
  FROM daily d
  GROUP BY d.person
)
SELECT t.person,
       t.tracked_hours,
       t.counted_working_days,
       t.avg_working_day,
       round(m.median_active_day::numeric, 2) AS median_active_day,
       CASE
         WHEN e.schedule_id IS NULL THEN 'Schedule needed'::text
         WHEN e.include_in_operations_kpi = false THEN 'Not included in current KPI'::text
         WHEN NULLIF(btrim(e.notes), ''::text) IS NOT NULL THEN 'Context exception'::text
         WHEN t.counted_working_days = 0 THEN 'Needs review'::text
         WHEN t.avg_working_day >= COALESCE(t.applicable_goal, e.daily_goal) THEN 'On track'::text
         WHEN t.avg_working_day >= (COALESCE(t.applicable_goal, e.daily_goal) - 0.5) THEN 'Close to target'::text
         ELSE 'Needs review'::text
       END AS status,
       NULLIF(btrim(e.notes), ''::text) AS context
FROM totals t
JOIN eligible e ON e.person = t.person
LEFT JOIN median_source m ON m.person = t.person
ORDER BY t.avg_working_day DESC NULLS LAST;

GRANT SELECT ON public.v_person_daily_tracking TO anon, authenticated;
GRANT SELECT ON public.v_operations_kpi TO anon, authenticated;
