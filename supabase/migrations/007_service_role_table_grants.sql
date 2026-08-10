-- Server-side reads/writes use service_role (JWT gate on API routes).
-- Views were granted in 006; base tables need explicit grants for PostgREST.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_schedules TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_off TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stat_holidays TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_entries TO service_role;

GRANT SELECT ON public.employees TO authenticated;
GRANT SELECT ON public.employee_schedules TO authenticated;
GRANT SELECT ON public.time_off TO authenticated;
GRANT SELECT ON public.stat_holidays TO authenticated;
GRANT SELECT ON public.time_entries TO authenticated;
