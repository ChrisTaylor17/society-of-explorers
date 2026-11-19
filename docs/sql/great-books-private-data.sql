-- UNAPPLIED REVIEW CANDIDATE. Do not paste into production without reconciling
-- current schema, grants, views, functions and callers with the recovered source.
-- The authenticated Great Books HTTP routes bind the canonical member server-side.
-- Browser roles therefore need no direct access to bookmarks or saved passages.
-- This script does not provision roles, change role attributes, or delete data.
BEGIN;

DO $$
DECLARE
  relation_name text;
  policy_name text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role' AND rolbypassrls) THEN
    RAISE EXCEPTION 'Existing service role configuration requires reconciliation';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('anon', 'authenticated') AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Browser role configuration requires reconciliation';
  END IF;
  FOREACH relation_name IN ARRAY ARRAY['reading_progress', 'book_highlights'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = relation_name AND c.relkind = 'r'
    ) THEN
      RAISE EXCEPTION 'Expected private Great Books table is unavailable';
    END IF;
    EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE', relation_name);
    policy_name := CASE relation_name WHEN 'reading_progress' THEN 'Progress open' ELSE 'Highlights open' END;
    IF EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = relation_name AND policyname <> policy_name
    ) THEN
      RAISE EXCEPTION 'Unrecognized Great Books policies require reconciliation';
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, relation_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', relation_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', relation_name);
    -- Revoke does not erase privileges inherited from an unrelated role or
    -- separately granted on columns. Stop rather than silently claim isolation.
    IF EXISTS (
      SELECT 1 FROM (VALUES ('anon'), ('authenticated')) AS browser(role_name)
      WHERE has_table_privilege(browser.role_name, format('public.%I', relation_name), 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
         OR has_any_column_privilege(browser.role_name, format('public.%I', relation_name), 'SELECT,INSERT,UPDATE,REFERENCES')
    ) THEN
      RAISE EXCEPTION 'Inherited or column-level Great Books grants require reconciliation';
    END IF;
  END LOOP;
END;
$$;

COMMIT;
