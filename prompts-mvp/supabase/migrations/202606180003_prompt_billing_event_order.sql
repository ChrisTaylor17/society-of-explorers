-- Prevent delayed Stripe events from overwriting newer subscription state.

alter table public.prompt_entitlements
  add column if not exists stripe_event_created bigint,
  add column if not exists stripe_event_id text;

create or replace function public.sync_prompt_entitlement(
  p_member_id uuid,
  p_plan public.prompt_plan,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_stripe_price_id text,
  p_subscription_status text,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_stripe_event_created bigint,
  p_stripe_event_id text
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_applied boolean := false;
begin
  if p_member_id is null
    or p_stripe_customer_id is null
    or p_stripe_subscription_id is null
    or p_stripe_price_id is null
    or p_subscription_status is null
    or p_stripe_event_created is null
    or p_stripe_event_created < 0
    or p_stripe_event_id is null
    or char_length(p_stripe_event_id) > 255 then
    raise exception 'invalid_prompt_entitlement_sync';
  end if;

  insert into public.prompt_entitlements (
    member_id,
    plan,
    stripe_customer_id,
    stripe_subscription_id,
    stripe_price_id,
    subscription_status,
    current_period_end,
    cancel_at_period_end,
    stripe_event_created,
    stripe_event_id
  )
  values (
    p_member_id,
    p_plan,
    p_stripe_customer_id,
    p_stripe_subscription_id,
    p_stripe_price_id,
    p_subscription_status,
    p_current_period_end,
    p_cancel_at_period_end,
    p_stripe_event_created,
    p_stripe_event_id
  )
  on conflict (member_id) do update
  set plan = excluded.plan,
      stripe_customer_id = excluded.stripe_customer_id,
      stripe_subscription_id = excluded.stripe_subscription_id,
      stripe_price_id = excluded.stripe_price_id,
      subscription_status = excluded.subscription_status,
      current_period_end = excluded.current_period_end,
      cancel_at_period_end = excluded.cancel_at_period_end,
      stripe_event_created = excluded.stripe_event_created,
      stripe_event_id = excluded.stripe_event_id
  where public.prompt_entitlements.stripe_event_created is null
    or excluded.stripe_event_created >= public.prompt_entitlements.stripe_event_created
  returning true into v_applied;

  return coalesce(v_applied, false);
end;
$$;

revoke all on function public.sync_prompt_entitlement(
  uuid,
  public.prompt_plan,
  text,
  text,
  text,
  text,
  timestamptz,
  boolean,
  bigint,
  text
) from public;
grant execute on function public.sync_prompt_entitlement(
  uuid,
  public.prompt_plan,
  text,
  text,
  text,
  text,
  timestamptz,
  boolean,
  bigint,
  text
) to service_role;
