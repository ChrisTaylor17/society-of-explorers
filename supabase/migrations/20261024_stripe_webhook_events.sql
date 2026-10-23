-- Stripe webhook idempotency: one row per fully processed Stripe event id.
-- Written by app/api/stripe/webhook/route.ts after a handler succeeds.
-- Service role only; no client access.
create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  livemode boolean not null default false,
  stripe_created_at timestamptz,
  outcome text not null default 'processed',
  processed_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;
revoke all on public.stripe_webhook_events from anon, authenticated;

create index if not exists stripe_webhook_events_processed_at_idx
  on public.stripe_webhook_events (processed_at desc);
