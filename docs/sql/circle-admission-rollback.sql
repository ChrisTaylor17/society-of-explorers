-- UNAPPLIED rollback proposal. Never reopen a private Circle or restore raw
-- service membership INSERT/UPDATE. Preserve members, receipts and source data.
-- Existing open Circle operations continue through the controlled wrappers.
-- Exact invited-join receipts can still settle; new approvals cannot be used.
BEGIN;
SET LOCAL search_path=pg_catalog;
DO $$ BEGIN
 IF to_regprocedure('soe_circle_admission_private.enabled()') IS NULL
  OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='soe_circle_admission_private.enabled()'::regprocedure
   AND pg_get_userbyid(proowner)=current_user AND NOT prosecdef) THEN
  RAISE EXCEPTION 'Reviewed admission rollback target unavailable';
 END IF;
END $$;
CREATE OR REPLACE FUNCTION soe_circle_admission_private.enabled() RETURNS boolean
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$ SELECT false $$;
REVOKE ALL ON FUNCTION soe_circle_admission_private.enabled() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
