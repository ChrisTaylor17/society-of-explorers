-- Daily email subscription + unsubscribe token system
create table if not exists daily_email_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  unsubscribe_token uuid not null default gen_random_uuid() unique,
  subscribed_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  last_sent_at timestamptz,
  last_sent_question_id uuid references daily_questions(id),
  created_at timestamptz not null default now()
);

create unique index if not exists daily_email_subscriptions_member_active
  on daily_email_subscriptions(member_id) where unsubscribed_at is null;

create index if not exists daily_email_subscriptions_active
  on daily_email_subscriptions(unsubscribed_at) where unsubscribed_at is null;

alter table daily_email_subscriptions enable row level security;

create policy "Server full access on daily_email_subscriptions"
  on daily_email_subscriptions for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "Members read own subscription"
  on daily_email_subscriptions for select
  using (member_id in (select id from members where supabase_auth_id = auth.uid()));
