# Physical-space campaign boundary — November 8, 2026

The local online-pilot build now holds the historical physical-space campaign and city-interest intake at the application boundary. It preserves the larger community/venue vision and the existing downstream implementations. It does not deploy a hold, alter hosted access, cancel an existing provider link, refund a payment or prove that a hosted campaign is closed.

## Evidence that changed the work

The preceding [funding review](funding-claims-review.md) found no explicit campaign-launch gate, a checkout surviving a pending-ledger failure, and uncertain totals displayed as zero. Inspecting the adjacent `/salons` page additionally found unsupported signed-lease/construction claims and two forms that marked any resolved HTTP response as a recorded proposal/support. Its city API aggregates up to 1,000 free-text lead rows and returns empty success on a lookup error. These are source observations, not findings that any real person paid, submitted data or suffered a loss.

Seven methods now return a private, no-store 503 before request-body parsing, environment/credential reads, client initialization, database work, notifications or checkout creation:

- POST `/api/92b/checkout`, `/api/92b/pledge`, `/api/92b/propose`.
- GET `/api/92b/progress`, `/api/salons/cities`.
- POST `/api/salons/propose`, `/api/salons/support`.

The response identifies the hold and points to the existing pilot and correctly filtered online-circle directory. It supplies no success receipt, checkout URL, zero revenue or empty-city claim. No request header, query parameter or environment flag can reopen it. The body/algorithms below each early guard are byte-for-byte preserved after removing only the new import/guard lines.

## Public experience

`/92b`, `/92b/fund` and `/salons` are server-rendered proposal pages, reusing the existing visual direction and actual reading, fellowship, circle, pilot and Quest destinations. The physical venue, charitable/commercial structure and immersive experience remain staged possibilities. No host, lease, construction or opening is invented.

The former $120,000 allocation remains inspectable as an earlier planning budget, explicitly distinct from current quotes, committed spend or funds raised. Donation/pledge and city-interest forms are not mounted. Old `success` and `support` query strings cannot create a payment confirmation or reopen intake. Campaign social/search metadata describes the hold. All three pages are readable without JavaScript.

The historical tier definitions, campaign ledger, webhook and related records are preserved. The webhook source is unchanged: new-submission gating must not silently discard later events from earlier payments. This is preservation, not certification that the older reconciliation is correct. Other products, membership/supporter payments, event systems and ordinary book salons are outside this seven-method hold.

## Verification

- Full 1,236-input web build and scoped lint passed with the existing locked tools and no credentials. Every build input matches a canonical file or unchanged Git object.
- Twenty-one direct-handler scenarios exercised seven methods under anonymous, claimed-approval/identity and unreadable-request conditions. The runner reports 28 results including the seven parent tests. Provider, data, parsing, environment and notification traps remained untouched. These tests use a transport/provider fixture, not hosted services.
- Seven compiled-browser journeys passed. They cover three pages at 320/390/768/1,440px, old return/support URLs, metadata, keyboard/real navigation and no-JavaScript reading. Seven actual HTTP calls passed through the browser to the compiled local server and returned the hold. No API response was mocked in that browser run.
- Seven targeted existing maintenance checks passed after five source-check updates. Three updates reconcile former active-form/copy expectations. Two fix pre-existing verification issues: the dedupe check used a removed branch marker, and notification defaults were read from an absent `.env.example` instead of the existing tracked readiness template. No credential/environment file was opened or created. These source checks do not prove payment fulfillment.
- The initial browser driver tried Node-side loopback HTTP and was denied by its network guard. The corrected driver permits only the seven exact methods/paths through the browser. The guard was not relaxed. Initial failures are retained.
- Browser page errors, unexpected API requests and external requests were zero. Both owned previews stopped; source/build/runtime comparisons remained unchanged afterward. The funding-phone and salons-desktop header screenshots were visually reviewed.

The [machine-readable receipt](physical-space-hold-verification.json) records exact source and evidence. No installation, hosted write, external message, payment, deployment or spending occurred.

## Reopening is a separate deliverable

The hold is an interim pilot boundary, not completion of a commercial venue product. Before proposing a release:

1. Establish the operator, legal/IP authority, premises feasibility, recipient account, benefits, capacity, dates, cancellation/refund policy and unused-funds treatment. Get qualified review of charitable, affiliated-business, token, custody and tax questions. Retained legal records and an EIN do not settle current authority.
2. Design typed, consented city-interest records with retention/removal and abuse controls. Do not publish free-text lead parsing or present supporters as verified demand. Accept a submission only after a confirmed durable result; make failures recoverable without duplicate writes or notifications.
3. Repair and verify checkout/ledger idempotency and recovery, including failure between session creation and persistence. Keep successful, pending, failed and unknown states distinct. Make campaign totals complete, dated, currency/campaign specific and explicit about refunds; no partial-session window or error-as-zero fallback.
4. Retain verified, replay-safe payment-event reconciliation and receipt records. Verify signatures from the raw body, check actual payment state, and handle concurrent/repeated and delayed events. A redirect alone is not proof of payment. [Stripe fulfillment guidance](https://docs.stripe.com/checkout/fulfillment.md?ui=full-page), [Stripe webhook guidance](https://docs.stripe.com/webhooks).
5. Review permissions/restore and the exact deployment, customer communication and provider test plan before requesting any consequential action. Previously created provider sessions/links and current hosted callers require their own read-only inventory; this local gate does not invalidate them.

No new SDK, secret, sandbox, webhook replay or live/test-mode provider action was needed for the hold. Any future payment implementation should use current supported Stripe guidance and its own authorized isolated test environment.

## Preservation and rollback

Preimages at base `e517c946a5df18a92a795cced74259d82876c47e` and all first-attempt evidence are retained privately; source history preserves the former page designs. No record, personal file or backup was deleted. A scoped source revert is possible without a data migration, but would restore the earlier collection paths and known claims. It is not approval to deploy them. Keep unrelated changes intact.

Hosted recovery and privacy, real sign-in/provider acceptance, legal/operator authority, a confirmed pilot host, and phone/headset acceptance remain open. The next independent discovery pass returns to the already-inventoried historical business-plan/presentation visuals before expanding architecture.
