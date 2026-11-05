# Reviewer callbacks bound to the current case

The web message and Circle-listing review screens now accept user actions only from the current committed render. An action retires its sibling callbacks synchronously, before React paints the next state. This covers queue navigation, decisions, exact retries, optional advice, every draft input, confirmation, report-page navigation, acknowledgement and evidence selection.

Coverage callbacks in each parent are bound to the exact current detail object. Leaving or replacing a case clears that binding before state updates. Coverage request continuations also check their mounted lifetime and operation sequence. Expiry is bound to the current page object, so a same-expiry reply still rearms the timer when parent callbacks are stable. Existing `useReviewAccess` request semantics remain unchanged; matching decision receipts still permit a fresh case read.

## Reproduced baseline

Before editing production files, the three original components and their browser bundle were preserved. `verification/web/evidence/reviewer-retained-actions-baseline-capture.json` binds those files and the initial complete reproduction. Nine retained-callback failures were reproduced by invoking actual React callbacks after the original render retired:

- Old message decisions saved against the prior case after selection, account replacement and blur/resume.
- Old advice requested the prior message. The provider was disabled and no AI call occurred.
- Old checkbox and explanation callbacks changed fresh controls.
- An old acknowledgement advanced actual SQL coverage by 50 reports after a progress refresh.
- Old private evidence reappeared in a different selected case.
- An old Circle-listing decision saved against its prior listing.

Fresh currently enabled controls were prepared before each stale invocation, avoiding a disabled-state explanation for a passing test. Both reviewers were synthetic eligible identities; these tests do not claim a backend authorization bypass.

The original bundle remains executable through `verification/web/tests/browser-reviewer-retained-actions-baseline-replay.mjs`, which resolves the original product and entry leaves from the preserved originals. That replay still reproduces all nine failures without restoring or editing the fixed production files. The original entry was recovered from a provisional copy and verified byte-for-byte against its baseline build hash.

The first two baseline runs reproduced all eight message/coverage failures, then stopped at synthetic Circle-creation limits. Their receipts, logs and runners remain preserved. The final setup seeds synthetic listing rows directly; canonical listing review and coverage handlers still execute against the current SQL.

## Fixed verification

`verification/web/evidence/reviewer-retained-actions-verification.json` binds the fixed and baseline receipts, logs and provisional archives. The final fixed run passed 18 checks with 74 browser handler requests, 169 source inputs and 20 runtime inputs. The baseline replay made 63 handler requests and reproduced nine failures. Both closed their browser and disposable database, with zero provider calls.

Additional fixed checks cover synchronous draft actions before paint, selected-message/account/lifecycle coverage callbacks, parent unmount, fresh full listing coverage, and fresh message decisions. An isolated expiry probe uses stable callbacks and a synchronous replay of a canonical SQL page to force coalesced state updates, then advances the browser clock. It is explicitly a timing test rather than further HTTP or SQL acceptance. Scoped current-source lint is clean.

These are local Chromium/PGlite checks using synthetic identity, credential/SDK event, PostgREST, Next transport/Link and delivery adapters. They establish neither issued authentication, remote provider behavior, independent PostgreSQL scheduling, human comprehension, deployed acceptance nor device behavior. Native assigned-message review and native Circle-listing review have separate acceptance scope.
