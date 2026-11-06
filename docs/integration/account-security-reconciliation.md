# Account security reconciliation

Local implementation in canonical branch `codex/soe-first-release`; no production, account or provider calls. Source provenance is in [source-inventory.md](source-inventory.md). This is not production clearance.

## Resulting behavior

- Only the verified Supabase subject can provision its own member. The endpoint no longer lists auth accounts, matches display-name/email text, reassigns another member or changes email preferences. Existing unsubscribe state remains untouched. Duplicate current-subject rows fail closed; a unique-insert conflict can recover only the same verified subject.
- New private `GET /api/auth/member` returns a bounded whitelisted owner profile plus `auth: { provider, subject }` from actual verified authority. Browser wallet hints no longer select rows through anonymous members-table reads.
- Explicit bearer requests verify that exact token. An active browser intent also binds the token to the selected provider and subject. Cookie requests require the current selection receipt and proof from the chosen provider. A wallet uses the signed wallet session, and a Supabase cookie uses verified provider identity.
- SIWE success selects wallet in the same response as the signed cookie. Email/password success confirms its exact verified subject through same-origin `POST /api/auth/provider`; OAuth success selects Supabase in the code-exchange response and redirects through `/auth/complete` to notify other tabs, then the validated original destination.
- Browser Circle headers omit bearer for a positively verified selected wallet or the private endpoint's explicit signed-out 401 state. Supabase bearer acquisition verifies exact token/selected subject and repeats the cookie-only canonical check before returning; unknown or changed proof throws and does not fall back to cookies.
- Provider intent and confirmed changes retire private views through `notifyAuthProviderChanged` / `subscribeAuthProviderChanges`: same-tab `soe:auth-provider-changed`, storage key `soe.auth.provider.changed`, BroadcastChannel `soe:auth-provider` message `changed`. Notifications carry a random epoch only, never IDs, profile data or credentials. Root/platform adapters consume these events.
- Login prevents competing provider actions and fences a delayed initial-session redirect once an explicit choice starts. Existing accessible labels, live status and safe return-path context remain.
- Wallet v3 adds an independently revocable credential ID to the signed expiry. The resolver checks a keyed fingerprint against a service-only RPC before member lookup. Earlier v1 and v2 credentials keep their existing verification limits. SIWE returns only member ID and selects the required database fields with ordered bounded duplicates.
- Original server-only boundaries, attachment filename bound and selected private response headers are restored. Private HTML permits same-origin voice/camera/geolocation; JSON/attachments deny capabilities. No blanket page policy disables intended media/Quest controls.
- Dashboard and desktop/mobile account navigation expose **Sign out of this browser**. An explicit click immediately retires the old private view across tabs, fences late dashboard replies and clears only owned wallet/SDK storage keys. Unrelated drafts and cookies survive.
- Same-origin JSON `POST /api/auth/logout` accepts exactly `{ scope: 'browser', requestId: UUID }`. It revokes a valid wallet credential before clearing it, clears known nonce and Supabase auth cookies and writes an HttpOnly `signed_out` marker. An unavailable revocation yields 503 and keeps the wallet cookie for retry. The browser confirms a successful receipt through a fresh cookie-only, no-store member readback with the signed-out marker and no pending revocation. [Verification](wallet-session-revocation-verification.json)
- The marker rejects retained cookies and explicit bearer tokens before SDK verification, blocks automatic ensure-member, and protects dashboard routing. SDK refresh cannot remove the marker. Only a subsequent deliberate verified provider sign-in replaces it. SDK `signOut({ scope: 'local' })` runs in the user's browser after confirmed readback; failed initialization/cleanup is reported separately. Unknown results retain the same in-memory request ID for manual retry. Repeated cookie clearing is safe; no remote all-device revocation or exactly-once operation ledger is claimed.

## Matching, projects and Pod sync

Matching, project scaffolding, project invitations and Pod sync now use the shared member resolver. A wallet POST needs same-origin evidence, a matching browser selection and a valid signed wallet cookie. The existing bearer path verifies the exact token, including for clients that send it without browser cookies. A failed bearer ends the attempt. A signed-out browser is refused before any provider or member lookup.

Each route checks origin before authentication and reads a four-field member projection. The local test reproduced a successful match response after the supplied bearer was rejected. Project scaffolding and Pod sync proceeded to payload validation using the retained wallet. The revised routes refused all three requests before reading their bodies. The invitation route also uses the shared guard. Its historical input validation still rejects ordinary UUIDs, so this check covers invitation authorization and refusals. [Verification](edge-member-authority-verification.json) · [Supabase exact-token verification](https://supabase.com/docs/reference/javascript/auth-getuser) · [Fetch Metadata](https://www.w3.org/TR/fetch-metadata/)

## Files and review boundaries

Auth source: `lib/auth/{browserSignOut,getSession,loginForm,memberDto,redirectPath,request,provider,providerSelection,siweNonce,walletMember,walletSession}.ts`; `lib/getAuthenticatedMember.ts`; `lib/supabase/{admin,server}.ts`; `lib/http/routeError.ts`; `lib/circles/client.ts`; `proxy.ts`; auth ensure-member/member/provider/logout/SIWE routes; OAuth callback/completion; login page; `components/AccountSignOut.tsx` and minimal dashboard/PublicNav integration. Account authority/native files remain separate and untouched by this work. Legacy wallet-hint clearing exports remain compatibility helpers; they cannot clear httpOnly cookies and are explicitly not logout.

Shared return-path validation combines original encoded slash/backslash rejection with candidate control-character rejection. No main file was copied wholesale over newer account logic.

React review: per-component transient refs own in-flight intent; initial effect has cleanup; completion effect is idempotent and uses a primitive destination; inputs retain labels/status/keyboard semantics; no account state lives in a module global or browser durable storage. Strict-mode duplicate retirement is harmless. Native/headset and actual provider behavior remain separate acceptance gates.

## Verification

Final focused command (from `verification/web`):

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/christaylor node --require ./scripts/deny-build-network.cjs --test tests/account-security.test.mjs tests/discussion-cohort-http.test.mjs tests/moderation-http.test.mjs
```

79/79 cases pass, including auth-specific fixtures, actual HTTP handlers, preserved origin assertions, account collisions, email consent, selected-provider precedence, exact-token checks, OAuth cookie forwarding and retirement notifications. The guest composition also invokes actual browser header helpers, Circle handlers and SQL: public metadata remains available, anonymous writes return 401 without member creation, and retained SDK credentials are not consulted on explicit signed-out 401. Log: `verification/web/evidence/account-security-tests.log`. The two legacy bearer/origin fixtures now explicitly verify only their exact fictional tokens as the intended actor; no assertion was weakened and no real token was introduced.

Browser logout's 10/10 additional actual-handler/helper cases pass (`account-signout-tests.log`): cookie whitelist, CSRF, invalid/oversized bodies, retained bearer/cookie refusal, provisioning refusal, proxy, immediate retirement, preserved drafts, keyed retry, blocked cookie persistence and SDK cleanup failure. `account-final-tests.log` records the final combined 89-case rerun including logout.

Actual cached Chromium verification runs the unchanged dashboard/PublicNav/AccountSignOut React components and browser helper, with actual logout/readback handlers behind fully intercepted HTTPS routes. Six stories pass: immediate keyboard-triggered privacy retirement while POST is held; second-tab retirement before receipt; lost receipt with same-ID retry and separately disclosed SDK cleanup failure; blocked cookie writes refusing success; desktop navigation; 320px mobile menu with a 44px target. Actual Chromium cookie storage confirms marker httpOnly persistence, owned-cookie deletion and unrelated-cookie survival. SDK, initial private data and Next navigation are explicit local doubles. No unexpected request, provider call or page error occurred. Evidence: `account-signout-browser.json`, `account-signout-browser.log`, `account-signout-mobile.png`; bundle provenance hash is in JSON. This proves local composition, not real-provider or production-browser acceptance.

```sh
# From canonical root: installed Bun only, no install or external transport.
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/christaylor verification/web/tooling/node_modules/@oven/bun-darwin-aarch64/bin/bun --preload ./verification/web/scripts/deny-build-network.cjs verification/web/scripts/bundle-account-signout-test.mjs
# From verification/web: cached Chromium, all HTTPS routes intercepted locally.
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/christaylor node --require ./scripts/deny-build-network.cjs tests/browser-account-signout.mjs
```

Full canonical TypeScript and scoped ESLint pass with zero warnings; logs `account-security-typescript.log`, `account-security-eslint.log`. Existing S1/S1c/S3/S10/G10 cases passed the initial reconciliation; root owns the full final combined rerun/build/browser acceptance. No historical evidence is substituted for that final verification.

All tests start in clean environments under `verification/web/scripts/deny-build-network.cjs`. Server-only shims exist only in the test loader/FakeDb mock registration, never production source. Provider transport/identities are synthetic. No real account/provider/device claim follows from these checks.

## Remaining gates

- Actual provider sign-in, deployed cookie/domain/path behavior (including wallet mobile browser), expired/revoked sessions and real-provider cleanup require production/device acceptance. Local browser sign-out covers known root-path cookies on this host. It does not clear another domain or unknown historical path, revoke independently held JWTs, sign out other devices or recall already-sent operations. A previously sent deliberate sign-in response can still arrive later; no distributed sign-in/sign-out serialization is claimed. Choice notifications retire private views without revealing an account identity.
- Live follow-up on 2026-11-04 confirms nullable UUID subject and UUID primary key, but **no Supabase-subject unique index**. A separately approved bounded aggregate found zero duplicate non-null groups at that snapshot only. Raw member grants/public-read policy and private-core RLS findings remain a production HOLD; see `current-service-readiness.md`. Local preflight/draft and fixtures prove proposed semantics, not deployed enforcement. Separately approved repair/application remains mandatory.
- Explicit linking/merging existing wallet and Supabase accounts is intentionally not provided by sign-in. A future linking operation requires proofs of both identities and a reviewed policy, never display-name/email equality.
- Unknown provisioning outcomes may commit; no exactly-once claim is made without a verified unique subject constraint. Provider waits and distributed session revocation/load acceptance are not established by local mocks.
- The account-authority folder remains a security model, not an implemented native authority or released app.

## Reviewed local identity-uniqueness draft

`docs/sql/member-identity-preflight.sql` runs in a read-only transaction and emits only a success label. `member-identity-unique.sql` is an unapplied owner-executed draft; `member-identity-rollback.sql` removes only its semantically unchanged marked index and refuses any constraint-backed index. These are review documents, not an automatic migration or permission to execute on production.

The draft checks a regular members table, UUID primary key, nullable UUID Supabase subject, unfiltered owner access, duplicate absence, standard UUID BTree semantics and NULL compatibility. Existing equivalent full/nonnull-partial unique indexes and constraints are retained under their original names/comments. It rejects unrelated same-name or expression indexes instead of blindly using IF NOT EXISTS. Existing NULLS NOT DISTINCT subject constraints require review because they forbid multiple wallet-only rows. No row, grant, policy or installed function is added or changed. No account identifier appears in preflight output or deliberate error messages.

Creation uses an explicit table write-blocking lock with a five-second acquisition deadline and sixty-second statement deadline. This is not a zero-downtime or concurrent-index-build promise; actual table size, workload, ownership, restore, current RLS and approval must be reviewed before any application. The later read-only live catalog audit verifies selected identity types/indexes/policies/grants, not complete production acceptance; its separate aggregate returns no account values. No draft was applied live.

Targeted actual SQL/PGlite verification: 12/12 pass (`verification/web/evidence/account-identity-db-tests.log`). Cases cover multiple NULL wallet members, duplicate rejection without account repair/output, schema assumptions, repeated apply/rollback, pre-existing constraint/index preservation, name/expression/partial collisions, constraint-backed rollback refusal, NULLS NOT DISTINCT, browser/service denial, and unchanged rows/RLS/policies/grants/function ACLs. This is one in-memory PostgreSQL backend, not real multi-connection lock scheduling or production acceptance.

```sh
# From verification/web; disposable in-memory PostgreSQL only.
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/christaylor node --require ./scripts/deny-build-network.cjs --test tests/account-identity-db.test.mjs
```
