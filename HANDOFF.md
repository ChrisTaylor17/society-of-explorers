# SoE HANDOFF

Bounded audit of `ChrisTaylor17/society-of-explorers`, branch `codex/soe-first-release`, starting commit `928381b` in worktree `/Users/christaylor/Documents/Codex/soe-release`, written 2026-11-11. The prior `RELEASE_STATUS.md`, `DONE.md`, `DECISIONS.md` and `README.md` remain authoritative for dated test and deployment receipts; this file consolidates architecture and open work from committed source.

## Audit scope and limits

- All findings are read from tracked source at `HEAD` via `git show HEAD:path` and `git grep ... HEAD`, not from the working tree. iCloud-offloaded files were not forced open.
- **No fresh build, test, lint, SQL migration, device install or network call was run in this audit.** Where test counts, APK sizes or build timings appear, they are quoted from `DONE.md` / `RELEASE_STATUS.md` and dated there, not re-verified here.
- `.env`, credentials, private member records and the Obsidian vault were not read.
- Sampled directly: `README.md`, `DONE.md`, `DECISIONS.md`, `RELEASE_STATUS.md`, `package.json`, `next.config.ts`, `proxy.ts`, `foundry.toml`, `lib/solana/mintExp.ts`, `lib/payments/{stripeMode,membershipTier,legacyBilling}.ts`, `lib/supabase/{client,admin}.ts`, `lib/blockchain/membership.ts`, `lib/supporter/server.ts`, `lib/ai/anthropic.ts`, `lib/join/content.ts`, `lib/account/{deletion-config,erasure-access}.ts`, `app/api/checkout/route.ts`, `app/api/stripe/webhook/route.ts`, `app/api/webhooks/stripe/route.ts`, `app/api/exp/award/route.ts`, `app/api/member/wallet/route.ts`, `app/api/account/deletion/route.ts`, `app/page.tsx`, `app/HomePageClient.tsx` (head), `app/try/page.tsx`, `app/tokenomics/page.tsx` (head), `supabase/migrations/20261027_soe_circles.sql`, directory listings for `app/`, `app/api/`, `lib/`, `components/`, `contracts/`, `supabase/migrations/`, `platforms/native/`.
- Indirect inventories: `git grep HEAD` for `TODO/FIXME`, closed/unavailable markers, `process.env.*`, Solana/EVM mint callers, supporter wiring, EXP tokens, AI providers.

Treat anything outside the sampled files as unaudited.

## 1. Current architecture

### Stack

- **Framework:** Next.js `^16.2.9`, React `19.2.4`, Turbopack dev, TypeScript `^5`, Tailwind v4 via `@tailwindcss/postcss`. `next.config.ts` enables `outputFileTracingIncludes` for `great-books` and `clips` content and disables `scrollRestoration`. There is no `middleware.ts`; the project ships `proxy.ts` (Vercel-style edge proxy exports a `proxy()` function) which sets private cache / robots / referrer / permissions headers, varies on `Cookie`, and handles wallet-sign-out redirect state before passing the request on. `AGENTS.md` warns that "this is NOT the Next.js you know" — read `node_modules/next/dist/docs/` before changing routing primitives.
- **Backend:** Supabase (Postgres + Auth + service role). Two clients:
  - `lib/supabase/client.ts` — `createBrowserClient` with placeholder fallbacks so build-time prerender never throws when envs are missing.
  - `lib/supabase/admin.ts` — service-role client; throws `Missing Supabase admin environment variables` at first use if `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are unset.
  - 22 SQL migrations in `supabase/migrations/` (earliest `20260404_twiddletwattle.sql`, latest `20261027_soe_circles.sql` adding circle_* columns and three RLS-locked private tables). Rollbacks exist for only the two most recent migrations.
- **Payments:**
  - `lib/payments/stripeMode.ts` enforces TEST keys outside `VERCEL_ENV=production` and refuses live keys off production. Membership tier ids `seeker | scholar | philosopher | oracle`, env slots `STRIPE_PRICE_<TIER>` (live) and `STRIPE_TEST_PRICE_<TIER>` (test).
  - `lib/payments/membershipTier.ts` lists exact published prices as `$19 / $49 / $99 / $499` tied to those four tiers; `oracle` is lifetime (one-time) and shielded from downgrades.
  - `lib/supporter/*` runs a separate, idempotent "optional $10/mo supporter" Stripe flow with its own offer/status/checkout/portal/return/webhook endpoints and review-token / revision protocol.
  - `lib/payments/legacyBilling.ts` dispatches historical membership and invoice events through a verified-account, hash-and-CAS repository; supporter and pledge event types are explicitly excluded.
- **Blockchain:**
  - **Solana EXP mint** (`lib/solana/mintExp.ts`): Token-2022 with the NonTransferable extension, requires `SOLANA_RPC_URL / SOLANA_MINT_AUTHORITY_KEY / SOLANA_EXP_MINT` and lazy-imports `@solana/web3.js`, `@solana/spl-token`, `bs58` (none of which are declared in `package.json`).
  - **EVM membership** (`lib/blockchain/membership.ts`): `viem` wallet client on Base chain, signs with `SOE_ADMIN_PRIVATE_KEY`, reads `NEXT_PUBLIC_SOE_MEMBERSHIP_ADDRESS` / `NEXT_PUBLIC_SOE_ACHIEVEMENTS_ADDRESS` (both default to zero-address and the mint helpers throw `contract not deployed` when unset).
  - **Solidity sources** under `contracts/` (compiled with Foundry via `foundry.toml`): `SoEMembership.sol`, `SoEAchievements.sol`, `RitualMarketplace.sol`, `SocietyNFT.sol`, `MockSOE.sol`. Only Base Sepolia RPC/etherscan endpoints are configured in `foundry.toml` — no mainnet address pinned.
- **AI:** `@anthropic-ai/sdk ^0.104.2`. `lib/ai/anthropic.ts` routes through the Vercel AI Gateway when `AI_GATEWAY_API_KEY` (or `VERCEL_OIDC_TOKEN`) is present and `AI_GATEWAY_ENABLED !== 'false'`, falling back to direct Anthropic with `claude-sonnet-4-6`. Model-per-purpose override via `AI_GATEWAY_<PURPOSE>_MODEL`. Call sites include thinker chat, council verdict, insights, great-books annotate/seminar streams, email provocations, merch generation, movement personal-AI chat.
- **Email:** Resend (`resend ^6.14.0`), gated per feature by `*_EMAIL_NOTIFICATIONS_ENABLED` flags. Capital/webhook email send respects `capitalWebhookEmailSkipReason`.
- **Media / integrations:** Printful (merch fulfillment via `app/api/webhooks/stripe/route.ts`), FAL (`FAL_API_KEY` for merch mockup), ElevenLabs (`ELEVENLABS_API_KEY`), Daily (`DAILY_API_KEY`), OpenAI Realtime (`OPENAI_REALTIME_MODEL`) for voice.
- **Native / Quest:** `platforms/native/*.tsx` React Native screens (circle, fellowship, reader, clips, profile). `platforms/README.md` + `ORIGIN.json` + `PLATFORM_SOURCE_SHA256.json` document the shared source pin. Android debug APK was built against `8bb9f12` per `RELEASE_STATUS.md`; no iOS build.
- **Deployment:** Vercel (`VERCEL_ENV`, `VERCEL_OIDC_TOKEN`), `vercel.json` present, `.vercelignore` present, `deploy.sh` / `deploy.command` in-repo scripts. Not pushed to primary domain in this finish pass.

### Runtime surface (counts from `git ls-tree HEAD`)

- `app/api/` has **62** top-level route groups; the full subtree includes stripe membership webhook, stripe merch webhook, supporter checkout/webhook/status/portal/offer/return, checkout, exp/award, circles (29 sub-routes), book-salons, account/deletion, council, council-waitlist, auth, twiddle/cron, world/scan/annotate, music-therapy, movement, memory, member/wallet, 92b/project pledges, artifacts/mint+merch+generate, insights, dashboard/briefing, match, moderation, salon-hub, hall, store, scan, nft, tts/transcribe/voice-notes.
- `app/` has **80+** page/section directories including `/try`, `/great-books`, `/fellowship`, `/salons`, `/book-salons`, `/circles`, `/council`, `/dashboard`, `/explorer`, `/explore`, `/manifesto`, `/vision`, `/tokenomics`, `/tokens`, `/structure`, `/three-pillars`, `/transparency`, `/roadmap`, `/billing`, `/join`, `/login`, `/privacy`, `/waddle`, `/twiddle`, `/leaderboard`, `/capital/*`.
- `scripts/` holds ~80 `*-smoke.mjs` / policy scripts wired into `npm run test:*` and per-feature `*:smoke` scripts in `package.json`.
- `76` distinct `process.env.*` identifiers are referenced across `app/` + `lib/` (see §4).

## 2. What works (verified by source, not re-tested here)

Everything below exists as finished code at `HEAD`. The dated acceptance for each item lives in `RELEASE_STATUS.md` / `docs/integration/*`; this audit did not rerun those suites.

- **Public reading trial** (`/try`) with Christian-rooted entry, Luke 10 passage, and links into `/great-books` and `/fellowship`. No account/payment/wallet needed.
- **`/great-books`** full-text local editions with no-JavaScript recovery path (per the November 11 reader-noscript fix in `DONE.md`), linked Scripture comparison, and source credits.
- **`/fellowship`** (Christian fellowship + Good Samaritan + Philemon + Josephus dossier) with Scripture comparison export, correction-proposal links.
- **`/salons/pilot`** 4-week, 6–8 adult plan — content only; host and dates unconfirmed.
- **`/book-salons`** public discovery, authenticated creation/join via `app/api/book-salons/*` and the November 8 account-lifecycle fix (receipts in `DONE.md`).
- **Circles MVP** — 29 API routes under `app/api/circles/*` cover admission, invitations (recipient-code + review + revoke), join/leave, membership, discussion (+preview), passages (+preview), RSVP, review, report, salon-presence, AI consent per message, start-with-receipt (same-tab reload recovery — commit `8bb9f12`). Schema in `supabase/migrations/20261027_soe_circles.sql`, with RLS on and no `anon`/`authenticated` grants on the three new tables.
- **Native Circle creation refusal handling** (`3d05d42`) and **account deletion progress reporting** (`acefb01`) — both have passing focused test counts recorded in `DONE.md`.
- **Account deletion intake** (`app/api/account/deletion/route.ts`) — owner-bound receipt lookup, website-account selection via `AUTH_INTENT_COOKIE` + `AUTH_SELECTION_COOKIE`, Supabase and wallet providers both supported.
- **Supporter subscription** ($10/mo) end-to-end with offer / status / checkout / portal / return / webhook, review-token binding and legacy-billing separation. Entry at `/billing` and `/join` (`lib/join/content.ts`).
- **Stripe webhook** (`app/api/stripe/webhook/route.ts`) handles 92B pledges and project pledges with idempotency via `exp_events` + `webhook_events` tables; supporter events are refused so they only land on the supporter endpoint. Separate `app/api/webhooks/stripe/route.ts` fulfills Printful orders from merch checkouts.
- **Thinker system** — Claude-backed personas (Socrates/Plato/Aurelius/Nietzsche/Einstein/Jobs) wired through `/api/thinker` with council context and a `soe_thinker_reward_receipt` RPC that gates EXP accrual.
- **Internal EXP point ledger** — `members.exp_tokens` denormalized balance plus `exp_events` ledger; written from scan scoring, world annotate, world scan verify, match respond, store buy, stripe pledge webhook. `/api/exp/award` is explicitly closed (410 Gone).
- **Private-header proxy** (`proxy.ts`) sets `cache-control: private, no-store`, `x-robots-tag: noindex, nofollow, noarchive`, `vary: Cookie`, strict permissions policy, and handles wallet-session recovery on `/login`.
- **Legacy membership sales kill-switch** — `/api/checkout` returns **HTTP 410** with `code: legacy_sales_closed` unless `SOE_LEGACY_MEMBERSHIP_SALES_ENABLED === 'true'` (the default). Existing subscriptions still reconcile through `lib/payments/legacyBilling.ts`.
- **Stripe test-mode guardrail** — live keys outside `VERCEL_ENV=production` are refused by `resolveStripeSecretKey`.
- **Separate static reading preview** published at `https://soe-reading-room.societyofexplorers.chatgpt.site` via the Pro account's Sites hosting — independent of this app's deployment.

## 3. What is broken, stubbed, closed, or blocked

### Blockchain

- **Solana EXP minting is defined but never called.** `git grep HEAD` for `mintExpToWallet` and `isSolanaMintingEnabled` returns only the definitions in `lib/solana/mintExp.ts`; no route, webhook, cron or server action imports them. EXP flows terminate in `members.exp_tokens` + `exp_events` (Supabase). The lazy imports (`@solana/web3.js`, `@solana/spl-token`, `bs58`) are also **not declared** in `package.json`, so even calling `mintExpToWallet` with envs set would throw on `await import('@solana/web3.js')` until those packages are added.
- **EVM membership NFT mint is behind two gates.** `app/api/member/wallet/route.ts` only calls `mintMembershipNFT` when `MEMBERSHIP_NFT_AUTO_MINT_ENABLED === 'true'` and the member has a `pending_mints` row with `minted=false`. `SOE_MEMBERSHIP_ADDRESS` / `SOE_ACHIEVEMENTS_ADDRESS` default to `0x0…0`, which makes the helpers in `lib/blockchain/membership.ts` throw `contract not deployed`. The `try/catch` in the route swallows that error so wallet attach still returns `success: true` with `minting.status: 'pending'` — in practice, no on-chain mint happens.
- **Contract deploy state unverified from source.** `foundry.toml` lists only Base Sepolia RPC/etherscan. There is no committed deployment manifest in `contracts/` or `platforms/`, so the production address for `SoEMembership` / `SoEAchievements` / `RitualMarketplace` / `SocietyNFT` / `MockSOE` is not derivable from the repo.
- **`/tokens` and `/tokenomics` pages** describe `$EXP` burns, labyrinth passes, `$SOE` ritual NFTs and Solana Token-2022 as **proposals**. The pages themselves state "no purchase, trading, minting or redemption service" is provided here.

### Payments

- **Four-tier membership checkout** (`seeker/scholar/philosopher/oracle`) is intentionally **closed** (`SOE_LEGACY_MEMBERSHIP_SALES_ENABLED !== 'true'` → 410). The published pricing in `lib/payments/membershipTier.ts` ($19 / $49 / $99 / $499) survives only to reconcile existing subscriptions. Live UI advertises only the **free account** and the optional **$10 supporter** (`lib/join/content.ts` TIERS).
- **Capital pledge checkout** (`lib/capital/projectPledgeStripe.ts`) returns `pledges_unconfigured` 503 when not configured.
- **Merch pipeline** needs `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET_MERCH` and `PRINTFUL_API_KEY`; each returns 503 / 500 when unset. `app/salon/MerchOverlay.tsx` shows "This product's Printful variant ID is not yet set" and requires a manual edit to PRODUCTS.

### Member platform / privacy

- **Account deletion intake is flag-gated.** `deletionReviewDays()` returns `null` unless `SOE_ACCOUNT_DELETION_REQUESTS_ENABLED === 'true'` AND `SOE_ACCOUNT_DELETION_REVIEW_DAYS` matches `1–30`. `/account/delete` therefore renders "New deletion requests are currently unavailable here" by default.
- **Erasure-access RPC** (`lib/account/erasure-access.ts`) returns `true` (allows) when the kill-switch `SOE_ACCOUNT_ERASURE_ACCESS_ENABLED !== 'true'`; when enabled, it calls the Supabase RPC `soe_account_erasure_access_allowed` with a 3-second abort. End-to-end erasure outcome (actual row removal, third-party deletion, retention policy) is **not** source-verified here — `DONE.md` keeps "complete account erasure/provider services" blocked.
- **Hosted member release blocked.** Per `DONE.md`, the current hosted backup/restore result is `NOT_READY_NO_PASSWORD_REQUESTED`; no verified database login happened in this finish pass.
- **Retention policy for withdrawn messages is "not yet finalized"** — strings in `app/circles/messages/MessageActions.tsx` and `/circles/norms/page.tsx`.

### AI / content

- **`SOE_MESSAGE_AI_ENABLED` disabled by default** — Anthropic moderation is still code-complete but the provider is explicitly off per `RELEASE_STATUS.md`.
- **Realtime voice sessions** (`app/api/movement/realtime/session/route.ts`) return "Realtime voice sessions are not configured." when `OPENAI_API_KEY` / `OPENAI_REALTIME_MODEL` are absent.
- **Wallet sign-in** (`app/api/auth/nonce/route.ts`) returns 503 "Wallet sign-in is not configured." when SIWE/wallet-session envs are missing.
- **Artifacts NFT mint** (`app/api/artifacts/mint/route.ts`) 503s on `Artifact NFT contract is not configured`.

### Native / device

- **No iOS build.** `RELEASE_STATUS.md` says only CommandLineTools is present, no Xcode SDK, ~13 GiB free vs ~40 GiB plan.
- **Android APK not re-cut after the November 11 Circle recovery fix.** `DONE.md` explicitly **pauses** new web/Android builds at owner request; the prior APK is the November 9 debug build at commit `8bb9f12` without the Circle creation recovery repair.
- **Quest / headset acceptance** has no physical-device test.
- **Live/spatial meeting** (`app/fellowship/page.tsx`): "A spatial voice or avatar service is not yet established."

### Miscellaneous

- `components/ArtifactGenerator.tsx` plus `app/api/artifacts/generate|mint|merch|generate-mockup` form a pipeline that depends on FAL, Anthropic, Printful and an NFT contract — all four must be configured for the full flow.
- `lib/memory/sharedMemory.ts:315` — `// TODO: fetch custom thinkers from communities table`.
- `lib/movement/pod.ts:253` — `// TODO: migrate to client-side key derivation from a wallet signature so the server never sees pod keys.`
- `lib/movement/personalities/buck-holler.ts:1` — `// TODO: Confirm legal name clearance before public launch.`
- Two `node_modules` symlinks and a `.next 2` directory are present in the worktree root — environment artifacts, not tracked content, but worth cleaning before any snapshot build.
- `app/HomePageClient.tsx` hard-codes `PROMPT_ATLAS_URL = 'https://prompts-mvp.vercel.app'`; its live state is outside the repo.

## 4. Environment variables referenced in tracked source

Enumerated via `git grep -n -I -E 'process\.env\.[A-Z_]+' HEAD -- 'app/**' 'lib/**'`; 76 distinct names. Grouped:

- **Supabase / auth (5):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `WALLET_ENCRYPTION_KEY`, `WALLET_SESSION_SECRET` (plus `NEXTAUTH_SECRET`).
- **Stripe / payments (10):** `STRIPE_SECRET_KEY`, `STRIPE_TEST_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET_MERCH`, `STRIPE_PRICE_{SEEKER,SCHOLAR,PHILOSOPHER,ORACLE}`, `STRIPE_TEST_PRICE_<TIER>` (indirect via `TEST_PRICE_ENV`), `SOE_LEGACY_MEMBERSHIP_SALES_ENABLED`.
- **Solana (3):** `SOLANA_RPC_URL`, `SOLANA_MINT_AUTHORITY_KEY`, `SOLANA_EXP_MINT` — **no caller uses them**.
- **EVM (8):** `SOE_ADMIN_PRIVATE_KEY`, `SOE_ADMIN_WALLETS`, `SOE_ADMIN_WALLET_ADDRESSES`, `SOE_DISABLE_LOCAL_WALLET_ADMIN`, `NEXT_PUBLIC_BASE_RPC_URL`, `NEXT_PUBLIC_BASE_MAINNET_RPC_URL`, `NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL`, `NEXT_PUBLIC_SOE_DEFAULT_CHAIN_ID` + contract address envs.
- **Contract addresses (5):** `NEXT_PUBLIC_SOE_MEMBERSHIP_ADDRESS`, `NEXT_PUBLIC_SOE_ACHIEVEMENTS_ADDRESS`, `NEXT_PUBLIC_SOCIETY_NFT_ADDRESS`, `NEXT_PUBLIC_SOCIETY_NFT_CONTRACT`, `NEXT_PUBLIC_RITUAL_MARKETPLACE_ADDRESS`, `NEXT_PUBLIC_MOCK_SOE_ADDRESS`.
- **AI / voice (8):** `ANTHROPIC_API_KEY`, `AI_GATEWAY_API_KEY`, `AI_GATEWAY_ENABLED`, `AI_GATEWAY_ANTHROPIC_MODEL`, `AI_GATEWAY_ANTHROPIC_BASE_URL`, `MOVEMENT_CLAUDE_MODEL`, `OPENAI_API_KEY`, `OPENAI_REALTIME_MODEL`, `ELEVENLABS_API_KEY`, `DAILY_API_KEY`.
- **Email / notifications (10 flags):** `RESEND_API_KEY`, plus `CAPITAL_LEAD_EMAIL_NOTIFICATIONS_ENABLED`, `CAPITAL_WEBHOOK_EMAIL_NOTIFICATIONS_ENABLED`, `COUNCIL_WAITLIST_EMAIL_NOTIFICATIONS_ENABLED`, `DAILY_PRACTICE_EMAIL_NOTIFICATIONS_ENABLED`, `DAILY_PRACTICE_FOLLOWUP_EMAIL_NOTIFICATIONS_ENABLED`, `DAILY_PRACTICE_AI_REFLECTIONS_ENABLED`, `DM_EMAIL_NOTIFICATIONS_ENABLED`, `ONBOARDING_EMAIL_NOTIFICATIONS_ENABLED`, `ONBOARDING_BATCH_TRIGGER_ENABLED`, `PROJECT_LEAD_EMAIL_NOTIFICATIONS_ENABLED`, `PROVOCATION_TEST_EMAIL_NOTIFICATIONS_ENABLED`, `PROVOCATION_WEEKLY_EMAIL_NOTIFICATIONS_ENABLED`, `PUBLIC_LEAD_EMAIL_NOTIFICATIONS_ENABLED`.
- **Feature flags (9):** `SOE_ACCOUNT_DELETION_REQUESTS_ENABLED`, `SOE_ACCOUNT_DELETION_REVIEW_DAYS`, `SOE_ACCOUNT_ERASURE_ACCESS_ENABLED`, `SOE_MESSAGE_AI_ENABLED`, `SOE_SHARED_SALON_ENABLED`, `MEMBERSHIP_NFT_AUTO_MINT_ENABLED`, `ARTIFACT_MERCH_ORDERING_ENABLED`, `ARTIFACT_NFT_MINT_RECORDING_ENABLED`, `MOVEMENT_ONCHAIN`.
- **External pipelines (4):** `PRINTFUL_API_KEY`, `FAL_API_KEY`, `SCAN_SCORING_API_KEY`, `MOVEMENT_POD_SECRET`.
- **Runtime (misc):** `CRON_SECRET`, `VERCEL_REGION`, `VERCEL_OIDC_TOKEN`, `NODE_ENV`, `NEXT_PUBLIC_SITE_URL`, `SITE_URL`, `SOE_ADMIN_EMAILS`, `OPENAI_SAFETY_SALT`.

Nothing here lets one flip a single switch into a working production state — several independent subsystems each need their own set of secrets, and (per §3) a few need code wiring before secrets will do anything.

## 5. Known gaps and TODOs (in-source and release-tracked)

In-source `TODO` comments from committed code:

- `lib/memory/sharedMemory.ts:315` — fetch custom thinkers from `communities`.
- `lib/movement/pod.ts:253` — move pod-key derivation to the client so the server never sees pod keys.
- `lib/movement/personalities/buck-holler.ts:1` — confirm legal-name clearance before public launch.
- `app/salon/MerchOverlay.tsx:264` — product's Printful variant id is not yet set; manual edit needed.
- `app/fellowship/page.tsx:60` — "A spatial voice or avatar service is not yet established."
- `app/structure/page.tsx:14` — local-first storage / portable identity / E2E encryption are "directions we are exploring".

Open from `DONE.md` / `RELEASE_STATUS.md` (paraphrased; see the dated receipts there):

1. **Paused — new web and Android builds** (owner request) against the committed follow-up source (including `8bb9f12`, `3d05d42`, `acefb01`): complete fixture review, run combined build + native types + compiled-browser check, rebuild the Android APK with the circle recovery repair.
2. **Blocked — hosted backup/restore:** no verified database login yet (hidden password entry outstanding).
3. **Blocked — hosted member release:** schema/access controls, two-account denial and sign-in/recovery acceptance all depend on 2.
4. **Blocked — complete account erasure + provider services:** retention policy, actual erasure, named-provider operation.
5. **Blocked — phone / headset release acceptance:** no physical Android/Quest device, ADB not on path, iOS SDK/space missing.
6. **Blocked — primary-domain Vercel update:** needs a bounded hosting-cost authorization (owner notes "up to $5" is the proposal).
7. **Blocked — paid member offer / real cohort:** no verified hosted account/payment/fulfillment path or a confirmed host and dates.

## 6. Prioritized next steps

Ordered by what unblocks the most downstream work with the least spend. Nothing below has been executed in this audit.

**P0 — truth up the public offer surface**

1. **Decide the fate of the four-tier membership code path.** Either ship a documented removal of `STRIPE_PRICE_{SEEKER,SCHOLAR,PHILOSOPHER,ORACLE}` plus `lib/payments/membershipTier.ts` EXACT_PRICES, or keep the kill-switch and add an ADR explaining why. Right now `lib/join/content.ts` TIERS advertises only free + supporter, but `app/api/checkout/route.ts` still accepts four tier names if `SOE_LEGACY_MEMBERSHIP_SALES_ENABLED=true` flips. Reduce the attack/bug surface.
2. **Delete or wire Solana EXP mint.** `lib/solana/mintExp.ts` is dead code today — neither imported nor its packages declared in `package.json`. Either remove it and the three `SOLANA_*` envs from the repo, or add the dependencies and a caller (e.g. inside the thinker reward / scan-score / annotate paths) with a feature flag symmetrical to `MEMBERSHIP_NFT_AUTO_MINT_ENABLED`.
3. **Finish the paused web/Android rebuild** (`DONE.md` item 1): the prior APK is missing the November 11 Circle recovery repair, and no fresh full build has been produced against the current `HEAD`. This audit did **not** run a build; owner request is to wait, so mark the priority but not the start.

**P1 — close the credible-release gaps**

4. **Hosted DB entry + schema apply** (unblocks member release): the November 11 recheck returned `NOT_READY_NO_PASSWORD_REQUESTED`. Until password entry succeeds, every "member-dependent" feature (deletion, matching, invitations with real recovery) is unverifiable in production.
5. **Account erasure policy + endpoints enablement.** Decide retention, flip `SOE_ACCOUNT_DELETION_REQUESTS_ENABLED` + `SOE_ACCOUNT_ERASURE_ACCESS_ENABLED`, apply the RPC, and verify `/account/delete` end-to-end.
6. **EVM address pinning.** If `SoEMembership` and `SoEAchievements` are deployed on Base mainnet, commit the deployed addresses (or a manifest) and remove the silent 0x0 fallback that returns `success:true` without minting.
7. **Finalize the "retention policy" strings** in `app/circles/messages/MessageActions.tsx` + `/circles/norms/page.tsx` ("not yet finalized").

**P2 — hygiene before a public domain cutover**

8. **Workspace cleanup.** Root-level `.next 2`, `node_modules.before-finish-2026-11-11` symlink and `node_modules -> runtime-locked/...` symlink are environmental, not tracked; verify the build/tracing does not accidentally include them before a Vercel deploy.
9. **Audit the three in-source TODOs** (shared memory, pod keys, Buck Holler name clearance) and decide whether any block the next pilot; pod keys in particular is a privacy-model claim surfaced on `/structure` and `/privacy`.
10. **Physical device plan.** `RELEASE_STATUS.md` records the iOS tooling gap (no Xcode SDK, ~13 GiB free vs ~40 GiB plan) and missing ADB. Decide whether to borrow a device, defer, or allocate storage — none of this is reversible from the repo.
11. **Vercel primary-domain promotion** of the readings bundle only after 8 and the owner's bounded $5 spend authorization in `DONE.md`.

## 7. Bounded-audit disclosures

- Starting commit: `928381b docs: save verified fixes and owner-requested stopping point`. Worktree clean before this write; only `HANDOFF.md` is being added and committed by this audit.
- No fresh `npm run build`, `npm run lint`, `npm test`, `npm run test:web`, `npm run test:platforms`, Supabase apply, Vercel deploy, Stripe call, Anthropic call, Solana or Base transaction, or device install was run. Quoted test counts, APK sizes and build timings all come from `DONE.md` and `RELEASE_STATUS.md` and are dated there.
- No secrets, `.env` files, member records or Obsidian vault contents were read.
- Working-tree file reads were deliberately avoided after the first read of `README.md`, `DONE.md`, `DECISIONS.md`, `RELEASE_STATUS.md`, `package.json`, `next.config.ts`, `lib/solana/mintExp.ts`, `lib/payments/membershipTier.ts`, `lib/payments/stripeMode.ts`, `lib/supabase/client.ts`, `lib/supabase/admin.ts`, `app/api/checkout/route.ts`, `app/api/stripe/webhook/route.ts`, `app/api/exp/award/route.ts` (an inherited recursive grep had stalled on offloaded files, after which this audit switched to `git grep HEAD` and `git show HEAD:path` for every subsequent inspection).
- All other claims above are grounded in `git show HEAD:path` or `git grep -n -I HEAD`. Any file this HANDOFF did not read is explicitly unaudited.

End of HANDOFF.
