-- Run this in the Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

create table if not exists merch_suggestions (
  id            uuid primary key default gen_random_uuid(),
  thinker_id    text not null,
  product_type  text not null default 'pending',
  name          text not null,
  tagline       text not null default '',
  price         numeric not null default 0,
  raw_suggestion text,                            -- full AI-generated text for review
  mockup_prompt  text,                            -- visual brief for image gen (Runway/DALL-E)
  status        text not null default 'pending',  -- pending | approved | live | rejected
  created_at    timestamptz default now(),
  suggested_by  text                              -- member id or 'ai'
);

alter table merch_suggestions enable row level security;

create policy "merch_suggestions_open"
  on merch_suggestions for all
  using (true)
  with check (true);

create index if not exists idx_merch_suggestions_status    on merch_suggestions(status);
create index if not exists idx_merch_suggestions_thinker   on merch_suggestions(thinker_id);
create index if not exists idx_merch_suggestions_created   on merch_suggestions(created_at desc);
