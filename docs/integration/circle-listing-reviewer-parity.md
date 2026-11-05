# Native Circle-listing review and correlated receipts

The native owned member account now offers **Check assigned Circle listing reviews** separately from message review. Current server assignments and host, participant and reporter conflicts control queue, evidence, coverage and decisions. No client role grants access, and there is no listing AI endpoint or control.

## Review behavior

The portable controller loads one queue page and one selected case at a time. Cases with more than 100 open reports require every 50-report page to be explicitly acknowledged. Only the current page and one chosen reporter note remain in memory. Earlier issued pages can be revisited to select evidence. A listing excerpt must occur within its title or its description individually; an excerpt spanning the two fields is rejected. Reporter notes remain private, and the host-facing explanation must avoid identifying reporters.

Hide and restore require a conduct reason, reviewed explanation and fresh confirmation. The controller binds each action to the current account, case, revision and interaction. Blur, background, unknown/offline connectivity, account changes and close clear private views and retire old callbacks. Reconnecting never reloads or retries automatically. Already-sent requests may complete.

Lost acknowledgement replies require a deliberate progress read. Lost direct and covered decision replies retain an immutable private request for explicit exact retry. A refused retry does not establish that an earlier send failed; its outcome remains unknown. Retained retry data clears when the owned view retires. Fresh history is useful current-state evidence, but never confirms an individual uncertain request.

Matching receipts bind Circle, request, optional coverage session, action, reason, explanation, report count and revision progression. Fresh decisions advance exactly one revision. Exact replay can return a later current revision and visibility while identifying the original decision. A confirmed receipt remains confirmed if the following current-case read fails or is older than that receipt. Another decision requires a fresh case and review.

The web listing screen now enforces the same receipt fields, rejects cross-field excerpts, supports deliberate direct as well as covered retries, preserves uncertainty after a refused retry, and retains confirmation after failed/stale readback. An unexpected coverage session cannot confirm a direct decision.

## Native transport

`circleReviewPolicy: 'assigned-circle-review-v1'` and `sendCircleReview` are both required to expose `circleReviewerTransport`. The ordinary member and message-only transports continue to reject listing routes. JavaScript and Kotlin independently restrict the configured HTTPS origin, exact lowercase-UUID paths, methods/queries, canonical exact-key JSON, scalar Unicode and the 12,000-byte body limit. Coverage start explicitly carries `contentHash: null`; message/advice hash validation is unchanged. Protected one-use request handles, storage generation, deadline and lifecycle checks remain in force. Older or message-only bridges leave listing review unavailable with a website fallback.

## Additive SQL contract and release order

The original listing receipts omitted Circle/request IDs. The new parser and API require them, and the additive apply draft changes exactly four listing receipt projections in the two existing decision functions. Exact replay first authorizes the current actor, then matches the stored actor/request and complete payload. Returned IDs therefore identify the actual stored operation. Existing historical SQL files are unchanged.

The apply/rollback scripts pin recognized function bodies and metadata, ownership, defaults, invoker security, search path and service-only execution grants. They check again after bounded table locks. Apply retains existing grants and all user/history rows. Rollback disables only new listing decisions while preserving correlated, freshly authorized exact replay and unchanged message decisions. Reapply recognizes only the expected disabled state.

Apply the additive SQL before the strict server/clients in any separately approved rollout. Old clients tolerate the extra fields; new clients cannot confirm old receipts. Reverting only the receipt format would create unconfirmed replies after writes, so the rollback retains the correlated format. Hosted schema-cache behavior, independently queued/in-flight function replacement and restore acceptance remain unverified. Table locking and single-backend tests are not a live-drain proof. See [migration plan](production-migration-plan.md).

## Local evidence and limits

- Backend contract: **61 tests**, including guarded apply/rollback/reapply, earlier stored-request replay, later revisions, authorization/conflicts and unchanged message decisions; 17 disposable databases closed.
- Portable controller: **23 cases**, 67 fixtures closed. Actual controller → HTTP → SQL integration: **5 cases**, five databases closed, covering 0/50/100 direct and 101/250 covered review. Revoked-grant retries preserve uncertainty; regrant permits exact confirmation without another decision.
- Registered native App: **10 stories**, full 101/250-report coverage, lost replies and exact replay, a separate direct description-evidence decision, stale callbacks, lifecycle and message-only legacy fallback. The source-bound final receipt records request and cleanup counts.
- Web listing: **13 stories / 22 handler requests**, including altered Circle/request/report-count/session receipts, failed and stale readback, lost direct reply, refused retry, later independent decision/new report and current-state recovery.
- Existing web message/listing callback regression: **18 checks / 74 requests**, zero violations under the new additive contract, including coverage expiry. The previous nine-failure baseline remains preserved in the historical message-review checkpoint.

[Verification receipt](circle-listing-reviewer-parity-verification.json) binds final types, lint, selected suites, build, proof inputs and evidence. Counts across proof types or older milestones are not one unique test total. Root inspected the native and web 320px screenshots; all counted browser/SQL fixtures closed and provider calls were zero.

The final selected suites passed **218 unique cases**: 157 shared/native/controller-HTTP-SQL cases plus 61 backend cases from distinct test files. Full web, portable and both narrow native type checks, scoped lint and the offline webpack build passed with **1,041 unchanged build inputs**. An initial whole-project type check encountered 333 numbered generated-cache copies; all were archived exactly before removing only those duplicate generated leaves. Canonical outputs and product sources stayed unchanged, and the subsequent full type check passed. Unknown duplicate provenance, both stale differing copies and the original timeout/error diagnostics remain preserved.

These tests use actual screens/controllers and canonical handlers/migrations with explicit provider, identity, PostgREST, transport and native/OS doubles. Native checks use source policies and a narrow type shim; they do not establish Kotlin, Codegen, Hermes, iOS/Android compilation or physical-device accessibility. One PGlite backend does not prove independent production concurrency. Runtime manifests bind selected cached inputs, not every installed transitive dependency. Application network denial is not OS isolation.

First release remains **HOLD** for live Data API/RLS repair, backup/restore, deployed-source provenance, coordinated rollout, real provider/account acceptance, native/iOS/Quest devices, accessibility and final rights/release checks. No production SQL, provider activation, real sign-in/email, issued credential, install, spending, push or deployment occurred. All SQL in this milestone is an unapplied local candidate.
