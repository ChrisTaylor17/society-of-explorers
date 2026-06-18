-- Prompt Atlas: privacy-first discovery, execution accounting, and subscriptions.
-- This migration targets the existing Society of Explorers Supabase project.

create extension if not exists pgcrypto;

do $$ begin
  create type public.prompt_visibility as enum ('public', 'unlisted', 'private');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.prompt_run_status as enum ('reserved', 'completed', 'failed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.prompt_plan as enum ('free', 'explorer_pro');
exception when duplicate_object then null;
end $$;

create table if not exists public.prompts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 120),
  description text not null check (char_length(description) between 10 and 320),
  category text not null check (category in ('create', 'think', 'work', 'reflect')),
  prompt_text text not null check (char_length(prompt_text) between 10 and 8000),
  created_by uuid references public.members(id) on delete set null,
  usage_count bigint not null default 0 check (usage_count >= 0),
  slug text not null unique,
  tags text[] not null default '{}',
  visibility public.prompt_visibility not null default 'public',
  is_featured boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prompt_favorites (
  member_id uuid not null references public.members(id) on delete cascade,
  prompt_id uuid not null references public.prompts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (member_id, prompt_id)
);

create table if not exists public.prompt_votes (
  member_id uuid not null references public.members(id) on delete cascade,
  prompt_id uuid not null references public.prompts(id) on delete cascade,
  value smallint not null default 1 check (value = 1),
  created_at timestamptz not null default now(),
  primary key (member_id, prompt_id)
);

create table if not exists public.prompt_entitlements (
  member_id uuid primary key references public.members(id) on delete cascade,
  plan public.prompt_plan not null default 'free',
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  subscription_status text not null default 'inactive',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prompt_runs (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  prompt_id uuid references public.prompts(id) on delete set null,
  input_hash text not null check (char_length(input_hash) = 64),
  status public.prompt_run_status not null default 'reserved',
  model text,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists prompts_discovery_idx
  on public.prompts (visibility, category, published_at desc);
create index if not exists prompts_trending_idx
  on public.prompts (usage_count desc, published_at desc)
  where visibility = 'public';
create index if not exists prompt_runs_member_month_idx
  on public.prompt_runs (member_id, created_at desc)
  where status in ('reserved', 'completed');
create index if not exists prompt_favorites_prompt_idx
  on public.prompt_favorites (prompt_id, created_at desc);

create or replace function public.set_prompt_atlas_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists prompts_set_updated_at on public.prompts;
create trigger prompts_set_updated_at
before update on public.prompts
for each row execute function public.set_prompt_atlas_updated_at();

drop trigger if exists prompt_entitlements_set_updated_at on public.prompt_entitlements;
create trigger prompt_entitlements_set_updated_at
before update on public.prompt_entitlements
for each row execute function public.set_prompt_atlas_updated_at();

create or replace function public.current_prompt_member_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.members
  where supabase_auth_id = auth.uid()
  limit 1;
$$;

alter table public.prompts enable row level security;
alter table public.prompt_favorites enable row level security;
alter table public.prompt_votes enable row level security;
alter table public.prompt_entitlements enable row level security;
alter table public.prompt_runs enable row level security;

drop policy if exists "Published prompts are discoverable" on public.prompts;
create policy "Published prompts are discoverable"
on public.prompts for select
using (
  (visibility = 'public' and published_at is not null and published_at <= now())
  or created_by = public.current_prompt_member_id()
);

drop policy if exists "Members create their own prompts" on public.prompts;
create policy "Members create their own prompts"
on public.prompts for insert
with check (created_by = public.current_prompt_member_id());

drop policy if exists "Members update their own prompts" on public.prompts;
create policy "Members update their own prompts"
on public.prompts for update
using (created_by = public.current_prompt_member_id())
with check (created_by = public.current_prompt_member_id());

drop policy if exists "Members delete their own prompts" on public.prompts;
create policy "Members delete their own prompts"
on public.prompts for delete
using (created_by = public.current_prompt_member_id());

drop policy if exists "Members manage their favorites" on public.prompt_favorites;
create policy "Members manage their favorites"
on public.prompt_favorites for all
using (member_id = public.current_prompt_member_id())
with check (member_id = public.current_prompt_member_id());

drop policy if exists "Members manage their votes" on public.prompt_votes;
create policy "Members manage their votes"
on public.prompt_votes for all
using (member_id = public.current_prompt_member_id())
with check (member_id = public.current_prompt_member_id());

drop policy if exists "Members read their entitlement" on public.prompt_entitlements;
create policy "Members read their entitlement"
on public.prompt_entitlements for select
using (member_id = public.current_prompt_member_id());

drop policy if exists "Members read aggregate run metadata" on public.prompt_runs;
create policy "Members read aggregate run metadata"
on public.prompt_runs for select
using (member_id = public.current_prompt_member_id());

-- Atomically reserves one run so concurrent tabs cannot bypass the free limit.
-- Personal prompt/context text is never stored; callers provide only a SHA-256 hash.
create or replace function public.reserve_prompt_run(
  p_member_id uuid,
  p_prompt_id uuid,
  p_input_hash text
)
returns table (run_id uuid, runs_used bigint, runs_limit integer, plan public.prompt_plan)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.prompt_plan := 'free';
  v_status text := 'inactive';
  v_period_end timestamptz;
  v_used bigint;
  v_limit integer := 5;
  v_run_id uuid;
  v_recent bigint;
begin
  if p_member_id is null or p_input_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_run_reservation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_member_id::text, 0));

  select count(*) into v_recent
  from public.prompt_runs r
  where r.member_id = p_member_id
    and r.status in ('reserved', 'completed')
    and r.created_at >= now() - interval '1 hour';

  if v_recent >= 30 then
    raise exception 'prompt_rate_limited';
  end if;

  insert into public.prompt_entitlements (member_id)
  values (p_member_id)
  on conflict (member_id) do nothing;

  select e.plan, e.subscription_status, e.current_period_end
  into v_plan, v_status, v_period_end
  from public.prompt_entitlements e
  where e.member_id = p_member_id;

  if v_plan = 'explorer_pro'
    and v_status in ('active', 'trialing')
    and (v_period_end is null or v_period_end > now()) then
    v_limit := null;
  end if;

  select count(*) into v_used
  from public.prompt_runs r
  where r.member_id = p_member_id
    and r.status in ('reserved', 'completed')
    and r.created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc';

  if v_limit is not null and v_used >= v_limit then
    raise exception 'prompt_quota_exceeded';
  end if;

  insert into public.prompt_runs (member_id, prompt_id, input_hash)
  values (p_member_id, p_prompt_id, p_input_hash)
  returning id into v_run_id;

  return query select v_run_id, v_used + 1, v_limit, v_plan;
end;
$$;

create or replace function public.finish_prompt_run(
  p_run_id uuid,
  p_status public.prompt_run_status,
  p_model text default null,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_latency_ms integer default null,
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prompt_id uuid;
begin
  if p_status not in ('completed', 'failed') then
    raise exception 'invalid_terminal_run_status';
  end if;

  update public.prompt_runs
  set status = p_status,
      model = p_model,
      input_tokens = p_input_tokens,
      output_tokens = p_output_tokens,
      latency_ms = p_latency_ms,
      error_code = p_error_code,
      completed_at = now()
  where id = p_run_id and status = 'reserved'
  returning prompt_id into v_prompt_id;

  if p_status = 'completed' and v_prompt_id is not null then
    update public.prompts
    set usage_count = usage_count + 1
    where id = v_prompt_id;
  end if;
end;
$$;

revoke all on function public.reserve_prompt_run(uuid, uuid, text) from public;
revoke all on function public.finish_prompt_run(uuid, public.prompt_run_status, text, integer, integer, integer, text) from public;
grant execute on function public.reserve_prompt_run(uuid, uuid, text) to service_role;
grant execute on function public.finish_prompt_run(uuid, public.prompt_run_status, text, integer, integer, integer, text) to service_role;

create or replace view public.prompt_community_leaderboard
with (security_invoker = true)
as
select
  p.id,
  p.slug,
  p.title,
  p.description,
  p.category,
  p.usage_count,
  count(distinct f.member_id) as favorite_count,
  count(distinct v.member_id) as vote_count,
  (p.usage_count + count(distinct f.member_id) * 4 + count(distinct v.member_id) * 6) as momentum
from public.prompts p
left join public.prompt_favorites f on f.prompt_id = p.id
left join public.prompt_votes v on v.prompt_id = p.id
where p.visibility = 'public' and p.published_at is not null and p.published_at <= now()
group by p.id;

grant select on public.prompt_community_leaderboard to anon, authenticated;
