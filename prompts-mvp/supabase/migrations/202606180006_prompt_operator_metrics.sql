-- Aggregate Prompt Atlas operating signals without returning member-level rows.
-- This function is service-role only and does not select names, emails, wallets,
-- prompt text, context, hashes, Stripe identifiers, or individual run records.

create or replace function public.get_prompt_atlas_operator_metrics()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with boundaries as (
    select
      date_trunc('month', now() at time zone 'utc') at time zone 'utc' as month_start,
      (date_trunc('month', now() at time zone 'utc') + interval '1 month') at time zone 'utc'
        as next_month_start
  ),
  month_runs as (
    select
      r.member_id,
      r.status,
      r.input_tokens,
      r.output_tokens,
      r.provider_started_at,
      r.created_at
    from public.prompt_runs r
    cross join boundaries b
    where r.created_at >= b.month_start
      and r.created_at < b.next_month_start
  ),
  counted_member_runs as (
    select
      r.member_id,
      count(*) as run_count
    from month_runs r
    where r.status = 'completed'
      or (
        r.status = 'reserved'
        and (
          r.provider_started_at is not null
          or r.created_at >= now() - interval '10 minutes'
        )
      )
    group by r.member_id
  ),
  entitlement_totals as (
    select
      count(*) as activated_members,
      count(*) filter (
        where e.plan = 'explorer_pro'
          and e.subscription_status = 'active'
          and (e.current_period_end is null or e.current_period_end > now())
      ) as paid_active_subscriptions,
      count(*) filter (
        where e.plan = 'explorer_pro'
          and e.subscription_status = 'trialing'
          and (e.current_period_end is null or e.current_period_end > now())
      ) as trialing_subscriptions,
      count(*) filter (
        where e.plan = 'explorer_pro'
          and e.subscription_status in ('active', 'trialing')
          and (e.current_period_end is null or e.current_period_end > now())
          and e.cancel_at_period_end
      ) as scheduled_cancellations,
      count(*) filter (
        where e.stripe_subscription_id is not null
          and e.subscription_status in ('past_due', 'unpaid', 'incomplete', 'paused')
      ) as recovery_subscriptions,
      count(*) filter (
        where e.stripe_subscription_id is not null
          and e.subscription_status in ('canceled', 'incomplete_expired')
      ) as restartable_subscriptions
    from public.prompt_entitlements e
  ),
  run_totals as (
    select
      count(distinct r.member_id) filter (
        where r.status = 'completed'
          or (
            r.status = 'reserved'
            and (
              r.provider_started_at is not null
              or r.created_at >= now() - interval '10 minutes'
            )
          )
      ) as active_explorers,
      count(*) filter (where r.status = 'completed') as completed_runs,
      count(*) filter (where r.provider_started_at is not null) as provider_started_runs,
      coalesce(sum(r.input_tokens) filter (where r.status = 'completed'), 0) as input_tokens,
      coalesce(sum(r.output_tokens) filter (where r.status = 'completed'), 0) as output_tokens
    from month_runs r
  ),
  free_limit_totals as (
    select count(*) as free_limit_members
    from counted_member_runs r
    left join public.prompt_entitlements e on e.member_id = r.member_id
    where r.run_count >= 5
      and not coalesce(
        e.plan = 'explorer_pro'
          and e.subscription_status in ('active', 'trialing')
          and (e.current_period_end is null or e.current_period_end > now()),
        false
      )
  ),
  totals as (
    select
      b.month_start,
      b.next_month_start,
      e.activated_members,
      e.paid_active_subscriptions,
      e.trialing_subscriptions,
      e.scheduled_cancellations,
      e.recovery_subscriptions,
      e.restartable_subscriptions,
      r.active_explorers,
      r.completed_runs,
      r.provider_started_runs,
      r.input_tokens,
      r.output_tokens,
      f.free_limit_members,
      round((r.input_tokens::numeric * 3 + r.output_tokens::numeric * 15) / 10000, 2)
        as estimated_model_cost_cents,
      e.paid_active_subscriptions * 1200 as subscription_run_rate_cents,
      round(
        e.paid_active_subscriptions::numeric
          * 1200
          * extract(epoch from (least(now(), b.next_month_start) - b.month_start))
          / nullif(extract(epoch from (b.next_month_start - b.month_start)), 0),
        2
      ) as estimated_mtd_subscription_revenue_cents
    from boundaries b
    cross join entitlement_totals e
    cross join run_totals r
    cross join free_limit_totals f
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'monthStart', t.month_start,
    'nextMonthStart', t.next_month_start,
    'activatedMembers', t.activated_members,
    'activeExplorers', t.active_explorers,
    'paidActiveSubscriptions', t.paid_active_subscriptions,
    'trialingSubscriptions', t.trialing_subscriptions,
    'scheduledCancellations', t.scheduled_cancellations,
    'recoverySubscriptions', t.recovery_subscriptions,
    'restartableSubscriptions', t.restartable_subscriptions,
    'freeLimitMembers', t.free_limit_members,
    'completedRuns', t.completed_runs,
    'providerStartedRuns', t.provider_started_runs,
    'inputTokens', t.input_tokens,
    'outputTokens', t.output_tokens,
    'estimatedModelCostCents', t.estimated_model_cost_cents,
    'subscriptionRunRateCents', t.subscription_run_rate_cents,
    'estimatedMtdSubscriptionRevenueCents', t.estimated_mtd_subscription_revenue_cents,
    'estimatedModelContributionCents',
      t.estimated_mtd_subscription_revenue_cents - t.estimated_model_cost_cents,
    'paidConversionPercent',
      coalesce(
        round(t.paid_active_subscriptions::numeric * 100 / nullif(t.activated_members, 0), 1),
        0
      )
  )
  from totals t;
$$;

revoke all on function public.get_prompt_atlas_operator_metrics() from public;
grant execute on function public.get_prompt_atlas_operator_metrics() to service_role;
