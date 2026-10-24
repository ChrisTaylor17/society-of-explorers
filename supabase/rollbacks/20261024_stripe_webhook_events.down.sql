-- Rollback for supabase/migrations/20261024_stripe_webhook_events.sql.
-- Kept outside supabase/migrations so the Supabase CLI never runs it as a forward migration.
-- Safe: the webhook treats a missing table as "idempotency unavailable" and keeps working
-- (lib/payments/webhookIdempotency.ts). Only the processed-event log is lost.
drop index if exists public.stripe_webhook_events_processed_at_idx;
drop table if exists public.stripe_webhook_events;
