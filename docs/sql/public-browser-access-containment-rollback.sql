-- Local candidate only. No hosted application is authorized by this file.
-- Reverses public-browser-access-containment-apply.sql from its own receipt: restores the
-- recorded PUBLIC/anon/authenticated grants and row-security flags on the relations that
-- still exist under the recorded object identifier, then drops the receipt.
-- Reversal re-exposes member data to signed-out visitors and needs its own approval;
-- rolling forward, or pausing the project, is usually safer.
--
-- Use it only before any staged draft other than the reward-routine containment has
-- been applied. It refuses when it can see one: a staged containment receipt
-- (soe_*_v1_state, other than the reward-routine receipt, which records routine
-- execution only) or a private soe_* schema. It cannot see the staged drafts that only
-- revoke grants and leave no marker (practice, direct-message, live-room, matching,
-- legacy Twiddle and Waddle containment). If one of those ran after the interim
-- containment, this script reopens its tables and that draft must be applied again.
-- A recorded relation that no longer exists under its recorded identifier is skipped
-- and counted, not restored.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, public;

DO $reversal$
DECLARE
  entry record;
  prior record;
  current_name name;
  receipt_oid oid := to_regclass('public.soe_public_browser_containment_v1_state');
  allowed constant text[] := ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN', 'USAGE'];
  restored integer := 0;
  skipped integer := 0;
BEGIN
  IF receipt_oid IS NULL
    OR NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid = receipt_oid
      AND c.relkind = 'r' AND c.relrowsecurity AND pg_get_userbyid(c.relowner) = current_user
      AND NOT EXISTS (SELECT 1 FROM aclexplode(COALESCE(c.relacl, acldefault('r'::"char", c.relowner))) a
        WHERE a.grantee <> c.relowner))
    OR EXISTS (SELECT 1 FROM pg_attribute att WHERE att.attrelid = receipt_oid AND att.attacl IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'No recognized containment receipt to reverse.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
      AND c.relname LIKE 'soe\_%\_v1\_state'
      AND c.relname NOT IN ('soe_public_browser_containment_v1_state', 'soe_reward_rpc_containment_v1_state'))
    OR EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname LIKE 'soe\_%') THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'A later staged draft has been applied; reverse or roll forward under separate review.';
  END IF;

  FOR entry IN SELECT * FROM public.soe_public_browser_containment_v1_state ORDER BY relation_name LOOP
    SELECT c.relname INTO current_name FROM pg_class c
    WHERE c.oid = entry.relation_oid AND c.relnamespace = 'public'::regnamespace
      AND c.relkind = entry.relation_kind AND pg_get_userbyid(c.relowner) = current_user;
    IF current_name IS NULL THEN
      skipped := skipped + 1;
      CONTINUE;
    END IF;
    FOR prior IN SELECT g->>'grantee' AS grantee, g->>'privilege' AS privilege, (g->>'grantable')::boolean AS grantable,
        g->>'column' AS column_name FROM jsonb_array_elements(entry.prior_grants) g
    LOOP
      IF NOT prior.privilege = ANY (allowed) OR prior.grantee NOT IN ('PUBLIC', 'anon', 'authenticated') THEN
        RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'The containment receipt holds an unrecognized grant.';
      END IF;
      EXECUTE format('GRANT %s%s ON %s public.%I TO %s%s',
        prior.privilege,
        CASE WHEN prior.column_name IS NULL THEN '' ELSE format(' (%I)', prior.column_name) END,
        CASE WHEN entry.relation_kind = 'S' THEN 'SEQUENCE' ELSE 'TABLE' END,
        current_name,
        CASE WHEN prior.grantee = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(prior.grantee) END,
        CASE WHEN prior.grantable THEN ' WITH GRANT OPTION' ELSE '' END);
    END LOOP;
    IF entry.prior_row_security IS FALSE THEN
      EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', current_name);
    END IF;
    restored := restored + 1;
  END LOOP;
  DROP TABLE public.soe_public_browser_containment_v1_state;
  PERFORM set_config('soe.containment_summary', json_build_object(
    'result', 'public_browser_access_containment_reversed',
    'relationsRestored', restored,
    'recordedRelationsNoLongerPresent', skipped)::text, true);
END
$reversal$;

SELECT current_setting('soe.containment_summary') AS result;
COMMIT;
