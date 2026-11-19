# Optional supporter billing

This is an unapplied candidate, not a launched offer or evidence of revenue.
The proposed offer is $10 USD per month. The complete local source library,
Circle discovery, human discussion and ordinary participation remain free.
The inherited edition notices retain their US jurisdiction scope; rights
outside that scope have not been newly assessed by this billing milestone.
Support pays toward community infrastructure; it grants no AI quota, token,
governance, moderation priority, lifetime benefit or tax deduction.

## Independent of member and native authority

The dedicated supporter ledger does not write `members.tier`, mint tokens or
grant Circle privileges. Canonical actor identity still comes from the existing
server authentication helper. No native, portable member-session, login or
canonical authentication source is changed by this milestone.

The former four-plan checkout is closed unless an operator explicitly sets
`SOE_LEGACY_MEMBERSHIP_SALES_ENABLED=true`. That switch exists for compatibility
review; it is not a recommendation to reopen the old offer. The old webhook
ignores marked supporter objects before its membership processing, including
fresh supporter subscription objects retrieved for older update payloads.
Existing legacy membership behavior and its unresolved limitations remain
separate from the new supporter processor.

## Configuration and provider boundaries

New sales are closed by default. Dedicated `SOE_SUPPORTER_*` configuration
selects mode, account, key, canonical site origin, price, product, portal
configuration and webhook signing secret. Configuration presence is not a
provider verification or a launch clearance. A private billing review checks
fresh provider state; checkout rechecks the exact account, selected mode,
active product and licensed $10 USD monthly price before preparing a session.
Test and live ledger scopes and provider idempotency keys are distinct.

| Variable | Purpose |
| --- | --- |
| `SOE_SUPPORTER_MODE` | Explicit `test` or `live`; live requires a production environment. |
| `SOE_SUPPORTER_STRIPE_SECRET_KEY` | Dedicated selected-mode restricted or secret key; never sent to the browser. |
| `SOE_SUPPORTER_ACCOUNT_ID` | Exact provider account to verify. |
| `SOE_SUPPORTER_SITE_ORIGIN` | Exact canonical origin; loopback HTTP is test-only. |
| `SOE_SUPPORTER_PRICE_ID` | Exact active $10 USD licensed monthly price. |
| `SOE_SUPPORTER_PRODUCT_ID` | Exact active product for that price. |
| `SOE_SUPPORTER_PORTAL_CONFIGURATION_ID` | Verified portal configuration with cancellation enabled and plan changes disabled. |
| `SOE_SUPPORTER_WEBHOOK_SECRET` | Dedicated signed-event secret. |
| `SOE_SUPPORTER_SALES_ENABLED` | Must be exactly `true` to permit new sales after all checks. Defaults closed. |

The SDK is isolated as `stripe-supporter` at Stripe Node 23.1.0 with API
`2026-10-28.endive`; the legacy Stripe 21.0.1 dependency stays in place. Existing
locked package entries are preserved. This SDK requires Node 20 or newer.

Existing management is checked independently of the new-sales switch. A portal
session must belong to the authenticated member's verified customer. Older
memberships require fresh, exact metadata and configured legacy price evidence;
an email match or a matching amount is insufficient to claim ownership. Mixed,
foreign or ambiguous histories block new purchases and require review.

No real Stripe or Supabase operation is authorized by this document. This
candidate's tests use synthetic provider objects and disposable local SQL.

## Review, confirmation and uncertain replies

Public pages may read only the public offer. Private billing is loaded
explicitly; signing in or returning from Stripe does not prepare checkout.
The member reviews terms and confirms before a POST. A prepared URL requires
another deliberate click. Browser DTOs omit customer IDs, provider subscription
IDs, account IDs, emails, raw provider errors and signed webhook bodies.

Every operation carries a UUID request key and expected ledger revision. The
server keeps durable attempts before provider writes, pins the configuration
and parameters, and derives stable provider idempotency keys. An unresolved
checkout blocks a different request key. An exact retry may resume the same
attempt; a timeout does not establish that nothing happened.

Checkout attempts expire after one hour. The 22-hour exact-retry window remains
inside Stripe's documented minimum 24-hour idempotency retention. Time alone
does not prove an unknown operation absent or justify silently replacing it.
Fresh provider proof is required to resolve terminal attempts. A webhook can
recover an owned, fully verified session when its creation reply was lost
before the session ID was committed locally.

After a reload, recovery requires another explicit review. It reuses the saved
attempt UUID with the current ledger revision; it does not create another
checkout key. The stored provider parameters and provider idempotency key stay
the same. Literal transport-body retries retained in a live page remain exact.
Unknown portal preparation may be replaced after 15 minutes following another
ownership check and explicit confirmation; portal preparation does not charge.
Both paths retain durable request limits. Unknown checkout authority never
expires merely because a portal recovery window elapsed.

The return URL contains only an attempt UUID. An explicit check must match an
owned ledger attempt to fresh provider state. `welcome=1`, `success=true`, a
session URL, a prepared session or a completed browser redirect cannot establish
payment. The old welcome banner now says so.

Private views clear on identity and lifecycle retirement. Late replies cannot
restore retired details or confirmation. No retry is automatic, and no billing
details are placed in browser persistent storage.

## Webhooks and local storage

`docs/sql/supporter-billing.sql` is an unapplied, service-only schema proposal.
Ordinary browser roles have no table or RPC grants. RLS is enabled and RPCs use
invoker security. SQL enforces account/customer/session uniqueness, revision
checks, one unresolved checkout and transactional event receipts. The trusted
server still must verify canonical actor and provider ownership; a service-role
RPC argument is not browser identity.

The new webhook verifies the signature and selected mode, then reads current
provider objects rather than granting from an old event payload. Applying a
snapshot and recording its event receipt is atomic under a revision check.
Missing storage, provider uncertainty or stale revision does not silently
fulfil support or claim payment. Invoice, subscription, refund, dispute and
fraud events are part of the dedicated lifecycle. Risk review remains sticky
instead of being cleared by a later ordinary renewal event.

## Live acceptance remains outstanding

Before any live opening, review and approve the schema and deployment plan,
configure and verify the exact Stripe account/catalog/portal/event destination,
and exercise real sandbox lifecycle and recovery cases. Verify recurring terms,
cancellation behavior, support/refund handling, registration and tax readiness.
Tax configuration and tax-deductibility are not established by this candidate.
No production SQL, key, webhook, account, security setting or sale has changed.

These checks govern application-created operations. An already issued Stripe
Checkout link can remain usable until its one-hour expiry; an out-of-band
provider change after review is not prevented by a local reservation. Review
Stripe's single-subscription controls and test that provider-side case before
live sales. This candidate does not claim universal duplicate-charge prevention.

Native store-billing requirements, native UI, durable cross-process member
authority and physical iOS/Android/Quest acceptance remain separate work.
No local web test establishes adoption, payment, production readiness or device
acceptance.

Official references: [API versioning](https://docs.stripe.com/api/versioning),
[Node SDK v23.1.0](https://github.com/stripe/stripe-node/releases/tag/v23.1.0),
[idempotent requests](https://docs.stripe.com/api/idempotent_requests),
[subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks),
[customer portal](https://docs.stripe.com/customer-management/integrate-customer-portal).
