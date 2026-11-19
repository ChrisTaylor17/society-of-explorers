# SOE Environment Readiness Template

Status: local operator template. This document does not authorize editing production secrets, creating checkout sessions, replaying webhooks, deploying, sending messages, or mutating connected tools.

## Purpose

This template turns the current launch blockers into a repeatable environment checklist. Use it before 92B patronage tests, private admin review, AI feature checks, or deployment review.

## Local / Test Baseline

Use local or test-mode values first:

```bash
NEXT_PUBLIC_SITE_URL=http://localhost:3000
SITE_URL=http://localhost:3000

NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

STRIPE_SECRET_KEY=sk_test_replace_me
STRIPE_WEBHOOK_SECRET=whsec_test_replace_me
STRIPE_WEBHOOK_SECRET_MERCH=whsec_test_merch_replace_me
STRIPE_PRICE_SEEKER=price_test_seeker
STRIPE_PRICE_SCHOLAR=price_test_scholar
STRIPE_PRICE_PHILOSOPHER=price_test_philosopher
STRIPE_PRICE_ORACLE=price_test_oracle
CAPITAL_WEBHOOK_EMAIL_NOTIFICATIONS_ENABLED=false
CAPITAL_LEAD_EMAIL_NOTIFICATIONS_ENABLED=false
PROJECT_LEAD_EMAIL_NOTIFICATIONS_ENABLED=false
PUBLIC_LEAD_EMAIL_NOTIFICATIONS_ENABLED=false
COUNCIL_WAITLIST_EMAIL_NOTIFICATIONS_ENABLED=false
DAILY_PRACTICE_EMAIL_NOTIFICATIONS_ENABLED=false
DAILY_PRACTICE_FOLLOWUP_EMAIL_NOTIFICATIONS_ENABLED=false
PROACTIVE_EMAIL_NOTIFICATIONS_ENABLED=false
PROVOCATION_TEST_EMAIL_NOTIFICATIONS_ENABLED=false
PROVOCATION_WEEKLY_EMAIL_NOTIFICATIONS_ENABLED=false
ONBOARDING_EMAIL_NOTIFICATIONS_ENABLED=false
ONBOARDING_BATCH_TRIGGER_ENABLED=false
DM_EMAIL_NOTIFICATIONS_ENABLED=false

SOE_ADMIN_EMAILS=chris@example.com
SOE_ADMIN_WALLETS=
SOE_ADMIN_WALLET_ADDRESSES=
SOE_DISABLE_LOCAL_WALLET_ADMIN=false

NEXTAUTH_SECRET=replace_with_random_local_secret
WALLET_SESSION_SECRET=replace_with_random_wallet_session_secret
MOVEMENT_POD_SECRET=replace_with_random_pod_secret
WALLET_ENCRYPTION_KEY=replace_with_64_char_hex_wallet_encryption_key
CRON_SECRET=replace_with_random_cron_secret
```

Rules:

- `WALLET_ENCRYPTION_KEY` must be a 64-character hex key before any agent or treasury wallet is created; do not allow local fallback storage of raw private keys.
- Local checkout and webhook replay must use `sk_test_` and test-mode price ids.
- Do not use the live Stripe key for local checkout creation or webhook replay.
- Keep `CAPITAL_WEBHOOK_EMAIL_NOTIFICATIONS_ENABLED=false` during local/test replay, even if `RESEND_API_KEY` is present.
- Keep `CAPITAL_LEAD_EMAIL_NOTIFICATIONS_ENABLED=false` during local/test 92B pledge-intent or proposal checks unless Chris approves that exact notification test.
- Keep `PROJECT_LEAD_EMAIL_NOTIFICATIONS_ENABLED=false` during local/test project submission or interest checks unless Chris approves that exact notification test.
- Keep `PUBLIC_LEAD_EMAIL_NOTIFICATIONS_ENABLED=false` during local/test public lead-capture checks unless Chris approves that exact notification test.
- Keep `COUNCIL_WAITLIST_EMAIL_NOTIFICATIONS_ENABLED=false` during local/test Council waitlist checks unless Chris approves that exact notification test.
- Keep `DAILY_PRACTICE_EMAIL_NOTIFICATIONS_ENABLED=false` during local/test scheduled daily practice email checks unless Chris approves that exact email batch.
- Keep `DAILY_PRACTICE_FOLLOWUP_EMAIL_NOTIFICATIONS_ENABLED=false` during local/test daily practice follow-up checks unless Chris approves that exact email batch.
- Keep `PROACTIVE_EMAIL_NOTIFICATIONS_ENABLED=false` during local/test proactive cron checks unless Chris approves that exact notification test.
- Keep `PROVOCATION_TEST_EMAIL_NOTIFICATIONS_ENABLED=false` during local/test provocation email checks unless Chris approves that exact provider/email test.
- Keep `PROVOCATION_WEEKLY_EMAIL_NOTIFICATIONS_ENABLED=false` during local/test weekly provocation checks unless Chris approves that exact provider/email test.
- Keep `ONBOARDING_EMAIL_NOTIFICATIONS_ENABLED=false` during local/test onboarding trigger checks unless Chris approves that exact notification test.
- Keep `ONBOARDING_BATCH_TRIGGER_ENABLED=false` during local/test onboarding batch-trigger checks unless Chris approves that exact provider/database-write test.
- Keep `DM_EMAIL_NOTIFICATIONS_ENABLED=false` during local/test direct-message notification checks unless Chris approves that exact notification test.
- Do not paste real secrets into docs, chat, screenshots, or public examples.
- Keep `STRIPE_PRICE_ORACLE` explicit. Do not reintroduce hard-coded fallback price ids.
- `CRON_SECRET` protects scheduled routes; it does not authorize triggering cron routes, sending email, creating rooms, or running provider/database-write batches.

## AI Capability Baseline

```bash
ANTHROPIC_API_KEY=sk-ant-your_api_key_here
OPENAI_API_KEY=replace_with_openai_key
OPENAI_REALTIME_MODEL=gpt-realtime
OPENAI_SAFETY_SALT=replace_with_random_openai_safety_salt
AI_GATEWAY_ENABLED=false
AI_GATEWAY_API_KEY=replace_with_ai_gateway_key
```

Rules:

- `/capital/ai-status` reports secret presence only; it must not expose values or call external AI APIs.
- Live Council voice needs `OPENAI_API_KEY`.
- Memory embeddings need `OPENAI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`.
- Claude calls need either direct `ANTHROPIC_API_KEY` or AI Gateway configuration.

## Outbound Provider / Fulfillment / Mint Baseline

```bash
RESEND_API_KEY=replace_with_resend_key
FAL_API_KEY=replace_with_fal_key
DAILY_API_KEY=replace_with_daily_key
ELEVENLABS_API_KEY=replace_with_elevenlabs_key
PRINTFUL_API_KEY=replace_with_printful_key
NEXT_PUBLIC_SOE_MEMBERSHIP_ADDRESS=0x0000000000000000000000000000000000000000
NEXT_PUBLIC_SOE_ACHIEVEMENTS_ADDRESS=0x0000000000000000000000000000000000000000
SOE_ADMIN_PRIVATE_KEY=replace_with_0x_admin_private_key
MOVEMENT_ONCHAIN=false
SOLANA_RPC_URL=replace_with_solana_rpc_url
SOLANA_MINT_AUTHORITY_KEY=replace_with_solana_mint_authority_key
SOLANA_EXP_MINT=replace_with_solana_exp_mint_address
MEMBERSHIP_NFT_AUTO_MINT_ENABLED=false
ARTIFACT_MERCH_ORDERING_ENABLED=false
ARTIFACT_NFT_MINT_RECORDING_ENABLED=false
```

Rules:

- Provider or signer secret presence is readiness only; it does not authorize running routes that call Resend, Fal, Daily, ElevenLabs, Printful, or mint/chain-state workflows.
- Leave provider keys and signer secrets unset in local shells unless the exact provider call, fulfillment action, or mint test is approved for the route, data class, and purpose.
- Keep email notification flags `false` during local/test checks even when `RESEND_API_KEY` is present.
- Keep `MEMBERSHIP_NFT_AUTO_MINT_ENABLED=false` during local/test wallet checks unless Chris approves that exact wallet/mint test.
- Keep `SOE_ADMIN_PRIVATE_KEY` unset or placeholder-only during local/test wallet checks unless Chris approves that exact wallet/mint test.
- Keep `MOVEMENT_ONCHAIN=false` unless Chris approves the exact on-chain commitment test.
- Keep `SOLANA_RPC_URL`, `SOLANA_MINT_AUTHORITY_KEY`, and `SOLANA_EXP_MINT` unset or placeholder-only unless Chris approves the exact EXP minting test.
- Keep `ARTIFACT_MERCH_ORDERING_ENABLED=false` during local/test artifact merch checks unless Chris approves that exact fulfillment/order test.
- Keep `ARTIFACT_NFT_MINT_RECORDING_ENABLED=false` during local/test artifact mint checks unless Chris approves that exact mint-recording test.

## Production Review Baseline

Production configuration review is read-only until Chris approves a specific mutation.

Required before public launch:

- `NEXT_PUBLIC_SITE_URL` or `SITE_URL` points to the intended public domain.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET_MERCH`, and every `STRIPE_PRICE_*` value are explicit and in the intended Stripe mode.
- `STRIPE_PRICE_ORACLE` is set to the confirmed Oracle price.
- `CAPITAL_WEBHOOK_EMAIL_NOTIFICATIONS_ENABLED` is explicitly reviewed before any live webhook notification test; it should remain `false` unless Chris approves that external effect.
- `CAPITAL_LEAD_EMAIL_NOTIFICATIONS_ENABLED` is explicitly reviewed before any 92B pledge-intent/proposal notification test; it should remain `false` unless Chris approves that external effect.
- `PROJECT_LEAD_EMAIL_NOTIFICATIONS_ENABLED` is explicitly reviewed before any project lead/submission notification test; it should remain `false` unless Chris approves that external effect.
- `PUBLIC_LEAD_EMAIL_NOTIFICATIONS_ENABLED` is explicitly reviewed before any founding/music/salon notification test; it should remain `false` unless Chris approves that external effect.
- `COUNCIL_WAITLIST_EMAIL_NOTIFICATIONS_ENABLED` is explicitly reviewed before any Council waitlist confirmation/operator notification test; it should remain `false` unless Chris approves that external effect.
- `DAILY_PRACTICE_EMAIL_NOTIFICATIONS_ENABLED` is explicitly reviewed before any scheduled daily practice email batch; it should remain `false` unless Chris approves that external effect.
- `DAILY_PRACTICE_FOLLOWUP_EMAIL_NOTIFICATIONS_ENABLED` is explicitly reviewed before any daily practice follow-up email batch; it should remain `false` unless Chris approves that external effect.
- `PROACTIVE_EMAIL_NOTIFICATIONS_ENABLED` is explicitly reviewed before any generated proactive notification test; it should remain `false` unless Chris approves that external effect.
- `PROVOCATION_TEST_EMAIL_NOTIFICATIONS_ENABLED` is explicitly reviewed before any test provocation email; it should remain `false` unless Chris approves that external provider/email effect.
- `PROVOCATION_WEEKLY_EMAIL_NOTIFICATIONS_ENABLED` is explicitly reviewed before any weekly provocation batch email; it should remain `false` unless Chris approves that external provider/email effect.
- `ONBOARDING_EMAIL_NOTIFICATIONS_ENABLED` is explicitly reviewed before any onboarding thinker email test; it should remain `false` unless Chris approves that external effect.
- `ONBOARDING_BATCH_TRIGGER_ENABLED` is explicitly reviewed before any onboarding batch trigger; it should remain `false` unless Chris approves that external provider/database-write effect.
- `DM_EMAIL_NOTIFICATIONS_ENABLED` is explicitly reviewed before any direct-message notification email test; it should remain `false` unless Chris approves that external effect.
- `RESEND_API_KEY`, `FAL_API_KEY`, `DAILY_API_KEY`, `ELEVENLABS_API_KEY`, and `PRINTFUL_API_KEY` are explicitly reviewed before any route can use those providers; key presence alone does not authorize a provider call.
- `CRON_SECRET` is explicitly reviewed before scheduled routes are reachable; secret presence alone does not authorize triggering cron routes or downstream provider/database-write batches.
- `SOE_ADMIN_PRIVATE_KEY` is explicitly reviewed before any server-side signer path can mint membership NFTs; key presence alone does not authorize wallet or mint effects.
- `NEXT_PUBLIC_SOE_MEMBERSHIP_ADDRESS` and `NEXT_PUBLIC_SOE_ACHIEVEMENTS_ADDRESS` are explicitly reviewed before membership or achievement mint paths use deployed contracts; address presence alone does not authorize minting.
- `MOVEMENT_ONCHAIN` is explicitly reviewed before movement pod commitments can attempt chain writes; it should remain `false` unless Chris approves that on-chain effect.
- `SOLANA_RPC_URL`, `SOLANA_MINT_AUTHORITY_KEY`, and `SOLANA_EXP_MINT` are explicitly reviewed before any EXP minting path can run; key/config presence alone does not authorize token minting.
- `MEMBERSHIP_NFT_AUTO_MINT_ENABLED` is explicitly reviewed before any wallet route can attempt membership NFT minting; it should remain `false` unless Chris approves that wallet/mint effect.
- `ARTIFACT_MERCH_ORDERING_ENABLED` is explicitly reviewed before any artifact merch fulfillment test; it should remain `false` unless Chris approves that Printful/order effect.
- `ARTIFACT_NFT_MINT_RECORDING_ENABLED` is explicitly reviewed before any artifact mint recording test; it should remain `false` unless Chris approves that mint/chain-state effect.
- `STRIPE_WEBHOOK_SECRET_MERCH` is explicitly reviewed before any merch webhook replay or fulfillment test; secret presence alone does not authorize replaying webhooks or creating Printful orders.
- `SOE_ADMIN_EMAILS` and, if needed, `SOE_ADMIN_WALLETS` or `SOE_ADMIN_WALLET_ADDRESSES` are explicit.
- Supabase service role key is present only in server-side environments.
- Public copy remains conditional and non-financial.

Use read-only audit commands:

```bash
npm run env:readiness:smoke
npm run capital:preflight -- --production-env --supabase-read --stripe-read --soft
npm run operator:smoke
```

## Approval Boundary

Use `docs/soe-external-action-approval-matrix.md` before any environment change that causes an external effect.

Examples:

- Setting production env vars requires exact approval for the target variable and environment.
- Running Stripe checkout tests requires exact approval for test-mode flows.
- Creating live checkout sessions, replaying live webhooks, deploying, sending outreach, contacting the landlord, or placing window material remains blocked until exact approval is given.

## Current Known Blockers

- Confirm the intended Oracle Stripe product and set `STRIPE_PRICE_ORACLE`.
- Prepare test-mode price ids for Seeker, Scholar, Philosopher, Oracle, project pledges, and 92B tiers.
- Configure production admin allowlists before real operator use.
- Run route smoke only when `next dev` is running locally.
