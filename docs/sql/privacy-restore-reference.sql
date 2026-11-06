-- Run inside the owner-approved export's repeatable-read, read-only transaction.
-- The single JSON row is private recovery material.
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

WITH RECURSIVE relations(name) AS (
  VALUES ('members'), ('reading_progress'), ('book_highlights'),
    ('great_books_progress'), ('great_books_highlights'), ('book_reflections'), ('thinker_memory'),
    ('daily_questions'), ('matched_conversations'), ('practice_reflections'), ('question_responses')
),
scoped AS (
  SELECT c.* FROM pg_class c JOIN relations r ON c.relname = r.name
  WHERE c.relnamespace = 'public'::regnamespace
    AND c.relkind = 'r' AND NOT c.relispartition AND NOT c.relhassubclass
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
acl_sources(kind, object, column_no, permissions) AS (
  SELECT 'relation', oid, 0, coalesce(relacl, acldefault('r', relowner)) FROM scoped
  UNION ALL
  SELECT 'relation', c.oid, a.attnum, a.attacl FROM scoped c JOIN pg_attribute a ON a.attrelid = c.oid
  WHERE a.attnum > 0 AND NOT a.attisdropped
  UNION ALL
  SELECT 'schema', oid, 0, coalesce(nspacl, acldefault('n', nspowner)) FROM pg_namespace WHERE nspname = 'public'
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
table_evidence AS (
  SELECT c.relname AS name, jsonb_build_object(
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
      FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname),
    'constraints', (SELECT jsonb_agg(jsonb_build_array(k.conname, k.convalidated, pg_get_constraintdef(k.oid))
      ORDER BY k.conname COLLATE "C") FROM pg_constraint k WHERE k.conrelid = c.oid),
    'indexes', (SELECT jsonb_agg(jsonb_build_array(pg_get_indexdef(i.indexrelid), i.indisvalid, i.indisready)
      ORDER BY idx.relname COLLATE "C") FROM pg_index i JOIN pg_class idx ON idx.oid = i.indexrelid
      WHERE i.indrelid = c.oid),
    'triggers', (SELECT jsonb_agg(jsonb_build_array(pg_get_triggerdef(t.oid), t.tgenabled)
      ORDER BY t.tgname COLLATE "C") FROM pg_trigger t WHERE t.tgrelid = c.oid AND NOT t.tgisinternal)
  ) AS definition
  FROM scoped c
),
principals AS (
  SELECT oid, rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')
),
role_tree(oid) AS (
  SELECT oid FROM principals
  UNION
  SELECT m.roleid FROM pg_auth_members m JOIN role_tree r ON m.member = r.oid
),
role_evidence AS (
  SELECT jsonb_build_object(
    'schema', (SELECT jsonb_build_array(pg_get_userbyid(nspowner),
      (SELECT entries FROM acls WHERE kind = 'schema' AND object = oid AND column_no = 0))
      FROM pg_namespace WHERE nspname = 'public'),
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
  'format', 'soe-privacy-restore-v1',
  'serverMajor', current_setting('server_version_num')::integer / 10000,
  'principals', (SELECT jsonb_agg(rolname ORDER BY rolname COLLATE "C") FROM principals),
  'roles', (SELECT encode(sha256(convert_to(definition::text, 'UTF8')), 'hex') FROM role_evidence),
  'tables', (SELECT jsonb_object_agg(t.name, jsonb_build_object(
    'rows', coalesce(r.rows, 0),
    'data', encode(coalesce(r.digest, sha256(''::bytea)), 'hex'),
    'definition', encode(sha256(convert_to(t.definition::text, 'UTF8')), 'hex')
  )) FROM table_evidence t LEFT JOIN row_evidence r USING (name))
);
