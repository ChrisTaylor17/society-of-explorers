# Running This as a Continuous Codex Goal

The desktop Codex app can keep an explicit goal active across automatic continuations. It cannot promise business profit or operate indefinitely outside the app/runtime, but it can preserve the goal, plan, files, and verification state while continuing through long implementation sessions.

## Current Continuation State

Updated: June 19, 2026.

- The public discovery-to-workspace flow passes desktop and mobile browser checks with no relevant console warnings or errors.
- Signed-out visitors can now review the Prompt Atlas Pro price, cancellation terms, benefits, and privacy promise before authentication. Choosing `Sign in to upgrade` closes the plan dialog and opens authentication without calling the billing endpoint.
- Signed-out visitors and ordinary free members can open the same transparent Pro terms directly from the global header without entering a workspace. Existing and recovery-state subscribers keep the separate Stripe plan-management path, and the header action performs no checkout or analytics call.
- When the authenticated session already shows zero free runs, the workspace primary action now distinguishes `View Pro`, `Restart Pro`, and blocked-plan management before making a doomed execution request. Stale clients remain protected by the server quota and still recover from `quota_exceeded` responses.
- Upgrade intent now survives email, Google, and SIWE authentication through a non-sensitive `intent=upgrade` return marker. A confirmed member returns to the transparent Pro dialog without automatic checkout, cancelling authentication clears the marker, and the auth callback rejects protocol-relative or backslash-based external return destinations.
- The mobile Shuffle control now has an explicit accessible name.
- Prompt/context ledger fingerprints now use a server-only, domain-separated HMAC instead of an unsalted digest, reducing offline guessing risk if run metadata is copied.
- A follow-up migration expires interrupted run reservations after ten minutes, and session usage counts ignore those stale reservations so a crashed provider request cannot consume a member's allowance indefinitely.
- `npm run privacy:smoke` guards the keyed fingerprint, input-validation order, reservation recovery, session counters, and migration documentation.
- Checkout and billing-portal routes now derive environment-aware return URLs and block `sk_live_` Stripe sessions when either the request or return URL is local. `npm run checkout:safety:smoke` verifies the guard runs before Stripe work.
- Stripe subscription fulfillment now accepts only `prompt_atlas` metadata with the configured Pro price, checks every entitlement/customer write, and returns a retryable webhook failure instead of acknowledging access that was not persisted. Customer creation also uses a member-scoped idempotency key.
- Public prompt DTOs no longer include creator member UUIDs. The Community surface now consumes aggregate momentum, usage, save, and vote counts from `/api/community`, merges those scores into display-safe prompt records, and falls back to usage-only seed ranking when aggregate data is unavailable.
- The Community surface now includes an aggregate-only growth rail, sortable leaderboards for momentum/runs/saves/signals, category demand signals, and explicit Create, Discover, and Pro actions. It does not render raw prompt text, member identifiers, or Stripe identifiers, and the save/signal winner slots stay honest when no public saves or signals exist yet.
- Authenticated members can now send or remove one community signal per prompt. Signals write only to `prompt_votes`, return private/no-store responses, and appear publicly only as aggregate `vote_count` and leaderboard momentum.
- Public prompts now have privacy-safe share pages at `/p/{slug}` with prompt-specific metadata and OG cards from public fields only. The focused prompt and workspace can copy or invoke a native share sheet without sending prompt context, member data, or referral events to the server.
- The fallback and database catalog now include 33 public prompts, including high-intent pricing, first-customer, landing-page, paid-community, privacy-bargain, retention, and paid-tier prompts. `npm run prompt:catalog:smoke` keeps the fallback catalog, seed, expansion migration, docs, and operator manifest in sync.
- Discovery and the workspace now include compact Revenue/Launch path controls that select the offer, pricing, customer, and trust-page prompts as a guided path toward paid validation without adding referral tracking or manipulative conversion copy.
- Prompt Packs now expose curated Revenue Launch, Community Market, and Sovereignty Audit journeys as a first-class app surface. Packs use public prompts only, open the normal editable workspace, and present Pro as run allowance for working through a serious journey rather than as a dark-pattern lock.
- The Packs surface now includes an interactive revenue-loop selector. It shows each pack's concrete artifact, four-step work loop, and upgrade moment while explicitly stating that pack ranking uses no private prompt context, member identity, or Stripe data.
- `npm run billing:integrity:smoke` and `npm run community:privacy:smoke` cover paid-access persistence and aggregate-only public discovery.
- Stripe success and cancellation returns now show an accessible, dismissible notice and remove the client-controlled `billing` marker from the URL. Success copy waits for `/api/auth/session` to prove Pro access; cancellation preserves free state and can reopen the transparent plan without creating a checkout session.
- `npm run billing:return:smoke` covers the return URLs, query cleanup, server-side entitlement check, honest copy, and recovery actions. Desktop and mobile browser checks pass with an opaque notice surface and no relevant console errors.
- Confirmed Pro members now receive a `Manage plan` control that creates a short-lived Customer Portal session only on explicit click. Both server and client restrict navigation to Stripe's HTTPS billing host; failures remain generic, private/no-store, and assure the member that their plan was not changed.
- The private session now derives an allowlisted billing lifecycle state without exposing raw Stripe status. Header management copy distinguishes renewal, trial end, scheduled access end, billing attention, and inactive history, formats the stored period date deterministically, and still opens Stripe only on explicit click.
- `npm run billing:portal:smoke` covers derived lifecycle copy, private/no-store session transport, Pro-only visibility, authentication ordering, local live-mode protection, portal host validation, private responses, and retryable UI. Runtime signed-out access returns private/no-store `401` before Stripe work.
- Members with any recorded Stripe subscription can manage billing even when Pro benefits are paused or past due. Checkout refuses active, trialing, past-due, unpaid, incomplete, or paused subscriptions with private `409` before Stripe work, while canceled and expired-incomplete subscriptions can start again.
- Restart-eligible former subscribers now receive a distinct `Restart Pro` entry alongside billing management. It appears only when the server-classified session permits checkout, explains that the old plan is inactive, shows the current terms, and still requires an explicit fresh Checkout click; active and recovery-state subscriptions remain management-only.
- Checkout Session creation uses a member-scoped 30-minute idempotency window so retries reuse one session instead of creating parallel subscription paths. `npm run billing:duplicate:smoke` covers status blocking, ordering, safe capability metadata, and idempotency.
- The displayed Pro price and server checks now share one `$12 USD monthly` contract. Checkout retrieves and verifies that the configured Stripe Price is active before customer creation; webhook fulfillment repeats the immutable amount, currency, cadence, per-unit, licensed-usage, and non-custom checks before granting Pro.
- `npm run billing:price:smoke` covers shared display terms and proves price validation precedes customer, Checkout Session, and entitlement work.
- Webhooks retrieve current subscription state before entitlement writes, so out-of-order delivery cannot restore stale access. Archived matching prices remain valid for existing subscribers, while altered, multi-item, or non-unit subscriptions explicitly fall back to free instead of retaining stale Pro access. `npm run billing:lifecycle:smoke` guards these boundaries.
- Prompt execution now persists a provider-start marker before calling the model and forwards browser abort signals to Anthropic. Only reservations that never reached the provider expire automatically; disconnects and ambiguous accounting failures remain counted, while confirmed provider failures are released. Terminal RPC errors are checked instead of silently acknowledged, and session usage includes unresolved provider-started runs. `npm run provider:accounting:smoke` guards this cost and quota boundary.
- Members whose existing subscription is active, trialing, past due, unpaid, incomplete, or paused are now sent to `Manage existing plan` instead of a duplicate checkout dead end. Canceled and expired-incomplete members can still start a fresh checkout.
- Checkout responses are private/no-store, provider failures stay generic, and both the server and browser reject non-Stripe Checkout destinations before navigation.
- Pro plan copy now distinguishes its paid unlimited monthly runs from free custom prompts, favorites, and community discovery. The 10 starts/hour pace and token ceilings bound provider spend transparently, while Workspace copy says `Save prompt` because generated results are not persisted by that control.
- `supabase/migrations/202606180008_unlimited_pro_runs.sql` is the forward migration that makes active Pro members return `runs_limit = null` from `reserve_prompt_run`, meaning no monthly paid cap. Apply it to production before advertising the paid unlimited contract live.
- `npm run db:apply:unlimited-pro -- --apply` applies only that pending unlimited-Pro SQL when `SUPABASE_DB_URL`, `DATABASE_URL`, `POSTGRES_URL`, or `SUPABASE_ACCESS_TOKEN` with a linked project is available. Without `--apply`, the helper performs a dry run and makes no database changes.
- Before generation, Prompt Atlas uses Anthropic's free token-count endpoint to enforce a 4,000-input-token ceiling, then caps output at 1,400 tokens. At Sonnet 4.6 list prices of `$3/M` input and `$15/M` output tokens, a fully-maxed run costs about `$0.033` in model tokens before payment and hosting costs. The paid offer is unlimited monthly runs with a 10/hour fair-use pace, so profit depends on launch pricing, usage distribution, and abuse controls rather than a hidden monthly cap. `npm run plan:economics:smoke` keeps the SQL, API, shared constants, and member-facing terms aligned.
- The updated public Pro dialog was checked through the signed-out discovery-to-workspace flow. Desktop DOM showed the full terms with no browser console warnings/errors; a fallback 390×844 headless render showed a 358px dialog with no horizontal overflow or clipped plan controls.
- The landing-header Pro entry was checked at desktop and 390×844 widths. It opens the full `$12/month`, unlimited-run terms directly; the mobile document remains 390px wide, the dialog remains 358px wide inside the viewport, and the browser reports no relevant warnings or errors.
- `npm run billing:intent:smoke` and `npm run billing:duplicate:smoke` guard landing-header plan discovery, proactive zero-run routing, former-subscriber restart eligibility, recovery-state management, upgrade-intent continuity, explicit checkout consent, and same-origin auth returns.
- A service-role-only Postgres function now computes Prompt Atlas activation, paid conversion, subscription run rate, month-to-date token cost, scheduled cancellation, billing recovery, restart, and free-limit pressure as one aggregate JSON object. The email-allowlisted `/operator` page receives no member names, emails, wallets, prompt text, context, fingerprints, Stripe identifiers, or individual run rows; it refreshes manually, sends no analytics event, calls no Stripe API, and labels contribution as not profit.
- The private `/operator` page now includes an aggregate-only launch board with MRR gap to `$1,000`, estimated model cost per completed run, demand/conversion/contribution posture, and next operator moves. It uses existing aggregate metrics only and never renders member rows, prompt text, fingerprints, or Stripe identifiers.
- `npm run operator:metrics:smoke` guards fail-closed operator authorization, aggregate-only SQL, service-role execution, strict private/no-store transport, noindex UI, estimate definitions, and the absence of polling or client analytics storage.
- `npm run lint`, `npm run build`, `npm run ui:smoke`, `npm audit --omit=dev`, and `npm run operator:smoke` pass; `npm run operator:smoke -- --list` prints the local plan without running child scripts, and the operator smoke manifest covers every local privacy, billing, community-growth, prompt-catalog, prompt-pack, share-link, aggregate-metrics, provider-accounting, and plan-economics guard with bounded timeouts and unknown-argument rejection. The browser screenshot check is explicit opt-in through `npm run operator:smoke -- --with-ui` because it launches or reuses a local dev server and writes screenshots.
- `npm run ui:smoke` now reuses an existing local Prompt Atlas server or starts one on `localhost:3110`, waits for client hydration, checks signed-out discovery, prompt deep links, prompt packs, the revenue-loop selector, mobile Revenue path selection, desktop and mobile workspace Launch path selection, community leaderboard sorting, Pro dialog, and 390px mobile overflow, and writes screenshots to `.next/ui-smoke/`. Set `PROMPT_ATLAS_BASE_URL=<preview-url>` to use the same smoke against Vercel preview.
- June 19, 2026 continuation: the root Society of Explorers `.com` app was deployed to production deployment `dpl_JDSw4d8JvJHExskroa4bvqP6mQa3`, aliased to `https://www.societyofexplorers.com` and `https://societyofexplorers.com`, after root `npm run build`, `npm run lint`, and `npm run operator:smoke` passed. `npm run capital:production:verify` passed against the live `.com` URL with `31` pass and `0` fail.
- June 19, 2026 continuation: the Prompt Atlas UI smoke now scopes the desktop `Packs` click to the primary `Prompt Atlas` navigation, avoiding a strict-mode collision with the `Open packs` call to action while preserving the end-to-end browser journey.
- June 19, 2026 continuation: root lint now ignores nested `.vercel` build output, so a Prompt Atlas prebuilt artifact cannot make root ESLint scan generated launcher files.
- June 19, 2026 continuation: Prompt Atlas was deployed to production deployment `dpl_HcsDCEPYEZoVC3zs2mqtifGBLgdt`, aliased to `https://prompts-mvp.vercel.app`, after Prompt Atlas `npm run lint`, `npm run build`, `npm run operator:smoke`, and local `npm run ui:smoke` passed. The live production check `PROMPT_ATLAS_BASE_URL=https://prompts-mvp.vercel.app npm run ui:smoke` now passes.
- A Vercel deployment is live at `https://prompts-mvp.vercel.app`, core production runtime/billing variables are installed in Vercel, and `PROMPT_ATLAS_BASE_URL=https://prompts-mvp.vercel.app npm run ui:smoke` passes. `SOE_ADMIN_EMAILS` still needs a real allowlisted email before `/operator` is usable, and Preview envs still need to be mirrored before preview transaction testing.
- Live Stripe objects now exist for Prompt Atlas Pro: product `prod_UjZ6nxqtOc9W9c`, monthly price `price_1Tk5yK5r4D5OocVfsOgVZEX9`, and an active webhook endpoint for `https://prompts-mvp.vercel.app/api/billing/webhook`. One earlier endpoint was disabled after setup retries.
- Stripe Customer Portal is now active for Prompt Atlas Pro. `npm run stripe:live:smoke` verifies the live Price, webhook, and Customer Portal without creating customers, subscriptions, Checkout Sessions, or charges, and can be included with `npm run operator:smoke -- --with-stripe-live`.
- Prompt Atlas migrations through `202606180007_prompt_catalog_expansion.sql` were previously applied in Supabase for project `woqvlkeluxkxplpgzdgv`, and `supabase/seed.sql` has seeded 33 public prompts. The newer `202606180008_unlimited_pro_runs.sql` migration still needs to be applied to production; the strengthened `npm run db:readiness:smoke` currently reaches production and fails because active Pro reservations still return a finite `runs_limit` instead of `null`.
- Production backend probes are fail-closed for signed-out visitors: `/api/auth/session` returns private/no-store `200`, `/api/prompts/execute` returns private/no-store `401`, `/api/billing/checkout` returns private/no-store `401` before Stripe work, and `/api/operator/metrics` returns private/no-store `401` before aggregate reads.
- `/api/prompts?sort=trending` and `/api/community` now return `source: "database"` with 33 prompts on the live alias.
- `npm run db:readiness:smoke` validates production Supabase table/view/RPC contracts plus the active-Pro unlimited reservation contract in one pass. It now correctly fails until `202606180008_unlimited_pro_runs.sql` is applied to production.
- `PROMPT_ATLAS_BASE_URL=https://prompts-mvp.vercel.app npm run execute:live:smoke` passes. It creates a temporary wallet member, calls the production streaming Claude execution route, verifies SSE `meta`, `delta`, and `done` events plus token accounting, and deletes the temporary member afterward.
- `npm run vercel:env:smoke` now checks Vercel env metadata without exposing values. It currently fails because Production is missing `SOE_ADMIN_EMAILS`, and Preview is missing all required Prompt Atlas runtime/billing variables.
- `npm run check:env` now reads local and Vercel-pulled env files. It currently reports the missing local `STRIPE_WEBHOOK_SECRET_PROMPTS` and missing `SOE_ADMIN_EMAILS`; Vercel sensitive values may be pulled as blank placeholders, so local execution needs real secrets in an uncommitted local env or exported shell env.
- This machine currently has `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, but no `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_URL`, `DATABASE_URL`, or `POSTGRES_URL`, so service-role validation can run but schema DDL cannot be applied from here yet.
- The next high-value production slice is still applying `202606180008_unlimited_pro_runs.sql` with `npm run db:apply:unlimited-pro -- --apply` once migration-capable credentials are present, rerunning `npm run db:readiness:smoke` until it passes, setting `SOE_ADMIN_EMAILS`, adding safe Preview/test envs, then running one aggregate `/operator` read and one Stripe test-mode subscription/recovery pass. This machine still lacks `SUPABASE_DB_URL`, `DATABASE_URL`, `POSTGRES_URL`, or a linked `SUPABASE_ACCESS_TOKEN`; `npm run vercel:env:smoke` still fails because Production is missing `SOE_ADMIN_EMAILS` and Preview has no Prompt Atlas runtime/billing variables.

## Start or Resume

Use one goal prompt with a concrete terminal condition:

```text
/goal Continue Prompt Atlas in /prompts-mvp. Preserve every existing root change. Read the active plan, pick the highest-value incomplete item, implement it, test it in the browser, and update the plan. Do not deploy production or change DNS unless preview checks pass.
```

Useful continuation prompts:

```text
Continue the active Prompt Atlas goal. Inspect current git status and the plan first, then complete the next pending slice with tests.
```

```text
Continue UI polish against docs/design/*.png. Check desktop and mobile, record concrete mismatches, fix them, and rebuild.
```

```text
Continue production readiness. Run schema/API/privacy/payment failure-path checks, fix findings, and update the deployment runbook.
```

```text
Continue growth work. Use real aggregate product signals only; propose and implement one ethical conversion improvement without weakening privacy or member agency.
```

## Monitor Progress

- Keep the goal thread open in Codex desktop; interim updates show the current slice and blockers.
- Ask `status` at any time. Codex should report completed work, the active plan item, verification results, and blockers, then continue unless told to pause.
- Use the shared terminal to watch `npm run dev`, builds, or test output.
- Review `git status --short prompts-mvp` to see only the isolated product changes.
- Run `npm run ui:smoke` from `/prompts-mvp` for a repeatable browser check; review `.next/ui-smoke/` screenshots when a visual change lands.
- Run `npm run db:readiness:smoke` after Supabase SQL changes; it should pass before live execution, billing webhooks, or `/operator` are called production-ready.
- Run `PROMPT_ATLAS_BASE_URL=<deployment-url> npm run execute:live:smoke` when you need to prove the authenticated Claude execution path. It calls the model once, so keep it explicit.
- Run `npm run vercel:env:smoke` to check Vercel Production/Preview env parity without exposing values.
- Preview deployments and Vercel logs are the production progress signal; local screenshots alone are not enough.

For a 12-hour shift, leave the machine awake, network connected, and the Codex desktop thread active. Credentials should be installed in Supabase, Stripe, Anthropic/Vercel AI Gateway, and Vercel environment settings, never pasted into chat or committed to Git.
