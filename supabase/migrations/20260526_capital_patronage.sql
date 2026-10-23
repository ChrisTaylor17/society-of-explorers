-- Capital engine: durable pledge ledger and project accountability fields.

create table if not exists public.pledge_events (
  id uuid primary key default gen_random_uuid(),
  stripe_session_id text unique,
  stripe_payment_intent_id text,
  stripe_customer_id text,
  pledge_type text not null check (pledge_type in ('92b', 'project')),
  campaign_slug text not null default '92b-founding-node',
  project_id uuid references public.projects(id) on delete set null,
  tier_id text,
  tier_label text not null default 'Pledge',
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'usd',
  patron_email text,
  patron_email_hash text,
  payment_status text not null default 'checkout_created',
  checkout_url text,
  metadata jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pledge_events_campaign
  on public.pledge_events(campaign_slug, pledge_type, payment_status);

create index if not exists idx_pledge_events_project
  on public.pledge_events(project_id, payment_status);

create index if not exists idx_pledge_events_paid_at
  on public.pledge_events(paid_at desc);

alter table public.pledge_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'pledge_events'
      and policyname = 'pledge_events_service_role_all'
  ) then
    create policy "pledge_events_service_role_all"
      on public.pledge_events
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end $$;

alter table public.projects
  add column if not exists use_of_funds text,
  add column if not exists update_log jsonb not null default '[]'::jsonb;
