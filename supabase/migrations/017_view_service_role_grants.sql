-- Restore SELECT for service_role (and authenticated) on analytics views.
-- DROP VIEW / CREATE VIEW in 013 and 016 omitted service_role, which broke
-- production reads that use the service role key. Safe to re-run (GRANT is
-- idempotent). Live DB was already fixed manually; this locks the grants in.

GRANT SELECT ON public.v_person_daily_tracking TO authenticated, service_role;
GRANT SELECT ON public.v_operations_kpi TO authenticated, service_role;
