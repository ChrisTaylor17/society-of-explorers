-- Run this in the Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

create table if not exists hub_tasks (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references members(id) on delete cascade,
  wallet_address text,
  title         text not null,
  status        text not null default 'todo',   -- 'todo' | 'doing' | 'done'
  agent_id      text not null default 'socrates',
  created_at    timestamptz default now(),
  completed_at  timestamptz
);

alter table hub_tasks enable row level security;

-- Permissive policy — app enforces member_id filtering
create policy "hub_tasks_open"
  on hub_tasks for all
  using (true)
  with check (true);
