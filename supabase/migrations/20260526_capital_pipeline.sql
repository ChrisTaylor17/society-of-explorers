-- Capital pipeline: private outreach approval and pledge-intent tracking.
-- This does not send messages. It creates an operator-only CRM surface for approved outreach.

create table if not exists public.capital_pipeline_leads (
  id uuid primary key default gen_random_uuid(),
  display_label text not null,
  relationship_context text,
  segment text not null default 'warm_believer'
    check (segment in ('warm_believer', 'boston_local', 'operator_builder', 'creator_philosopher', 'past_lead', 'partner')),
  channel text not null default 'email'
    check (channel in ('email', 'text', 'dm', 'call', 'in_person', 'other')),
  draft_key text not null default 'architect_patron'
    check (draft_key in ('architect_patron', 'builder_operator', 'creator_philosopher', 'boston_local', 'follow_up')),
  status text not null default 'candidate'
    check (status in ('candidate', 'drafted', 'approved', 'sent', 'responded', 'call', 'pledged', 'closed')),
  pledge_status text not null default 'none'
    check (pledge_status in ('none', 'interested', 'committed', 'paid', 'deferred')),
  pledge_amount_cents integer not null default 0 check (pledge_amount_cents >= 0),
  objection text,
  next_action_at timestamptz,
  source_utm text,
  notes_redacted text,
  contact_hash text,
  approved_at timestamptz,
  sent_at timestamptz,
  responded_at timestamptz,
  closed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_capital_pipeline_leads_status
  on public.capital_pipeline_leads(status, next_action_at);

create index if not exists idx_capital_pipeline_leads_segment
  on public.capital_pipeline_leads(segment, status);

create index if not exists idx_capital_pipeline_leads_pledge
  on public.capital_pipeline_leads(pledge_status, pledge_amount_cents);

create table if not exists public.capital_pipeline_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.capital_pipeline_leads(id) on delete cascade,
  event_type text not null,
  event_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_capital_pipeline_events_lead
  on public.capital_pipeline_events(lead_id, created_at desc);

alter table public.capital_pipeline_leads enable row level security;
alter table public.capital_pipeline_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'capital_pipeline_leads'
      and policyname = 'capital_pipeline_leads_service_role_all'
  ) then
    create policy "capital_pipeline_leads_service_role_all"
      on public.capital_pipeline_leads
      for all
      to service_role
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'capital_pipeline_events'
      and policyname = 'capital_pipeline_events_service_role_all'
  ) then
    create policy "capital_pipeline_events_service_role_all"
      on public.capital_pipeline_events
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end $$;
