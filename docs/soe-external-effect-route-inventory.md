# SOE External Effect Route Inventory

Status: local operator inventory. This document does not authorize calling, replaying, sending, publishing, charging, minting, fulfilling, or generating through any route.

## Purpose

This inventory keeps high-risk route handlers visible before Codex, browser automation, cron tests, or local scripts touch them. A route can be a legitimate app feature and still be blocked for operator-driven testing until Chris approves the exact action, environment, provider, data class, and timing.

Use this with `docs/soe-external-action-approval-matrix.md`.

## Operator Rule

- Local code inspection, static tests, docs, screenshots of localhost, and draft prep are allowed.
- Calling one of these routes is blocked when it would send email, create a checkout session, replay a webhook, call an external AI/media provider, create Printful products/orders, write chain/mint state, publish content, or mutate a connected tool.
- Broad permission to control the computer is not enough. Ask for the smallest exact approval from the approval matrix.
- If a route appears in more than one section below, apply the strictest approval gate.

## Payment And Webhook Routes

| Route | External effect | Required approval |
| --- | --- | --- |
| `app/api/92b/checkout/route.ts` | Creates Stripe Checkout sessions for 92B pledges. | Stripe test checkout or live checkout approval. |
| `app/api/checkout/route.ts` | Creates Stripe Checkout sessions for membership. | Stripe test checkout or live checkout approval. |
| `app/api/merch/checkout/route.ts` | Creates Stripe Checkout sessions for merch. | Stripe test checkout or live checkout approval. |
| `app/api/projects/[id]/pledge/route.ts` | Creates Stripe Checkout sessions for project pledges. | Stripe test checkout or live checkout approval. |
| `app/api/stripe/webhook/route.ts` | Applies Stripe webhook side effects for membership and capital pledges. | Stripe test webhook replay approval. |
| `app/api/webhooks/stripe/route.ts` | Applies merch fulfillment side effects after Stripe checkout. | Stripe test webhook replay plus fulfillment review. |

Current local guards: `capital:checkout-safety:smoke`, `capital:webhook-safety:smoke`, and `capital:webhook-dedupe:smoke`.

## Email And Notification Routes

| Route | External effect | Required approval |
| --- | --- | --- |
| `app/api/92b/pledge/route.ts` | Can record 92B pledge interest and can send notification email only when `CAPITAL_LEAD_EMAIL_NOTIFICATIONS_ENABLED=true`. | Outreach/send approval if email is enabled or if operator-triggered database mutation is planned. |
| `app/api/92b/propose/route.ts` | Can record 92B proposals and can send notification email only when `CAPITAL_LEAD_EMAIL_NOTIFICATIONS_ENABLED=true`. | Outreach/send approval if email is enabled or if operator-triggered database mutation is planned. |
| `app/api/council-waitlist/confirm/route.ts` | Can record Council waitlist signups and can send subscriber/operator confirmation email only when `COUNCIL_WAITLIST_EMAIL_NOTIFICATIONS_ENABLED=true`. | Outreach/send approval if email is enabled or if operator-triggered database mutation is planned. |
| `app/api/cron/daily-email/route.ts` | Can send scheduled daily practice email only when `DAILY_PRACTICE_EMAIL_NOTIFICATIONS_ENABLED=true`. | Email/cron send approval naming batch/window. |
| `app/api/cron/proactive/route.ts` | Can generate proactive check-ins, update trigger state, and can send notification email only when `PROACTIVE_EMAIL_NOTIFICATIONS_ENABLED=true`. | External provider plus notification send approval if operator-triggered or email is enabled. |
| `app/api/email/test-provocation/route.ts` | Can call AI and send test provocation email only when `PROVOCATION_TEST_EMAIL_NOTIFICATIONS_ENABLED=true`. | External provider plus email send approval naming recipient and copy. |
| `app/api/email/weekly-provocation/route.ts` | Can call AI and send weekly provocation email only when `PROVOCATION_WEEKLY_EMAIL_NOTIFICATIONS_ENABLED=true`. | External provider plus email send approval naming batch and copy. |
| `app/api/founding-interest/route.ts` | Can record founding interest and can send notification email only when `PUBLIC_LEAD_EMAIL_NOTIFICATIONS_ENABLED=true`. | Outreach/send approval if email is enabled or if operator-triggered database mutation is planned. |
| `app/api/music-therapy/interest/route.ts` | Can record interest and can send notification email only when `PUBLIC_LEAD_EMAIL_NOTIFICATIONS_ENABLED=true`. | Outreach/send approval if email is enabled or if operator-triggered database mutation is planned. |
| `app/api/notify/dm/route.ts` | Can send member DM notification email only when `DM_EMAIL_NOTIFICATIONS_ENABLED=true`. | Notification send approval. |
| `app/api/onboarding/trigger/route.ts` | Can generate onboarding thinker messages, write private salon/onboarding log rows, and can send onboarding email only when `ONBOARDING_EMAIL_NOTIFICATIONS_ENABLED=true`. | External provider plus email send approval naming batch if operator-triggered or email is enabled. |
| `app/api/onboarding/send-all/route.ts` | Can proxy to onboarding trigger only when `ONBOARDING_BATCH_TRIGGER_ENABLED=true`; downstream trigger can call AI, write private salon/onboarding log rows, and send email only when `ONBOARDING_EMAIL_NOTIFICATIONS_ENABLED=true`. | External provider/database-write approval naming batch, plus email approval if email is enabled. |
| `app/api/practice/daily-email/route.ts` | Can send daily practice follow-up email only when `DAILY_PRACTICE_FOLLOWUP_EMAIL_NOTIFICATIONS_ENABLED=true`. | Email/cron send approval naming batch/window. |
| `app/api/projects/interest/route.ts` | Can record project interest and can send project interest notification only when `PROJECT_LEAD_EMAIL_NOTIFICATIONS_ENABLED=true`. | Outreach/send approval if email is enabled or if operator-triggered database mutation is planned. |
| `app/api/projects/submit/route.ts` | Can record project submissions and can send project submission notification only when `PROJECT_LEAD_EMAIL_NOTIFICATIONS_ENABLED=true`. | Outreach/send approval if email is enabled or if operator-triggered database mutation is planned. |
| `app/api/salons/propose/route.ts` | Can record salon proposals and can send notification email only when `PUBLIC_LEAD_EMAIL_NOTIFICATIONS_ENABLED=true`. | Outreach/send approval if email is enabled or if operator-triggered database mutation is planned. |
| `app/api/stripe/webhook/route.ts` | Can send capital pledge notification email only after live opt-in; uses the shared lazy Resend helper inside guarded branches. | Capital webhook notification approval. |

## AI And Media Provider Routes

| Route | External effect | Required approval |
| --- | --- | --- |
| `app/api/artifacts/generate/route.ts` | Calls AI provider for private artifact vision and, only after explicit image consent in the request, can call Fal image generation. | External provider call approval and consent review. |
| `app/api/council/verdict/route.ts` | Calls AI provider for council output. | External provider call approval if operator-triggered. |
| `app/api/cron/proactive/route.ts` | Calls provider logic for proactive output. | External provider plus notification approval. |
| `app/api/email/test-provocation/route.ts` | Calls AI/email provider for test email only after explicit test-provocation opt-in. | External provider plus send approval. |
| `app/api/email/weekly-provocation/route.ts` | Calls AI/email provider for weekly email only after explicit weekly-provocation opt-in. | External provider plus send approval. |
| `app/api/great-books/annotate/route.ts` | Calls AI provider for annotation. | External provider call approval if operator-triggered. |
| `app/api/great-books/seminar/route.ts` | Calls AI provider for seminar output. | External provider call approval if operator-triggered. |
| `app/api/insights/route.ts` | Calls AI provider for insight generation. | External provider call approval if operator-triggered. |
| `app/api/live/route.ts` | Movement-manager `create_next` can indirectly create a Daily video room through the live-session scheduler. | External provider call approval if operator-triggered. |
| `app/api/match/generate/route.ts` | Calls AI provider for match generation. | External provider call approval if operator-triggered. |
| `app/api/merch/generate-mockup/route.ts` | Calls Fal image generation. | External media provider call approval. |
| `app/api/merch/generate-products/route.ts` | Calls AI provider for merch ideas. | External provider call approval. |
| `app/api/movement/personal-ai/chat/route.ts` | Calls personal AI provider with member context. | External provider call approval if operator-triggered. |
| `app/api/movement/realtime/session/route.ts` | Creates OpenAI realtime session token. | External provider call approval if operator-triggered. |
| `app/api/onboarding/trigger/route.ts` | Can call AI/email provider during onboarding. | External provider plus send approval. |
| `app/api/onboarding/send-all/route.ts` | Can proxy to onboarding trigger only after explicit batch-trigger opt-in. | External provider/database-write approval naming batch, plus email approval if email is enabled. |
| `app/api/practice/reflect/route.ts` | Calls AI provider for practice reflection. | External provider call approval if operator-triggered. |
| `app/api/cron/create-live-session/route.ts` | Can indirectly create a Daily video room through the live-session scheduler. | Cron-secret execution only; external provider call approval if operator-triggered. |
| `app/api/rooms/route.ts` | Can create Daily video rooms through the external Daily provider. | External provider call approval if operator-triggered. |
| `app/api/ritual-drops/route.ts` | Calls AI provider for ritual drops. | External provider call approval if operator-triggered. |
| `app/api/ritual/route.ts` | Calls AI provider for rituals. | External provider call approval if operator-triggered. |
| `app/api/taste/route.ts` | Calls AI provider for taste output. | External provider call approval if operator-triggered. |
| `app/api/thinker/extract-facts/route.ts` | Calls AI provider for memory extraction and writes thinker memory. | External provider call approval; signed-in self-scope or explicitly configured cron-secret scope only. |
| `app/api/thinker/memory/route.ts` | Calls embedding provider through memory helper and writes conversation memory. | External provider call approval; signed-in self-scope only. |
| `app/api/thinker/route.ts` | Calls AI provider for thinker conversation. | External provider call approval if operator-triggered. |
| `app/api/transcribe/route.ts` | Calls transcription provider only after signed-in auth plus request transcription consent; audio is size-bounded and responses are private/no-store. | External provider call approval and consent review. |
| `app/api/tts/route.ts` | Calls ElevenLabs TTS only after signed-in auth plus explicit voice-generation consent; text and voice ids are bounded and responses are private/no-store. | External provider call approval and consent review. |
| `app/api/twiddle/[id]/respond/route.ts` | Calls AI provider for Twiddle response and, only after explicit voice consent in the request, can call ElevenLabs. AI-suggested actions execute only after explicit action-execution consent. | External provider call approval and consent review if operator-triggered. |
| `app/api/twiddle/cron/route.ts` | Calls AI provider from cron. | External provider plus cron approval. |
| `app/api/voice-notes/generate/route.ts` | Calls AI provider for private note text and, only after explicit audio consent in the request, can call the voice/audio provider. | External provider call approval and consent review. |

Current local guards: `/capital/ai-status` and `ai:status:smoke` report provider readiness without making provider calls. `external:lazy-clients:smoke` covers the first email/provider tranche plus selected automation, onboarding, ensure-member onboarding, merch, 92B pledge/proposal interest routes, Council waitlist confirmation, public lead-capture routes, salon/book-salon/message routes, live-session and room routes, daily practice state routes, private dashboard briefing, task routes, Salon Hub task routes/client callers, wallet/store routes, safe stats, guide leaderboard, guide routes, scan-history and scan scoring routes, world spaces/scan routes, member profile and onboarding self-updates, authenticated member discovery, public explorer profiles, public feed routes, Great Books text/progress, match history/response, daily email preference toggle, AI/media, ritual, community-response, private-context, core thinker, action/feed/practice generation, community/governance/live/matching, creator-helper, wallet/token disbursement, and memory/action routes/helpers so daily-email, daily email preference toggle, proactive cron, onboarding trigger, ensure-member onboarding, merch product generation, 92B pledge/proposal interest routes, Council waitlist confirmation, public lead-capture routes, salon/book-salon/message routes, live-session and room routes, daily practice state routes, private dashboard briefing, task routes, Salon Hub task routes/client callers, wallet/store routes, safe stats, guide leaderboard, guide routes, scan-history and scan scoring routes, world spaces/scan routes, member profile and onboarding self-updates, authenticated member discovery, public explorer profiles, public feed routes, Great Books text/progress/annotation/seminar, provocation, taste, ritual-drop, ritual generation, Council verdict, Twiddle response generation, voice-note, artifact-generation, practice-reflection, insights, match-generation, match history/response, core thinker chat, thinker action execution, activity/social draft generation, daily practice question generation, community/governance helpers, live-session summary generation, matching helpers, thinker fact extraction, Movement creator helpers, agent wallet/token disbursement helpers, and memory/action/episode/embedding helpers avoid module-scope Resend, Anthropic, or Supabase service clients.

For the private dashboard, the lazy-client guard also checks that EXP events, scan uploads, passport spaces, and first-visit welcome state are served through signed no-store `/api/dashboard/briefing` responses instead of direct browser table reads.

For merch suggestions and publish flow, the lazy-client guard checks that suggestion list/create/status, AI product generation, Fal mockup generation, and Printful publish routes require Movement manager access, return private no-store JSON, delay provider/env work until after auth, and are called from the Salon overlay with signed no-store fetches instead of direct browser `merch_suggestions` table reads/writes.

For world spaces/scan routes, the same lazy-client guard also checks that write identities are auth-derived, frequency matching is self-scoped, and scan upload auto-scoring calls same-origin `/api/scan/score` rather than a production fallback.

For Great Books EXP awards, the lazy-client guard checks that `/api/exp/award` is signed-in, self-scoped, reason-allowlisted, private/no-store, and called with auth headers from the reader.

For thinker fact extraction, the lazy-client guard checks that `/api/thinker/extract-facts` validates input before provider calls, requires signed-in self-scope or explicitly configured cron-secret scope, uses no-store private JSON, and writes memory under the resolved authenticated member id.

For thinker memory embeddings, the lazy-client guard checks that `/api/thinker/memory` validates input before embedding writes, requires signed-in self-scope, uses no-store private JSON, and writes embeddings under the authenticated member id instead of a body-supplied id.

For agent transactions, the lazy-client guard checks that listing and approval routes are signed-in, private/no-store, ordinary-member scoped, governance-gated for broader access, and use the authenticated approver identity instead of body-supplied ids.

For community creation, the lazy-client guard checks that DAO/community creation is signed-in, owner-derived from the authenticated member id, private/no-store, request-time Supabase backed, launch-config bounded, governance/infrastructure contract and agent spending-limit setup is server-side, and the create-community page uses auth headers without direct setup table writes.

For public community detail reads, the lazy-client guard checks that `/api/communities/[slug]` uses request-time Supabase admin access, no-store JSON, explicit allowlists for community, contract, member, profile, and product fields, and no `select('*')` service-role payloads.

For community governance role assignment, the lazy-client guard checks that role changes are signed-in, actor-derived from the authenticated member id, private/no-store, request-time Supabase backed, `manage_roles` gated, mismatch-guarded, and free of raw database error leakage.

For community thinker management, the lazy-client guard checks that public reads use an explicit field allowlist, thinker writes are signed-in, `manage_thinkers` gated, private/no-store, request-time Supabase backed, bounded/sanitized, and free of arbitrary update payloads or raw database error leakage.

For community joining, the lazy-client guard checks that membership writes are signed-in, self-scoped to the authenticated member id, private/no-store, request-time Supabase backed, mismatch-guarded, and free of raw database error leakage.

For community matches, the lazy-client guard checks that match reads and accept/decline responses are signed-in, self-scoped to the authenticated member id, private/no-store, request-time Supabase backed, mismatch-guarded, ownership-checked before updates, and free of raw database error leakage.

For community questionnaire submissions, the lazy-client guard checks that match-profile writes and async matching are signed-in, self-scoped to the authenticated member id, private/no-store, request-time Supabase backed, mismatch-guarded, answer-shape validated, and free of raw database error leakage.

For community store reputation routes, the lazy-client guard checks that balance and purchase routes are signed-in, self-scoped, private/no-store, request-time Supabase backed, free of raw database error leakage, and called from the community page with auth headers.

For community product creation, the lazy-client guard checks that DAO storefront products are signed-in, owner-only by authenticated member id, private/no-store, request-time Supabase backed, and called from the community page with auth headers.

For member wallet attachment, the lazy-client guard checks that wallet binding is signed-in, self-scoped, duplicate-wallet guarded, private/no-store, and that membership NFT minting remains disabled unless `MEMBERSHIP_NFT_AUTO_MINT_ENABLED=true`.

For voice-note generation, the lazy-client guard checks that note creation is signed-in, self-scoped to the authenticated member, private/no-store, input-bounded, audio-provider use is explicitly consent-gated, and voice-note rows are written under the authenticated member id rather than a body-supplied id.

For transcription, the lazy-client guard checks that `/api/transcribe` is signed-in, consent-gated, size-bounded before provider calls, generic on provider failures, private/no-store, and called from Waddle and Twiddle recorder paths with bearer tokens where available.

For shared TTS playback, the lazy-client guard checks that `/api/tts` is signed-in, voice-consent-gated, bounded before ElevenLabs calls, generic on provider failures, private/no-store for JSON and audio responses, and called by the shared `speakText` helper with bearer tokens where available.

For artifact generation, the lazy-client guard checks that generation is signed-in, self-scoped to the authenticated member, private/no-store, input-bounded, image-provider use is explicitly consent-gated, public visibility is opt-in, conversation-context and prompt storage are opt-in, and artifact rows are written under the authenticated member id rather than a body-supplied id.

For artifact merch ordering, the lazy-client guard checks that ordering is signed-in, owner-scoped to the authenticated artifact, request-time Supabase backed, private/no-store, input-bounded, explicit-field-only, disabled unless `ARTIFACT_MERCH_ORDERING_ENABLED=true`, and unable to call Printful before ownership and fulfillment gates pass.

For artifact mint recording, the lazy-client guard checks that mint preparation and confirmation are signed-in, owner-scoped to the authenticated artifact or mint row, request-time Supabase backed, private/no-store, input-bounded, disabled unless `ARTIFACT_NFT_MINT_RECORDING_ENABLED=true`, and unable to write mint state before auth and chain-state gates pass.

For Twiddle response generation, the lazy-client guard checks that generation is signed-in, self-scoped to the authenticated member, private/no-store, private relationship context is auth-derived, thinker memory reads use the authenticated member id, ElevenLabs voice generation is explicitly consent-gated, and AI-suggested action execution is explicitly consent-gated.

## Fulfillment, Publishing, And Minting Routes

| Route | External effect | Required approval |
| --- | --- | --- |
| `app/api/artifacts/merch/route.ts` | Creates Printful orders for artifact merch only when `ARTIFACT_MERCH_ORDERING_ENABLED=true`, after signed-in artifact ownership validation. | Fulfillment/order approval plus explicit fulfillment env enablement. |
| `app/api/artifacts/mint/route.ts` | Creates artifact NFT mint preparation rows and records minted-state updates only when `ARTIFACT_NFT_MINT_RECORDING_ENABLED=true`, after signed-in owner validation. | Mint/chain-state approval plus explicit mint-recording env enablement. |
| `app/api/member/wallet/route.ts` | Can mint pending membership NFT after wallet update only when `MEMBERSHIP_NFT_AUTO_MINT_ENABLED=true`. | Wallet/mint approval plus explicit auto-mint env enablement. |
| `app/api/merch/suggestions/route.ts` | Creates and lists private merch suggestion queue rows that can feed the Printful publish flow; no provider call itself. | Private database mutation approval if operator-triggered; publish/fulfillment approval before using a suggestion to publish. |
| `app/api/merch/publish/route.ts` | Creates Printful sync products and marks merch live. | Publish/fulfillment approval. |
| `app/api/webhooks/stripe/route.ts` | Creates Printful orders from Stripe webhook. | Webhook replay plus fulfillment approval. |

## Next Hardening Targets

- Move remaining provider SDK clients away from module scope where Next.js build safety requires lazy initialization.
- Expand `external:lazy-clients:smoke` beyond daily-email and provocation routes as each remaining provider route is hardened.
- Add per-route admin/member auth review for send, publish, fulfillment, and mint routes.
- Add route-level dry-run modes for email, fulfillment, and provider calls before any production tests.
- Keep this inventory current with `npm run external:effects:smoke`.
