# Full report review for Circle listings and messages

Local first-release implementation; production remains on hold. The additive SQL in `docs/sql/circle-review-coverage.sql` is unapplied. No reviewer assignments, provider settings or live data were changed.

Previously, a case with more than 100 open reports could be inspected only partially and could not receive a human decision. Both reviewer screens now offer a separate full-review flow for those cases. Ordinary cases retain the existing bounded detail and decision path.

The new flow presents 50 reports at a time in stable creation-time/ID order. A reviewer must explicitly acknowledge each issued page in sequence. Previously issued pages remain available for checking evidence. The server records progress against the reviewer, case, revision and content snapshot; the browser cannot supply a count or skip directly to completion. Acknowledgement establishes presented and acknowledged coverage, not human comprehension or the truth of a report.

Only the current report page and one selected evidence note are retained by the paginated view. There is no browser-storage persistence. The existing review-access lifetime clears private content on account changes, inactivity and departure. An unknown acknowledgement requires a manual progress read; an unknown decision can be retried manually with the exact same request and coverage session. A matching decision receipt is followed by a fresh case read.

Sessions expire after 30 minutes without a new sequential acknowledgement, bounded by reviewer-assignment expiry. New reports, changed evidence or access changes invalidate progress. The final transaction rechecks current authorization and complete coverage, validates an exact excerpt against its current source, closes the current reports and writes the existing decision audit atomically. Exact committed receipt replay requires current authorization and cannot create another decision. Stored audit counts now support the existing integer range; report and history projections remain bounded.

The private session and page tables contain cursors and acknowledgement metadata, not report text. New functions use service-only, invoker execution. Their HTTP adapters derive the actor from authentication, reject extra request fields, return private/no-store responses and retire after a 12-second lifetime. A response timeout cannot establish that a mutation was cancelled; the UI treats that outcome as unknown.

AI assistance remains separately governed by per-message author consent, the disabled-by-default provider and the shared request allowance. Cases above 100 reports still cannot request AI advice. This milestone enables human review only; reporter notes are never added to provider input.

See `circle-review-coverage-sql.md` for SQL prerequisites and rehearsal limits, and `circle-review-coverage-verification.json` for current source and evidence bindings. Synthetic authentication and local PGlite/Chromium checks do not establish hosted PostgREST, multi-session PostgreSQL scheduling, production rollout, real-member or device acceptance. The existing live privacy/restore gates remain open.
