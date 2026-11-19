-- Align the paid Prompt Atlas contract with the launch offer:
-- free members receive 5 runs per calendar month, while Pro members have
-- unlimited monthly runs bounded by the existing 10 starts/hour fair-use pace.

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
  v_stored_plan public.prompt_plan := 'free';
  v_effective_plan public.prompt_plan := 'free';
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
    and r.created_at >= now() - interval '1 hour';

  if v_recent >= 10 then
    raise exception 'prompt_rate_limited';
  end if;

  insert into public.prompt_entitlements (member_id)
  values (p_member_id)
  on conflict (member_id) do nothing;

  select e.plan, e.subscription_status, e.current_period_end
  into v_stored_plan, v_status, v_period_end
  from public.prompt_entitlements e
  where e.member_id = p_member_id;

  if v_stored_plan = 'explorer_pro'
    and v_status in ('active', 'trialing')
    and (v_period_end is null or v_period_end > now()) then
    v_effective_plan := 'explorer_pro';
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

  return query select v_run_id, v_used + 1, v_limit, v_effective_plan;
end;
$$;

revoke all on function public.reserve_prompt_run(uuid, uuid, text) from public;
grant execute on function public.reserve_prompt_run(uuid, uuid, text) to service_role;
