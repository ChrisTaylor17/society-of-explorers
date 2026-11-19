-- Keep provider-started runs billable across process crashes and client disconnects.

alter table public.prompt_runs
  add column if not exists provider_started_at timestamptz;

create or replace function public.mark_prompt_run_started(
  p_run_id uuid,
  p_member_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_started boolean := false;
begin
  if p_run_id is null or p_member_id is null then
    raise exception 'invalid_provider_start';
  end if;

  update public.prompt_runs
  set provider_started_at = now()
  where id = p_run_id
    and member_id = p_member_id
    and status = 'reserved'
    and provider_started_at is null
  returning true into v_started;

  return coalesce(v_started, false);
end;
$$;

-- Only reservations that never reached the AI provider can expire automatically.
create or replace function public.reserve_prompt_run(
  p_member_id uuid,
  p_prompt_id uuid,
  p_input_hash text
)
returns table (run_id uuid, runs_used bigint, runs_limit integer, plan public.prompt_plan)
language plpgsql
security invoker
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

  update public.prompt_runs
  set status = 'failed',
      error_code = 'reservation_expired',
      completed_at = now()
  where member_id = p_member_id
    and status = 'reserved'
    and provider_started_at is null
    and created_at < now() - interval '10 minutes';

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

-- Terminal accounting must fail loudly if the reservation is missing or already terminal.
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
security invoker
set search_path = public
as $$
declare
  v_prompt_id uuid;
  v_updated integer;
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

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'invalid_run_transition';
  end if;

  if p_status = 'completed' and v_prompt_id is not null then
    update public.prompts
    set usage_count = usage_count + 1
    where id = v_prompt_id;
  end if;
end;
$$;

revoke all on function public.mark_prompt_run_started(uuid, uuid) from public;
revoke all on function public.reserve_prompt_run(uuid, uuid, text) from public;
revoke all on function public.finish_prompt_run(uuid, public.prompt_run_status, text, integer, integer, integer, text) from public;
grant execute on function public.mark_prompt_run_started(uuid, uuid) to service_role;
grant execute on function public.reserve_prompt_run(uuid, uuid, text) to service_role;
grant execute on function public.finish_prompt_run(uuid, public.prompt_run_status, text, integer, integer, integer, text) to service_role;
