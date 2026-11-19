# 92B Stripe Approval Packet

Status: local operator record. Chris approved the live membership/capital webhook configuration on 2026-06-19, and approved one live 92B Supporter checkout validation on 2026-06-19. Do not create additional checkout sessions, replay webhooks, promote production, send outreach, or accept public payment traffic until Chris explicitly approves the specific action.

Updated from the authenticated Vercel and read-only live Stripe audit on 2026-06-19 ET.

## Current Production-Env Preflight Result

- Command: `npx vercel env run --environment=production -- npm run capital:preflight -- --production-env --supabase-read --stripe-read --soft`
- Quick Stripe-read command: `npx vercel env run --environment=production -- npm run capital:preflight -- --stripe-read --soft`
- 50 passing checks.
- 3 warnings.
- 0 blocking failures.

The default local/dev preflight intentionally does not load `.env.production`:

```bash
npm run capital:preflight -- --routes --supabase-read --stripe-read --soft
```

Local/dev checks remain separate from the authenticated Vercel production audit. The Vercel command above injects production configuration without writing secret values into the repository.

Use that command to verify the local dev server and admin boundaries. Use `--production-env` only for read-only configuration audits.

Use `docs/soe-env-readiness-template.md` and `npm run env:readiness:smoke` before editing local/test env files or reviewing production configuration.

## Webhook Configuration

The Oracle price is configured, and the live Stripe account now has enabled endpoint `we_1TjzTi5r4D5OocVf7AH7rnJk` targeting `https://www.societyofexplorers.com/api/stripe/webhook`.

Why it matters:
- Membership checkout can collect payment, but member entitlements will not update without `checkout.session.completed` delivery.
- Monthly tier changes and cancellations require `customer.subscription.updated` and `customer.subscription.deleted`.
- Capital pledge ledger updates also use this route.

The endpoint is live-mode, enabled, and limited to `checkout.session.completed`,
`customer.subscription.updated`, and `customer.subscription.deleted`. Its
returned signing secret was piped directly into Vercel production
`STRIPE_WEBHOOK_SECRET` and was not printed or written to disk. The separate
merch endpoint at `/api/webhooks/stripe` remains separate.

## Live Checkout Validation

On 2026-06-19 at 12:49 PM EDT, the approved live 92B Supporter validation
created exactly one Stripe-hosted Checkout Session from production
`/api/92b/checkout`.

- Redacted session id: `cs_live_a18VUNE...NJ4DUh`
- Customer email: `validation+92b-supporter-20260619@societyofexplorers.com`
- Mode: `payment`
- Status: `open`
- Payment status: `unpaid`
- Amount: `2500 usd`
- Return URLs: `https://www.societyofexplorers.com/92b/fund`
- Metadata: `type=92b_pledge`, `pledge_type=92b`,
  `campaign_slug=92b-founding-node`, `tier_id=supporter`,
  `amount_cents=2500`, `utm_campaign=92b-live-checkout`

The full Checkout URL was kept out of committed docs. Progress and revenue stay
at zero until a human completes payment on the Stripe-hosted Checkout page and
the live webhook receives `checkout.session.completed`.

## Warnings

1. The configured Stripe secret key is live-mode. Do not run local checkout creation or webhook replay tests with the current key.
2. `SOE_ADMIN_EMAILS` is not configured. Production admin access should not rely on development-only wallet fallback.
3. `SOE_ADMIN_WALLETS` or `SOE_ADMIN_WALLET_ADDRESSES` is not configured. Add this if wallet-only admin access should work outside localhost.
4. `STRIPE_PRICE_ORACLE` is configured to the active one-time `$499` Oracle price; this is a confirmed readiness item rather than a warning.

## Safe Next Sequence

1. Keep the live membership/capital webhook endpoint and Vercel production signing secret aligned.
2. Re-run the read-only production preflight and require the endpoint plus event checks to pass before production promotion.
3. Switch to a Stripe test-mode secret and matching test price ids before local checkout tests.
4. Keep `npm run capital:checkout-safety:smoke` passing before any checkout-session approval; it verifies environment-aware return URLs and blocks local live-mode checkout creation.
5. Keep `npm run capital:webhook-safety:smoke` passing before any webhook replay approval; it verifies notification email requires a live-mode Stripe event plus `CAPITAL_WEBHOOK_EMAIL_NOTIFICATIONS_ENABLED=true`.
6. Keep `npm run capital:webhook-dedupe:smoke` passing before any webhook replay approval; it verifies duplicate events exit before project, lead, EXP, or notification side effects.
7. Keep `CAPITAL_WEBHOOK_EMAIL_NOTIFICATIONS_ENABLED=false` during local/test replay unless Chris explicitly approves a production notification test.
8. Re-run local/dev readiness:

```bash
npm run env:readiness:smoke
npm run capital:preflight -- --routes --supabase-read --stripe-read
```

9. Re-run production-env readiness without creating any checkout sessions:

```bash
npm run capital:preflight -- --production-env --supabase-read --stripe-read --soft
```

10. Re-run protected preview readiness without creating a real checkout session:

```bash
npm run capital:deployment:verify -- --vercel-deployment=https://society-of-explorers-jzd7yvty1-chris-projects-03dec906.vercel.app
```

11. Only after the local/dev, production-env, and protected-preview gates are clean, approve the Stripe checkout and webhook replay matrix from `docs/92b-capital-launch-runbook.md`.

## Do Not Do Yet

- Do not create additional live checkout sessions.
- Do not replay live webhook events.
- Do not promote the campaign to production.
- Do not accept public pledge traffic.
- Do not send outreach or contact the landlord.
