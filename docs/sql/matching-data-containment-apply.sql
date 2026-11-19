-- Local candidate only. No hosted application authorized by this file.
-- Rehearse after coherent recovery, pair with service-route/consent controls,
-- and obtain explicit cutover approval. Preserves records and service CRUD.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

LOCK TABLE ONLY public.community_match_profiles, ONLY public.community_matches,
  ONLY public.consented_match_projections IN ACCESS EXCLUSIVE MODE;

DO $containment$
DECLARE
  target record;
  table_oid oid;
  service_oid oid;
  column_names text;
  browser_role text;
  policy_name text;
  table_privileges text := 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER';
BEGIN
  IF current_setting('server_version_num')::integer >= 170000 THEN
    table_privileges := table_privileges || ',MAINTAIN';
  END IF;
  SELECT oid INTO service_oid FROM pg_roles
  WHERE rolname = 'service_role' AND rolbypassrls AND NOT rolsuper
    AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication;
  IF service_oid IS NULL OR current_user IN ('anon', 'authenticated', 'service_role')
    OR (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon', 'authenticated')) <> 2
    OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('anon', 'authenticated')
      AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication))
    OR EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON m.member = r.oid
      WHERE r.rolname IN ('anon', 'authenticated', 'service_role'))
    OR has_schema_privilege('anon', 'public', 'CREATE')
    OR has_schema_privilege('authenticated', 'public', 'CREATE')
    OR NOT has_schema_privilege(service_oid, 'public', 'USAGE') THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Matching role or schema authority requires review.';
  END IF;

  FOR target IN SELECT * FROM (VALUES
    ('community_match_profiles', ARRAY['Server full access cmp', 'Server full access community_match_profiles']::text[]),
    ('community_matches', ARRAY['Server full access cm', 'Server full access community_matches']::text[]),
    ('consented_match_projections', ARRAY[]::text[])
  ) AS targets(table_name, expected_policies)
  LOOP
    SELECT c.oid INTO table_oid FROM pg_class c
    WHERE c.oid = to_regclass(format('public.%I', target.table_name))
      AND c.relkind = 'r' AND NOT c.relispartition AND NOT c.relhassubclass
      AND pg_get_userbyid(c.relowner) = current_user AND NOT c.relforcerowsecurity
      AND (c.relrowsecurity OR target.table_name = 'consented_match_projections');
    IF table_oid IS NULL
      OR EXISTS (SELECT 1 FROM pg_inherits WHERE inhrelid = table_oid OR inhparent = table_oid)
      OR EXISTS (SELECT 1 FROM pg_depend d JOIN pg_rewrite rw ON rw.oid = d.objid
        WHERE d.refobjid = table_oid AND rw.ev_class <> table_oid)
      OR (SELECT count(*) FROM pg_policy WHERE polrelid = table_oid) <> cardinality(target.expected_policies)
      OR EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = table_oid
        AND (NOT polname = ANY(target.expected_policies) OR polcmd <> '*' OR NOT polpermissive
          OR NOT polroles IN (ARRAY[0]::oid[], ARRAY[service_oid])
          OR pg_get_expr(polqual, polrelid) IS DISTINCT FROM 'true'
          OR pg_get_expr(polwithcheck, polrelid) IS DISTINCT FROM 'true')) THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Matching relation, view dependency or policy differs from the reviewed state.';
    END IF;

    -- The one observed user trigger is preserved, not replaced or broadened.
    IF (target.table_name <> 'consented_match_projections' AND EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgrelid = table_oid AND NOT tgisinternal))
      OR (target.table_name = 'consented_match_projections' AND (
        (SELECT count(*) FROM pg_trigger WHERE tgrelid = table_oid AND NOT tgisinternal) <> 1
        OR NOT EXISTS (SELECT 1 FROM pg_trigger tr WHERE tr.tgrelid = table_oid AND NOT tr.tgisinternal
          AND tr.tgname = 'set_consented_match_projections_updated_at' AND tr.tgenabled = 'O'
          AND tr.tgfoid = to_regprocedure('public.set_consented_match_projections_updated_at()')
          AND md5(pg_get_functiondef(tr.tgfoid)) = '9a0f9084126afeef420b0421ea25eef2'))) THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Matching trigger differs from the reviewed state.';
    END IF;

    FOREACH policy_name IN ARRAY target.expected_policies LOOP
      EXECUTE format('ALTER POLICY %I ON public.%I TO service_role', policy_name, target.table_name);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target.table_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', target.table_name);
    SELECT string_agg(format('%I', attname), ', ' ORDER BY attnum) INTO column_names
    FROM pg_attribute WHERE attrelid = table_oid AND attnum > 0 AND NOT attisdropped AND attacl IS NOT NULL;
    IF column_names IS NOT NULL THEN
      EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE public.%I FROM PUBLIC, anon, authenticated', column_names, target.table_name);
    END IF;
    FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_table_privilege(browser_role, table_oid, table_privileges)
        OR has_any_column_privilege(browser_role, table_oid, 'SELECT,INSERT,UPDATE,REFERENCES') THEN
        RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Browser access to matching data remains effective.';
      END IF;
    END LOOP;
    IF NOT (has_table_privilege(service_oid, table_oid, 'SELECT')
      AND has_table_privilege(service_oid, table_oid, 'INSERT')
      AND has_table_privilege(service_oid, table_oid, 'UPDATE')
      AND has_table_privilege(service_oid, table_oid, 'DELETE')) THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Required matching service access would be lost.';
    END IF;
  END LOOP;
END;
$containment$;
COMMIT;
