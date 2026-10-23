# Society of Explorers Current Thread Handoff

Status: local operator draft. This document is for continuity across Codex sessions. It does not authorize external action.

Updated: June 19, 2026.

## Operating Boundary

- Keep external systems read-only unless Chris explicitly approves the specific action.
- Do not deploy, send outreach, contact the landlord, make payments, create checkout sessions, replay live webhooks, print or place window materials, or publish public claims without approval.
- Use `docs/soe-external-action-approval-matrix.md` for exact approval text before any external mutation or physical action.
- Use `docs/soe-external-effect-route-inventory.md` before operator-driven route tests that might send, publish, charge, fulfill, mint, or call external AI/media providers.
- Keep 92B language conditional: intended first physical node only if lease status, repairs, access, and landlord alignment make it viable.
- Patronage rewards are access, recognition, community, and artifacts. Do not use equity, debt, securities, dividends, investor, or financial-return framing.

## Current Build Focus

- 92B patronage engine toward the `$120,000` campaign goal.
- Prompt Atlas billing recovery now routes members with active, trialing, past-due, unpaid, incomplete, or paused subscriptions to Stripe plan management instead of a blocked duplicate checkout. Canceled and expired-incomplete subscriptions can still restart checkout; all checkout responses are private/no-store and checkout navigation is restricted to Stripe's HTTPS host.
- Prompt Atlas now preserves a signed-out member's explicit upgrade intent through email, Google, and SIWE authentication with a non-sensitive URL marker, reopens the transparent plan only after session confirmation, never starts checkout automatically, clears cancelled intent, and rejects external auth callback destinations including backslash-based URL parser bypasses.
- Prompt Atlas now exposes its transparent Pro terms from the global header for signed-out and ordinary free members without a checkout or analytics call; existing and recovery-state subscribers stay on the distinct Stripe plan-management path.
- Prompt Atlas workspace now distinguishes transparent `View Pro`, former-subscriber `Restart Pro`, and blocked-plan management for authenticated zero-run members before making a doomed execution request; server quota enforcement and stale-client `quota_exceeded` recovery remain in place.
- Prompt Atlas now gives canceled and expired-incomplete former subscribers a distinct `Restart Pro` path only when the server session permits fresh checkout. The dialog explains the old plan is inactive, shows current terms, requires explicit checkout, and leaves active/past-due/unpaid/incomplete/paused members on management-only recovery.
- Prompt Atlas private session now derives an allowlisted billing lifecycle state without returning raw Stripe status. Header plan management distinguishes renewal, trial end, scheduled access end, billing attention, and inactive history using the stored period date, while preserving explicit-click-only Stripe navigation.
- Prompt Atlas Pro now states its actual paid allowance: 200 runs per month at a 10 starts/hour fair-use pace, with 4,000 input and 1,400 output token ceilings that bound Sonnet spend. Free custom prompts, favorites, and community discovery are not presented as paid exclusives, and the workspace no longer calls prompt favoriting `Save insight`, because generated results are not persisted by that action.
- Prompt Atlas now has a local sixth migration for a service-role-only aggregate operator function and an email-allowlisted `/operator` evidence view. It reports activation, paid conversion, subscription run rate, token cost, cancellation/recovery pressure, and free-limit demand without returning member identities, prompt content, Stripe identifiers, or individual run rows; refresh is manual and performs no Stripe or analytics action.
- Boston storefront as conditional first physical node and first intended use of funds if viable.
- Private Capital Command Center, Launch Room, Window Kit, Pipeline, and Stripe approval packet.
- Capital checkout safety guard now checks 92B, project pledge, membership, and merch checkout routes use environment-aware return URLs and block local live-mode Stripe checkout creation.
- Membership billing now validates and allowlists checkout requests before Stripe work, requires an authenticated member, derives the checkout email server-side, preserves a signed-out tier choice across email, Google, and wallet auth without automatic checkout, keeps responses private/no-store, restricts navigation to Stripe Checkout, surfaces recoverable member-facing failures, ignores non-membership Checkout events for entitlement grants, maps `$49` to Scholar and `$99` to Philosopher correctly, and returns retryable webhook failures when paid access or cancellation state is not persisted.
- 92B pledge-intent and city-proposal routes now use request-time Supabase admin access, no-store private JSON, bounded input, escaped notification HTML, and Resend notification email gated behind `CAPITAL_LEAD_EMAIL_NOTIFICATIONS_ENABLED=true`.
- Project marketplace list/detail routes now select explicit public fields, sanitize public project payloads, validate project ids, return no-store JSON, and keep project pledge checkout responses no-store with bounded email/source/UTM metadata.
- Project collaboration scaffold now requires signed-in auth before parsing project bodies or looking up members, verifies wallet sessions, imports service Supabase lazily, returns no-store private JSON, remains scaffold-only, and redacts audit logs to counts/flags rather than member, project, wallet, or database error details.
- Project submission and project interest routes now use request-time Supabase admin access, no-store private JSON, bounded input, escaped notification HTML, and Resend notification email gated behind `PROJECT_LEAD_EMAIL_NOTIFICATIONS_ENABLED=true`.
- Founding dinner, music therapy, salon proposal, and salon support public lead routes now use request-time Supabase admin access, no-store private JSON, bounded input, generic DB errors, and escaped notification email behind `PUBLIC_LEAD_EMAIL_NOTIFICATIONS_ENABLED=true` where email already existed.
- Council waitlist confirmation now uses request-time Supabase admin access, no-store private JSON, validation before database writes, duplicate/insert error handling, lazy Resend, escaped operator HTML, and subscriber/operator email suppressed unless `COUNCIL_WAITLIST_EMAIL_NOTIFICATIONS_ENABLED=true`.
- Scheduled daily practice and daily practice follow-up email routes now require cron authorization, return private no-store JSON, escape daily question email HTML, log generic failures, and suppress sends unless `DAILY_PRACTICE_EMAIL_NOTIFICATIONS_ENABLED=true` or `DAILY_PRACTICE_FOLLOWUP_EMAIL_NOTIFICATIONS_ENABLED=true`.
- Daily email preference toggle now requires signed-in auth, uses request-time Supabase admin access, validates body shape before preference writes, returns private no-store JSON, and reports generic database/unexpected failures.
- Test and weekly provocation email routes now require cron authorization, return private no-store JSON, escape generated provocation HTML, log generic failures, and suppress AI/email provider work unless `PROVOCATION_TEST_EMAIL_NOTIFICATIONS_ENABLED=true` or `PROVOCATION_WEEKLY_EMAIL_NOTIFICATIONS_ENABLED=true`.
- Proactive cron and onboarding trigger email paths now use the shared lazy Resend helper, private no-store JSON responses, escaped generated email HTML, and explicit email gates: `PROACTIVE_EMAIL_NOTIFICATIONS_ENABLED=true` and `ONBOARDING_EMAIL_NOTIFICATIONS_ENABLED=true`.
- Onboarding batch trigger proxy now requires cron authorization, safe-parses and bounds request fields, returns private no-store JSON, forwards cron authorization to `/api/onboarding/trigger`, and remains disabled unless `ONBOARDING_BATCH_TRIGGER_ENABLED=true`.
- DM notification email now safe-parses and bounds request body fields, returns private no-store JSON, escapes email HTML and subject text, uses lazy Supabase/Resend clients, logs generic failures, and suppresses email unless `DM_EMAIL_NOTIFICATIONS_ENABLED=true`.
- Capital webhook notification safety now suppresses outbound Resend email unless the Stripe event is live-mode and `CAPITAL_WEBHOOK_EMAIL_NOTIFICATIONS_ENABLED=true`, and the webhook now uses the shared lazy Resend helper inside those guarded branches.
- Capital webhook dedupe guard now verifies 92B and project pledge branches record ledger state and exit duplicate webhook events before lead rows, project totals, EXP events, or notification email side effects.
- Sovereign data pod, wallet-sealed receipts, pod verifier, and Sovereignty Passport.
- Stale Supabase auth recovery and private admin reliability.
- Private capital page reliability guard now checks each private capital UI uses the signed-in Supabase access token, `cache: no-store`, fail-closed loading, admin sign-in guidance, and shared private/no-store admin responses with surrogate no-store plus noindex/nosniff/Vary protections.
- Shared private route helper guard now verifies private JSON and attachment responses carry private/no-store, surrogate no-store, noindex/nosniff, and auth/cookie Vary protections.
- Root lint now excludes nested Next build output, keeps strict runtime TypeScript rules while allowing ambient SDK declarations, and completes with zero errors or warnings. Music-session cleanup and bounded history use stable refs, temple presence tracks current identity without resubscribing on every render, pod retry callbacks no longer capture unstable option objects, and generated artifact/mockup images use the Next image component.
- Root fonts are self-hosted from pinned Fontsource packages rather than requested from Google in the browser, preserving the existing typography without disclosing member page visits to a third-party font host.
- Root production dependencies now use Next `16.2.9`, Anthropic SDK `0.104.2`, ethers `6.17.0`, viem `2.52.2`, and Resend `6.14.0`; unused `next-auth` was removed, patched `postcss` and `ws` transitives are pinned, and both full and production-only `npm audit` checks report zero vulnerabilities.
- React 19 client reliability fixes keep feed arrival tracking and welcome particles out of render-time refs, make Hall loading cancellation-safe, keep scan-score polling recursion stable, and type public activity, community, insight, match, artifact, presence, and travel payloads.
- Root TypeScript now excludes the standalone `prompts-mvp` application so each Next app resolves its own `@/` alias and validates under its own `tsconfig.json`.
- Private route proxy guard now verifies the Salon, Members, and Book route gate keeps both unauthenticated redirects and authenticated pass-through responses private no-store and noindex.
- Movement private-surface reliability guard now checks personal mirror, pod, memory, sovereignty passport, voice session-token, and creator-studio calls use explicit `cache: no-store` where they read or mutate private member state, with personal mirror client failures kept generic.
- Movement API boundary guard now checks private Movement API routes use no-store private JSON or no-store attachment/stream responses, authenticate before member-state work or provider calls, avoid module-scope Supabase clients in manager routes, and keep Personal Mirror route/stream failures plus manager generation failures generic.
- External effect route inventory now tracks payment, webhook, email, notification, AI/media provider, Printful, and mint-capable app routes so operator-driven tests remain approval-gated.
- External effect lazy-client guard now covers daily-email, daily email preference toggle, proactive cron, onboarding trigger, ensure-member onboarding, merch product generation, 92B pledge/proposal interest routes, Council waitlist confirmation, public lead-capture routes, salon/book-salon/message routes, live-session routes, daily practice state routes, private dashboard briefing, task routes, Salon Hub task routes/client callers, wallet/store routes, safe stats, guide leaderboard, guide routes, scan-history and scan scoring routes, world spaces/scan routes, member profile and onboarding self-updates, authenticated member discovery, public explorer profiles, public feed routes, Great Books text/progress/annotation/seminar, provocation, taste, ritual-drop, ritual generation, Council verdict, Twiddle core routes/client callers, Twiddle response generation, voice-note, artifact-generation, practice-reflection, insights, match-generation, match history/response, core thinker chat, thinker action execution, activity/social draft generation, daily practice question generation, community/governance helpers, live-session summary generation, matching helpers, thinker fact extraction, Movement creator helpers, wallet/token disbursement helpers, and memory/action/episode/embedding helpers so Resend, Anthropic, and Supabase service clients initialize at request time instead of at module import time.
- Environment readiness guard now covers local/test placeholders, no-real-secret examples, Stripe merch webhook secrets, Resend/Fal/Daily/ElevenLabs/Printful provider keys, cron and signer secrets, Base membership/achievement contract addresses, Movement on-chain commitments, Solana EXP minting config, membership/merch/mint flags, local auth, pod, and wallet secrets, with exact approval-matrix coverage for env changes that can send, fulfill, mint, write on-chain, or call providers.
- Labyrinth image proxy now restricts proxied images to the Giovanni DeCunto upload path, blocks redirects, enforces timeout and byte limits, allows only raster image MIME types, adds no-sniff plus same-origin embed headers, and is covered by `npm run image-proxy:smoke`.
- Merch suggestion queue, AI product generation, mockup generation, and Printful publish now require Movement manager access, return private no-store JSON, delay provider/env work until after auth, and keep the Salon overlay free of direct browser `merch_suggestions` table reads/writes.
- Dashboard private home state now routes EXP activity, scan uploads, passport spaces, and first-visit welcome checks through `/api/dashboard/briefing`; the browser page uses a signed no-store fetch and does not directly read private dashboard tables.
- Direct-message reads, unread counts, read receipts, and writes now require signed-in auth, derive actor fields from the authenticated member, validate the peer/recipient before private message queries or inserts, return no-store private JSON, keep Members message callers token-bearing without client `senderId`, and avoid browser-triggered DM notification email calls.
- Book salon creation, joining, detail reads, and seminar messages now use no-store private JSON, derive creator/joiner/speaker identity from signed-in auth, sanitize public message/member payloads away from raw member ids, keep posting member-only, and keep Book Salon pages token-bearing without client `memberId` or `memberName` mutation bodies.
- Guide leaderboard now uses request-time Supabase access, explicit public fields, no-store JSON, generic database failures, bounded display/numeric values, display-only `rankKey` values instead of raw member ids, no `guide_since` exposure, and a typed `/leaderboard` client contract.
- Safe stats now require signed-in auth, derive the member id server-side from the authenticated member, return no-store private JSON, and no longer accept an access-page `memberId` query.
- Waddle creation now requires signed-in auth, derives the creator and storage path from the authenticated member, bounds audio/transcription fields, returns no-store private JSON, and no longer accepts a client `memberId` form field.
- Ritual generation now requires signed-in auth, derives profile/conversation context and artifact writes from the authenticated member, returns no-store private SSE, and no longer accepts a client `memberId` field.
- Task creation now requires signed-in auth, derives task ownership from the authenticated member, bounds task text fields, returns no-store private JSON, and keeps Council task creation token-bearing without client `memberId` fields.
- Salon Hub task reads, creation, status updates, and deletion now run through `/api/salon-hub/tasks`, require signed-in auth, derive task ownership from the authenticated member, bound task titles/agent ids, validate UUID/status values, return no-store private JSON, and keep the Salon Hub overlay free of browser `hub_tasks` reads/writes or client `member_id` fields.
- Council verdict creation now validates and bounds session/question/response fields, requires signed-in auth before Anthropic or Supabase work, writes public verdict sessions under the authenticated member id, returns no-store private JSON, and keeps Council verdict callers token-bearing without client `memberId` fields. Public verdict reads now use request-time Supabase admin access with public no-store JSON.
- Core thinker chat now preserves the signed-out Socrates demo path but requires signed-in auth for every non-demo stream before Anthropic, memory, action, or Supabase work, derives member identity from auth, returns private no-store SSE, avoids raw stream error leakage, avoids raw prompt/member-memory debug logs, and keeps Council/Members/Waddle/Salon thinker callers token-bearing without client `memberId` or `walletMemberId` fields.
- Thinker fact extraction now validates body shape before provider calls, requires signed-in self-scope or explicitly configured cron-secret scope, writes memory under the resolved authenticated member id, uses request-time Supabase admin access, returns no-store private JSON, and rejects caller-supplied `memberId` mismatches.
- Thinker memory embedding writes now validate body shape before embedding-provider work, require signed-in self-scope, write embeddings under the authenticated member id, return no-store private JSON, and reject caller-supplied `memberId` mismatches.
- Daily practice state now returns the today's-practice bundle, response feeds, other-explorer snippets, and streak reads through no-store private JSON, validates answer shape before writes, requires signed-in self-scope for response/streak writes, derives response/streak identity from authenticated auth, keeps the response-submit contract free of client `memberId` fields, and gates practice reflection generation to the signed-in owner before memory retrieval or AI provider calls.
- Salon list GET now uses explicit public fields, bounded status filters, no-store private JSON, public member counts, display-only guide names, and no raw salon-row spreading; `/salon` uses no-store fetches for list and member salon state.
- Salon creation through `/api/salons` now validates JSON before writes, bounds title/description/community/topic fields, returns a minimal explicit salon receipt, checks creator-membership/session insert failures, and uses generic no-store private errors instead of raw database messages.
- Salon city leaderboard now reads only the `why` lead-capture field, parses bounded public city names into aggregate proposal/support counts, limits rows/results, returns no-store private JSON, and `/salons` fetches city and 92B progress data with no-store semantics.
- Salon message save/load now validates JSON before writes, bounds salon id/sender/content fields, uses explicit message selects, serializes through public message fields, returns no-store private JSON, and avoids raw message rows, raw database logs, or database error leakage.
- Salon detail GET now uses explicit salon/member/session selects, returns no-store private JSON, serializes display-safe member and session keys, and omits raw member ids, EXP, tier, attendance arrays, transcript summaries, and raw rows.
- `/api/salons/my-salon` now exists as an explicit signed-in route for `/salon`, self-scopes membership from authenticated member identity, returns no-store private JSON, and serializes only display-safe salon/member/session state.
- Salon detail POST now authenticates before dispatching local mutation actions, validates action/body shape, keeps joins auth-derived, records attendance only for signed-in salon members, scopes session completion to the session leader or salon guide, scopes graduation to the salon guide, and returns no-store private receipts without raw attendance, transcript, EXP, or member-id result lists.
- Salon session reads now return explicit public session fields only; session creation requires the signed-in salon guide and derives `led_by_member_id` from the authenticated member, while session updates require the signed-in session leader or salon guide and return minimal private receipts without transcript or EXP internals.
- Guide dashboard reads now use explicit guide-salon fields, no-store private JSON, bounded guide metrics, sanitized spawning-tree nodes, and helper guardrails against `salons(*)`, `select('*')`, raw guide ids, `guide_since`, or per-salon EXP totals.
- Guide salon creation now validates JSON before writes, bounds title/description/UUID fields, checks parent salon ownership and completion against the authenticated guide, returns only an explicit minimal salon receipt, and uses generic private errors instead of raw database messages.
- Insight memory profile reads now require signed-in auth before Supabase reads or AI headline generation, return no-store private JSON, filter usable memory rows before display/provider context, and avoid logging raw query details or member ids on read failures.
- Philosophical match generation now requires signed-in auth before candidate reads or AI prompt generation, returns no-store private JSON for every branch, validates AI prompt output before storage, derives both participants from authenticated/candidate lookup, and reports generic match-creation failures.
- Matching matrix calculations now authenticate before projection validation and candidate reads, use request-time Supabase admin access, return private no-store JSON with audit ids, avoid service-role env reads in the route file, redact member ids from audit logs, and return generic candidate-query errors.
- Match history now uses an explicit matched-conversation field list and serializes only public UI fields without raw member ids, ratings, or feedback. Match responses now validate UUID/action/rating/feedback bounds before authenticated writes, keep ownership checks, preserve idempotent completion EXP, and return generic failures for database/EXP errors.
- World spaces/scan write routes now derive creator, host, scanner, verifier, annotation author, and EXP-award member identity from signed-in auth instead of trusting client-supplied ids. Frequency matching is signed-in, self-scoped, no-store, and no longer transports client `memberId` query fields. Scan upload auto-scoring now calls same-origin `/api/scan/score` instead of falling back to production.
- World permissions guard now verifies pending/archived space access uses the shared host helper, accepting canonical member ids and Supabase auth ids while rejecting unrelated host ids. The dormant access-grant helper also fails closed because the current spaces schema has no collaborator relation and must not claim a grant succeeded without a persisted consent model.
- World frequency matching now strictly bounds `limit`, selects only id/display/coherence data server-side, validates finite coherence inputs, omits EXP and raw member ids from responses, and returns display-only match keys to the client.
- World spaces list/create now uses explicit public summary fields, bounded JSON and slug/type/location validation for creates, minimal create receipts, and generic database/EXP failures without returning host ids, addresses, metadata, or raw space rows.
- World space detail now validates UUID route params, explicit-selects and public-shapes space/scans/annotations, excludes proof hashes, file URLs, scanner ids, author ids, and metadata, bounds host-only PATCH updates, and checks delete cascade errors before deleting the space.
- World annotation writes now bound JSON/content/type/position, reject invalid scan/type inputs before database work, verify optional scan ids belong to the same space, use explicit annotation insert fields, return generic database/EXP failures, and expose only a minimal annotation receipt.
- World scan verification now bounds and validates JSON before auth/database work, uses explicit scan and quality-score selects, checks the signed-in host, updates only unverified scans, and returns generic database/EXP failures.
- World scan upload now requires signed-in auth, bounds file/type/space id, uses explicit insert return fields, keeps proof hashes server-side, returns a minimal upload receipt, and avoids exposing raw scan rows.
- Scan upload now requires signed-in auth, bounds file/format/location/space id, uses explicit insert return fields, keeps proof hashes and storage paths server-side, returns a minimal upload receipt, and calls same-origin scoring without exposing raw scan rows.
- Member profile, onboarding, and discovery routes now require signed-in auth before member-state reads/writes, return no-store private JSON, keep profile/onboarding writes self-scoped from the authenticated member, bound member-supplied profile and onboarding text, keep Council onboarding saves and Members profile saves token-bearing and free of client `memberId` fields, route the Members directory through sanitized discovery instead of browser `members.select('*')`, omit wallet/email fields from discovery, and return generic database errors.
- Public explorer profiles now share a typed sanitized loader between `/api/explorer/[id]` and `/explorer/[id]`, validate explorer ids before database reads, expose only the public profile/reflection shape, use request-time Supabase admin access through the lazy helper, and keep the server page free of duplicated service-role queries.
- Room listing, creation, join/leave/end, and transcript routes now use request-time Supabase admin access, require signed-in auth before room-state work or Daily provider calls, derive participant and creator identity from auth, bound room/transcript fields, make room ending owner-only, return no-store private JSON, and list Daily room creation in the external-effect inventory.
- Legacy Live Council listing, create/go-live, join, end, and summarization routes now use no-store private JSON, derive live-session participant identity from signed-in auth, gate create/go-live/end/summarize behind Movement manager access, and keep `/live` token-bearing without client `memberId` mutation bodies.
- Cron Live Council creation now fails closed when `CRON_SECRET` is unset or missing, returns no-store private JSON, and exposes only a minimal session receipt instead of raw room/provider data.
- Voice-note generation now requires signed-in auth before private memory reads or AI/voice provider calls, rejects body-supplied member id mismatches, writes voice notes under the authenticated member id, returns no-store private JSON, and requires explicit audio-generation consent before ElevenLabs can be called.
- Transcription now requires signed-in auth before audio parsing or provider calls, requires request transcription consent, bounds audio and returned transcript size, returns no-store private JSON with generic provider failures, and Waddle/Twiddle recorder callers send bearer tokens where available.
- Shared TTS playback now requires signed-in auth before body parsing or ElevenLabs calls, requires explicit voice-generation consent, bounds text and voice ids, returns no-store private audio/JSON responses with generic provider failures, and the shared `speakText` helper sends bearer tokens where available.
- Artifact generation now requires signed-in auth before private conversation context is used in AI/image provider calls, rejects body-supplied member id mismatches, writes under the authenticated member id, returns no-store private JSON, keeps artifacts private by default, withholds generated prompts unless storage consent is explicit, and requires explicit consent before Fal image generation or source-context storage.
- Artifact merch ordering now requires signed-in auth, validates ownership against the authenticated member's artifact, uses request-time Supabase admin access, returns no-store private JSON, records order failures explicitly, and cannot call Printful unless `ARTIFACT_MERCH_ORDERING_ENABLED=true` plus fulfillment approval is in place.
- Artifact mint recording now requires signed-in auth, validates ownership against the authenticated member's artifact or mint row, uses request-time Supabase admin access, returns no-store private JSON, validates wallet/transaction/token fields, and cannot create or confirm mint records unless `ARTIFACT_NFT_MINT_RECORDING_ENABLED=true` plus chain-state approval is in place.
- Twiddle creation, detail/update, and reaction routes now use request-time Supabase admin access, validate UUID/body shape before writes, return no-store private JSON, derive authorship/reactions/edit ownership from the authenticated member's Supabase auth id, and no longer declare or inspect client `memberId` fields. Twiddle feed, thread, and constellation client pages now send Supabase bearer tokens where available, use no-store fetches for private reads, and do not transport member ids in Twiddle URLs or mutation bodies.
- Twiddle response generation now requires signed-in auth before private relationship context, thinker memory, AI provider calls, voice synthesis, or AI-suggested action execution; no longer declares or inspects client `memberId` fields; scopes relationship context to the authenticated member's own authored threads; returns no-store private JSON; and requires explicit consent before ElevenLabs or action execution can run.
- `twiddle:cron-auth:smoke` is wired into the default operator suite and verifies the Twiddle cron route fails closed without a nonblank `CRON_SECRET` before privileged Supabase or Anthropic clients are constructed.
- Great Books reading progress now requires signed-in auth, uses request-time Supabase admin access, returns no-store private JSON, derives reader identity from auth for reads/writes, and no longer transports client `memberId` fields from the library or reader progress calls.
- Great Books EXP awards now require signed-in auth, are self-scoped to the authenticated member, allow only Great Books award reasons, and use no-store private JSON with request-time Supabase admin access.
- Agent transaction listing and approval routes now require signed-in auth, use request-time Supabase admin access, return no-store private JSON, self-scope ordinary members to their incoming rows, and require community governance permission before broader listing or approval.
- Community creation now requires signed-in auth, derives `owner_member_id` and owner membership from the authenticated member, uses request-time Supabase admin access, applies bounded DAO launch configuration, writes governance/infrastructure contracts and agent spending limits server-side, returns no-store private JSON, and keeps the create-community page free of direct community, wallet, spending-limit, or contract table writes.
- Public community detail reads now use request-time Supabase admin access, no-store JSON, and explicit allowlists for community, contract, member, profile, and product fields instead of service-role `select('*')` payloads.
- Community governance role assignment now requires signed-in auth, derives role-assignment authority from the authenticated member, checks `manage_roles`, uses request-time Supabase admin access, returns no-store private JSON, and rejects caller-supplied actor mismatches.
- Community thinker management now reads only explicit public thinker fields and requires signed-in `manage_thinkers` permission before create/update, with bounded/sanitized fields, no-store private JSON, request-time Supabase admin access, and no arbitrary update payloads.
- Community joining now requires signed-in auth, derives membership identity from the authenticated member, uses request-time Supabase admin access, returns no-store private JSON, and no longer reads client `memberId` body fields.
- Community match reads and accept/decline responses now require signed-in auth, derive match identity from the authenticated member, verify match ownership before updates, use request-time Supabase admin access, return no-store private JSON, and no longer accept client `memberId` query/body fields.
- Community questionnaire submissions now require signed-in auth, derive match-profile identity from the authenticated member, validate answers shape before writes, use request-time Supabase admin access, return no-store private JSON, and no longer accept client `memberId` body fields.
- Community store product listing/creation now uses explicit public product fields and bounded creation inputs. Store balance and purchase routes require signed-in auth, use request-time Supabase admin access, return no-store private JSON, avoid client `memberId` query/body fields, derive balance/debit/order/refund/denormalized token updates from the authenticated buyer, validate product/community ids before purchase writes, and return purchase receipts without raw buyer/order internals.
- Scan archive reads now require signed-in auth, bound page/limit/offset/status query parameters, use explicit scan/space field lists, serialize through a public scan response shape, omit proof hashes and storage paths from `/api/scan/my-scans`, and return generic failures for database or unexpected errors.
- Scan scoring now bounds and validates body fields before auth/database work, uses explicit scan and quality-score selects, keeps host/system review scoped, records system reviewers as null database reviewers, returns generic database/EXP failures, and awards EXP only through the resolved scan owner.
- Member wallet attachment now requires signed-in auth, is self-scoped to the authenticated member, normalizes Ethereum addresses, prevents attaching a wallet already owned by another member, and only attempts pending membership NFT minting when `MEMBERSHIP_NFT_AUTO_MINT_ENABLED=true`.
- Community product creation now requires signed-in auth, is owner-only by authenticated member id, uses request-time Supabase admin access, returns no-store private JSON, and no longer accepts client `memberId` fields for storefront creator attribution.
- Local privacy threat model for capital, wallet identity, memory, pods, voice, and creator operations.
- Local memory consent plan for correction, retraction, do-not-use, voice consent, and retrieval exclusion.
- Memory fact route now supports signed-in `PATCH` actions for `correct`, `retract`, and `do_not_use` without requiring an immediate database migration.
- Memory retrieval policy now filters expired, suppressed, corrected, retracted, and do-not-use rows before AI context assembly when those fields are present, and `memory:retrieval:smoke` guards major prompt/read paths for active-only semantic memory access.
- A local memory consent state migration draft now adds explicit status, suppression, replacement, and review metadata at `supabase/migrations/20260528_memory_consent_states.sql`; it is review-only and not approved for production.
- Memory fact actions are prepared to write explicit state columns behind `MEMORY_CONSENT_STATE_COLUMNS_ENABLED=true`, with schema fallback to legacy `valid_until` writes if the flag is enabled too early.
- Private memory overview now displays consent mode and readiness so operators can see whether the app is still in legacy-safe mode or explicit-state mode, and its client/API/helper failure paths avoid raw exception, generated text, provider, member, or database details; memory helper failures stay generic.
- Memory fact actions now return compact consent receipts, and the private memory page shows the latest receipt without exposing raw memory history, raw client exception details, or raw API database errors.
- Pod export manifest, wallet-sealed pod sync, pod client failure handling, and sovereignty passport client/API handling now carry memory/custody safety metadata where relevant, avoid raw memory content in manifest/passport views, and return/log/display generic private failures without raw database, builder, provider, wallet, or passport exception details; generic pod helper failures and generic sovereignty helper failures are scoped warnings only.
- Pod wallet seal guard now verifies wallet-derived pod exports and seal receipts reproduce their hashes while storing wallet custody as hash-only metadata, not raw wallet signatures or decryptable key material.
- Live Council now shows defaults-off transcript and memory consent controls, bounds Realtime thinker ids, passes consent flags to the Realtime session instructions, and returns/displays generic private failures instead of raw OpenAI, browser, microphone, or client exception details.
- Private AI Status reports provider, model, and env-presence readiness without exposing secret values or calling external AI APIs.
- AI Status now carries a read-only no-provider-call receipt confirming no external AI provider call, message generation, embedding generation, realtime session creation, secret value exposure, database write, connected-tool mutation, deploy, payment, outreach, or public action occurred.
- Movement Studio now reads `/api/movement/scripts` through a sanitized explicit-select queue and `/api/movement/scripts/ops` for daily creator checklist, latest-question script coverage, performance-note gaps, and no-publishing boundary.
- Movement script-by-question reads now validate question ids, use explicit script/UTM fields, sanitize script payloads, and only include creator performance metadata for Movement managers.
- Movement Studio can save manager-gated local performance metadata through `/api/movement/scripts/performance/[scriptId]` into the existing `movement_scripts.performance` JSONB field.
- Movement Studio now shows draft-only creator readiness and local creator receipts for script generation, bounded status changes, and sanitized performance notes; receipts confirm no posting, sending, scheduling, or paid promotion occurred, and queue/status/copy/performance/generation failures avoid raw script rows or raw client/API error details.
- Pod export now has a signed-in `/api/movement/pod/manifest` preview with counts and custody metadata before encrypted download.
- Private Weekly Review gives the 92B push a browser-local cadence for money collected, committed pledges, strongest story, top objection, next ask, and approval-needed decisions.
- Capital admin response-shape guard now checks private admin API response keys and fixtures for forbidden contact, wallet, Stripe, and raw-note identifiers, including responses returned through the shared private JSON helper.
- Capital private page reliability guard now covers `/capital`, `/capital/launch-room`, `/capital/approvals`, `/capital/patron-brief`, `/capital/scenarios`, `/capital/outreach-lab`, `/capital/weekly-review`, `/capital/window-kit`, `/capital/pipeline`, and `/capital/ai-status`, including shared private/no-store admin responses with surrogate no-store plus noindex/nosniff/Vary protections and generic admin readiness-check logs.
- Capital Command Center now returns and displays capital prep readiness plus a content-free receipt for aggregate dashboard review; loading it performs no outreach, import, checkout, payment, webhook replay, deploy, migration, landlord contact, window action, connected-tool mutation, CRM write, public post, or public claim.
- Capital pipeline free-text redaction now masks emails, phone numbers, wallet addresses, and Stripe ids before storing redacted lead context or event notes.
- Capital Pipeline now previews redaction in the browser before save, while server-side redaction remains the enforcement point.
- Capital Pipeline now returns and displays private redacted metadata receipts for load/create/update actions; receipts distinguish database writes from outreach, contact imports, checkout sessions, payments, deploys, landlord contact, public posts, or window actions.
- Launch Room now returns and displays capital prep readiness plus a content-free receipt for go/no-go review: No deploy, public launch, payment collection, checkout session, webhook replay, migration, outreach, landlord contact, printing, physical placement, connected-tool mutation, or public claim occurred.

## Key Local Surfaces

- `/92b/fund` - public patronage campaign page.
- `/capital` - private Capital Command Center.
- `/capital` now carries capital prep readiness and a content-free no-action receipt so aggregate metrics, readiness gates, pipeline summaries, and draft materials cannot be confused with outreach, payments, migrations, deploys, landlord contact, window action, connected-tool mutation, CRM state, or public launch.
- `/capital/launch-room` - private go/no-go surface and approval packet.
- `/capital/launch-room` now carries capital prep readiness and a content-free no-action receipt so dry-run commands, launch gates, approval packets, and seven-day sequencing cannot be confused with deployment, payments, outreach, landlord contact, printing, placement, or public launch.
- `/capital/approvals` - private local review checklist for exact external-action approvals.
- `/capital/approvals` now carries a content-free prep receipt stating local checklist review granted no approvals and triggered no external action.
- `/capital/patron-brief` - private patron call guide with ask ladder, objections, and no-send boundary.
- `/capital/patron-brief` now carries capital prep readiness and a content-free no-action receipt for patron-call preparation.
- `/capital/scenarios` - private patron-mix and pace planner for the 92B $120k goal.
- `/capital/scenarios` now carries a content-free prep receipt stating scenario math produced no pledges, payments, outreach, deploys, landlord contact, window actions, or public claims.
- `/capital/outreach-lab` - private local-only outreach batch prep surface with redacted slots and exact approval text.
- `/capital/outreach-lab` now returns and displays capital prep readiness plus a content-free no-action receipt so operators can prove the lab loaded drafts without sending, importing, charging, deploying, placing, or publishing anything.
- `/capital/outreach-lab` includes `One Supporter validation` with the `First Supporter Pledge` draft as the smallest warm outreach path after production promotion and post-promotion verification. It still sends nothing and requires exact recipient/channel/copy/window approval.
- `/capital/weekly-review` - private browser-local weekly capital review; no CRM, ledger, sender, deploy, payment, or approval authority.
- `/capital/weekly-review` now carries a content-free prep receipt stating local weekly notes created no ledger rows, CRM records, messages, checkout sessions, deploys, connected-tool mutations, or public posts.
- `/capital/window-kit` - private window activation package.
- `/capital/window-kit` now carries capital prep readiness and a content-free no-action receipt for sign/QR/patron-note preparation; it does not approve printing, placement, landlord contact, or public activation.
- `/capital/pipeline` - private redacted capital pipeline.
- `/capital/ai-status` - private AI provider and model readiness status with a read-only no-provider-call receipt.
- `/movement/sovereignty` - private Sovereignty Passport.
- `/movement/pod/verify` - pod receipt verifier.
- `/api/movement/pod/manifest` - signed-in pod export manifest without raw payload or ciphertext.
- `docs/soe-external-action-approval-matrix.md` - exact approval matrix for deploys, Stripe tests, migrations, outreach, landlord contact, window placement, connected-tool mutations, and browser/computer automation with external effects.
- `docs/soe-external-effect-route-inventory.md` - route inventory for app surfaces that can send, publish, charge, fulfill, mint, or call external AI/media providers.
- `docs/soe-env-readiness-template.md` - local/test/production environment readiness checklist for capital, admin, AI, email, voice/media, cron, fulfillment, mint, blockchain, memory, wallet, and pod secrets.

## Current Verification Commands

Run these before trusting capital-system changes:

```bash
npm run operator:smoke -- --list
npm run prompt-atlas:verify:list
npm run operator:script-boundary:smoke
npm run operator:manifest:smoke
npm run prompt-atlas:verify
npm run capital:preflight:smoke
npm run capital:metadata:smoke
npm run capital:checkout-safety:smoke
npm run capital:funding-conversion:smoke
npm run membership:billing:smoke
npm run capital:webhook-safety:smoke
npm run capital:webhook-dedupe:smoke
npm run capital:privacy:smoke
npm run capital:private-pages:smoke
npm run private:route-helper:smoke
npm run private:route-proxy:smoke
npm run capital:admin-shape:smoke
npm run capital:redaction:smoke
npm run capital:approvals:smoke
npm run capital:patron-brief:smoke
npm run capital:window-kit:smoke
npm run capital:scenarios:smoke
npm run capital:outreach-lab:smoke
npm run capital:weekly-review:smoke
npm run capital:revenue:smoke
npm run capital:live-payment:smoke
npm run capital:profit:smoke
npm run capital:first-revenue:smoke
npm run capital:post-promotion:smoke
npm run capital:go-live:readiness:smoke
npm run capital:go-live:smoke
npm run capital:paid-traffic:smoke
npm run public:discovery:smoke
npm run auth:stale-supabase:smoke
npm run auth:wallet-session-secret:smoke
npm run member:wallet-route:smoke
npm run memory:privacy:smoke
npm run memory:retrieval:smoke
npm run memory:state-migration:smoke
npm run memory:consent-actions:smoke
npm run movement:private-surfaces:smoke
npm run movement:api-boundary:smoke
npm run voice:consent:smoke
npm run ai:status:smoke
npm run creator:ops:smoke
npm run pod:export:smoke
npm run pod:wallet-seal:smoke
npm run sovereignty:passport:smoke
npm run world:permissions:smoke
npm run twiddle:cron-auth:smoke
npm run external:boundary:smoke
npm run external:effects:smoke
npm run external:lazy-clients:smoke
npm run image-proxy:smoke
npm run env:readiness:smoke
npm run operator:smoke
npm run capital:routes:smoke
npx eslint scripts/capital-preflight.mjs scripts/capital-preflight-smoke.mjs lib/auth/getSession.ts app/capital/launch-room/page.tsx lib/capital/launchRoom.ts
npm run capital:preflight -- --routes --supabase-read --stripe-read --soft
npm run capital:preflight -- --production-env --supabase-read --stripe-read --soft
npx vercel env run --environment=production -- npm run capital:live-payment:readiness -- --stripe-read
npx vercel env run --environment=production -- npm run capital:revenue:snapshot -- --stripe-read
npm run build
```

Expected current shape:

- `capital:preflight:smoke` passes.
- `capital:preflight:smoke` also verifies Launch Room receipts remain local-draft-only and cannot be treated as deployment, payment, migration, outreach, landlord, physical, connected-tool, or public-launch action.
- `capital:metadata:smoke` passes.
- `capital:checkout-safety:smoke` passes and verifies checkout routes keep environment-aware return URLs, use Checkout Sessions, and block local live-mode checkout creation before any Stripe session call.
- `capital:funding-conversion:smoke` passes and verifies 92B prices come only from reviewed server tiers, attribution is bounded, Stripe navigation is allowlisted, checkout failures are visible and retryable, payment-return copy waits for fulfillment, and untracked direct-wallet pledges stay disabled.
- `membership:billing:smoke` passes and verifies displayed tier economics, authenticated member/email scoping, explicit post-auth tier review, same-origin auth returns, checkout validation, Stripe-host-only navigation, visible failure recovery, membership-only entitlement dispatch, correct fallback tier mapping, checked entitlement/cancellation writes, and retryable fulfillment failures.
- `external:lazy-clients:smoke` verifies 92B pledge-intent and city-proposal lead-capture routes are request-time Supabase backed, no-store/private, input-bounded, notification-HTML escaped, and unable to send Resend email unless `CAPITAL_LEAD_EMAIL_NOTIFICATIONS_ENABLED=true`.
- `external:lazy-clients:smoke` verifies Council waitlist confirmation is request-time Supabase backed, no-store/private, duplicate-guarded, direct-email-free, notification-HTML escaped, and unable to send Resend email unless `COUNCIL_WAITLIST_EMAIL_NOTIFICATIONS_ENABLED=true`.
- `external:lazy-clients:smoke` verifies scheduled daily practice and daily practice follow-up email routes are cron-authorized, no-store/private, question-HTML escaped, generic-log-only, direct-email-free, and unable to send unless their explicit daily practice email flags are enabled.
- `external:lazy-clients:smoke` verifies daily email preference toggle is signed-in, private/no-store, request-time Supabase backed, validation-before-write, and generic-failure-only.
- `external:lazy-clients:smoke` verifies test and weekly provocation email routes are cron-authorized, no-store/private, generated-HTML escaped, generic-log-only, direct-email-free, and unable to call AI or Resend unless their explicit provocation email flags are enabled.
- `external:lazy-clients:smoke` verifies proactive and onboarding generated email routes are cron-authorized before provider clients, no-store/private, direct-email-free, generated-HTML escaped, and unable to send Resend email unless `PROACTIVE_EMAIL_NOTIFICATIONS_ENABLED=true` or `ONBOARDING_EMAIL_NOTIFICATIONS_ENABLED=true`.
- `external:lazy-clients:smoke` verifies onboarding batch trigger proxy is cron-authorized, no-store/private, input-bounded, authorization-forwarding, and unable to proxy to onboarding generation unless `ONBOARDING_BATCH_TRIGGER_ENABLED=true`.
- `external:lazy-clients:smoke` verifies DM notification email is cron-authorized before provider clients, no-store/private, input-bounded, HTML-escaped, subject-sanitized, direct-email-free, and unable to send Resend email unless `DM_EMAIL_NOTIFICATIONS_ENABLED=true`.
- `capital:webhook-safety:smoke` passes and verifies capital webhook notification email requires a live-mode Stripe event plus `CAPITAL_WEBHOOK_EMAIL_NOTIFICATIONS_ENABLED=true`, and uses the shared lazy Resend helper rather than direct SDK construction.
- `capital:webhook-dedupe:smoke` passes and verifies duplicate webhook events do not double-count pledge rows, project totals, lead rows, EXP awards, or notification email side effects.
- `capital:privacy:smoke` passes.
- `capital:privacy:smoke` also verifies the private capital pipeline route returns generic private no-store failures without raw database messages.
- `capital:private-pages:smoke` passes and verifies private capital pages use admin routes, signed-in tokens, no-store fetches, bounded loading exits, admin sign-in guidance, shared private/no-store admin API responses with surrogate no-store plus noindex/nosniff/Vary protections, and generic admin availability logs.
- `private:route-helper:smoke` passes and verifies shared private JSON and attachment responses stay private/no-store, surrogate no-store, noindex/nosniff, auth/cookie Vary-aware, and filename-sanitized.
- `private:route-proxy:smoke` passes and verifies Salon, Members, and Book route proxy gating keeps protected redirects and pass-through responses private no-store and noindex.
- `capital:admin-shape:smoke` passes and verifies capital admin responses stay aggregate/redacted.
- `capital:admin-shape:smoke` also verifies the Capital Command Center receipt remains local-only and no-action.
- `capital:privacy:smoke` verifies the Capital Command Center returns generic private no-store failures without raw aggregate-read database messages.
- `capital:redaction:smoke` passes and verifies capital pipeline free-text fields mask private identifiers and lead display labels collapse likely raw full names into private aliases.
- `capital:redaction:smoke` also verifies pipeline receipts distinguish redacted metadata writes from external outreach/payment/public actions.
- `capital:approvals:smoke` passes.
- `capital:approvals:smoke` also verifies approval-checklist receipts remain local-only and cannot be treated as authorization.
- `capital:patron-brief:smoke` passes.
- `capital:window-kit:smoke` passes and verifies QR/sign preparation remains local-only and no-action.
- `capital:scenarios:smoke` passes.
- `capital:scenarios:smoke` also verifies scenario receipts remain planning-only and no-action.
- `capital:outreach-lab:smoke` passes.
- `capital:outreach-lab:smoke` also verifies capital prep receipts stay local-draft-only and approval-gated before external actions, and that the one-person First Supporter pledge path remains bounded to exact approval.
- `capital:weekly-review:smoke` passes.
- `capital:weekly-review:smoke` also verifies weekly review receipts remain browser-local and no-action.
- `capital:revenue:smoke` passes and verifies the opt-in Stripe revenue snapshot stays aggregate-only, read-only, identifier-free, breaks recent 92B paid activity down by reviewed tier, refuses to invent a conversion rate without visitor data, and remains explicit that Stripe cash contribution is not accounting profit.
- `capital:live-payment:smoke` passes and verifies the opt-in live payment readiness check lists Stripe webhook endpoints read-only, requires `--stripe-read`, checks the live `/api/stripe/webhook` endpoint, exact approved events, live mode, and `STRIPE_WEBHOOK_SECRET` shape without printing secret values, and is wired into the profit gate before paid-traffic decisions.
- `capital:first-revenue:smoke` passes and verifies the read-only first revenue readiness command composes the profit gate with the local paid-traffic packet, preserves exact production and first-conversion approval gates, carries post-promotion verification, measurement commands, and stop rules, and does not deploy, promote, charge, send, print, post, mutate connected tools, or write files.
- `capital:post-promotion:smoke` passes and verifies the read-only post-promotion verifier composes production verification, live payment readiness, aggregate Stripe revenue, and first-revenue readiness so production-updated and first-profit evidence can be checked immediately after an approved promotion without deploys, rollbacks, payments, sends, webhook replays, connected-tool mutations, public posts, or file writes.
- `public:discovery:smoke` passes and verifies curated robots/sitemap output, stable canonical metadata, distinct 92B share metadata, private-route exclusions, and conditional physical-node copy.
- `memory:retrieval:smoke` passes and verifies AI context assembly filters unusable memory rows before prompt construction and that major semantic-memory prompt/read paths keep active-only filters.
- `memory:state-migration:smoke` passes and verifies the local memory consent state migration draft is non-destructive, adds explicit consent-state columns, and remains approval-gated.
- `memory:consent-actions:smoke` passes and verifies memory action writes remain legacy-safe by default and explicit-state-ready after the migration flag is enabled.
- `movement:private-surfaces:smoke` passes and verifies personal mirror, pod, memory, sovereignty passport, voice session-token, and creator-studio private calls keep explicit no-store behavior, with personal mirror client failures kept generic.
- `movement:api-boundary:smoke` passes and verifies private Movement API routes keep no-store private responses, auth-before-work ordering, provider-call boundaries, lazy Supabase admin access in Movement routes/helpers, generic Personal Mirror route/stream failures, generic memory API database failures, generic manager generation failures, and generic pod helper failures.
- `memory:privacy:smoke` also verifies the private memory overview exposes consent readiness without exposing secret values and that memory API and memory helper failures stay generic.
- `memory:privacy:smoke` verifies the memory page displays the latest consent action receipt.
- `external:boundary:smoke` passes.
- `external:effects:smoke` passes and verifies currently detected high-risk app routes are listed in the external effect route inventory before operator-driven tests.
- `external:lazy-clients:smoke` passes and verifies covered email/provider, daily email preference toggle, ensure-member onboarding, 92B pledge/proposal, Council waitlist confirmation, public lead-capture, salon/book-salon/message, live-session, daily practice state, private dashboard briefing, task routes, Salon Hub task routes/client callers, wallet/store routes, safe stats, guide leaderboard, guide routes, scan-history and scan scoring routes, world spaces/scan routes, member profile and onboarding self-updates, authenticated member discovery, public explorer profiles, public feed routes, Twiddle core routes/client callers, Great Books text/progress, match history/response, AI/media, core thinker, action/feed/practice generation, community/governance/live/matching, creator-helper, wallet/token disbursement, and memory routes/helpers lazily initialize Resend, Anthropic, and Supabase service clients at request time.
- `image-proxy:smoke` passes and verifies the Labyrinth proxy remains origin/path allowlisted, byte-bounded, no-redirect, raster-only, no-sniff, same-origin embed only, and wired into operator smoke.
- `operator:script-boundary:smoke` passes and verifies default package smoke scripts do not import or call provider, payment, email, database-client, child-process, HTTP, file-system mutation, secret env-file reads, process.env mutation, process module imports, CommonJS require escapes, dynamic import escapes, static re-export escapes, dynamic code execution, worker thread/browser worker execution, namespaced fetch, socket/DNS/http2 network modules, browser network constructors, or non-local network clients; `capital:routes:smoke` remains the only runtime fetch and is localhost-gated, child-process execution stays limited to the root and Prompt Atlas operator runners, smoke-script file-system mutation/env/network access stays bounded, and Prompt Atlas browser, production Supabase readiness, live Claude execution, Vercel env metadata, and live Stripe readiness smokes remain opt-in.
- `operator:manifest:smoke` passes and verifies package smoke scripts, simple local node smoke command shapes, operator smoke steps, the explicit non-smoke Prompt Atlas wrapper exception, Prompt Atlas root verify/list commands, smoke script files, operator-runner argument handling, operator smoke plan validation, and standing local verification docs remain aligned, with localhost route smoke still opt-in behind `--with-routes` and unknown operator smoke arguments failing before steps run.
- `operator:smoke -- --list` prints the default or route-inclusive operator plan without running child smoke scripts.
- `prompt-atlas:verify:list` prints the nested Prompt Atlas smoke manifest without running child smoke scripts.
- `auth:stale-supabase:smoke` passes and verifies stale refresh-token/JWT recovery stays centralized, clears browser Supabase auth storage, and treats Supabase's structured missing-session result as an expected signed-out state without a console warning.
- `external:lazy-clients:smoke` verifies match history/response routes keep public-shaped history output, bounded response writes, generic database failures, and request-time Supabase access.
- `external:lazy-clients:smoke` also verifies merch suggestion, status, generation, mockup, and publish routes are manager-gated, private/no-store, auth-before-provider/env, and called from the Salon overlay with signed no-store fetches instead of browser table writes.
- `external:lazy-clients:smoke` verifies Project Marketplace list/detail routes use explicit public field allowlists and sanitized payloads, while project pledge checkout validates project id, email, and UTM metadata and returns no-store JSON.
- `external:lazy-clients:smoke` verifies project collaboration scaffold is auth-derived, wallet-session verified, private/no-store, lazy-imported for service Supabase access, and audit-redacted.
- `external:lazy-clients:smoke` verifies project submission and project interest lead-capture routes are request-time Supabase backed, no-store/private, input-bounded, notification-HTML escaped, and unable to send Resend email unless `PROJECT_LEAD_EMAIL_NOTIFICATIONS_ENABLED=true`.
- `external:lazy-clients:smoke` verifies founding dinner, music therapy, salon proposal, and salon support lead routes are request-time Supabase backed, no-store/private, input-bounded, and direct-email-free, with the shared public lead notifier disabled unless `PUBLIC_LEAD_EMAIL_NOTIFICATIONS_ENABLED=true`.
- `external:lazy-clients:smoke` verifies Book Salon create, join, detail, and chat routes are request-time Supabase backed, no-store/private, auth-derived for writes, member-only for posting, sanitized for message reads, and called from Book Salon pages with Supabase access-token headers without client identity transport.
- `external:lazy-clients:smoke` verifies the public Guide leaderboard uses explicit fields, no-store JSON, display-only rank keys, bounded values, generic failures, and no raw member ids.
- `external:lazy-clients:smoke` verifies legacy Live Council listing, create/go-live, join, end, and summarize routes are request-time Supabase backed, no-store/private, auth-derived for joining, Movement-manager-gated for operator actions, and called from `/live` with Supabase access-token headers without client identity transport.
- `external:lazy-clients:smoke` also verifies world spaces/scan writes are auth-derived, frequency matching cannot read another member's matches, and scan upload auto-scoring uses the request origin rather than a production fallback.
- `world:permissions:smoke` passes and verifies pending/archived space access and access grants use the shared host helper, accepting member id and Supabase auth id ownership while rejecting unrelated host ids.
- `external:lazy-clients:smoke` verifies world frequency matching is signed-in, limit-bounded, explicit-selected, finite-input checked, no-EXP, token-bearing from the page, and free of raw member-id response fields.
- `external:lazy-clients:smoke` verifies world spaces list/create uses explicit public fields, bounded create input, minimal receipts, generic failures, and no broad select or raw space receipt.
- `external:lazy-clients:smoke` verifies world space detail uses explicit public space/scan/annotation fields, bounded host-only updates, checked delete cascades, generic failures, and no proof hash/file URL/raw row response.
- `external:lazy-clients:smoke` verifies world annotations are signed-in, bounded, same-space scan checked, explicit-selected, generic on failures, and minimal-receipt only.
- `external:lazy-clients:smoke` verifies world scan upload keeps bounded file/type/space handling, explicit insert return fields, generic failures, and no proof hash/raw scan row response.
- `external:lazy-clients:smoke` verifies world scan verification uses bounded input, explicit scan lookup fields, host-scoped updates, generic failures, and no broad scan select.
- `external:lazy-clients:smoke` verifies scan upload keeps bounded file/format/location handling, explicit insert return fields, same-origin scoring, generic failures, and no proof hash/storage/raw scan row response.
- `external:lazy-clients:smoke` verifies scan archive reads are signed-in, bounded, explicit-selected, public-shaped, generic on failures, and free of proof hashes or storage paths.
- `external:lazy-clients:smoke` verifies scan scoring uses bounded input, explicit scan lookup fields, generic failures, and no raw database/EXP leakage before request-time Supabase work.
- `external:lazy-clients:smoke` verifies `/api/exp/award` is lazy, private, self-scoped, reason-allowlisted, and called from the Great Books reader with auth headers.
- `external:lazy-clients:smoke` verifies `/api/great-books/progress` is lazy, private, auth-derived for progress reads/writes, free of client `memberId` fields, and called from Great Books pages with token-bearing no-store fetches.
- `external:lazy-clients:smoke` verifies Twiddle creation, edit/detail, reaction, and response routes are request-time Supabase backed, no-store/private, auth-derived for writes, free of client `memberId` fields, and are called from Twiddle client pages with Supabase access-token headers plus no-store private reads and without member-id transport.
- `external:lazy-clients:smoke` verifies artifact merch ordering is signed-in, owner-scoped, request-time Supabase backed, no-store/private, input-bounded, fulfillment-flag gated, and cannot reach Printful before ownership and `ARTIFACT_MERCH_ORDERING_ENABLED=true` gates pass.
- `external:lazy-clients:smoke` verifies artifact mint recording is signed-in, owner-scoped, request-time Supabase backed, no-store/private, input-bounded, mint-recording-flag gated, and cannot write mint state before auth and `ARTIFACT_NFT_MINT_RECORDING_ENABLED=true` gates pass.
- `external:lazy-clients:smoke` verifies `/api/thinker/extract-facts` is lazy, private, input-validated before provider calls, signed-in self-scoped or explicitly cron-secret scoped, and writes memory under the resolved authenticated member id.
- `external:lazy-clients:smoke` verifies `/api/thinker/memory` is lazy, private, input-validated before embedding writes, signed-in self-scoped, and writes embeddings under the authenticated member id.
- `external:lazy-clients:smoke` verifies `/api/practice/my-today`, `/api/practice/responses`, `/api/practice/others`, and `/api/practice/streak` return no-store private JSON, the response feed batches member-name enrichment, `/api/practice/respond` is lazy, private, input-validated before writes, signed-in self-scoped, free of client `memberId` fields, and writes practice responses/streaks under the authenticated member id, and `/api/practice/reflect` is signed-in owner-scoped before Supabase memory reads or Anthropic calls.
- `external:lazy-clients:smoke` verifies transaction listing and approval routes are signed-in, private/no-store, request-time Supabase backed, ordinary-member scoped, and use the authenticated approver for governance approvals.
- `external:lazy-clients:smoke` verifies community creation is signed-in, owner-derived from authenticated member id, private/no-store, request-time Supabase backed, launch-config bounded, free of client `memberId` fields, free of browser direct setup table writes, and called from the create-community page with auth headers.
- `external:lazy-clients:smoke` verifies public community detail reads use request-time Supabase admin access, no-store JSON, explicit public field allowlists, and no service-role `select('*')` payloads.
- `external:lazy-clients:smoke` verifies community governance role assignment is signed-in, private/no-store, request-time Supabase backed, `manage_roles` gated, and uses the authenticated actor for role changes.
- `external:lazy-clients:smoke` verifies community thinker management uses explicit public fields and requires signed-in `manage_thinkers` permission for bounded create/update writes.
- `external:lazy-clients:smoke` verifies community joining is signed-in, self-scoped, private/no-store, request-time Supabase backed, and uses the authenticated member for membership rows.
- `external:lazy-clients:smoke` verifies community matches are signed-in, self-scoped for reads and responses, private/no-store, request-time Supabase backed, and ownership-checked before accept/decline updates.
- `external:lazy-clients:smoke` verifies community questionnaire submissions are signed-in, self-scoped for match-profile writes and matching, private/no-store, request-time Supabase backed, free of client `memberId` fields, and answers-shape validated before auth/database work.
- `external:lazy-clients:smoke` verifies community store product listing/creation uses explicit product fields and bounded inputs, while balance and purchase routes are signed-in, self-scoped, private/no-store, request-time Supabase backed, free of client `memberId` fields and raw database error leakage, return sanitized purchase receipts, and are called from the community page with auth headers.
- `external:lazy-clients:smoke` verifies member wallet attachment is signed-in, self-scoped, duplicate-wallet guarded, private/no-store, and that membership NFT minting remains dynamic-imported behind `MEMBERSHIP_NFT_AUTO_MINT_ENABLED`.
- `external:lazy-clients:smoke` verifies community product creation is signed-in, owner-only by authenticated member id, private/no-store, request-time Supabase backed, free of client `memberId` fields, and called from the community page with auth headers.
- `env:readiness:smoke` passes and verifies placeholders, no real-looking secret examples, outbound provider keys, cron and signer secrets, fulfillment/mint flags, Stripe merch webhook secrets, Base contract addresses, Movement on-chain flags, Solana EXP mint config, and approval-matrix coverage.
- `ai:status:smoke` passes and verifies AI Status reports readiness without secret values or provider calls.
- `operator:smoke` passes and runs the script-boundary, root manifest, Prompt Atlas manifest, non-network capital, memory, voice, AI, creator, pod-export, and external-action boundary guards together, with each root step bounded by `OPERATOR_SMOKE_STEP_TIMEOUT_MS` or the 120-second default local timeout and capped at 10 minutes. Prompt Atlas child scripts use a 30-second default `PROMPT_ATLAS_SMOKE_STEP_TIMEOUT_MS`, capped at 120 seconds. The script boundary scans default root and Prompt Atlas smoke manifests, with child-process execution limited to their explicit operator runners; Prompt Atlas opt-ins stay explicit through `npm run operator:smoke -- --with-ui`, `--with-db-readiness`, `--with-live-execution`, `--with-vercel-env`, and `--with-stripe-live` inside `prompts-mvp`.
- Prompt Atlas `billing:intent:smoke` and `billing:duplicate:smoke` pass and verify landing-header plan discovery, proactive zero-run routing, former-subscriber restart eligibility, recovery-state management, email/Google/SIWE upgrade-intent continuity, explicit checkout consent, marker cleanup, and same-origin auth callback destinations.
- Prompt Atlas `billing:portal:smoke` verifies derived lifecycle states, deterministic date copy, private/no-store session transport, and explicit-click-only Stripe billing management without exposing raw Stripe status to the member type.
- Prompt Atlas `operator:metrics:smoke` verifies aggregate-only service-role SQL, fail-closed `SOE_ADMIN_EMAILS` authorization, private/no-store and noindex responses, explicit not-profit labeling, and the absence of polling, browser storage, Stripe calls, or analytics events.
- `capital:routes:smoke` passes when the local dev server is running on `localhost:3000`.
- Local/dev preflight passes route, Supabase, admin-boundary, copy-risk, and file checks, but fails local env readiness until local/dev has `NEXT_PUBLIC_SITE_URL` or `SITE_URL`, `STRIPE_SECRET_KEY`, and `STRIPE_PRICE_ORACLE`.
- Production `STRIPE_PRICE_ORACLE` is configured to the verified active one-time `$499` Oracle price.
- Production-env preflight originally failed closed when no enabled live Stripe endpoint targeted `/api/stripe/webhook` with the membership and capital event contract. Chris approved the exact webhook action on 2026-06-19, and endpoint `we_1TjzTi5r4D5OocVf7AH7rnJk` is now enabled in live mode for `checkout.session.completed`, `customer.subscription.updated`, and `customer.subscription.deleted`.
- A fresh Vercel production-env preflight at `2026-06-19T10:17:06.003Z` reported `50 pass, 3 warn, 0 fail`. Supabase capital tables, all four reviewed Stripe membership prices, and the live membership/capital webhook endpoint were reachable and active.
- Production-env preflight warns that the available Stripe key is live-mode. Do not create local checkout sessions or replay webhooks with it.
- Root and `prompts-mvp` lint pass with zero errors or warnings.
- Root and `prompts-mvp` `npx tsc --noEmit` checks pass independently.
- Root Next `16.2.9` and `prompts-mvp` production builds pass; the root build retains the existing edge-runtime static-generation warning.
- Root and `prompts-mvp` production dependency audits pass with zero vulnerabilities; the root full audit also passes with zero vulnerabilities.
- Browser checks on the upgraded root server confirm all four brand fonts load locally, no remote stylesheet is requested, discovery has no desktop or 390px horizontal overflow, and a local music session starts and stops without console warnings or errors.
- Prompt Atlas browser checks confirm the landing-header Pro entry works at desktop and 390×844 widths, opens the full `$12/month`, 200-run terms, keeps the mobile document at 390px with a 358px dialog, and produces no relevant console warnings or errors.

## Stripe State

Do not run checkout or webhook replay yet.

Confirmed read-only production Stripe state on 2026-06-19:

| Item | State | Note |
| --- | --- | --- |
| `STRIPE_PRICE_ORACLE` | Configured | Active one-time `$499` Oracle price `price_1TLoRy5r4D5OocVf15xtFSyS`. |
| `/api/webhooks/stripe` | Enabled | Merch-only endpoint; receives `checkout.session.completed`. |
| `/api/stripe/webhook` | Enabled | Live endpoint `we_1TjzTi5r4D5OocVf7AH7rnJk`; exact approved event set only; signing secret stored as `STRIPE_WEBHOOK_SECRET` in Vercel production without printing the secret. |

Before payment-path tests:

- Use test-mode Stripe credentials.
- Use matching test-mode price ids for Seeker, Scholar, Philosopher, and Oracle.
- Replay only test-mode webhook events.
- Keep `CAPITAL_WEBHOOK_EMAIL_NOTIFICATIONS_ENABLED=false` during local/test replay unless Chris explicitly approves a production notification test.
- Verify duplicate webhook events do not double-count pledge rows.

## Revenue Baseline

Authenticated aggregate live Stripe read on 2026-06-19 at `10:23 UTC`:

| Window / measure | Result |
| --- | --- |
| Lifetime gross payment volume | `$38.00` |
| Lifetime refunds | `$38.00` |
| Lifetime Stripe fees | `$1.70` |
| Lifetime Stripe cash contribution | `-$1.70` |
| Last 30 days gross payment volume | `$0.00` |
| Last 7 days gross payment volume | `$0.00` |
| Active recurring revenue | `$0.00` estimated MRR |
| Subscription state | `1 canceled`, `0 active` |
| Paid Checkout sessions in the last 30 days | `0` |
| Paid 92B tiers in the last 30 days | `0` across all reviewed tiers |
| Stripe available balance | `-$0.98` |
| Stripe pending balance | `$0.00` |

This proves no current Stripe revenue run rate and does not prove accounting
profit. Payroll, hosting, taxes, fulfillment, and other operating expenses are
outside Stripe. Repeat the privacy-safe aggregate read with:

```bash
npx vercel env run --environment=production -- npm run capital:revenue:snapshot -- --stripe-read
```

Repeat the live payment readiness audit without exposing secrets with:

```bash
npx vercel env run --environment=production -- npm run capital:live-payment:readiness -- --stripe-read
```

## Vercel Production State

Confirmed deployment state on 2026-06-19:

| Item | State | Note |
| --- | --- | --- |
| Vercel CLI session | Authenticated | `christaylor17`; the timed-out browser device page is not needed for current CLI access. |
| Production | Ready and verified | `dpl_2hkoxV6BewU9RCWtEhWUD5XUuTJR`, `https://society-of-explorers-kaxpq0qxn-chris-projects-03dec906.vercel.app`, created 2026-06-19, currently serves `www.societyofexplorers.com` and `societyofexplorers.com`; `capital:production:verify` reports `31` pass and `0` fail. |
| Previous production rollback target | Ready | `dpl_A3UZ6YV9EE6vmdfFWvDDMnektEYC`, `https://society-of-explorers-k6lje24qo-chris-projects-03dec906.vercel.app`; use only if the verified production release has a serious auth, copy, payment, or routing regression. |
| Prior preview | Superseded; do not promote | `dpl_5NrjR1EA5Zszkgo94i13FdzTv6se` predates the corrected `/92b` claims, `/robots.txt`, `/sitemap.xml`, canonical metadata, revenue snapshot, server-authoritative 92B pricing, and tracked-payment-only funding flow. |
| Previous release candidate | Superseded by hotfix preview | `dpl_E66Ut2ebgx9h1WUbdxVaJMkLshtj` was promoted to production as `dpl_A3UZ6YV9EE6vmdfFWvDDMnektEYC` but missed the production `/api/92b/progress` `X-Robots-Tag` header. |
| Hotfix preview source | Promoted | `dpl_GAdFZyzEinPbfqXRrrkUPaqRryQC`, `https://society-of-explorers-jzd7yvty1-chris-projects-03dec906.vercel.app`; promoted after exact approval, creating production `dpl_2hkoxV6BewU9RCWtEhWUD5XUuTJR`. |
| Live `/92b/fund` | Current copy | Production verifier passes the funding-page headline, CTA, no-direct-wallet, and stale-copy checks. |
| Superseded preview `/92b/fund` | New funding copy but incomplete release | `Help fund the first physical node`; do not promote because `/92b` still contains false secured-location and active-buildout claims. |

The approved promotion command was `vercel promote dpl_GAdFZyzEinPbfqXRrrkUPaqRryQC --yes`.
It created `dpl_2hkoxV6BewU9RCWtEhWUD5XUuTJR`. Do not run another production
promotion without a new exact approval tied to a newly verified deployment id.

Local rendered QA on 2026-06-19 covered desktop `1280x720` and mobile
`390x844`. The funding hero exposes `PLEDGE FROM $25`; its anchor lands on the
Supporter tier with the fixed navigation offset; the pledge dialog opens with
focus and modal semantics; and a local live-key checkout attempt is blocked
before Stripe while showing a visible retryable error. Browser console
error/warning checks were clean.

Authenticated deployed Preview QA on 2026-06-19 used Vercel-authenticated
requests because Preview Deployment Protection requires Vercel auth in a normal
browser. Re-run the protected-preview gate with:

```bash
npm run capital:deployment:verify -- --vercel-deployment=https://society-of-explorers-jzd7yvty1-chris-projects-03dec906.vercel.app
```

That command verifies `/92b`, `/92b/fund`, `/robots.txt`, `/sitemap.xml`,
`/api/92b/progress`, and an intentionally invalid checkout request that must
fail private/no-store before Stripe session creation. The phrase
`not a secured location or active buildout` is intentionally negative copy, not
a positive claim.

`npm run capital:production:verify` is the production gate and now passes
against `https://www.societyofexplorers.com`.

Preview deployment protection blocked the in-app browser because the browser is
not logged into Vercel. The in-app tab is on Vercel login for the fresh preview;
do not treat that as app failure.

Production promotion is complete. The next exact approvals are first-revenue
actions from `npm run capital:paid-traffic:packet`, not another deploy.

Rollback target if auth, copy, or payment fulfillment is wrong:

```bash
npx vercel rollback dpl_A3UZ6YV9EE6vmdfFWvDDMnektEYC
```

## Database State

See `docs/92b-migration-verification.md`.

Recorded there:

- Capital migrations were applied to Supabase project `woqvlkeluxkxplpgzdgv` on May 26, 2026.
- `pledge_events`, `capital_pipeline_leads`, and `capital_pipeline_events` exist.
- Service-role policies exist for those private tables.
- A rollback-only SQL smoke test left no synthetic rows behind.

Do not apply new production migrations without explicit approval.

## Privacy Threat Model

See `docs/soe-privacy-threat-model.md`.

Memory consent plan: `docs/soe-memory-consent-plan.md`.

Current highest-priority privacy controls:

- Keep capital admin responses aggregate/redacted by default.
- Keep Stripe metadata minimal and allowlisted.
- Keep wallet identity separate from public patron recognition.
- Require explicit correction/retraction/do-not-use states for memory.
- Make voice transcript and memory retention opt-in.
- Treat pod export as a high-risk bulk data operation.

## Auth Reliability State

- `lib/auth/getSession.ts` bounds Supabase auth lookups to `5_000ms`.
- Signed-out `AuthSessionMissingError` results now resolve quietly while stale-token and unexpected auth failures retain their recovery and diagnostic paths.
- Stale Supabase refresh-token storage is cleared when invalid-refresh-token errors appear.
- The Launch Room exits `LOADING...` on auth/API failure and fails closed with an admin sign-in message.
- `scripts/capital-preflight-smoke.mjs` now guards the auth timeout and Launch Room loading behavior.

## Current Blockers

- Continuation check on 2026-06-19 at 12:39 PM EDT: `npm run capital:production:verify -- --json` reports production `31` pass, `0` fail for `https://www.societyofexplorers.com`.
- Both `www.societyofexplorers.com` and `societyofexplorers.com` inspect to production deployment `dpl_2hkoxV6BewU9RCWtEhWUD5XUuTJR`.
- Direct production `curl` to `/api/92b/progress` returns `x-robots-tag: noindex, nofollow, noarchive` plus no-store and surrogate no-store headers.
- Vercel error-log scan for deployment `dpl_2hkoxV6BewU9RCWtEhWUD5XUuTJR` with `--since 1h --level error --no-follow` found no logs.
- Live payment readiness remains intact: endpoint `we_1TjzTi5r4D5OocVf7AH7rnJk` is enabled in live mode for exactly `checkout.session.completed`, `customer.subscription.deleted`, and `customer.subscription.updated`, with `STRIPE_WEBHOOK_SECRET` present and shaped as `whsec_*`.
- Approved live checkout validation on 2026-06-19 at 12:49 PM EDT created exactly one Stripe-hosted live Checkout Session for the 92B `SUPPORTER` tier from `https://www.societyofexplorers.com/92b/fund`. Redacted session id: `cs_live_a18VUNE...NJ4DUh`; customer email: `validation+92b-supporter-20260619@societyofexplorers.com`; mode: `payment`; status: `open`; payment status: `unpaid`; amount: `2500 usd`; metadata includes `type=92b_pledge`, `pledge_type=92b`, `campaign_slug=92b-founding-node`, `tier_id=supporter`, `amount_cents=2500`, and `utm_campaign=92b-live-checkout`. The full Checkout URL was stored only in `/tmp/soe-92b-supporter-checkout-url.txt` for this local session and was not committed.
- The latest live Stripe revenue snapshot after that session still shows `0` paid Checkout sessions in the last 30 days, all-time Stripe cash contribution of `-$1.70`, and available Stripe balance of `-$0.98`; the business is not yet contribution-positive or profitable. `/api/92b/progress` still reports `$0` raised and `0` backers because the session is unpaid.
- No payment completion, webhook replay, outreach send, landlord contact, connected-tool mutation, public post, print, or physical placement occurred during this continuation check.
- `npm run capital:profit:gate -- --vercel-read --stripe-read --deployment=https://society-of-explorers-jzd7yvty1-chris-projects-03dec906.vercel.app` joins the live production verifier, protected-preview verifier, live payment readiness, and aggregate Stripe revenue snapshot into one read-only status receipt.
- `npm run capital:first-revenue:readiness -- --vercel-read --stripe-read --deployment=https://society-of-explorers-jzd7yvty1-chris-projects-03dec906.vercel.app` composes the profit gate with the local paid-traffic packet so post-promotion verification, next exact first-conversion approval, measurement commands, and stop rules are visible without taking external action.
- `npm run capital:post-promotion:verify -- --vercel-read --stripe-read --deployment=https://society-of-explorers-jzd7yvty1-chris-projects-03dec906.vercel.app` is the single read-only verification loop to run after an approved promotion. It reports production updated/not-updated, live payment readiness, aggregate Stripe revenue, and first-revenue next gates.
- `npm run capital:go-live:packet` remains as a pre-promotion packet contract for historical/approval-boundary checks. It is not the current action path now that production is verified.
- `npm run capital:paid-traffic:packet` now prints first paid-action approval options for live Checkout validation, one-person First Supporter outreach, or window QR activation after verified production promotion. It includes the minimum 92B Supporter live-checkout validation approval, the one warm Supporter approval text, approval-ready first-conversion action shells, warm outreach draft copy, expected tier metadata, and measurement commands without creating sessions, sending, printing, posting, or claiming profit.
- Next exact approval options are:
  - Do not create another 92B Supporter live-checkout validation session unless Chris explicitly asks for a replacement; the current approved session is open/unpaid.
  - `Approve sending this outreach batch: [one warm recipient], [channel], First Supporter Pledge draft, [send window].`
  - `Approve sending this outreach batch: [one architect-patron candidate], [channel], [92b-architect-call-v1 draft below], [send window].`
- Local/dev env does not currently have all payment, provider, fulfillment, signer, or blockchain readiness variables, but `.env.example` and `docs/soe-env-readiness-template.md` now document the required local/test placeholders and disabled-by-default gates.
- Stripe checkout and webhook replay need test-mode credentials.
- Checkout safety now blocks local live-mode checkout session creation in code; it does not authorize live sessions or webhook replay.
- Capital webhook notification email remains disabled by default; enabling `CAPITAL_WEBHOOK_EMAIL_NOTIFICATIONS_ENABLED=true` is a production external-effect decision and still does not authorize webhook replay by itself.
- Production admin allowlists should be configured before real operator use:
  - `SOE_ADMIN_EMAILS`
  - `SOE_ADMIN_WALLETS` or `SOE_ADMIN_WALLET_ADDRESSES`
- External approvals are still required for deployment, payment testing, outreach, landlord contact, window placement, and public launch.
- Broad permission to control the computer is not enough for deploys, sends, live payments, production mutations, or physical placement; use the approval matrix for exact go-aheads.

## Next Safe Local Moves

1. Use `/capital/weekly-review` after each seven-day sprint to decide whether the next local move is page refinement, a request for outreach approval, or physical-node prep materials.
2. Keep capital admin receipts and response-shape checks current as new command-center widgets are added.
3. Prepare an approved-but-unsent founder outreach batch from existing local drafts only after Chris names or approves recipients.

## Start Commands

```bash
npm run dev -- -p 3000
npm run operator:smoke -- --list
npm run prompt-atlas:verify:list
npm run operator:script-boundary:smoke
npm run operator:manifest:smoke
npm run prompt-atlas:verify
npm run capital:preflight:smoke
npm run capital:metadata:smoke
npm run capital:checkout-safety:smoke
npm run capital:funding-conversion:smoke
npm run membership:billing:smoke
npm run capital:webhook-safety:smoke
npm run capital:webhook-dedupe:smoke
npm run capital:privacy:smoke
npm run capital:private-pages:smoke
npm run private:route-helper:smoke
npm run private:route-proxy:smoke
npm run capital:admin-shape:smoke
npm run capital:redaction:smoke
npm run capital:approvals:smoke
npm run capital:patron-brief:smoke
npm run capital:window-kit:smoke
npm run capital:scenarios:smoke
npm run capital:outreach-lab:smoke
npm run capital:weekly-review:smoke
npm run capital:revenue:smoke
npm run capital:live-payment:smoke
npm run capital:profit:smoke
npm run capital:first-revenue:smoke
npm run capital:post-promotion:smoke
npm run capital:go-live:readiness:smoke
npm run capital:go-live:smoke
npm run capital:paid-traffic:smoke
npm run capital:deployment:verify -- --vercel-deployment=https://society-of-explorers-jzd7yvty1-chris-projects-03dec906.vercel.app
npm run capital:production:verify -- --soft
npx vercel env run --environment=production -- npm run capital:live-payment:readiness -- --stripe-read
npm run capital:profit:gate -- --vercel-read --stripe-read --deployment=https://society-of-explorers-jzd7yvty1-chris-projects-03dec906.vercel.app
npm run capital:first-revenue:readiness -- --vercel-read --stripe-read --deployment=https://society-of-explorers-jzd7yvty1-chris-projects-03dec906.vercel.app
npm run capital:post-promotion:verify -- --vercel-read --stripe-read --deployment=https://society-of-explorers-jzd7yvty1-chris-projects-03dec906.vercel.app
npm run capital:paid-traffic:packet
npm run public:discovery:smoke
npm run auth:stale-supabase:smoke
npm run auth:wallet-session-secret:smoke
npm run member:wallet-route:smoke
npm run memory:privacy:smoke
npm run memory:retrieval:smoke
npm run memory:state-migration:smoke
npm run memory:consent-actions:smoke
npm run movement:private-surfaces:smoke
npm run movement:api-boundary:smoke
npm run voice:consent:smoke
npm run ai:status:smoke
npm run creator:ops:smoke
npm run pod:export:smoke
npm run pod:wallet-seal:smoke
npm run sovereignty:passport:smoke
npm run world:permissions:smoke
npm run twiddle:cron-auth:smoke
npm run external:boundary:smoke
npm run external:effects:smoke
npm run external:lazy-clients:smoke
npm run image-proxy:smoke
npm run env:readiness:smoke
npm run operator:smoke
npm run capital:routes:smoke
```

Use `http://localhost:3000/capital/launch-room` for the private launch cockpit once local dev is running.
