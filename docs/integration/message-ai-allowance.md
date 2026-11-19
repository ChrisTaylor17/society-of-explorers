# Shared message-AI request allowance

Local implementation; production remains on hold. No allowance was enabled on a live database, no provider request was made, and no deployment or spending occurred. This milestone adds a shared **request ceiling**, not a dollar spending cap or a claim about Anthropic billing.

## Behavior

The existing author-consent and human-review flow is unchanged. Before requesting AI observations, the server must obtain a newly committed database debit. A cold start or another app instance cannot reset the allowance. Its global and per-reviewer limits count all stored attempts for the lifetime of the ledger, including previous operating windows.

The new singleton starts disabled, with both limits zero and no operating window. Only the database owner can configure its enabled state, finite start/end times and limits. A changed window does not reset counts. Increasing a limit or activating a window requires separate owner approval; the application has no configuration endpoint. The existing feature flag and provider credential are also still required.

Every successful reservation consumes one request. Errors, cancellation, expired send authority, rejected output and lost replies do not refund it. The ledger does not claim that every reserved request reached the provider or was billed. There is no automatic retry, reset, refund, settlement or cleanup. A duplicate attempt ID is refused even when all other fields match. A lost reservation reply may leave a debit but cannot authorize a provider send.

If the allowance is unavailable or exhausted, the reviewer can continue human review. AI does not select a decision, supply an author explanation or change visibility.

## Database boundary

`docs/sql/circle-message-ai-allowance.sql` is a separate, unapplied additive candidate after `circle-message-ai-consent.sql`. It creates two private RLS tables and one service-only invoker RPC. It refuses object collisions and unsafe prerequisite/role authority, removes inherited default grants on only its own new objects, and leaves existing consent, case history, reports and reviewer grants unchanged.

The service can select the configuration and update only a constrained, always-false lock marker so that `SELECT FOR UPDATE` is permitted. It cannot change limits, enable the feature, delete the singleton, or update/delete/truncate attempts. Attempts contain server actor/case IDs, source hash/revisions, policy and timing; no message text, report notes, advice, provider key or token usage. The database owner remains trusted and can alter owned data; this is not protection against a malicious owner.

The RPC checks the current reviewer assignment, conflicts, withdrawal, complete-case requirement and author permission using the existing snapshot function. It binds the requested revision, content hash, consent revision and policy. A single locked configuration row serializes allowance checks across callers. Counters are derived from immutable attempts, not an in-process cache. READ COMMITTED is required so count queries after acquiring the lock use fresh committed snapshots; other isolation modes fail closed. No database transaction is held over provider I/O.

The remaining send lifetime is at most eight seconds and is restricted by the configured window and reviewer assignment expiry. The application anchors it before starting the reservation RPC, so network/queue time consumes that lifetime. It accepts only the exact eight-field response with matching nonce and case/consent bindings. After SDK preparation, the provider adapter requires a fresh case and consent check for the original reviewer. It checks the reservation deadline and cancellation again after that read, immediately before its sole fetch. A revoked, stale or unavailable snapshot stops the send and retains the debit. The route retains its twelve-second total deadline and final identity/consent/case checks. An already transmitted request cannot be recalled by revocation or expiry.

## Verification and limits

The focused route/provider suites execute the real application modules; provider tests use the installed Anthropic SDK with an intercepted synthetic transport. Actual route-to-SQL composition uses thirteen real migration files over the tracked sanitized catalog, with explicit synthetic identity, roles, defaults and owner activation. Independent route module instances share one database to verify that app-instance resets do not reset counts. Lost reservation replies and failed or revoked advice retain their debits. A local regression revokes consent after the reservation commits while its reply is held. The former route reached the intercepted SDK transport once before denying advice. The fixed route denies advice with zero transport calls. A fresh opt-in allows a new attempt. See the [verification receipt](message-ai-send-verification.json).

PGlite provides one database backend. These tests do not establish independent PostgreSQL-session lock scheduling, hosted PostgREST commit/delivery semantics, deployment clocks, provider usage/billing, account terms or real-model quality. Those require separately approved acceptance. The shared ceiling must not be described as a verified dollar cap; an account/provider spending control and a reviewed cost estimate remain activation gates.

The composed browser additionally verifies that exhausted allowance leaves human review available, performs no extra provider call and does not automatically retry. The existing public-policy and disabled-endpoint stories are also rerun on the final built application. Exact final results, source hashes and archived prior evidence are in `message-ai-allowance-verification.json`.

The prior message-consent checkpoint remains historical at `37a0204`; its eighteen pinned evidence outputs were preserved byte-for-byte under `verification/web/evidence/checkpoint-37a0204/`. The current allowance migration has not been applied anywhere outside disposable synthetic local tests. Restore/impact approval and live privacy repair remain separate release gates. Cases above 100 open reports still require the planned complete-evidence pagination workflow; the current refusal has not been weakened.
