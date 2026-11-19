-- Read-only checks AFTER applying 20261024_stripe_webhook_events.sql.
-- Expect: one row with rls_enabled = true.
select c.relname, c.relrowsecurity as rls_enabled
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'stripe_webhook_events';
-- Expect: no rows. anon/authenticated have no privileges; there are no policies, so only service_role can read or write.
select grantee, privilege_type from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'stripe_webhook_events'
   and grantee in ('anon', 'authenticated');
select policyname from pg_policies where schemaname = 'public' and tablename = 'stripe_webhook_events';
-- After the next real Stripe event, expect rows here (webhook idempotency active).
select event_type, outcome, livemode, processed_at from public.stripe_webhook_events
 order by processed_at desc limit 5;
