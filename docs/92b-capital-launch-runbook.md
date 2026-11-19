# 92B Capital Launch Runbook

Status: local operator draft. Do not deploy, migrate production data, send outreach, contact the landlord, print window materials, or accept public traffic until Chris explicitly approves the specific action.

## Purpose

This runbook turns the 92B patronage engine into a controlled launch sequence. The campaign is a patronage drive toward a $120,000 goal, with the Boston storefront described only as the intended first physical node if lease status, repairs, access, and landlord alignment make it viable.

## Launch Boundaries

- Use `docs/soe-external-action-approval-matrix.md` for exact approval text before any deploy, migration, Stripe test, outreach, landlord contact, window placement, connected-tool mutation, or browser/computer automation with external effect.
- No landlord contact in this phase.
- No public claim that the space is secured, repaired, permitted, open, or guaranteed.
- No equity, debt, securities, dividends, investor language, or promised financial return.
- No external outreach without approval of the exact batch and message.
- No production migration or deployment without an explicit go-ahead.
- No unnecessary patron PII in admin views; aggregate by default.

## Preflight

1. Confirm environment variables:
   - `NEXT_PUBLIC_SITE_URL`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `STRIPE_PRICE_SEEKER`
   - `STRIPE_PRICE_SCHOLAR`
   - `STRIPE_PRICE_PHILOSOPHER`
   - `STRIPE_PRICE_ORACLE`
   - `CAPITAL_WEBHOOK_EMAIL_NOTIFICATIONS_ENABLED=false` for local/test replay; set to `true` only for an approved live production notification test.
   - `SOE_ADMIN_EMAILS`
   - `SOE_ADMIN_WALLETS` or `SOE_ADMIN_WALLET_ADDRESSES` for production wallet-only admins, if needed.
   - Supabase URL and service role key.
2. Apply the capital patronage migration only after approval:
   - `supabase/migrations/20260526_capital_patronage.sql`
3. Run local/dev verification:
   - `npm run capital:preflight:smoke`
   - `npm run capital:metadata:smoke`
   - `npm run capital:checkout-safety:smoke`
   - `npm run capital:funding-conversion:smoke`
   - `npm run capital:webhook-safety:smoke`
   - `npm run capital:webhook-dedupe:smoke`
   - `npm run capital:privacy:smoke`
   - `npm run capital:private-pages:smoke`
   - `npm run private:route-helper:smoke`
   - `npm run private:route-proxy:smoke`
   - `npm run capital:admin-shape:smoke`
   - `npm run capital:redaction:smoke`
   - `npm run capital:weekly-review:smoke`
   - `npm run capital:revenue:smoke`
   - `npm run capital:live-payment:smoke`
   - `npm run capital:first-revenue:smoke`
   - `npm run capital:post-promotion:smoke`
   - `npm run capital:go-live:readiness:smoke`
   - `npm run capital:paid-traffic:smoke`
   - `npm run public:discovery:smoke`
   - `npm run world:permissions:smoke`
   - `npm run pod:wallet-seal:smoke`
   - `npm run operator:smoke -- --list`
   - `npm run operator:script-boundary:smoke`
   - `npm run operator:manifest:smoke`
   - `npm run capital:routes:smoke`
   - `npm run capital:preflight -- --routes --supabase-read --stripe-read`
   - `npm run build`
   - `npx eslint app/92b/fund/page.tsx app/api/admin/capital/route.ts app/api/92b/checkout/route.ts app/api/92b/progress/route.ts app/api/projects/[id]/pledge/route.ts app/api/stripe/webhook/route.ts lib/capital/pledgeLedger.ts lib/capital/projectFunding.ts`
4. Run read-only production-env verification only when reviewing production configuration:
   - `npm run capital:preflight -- --production-env --supabase-read --stripe-read --soft`
   - `npx vercel env run --environment=production -- npm run capital:live-payment:readiness -- --stripe-read`
   - `npx vercel env run --environment=production -- npm run capital:revenue:snapshot -- --stripe-read`
   - `npm run capital:production:verify -- --soft`
   - `npm run capital:deployment:verify -- --vercel-deployment=https://society-of-explorers-jzd7yvty1-chris-projects-03dec906.vercel.app`
   - `npm run capital:profit:gate -- --vercel-read --stripe-read --deployment=https://society-of-explorers-jzd7yvty1-chris-projects-03dec906.vercel.app`
   - `npm run capital:first-revenue:readiness -- --vercel-read --stripe-read --deployment=https://society-of-explorers-jzd7yvty1-chris-projects-03dec906.vercel.app`
   - `npm run capital:post-promotion:verify -- --vercel-read --stripe-read --deployment=https://society-of-explorers-jzd7yvty1-chris-projects-03dec906.vercel.app`
   - `npm run capital:paid-traffic:packet`
   - This must not create checkout sessions, replay webhooks, deploy, or send public traffic.
   - Treat the revenue snapshot as aggregate payment evidence, not accounting profit; operating expenses remain outside Stripe.
   - Use its paid 92B tier totals to evaluate offer mix. It intentionally does not report conversion rate without privacy-safe visitor counts.
5. Confirm private admin behavior:
   - Unauthenticated `/api/admin/capital` returns `401`.
   - Authorized admin sees aggregate metrics only.
   - Localhost wallet sessions can use the private capital tools in development only; production access should rely on approved admin email or wallet allowlists.
6. Review the private Launch Room:
   - `/capital/launch-room`
   - Keep every item in dry-run or approval mode until Chris explicitly approves the specific external action.
   - Use the Launch Room to prepare, not execute, external actions.
7. Review the private Approvals checklist:
   - `/capital/approvals`
   - Browser-local review marks do not authorize deploys, sends, payments, migrations, connected-tool mutations, landlord contact, or physical placement.
8. Review the private Patron Brief:
   - `/capital/patron-brief`
   - Use it for call prep, objection handling, and ask framing only. It does not authorize outreach.
9. Review the private Scenario Planner:
   - `/capital/scenarios`
   - Use it to choose patron-mix and pace targets. Scenario math is not pledged revenue.
10. Review the private Outreach Lab:
   - `/capital/outreach-lab`
   - Use redacted slots only. It does not authorize importing contacts, sending messages, calling, posting, or automating outreach.
11. Review the private Weekly Review:
   - `/capital/weekly-review`
   - Record money collected, committed pledges, strongest story, top objection, next ask, and approval-needed items locally after each weekly sprint. It does not authorize outreach, deployments, payment tests, landlord contact, or physical placement.
12. Review the Stripe approval packet before checkout tests:
   - `docs/92b-stripe-approval-packet.md`

## Stripe Test Matrix

| Flow | Expected metadata | Expected ledger result | Duplicate replay behavior |
| --- | --- | --- | --- |
| 92B $25 Supporter | `type=92b_pledge`, `pledge_type=92b`, campaign slug, tier id | Pending row on checkout, paid row on webhook | No double-count |
| 92B $100 Patron | `type=92b_pledge`, `pledge_type=92b`, campaign slug, tier id | Paid amount included in `/api/92b/progress` | No duplicate EXP |
| 92B $500 Renaissance Founder | `type=92b_pledge`, `pledge_type=92b`, campaign slug, tier id | Paid amount included in Capital Command Center | No duplicate lead row |
| 92B $1,111 Architect Patron | `type=92b_pledge`, `pledge_type=92b`, campaign slug, tier id | Tier label preserved | No investment language |
| Project pledge | `type=project_pledge`, `pledge_type=project`, project id, tier id | Project amount and backer count update once | No double increment |
| Membership Seeker | `type=membership`, tier id | Member tier becomes seeker | Replay leaves same tier |
| Membership Scholar | `type=membership`, tier id | Member tier becomes scholar | Replay leaves same tier |
| Membership Philosopher | `type=membership`, tier id | Member tier becomes philosopher | Replay leaves same tier |
| Membership Oracle | `type=membership`, tier id | Member tier becomes oracle | Replay leaves same tier |
| Merch checkout | `type=merch`, product id, quantity | Checkout URLs use environment-aware base URL | Webhook does not treat merch as patronage |

## Public Copy Audit

Before launch, search public campaign surfaces for risky language:

```bash
rg "profit|dividend|equity|security|securities|secured lease|guaranteed|investment return|investor" app/92b app/projects docs/92b-*.md
```

Acceptable uses are explicit disclaimers such as "not equity" or "not a promise of financial return." Any positive claim should be rewritten before launch.

`npm run public:discovery:smoke` also fails if `/92b` returns to claims such as
"lease signed," "the space is ours," "currently under construction," or
"construction is underway." It verifies `/robots.txt`, `/sitemap.xml`, and
distinct canonical/social metadata for `/92b` and `/92b/fund`.

## Capital Command Center Checks

- Baseline metrics should show members, paid members, founding-interest buckets, projects, project pledge totals, pledge ledger status, and Movement script status.
- It should not expose raw lead names, emails, Stripe customer ids, payment intent ids, wallet addresses, or patron notes.
- It should point operators to the local draft files rather than sending or publishing them.
- `npm run capital:admin-shape:smoke` should pass before any broader operator use.
- `npm run capital:redaction:smoke` should pass before using the private capital pipeline with real relationship context.

## Window Activation Gate

The window package can move from draft to physical only after:

1. Chris approves the exact sign copy and QR destination.
2. The pledge ledger and Stripe webhook path are tested.
3. The campaign page is deployed and checked on mobile.
4. The language still says "may begin here" and "if viable."
5. Chris decides whether to notify or discuss with the landlord first.

## First Seven-Day Operating Loop

- Day 1: Approve campaign copy, migration, and Stripe test plan.
- Day 2: Apply migration, run test checkouts, replay webhook events, and verify duplicate handling.
- Keep `CAPITAL_WEBHOOK_EMAIL_NOTIFICATIONS_ENABLED=false` during test webhook replay unless Chris explicitly approves a production notification test.
- Day 3: Deploy, smoke test, and approve the window package.
- Day 4: Prepare five warm outreach drafts for approval.
- Day 5: Send only approved outreach, then log replies and objections.
- Day 6: Review page conversion, pledge totals, strongest story, and top objection in `/capital/weekly-review`.
- Day 7: Decide whether to widen outreach, place the window sign, or refine the offer.

## Go / No-Go

Go when:

- Build passes.
- Targeted lint passes.
- Webhook replay does not double-count.
- `npm run capital:webhook-dedupe:smoke` confirms duplicate events exit before lead rows, project totals, EXP awards, or notification email side effects.
- `npm run capital:funding-conversion:smoke` confirms the server derives 92B tier prices, checkout failures remain retryable, and no direct wallet address bypasses tracked fulfillment.
- Capital webhook notification email is either disabled or explicitly approved for the target live production test.
- Admin API is private.
- Public copy remains conditional and non-financial.
- Chris has approved migration, deployment, and any external action.
- After production promotion, `npm run capital:production:verify` passes against `https://www.societyofexplorers.com`.

No-go when:

- Ledger table is missing in production.
- No enabled live Stripe endpoint targets `/api/stripe/webhook` with `checkout.session.completed`, `customer.subscription.updated`, and `customer.subscription.deleted`. As of 2026-06-19, endpoint `we_1TjzTi5r4D5OocVf7AH7rnJk` satisfies this check; re-run production preflight before promotion.
- `npx vercel env run --environment=production -- npm run capital:live-payment:readiness -- --stripe-read` fails the live mode, endpoint, event-allowlist, or `STRIPE_WEBHOOK_SECRET` shape check.
- Stripe metadata is inconsistent.
- Checkout route safety guard fails or any local live-mode checkout path is unblocked.
- Funding conversion guard fails, client input can alter a 92B price, or direct wallet instructions bypass the pledge ledger.
- Webhook notification safety guard fails, or `CAPITAL_WEBHOOK_EMAIL_NOTIFICATIONS_ENABLED=true` is being used without exact approval.
- Webhook dedupe guard fails, or duplicate replay can happen after project, lead, EXP, or notification side effects.
- Admin responses expose unnecessary PII.
- Any copy implies a secured lease, guaranteed buildout, equity, debt, or returns.
- Outreach or landlord contact is being considered without a reviewed draft.
- Post-promotion production verification fails for `/92b/fund`, `/92b`, `/robots.txt`, `/sitemap.xml`, `/api/92b/progress`, or the invalid-checkout no-store/private boundary.

## Post-Promotion Verification

Current continuation evidence on 2026-06-19 at 12:39 PM EDT:

- Production is deployment `dpl_2hkoxV6BewU9RCWtEhWUD5XUuTJR`, ready and aliased to `www.societyofexplorers.com` and `societyofexplorers.com`; `npm run capital:production:verify -- --json` reports `31` pass and `0` fail.
- Direct production `curl` to `/api/92b/progress` returns `x-robots-tag: noindex, nofollow, noarchive`.
- Vercel error-log scan for deployment `dpl_2hkoxV6BewU9RCWtEhWUD5XUuTJR` with `--since 1h --level error --no-follow` found no logs.
- Live Stripe payment readiness is intact for endpoint `we_1TjzTi5r4D5OocVf7AH7rnJk` with exactly the approved webhook events and a present `STRIPE_WEBHOOK_SECRET` shape.
- Live checkout validation: on 2026-06-19 at 12:49 PM EDT, the approved 92B `SUPPORTER` validation created exactly one live Stripe-hosted Checkout Session. Redacted session id: `cs_live_a18VUNE...NJ4DUh`; amount: `2500 usd`; mode: `payment`; status: `open`; payment status: `unpaid`; return URLs point back to `https://www.societyofexplorers.com/92b/fund`. Do not create a duplicate session unless Chris explicitly asks for a replacement.
- Live Stripe revenue still shows no paid Checkout sessions in the last 30 days and all-time Stripe cash contribution of `-$1.70`; `/api/92b/progress` still reports `$0` raised and `0` backers because the validation session is unpaid. Do not claim profit.
- Production promotion is complete. The next exact approval must be one first-revenue action from `npm run capital:paid-traffic:packet`.

After any approved first-revenue action, run:

```bash
npm run capital:production:verify
npx vercel env run --environment=production -- npm run capital:live-payment:readiness -- --stripe-read
npx vercel env run --environment=production -- npm run capital:revenue:snapshot -- --stripe-read
npm run capital:profit:gate -- --vercel-read --stripe-read --deployment=https://society-of-explorers-jzd7yvty1-chris-projects-03dec906.vercel.app
npm run capital:first-revenue:readiness -- --vercel-read --stripe-read --deployment=https://society-of-explorers-jzd7yvty1-chris-projects-03dec906.vercel.app
npm run capital:post-promotion:verify -- --vercel-read --stripe-read --deployment=https://society-of-explorers-jzd7yvty1-chris-projects-03dec906.vercel.app
npm run capital:paid-traffic:packet
```

`capital:production:verify` is read-only except for one intentionally invalid
checkout POST. The invalid request must return `400` before any Stripe Checkout
Session can be created. If the verifier fails, roll back to the last known good
production deployment and re-run the production preflight before trying again.
For a protected Preview Deployment, use `capital:deployment:verify` with
`--vercel-deployment=<preview-url-or-id>` before promotion.
Use `capital:profit:gate` to join production freshness, protected-preview
readiness, live payment readiness, recent paid Checkout activity, Stripe cash
contribution, estimated MRR, and the exact next approval gate before claiming
the site is updated or the business is contribution-positive.
Use `capital:first-revenue:readiness` to compose the profit gate with the local
paid-traffic packet before asking for a first-conversion action. It reports the
same production/payment/revenue evidence plus the exact post-approval promotion
post-promotion verification, next exact approval options,
measurement commands, and stop rules without deploying, promoting, creating
Checkout sessions, sending outreach, printing, posting, mutating connected
tools, or claiming profit.
Use `capital:post-promotion:verify` after an approved production promotion to
compose production verification, live payment readiness, aggregate Stripe
revenue, and first-revenue readiness into one read-only status. It answers
whether production is updated and whether Stripe cash contribution is positive
without creating checkout sessions, sending outreach, replaying webhooks, or
claiming accounting profit.
Use `capital:go-live:packet` only as the pre-promotion packet contract for
historical/approval-boundary checks. The current path after verified production
promotion is `capital:paid-traffic:packet`.
Use `capital:live-payment:readiness -- --stripe-read` through Vercel production
envs to confirm the live Stripe webhook endpoint
`https://www.societyofexplorers.com/api/stripe/webhook`, approved event
allowlist, mode, and signing-secret shape. It does not print the secret,
create/update/delete endpoints, create Checkout sessions, replay webhooks,
deploy, send, or claim profit.
Use `capital:paid-traffic:packet` after production promotion readiness to print
the exact first paid-action approval options for live Checkout validation, the
one-person First Supporter outreach path, or window QR activation. It includes
the minimum 92B Supporter live-checkout validation approval, the one warm
Supporter approval text, approval-ready first-conversion actions, warm outreach
draft shells, expected tier metadata, the measurement loop, and stop rules
without creating sessions, sending, printing, posting, or claiming profit.
