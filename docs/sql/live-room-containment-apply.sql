-- Unapplied review draft. Rehearse on an isolated restore before approval.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, public;
LOCK TABLE ONLY public.room_participants, ONLY public.room_transcripts, ONLY public.video_rooms
  IN ACCESS EXCLUSIVE MODE;

DO $containment$
DECLARE
  target_names constant text[] := ARRAY['room_participants', 'room_transcripts', 'video_rooms'];
  target text;
  target_oid oid;
  columns_sql text;
  unexpected_view boolean;
BEGIN
  IF (SELECT count(*) FROM pg_roles
      WHERE rolname IN ('anon', 'authenticated') AND NOT rolsuper AND NOT rolbypassrls
        AND NOT rolcreaterole AND NOT rolreplication) <> 2
     OR EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member
                WHERE r.rolname IN ('anon', 'authenticated'))
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role' AND rolbypassrls AND NOT rolsuper)
     OR has_schema_privilege('anon', 'public', 'CREATE')
     OR has_schema_privilege('authenticated', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'Live-room role configuration requires review' USING ERRCODE = 'PT409';
  END IF;

  WITH RECURSIVE dependent_views(oid) AS (
    SELECT to_regclass(format('public.%I', name))::oid FROM unnest(target_names) AS name
    UNION
    SELECT view.oid
    FROM dependent_views parent
    JOIN pg_depend dep ON dep.refclassid = 'pg_class'::regclass AND dep.refobjid = parent.oid
      AND dep.classid = 'pg_rewrite'::regclass
    JOIN pg_rewrite rewrite ON rewrite.oid = dep.objid
    JOIN pg_class view ON view.oid = rewrite.ev_class AND view.relkind IN ('v', 'm')
  )
  SELECT EXISTS (
    SELECT 1 FROM dependent_views d JOIN pg_class c ON c.oid = d.oid AND c.relkind IN ('v', 'm')
    CROSS JOIN (VALUES ('anon'), ('authenticated')) AS browser(role)
    WHERE has_any_column_privilege(browser.role, c.oid, 'SELECT')
  ) INTO unexpected_view;
  IF unexpected_view OR EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND p.prosrc ~* '(video_rooms|room_participants|room_transcripts)'
      AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  ) THEN
    RAISE EXCEPTION 'Live-room dependent views or functions require review' USING ERRCODE = 'PT409';
  END IF;

  FOREACH target IN ARRAY target_names LOOP
    target_oid := to_regclass(format('public.%I', target));
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c WHERE c.oid = target_oid AND c.relkind = 'r'
        AND NOT c.relispartition AND pg_get_userbyid(c.relowner) = current_user
    ) OR EXISTS (SELECT 1 FROM pg_inherits WHERE inhrelid = target_oid OR inhparent = target_oid)
      OR EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = target_oid)
      OR EXISTS (SELECT 1 FROM pg_publication_tables WHERE schemaname = 'public' AND tablename = target) THEN
      RAISE EXCEPTION 'Live-room ownership, policies or replication require review' USING ERRCODE = 'PT409';
    END IF;

    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated RESTRICT', target);
    SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO columns_sql FROM pg_attribute
      WHERE attrelid = target_oid AND attnum > 0 AND NOT attisdropped;
    EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE public.%I FROM PUBLIC, anon, authenticated RESTRICT',
                   columns_sql, target);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target);

    IF EXISTS (
      SELECT 1 FROM pg_roles r WHERE r.rolname IN ('anon', 'authenticated')
      AND (has_table_privilege(r.oid, target_oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
           OR has_any_column_privilege(r.oid, target_oid, 'SELECT,INSERT,UPDATE,REFERENCES'))
    ) OR EXISTS (
      SELECT 1 FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) AS privilege
      WHERE NOT has_table_privilege('service_role', target_oid, privilege)
    ) THEN
      RAISE EXCEPTION 'Live-room effective grants require review' USING ERRCODE = 'PT409';
    END IF;
  END LOOP;
END
$containment$;

CREATE FUNCTION public.soe_join_live_council(p_room uuid, p_member uuid, p_expected_url text)
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, public
BEGIN ATOMIC
  -- Lock the room during attendance recording so end or link rotation wins or waits as one operation.
  WITH available AS MATERIALIZED (
    SELECT room.id FROM public.video_rooms room JOIN public.communities community ON community.id = room.community_id
      WHERE room.id = p_room AND room.room_type = 'live_session' AND room.is_live
        AND room.ended_at IS NULL AND community.slug = 'society-of-explorers'
        AND room.daily_room_url = p_expected_url AND p_expected_url LIKE 'https://%'
      FOR SHARE OF room
  ), attendance AS (
    INSERT INTO public.room_participants (room_id, member_id, joined_at)
      SELECT id, p_member, statement_timestamp() FROM available
      ON CONFLICT ON CONSTRAINT room_participants_room_id_member_id_key
        DO UPDATE SET joined_at = EXCLUDED.joined_at, left_at = NULL
        WHERE public.room_participants.left_at IS NOT NULL
  )
  SELECT EXISTS (SELECT 1 FROM available);
END;

REVOKE ALL ON FUNCTION public.soe_join_live_council(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.soe_join_live_council(uuid, uuid, text) TO service_role;

DO $check$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
    WHERE p.oid = 'public.soe_join_live_council(uuid,uuid,text)'::regprocedure
      AND a.grantee NOT IN (p.proowner, 'service_role'::regrole)
  ) OR has_function_privilege('anon', 'public.soe_join_live_council(uuid,uuid,text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.soe_join_live_council(uuid,uuid,text)', 'EXECUTE')
    OR NOT has_table_privilege('service_role', 'public.communities', 'SELECT') THEN
    RAISE EXCEPTION 'Live-room join grants require review' USING ERRCODE = 'PT409';
  END IF;
END
$check$;
COMMIT;
