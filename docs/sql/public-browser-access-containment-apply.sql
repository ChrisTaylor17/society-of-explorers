-- Local candidate only. No hosted application is authorized by this file.
-- Purpose: close every browser-role path into the tables, views and sequences of schema
-- public in one step, so the hosted database can be resumed without exposing member
-- data. It is an interim containment, not the first-release migration; the staged
-- drafts in production-migration-plan.md still apply afterwards.
--
-- In one transaction this script:
--   * records each relation's prior PUBLIC/anon/authenticated grants and row-security
--     flag in an owner-only receipt table, keyed by the relation's object identifier;
--   * revokes every table, column and sequence privilege those three grantees hold on
--     relations in schema public;
--   * enables row security on ordinary tables where it is off, except the three legacy
--     Circle tables (book_cohorts, book_cohort_members, seminar_messages): the staged
--     circle-legacy-baseline-preflight.sql pins their row security as off before it
--     runs, so that flag is left as found. Their browser grants are still revoked;
--   * verifies that neither browser role keeps any privilege and that service_role
--     keeps every privilege it had. Any shortfall aborts the whole transaction.
-- Receipt tables written by the staged drafts (soe_*_v1_state) are not recorded or
-- altered; they are only checked for browser access.
-- It does not change rows, policies, routines, default privileges, Storage buckets,
-- Realtime publications or Auth settings, and it creates no role. Routine execution is
-- covered separately: reward-rpc-containment-apply.sql closes the owner-run reward
-- routine, and the preflight lists any other owner-run routine a browser role can call.
-- Tables created later still receive the provider's default browser grants until this
-- script is run again. Re-running it succeeds and keeps the first recorded prior state
-- of each relation.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, public;

CREATE TABLE IF NOT EXISTS public.soe_public_browser_containment_v1_state (
  relation_oid oid PRIMARY KEY,
  relation_name text NOT NULL,
  relation_kind "char" NOT NULL,
  prior_row_security boolean,
  prior_grants jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.soe_public_browser_containment_v1_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.soe_public_browser_containment_v1_state
  FROM PUBLIC, anon, authenticated, service_role;

DO $containment$
DECLARE
  row_security_left_as_found constant name[] := ARRAY['book_cohorts', 'book_cohort_members', 'seminar_messages'];
  table_privileges text[] := ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];
  target record;
  browser_oids oid[];
  service_oid oid;
  receipt_oid oid := to_regclass('public.soe_public_browser_containment_v1_state');
  service_before jsonb;
  service_after jsonb;
  leftover integer;
  relations_seen integer := 0;
  relations_closed integer := 0;
  tables_secured integer := 0;
BEGIN
  IF current_setting('server_version_num')::integer >= 170000 THEN
    table_privileges := table_privileges || 'MAINTAIN'::text;
  END IF;
  SELECT oid INTO service_oid FROM pg_roles
  WHERE rolname = 'service_role' AND rolbypassrls AND NOT rolsuper;
  SELECT array_agg(oid ORDER BY rolname) INTO browser_oids FROM pg_roles
  WHERE rolname IN ('anon', 'authenticated') AND NOT rolsuper AND NOT rolbypassrls;
  IF service_oid IS NULL OR cardinality(browser_oids) IS DISTINCT FROM 2
    OR current_user IN ('anon', 'authenticated', 'service_role')
    OR EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.member = ANY (browser_oids))
    OR has_schema_privilege('anon', 'public', 'CREATE')
    OR has_schema_privilege('authenticated', 'public', 'CREATE') THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Browser or service role authority requires review.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c
      WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
        AND pg_get_userbyid(c.relowner) <> current_user) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Run as the owner of every relation in schema public.';
  END IF;
  -- The receipt steers the reverse script, so nobody but its owner may hold any right on it.
  IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid = receipt_oid
      AND c.relkind = 'r' AND c.relrowsecurity AND pg_get_userbyid(c.relowner) = current_user
      AND NOT EXISTS (SELECT 1 FROM aclexplode(COALESCE(c.relacl, acldefault('r'::"char", c.relowner))) a
        WHERE a.grantee <> c.relowner))
    OR EXISTS (SELECT 1 FROM pg_attribute att WHERE att.attrelid = receipt_oid AND att.attacl IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'The containment receipt differs from the reviewed state.';
  END IF;

  SELECT jsonb_object_agg(c.oid::text, CASE WHEN c.relkind = 'S' THEN jsonb_build_array(
        has_sequence_privilege(service_oid, c.oid, 'USAGE'), has_sequence_privilege(service_oid, c.oid, 'SELECT'),
        has_sequence_privilege(service_oid, c.oid, 'UPDATE'))
      ELSE (SELECT jsonb_agg(has_table_privilege(service_oid, c.oid, p.privilege) ORDER BY p.position)
        FROM unnest(table_privileges) WITH ORDINALITY AS p(privilege, position)) END)
  INTO service_before
  FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S') AND c.oid <> receipt_oid;

  FOR target IN
    SELECT c.oid, c.relname, c.relkind, c.relrowsecurity, c.relowner, c.relacl
    FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
      AND c.relname NOT LIKE 'soe\_%\_v1\_state'
    ORDER BY c.relname
  LOOP
    relations_seen := relations_seen + 1;
    INSERT INTO public.soe_public_browser_containment_v1_state
      (relation_oid, relation_name, relation_kind, prior_row_security, prior_grants)
    VALUES (
      target.oid, target.relname, target.relkind,
      CASE WHEN target.relkind IN ('r', 'p') THEN target.relrowsecurity END,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'grantee', CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
          'privilege', a.privilege_type, 'grantable', a.is_grantable, 'column', NULL)
          ORDER BY a.grantee, a.privilege_type)
        FROM aclexplode(COALESCE(target.relacl,
          acldefault(CASE WHEN target.relkind = 'S' THEN 's' ELSE 'r' END::"char", target.relowner))) a
        WHERE a.grantee = 0 OR a.grantee = ANY (browser_oids)), '[]'::jsonb)
      || COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'grantee', CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
          'privilege', a.privilege_type, 'grantable', a.is_grantable, 'column', att.attname)
          ORDER BY att.attnum, a.grantee, a.privilege_type)
        FROM pg_attribute att CROSS JOIN LATERAL aclexplode(att.attacl) a
        WHERE att.attrelid = target.oid AND att.attacl IS NOT NULL AND NOT att.attisdropped
          AND (a.grantee = 0 OR a.grantee = ANY (browser_oids))), '[]'::jsonb))
    ON CONFLICT (relation_oid) DO NOTHING;

    IF EXISTS (SELECT 1 FROM aclexplode(COALESCE(target.relacl,
          acldefault(CASE WHEN target.relkind = 'S' THEN 's' ELSE 'r' END::"char", target.relowner))) a
        WHERE a.grantee = 0 OR a.grantee = ANY (browser_oids))
      OR EXISTS (SELECT 1 FROM pg_attribute att CROSS JOIN LATERAL aclexplode(att.attacl) a
        WHERE att.attrelid = target.oid AND att.attacl IS NOT NULL AND NOT att.attisdropped
          AND (a.grantee = 0 OR a.grantee = ANY (browser_oids))) THEN
      relations_closed := relations_closed + 1;
    END IF;
    -- Revoking a table privilege also revokes the matching column privileges.
    IF target.relkind = 'S' THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE public.%I FROM PUBLIC, anon, authenticated', target.relname);
    ELSE
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', target.relname);
    END IF;
    IF target.relkind IN ('r', 'p') AND NOT target.relrowsecurity
      AND NOT target.relname = ANY (row_security_left_as_found) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target.relname);
      tables_secured := tables_secured + 1;
    END IF;
  END LOOP;

  SELECT count(*) INTO leftover
  FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
    AND (
      EXISTS (SELECT 1 FROM aclexplode(COALESCE(c.relacl,
          acldefault(CASE WHEN c.relkind = 'S' THEN 's' ELSE 'r' END::"char", c.relowner))) a
        WHERE a.grantee = 0 OR a.grantee = ANY (browser_oids))
      OR EXISTS (SELECT 1 FROM pg_attribute att CROSS JOIN LATERAL aclexplode(att.attacl) a
        WHERE att.attrelid = c.oid AND att.attacl IS NOT NULL AND NOT att.attisdropped
          AND (a.grantee = 0 OR a.grantee = ANY (browser_oids)))
      OR (c.relkind IN ('r', 'p') AND NOT c.relrowsecurity AND c.relname NOT LIKE 'soe\_%\_v1\_state'
        AND NOT c.relname = ANY (row_security_left_as_found))
      OR (c.relkind = 'S' AND (has_sequence_privilege('anon', c.oid, 'USAGE,SELECT,UPDATE')
        OR has_sequence_privilege('authenticated', c.oid, 'USAGE,SELECT,UPDATE')))
      OR (c.relkind <> 'S' AND (
        has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        OR has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        OR has_any_column_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
        OR has_any_column_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')))
    );
  IF leftover <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409',
      MESSAGE = format('Browser access would remain on %s relation(s); nothing was changed.', leftover);
  END IF;

  SELECT jsonb_object_agg(c.oid::text, CASE WHEN c.relkind = 'S' THEN jsonb_build_array(
        has_sequence_privilege(service_oid, c.oid, 'USAGE'), has_sequence_privilege(service_oid, c.oid, 'SELECT'),
        has_sequence_privilege(service_oid, c.oid, 'UPDATE'))
      ELSE (SELECT jsonb_agg(has_table_privilege(service_oid, c.oid, p.privilege) ORDER BY p.position)
        FROM unnest(table_privileges) WITH ORDINALITY AS p(privilege, position)) END)
  INTO service_after
  FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S') AND c.oid <> receipt_oid;
  IF service_after IS DISTINCT FROM service_before THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409',
      MESSAGE = 'Service access depended on a browser or PUBLIC grant; nothing was changed.';
  END IF;

  PERFORM set_config('soe.containment_summary', json_build_object(
    'result', 'public_browser_access_contained_locally_or_already_current',
    'relationsChecked', relations_seen,
    'relationsThatHadBrowserGrants', relations_closed,
    'tablesWhereRowSecurityWasEnabled', tables_secured)::text, true);
END
$containment$;

SELECT current_setting('soe.containment_summary') AS result;
COMMIT;
