-- Owner review draft. Close older application routes as part of the same cutover.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

LOCK TABLE ONLY public.twiddles, ONLY public.twiddle_collaborators, ONLY public.twiddle_reactions
  IN ACCESS EXCLUSIVE MODE;

DO $containment$
DECLARE
  targets constant regclass[] := ARRAY['public.twiddles'::regclass,
    'public.twiddle_collaborators'::regclass, 'public.twiddle_reactions'::regclass];
  target regclass;
  columns_sql text;
BEGIN
  IF current_user <> 'postgres' OR current_setting('server_version_num')::integer < 170000
    OR (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon', 'authenticated')
          AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolreplication) <> 2
    OR EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member
               WHERE r.rolname IN ('anon', 'authenticated'))
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role' AND rolbypassrls AND NOT rolsuper)
  THEN
    RAISE EXCEPTION 'Legacy Twiddle roles require review' USING ERRCODE = 'PT409';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_depend d JOIN pg_rewrite rw ON rw.oid = d.objid
    WHERE d.refclassid = 'pg_class'::regclass AND d.refobjid = ANY(targets)
      AND d.classid = 'pg_rewrite'::regclass
  ) OR EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND (p.prosrc ~* '\m(twiddles|twiddle_collaborators|twiddle_reactions)\M'
        OR EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid
                   AND d.refclassid = 'pg_class'::regclass AND d.refobjid = ANY(targets)))
      AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  ) THEN
    RAISE EXCEPTION 'Legacy Twiddle views or routines require review' USING ERRCODE = 'PT409';
  END IF;

  FOREACH target IN ARRAY targets LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid = target AND c.relkind = 'r'
      AND c.relowner = current_user::regrole AND c.relrowsecurity AND NOT c.relforcerowsecurity)
      OR EXISTS (SELECT 1 FROM pg_inherits WHERE inhrelid = target OR inhparent = target)
      OR EXISTS (SELECT 1 FROM pg_publication_tables p
        WHERE p.schemaname = 'public' AND to_regclass(format('public.%I', p.tablename)) = target)
    THEN
      RAISE EXCEPTION 'Legacy Twiddle ownership or publication requires review' USING ERRCODE = 'PT409';
    END IF;

    SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO STRICT columns_sql
      FROM pg_attribute WHERE attrelid = target AND attnum > 0 AND NOT attisdropped;
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %s FROM PUBLIC, anon, authenticated RESTRICT', target);
    EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE %s FROM PUBLIC, anon, authenticated RESTRICT', columns_sql, target);

    IF EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname IN ('anon', 'authenticated')
      AND (has_table_privilege(r.oid, target, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
        OR has_any_column_privilege(r.oid, target, 'SELECT,INSERT,UPDATE,REFERENCES')))
      OR EXISTS (SELECT 1 FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) AS need(privilege)
        WHERE NOT has_table_privilege('service_role', target, need.privilege))
    THEN
      RAISE EXCEPTION 'Legacy Twiddle effective grants require review' USING ERRCODE = 'PT409';
    END IF;
  END LOOP;
END
$containment$;

COMMIT;
