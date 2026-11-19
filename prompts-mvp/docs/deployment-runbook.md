# Prompt Atlas Deployment Runbook

## 1. Prepare Supabase

1. Apply `supabase/migrations/202606180001_prompt_atlas.sql` to the existing SoE project.
2. Apply `supabase/migrations/202606180002_prompt_run_recovery.sql`.
3. Apply `supabase/migrations/202606180003_prompt_billing_event_order.sql`.
4. Apply `supabase/migrations/202606180004_provider_run_accounting.sql`.
5. Apply `supabase/migrations/202606180005_prompt_plan_limits.sql`.
6. Apply `supabase/migrations/202606180006_prompt_operator_metrics.sql`.
7. Apply `supabase/migrations/202606180007_prompt_catalog_expansion.sql`.
8. Apply `supabase/migrations/202606180008_unlimited_pro_runs.sql`.
9. Apply `supabase/seed.sql`.
10. Confirm `prompts`, `prompt_favorites`, `prompt_runs`, and `prompt_entitlements` exist.
11. Confirm `reserve_prompt_run`, `mark_prompt_run_started`, `finish_prompt_run`, `sync_prompt_entitlement`, and `get_prompt_atlas_operator_metrics` are executable only by `service_role`.
12. Confirm a public prompt is readable while run and entitlement rows remain private.
13. From `/prompts-mvp`, run `npm run db:readiness:smoke` against the production Supabase project. It must pass before live prompt execution, webhook fulfillment, or `/operator` are considered production-ready. The smoke creates a temporary active Pro member, reserves one run, and fails unless the reservation returns `runs_limit: null` for the unlimited paid contract.

If the Supabase CLI is not linked, apply the SQL in the Supabase dashboard SQL editor in the exact order above. To apply only the pending unlimited-Pro migration from the terminal instead, install either `SUPABASE_ACCESS_TOKEN` with a linked project or a direct Postgres connection string, then run:

```bash
npm run db:apply:unlimited-pro -- --apply
```

Without `--apply`, the helper is a dry run and makes no database changes. The service-role API key is enough for validation but not schema DDL.

## 2. Prepare Stripe

1. Create a recurring product named `Prompt Atlas Pro`.
2. Create a monthly Price at the launch target of `$12 USD`.
3. Set its ID as `STRIPE_PROMPTS_PRO_PRICE_ID`.
4. Confirm the Price is active, fixed `per_unit`, `$12 USD`, monthly with interval count `1`, licensed rather than metered, and does not allow a custom unit amount.
5. Enable the Stripe Customer Portal for cancellation and payment-method management.
6. Add a webhook for `/api/billing/webhook` with these events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
7. Store the signing secret as `STRIPE_WEBHOOK_SECRET_PROMPTS`.
8. From `/prompts-mvp`, run `npm run stripe:live:smoke` after live Stripe env values are available. It must pass before promoting a paid launch because it verifies the Price, webhook, and Customer Portal without creating customers or charges.

## 3. Configure Vercel

Create a Vercel project with this repository and set **Root Directory** to `prompts-mvp`.

The local CLI credential was expired during the initial build. Refresh it before the preview deploy:

```bash
vercel login
vercel whoami
```

Set all secrets separately for Preview and Production. Server-only values must never be exposed with a `NEXT_PUBLIC_` prefix. Vercel may pull sensitive values into local files as blank placeholders; verify deployment configuration with `npx vercel env ls`, and verify local execution with local secret files or exported shell env.

Required:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SOE_ADMIN_EMAILS` (comma-separated server-only allowlist for `/operator`)
- `WALLET_SESSION_SECRET` (same value as the existing SoE app)
- `PROMPT_INPUT_HASH_SECRET` (recommended dedicated HMAC key; falls back to `WALLET_SESSION_SECRET`)
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

Before any preview billing check, verify that local development cannot create live-mode Stripe sessions:

```bash
npm run check:env
npm run vercel:env:smoke
npm run db:readiness:smoke
npm run stripe:live:smoke
npm run community:growth:smoke
npm run prompt:catalog:smoke
npm run prompt:packs:smoke
npm run prompt:share:smoke
npm run migration:helper:smoke
npm run operator:smoke -- --list
npm run operator:smoke
npm run operator:smoke -- --with-ui
```

The database readiness smoke must pass after migrations are installed and can also be included with `npm run operator:smoke -- --with-db-readiness`. It verifies the unlimited Pro database contract, so a failure that says `active Pro reservation must return null runs_limit` means `202606180008_unlimited_pro_runs.sql` is not applied to that Supabase project yet. `npm run stripe:live:smoke` can be included with `npm run operator:smoke -- --with-stripe-live` when you want the external Stripe setup in the same manifest. `npm run vercel:env:smoke` must pass before preview transaction testing; it reads Vercel env metadata only and reports missing Production/Preview names without printing values. The `--list` mode prints the local plan without running child scripts. The default operator manifest includes checkout safety, upgrade-intent continuity, billing lifecycle and integrity, aggregate operator metrics, provider accounting, privacy, community DTO, community growth, prompt catalog, prompt packs, share links, and plan economics guards. The `--with-ui` mode adds the browser screenshot smoke and may launch or reuse a local dev server. A newly added smoke script must be explicitly classified as default or opt-in before preview work continues, and unknown operator arguments fail before any child script runs. After a preview deploy, run `PROMPT_ATLAS_BASE_URL=<preview-url> npm run ui:smoke` to reuse the same discovery, workspace, prompt-pack revenue loop, Pro dialog, and mobile overflow checks against Vercel.

After Claude and Supabase production credentials are installed, run `PROMPT_ATLAS_BASE_URL=<preview-or-production-url> npm run execute:live:smoke`. It creates a temporary wallet member, calls the live execution route once, verifies the streaming events and token accounting, then deletes the temporary member. This check reaches the AI provider, so keep it explicit rather than part of every default smoke run.

Use Stripe test-mode credentials for localhost and preview transaction tests. Do not pair an `sk_live_` secret with a localhost request or return URL.

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

1. Open discovery at desktop and mobile widths. Confirm signed-out and ordinary free members can open `View Pro` from the header, restart-eligible canceled or expired-incomplete members see `Restart Pro` plus billing management, and Pro or recovery-state subscribers remain management-only.
2. On desktop and mobile discovery, click a Revenue path step such as `Price this offer without apology` or `Find my first ten customers` and confirm the focused prompt changes without navigation, tracking, or checkout. From the workspace, click a Launch path step and confirm the prompt editor changes in place.
3. Open Packs, inspect Revenue Launch, Community Market, and Sovereignty Audit, click the revenue-loop selector, then click a pack step and confirm it opens the editable workspace without exposing raw prompt text, member data, or Stripe data.
4. Open Community, switch the leaderboard between momentum, runs, saves, and signals, and confirm category demand cards use only aggregate prompt activity.
5. Sign in, send and remove one prompt signal, then confirm `/api/community` changes only aggregate `vote_count`/`momentum` and never returns member identifiers.
6. Run `npm run db:readiness:smoke` and confirm every table/view/RPC contract passes.
7. Run `npm run stripe:live:smoke` and confirm the live Price, webhook, and Customer Portal are ready.
8. Run `npm run vercel:env:smoke` and confirm Production plus Preview env names are present with server secrets marked sensitive.
9. Open `/p/create-a-one-page-business`, confirm it renders the selected prompt directly, and inspect the page metadata plus OG image for the prompt title/description without raw prompt text, creator IDs, member IDs, or Stripe identifiers.
10. From the signed-out Pro dialog, choose `Sign in to upgrade` with email, Google, and SIWE independently. Confirm each successful sign-in returns to the Pro dialog without starting checkout automatically, and confirm cancelling sign-in removes the local upgrade-intent marker.
11. Run `PROMPT_ATLAS_BASE_URL=<production-url> npm run execute:live:smoke` and confirm token streaming plus accounting succeeds.
12. Confirm no raw prompt context appears in `prompt_runs`.
13. Complete a Stripe test subscription and confirm the entitlement becomes `explorer_pro`.
14. Confirm `/api/auth/session` reports `runsLimit: null` for active Pro members and the UI presents unlimited monthly runs plus the `10` starts/hour pace before checkout.
15. Exhaust a free test allowance and confirm the workspace primary action changes to `View Pro to keep exploring` before any new execution request. Confirm a restart-eligible former subscriber sees `Restart Pro to keep exploring`, while a member with a recoverable blocked subscription sees `Manage plan to keep exploring` and routes through existing-plan recovery.
16. Attempt a second checkout from the same member and confirm the API returns private `409 subscription_exists` without creating another Checkout Session.
17. Put a test subscription into a recoverable blocked state and confirm the upgrade dialog offers `Manage existing plan` rather than attempting another Checkout Session.
18. Cancel a test subscription through the end of its paid period, then confirm `Restart Pro` explains the old plan is inactive, shows current terms, and creates no Checkout Session until the explicit restart button is chosen.
19. Cancel through Customer Portal and confirm the entitlement returns to free after the paid period.
20. Resend an older subscription update from Stripe Workbench and confirm the webhook retrieves current subscription state instead of restoring stale access.
21. Confirm the checkout return notice removes the `billing` query marker and shows Pro as active only after `/api/auth/session` reports the paid entitlement.
22. Cancel a test checkout and confirm the cancellation notice can reopen the Pro plan without creating another Checkout Session.
23. From a confirmed Pro session, choose `Manage plan`, verify the destination is `https://billing.stripe.com`, and return without changing the subscription.
24. Verify active, trialing, cancel-at-period-end, past-due, and inactive test states show truthful `Renews`, `Trial ends`, `Pro through`, `Billing needs attention`, or billing-management copy using the stored period date, without exposing raw Stripe status.
25. Confirm `/auth/callback` rejects protocol-relative and backslash-based external return destinations.
26. Sign in with an email in `SOE_ADMIN_EMAILS`, open `/operator`, and confirm only aggregate totals appear. Verify the subscription run rate equals active paid subscriptions multiplied by `$12`, the launch board shows MRR target, run economics, and next operator moves, the contribution figure is labeled as not profit, and no member identifiers, prompt text, or Stripe identifiers are returned by `/api/operator/metrics`.
27. Inspect Vercel function errors and Stripe webhook delivery logs.

## Rollback

Do not delete the existing SoE app or its domain configuration. Keep the current production deployment available, and use `vercel rollback` or reassign the production alias if Prompt Atlas fails a launch check.
