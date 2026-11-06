-- Run with psql inside the owner-approved export's repeatable-read, read-only transaction.
-- The single JSON row is private recovery material.
\if :{?soe_restore_include_rooms}
\else
  \set soe_restore_include_rooms on
\endif
\if :{?soe_restore_include_auth}
\else
  \set soe_restore_include_auth off
\endif
\if :{?soe_restore_include_direct_messages}
\else
  \set soe_restore_include_direct_messages off
\endif
\if :{?soe_restore_include_wallet_state}
\else
  \set soe_restore_include_wallet_state off
\endif
\if :{?soe_restore_include_circles}
\else
  \set soe_restore_include_circles off
\endif
\if :{?soe_restore_include_circle_release_state}
\else
  \set soe_restore_include_circle_release_state off
\endif
\if :{?soe_restore_include_first_release_state}
\else
  \set soe_restore_include_first_release_state off
\endif
\if :soe_restore_include_first_release_state
  \set soe_restore_include_circle_release_state on
\endif
\if :soe_restore_include_circle_release_state
  \set soe_restore_include_circles on
  \set soe_restore_include_wallet_state on
\endif
\if :soe_restore_include_wallet_state
  \set soe_restore_include_auth on
  \set soe_restore_include_direct_messages on
\elif :soe_restore_include_circles
  \set soe_restore_include_auth on
  \set soe_restore_include_direct_messages on
\endif
\if :soe_restore_include_auth
  \set soe_restore_include_rooms on
\endif
\if :soe_restore_include_direct_messages
  \set soe_restore_include_rooms on
\endif

SET LOCAL search_path = pg_catalog;

DO $guard$
BEGIN
  IF current_setting('transaction_read_only') <> 'on'
    OR current_setting('transaction_isolation') <> 'repeatable read' THEN
    RAISE EXCEPTION 'A repeatable-read, read-only snapshot is required.';
  END IF;
END;
$guard$;

SET LOCAL row_security = off;
SET LOCAL timezone = 'UTC';
SET LOCAL datestyle = 'ISO, YMD';
SET LOCAL intervalstyle = 'postgres';
SET LOCAL extra_float_digits = 3;
SET LOCAL bytea_output = 'hex';
SET LOCAL statement_timeout = '90s';
SET LOCAL lock_timeout = '5s';

WITH RECURSIVE schemas AS (
  SELECT oid, nspname, nspowner, nspacl FROM pg_namespace
  WHERE nspname = 'public'
\if :soe_restore_include_auth
    OR nspname = 'auth'
\endif
\if :soe_restore_include_wallet_state
    OR nspname = 'soe_wallet_private'
\endif
),
relations(schema_name, name, evidence_name) AS (
  SELECT 'public', name, name FROM (VALUES
\if :soe_restore_include_rooms
    ('video_rooms'), ('room_participants'), ('room_transcripts'),
\endif
\if :soe_restore_include_direct_messages
    ('direct_messages'),
\endif
\if :soe_restore_include_circles
    ('book_cohorts'), ('book_cohort_members'), ('seminar_messages'),
\endif
\if :soe_restore_include_circle_release_state
    ('circle_discussion_post_receipts'),
    ('circle_message_ai_allowance'),
    ('circle_message_ai_attempts'),
    ('circle_message_ai_consents'),
    ('circle_message_decisions'),
    ('circle_message_receipts'),
    ('circle_message_reply_links'),
    ('circle_message_reports'),
    ('circle_message_states'),
    ('circle_participation_receipts'),
    ('circle_passage_post_receipts'),
    ('circle_private'),
    ('circle_report_receipts'),
    ('circle_reports'),
    ('circle_review_coverage_pages'),
    ('circle_review_coverage_sessions'),
    ('circle_review_decisions'),
    ('circle_reviewer_grants'),
    ('circle_rsvps'),
    ('circle_salon_presence'),
\endif
    ('members'), ('reading_progress'), ('book_highlights'),
    ('great_books_progress'), ('great_books_highlights'), ('book_reflections'), ('thinker_memory'),
    ('daily_questions'), ('matched_conversations'), ('practice_reflections'), ('question_responses')
  ) AS app_tables(name)
\if :soe_restore_include_auth
  UNION ALL VALUES ('auth', 'users', 'auth.users'), ('auth', 'identities', 'auth.identities')
\endif
\if :soe_restore_include_wallet_state
  UNION ALL VALUES ('soe_wallet_private', 'used_challenges', 'soe_wallet_private.used_challenges'),
    ('soe_wallet_private', 'revoked_sessions', 'soe_wallet_private.revoked_sessions')
\endif
),
scoped AS (
  SELECT c.*, r.schema_name, r.evidence_name
  FROM pg_class c JOIN schemas n ON c.relnamespace = n.oid
  JOIN relations r ON c.relname = r.name AND n.nspname = r.schema_name
  WHERE c.relkind = 'r' AND NOT c.relispartition AND NOT c.relhassubclass
    AND NOT EXISTS (SELECT 1 FROM pg_inherits i WHERE i.inhrelid = c.oid)
),
row_hashes(name, digest) AS (
  SELECT 'members', sha256(convert_to(to_jsonb(t)::text, 'UTF8')) FROM ONLY public.members t
  UNION ALL SELECT 'reading_progress', sha256(convert_to(to_jsonb(t)::text, 'UTF8')) FROM ONLY public.reading_progress t
  UNION ALL SELECT 'book_highlights', sha256(convert_to(to_jsonb(t)::text, 'UTF8')) FROM ONLY public.book_highlights t
  UNION ALL SELECT 'great_books_progress', sha256(convert_to(to_jsonb(t)::text, 'UTF8')) FROM ONLY public.great_books_progress t
  UNION ALL SELECT 'great_books_highlights', sha256(convert_to(to_jsonb(t)::text, 'UTF8')) FROM ONLY public.great_books_highlights t
  UNION ALL SELECT 'book_reflections', sha256(convert_to(to_jsonb(t)::text, 'UTF8')) FROM ONLY public.book_reflections t
  UNION ALL SELECT 'thinker_memory', sha256(convert_to(to_jsonb(t)::text, 'UTF8')) FROM ONLY public.thinker_memory t
  UNION ALL SELECT 'daily_questions', sha256(convert_to(to_jsonb(t)::text, 'UTF8')) FROM ONLY public.daily_questions t
  UNION ALL SELECT 'matched_conversations', sha256(convert_to(to_jsonb(t)::text, 'UTF8')) FROM ONLY public.matched_conversations t
  UNION ALL SELECT 'practice_reflections', sha256(convert_to(to_jsonb(t)::text, 'UTF8')) FROM ONLY public.practice_reflections t
  UNION ALL SELECT 'question_responses', sha256(convert_to(to_jsonb(t)::text, 'UTF8')) FROM ONLY public.question_responses t
\if :soe_restore_include_rooms
  UNION ALL SELECT 'video_rooms', sha256(convert_to(to_jsonb(t)::text, 'UTF8')) FROM ONLY public.video_rooms t
  UNION ALL SELECT 'room_participants', sha256(convert_to(to_jsonb(t)::text, 'UTF8')) FROM ONLY public.room_participants t
  UNION ALL SELECT 'room_transcripts', sha256(convert_to(to_jsonb(t)::text, 'UTF8')) FROM ONLY public.room_transcripts t
\endif
\if :soe_restore_include_direct_messages
  UNION ALL SELECT 'direct_messages', sha256(convert_to(to_jsonb(t)::text, 'UTF8')) FROM ONLY public.direct_messages t
\endif
\if :soe_restore_include_circles
  UNION ALL SELECT 'book_cohorts', sha256(convert_to(to_jsonb(t)::text, 'UTF8')) FROM ONLY public.book_cohorts t
  UNION ALL SELECT 'book_cohort_members', sha256(convert_to(to_jsonb(t)::text, 'UTF8')) FROM ONLY public.book_cohort_members t
  UNION ALL SELECT 'seminar_messages', sha256(convert_to(to_jsonb(t)::text, 'UTF8')) FROM ONLY public.seminar_messages t
\endif
\if :soe_restore_include_circle_release_state
  UNION ALL SELECT 'circle_discussion_post_receipts', sha256(convert_to(to_jsonb(t)::text, 'UTF8'))
    FROM ONLY public.circle_discussion_post_receipts t
  UNION ALL SELECT 'circle_message_ai_allowance', sha256(convert_to(to_jsonb(t)::text, 'UTF8'))
    FROM ONLY public.circle_message_ai_allowance t
  UNION ALL SELECT 'circle_message_ai_attempts', sha256(convert_to(to_jsonb(t)::text, 'UTF8'))
    FROM ONLY public.circle_message_ai_attempts t
  UNION ALL SELECT 'circle_message_ai_consents', sha256(convert_to(to_jsonb(t)::text, 'UTF8'))
    FROM ONLY public.circle_message_ai_consents t
  UNION ALL SELECT 'circle_message_decisions', sha256(convert_to(to_jsonb(t)::text, 'UTF8'))
    FROM ONLY public.circle_message_decisions t
  UNION ALL SELECT 'circle_message_receipts', sha256(convert_to(to_jsonb(t)::text, 'UTF8'))
    FROM ONLY public.circle_message_receipts t
  UNION ALL SELECT 'circle_message_reply_links', sha256(convert_to(to_jsonb(t)::text, 'UTF8'))
    FROM ONLY public.circle_message_reply_links t
  UNION ALL SELECT 'circle_message_reports', sha256(convert_to(to_jsonb(t)::text, 'UTF8'))
    FROM ONLY public.circle_message_reports t
  UNION ALL SELECT 'circle_message_states', sha256(convert_to(to_jsonb(t)::text, 'UTF8'))
    FROM ONLY public.circle_message_states t
  UNION ALL SELECT 'circle_participation_receipts', sha256(convert_to(to_jsonb(t)::text, 'UTF8'))
    FROM ONLY public.circle_participation_receipts t
  UNION ALL SELECT 'circle_passage_post_receipts', sha256(convert_to(to_jsonb(t)::text, 'UTF8'))
    FROM ONLY public.circle_passage_post_receipts t
  UNION ALL SELECT 'circle_private', sha256(convert_to(to_jsonb(t)::text, 'UTF8'))
    FROM ONLY public.circle_private t
  UNION ALL SELECT 'circle_report_receipts', sha256(convert_to(to_jsonb(t)::text, 'UTF8'))
    FROM ONLY public.circle_report_receipts t
  UNION ALL SELECT 'circle_reports', sha256(convert_to(to_jsonb(t)::text, 'UTF8'))
    FROM ONLY public.circle_reports t
  UNION ALL SELECT 'circle_review_coverage_pages', sha256(convert_to(to_jsonb(t)::text, 'UTF8'))
    FROM ONLY public.circle_review_coverage_pages t
  UNION ALL SELECT 'circle_review_coverage_sessions', sha256(convert_to(to_jsonb(t)::text, 'UTF8'))
    FROM ONLY public.circle_review_coverage_sessions t
  UNION ALL SELECT 'circle_review_decisions', sha256(convert_to(to_jsonb(t)::text, 'UTF8'))
    FROM ONLY public.circle_review_decisions t
  UNION ALL SELECT 'circle_reviewer_grants', sha256(convert_to(to_jsonb(t)::text, 'UTF8'))
    FROM ONLY public.circle_reviewer_grants t
  UNION ALL SELECT 'circle_rsvps', sha256(convert_to(to_jsonb(t)::text, 'UTF8'))
    FROM ONLY public.circle_rsvps t
  UNION ALL SELECT 'circle_salon_presence', sha256(convert_to(to_jsonb(t)::text, 'UTF8'))
    FROM ONLY public.circle_salon_presence t
\endif
\if :soe_restore_include_auth
  UNION ALL SELECT 'auth.users', sha256(convert_to(to_jsonb(t)::text, 'UTF8')) FROM ONLY auth.users t
  UNION ALL SELECT 'auth.identities', sha256(convert_to(to_jsonb(t)::text, 'UTF8')) FROM ONLY auth.identities t
\endif
\if :soe_restore_include_wallet_state
  UNION ALL SELECT 'soe_wallet_private.used_challenges', sha256(convert_to(to_jsonb(t)::text, 'UTF8'))
    FROM ONLY soe_wallet_private.used_challenges t
  UNION ALL SELECT 'soe_wallet_private.revoked_sessions', sha256(convert_to(to_jsonb(t)::text, 'UTF8'))
    FROM ONLY soe_wallet_private.revoked_sessions t
\endif
),
numbered AS (
  SELECT name, digest, (row_number() OVER (PARTITION BY name ORDER BY digest) - 1) / 4096 AS batch
  FROM row_hashes
),
chunks AS (
  SELECT name, batch, count(*) AS rows, sha256(string_agg(digest, ''::bytea ORDER BY digest)) AS digest
  FROM numbered GROUP BY name, batch
),
row_evidence AS (
  SELECT name, sum(rows)::bigint AS rows, sha256(string_agg(digest, ''::bytea ORDER BY batch)) AS digest
  FROM chunks GROUP BY name
),
\if :soe_restore_include_wallet_state
wallet_routines AS (
  SELECT p.oid, n.nspname, p.proname, p.proowner, p.proacl
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prokind = 'f' AND p.oid IN (
    to_regprocedure('public.soe_wallet_challenge_consume(text,bigint)'),
    to_regprocedure('soe_wallet_private.consume_challenge(text,bigint)'),
    to_regprocedure('public.soe_wallet_session_access(text,bigint,boolean)'),
    to_regprocedure('soe_wallet_private.session_access(text,bigint,boolean)')
  )
),
\endif
\if :soe_restore_include_circle_release_state
circle_routines AS (
  SELECT p.oid, p.proname, p.proowner, p.proacl, pg_get_function_identity_arguments(p.oid) AS arguments
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.proname ~ '^_?soe_circle_'
),
\endif
\if :soe_restore_include_first_release_state
release_service_routines AS (
  SELECT p.oid, p.proname, p.proowner, p.proacl
  FROM pg_proc p
  WHERE p.prokind = 'f' AND p.oid IN (
    to_regprocedure('public.soe_practice_response_save(uuid,uuid,text)'),
    to_regprocedure('public.soe_join_live_council(uuid,uuid,text)')
  )
),
\endif
acl_sources(kind, object, column_no, permissions) AS (
  SELECT 'relation', oid, 0, coalesce(relacl, acldefault('r', relowner)) FROM scoped
  UNION ALL
  SELECT 'relation', c.oid, a.attnum, a.attacl FROM scoped c JOIN pg_attribute a ON a.attrelid = c.oid
  WHERE a.attnum > 0 AND NOT a.attisdropped
  UNION ALL
  SELECT 'schema', oid, 0, coalesce(nspacl, acldefault('n', nspowner)) FROM schemas
\if :soe_restore_include_wallet_state
  UNION ALL
  SELECT 'routine', oid, 0, coalesce(proacl, acldefault('f', proowner)) FROM wallet_routines
\endif
\if :soe_restore_include_circle_release_state
  UNION ALL
  SELECT 'routine', oid, 0, coalesce(proacl, acldefault('f', proowner)) FROM circle_routines
\endif
\if :soe_restore_include_first_release_state
  UNION ALL
  SELECT 'routine', oid, 0, coalesce(proacl, acldefault('f', proowner)) FROM release_service_routines
\endif
),
acl_entries AS (
  SELECT src.kind, src.object, src.column_no,
    jsonb_build_array(
      CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
      pg_get_userbyid(a.grantor), a.privilege_type, a.is_grantable
    ) AS entry
  FROM acl_sources src CROSS JOIN LATERAL aclexplode(src.permissions) a
),
acls AS (
  SELECT kind, object, column_no, jsonb_agg(entry ORDER BY entry::text COLLATE "C") AS entries
  FROM acl_entries GROUP BY kind, object, column_no
),
\if :soe_restore_include_wallet_state
wallet_routine_evidence AS (
  -- A missing routine makes a wallet-state reference or comparison unusable.
  SELECT CASE WHEN count(*) = 4 THEN encode(sha256(convert_to(jsonb_agg(jsonb_build_array(
    p.nspname, p.proname, pg_get_userbyid(p.proowner), pg_get_functiondef(p.oid), a.entries
  ) ORDER BY p.nspname COLLATE "C", p.proname COLLATE "C")::text, 'UTF8')), 'hex') END AS digest
  FROM wallet_routines p LEFT JOIN acls a ON a.kind = 'routine' AND a.object = p.oid
),
\endif
\if :soe_restore_include_circle_release_state
circle_routine_evidence AS (
  SELECT encode(sha256(convert_to(jsonb_agg(jsonb_build_array(
    p.proname, p.arguments, pg_get_userbyid(p.proowner), pg_get_functiondef(p.oid),
    obj_description(p.oid, 'pg_proc'), a.entries
  ) ORDER BY p.proname COLLATE "C", p.arguments COLLATE "C")::text, 'UTF8')), 'hex') AS digest
  FROM circle_routines p LEFT JOIN acls a ON a.kind = 'routine' AND a.object = p.oid
),
\endif
\if :soe_restore_include_first_release_state
release_service_routine_evidence AS (
  -- A missing or differently typed routine leaves no valid release digest.
  SELECT CASE WHEN count(*) = 2 THEN encode(sha256(convert_to(jsonb_agg(jsonb_build_array(
    p.proname, pg_get_userbyid(p.proowner), pg_get_functiondef(p.oid), a.entries
  ) ORDER BY p.proname COLLATE "C")::text, 'UTF8')), 'hex') END AS digest
  FROM release_service_routines p LEFT JOIN acls a ON a.kind = 'routine' AND a.object = p.oid
),
\endif
table_evidence AS (
  SELECT c.evidence_name AS name, jsonb_build_object(
    'owner', pg_get_userbyid(c.relowner),
    'rls', c.relrowsecurity,
    'forceRls', c.relforcerowsecurity,
    'acl', (SELECT entries FROM acls WHERE kind = 'relation' AND object = c.oid AND column_no = 0),
    'columns', (SELECT jsonb_agg(jsonb_build_array(
      a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull, a.attidentity, a.attgenerated,
      pg_get_expr(d.adbin, d.adrelid), (SELECT entries FROM acls WHERE kind = 'relation' AND object = c.oid AND column_no = a.attnum)
    ) ORDER BY a.attnum) FROM pg_attribute a
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped),
    'policies', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.policyname COLLATE "C")
      FROM pg_policies p WHERE p.schemaname = c.schema_name AND p.tablename = c.relname),
    -- A restored CHECK can have flatter AND/OR grouping than the original.
    -- Use the deparser's minimal parentheses for CHECKs in the new scope.
    'constraints', (SELECT jsonb_agg(jsonb_build_array(k.conname, k.convalidated,
      pg_get_constraintdef(k.oid, :'soe_restore_include_circle_release_state'::boolean AND k.contype = 'c'))
      ORDER BY k.conname COLLATE "C") FROM pg_constraint k WHERE k.conrelid = c.oid),
    'indexes', (SELECT jsonb_agg(jsonb_build_array(pg_get_indexdef(i.indexrelid), i.indisvalid, i.indisready)
      ORDER BY idx.relname COLLATE "C") FROM pg_index i JOIN pg_class idx ON idx.oid = i.indexrelid
      WHERE i.indrelid = c.oid),
    'triggers', (SELECT jsonb_agg(jsonb_build_array(pg_get_triggerdef(t.oid), t.tgenabled)
      ORDER BY t.tgname COLLATE "C") FROM pg_trigger t WHERE t.tgrelid = c.oid AND NOT t.tgisinternal)
  ) || CASE WHEN c.evidence_name IN ('direct_messages', 'book_cohorts', 'book_cohort_members', 'seminar_messages')
    OR c.schema_name = 'soe_wallet_private'
    OR (:'soe_restore_include_circle_release_state'::boolean AND c.relname ~ '^circle_') THEN jsonb_build_object(
    'replicaIdentity', c.relreplident,
    'replicaIdentityIndex', (SELECT idx.relname FROM pg_index i JOIN pg_class idx ON idx.oid = i.indexrelid
      WHERE i.indrelid = c.oid AND i.indisreplident),
    'publications', (SELECT jsonb_agg(jsonb_build_array(
      p.pubname, pg_get_userbyid(p.pubowner), p.puballtables, p.pubinsert, p.pubupdate, p.pubdelete,
      p.pubtruncate, p.pubviaroot, t.attnames, t.rowfilter,
      EXISTS (SELECT 1 FROM pg_publication_rel pr WHERE pr.prpubid = p.oid AND pr.prrelid = c.oid),
      EXISTS (SELECT 1 FROM pg_publication_namespace pn WHERE pn.pnpubid = p.oid AND pn.pnnspid = c.relnamespace)
    ) ORDER BY p.pubname COLLATE "C")
      FROM pg_publication_tables t JOIN pg_publication p ON p.pubname = t.pubname
      WHERE t.schemaname = c.schema_name AND t.tablename = c.relname)
  ) ELSE '{}'::jsonb END
\if :soe_restore_include_circle_release_state
  || CASE WHEN c.evidence_name IN ('book_cohorts', 'book_cohort_members', 'seminar_messages')
    OR c.relname ~ '^circle_' THEN jsonb_build_object('comment', obj_description(c.oid, 'pg_class'))
    ELSE '{}'::jsonb END
\endif
  AS definition
  FROM scoped c
),
principals AS (
  SELECT oid, rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')
\if :soe_restore_include_auth
    OR rolname = 'supabase_auth_admin'
\endif
),
role_roots(oid) AS (
  SELECT oid FROM principals
\if :soe_restore_include_wallet_state
  UNION SELECT nspowner FROM schemas WHERE nspname = 'soe_wallet_private'
  UNION SELECT relowner FROM scoped WHERE schema_name = 'soe_wallet_private'
  UNION SELECT proowner FROM wallet_routines
\endif
\if :soe_restore_include_circle_release_state
  UNION SELECT relowner FROM scoped
    WHERE evidence_name IN ('book_cohorts', 'book_cohort_members', 'seminar_messages') OR relname ~ '^circle_'
  UNION SELECT proowner FROM circle_routines
\endif
\if :soe_restore_include_first_release_state
  UNION SELECT proowner FROM release_service_routines
\endif
),
role_tree(oid) AS (
  SELECT oid FROM role_roots
  UNION
  SELECT m.roleid FROM pg_auth_members m JOIN role_tree r ON m.member = r.oid
),
schema_evidence AS (
  SELECT nspname, jsonb_build_array(pg_get_userbyid(nspowner), a.entries) AS definition
  FROM schemas n LEFT JOIN acls a ON a.kind = 'schema' AND a.object = n.oid AND a.column_no = 0
),
role_evidence AS (
  SELECT jsonb_build_object(
    'schema', (SELECT definition FROM schema_evidence WHERE nspname = 'public'),
\if :soe_restore_include_auth
    'authSchema', (SELECT definition FROM schema_evidence WHERE nspname = 'auth'),
\endif
\if :soe_restore_include_wallet_state
    'walletSchema', (SELECT definition FROM schema_evidence WHERE nspname = 'soe_wallet_private'),
\endif
    'roles', (SELECT jsonb_agg(jsonb_build_array(r.rolname, r.rolsuper, r.rolinherit,
      r.rolbypassrls, r.rolcanlogin, r.rolcreaterole, r.rolcreatedb, r.rolreplication)
      ORDER BY r.rolname COLLATE "C") FROM role_tree t JOIN pg_roles r ON r.oid = t.oid),
    'memberships', (SELECT jsonb_agg(entry ORDER BY entry::text COLLATE "C") FROM (
      SELECT jsonb_build_array(pg_get_userbyid(m.roleid), pg_get_userbyid(m.member),
        pg_get_userbyid(m.grantor), m.admin_option, to_jsonb(m)->'inherit_option', to_jsonb(m)->'set_option') AS entry
      FROM pg_auth_members m JOIN role_tree r ON r.oid = m.member
    ) memberships)
  ) AS definition
)
SELECT jsonb_build_object(
  'format', CASE
    WHEN :'soe_restore_include_first_release_state'::boolean THEN 'soe-privacy-restore-v10'
    WHEN :'soe_restore_include_circle_release_state'::boolean THEN 'soe-privacy-restore-v9'
    WHEN :'soe_restore_include_circles'::boolean AND :'soe_restore_include_wallet_state'::boolean THEN 'soe-privacy-restore-v8'
    WHEN :'soe_restore_include_circles'::boolean THEN 'soe-privacy-restore-v7'
    WHEN :'soe_restore_include_wallet_state'::boolean THEN 'soe-privacy-restore-v6'
    WHEN :'soe_restore_include_auth'::boolean AND :'soe_restore_include_direct_messages'::boolean
      THEN 'soe-privacy-restore-v5'
    WHEN :'soe_restore_include_direct_messages'::boolean THEN 'soe-privacy-restore-v4'
    WHEN :'soe_restore_include_auth'::boolean THEN 'soe-privacy-restore-v3'
    WHEN :'soe_restore_include_rooms'::boolean THEN 'soe-privacy-restore-v2'
    ELSE 'soe-privacy-restore-v1' END,
  'serverMajor', current_setting('server_version_num')::integer / 10000,
  'principals', (SELECT jsonb_agg(rolname ORDER BY rolname COLLATE "C") FROM principals),
  'roles', (SELECT encode(sha256(convert_to(definition::text, 'UTF8')), 'hex') FROM role_evidence),
  'tables', (SELECT jsonb_object_agg(t.name, jsonb_build_object(
    'rows', coalesce(r.rows, 0),
    'data', encode(coalesce(r.digest, sha256(''::bytea)), 'hex'),
    'definition', encode(sha256(convert_to(t.definition::text, 'UTF8')), 'hex')
  )) FROM table_evidence t LEFT JOIN row_evidence r USING (name))
)
\if :soe_restore_include_wallet_state
  || jsonb_build_object('walletRoutines', (SELECT digest FROM wallet_routine_evidence))
\endif
\if :soe_restore_include_circle_release_state
  || jsonb_build_object('circleRoutines', (SELECT digest FROM circle_routine_evidence))
\endif
\if :soe_restore_include_first_release_state
  || jsonb_build_object('releaseServiceRoutines', (SELECT digest FROM release_service_routine_evidence))
\endif
;
