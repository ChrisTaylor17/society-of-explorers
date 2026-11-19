# Book-salon account, drafts and membership confirmation

8 November 2026. Local correction based on `efb44b9197c0544398519cb5c8ba3b5623199cbd`. Ordinary public book salons remain distinct from the member-restricted Circle pilot and the older seven-week guide program.

## Behavior and purpose

The collection page previously kept a one-time member/token lookup and an unfinished creation form across account changes. Its join action could mistake a completed request for confirmed membership. The page now separates public discovery from an account-bound controller. No bearer token is retained or supplied by that controller. It checks the current cookie-authenticated member, provider and subject before an action and again before confirming its result. Private reads and writes carry both the browser sign-in intent and expected-member headers required by the existing server contract.

Same-tab/provider and cross-tab notifications, SDK identity events, background/blur/pagehide and offline events clear the displayed account and unfinished draft, abort pending work, and reject late replies. Returning offers **Check current account** rather than automatically restoring private content. Unmount disposes the listeners and controller. A silent browser-selection change is also checked before form edits and around each request. Each operation has a fifteen-second deadline, including a transport that ignores cancellation. Aborting cannot undo a write the server already accepted.

An uncertain creation retains only its opaque request ID and a digest of its normalized inputs, scoped to that member/provider/subject for the lifetime of this page. Unchanged retries use the existing transactional creation receipt. Different details cannot silently issue a second creation. Retirement clears the displayed text; returning to the same account requires explicitly re-entering the same details. Another account cannot borrow or discard its pending request. No draft or retry ledger is written to browser storage.

The additive `GET /api/book-salons/join?cohortId=…` returns exactly the requested ordinary salon ID, authenticated member ID and boolean current membership, with private/no-store headers. It rejects malformed or duplicate query keys, missing authentication, Circles, unavailable data and inconsistent ownership. It never returns a roster. The browser reads this endpoint before joining, so an existing membership does not cause a duplicate write. After one explicit join it reads membership again and rechecks identity. A success-shaped POST or a public member count cannot confirm a join. An uncertain join stays locked to read-only status checks in that page lifetime; a false result cannot prove an earlier in-flight write will never commit.

The unchanged creation transaction and controlled ordinary join remain the only writers. The auth helper, public discovery endpoint, Circle contracts and SQL candidates are preserved. No schema, grant, hosted configuration or private content was changed. The SDK listener follows the [official synchronous callback and unsubscribe guidance](https://supabase.com/docs/reference/javascript/auth-onauthstatechange); no dependency upgrade was needed.

## Verification and limits

See [the source-bound local receipt](book-salon-account-verification.json). It distinguishes controller/actual-auth/disposable-SQL checks, the actual compiled page with explicit synthetic identity/transport and lifecycle events, and compiled HTTP refusal probes. Successful hosted authentication, hosted PostgREST/RLS, independent concurrent database sessions and physical phones/headsets are not established by those checks. Browser previews include a populated narrow-phone account state and a failed-creation form. The fixed navigation has an opaque background so scrolling content does not show through it.

The final 1,243-input build/type check, scoped lint and 22 focused cases pass. Nine compiled account stories and three compiled membership HTTP refusals pass, alongside nine discovery stories, four discovery HTTP refusals and eight existing salon journeys. Source, build and runtime checks match; all owned test servers stopped and their ports closed. Lowest sampled free storage was 15.23 GB. Initial fixture-timing and visual-review iterations are retained in the receipt, separately from the final passing runs.

The retry ledger is memory-only. Full reload, navigation away, tab closure or a separate tab can lose it. Existing creation receipts are durable only in the candidate database transaction; recovering their key across browser lifetimes remains unresolved. A join still lacks a durable idempotency key. These are explicit release limitations, not a general exactly-once or cross-device guarantee. Blur/background clearing also needs physical-device testing, including native date pickers and mobile app switching.

Coherent hosted backup/restore, access repair, real sign-in/recovery, the proposed host and meeting dates, and device acceptance remain gates. The first four-week Circle pilot uses its own membership contract. No deployment, hosted writes, credential change, invitation, installation or spending follows from this checkpoint.

## Rollback

Restore the prior collection page and remove the two new account modules and additive membership GET together. Preserve the existing creation/join POST handlers, all SQL candidates, cohorts, memberships and receipts. No data migration or destructive rollback is required. Reverting the page would restore its stale-account and false-confirmation defects; it is not a safe release fallback. A source rollback cannot undo a server-accepted write.
