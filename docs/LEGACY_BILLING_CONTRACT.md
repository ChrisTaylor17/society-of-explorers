# Legacy membership reconciliation

This is a local, unapplied replacement for the old membership branches in
`app/api/stripe/webhook/route.ts`. It reconciles historical membership purchases;
it does not open the old checkout or sell new tier benefits. Optional supporter
billing, free books and Circles, account authority, and the capital pledge branch
retain their parent source. Native controllers remain in their separate tree.

## Authority and configuration

The endpoint verifies the signature against the exact raw bytes, bounded to
1,000,000 bytes before parsing. Public failures contain no provider or database
details. Membership processing runs before the old capital event-receipt helper.
An old receipt cannot bypass membership reconciliation.

The server requires all of these values before it processes legacy membership:

| Variable | Required value |
| --- | --- |
| `STRIPE_SECRET_KEY` | Server-only key matching the explicitly selected mode |
| `STRIPE_WEBHOOK_SECRET` | Secret for this endpoint; never a client value |
| `SOE_LEGACY_BILLING_MODE` | `test` or `live` |
| `SOE_LEGACY_BILLING_ACCOUNT_ID` | Exact expected account ID |
| `SOE_LEGACY_BILLING_CATALOG_JSON` | Explicit historical price mappings described below |
| `VERCEL_ENV` | Must be `production` for live reconciliation |

Configuration does not prove the provider account or a payment. The adapter
checks the current account and fetches current provider objects. Its dedicated
`stripe-supporter` SDK alias uses the installed 23.1.0 package and
`2026-10-28.endive` API. Existing dependency versions are unchanged. The adapter
only retrieves and lists resources; it creates or changes nothing at Stripe.

The catalog is an array with 1–100 entries, at most 32,768 UTF-8 bytes. Each entry
has exactly `priceId`, `productId`, `tier`, `amount`, `currency`, and `interval`.
Price IDs are unique. Amount is a positive integer in minor units; currency is
`usd`. `seeker`, `scholar`, and `philosopher` require monthly recurring licensed
prices with interval count one. `oracle` requires a one-time price and a null
interval. Historical price variants may share a product. Inactive historical
prices/products are permitted only when the exact catalog mapping matches;
this permission does not authorize selling an inactive product.

No amount-to-tier inference, email lookup, or browser-provided member ID can
establish membership ownership. A new customer binding needs canonical UUID
metadata on a current membership resource or a coherent first-party Checkout
client reference. Conflicting member metadata, customer metadata, references,
or existing ledger ownership refuse the event. Once established, the scoped
ledger can resolve an older resource with missing member metadata.

The old unscoped `members.stripe_customer_id` is a read-only conflict signal.
It cannot bootstrap authority. A pointer to another member, or multiple pointer
owners, refuses reconciliation. A matching pointer without verified resource
ownership and without an existing scoped ledger also refuses reconciliation.
No new path writes that pointer or infers its account/mode.

## Current payment evidence

Signed event payloads identify resources to inspect. They are not an entitlement
snapshot. Checkout, subscription, invoice, PaymentIntent, charge, dispute, and
fraud-warning objects are retrieved afresh when relevant. Account, mode,
customer, source ownership, exact catalog, product, currency, quantity one,
and complete single-item inventory must agree.

A newly managed recurring grant requires an active subscription, a current
item period, no paused collection, and a paid current invoice for that exact
subscription, price and period. The invoice must have a positive amount due,
no remainder, one matching subscription line, and sufficient paid allocations
backed by current successful captured charges. A positive fully paid historical
discounted invoice may qualify; zero-due, credits-only, out-of-band, unknown,
or incomplete evidence does not. Funding cannot be counted twice through
different invoice-payment rows or PaymentIntent/charge aliases.

Trialing, past-due, unpaid, incomplete, paused, canceled, expired, and future
sources do not create a new paid grant. There is no invented grace period.
An active current source with a missing invoice or unsupported paid line,
proration, source or period shape fails for review; it cannot turn uncertainty
into an automatic downgrade. Definitively non-active sources do not need an old
invoice to satisfy a current-grant shape before they become ineligible.
A delayed completed-Checkout event cannot revive a currently canceled or
unpaid subscription. All membership Checkout references in a customer's
inventory must remain coherent, including sessions that did not trigger the
current event.

A newly managed Oracle source requires an exact one-time catalog entry,
completed paid Checkout, exact session total, and its own successful captured
payment. A verified lifetime source survives ordinary subscription changes.
Proven refunds, disputes, and fraud warnings invalidate only their mapped
managed sources. Invalidations remain sticky for review; a later ordinary
paid event cannot silently clear them. The processor does not cancel provider
subscriptions, issue refunds, or notify members.

## Atomic ledger and concurrency

`docs/sql/legacy-billing.sql` defines six RLS-protected service-only tables and
two `SECURITY INVOKER` RPCs with an empty search path. Explicit grants and browser
revocations avoid depending on default Data API exposure. The schema is a
draft, applied only to disposable local fixtures during this milestone.

`soe_legacy_billing_event_state` reads authority and revision without provisioning.
`soe_legacy_billing_apply_event` atomically checks ownership, compares revision
and expected canonical tier, records the complete snapshot and sticky risk,
updates any eligible live tier, and inserts the event receipt. Receipt failure
rolls all those writes back. Duplicate receipts must match member, customer,
scope, and payload hash; replay returns current state and never reapplies an
old grant. CAS conflicts cause at most three attempts, each fetching every
customer again rather than reusing an old payment snapshot.

One member/mode revision spans all its provider accounts and customers. Every
known customer in the current account scope and every known source must remain
in the incoming snapshot. Missing rows and truncated lists are failures, not
evidence of cancellation. Limits are 25 customers, 100 sources per customer,
500 total sources, 100 invalidations, and five pages of 100 rows per provider
list. Exceeding a limit requires review instead of a partial entitlement write.

A narrow statement trigger serializes legacy reconciliation against inserts or
changes of `members.stripe_customer_id`, closing the race where another member
acquires a conflicting pointer after preflight. The shared advisory barrier is
acquired before member row locks. Ordinary profile and tier-only updates do
not acquire that pointer trigger. This intentionally serializes legacy applies
and pointer-changing statements; load and timeout behavior need staging review
before production adoption.

Live aggregation uses eligible sources across freshly refreshed customers in
the current account scope. An older snapshot in another scope cannot create or
increase a tier, including a stored lifetime source. Another live account scope
that cannot be refreshed can preserve an already-held tier: it blocks an
automatic downgrade and requests review. A historical paid canonical tier present before
this ledger becomes a protected baseline floor, flagged for reconciliation.
This preserves unproven Oracle and other paid access without claiming that
past payment or the original grant was valid. An external canonical tier change
after enrollment freezes future automatic writes for review.

Test-mode records have their own ledger state and never change the unscoped
member tier or customer pointer. They cannot seed or freeze the live baseline.
The SQL does not grant service permission to change any member column except
`tier`; existing unrelated grants in a real deployment still require inspection.

## Remaining release work

No account inspection, catalog approval, migration, webhook configuration,
production grant, real provider request, charge, deployment, or native acceptance
is established here. Before any release, an owner must review actual historical
contracts and catalog, ambiguous ownership and baseline tiers, required event
subscriptions, service grants and trigger compatibility, queue/timeout needs,
refund/dispute handling, and staged recovery using an approved provider test
account. Do not apply this draft or enable live processing from a local test
result. Missing configuration or persistence returns a retryable private 503.

There is no reconciliation dashboard or operator reset RPC in this milestone.
Unknown products, changed metadata, unsupported invoice/payment forms, deleted
resources, oversized histories, and sticky financial risk remain explicit review
work. Reconciliation is synchronous: each provider operation has a deadline,
but a timed-out SDK read can still finish in the background. The bounded fanout
is not a measured webhook response or load guarantee. A production queue and
total request deadline need review against approved account histories. Capital
pledge processing retains its existing separate behavior and is not certified
by these legacy-membership checks. Missing shared endpoint signing credentials
retain the existing endpoint misconfiguration response; missing new legacy
configuration fails privately with 503.

## Documentation checked

Checked on 2026-11-03 against installed SDK declarations and official public
documentation: [Stripe webhook ordering, duplicates and raw signatures](https://docs.stripe.com/webhooks),
[subscription events](https://docs.stripe.com/billing/subscriptions/webhooks),
[InvoicePayment pagination](https://docs.stripe.com/api/invoice-payment/list),
[InvoicePayment allocations](https://docs.stripe.com/api/invoice-payment/object),
and [Supabase function privileges](https://supabase.com/docs/guides/database/functions).
The Supabase changelog and current PostgreSQL compatibility notices were also
checked; no production upgrade or project setting was changed. Verification
artifacts and reproduction commands are in the parent delivery handoff.
