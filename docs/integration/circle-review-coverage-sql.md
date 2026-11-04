# Human review coverage SQL

Local, unapplied implementation. No production schema, member rows, reviewer assignment or provider was accessed or changed. The new migration is `docs/sql/circle-review-coverage.sql`, after the existing Circle moderation chain. It works alongside consent and the disabled AI allowance; it does not relax AI’s separate100-report gate.

The two original detail and two original decision function bodies remain unchanged. Their report arrays stay bounded at100 and their decisions still refuse cases above100. The new workflow supports listing and message cases through fixed50-report pages, with no replacement upper cap presented as complete. Both existing audit columns remain integers; only their recognized0..100 checks are replaced by nonnegative checks, making2147483647 the storage/parser ceiling. Unexpected extra count checks or changed original checks refuse installation atomically. Decision history remains bounded at100.

The migration creates two private RLS tables: sessions contain verified actor/case/revision/source binding, counts, expiry, invalidation and consumption metadata; pages contain only issued keyset cursors, a token, count and acknowledgement state. Neither stores report text or reporter identities. Partial indexes support active-session invalidation and open listing-report keyset ordering, so closing a large case does not repeatedly scan historical sessions. Browser and unrelated inherited default ACLs are scrubbed on only the new objects. The invoking service role receives the privileges needed by the explicit SQL functions; it remains a trusted application authority. There is no reviewer-provisioning endpoint.

## RPC contract

All RPCs take the actor derived by the server, never a body-supplied identity. A null message ID denotes a listing, whose public content hash is also null.

- `soe_circle_review_coverage_start(actor,circle,message,expected_revision,content_hash)` creates a new session and its first page. It invalidates prior unused sessions for the same actor and case. An unknown start reply requires a deliberate restart rather than an assumed successful review.
- `soe_circle_review_coverage_page(actor,circle,message,session,page_number DEFAULT NULL)` reads an already-issued page; null means the current frontier. It never issues a future page or extends expiry.
- `soe_circle_review_coverage_ack(actor,circle,message,session,page_token)` acknowledges only an issued current page, advances the reviewed count and issues exactly one next page. A repeated acknowledged token returns the current frontier without advancing or extending expiry again.
- `soe_circle_review_coverage_decide(actor,circle,message,session,expected_revision,content_hash,request,action,reason,summary,evidence_report,excerpt)` requires completed, current coverage for a new human decision. It uses explicit copies of the existing decision semantics and immutable audit/receipt tables; no function-body string rewriting occurs.

The page DTO has exactly13 fields: `sessionId,circleId,messageId,revision,contentHash,totalReports,reviewedReports,pageToken,reports,complete,expiresAt,pageNumber,acknowledged`. Page numbers begin at1, tokens remain UUIDs even on acknowledged pages, and a completed frontier still displays its final bounded page. Zero reports return page1 with an empty array, complete/acknowledged true. A report DTO contains only `id,reason,note,created_at`. All previously issued pages can be revisited; the UI need retain only one page and one chosen earlier-page evidence source.

## Consistency and human decisions

Existing authorization acquires the parent case, message/state where applicable, and reviewer grant locks before session locks. Every page, acknowledgement and new decision rechecks current assignment, conflicts, revisions, source binding and count. A session has30 minutes of inactivity allowance, capped by assignment expiry; only a new sequential acknowledgement extends it. An expired session cannot resume.

Additive row triggers invalidate matching session metadata on reviewer-grant, cohort, listing-report, message-report, message-state and message-source changes. Updates invalidate both old and new scopes when identifiers are reassigned. This includes revoke/re-enable and source changes that might otherwise return to the same values. The triggers do not modify source/report rows. New report submission uses the existing serialized RPCs. Trusted-owner DDL, TRUNCATE and lock-order changes require coordinated maintenance; the tests do not claim to serialize arbitrary owner operations.

A completed session does not decide anything automatically. The reviewer still chooses a conduct reason, authors the host- or author-facing explanation, confirms review and supplies an exact source excerpt for hiding. Earlier-page report evidence is checked against the actual current open note. One transaction changes visibility, closes all current reports, inserts the full report count into immutable history and consumes proof. Audit/receipt failure rolls every change back, including session invalidation/consumption.

Exact committed decision replay first reauthorizes the reviewer, then returns the original decision with current case state, even if coverage later expired, was consumed or new reports arrived. Changed payloads conflict. Replaying a receipt never closes newer reports. These mechanics prove sequential presentation and explicit acknowledgements, not a human’s attention, comprehension, fairness or decision quality.

## Local evidence and limits

`verification/web/tests/review-coverage-db.test.mjs` executes the actual migration over the tracked sanitized three-table catalog and current strict Circle/consent/inactive-allowance chain. Synthetic identity, member/external-table stubs, unknown default exceptions and administrative roles remain explicit in the shared fixture. Its10000-row seed helper bound is test setup only, not a workflow cap.

The suite covers101/250 cases for both surfaces, timestamp ties, earlier-page evidence, incomplete/forged/foreign proofs, acknowledgement replay, expiry, inactivity extension, revoke/re-enable, source change, actual newly submitted reports, exact decision replay, atomic audit failure, legacy100 compatibility, raw ACL denial and collision/count-check drift. The durable receipt is `verification/web/evidence/review-coverage-db.log`. Additional HTTP/browser proof is separately owned and reported.

PGlite has one backend: these tests prove real SQL behavior, sequential interleavings and rollback, not independent PostgreSQL-session scheduling, deployed authentication, PostgREST delivery, restore safety or human review. No automatic rollback is supplied: once decisions above100 exist, restoring the old audit check would fail, and dropping coverage objects would erase private progress metadata. A separately reviewed rollback must preserve all report/decision rows and account for used sessions/dependencies. Live apply, retention/cleanup and hosted contention acceptance remain separate approval gates.

Final owned database verification: **22/22 PASS, zero failures/skips**, 26.98 seconds. Clean environment command from `verification/web`: `node --require ./scripts/deny-build-network.cjs --test tests/review-coverage-db.test.mjs` (PATH only). This final run includes both target-reassignment invalidation and index-name collision refusal. No tests, providers or production services outside the declared disposable local fixture were used.
