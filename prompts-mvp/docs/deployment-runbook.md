# Prompt Atlas Deployment Runbook

## 1. Prepare Supabase

1. Apply `supabase/migrations/202606180001_prompt_atlas.sql` to the existing SoE project.
2. Apply `supabase/seed.sql`.
3. Confirm `prompts`, `prompt_favorites`, `prompt_runs`, and `prompt_entitlements` exist.
4. Confirm the `reserve_prompt_run` function is executable only by `service_role`.
5. Confirm a public prompt is readable while run and entitlement rows remain private.

## 2. Prepare Stripe

1. Create a recurring product named `Prompt Atlas Pro`.
2. Create a monthly Price at the launch target of `$12 USD`.
3. Set its ID as `STRIPE_PROMPTS_PRO_PRICE_ID`.
4. Enable the Stripe Customer Portal for cancellation and payment-method management.
5. Add a webhook for `/api/billing/webhook` with these events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
6. Store the signing secret as `STRIPE_WEBHOOK_SECRET_PROMPTS`.

## 3. Configure Vercel

Create a Vercel project with this repository and set **Root Directory** to `prompts-mvp`.

The local CLI credential was expired during the initial build. Refresh it before the preview deploy:

```bash
vercel login
vercel whoami
```

Set all secrets separately for Preview and Production. Server-only values must never be exposed with a `NEXT_PUBLIC_` prefix.

Required:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WALLET_SESSION_SECRET` (same value as the existing SoE app)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET_PROMPTS`
- `STRIPE_PROMPTS_PRO_PRICE_ID`
- `NEXT_PUBLIC_SITE_URL`
- One Claude path: `ANTHROPIC_API_KEY`, `AI_GATEWAY_API_KEY`, or Vercel OIDC

Recommended AI Gateway settings:

- `AI_GATEWAY_ENABLED=true`
- `AI_GATEWAY_ANTHROPIC_BASE_URL=https://ai-gateway.vercel.sh`
- `AI_GATEWAY_ANTHROPIC_MODEL=anthropic/claude-sonnet-4.6`

## 4. Deploy Safely

```bash
vercel pull --yes --environment=preview
vercel build
vercel deploy --prebuilt
```

Verify the preview before changing the production domain. Promote the exact tested artifact:

```bash
vercel promote <preview-url>
```

## 5. Post-Deploy Checks

1. Open discovery at desktop and mobile widths.
2. Sign in with email and SIWE independently.
3. Run one prompt and confirm token streaming.
4. Confirm no raw prompt context appears in `prompt_runs`.
5. Complete a Stripe test subscription and confirm the entitlement becomes `explorer_pro`.
6. Cancel through Customer Portal and confirm the entitlement returns to free after the paid period.
7. Inspect Vercel function errors and Stripe webhook delivery logs.

## Rollback

Do not delete the existing SoE app or its domain configuration. Keep the current production deployment available, and use `vercel rollback` or reassign the production alias if Prompt Atlas fails a launch check.
