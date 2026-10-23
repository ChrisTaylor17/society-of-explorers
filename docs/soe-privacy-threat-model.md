# Society of Explorers Privacy Threat Model

Status: local operator draft. This is not a compliance certification. Use it to guide engineering choices before shipping capital, memory, wallet, pod, and voice features.

Updated: June 5, 2026.

## Scope

This threat model covers current high-sensitivity surfaces:

- Capital patronage: pledge ledger, Stripe metadata, pipeline leads, admin dashboards, window QR campaign.
- External effect route inventory: payment, webhook, email, notification, AI/media provider, Printful, and mint-capable routes.
- Wallet identity: SIWE sessions, wallet-local member hints, admin wallet allowlists, wallet-sealed pod receipts.
- Personal memory: extracted facts, episodes, shared memory, personal AI context, correction/deletion flows.
- Sovereign pod: encrypted pod export, receipt, payload, sync, refresh, and verifier flows.
- Live/voice council: voice sessions, transcripts, realtime prompts, Great Thinker/personality context.
- Creator operations: Movement scripts, draft outreach, content funnels, performance notes.

Out of scope until explicitly approved:

- Production penetration testing.
- External scans.
- Sending data to third-party security tools.
- Deploying mitigations to production.

## Core Privacy Position

Society of Explorers should treat member data as borrowed, not owned.

Detailed memory control plan: `docs/soe-memory-consent-plan.md`.

Default stance:

- Minimize collection.
- Separate identity, payments, memory, and content wherever possible.
- Make memory visible, correctable, exportable, and revocable.
- Keep patron and lead details out of public and casual admin surfaces.
- Use aggregate or redacted views for operations unless raw detail is required.
- Require explicit approval before any external system mutation.

## Asset Inventory

| Asset | Sensitivity | Primary Risk | Current/Expected Control |
| --- | --- | --- | --- |
| `pledge_events` | High | Payment metadata and patron intent leak | Service-role access only, aggregate admin display, webhook dedupe guarded by `capital:webhook-dedupe:smoke`, and 92B intent/proposal notification email suppressed unless `CAPITAL_LEAD_EMAIL_NOTIFICATIONS_ENABLED=true` |
| Dashboard home state | High | Browser-side table reads could expose EXP history, scan uploads, spaces, or first-visit state outside the authenticated member scope | `/api/dashboard/briefing` authenticates first, derives member/scanner identity server-side, returns private no-store JSON, and `external:lazy-clients:smoke` blocks direct browser reads of private dashboard tables |
| `capital_pipeline_leads` | High | Warm relationship context leak | Redacted labels, private admin routes, no outreach without approval |
| Stripe session metadata | High | Over-collection or wrong pledge classification | Normalized minimal metadata, explicit tier/pledge type |
| Project marketplace and pledges | Medium/High | Public project routes can leak private project columns; pledge checkout metadata can over-collect attribution or cache checkout URLs; submission/interest notifications can leak raw lead text through email | Explicit public field allowlists, sanitized public project payloads, project-id/email validation, bounded UTM metadata, no-store JSON, project lead/submission notification email suppressed unless `PROJECT_LEAD_EMAIL_NOTIFICATIONS_ENABLED=true`, and escaped notification HTML |
| Wallet address | Medium/High | Cross-context identity correlation | Short display, wallet session boundaries, avoid public linkage |
| SIWE nonce/session | High | Session replay or wallet impersonation | Server-issued nonce, signed session cookie, expiration |
| Personal memory facts | High | Intimate belief/profile leakage | Signed-in private access, correction/delete flows, pod export boundary |
| Pod export payloads | Critical | Bulk memory exfiltration | Wallet seal, receipt verification, explicit export action |
| Pod receipt commitment | Medium | Linkable proof trail | Commitment-only public verifier, avoid raw payload exposure |
| Voice transcripts | Critical | Unintended recording of sensitive speech | Transcript opt-in, do-not-remember toggle, retention controls |
| Great Thinker/personality prompts | Medium | Unwanted influence or unsafe advice framing | Clear persona boundaries, no hidden memory writes |
| Creator drafts/outreach | High | Accidental public or third-party disclosure | Draft-only local docs, approval queue, no sending automation |
| Public lead capture | High | Founder, music therapy, and salon lead routes can leak contact details or raw notes through cached responses, raw logs, or unapproved notification email | Request-time Supabase admin access, private no-store JSON, bounded lead fields, generic DB errors, shared escaped notification HTML, and email suppressed unless `PUBLIC_LEAD_EMAIL_NOTIFICATIONS_ENABLED=true` |
| Council waitlist confirmation | High | Waitlist signups can leak contact details through cached responses, raw logs, duplicate errors, or unapproved subscriber/operator confirmation email | Request-time Supabase admin access, private no-store JSON, validation before database writes, duplicate guard, generic DB errors, escaped operator HTML, and email suppressed unless `COUNCIL_WAITLIST_EMAIL_NOTIFICATIONS_ENABLED=true` |
| Daily practice generated email | High | Daily question text, subscription/member email, or responder class can leak through unescaped HTML, raw logs, or unapproved Resend sends | Cron authorization before database/email work, private no-store JSON, lazy Supabase/Resend clients, escaped question email HTML, generic logs, and email suppressed unless `DAILY_PRACTICE_EMAIL_NOTIFICATIONS_ENABLED=true` or `DAILY_PRACTICE_FOLLOWUP_EMAIL_NOTIFICATIONS_ENABLED=true` |
| Provocation generated email | High | AI-generated provocation text or recipient/member data can leak through unescaped HTML, raw logs, or unapproved Anthropic/Resend calls | Cron authorization before provider work, private no-store JSON, lazy provider clients, escaped generated email HTML, generic logs, and provider/email work suppressed unless `PROVOCATION_TEST_EMAIL_NOTIFICATIONS_ENABLED=true` or `PROVOCATION_WEEKLY_EMAIL_NOTIFICATIONS_ENABLED=true` |
| Proactive and onboarding generated email | High | Personal profile, memory context, generated guidance, or member email can leak through unescaped HTML or unapproved Resend sends | Cron authorization before provider/database work, private no-store JSON, lazy provider clients, explicit field selection where practical, escaped generated email HTML, and email suppressed unless `PROACTIVE_EMAIL_NOTIFICATIONS_ENABLED=true` or `ONBOARDING_EMAIL_NOTIFICATIONS_ENABLED=true` |
| Onboarding batch trigger | High | A batch proxy can accidentally generate member-specific AI messages, write private salon/onboarding log rows, or send downstream email for the wrong member set | Cron authorization before proxying, private no-store JSON, bounded request fields, authorization forwarding, route inventory coverage, and proxy suppressed unless `ONBOARDING_BATCH_TRIGGER_ENABLED=true` |
| DM notification email | High | Recipient email, sender identity, or message preview can leak through unapproved sends, raw logs, header injection, or unescaped HTML | Cron authorization before provider/database work, private no-store JSON, bounded body fields, lazy Supabase/Resend clients, generic logs, escaped HTML, subject sanitization, and email suppressed unless `DM_EMAIL_NOTIFICATIONS_ENABLED=true` |
| Merch suggestion/publish queue | High | Open RLS/browser writes or unauthorized Anthropic, Fal, or Printful calls can publish or generate merchandise without approval | Movement manager gate, private no-store APIs, auth-before-provider/env checks, request-time Supabase admin access, and no browser `merch_suggestions` table reads/writes |
| AI provider status | Medium | Secret leakage or accidental provider invocation | Presence-only env checks, model/provider names only, no-provider-call receipt |
| External effect routes | High | Operator accidentally calls a send, payment, provider, fulfillment, or mint route | Route inventory, exact approval matrix, `external:effects:smoke` |
| Email/provider SDK clients | Medium/High | Build-time env crashes or client initialization before request-time checks | Lazy Resend/Anthropic/Supabase initialization in covered routes, `external:lazy-clients:smoke` |
| Thinker fact extraction | High | Caller-supplied member ids can write private memory for another member or send another member's transcript to an AI provider | Signed-in self-scope or explicit cron-secret scope, input validation before provider calls, request-time Supabase admin, private no-store JSON |
| Thinker memory embeddings | High | Caller-supplied member ids can store conversation embeddings under another member or send another member's text to an embedding provider | Signed-in self-scope, input validation before embedding writes, private no-store JSON |
| Daily practice state | High | Caller-supplied member ids can submit answers, update streaks, change response totals, or generate AI reflections for another member; cached responses can expose a member's answer, reflection, or streak | Signed-in self-scope for writes and reflection generation, no client `memberId` response-submit contract, input validation before writes/provider calls, request-time Supabase admin, private no-store JSON/SSE for state reads/writes, generic database errors |
| Salon list | Medium/High | Raw public salon list rows can expose guide ids, community internals, private scheduling fields, or unexpected future columns | Explicit public field allowlist, bounded status filters, no raw-row spreading, public member counts only, no-store private JSON, no-store Salon page fetches |
| Salon creation | High | General salon creation can leak raw inserted salon rows, accept unbounded community/topic payloads, ignore member/session insert failures, or expose database errors after partial writes | Signed-in route, bounded JSON fields, explicit minimal create receipt, checked creator-membership/session inserts, generic private errors, no raw row response |
| Salon city leaderboard | Medium/High | City proposal/support aggregates can leak lead names, emails, notes, raw lead rows, or stale campaign state through cacheable public responses | Request-time Supabase admin access, `why`-field-only reads, bounded city parsing, row/result limits, aggregate public counts only, private no-store JSON, no-store `/salons` fetches, generic failures |
| Salon messages | High | Raw message reads or unbounded writes can expose future message columns, leak database errors/log details, or persist oversized participant-generated content | Request-time Supabase admin access, bounded salon/sender/content fields, explicit message field allowlist, public message serializer, private no-store JSON, generic failures |
| Book salons | High | Caller-supplied member ids can create, join, or post seminar messages as another member; reads can expose raw member ids in cohort membership or discussion payloads | Signed-in auth-derived creator/joiner/speaker identity, member-only posting, private no-store JSON, sanitized member/message read payloads, token-bearing client calls without identity fields |
| Salon detail | High | Raw salon detail reads and mutations can expose member ids, member EXP/tier, attendance arrays, transcript summaries, guide ids, full session rows, or let callers complete/graduation-update sessions without authority | Explicit salon/member/session field allowlists, no-store private JSON, display-safe member/session keys, public display names only, signed-in mutation dispatch, auth-derived joins, member-scoped attendance, guide-or-session-leader completion, guide-scoped graduation, sanitized graduation receipts, generic failures |
| My salon state | High | A missing or overly broad member-salon endpoint can fall through to dynamic public detail reads, expose another salon's raw membership state, or leak member ids/EXP/tier/session internals | Dedicated signed-in route, authenticated-member self-scope, explicit salon/member/session field allowlists, display-safe synthetic keys, private no-store JSON, generic failures |
| Salon sessions | High | Standalone session endpoints can expose raw attendance/transcript/EXP fields or let callers assign another member as session leader or update session outcomes without authority | Explicit session field allowlists, private no-store JSON, guide-scoped session creation, session leader derived from signed-in auth, guide-or-session-leader scoped updates, bounded transcript/EXP writes, minimal receipts, generic database failures |
| Guide dashboard | High | Guide-only dashboards can leak raw salon rows, guide/member ids, `guide_since`, spawning-tree internals, or per-salon EXP totals through broad selects or raw row spreading | Signed-in guide scope, explicit guide-salon field allowlist, bounded private metrics, no-store private JSON, sanitized spawning-tree nodes, helper smoke checks against raw selects and per-salon EXP totals |
| Guide salon creation | High | Caller-supplied parent or community ids can spawn salons under another guide's tree, leak raw insert rows, or expose raw database failures during multi-step salon/session creation | Signed-in guide-only route, JSON and text/UUID bounds before writes, parent salon owner and completion checks, explicit minimal create receipt, generic private errors, no raw inserted salon rows |
| Salon Hub tasks | High | Permissive `hub_tasks` RLS plus browser table writes can expose, edit, or delete another member's task list | Signed-in `/api/salon-hub/tasks` boundary, authenticated member ownership, no client `member_id`, bounded title/agent/status input, UUID validation, private no-store JSON |
| Insight memory profile | High | Cached or cross-user reads can expose semantic memory facts, conversation threads, or AI-generated identity framing | Signed-in auth before reads/provider calls, active-memory filtering, private no-store JSON, generic client errors, redacted server logging |
| World spaces and scans | High | Client-supplied creator, scanner, verifier, annotation, or frequency-match identity mutates or exposes world-layer state | Signed-in auth-derived identity for world write routes, no client `memberId` query contract for frequency matching, same-origin scan scoring callback |
| EXP award route | Medium/High | Client-supplied member ids can inflate another account's EXP or leak DB errors | Signed-in auth, self-scope check, reason allowlist, request-time Supabase admin, private no-store JSON |
| Great Books reading progress | Medium/High | Caller-supplied member ids can expose or overwrite another member's reading state | Signed-in auth, no client `memberId` query/body contract for progress, authenticated reader id for reads/writes, request-time Supabase admin, private no-store JSON, token-bearing no-store client fetches |
| Agent transactions | High | Member reward rows or approval authority can leak or be exercised through caller-supplied ids | Signed-in auth, ordinary-member self-scope, governance permission for broader listing/approval, authenticated approver identity, request-time Supabase admin, private no-store JSON |
| Community creation | Medium/High | Caller-supplied member ids or browser setup writes can create communities under another owner, seed incorrect owner membership, or misconfigure DAO contracts/spending limits | Signed-in auth, no client `memberId` body contract, authenticated owner id for community and owner-membership writes, bounded launch config, server-side contract and spending-limit setup, request-time Supabase admin, private no-store JSON |
| Community joining | Medium/High | Caller-supplied member ids can add another member to a community or seed incorrect role rows | Signed-in auth, no client `memberId` body contract, authenticated member id for membership and role-assignment writes, request-time Supabase admin, private no-store JSON |
| Community store balance and purchases | High | Caller-supplied member ids can expose another member's reputation balance or debit/order against their account | Signed-in auth, no client `memberId` query/body contract, authenticated buyer id for debits/orders/refunds, request-time Supabase admin, private no-store JSON, generic database errors |
| Member wallet attachment | High | Caller-supplied member ids can bind or mint wallet identity for another account, or accidentally trigger chain writes | Signed-in auth, self-scope check, duplicate-wallet guard, normalized address storage, request-time Supabase admin, private no-store JSON, auto-mint gated by `MEMBERSHIP_NFT_AUTO_MINT_ENABLED` |
| Community product creation | Medium/High | Caller-supplied creator ids can let non-owners create storefront items or misattribute owner actions | Signed-in auth, no client `memberId` body contract, authenticated owner check, `created_by` derived from auth, request-time Supabase admin, private no-store JSON, generic database errors |
| Community matches | High | Caller-supplied member ids can reveal another member's matches or accept/decline matches they do not own | Signed-in auth, no client `memberId` query/body contract, self-scoped reads, authenticated response identity, match ownership check, request-time Supabase admin, private no-store JSON |
| Philosophical match generation | High | Match prompt generation can leak recent answers to an AI provider or store malformed AI output under a member pairing | Signed-in auth before candidate reads/provider calls, authenticated/candidate-derived participants, prompt validation before storage, private no-store JSON, generic create errors |
| Matching matrix projections | High | Match projection vectors can reveal private collaboration preferences or leak member ids through audit logs and database failures | Auth before projection validation and candidate reads, request-time Supabase admin, private no-store JSON, redacted audit logs, generic candidate-query errors |
| Member profile, onboarding, and discovery | High | Profile text, onboarding answers, skills, wallet addresses, or emails can leak through broad directory reads or raw database errors | Signed-in auth, self-scoped profile/onboarding writes, bounded profile/onboarding text, discovery field allowlist, private no-store JSON, generic database errors |
| Public explorer profiles | Medium/High | Public profile routes can accidentally expose wallet/auth identifiers or drift into duplicated service-role query logic | Shared sanitized public-profile loader, UUID validation before reads, lazy Supabase admin helper, public field allowlist, no wallet/email/auth ids |
| Live rooms and transcripts | Critical | Caller-supplied member ids can join, end, or write transcripts for another member; Daily room creation or AI session summaries can be triggered accidentally by operator tests | Signed-in auth before room-state work/provider calls, auth-derived participant/creator identity, Movement-manager gates on legacy live operator actions, cron-secret fail-closed scheduled creation, owner-only room ending, bounded transcript fields, private no-store JSON, minimal cron receipts, Daily route in external-effect inventory |
| Twiddle creation, edits, and reactions | High | Caller-supplied member ids can author, edit, or react as another member; cached route responses can expose signed-in activity | Signed-in auth-derived Supabase auth ids for creation/edit/reaction, no client `memberId` API contract, request-time Supabase admin, UUID/body validation before writes, private no-store JSON, token-bearing client fetches where available, no member-id transport from Twiddle clients, generic database errors |
| Community questionnaires | High | Caller-supplied member ids can write another member's match profile or trigger matching under their identity | Signed-in auth, no client `memberId` body contract, self-scoped match-profile writes, answer-shape validation, authenticated matching identity, request-time Supabase admin, private no-store JSON |

## Threats And Controls

### 1. Stale Auth Blocks Or Misroutes Private Access

Risk:

- Invalid Supabase refresh tokens can stall private pages or cause confusing auth states.

Current controls:

- `lib/auth/getSession.ts` bounds Supabase auth lookups to `5_000ms`.
- `lib/auth/staleSupabaseAuth.ts` clears stale Supabase auth storage.
- `npm run auth:stale-supabase:smoke` guards stale refresh-token/JWT recovery behavior.
- Launch Room exits loading and fails closed.
- `npm run capital:preflight:smoke` guards this behavior.
- Private capital pages use signed-in token fetches, `cache: no-store`, fail-closed loading exits, admin sign-in guidance, shared private/no-store API responses with surrogate no-store, noindex/nosniff/Vary protections, and generic availability failure logs; `npm run capital:private-pages:smoke` guards these boundaries across the command center, Launch Room, approvals, patron brief, scenarios, outreach lab, weekly review, window kit, pipeline, and AI status.
- `npm run private:route-helper:smoke` guards the shared private response helper used by private JSON and attachment routes, including surrogate no-store, noindex/nosniff, and auth/cookie Vary protections.
- `npm run private:route-proxy:smoke` guards the proxy-level Salon, Members, and Book route gate so both unauthenticated redirects and authenticated pass-through responses carry private no-store and noindex headers.
- Movement private surfaces use explicit no-store fetches for personal mirror, pod, memory, sovereignty passport, voice session-token, and creator-studio private reads/mutations; `npm run movement:private-surfaces:smoke` guards those client-side boundaries plus generic personal mirror and Movement Studio failure display.
- Movement API routes use private no-store responses for sensitive JSON, attachments, and streams; `npm run movement:api-boundary:smoke` guards auth-before-work ordering, provider-call boundaries, lazy service-client access, generic Personal Mirror route/stream failures, generic manager generation failures, and generic pod/sovereignty helper failures.
- `npm run world:permissions:smoke` guards pending/archived world space access and access grants so both canonical member ids and Supabase auth ids count as host ownership while unrelated host ids are rejected.
- `npm run operator:script-boundary:smoke` guards local smoke scripts so they cannot quietly become provider, payment, email, database-client, child-process, HTTP, file-system mutation, secret env-file reads, process.env mutation, process module imports, CommonJS require escapes, dynamic import escapes, static re-export escapes, dynamic code execution, worker thread/browser worker execution, namespaced fetch, socket/DNS/http2 network modules, browser network constructors, or non-local network clients.
- `npm run operator:manifest:smoke` guards the standing local verification loop so new smoke scripts, simple local node smoke command shapes, operator steps, smoke files, operator-runner argument handling, operator smoke plan validation, and the current verification docs do not drift apart; unknown operator smoke arguments fail before steps run.
- `npm run operator:smoke` keeps each default local smoke step on a 120-second timeout by default, allows `OPERATOR_SMOKE_STEP_TIMEOUT_MS` only between 5 seconds and 10 minutes, and fails closed on invalid timeout overrides.
- `npm run operator:smoke -- --list` provides a no-execution audit of the local smoke plan before running the suite.

Next controls:

- Add the same bounded-loading pattern to other private client pages.
- Add a small shared `loadPrivateSurface` helper for pages that need Supabase tokens.

### 2. Admin Dashboards Expose Too Much PII

Risk:

- Capital dashboards could expose lead names, email, Stripe ids, wallet addresses, patron notes, or relationship context.

Current controls:

- Capital surfaces are private.
- Handoff and runbook require aggregate/redacted displays.
- Keep capital admin responses aggregate/redacted by default.
- Admin APIs return `401` when unauthenticated.
- `npm run capital:routes:smoke` verifies unauthenticated admin boundaries.
- Capital admin response-shape smoke test checks API response keys and fixtures for forbidden contact, wallet, Stripe, and raw-note identifiers.
- `npm run capital:admin-shape:smoke` also checks that private capital admin GET routes use shared private/no-store response paths and avoid raw `NextResponse.json`.
- Capital Command Center displays a content-free prep receipt confirming aggregate/redacted dashboard review triggered no outreach, contact import, checkout session, payment, webhook replay, deploy, migration, landlord contact, window action, connected-tool mutation, CRM write, public post, or public claim.
- Capital Command Center admin API responses use private no-store JSON and return generic unavailable receipts on aggregate read failures without raw database messages.
- Capital pipeline free-text fields pass through redaction before storage, masking emails, phone numbers, wallet addresses, and Stripe ids.
- Capital pipeline display labels pass through a server-side alias sanitizer that collapses likely raw full names and direct contact identifiers into a generic `Private lead` label while preserving role/source aliases.
- Capital Pipeline previews this redaction before save so operators can see which fields and labels will be masked.
- `npm run capital:redaction:smoke` verifies representative sensitive samples are masked, likely raw full-name labels are collapsed, role/source aliases are preserved, and raw admin emails are not stored in pipeline metadata.
- Capital Pipeline admin API responses use private no-store JSON and return generic unavailable receipts on database/event failures without raw database messages.
- Capital Pipeline returns content-free receipts for load/create/update actions, distinguishing private redacted database writes from outreach, contact imports, checkout sessions, payments, deploys, landlord contact, public posting, or window activation.

Next controls:

- Add review guidance for edge-case organization names and aliases that cannot be safely distinguished from people by code.

### 2a. AI Status Leaks Secrets Or Calls Providers

Risk:

- Provider-readiness screens could accidentally expose API keys, service-role values, or invoke paid/model APIs while merely checking status.

Current controls:

- `/capital/ai-status` reports provider names, model names, and environment variable presence only.
- AI Status includes a read-only no-provider-call receipt confirming no external AI provider call, message generation, embedding generation, realtime session creation, secret value exposure, database write, connected-tool mutation, deploy, payment, outreach, or public action occurred.
- `npm run ai:status:smoke` verifies the private AI status route stays admin-gated, uses private no-store JSON, excludes secret values, and displays the receipt.

Next controls:

- Add per-capability last-tested timestamps only after a deliberate approved test call path exists.

### 3. Payment Metadata Becomes A Shadow Profile

Risk:

- Stripe checkout metadata can accumulate unnecessary identity or intent details.

Current controls:

- Checkout/webhook metadata is normalized by pledge type and tier.
- No hard-coded Stripe price ids in app/lib code.
- Preflight checks for price-id/env safety.
- Checkout routes block local live-mode checkout sessions before Stripe session creation and use environment-aware return URLs; `npm run capital:checkout-safety:smoke` guards this.
- Capital webhook notification email is suppressed for test-mode events and remains disabled unless `CAPITAL_WEBHOOK_EMAIL_NOTIFICATIONS_ENABLED=true`; `npm run capital:webhook-safety:smoke` guards this and verifies lazy Resend helper usage.
- Capital webhook dedupe records 92B and project pledge ledger state before downstream side effects, then exits duplicate events before lead rows, project totals, EXP awards, or notification email; `npm run capital:webhook-dedupe:smoke` guards this.

Next controls:

- Keep metadata to classification fields only: `type`, `pledge_type`, campaign/project id, tier id, source/UTM when needed.
- Store patron notes separately from payment events.
- Keep metadata allowlist and checkout-safety smoke tests passing for checkout routes.
- Keep webhook notification email disabled during local/test replay unless an exact production notification test is approved.
- Keep duplicate replay tests focused on proving one ledger row and no repeated lead, project-total, EXP, or notification side effects.

### 4. Wallet Identity Correlates Private Memory And Public Patronage

Risk:

- A wallet could become the single cross-context identifier linking practice, memory, patronage, and public recognition.

Current controls:

- Wallets are short-displayed in UI.
- Pod receipts use commitments rather than raw payloads.
- Production wallet admin allowlist is not assumed ready.

Next controls:

- Separate recognition names from wallet addresses.
- Give users a "public recognition name" distinct from wallet identity.
- Avoid exposing wallet address in capital admin rows unless necessary.

### 5. Pod Export Leaks Bulk Sensitive Data

Risk:

- Pod export is a high-value bulk memory extraction point.

Current controls:

- Wallet-sealed pod receipt and verifier exist.
- Sovereignty Passport surfaces commitment and receipt concepts.
- Pod page shows a signed-in export manifest before encrypted download.
- `/api/movement/pod/manifest` returns counts, custody metadata, and safety flags without plaintext payload, ciphertext, raw member id, raw wallet address, or wallet signature.
- `npm run pod:wallet-seal:smoke` verifies wallet-derived pod exports and seal receipts reproduce their hashes while storing only wallet address, signing-message, and signature hashes, not raw wallet signatures or decryptable key material.

Next controls:

- Require recent wallet/session confirmation before export.
- Require explicit recent confirmation before export when the pod contains sensitive sections.
- Add receipt verification that never displays raw private payload by default.
- Add clear "delete local export" guidance after download.

### 6. Memory Corrections Are Not Strong Enough

Risk:

- Soft-delete alone does not establish user agency if memory can still influence AI behavior.

Current controls:

- Memory and pod surfaces exist.
- Handoff identifies signed-in memory correction as a next safe move.
- `docs/soe-memory-consent-plan.md` defines required `active`, `corrected`, `retracted`, and `do_not_use` states plus retrieval exclusion.
- `lib/memory/retrievalPolicy.ts` filters expired, suppressed, corrected, retracted, and do-not-use rows before AI context assembly when those fields are present.
- `npm run memory:retrieval:smoke` verifies retrieval exclusion remains wired into shared memory prompt construction and major semantic-memory prompt/read paths.
- A local memory consent state migration draft adds explicit status, suppression, replacement, and review metadata, guarded by `npm run memory:state-migration:smoke`; it is not approved for production.
- App-side memory actions are prepared behind `MEMORY_CONSENT_STATE_COLUMNS_ENABLED=true` and guarded by `npm run memory:consent-actions:smoke`; the flag must remain off before the migration is applied.
- Private memory overview exposes current consent write mode and active retrieval filter without exposing environment values, secrets, raw client exception details, raw generated memory text, or raw API/helper database errors; memory helper failures stay generic.
- Memory action responses include compact consent receipts that describe action, write mode, and retrieval effect without returning raw memory content, raw client exception details, or raw API database errors.
- Pod manifests and the Sovereignty Passport report memory consent readiness and active-only export scope without returning suppressed, expired, or raw memory content; pod sync, pod/passport failure paths, pod and passport client/helper failure handling, and sync audit logs avoid raw database, provider, builder, wallet, member, device, or exception details.
- Creator operations return sanitized local script queues, sanitized by-question script reads, and local-only receipts for draft generation, bounded status metadata changes, and sanitized performance notes, explicitly recording that no post, send, schedule, or paid promotion occurred while avoiding raw script rows, raw API errors, and raw client exception details on queue/by-question/status/performance/generation updates.
- Capital prep surfaces return local-draft-only readiness and receipts for Command Center review, Launch Room review, approvals, scenario planning, weekly review, outreach, patron-call, and window-kit preparation, explicitly recording that no messages, imports, checkout sessions, webhook replays, migrations, deploys, landlord contacts, window placements, public posts, public claims, pledge records, CRM records, or approval grants occurred.
- Merch suggestion and publish operations require Movement manager access through private no-store APIs; the browser overlay no longer reads or writes `merch_suggestions` directly, and Anthropic/Fal/Printful work is ordered after auth.

Next controls:

- Add explicit correction states: `active`, `corrected`, `retracted`, `do_not_use`.
- Store correction reason and replacement text separately.
- Ensure personal AI retrieval excludes `retracted` and `do_not_use` facts.
- Add UI for "This is wrong" and "Do not remember this."

### 7. Voice Council Records Too Much By Default

Risk:

- Realtime voice can capture sensitive speech before consent is clear.

Current controls:

- Operator docs identify transcript opt-in and "do not remember this" as required frontiers.
- The Realtime session token route requires signed-in auth before OpenAI work, bounds thinker ids to known personas, returns private no-store JSON, and uses generic provider-failure receipts without raw OpenAI response bodies.
- The Voice Council client keeps start-session failures generic and does not display or log raw browser, microphone, token, or provider exception details.

Next controls:

- Default transcript retention to off until explicitly enabled.
- Add per-session transcript and memory toggles.
- Display recording/transcript status in the voice UI.
- Summarize after session only with explicit consent.

### 8. Creator/Outreach Tools Accidentally Send Drafts

Risk:

- Draft outreach, Movement scripts, or patron asks could be sent or published before approval.

Current controls:

- `docs/soe-external-effect-route-inventory.md` lists app routes that can send, publish, charge, fulfill, mint, or call external AI/media providers.
- Daily-email, daily email preference toggle, proactive cron, onboarding trigger, ensure-member onboarding, merch product generation, 92B pledge/proposal interest routes, Council waitlist confirmation, public lead-capture routes, salon/book-salon/message routes, live-session routes, daily practice state routes, private dashboard briefing, task routes, wallet/store routes, safe stats, guide leaderboard, guide routes, scan-history and scan scoring routes, world spaces/scan routes, member profile and onboarding self-updates, authenticated member discovery, public feed routes, Great Books text/progress/annotation/seminar, provocation, taste, ritual-drop, ritual generation, Council verdict, Twiddle response generation, voice-note, artifact-generation, practice-reflection, insights, match-generation, match history/response, core thinker chat, thinker action execution, activity/social draft generation, daily practice question generation, community/governance helpers, live-session summary generation, matching helpers, thinker fact extraction, Movement creator helpers, wallet/token disbursement helpers, and memory/action/episode/embedding helpers covered by `external:lazy-clients:smoke` initialize Resend, Anthropic, and Supabase service clients at request time.
- Dashboard home state covered by `external:lazy-clients:smoke` keeps EXP events, scan uploads, passport spaces, and first-visit welcome checks behind signed no-store `/api/dashboard/briefing` responses instead of browser direct table reads.
- Direct-message reads, unread counts, read receipts, and writes covered by `external:lazy-clients:smoke` require signed-in auth, derive actor fields from the authenticated member, validate the peer/recipient before private message queries or inserts, return no-store private JSON, and keep the Members page from reading the message table directly, posting client `senderId` fields, or browser-triggering the notification email route.
- Thinker fact extraction covered by `external:lazy-clients:smoke` validates input before provider calls, requires signed-in self-scope or explicit cron-secret scope, rejects caller-supplied member id mismatches, writes memory under the resolved authenticated member id, and returns no-store private JSON.
- Thinker memory embeddings covered by `external:lazy-clients:smoke` validate input before embedding writes, require signed-in self-scope, reject caller-supplied member id mismatches, write embeddings under the authenticated member id, and return no-store private JSON.
- Daily practice state routes covered by `external:lazy-clients:smoke` return no-store private JSON for today's practice bundle, response feeds, other-explorer snippets, and streak reads, validate answer shape before writes, require signed-in self-scope, keep the response-submit contract free of client `memberId` fields, derive response/streak identity from auth, keep reflection generation signed-in owner-scoped before memory retrieval or AI provider calls, and avoid raw database/provider error leakage.
- Task routes covered by `external:lazy-clients:smoke` require signed-in auth, derive task ownership from the authenticated member, keep Council task creation token-bearing, bound task text fields, return private JSON, and keep the create contract free of client `memberId` fallbacks.
- Council verdict routes covered by `external:lazy-clients:smoke` require signed-in auth before verdict AI/provider and database writes, derive verdict ownership from auth, bound question/response fields, return private no-store JSON for creation, keep public read JSON no-store, and keep verdict callers token-bearing without client `memberId` fields.
- Core thinker route coverage preserves the signed-out Socrates demo while requiring signed-in auth before non-demo AI streams, memory reads/writes, action execution, EXP writes, and Supabase work; the route derives member identity from auth, returns private no-store SSE, avoids client-visible raw stream errors, avoids raw prompt/member-memory debug logs, and keeps Council/Members/Waddle/Salon thinker callers token-bearing without client `memberId` or `walletMemberId` fields.
- Insight memory profile route covered by `external:lazy-clients:smoke` requires signed-in auth before private memory reads or AI headline generation, returns no-store private JSON, filters usable memory rows before display/provider context, and avoids logging raw query details or member ids.
- Philosophical match generation covered by `external:lazy-clients:smoke` requires signed-in auth before candidate reads or AI prompt generation, returns no-store private JSON for every branch, validates AI prompt output before storage, derives participants from authenticated/candidate lookup, and reports generic match-creation failures.
- Matching matrix route covered by `external:lazy-clients:smoke` requires authentication before projection validation and candidate reads, returns private no-store JSON with audit ids, uses request-time Supabase admin access, avoids service-role env reads in the route file, redacts member ids from audit logs, and returns generic candidate-query errors.
- World spaces/scan write routes covered by `external:lazy-clients:smoke` derive host, scanner, verifier, annotation author, and EXP-award member ids from signed-in auth instead of client-supplied ids. Frequency matching derives identity from signed-in auth, has no client `memberId` query contract, and is called with token-bearing no-store fetches. Scan upload auto-scoring uses the request origin instead of a production fallback.
- Member profile, onboarding, and discovery routes covered by `external:lazy-clients:smoke` require signed-in auth before member-state reads/writes, keep profile/onboarding writes self-scoped from auth, keep Council onboarding saves and Members profile saves token-bearing and free of client `memberId` fields, route Members directory reads through sanitized discovery instead of browser `members.select('*')`, bound member-supplied profile and onboarding text, omit wallet/email fields from discovery, return private no-store JSON, and avoid raw database error leakage.
- Public Guide leaderboard covered by `external:lazy-clients:smoke` selects only public guide metrics, returns no-store JSON, emits display-only rank keys instead of raw member ids, omits `guide_since`, bounds display/numeric values, keeps `/leaderboard` on a typed no-store fetch contract, and returns generic database failures.
- Room and cron live-session routes covered by `external:lazy-clients:smoke` require signed-in auth or cron-secret authorization before room-state work or Daily provider calls, derive room creator and participant identity from auth where applicable, keep room ending owner-only, bound room/transcript fields, return private no-store JSON, expose minimal cron receipts, and avoid raw database/provider error leakage. The Daily room creation paths are listed in `docs/soe-external-effect-route-inventory.md`.
- Voice-note generation covered by `external:lazy-clients:smoke` requires signed-in auth before private memory reads or AI/voice provider calls, rejects caller-supplied member id mismatches, writes under the authenticated member id, returns private no-store JSON, and only calls the audio provider when the request includes explicit audio-generation consent.
- Shared TTS playback covered by `external:lazy-clients:smoke` requires signed-in auth before body parsing or ElevenLabs calls, bounds text and voice ids, returns private no-store audio/JSON responses, uses generic provider failures, and only calls the audio provider when the request includes explicit voice-generation consent.
- Artifact generation covered by `external:lazy-clients:smoke` requires signed-in auth before private conversation-context use or AI/image provider calls, rejects caller-supplied member id mismatches, writes under the authenticated member id, returns private no-store JSON, keeps generated artifacts private by default, withholds source context and image prompts unless storage consent is explicit, and only calls Fal image generation when the request includes explicit consent flags.
- Twiddle response generation covered by `external:lazy-clients:smoke` requires signed-in auth before private relationship context, thinker memory reads, AI provider calls, voice synthesis, or AI-suggested action execution; has no client `memberId` API contract; scopes relationship context to the authenticated member's authored threads; returns private no-store JSON; and requires explicit consent before ElevenLabs or action execution can run.
- Great Books EXP award route covered by `external:lazy-clients:smoke` derives member identity from signed-in auth, rejects cross-member awards, and permits only Great Books award reasons.
- Great Books reading progress covered by `external:lazy-clients:smoke` derives reader identity from signed-in auth, keeps progress reads/writes free of client `memberId` fields, and requires token-bearing no-store progress fetches from the library and reader pages.
- Community creation covered by `external:lazy-clients:smoke` derives owner and owner-membership identity from signed-in auth, bounds launch configuration server-side, keeps governance/infrastructure contract and agent spending-limit writes behind `/api/communities`, keeps the create-community client/API contract free of `memberId` body fields and direct setup table writes, and returns no-store private JSON.
- Community governance role assignment covered by `external:lazy-clients:smoke` derives actor identity from signed-in auth, rejects caller-supplied actor mismatches, requires `manage_roles`, and returns no-store private JSON.
- Safe stats covered by `external:lazy-clients:smoke` require signed-in auth, derive the safe owner from authenticated member identity, return no-store private JSON, and keep the access page free of client `memberId` query fields.
- Waddle creation covered by `external:lazy-clients:smoke` requires signed-in auth, derives the creator and storage path from authenticated member identity, bounds audio/transcription fields, returns no-store private JSON, and keeps the client/API contract free of `memberId` form fields.
- Ritual generation covered by `external:lazy-clients:smoke` requires signed-in auth before private profile/conversation reads or AI provider calls, derives artifact writes from authenticated member identity, returns no-store private SSE, and keeps the client/API contract free of `memberId` fields.
- Community joining covered by `external:lazy-clients:smoke` derives membership identity from signed-in auth, keeps the join route free of client `memberId` body fields, and returns no-store private JSON.
- Community matches covered by `external:lazy-clients:smoke` derive read and response identity from signed-in auth, keep the route free of client `memberId` query/body fields, verify match ownership before accept/decline updates, and return no-store private JSON.
- Community questionnaire submissions covered by `external:lazy-clients:smoke` derive match-profile and matching identity from signed-in auth, keep the route free of client `memberId` body fields, validate answers shape, and return no-store private JSON.
- Community product creation covered by `external:lazy-clients:smoke` requires signed-in owner auth, keeps storefront creation free of client `memberId` fields, derives `created_by` from auth, and returns no-store private JSON.
- Docs and Launch Room state no outreach without approved batch and exact message.
- Drafts remain local/app/Drive-ready only.
- `/capital` displays a content-free prep receipt so aggregate dashboard review cannot be confused with outreach, contact imports, checkout sessions, payments, webhook replay, migration, deployment, landlord contact, window action, connected-tool mutation, CRM write, public posts, or public claims.
- `/capital/outreach-lab` displays capital prep readiness and a content-free receipt proving the lab loaded local drafts without send/import/publish/payment/physical actions.
- `npm run capital:outreach-lab:smoke` verifies the outreach lab stays local-only and keeps receipt/approval boundaries visible.
- `/capital/patron-brief` and `/capital/window-kit` also display content-free prep receipts so high-trust calls and physical activation cannot be confused with approved external action.
- `/capital/approvals` displays a content-free prep receipt so browser-local review marks and exact approval text cannot be confused with approval itself.
- `/capital/scenarios` and `/capital/weekly-review` display content-free prep receipts so patron math and browser-local review notes cannot be confused with pledged revenue, ledger writes, CRM records, or approved external action.
- `/capital/launch-room` displays a content-free prep receipt so go/no-go review cannot be confused with deployment, payment collection, checkout sessions, webhook replay, migration, outreach, landlord contact, printing, placement, connected-tool mutation, or public launch.

Next controls:

- Add `draft`, `approved`, `sent` states to creator/outreach objects.
- Require an explicit user approval field before any send-capable workflow can run.
- Keep UTM generation local until a campaign is approved.
- Keep `npm run external:effects:smoke` passing whenever new app routes gain external-effect behavior.
- Expand `npm run external:lazy-clients:smoke` coverage as remaining legacy provider routes move away from module-scope clients.

## Engineering Requirements

Before public launch or broader operator use:

1. Capital admin API response-shape checks should confirm forbidden PII is absent.
2. Checkout metadata should have an allowlist test.
3. Private client pages should use bounded auth loading.
4. Memory facts should support correction/retraction/do-not-use states.
5. Voice sessions should expose transcript and memory consent toggles.
6. Pod export should require recent auth and show an export manifest.
7. Public copy scans should remain part of capital preflight.
8. Any external action workflow should require explicit approval state.

## Verification Commands

Current local guards:

```bash
npm run capital:preflight:smoke
npm run capital:metadata:smoke
npm run capital:checkout-safety:smoke
npm run capital:webhook-safety:smoke
npm run capital:webhook-dedupe:smoke
npm run capital:privacy:smoke
npm run capital:private-pages:smoke
npm run private:route-helper:smoke
npm run private:route-proxy:smoke
npm run capital:admin-shape:smoke
npm run capital:redaction:smoke
npm run capital:routes:smoke
npm run memory:retrieval:smoke
npm run memory:state-migration:smoke
npm run memory:consent-actions:smoke
npm run movement:private-surfaces:smoke
npm run movement:api-boundary:smoke
npm run world:permissions:smoke
npm run external:effects:smoke
npm run external:lazy-clients:smoke
npm run build
```

Recommended next local guards:

```bash
# Future: add database-level RPC verification after the explicit memory-state migration is approved.
```

## Open Decisions For Chris

- Which personal data should never enter AI memory, even with consent?
- Should public patron recognition default to anonymous, display name, or explicit opt-in?
- Should wallet address ever be visible to operators, or only hashed/short-form?
- What is the minimum acceptable retention period for voice transcripts?
- Should pod exports require wallet re-signing every time?
- Which connected tools are allowed to read lead context, and which are draft-only?

## Next Safe Local Work

- Add a capital admin response-shape smoke test that fails if forbidden fields appear.
- Keep checkout metadata allowlist and local live-mode checkout safety smoke tests current.
- Add memory correction/retraction schema and UI plan.
- Add Live Council consent-state copy and UI requirements.
