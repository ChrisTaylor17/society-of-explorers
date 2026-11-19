# 92B Migration Verification

Status: applied to Supabase project `woqvlkeluxkxplpgzdgv` on May 26, 2026.

## Applied Migrations

- `20260526091512` - `capital_patronage`
- `20260526091535` - `capital_pipeline`

## Verified Schema

- `public.pledge_events` exists.
- `public.capital_pipeline_leads` exists.
- `public.capital_pipeline_events` exists.
- `public.projects.use_of_funds` exists.
- `public.projects.update_log` exists.

## Verified Policies

- `pledge_events_service_role_all`
- `capital_pipeline_leads_service_role_all`
- `capital_pipeline_events_service_role_all`

All three policies are scoped to `service_role`.

## Smoke Test

A rollback-only SQL transaction inserted one synthetic pledge row and one synthetic pipeline row, confirmed both existed inside the transaction, then rolled back.

Post-rollback counts:

- Synthetic pledge rows: `0`
- Synthetic pipeline rows: `0`
- Total pledge rows: `0`
- Total pipeline leads: `0`

## App Checks

- `/api/92b/progress` returns source `pledge_events`.
- `/capital` returns `200`.
- `/capital/pipeline` returns `200`.
- Unauthenticated `/api/admin/capital` returns `401`.
- Unauthenticated `/api/admin/capital/pipeline` returns `401`.

## Stripe Boundary

Stripe checkout-session testing was not run because the available Stripe secret is live-mode, not test-mode, and `STRIPE_PRICE_ORACLE` is not present in the checked env files.

Before payment-path testing:

- Add or provide a test-mode `STRIPE_SECRET_KEY`.
- Add test-mode price ids for Seeker, Scholar, Philosopher, and Oracle.
- Use Stripe webhook replay with test-mode events.
