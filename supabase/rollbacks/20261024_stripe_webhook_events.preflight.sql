-- Read-only preflight for supabase/migrations/20261024_stripe_webhook_events.sql.
-- Run this BEFORE applying and keep the output as the "schema before" record.
-- Expected: the first query returns no rows. If it returns a row, STOP: the table already
-- exists, so the migration's ALTER/REVOKE would act on an existing table.
select table_schema, table_name from information_schema.tables
 where table_schema = 'public' and table_name = 'stripe_webhook_events';

select indexname from pg_indexes
 where schemaname = 'public' and indexname = 'stripe_webhook_events_processed_at_idx';

-- Snapshot of public tables (names + RLS flag) for the before/after record.
select c.relname as table_name, c.relrowsecurity as rls_enabled
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
 order by 1;
