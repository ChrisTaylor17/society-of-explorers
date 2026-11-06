-- Unapplied owner review draft. Compare the approved export with its isolated restore first.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, public;

LOCK TABLE ONLY public.direct_messages IN ACCESS EXCLUSIVE MODE;

DO $containment$
DECLARE
  target constant oid := 'public.direct_messages'::regclass;
  channel constant text := 'supabase_realtime';
  browser_roles constant text[] := ARRAY['anon', 'authenticated'];
  open_policy boolean;
  published boolean;
  dependent_access boolean;
BEGIN
  IF current_setting('server_version_num')::integer / 10000 <> 17
     OR NOT EXISTS (
       SELECT 1 FROM pg_class c
       WHERE c.oid = target AND c.relkind = 'r' AND NOT c.relispartition
         AND c.relrowsecurity AND NOT c.relforcerowsecurity
         AND pg_get_userbyid(c.relowner) = current_user
     )
     OR EXISTS (SELECT 1 FROM pg_inherits WHERE inhrelid = target OR inhparent = target)
     OR (SELECT jsonb_object_agg(attname, format_type(atttypid, atttypmod))
         FROM pg_attribute WHERE attrelid = target AND attnum > 0 AND NOT attisdropped)
        IS DISTINCT FROM
        '{"id":"uuid","created_at":"timestamp with time zone","sender_id":"uuid","recipient_id":"uuid","content":"text","read":"boolean"}'::jsonb THEN
    RAISE EXCEPTION 'Direct-message table or owner requires review' USING ERRCODE = 'PT409';
  END IF;

  IF (SELECT count(*) FROM pg_roles
      WHERE rolname = ANY(browser_roles) AND NOT rolsuper AND NOT rolbypassrls
        AND NOT rolcreaterole AND NOT rolreplication) <> 2
     OR EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member
                WHERE r.rolname = ANY(browser_roles))
     OR EXISTS (SELECT 1 FROM unnest(browser_roles) AS role_name
                WHERE has_schema_privilege(role_name, 'public', 'CREATE'))
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role' AND rolbypassrls AND NOT rolsuper)
     OR NOT has_schema_privilege('service_role', 'public', 'USAGE') THEN
    RAISE EXCEPTION 'Direct-message role configuration requires review' USING ERRCODE = 'PT409';
  END IF;

  WITH RECURSIVE refs(oid) AS (
    SELECT target
    UNION
    SELECT view.oid FROM refs parent
    JOIN pg_depend d ON d.refclassid = 'pg_class'::regclass AND d.refobjid = parent.oid
      AND d.classid = 'pg_rewrite'::regclass
    JOIN pg_rewrite w ON w.oid = d.objid
    JOIN pg_class view ON view.oid = w.ev_class AND view.relkind IN ('v', 'm')
  )
  SELECT EXISTS (
    SELECT 1 FROM refs r JOIN pg_class c ON c.oid = r.oid AND c.relkind IN ('v', 'm')
    CROSS JOIN unnest(browser_roles) AS role_name
    WHERE has_any_column_privilege(role_name, c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
       OR has_table_privilege(role_name, c.oid, 'DELETE,TRUNCATE,TRIGGER,MAINTAIN')
  ) OR EXISTS (
    SELECT 1 FROM pg_proc p
    CROSS JOIN unnest(browser_roles) AS role_name
    WHERE p.prosecdef AND has_schema_privilege(role_name, p.pronamespace, 'USAGE')
      AND has_function_privilege(role_name, p.oid, 'EXECUTE')
      AND (p.prosrc ~* 'direct_messages' OR EXISTS (
        SELECT 1 FROM pg_depend d JOIN refs r ON r.oid = d.refobjid
        WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.refclassid = 'pg_class'::regclass
      ))
  ) INTO dependent_access;
  IF dependent_access THEN
    RAISE EXCEPTION 'Direct-message dependent views or functions require review' USING ERRCODE = 'PT409';
  END IF;

  SELECT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = target AND polname = 'dm_open') INTO open_policy;
  IF (SELECT count(*) FROM pg_policy
      WHERE polrelid = target AND polpermissive AND polroles = ARRAY[0::oid]
        AND (polname, polcmd) IN (('Can read own messages', 'r'), ('Can send messages', 'a'))) <> 2
     OR (SELECT count(*) FROM pg_policy WHERE polrelid = target) <> (CASE WHEN open_policy THEN 3 ELSE 2 END)
     OR (open_policy AND NOT EXISTS (
       SELECT 1 FROM pg_policy WHERE polrelid = target AND polname = 'dm_open'
         AND polcmd = '*' AND polpermissive AND polroles = ARRAY[0::oid]
         AND pg_get_expr(polqual, polrelid) = 'true' AND pg_get_expr(polwithcheck, polrelid) = 'true'
     )) THEN
    RAISE EXCEPTION 'Direct-message policies require review' USING ERRCODE = 'PT409';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE schemaname = 'public' AND tablename = 'direct_messages' AND pubname = channel
  ) INTO published;
  IF NOT EXISTS (
       SELECT 1 FROM pg_publication p WHERE p.pubname = channel AND NOT p.puballtables
         AND pg_get_userbyid(p.pubowner) = current_user
     ) OR EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE schemaname = 'public' AND tablename = 'direct_messages' AND pubname <> channel
     ) OR (published AND NOT EXISTS (
       SELECT 1 FROM pg_publication p JOIN pg_publication_rel r ON r.prpubid = p.oid
       WHERE p.pubname = channel AND r.prrelid = target AND r.prattrs IS NULL AND r.prqual IS NULL
         AND NOT EXISTS (SELECT 1 FROM pg_publication_namespace n
                         WHERE n.pnpubid = p.oid AND n.pnnspid = 'public'::regnamespace)
     )) OR open_policy <> published THEN
    RAISE EXCEPTION 'Direct-message publication or partial containment requires review' USING ERRCODE = 'PT409';
  END IF;

  IF open_policy THEN
    REVOKE ALL PRIVILEGES ON TABLE public.direct_messages FROM PUBLIC, anon, authenticated RESTRICT;
    REVOKE ALL PRIVILEGES (id, created_at, sender_id, recipient_id, content, read)
      ON TABLE public.direct_messages FROM PUBLIC, anon, authenticated RESTRICT;
    DROP POLICY dm_open ON public.direct_messages;
    ALTER PUBLICATION supabase_realtime DROP TABLE ONLY public.direct_messages;
  END IF;

  IF EXISTS (
       SELECT 1 FROM unnest(browser_roles) AS role_name
       WHERE has_table_privilege(role_name, target, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
          OR has_any_column_privilege(role_name, target, 'SELECT,INSERT,UPDATE,REFERENCES')
     ) OR EXISTS (
       SELECT 1 FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) AS privilege
       WHERE NOT has_table_privilege('service_role', target, privilege)
     ) OR EXISTS (
       SELECT 1 FROM pg_publication_tables WHERE schemaname = 'public' AND tablename = 'direct_messages'
     ) THEN
    RAISE EXCEPTION 'Direct-message effective grants or publication require review' USING ERRCODE = 'PT409';
  END IF;
END
$containment$;

COMMIT;
