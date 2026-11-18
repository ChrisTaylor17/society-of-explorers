-- Local candidate only. Read-only catalog report; it reads no user rows and changes nothing.
-- Run as the owner of the relations in schema public before reviewing
-- public-browser-access-containment-apply.sql. Running it against the hosted project
-- is a production read action that needs its own approval.
--
-- The report also shows what the apply script cannot close or would stop on:
--   * browserGrantsNotIssuedByOwner: a browser grant made by another grantor survives an
--     owner revoke, so the apply would abort and change nothing;
--   * browserGrantOptions: a browser role holding a grant option; if it granted onward,
--     the apply's revoke would fail and change nothing;
--   * ownerRunRoutinesBrowserCanExecute: SECURITY DEFINER routines in schema public that
--     a browser role may call. Table revocation does not reach these.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

DO $preflight$
DECLARE
  browser_oids oid[];
BEGIN
  SELECT array_agg(oid ORDER BY rolname) INTO browser_oids FROM pg_roles
  WHERE rolname IN ('anon', 'authenticated') AND NOT rolsuper AND NOT rolbypassrls;
  IF cardinality(browser_oids) IS DISTINCT FROM 2
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role' AND rolbypassrls AND NOT rolsuper)
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
END
$preflight$;

WITH browser AS (
  SELECT array_agg(oid) AS oids FROM pg_roles WHERE rolname IN ('anon', 'authenticated')
), relations AS (
  SELECT c.oid, c.relname, c.relkind, c.relrowsecurity, c.relowner, c.relacl
  FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
), grants AS (
  SELECT r.oid, a.grantor, a.grantee, a.is_grantable, r.relowner
  FROM relations r CROSS JOIN LATERAL aclexplode(COALESCE(r.relacl,
    acldefault(CASE WHEN r.relkind = 'S' THEN 's' ELSE 'r' END::"char", r.relowner))) a, browser b
  WHERE a.grantee = 0 OR a.grantee = ANY (b.oids)
  UNION ALL
  SELECT r.oid, a.grantor, a.grantee, a.is_grantable, r.relowner
  FROM relations r JOIN pg_attribute att ON att.attrelid = r.oid AND att.attacl IS NOT NULL AND NOT att.attisdropped
    CROSS JOIN LATERAL aclexplode(att.attacl) a, browser b
  WHERE a.grantee = 0 OR a.grantee = ANY (b.oids)
)
SELECT json_build_object(
  'result', 'public_browser_access_preflight_passed',
  'relations', (SELECT count(*) FROM relations),
  'ordinaryTables', (SELECT count(*) FROM relations WHERE relkind = 'r'),
  'relationsWithBrowserGrants', (SELECT count(DISTINCT oid) FROM grants),
  'tablesSignedOutCanTruncate', (SELECT count(*) FROM relations WHERE relkind IN ('r', 'p') AND has_table_privilege('anon', oid, 'TRUNCATE')),
  'tablesWithRowSecurityOff', (SELECT count(*) FROM relations WHERE relkind IN ('r', 'p') AND NOT relrowsecurity),
  'browserGrantsNotIssuedByOwner', (SELECT count(*) FROM grants WHERE grantor <> relowner),
  'browserGrantOptions', (SELECT count(*) FROM grants WHERE is_grantable),
  'ownerRunRoutinesBrowserCanExecute', (SELECT COALESCE(json_agg(p.oid::regprocedure::text ORDER BY p.oid::regprocedure::text), '[]'::json)
    FROM pg_proc p LEFT JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e' AND d.classid = 'pg_proc'::regclass
    WHERE p.pronamespace = 'public'::regnamespace AND d.objid IS NULL AND p.prosecdef
      AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))),
  'stagedReceiptsPresent', (SELECT COALESCE(json_agg(relname ORDER BY relname), '[]'::json) FROM relations
    WHERE relkind = 'r' AND relname LIKE 'soe\_%\_v1\_state'),
  'receiptPresent', to_regclass('public.soe_public_browser_containment_v1_state') IS NOT NULL
) AS report;
ROLLBACK;
