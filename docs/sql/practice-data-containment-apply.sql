-- Local review draft. Apply only after the production restore and paired app review.
-- Targets the four reviewed Practice tables. Preserves rows and service-role CRUD.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

LOCK TABLE ONLY public.daily_questions, ONLY public.matched_conversations,
  ONLY public.practice_reflections, ONLY public.question_responses IN ACCESS EXCLUSIVE MODE;

DO $containment$
DECLARE
  target record;
  table_oid oid;
  service_oid oid;
  columns text;
  browser_role text;
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
    OR EXISTS (SELECT 1 FROM pg_auth_members AS m JOIN pg_roles AS r ON m.member = r.oid
      WHERE r.rolname IN ('anon', 'authenticated', 'service_role'))
    OR has_schema_privilege('anon', 'public', 'CREATE')
    OR has_schema_privilege('authenticated', 'public', 'CREATE')
    OR NOT has_schema_privilege(service_oid, 'public', 'USAGE') THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Practice role or schema authority requires review.';
  END IF;

  FOR target IN SELECT * FROM (VALUES
    ('daily_questions', 'Server full access daily_questions'),
    ('matched_conversations', 'Server full access matched_conversations'),
    ('practice_reflections', 'Server full access reflections'),
    ('question_responses', 'Server full access question_responses')
  ) AS targets(table_name, policy_name)
  LOOP
    SELECT c.oid INTO table_oid FROM pg_class AS c
    WHERE c.oid = to_regclass(format('public.%I', target.table_name))
      AND c.relkind = 'r' AND NOT c.relispartition AND NOT c.relhassubclass
      AND pg_get_userbyid(c.relowner) = current_user
      AND c.relrowsecurity AND NOT c.relforcerowsecurity;
    IF table_oid IS NULL
      OR EXISTS (SELECT 1 FROM pg_inherits WHERE inhrelid = table_oid OR inhparent = table_oid)
      OR (SELECT count(*) FROM pg_policy WHERE polrelid = table_oid) <> 1
      OR NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = table_oid
        AND polname = target.policy_name AND polcmd = '*' AND polpermissive
        AND polroles IN (ARRAY[0]::oid[], ARRAY[service_oid])
        AND pg_get_expr(polqual, polrelid) = 'true'
        AND pg_get_expr(polwithcheck, polrelid) = 'true') THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Practice table or policy differs from the reviewed state.';
    END IF;

    EXECUTE format('ALTER POLICY %I ON public.%I TO service_role', target.policy_name, target.table_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', target.table_name);
    SELECT string_agg(format('%I', attname), ', ' ORDER BY attnum) INTO columns
    FROM pg_attribute WHERE attrelid = table_oid AND attnum > 0 AND NOT attisdropped AND attacl IS NOT NULL;
    IF columns IS NOT NULL THEN
      EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE public.%I FROM PUBLIC, anon, authenticated',
        columns, target.table_name);
    END IF;

    FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_table_privilege(browser_role, table_oid, table_privileges)
        OR has_any_column_privilege(browser_role, table_oid, 'SELECT,INSERT,UPDATE,REFERENCES') THEN
        RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Browser access to Practice remains effective.';
      END IF;
    END LOOP;
    IF NOT (has_table_privilege(service_oid, table_oid, 'SELECT')
        AND has_table_privilege(service_oid, table_oid, 'INSERT')
        AND has_table_privilege(service_oid, table_oid, 'UPDATE')
        AND has_table_privilege(service_oid, table_oid, 'DELETE')) THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Required Practice service access would be lost.';
    END IF;
  END LOOP;
END;
$containment$;
COMMIT;
