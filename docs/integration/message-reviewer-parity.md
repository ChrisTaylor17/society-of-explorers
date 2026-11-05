# Assigned-message review across native and Quest Browser

The native member account now offers **Check assigned message reviews** through the existing verified account connection. A separate portable reviewer controller owns queue, selected case, draft, bounded report coverage and uncertain decision recovery. The new `/quest/reviews` page explicitly connects before mounting the complete web message-review workflow. Neither entry grants a reviewer role: current server assignment and author, host, participant and reporter conflicts control every operation.

## Human review and recovery

- Queue pages replace the current bounded page. Opening a case fetches fresh restricted evidence. A report is an allegation, not a finding; political or religious disagreement alone is not a restriction reason.
- Cases with more than 100 open reports require every 50-report coverage page to be read and explicitly acknowledged. The controller retains one page and at most one selected reporter note. Earlier issued pages can be revisited for evidence after coverage completes. Local preview/history never grants decision authority.
- Hide requires a conduct reason, an author-facing explanation and an exact evidence excerpt. Restore lifts only the moderator restriction; it cannot undo author withdrawal. Every decision requires a fresh human confirmation and current server evidence/revision.
- Lost acknowledgement replies do not trigger a retry. A deliberate progress read can recover the server's frontier. A lost decision reply retains its immutable request privately for explicit exact retry; a history/read response never confirms that write. A matching receipt confirms the outcome even if the following current-case read fails. The UI offers an explicit refresh afterward.
- Coverage expiry is checked before preparing and first sending a new decision, including after delayed request-ID or credential preparation. A genuinely dispatched decision can still be retried exactly after expiry under the server's existing replay/authority rules.
- Every action carries the current context and interaction identity. Account changes, case changes, local edits, lifecycle retirement and unmount invalidate retained callbacks before credentials, transport or asynchronous results can affect a newer view. Return to focus/connectivity does not fetch or retry automatically. Already-sent work may finish.

AI observations remain separate from human coverage. They require a complete case of at most 100 open reports, eligible message state and server-verified author consent, provider configuration and allowance. The client sends only the expected revision and content hash to the advice handler. Eligible message text alone can be sent to the named Anthropic provider; reporter notes, profiles and other conversation text are excluded. Observations never populate a decision or become its evidence. The provider remains disabled and no provider call occurred in these proofs.

## Native boundary

The native account exposes `reviewerTransport` only when the bridge supplies both `sendReview` and `messageReviewPolicy: 'assigned-message-review-v1'`. Ordinary member transport continues to reject admin routes. The dedicated JavaScript and Kotlin policies independently restrict the exact configured HTTPS origin, lowercase UUID paths, queue/detail/coverage/advice/decision methods and queries, canonical exact-key JSON, scalar Unicode and a 12,000-byte body ceiling. They do not infer reviewer access from member sign-in. Legacy bridges retain an honest website fallback.

The native screen uses active app state plus trusted known-online connectivity. It clears private evidence and drafts when retired, and allows explicit current-case refresh after a confirmed decision's failed readback. Closing clears the local review connection and warns that a sent request may still finish.

## Web and Quest fixes

The preserved pre-change web implementation reproduced nine stale-action failures, including writes to a prior message or Circle listing after selection, account replacement or blur. Current committed-render identities now guard every user action and retire sibling callbacks synchronously before a new paint. Coverage callbacks additionally bind the exact selected detail and mounted operation lifetime. A same-expiry coverage reply rearms expiry even with stable parent callbacks. [Retained-action evidence](reviewer-retained-actions.md) describes the executable baseline and regression scope.

Quest uses a regular browser window, the existing signed-in account and the actual complete web reviewer components. No account client is constructed before **Connect my review account**. Close, account changes, blur and offline events unmount the private view; returning requires a new deliberate connection. This is not an immersive or physical-headset acceptance claim. Circle-listing review remains linked to its web page; native Circle-listing review is still a separate unfinished milestone.

## Verified local scope

| Proof | Observed result |
| --- | --- |
| Native registered App | 10 stories, 60 intercepted requests, 13 coverage responses and 3 matching decision receipts. All 101 reports acknowledged, lost acknowledgement recovered, lost hide receipt replayed with identical body/request ID, failed readback preserves confirmation; then all 250 new reports acknowledged and one restore accepted. Final case: 351 reports, zero open, two decisions. |
| Quest entry | 7 stories, 17 handler requests. No pre-connect account client; full 101-report review and decision, server-disabled advice, retained-action rejection, held-credential retirement, manual reconnect and 320px layout. |
| Web regression | 18 checks, 74 handler requests, zero violations. Archived executable baseline still reproduces nine violations in 63 requests. Includes fresh message/listing positive controls and the expiry timing probe. |
| Selected tests | 120 passing cases: 61 shared controller/regressions, 57 native policies, 2 portable-controller → real HTTP handlers → disposable SQL integrations. The integrations cover 101 and 250 reports, lost replies and later exact replay. All counted fixtures closed. |
| Static/build | Full web, portable and narrow native type checks; scoped lint; offline webpack build with 1,039 source inputs unchanged. |

Root inspected both 320px screenshots. Browser/SQL fixtures closed and AI-provider calls were zero. [Verification receipt](message-reviewer-parity-verification.json) binds exact sources, bounded cached runtime inputs, logs, bundles, screenshots and preserved diagnostics. Counts from different milestones or proof types should not be added as one unique test total.

Browser proofs run actual registered/native or Quest/web screens, controllers and current canonical handlers/migrations. Provider identity/credentials/events, reviewer actor resolution, PostgREST, transport delivery and native/OS primitives are explicit doubles. One disposable PGlite backend does not prove independent production-session contention. Native policies and the narrow type shim do not establish Kotlin, Codegen, Hermes, secure storage or physical iOS/Android/Quest behavior. Application-level network denial is not operating-system isolation. Runtime manifests bind listed cached inputs, not every transitive installed file.

First release remains **HOLD**. Live Data API/RLS repair, tested backup/restore, deployed-source provenance, coordinated SQL rollout, real account/provider acceptance, native compilation, devices, accessibility and final rights/release checks remain open. No production migration, provider activation, issued credential, email, install, spending, push or deployment was performed.
