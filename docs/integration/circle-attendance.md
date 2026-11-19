# Reviewed Circle attendance responses

This is an unapplied local release candidate. It supports the existing Going and Not going responses for a configured Circle meeting. Not going remains a stored response; it does not erase one. No cancellation state or record of actual attendance is introduced.

## Owner and request contract

`POST /api/circles/:circleId/rsvp` accepts exactly `{expectedMemberId,requestId,expectedRevision,date,status}`. Member/request IDs are lowercase UUIDs; the revision is a nonnegative safe integer; date is an actual `YYYY-MM-DD`; status is exactly `going` or `not_going`. The server resolves canonical bearer, Supabase cookie or signed wallet authority first and compares the reviewed member ID. Neither body nor header supplies authority. Invalid explicit bearer cannot fall back to cookies. Old four-field RSVP requests are refused.

The optional `X-Soe-Expected-Member` header adds the same canonical mismatch guard to Circle detail/membership reads and participation writes, including legacy Circle joining through book salons. Public detail remains available without this header. The current code has no legacy book-salon RSVP endpoint. The RSVP response binds canonical `memberId`, request, Circle, date/status and current revision, with no roster, provider subject, email or private meeting URL. Historical receipt facts do not override later current state.

The service locks the actor/request lane and Circle row. An existing exact request replays its immutable event and reads current capability state. A reused key with different payload conflicts. Every **new accepted RSVP request ID** advances participation revision once, including confirmation of the same stored status. Thus a later Not going confirmation fences an older held Going request at the previous revision even after application restart. Exact replay does not advance revision. Leave removes the departing member's RSVP rows atomically with membership and revision changes; replay cannot resurrect them.

Current members may respond when Circle membership capacity is full. New responses require current membership, visible usable configuration, an active Circle and a date in its finite configured program that is not before the Circle-local current day. Eligibility remains date-based: same-day responses are possible after the configured clock time. Hidden, ended or malformed-calendar Circles do not gain attendance controls. Membership-only recovery still permits eligible leaving.

## Migration and rollback

Apply only after separately reviewing the deployed participation/reading-program chain and current grants:

1. `docs/sql/circle-attendance-preflight.sql`
2. `docs/sql/circle-attendance-apply.sql`
3. Matching server and web/native callers, with a coordinated write-unavailable transition.

Preflight checks owned regular RLS RSVP storage, exact unique key/types, zero policies/custom triggers/rules, browser containment, bounded service-role grants, exact function identities/bodies/attributes/grants and the reviewed helper body closure. Apply repeats checks under locks with five-second lock and sixty-second statement deadlines. It preserves rows and immutable receipts. It replaces only RSVP and leave as service-executable SECURITY DEFINER functions with fixed `search_path=pg_catalog,public`; leave logic is unchanged. Leave needs this privilege boundary because it legitimately deletes the departing member's responses after direct table writes are revoked.

All direct `service_role` privileges on `circle_rsvps` are revoked and SELECT alone is restored. Tracked application/server inventory found only schema-health SELECT; the only legitimate tracked SQL writers were RSVP and leave. Raw service INSERT/UPDATE/DELETE/TRUNCATE cannot bypass the new ordering or removal logic. Administrative table owners and the service's ability to invoke other existing trusted participation helpers remain privileged boundaries; this is not a blanket replacement of every service grant or Circle write policy. Do not re-run an older participation script or restore raw RSVP CRUD afterward. Installed preflight refuses changed bodies/grants rather than repairing drift silently.

`circle-attendance-rollback.sql` verifies the installed candidate, then disables RSVP execution for `service_role`. It retains all responses, revisions, receipt history, the direct-write barrier and operational leave. Reapplying the recognized candidate restores RSVP execution. There is no downgrade to older same-value ordering: deleting history or reverting raw grants would defeat the barrier.

New clients fail closed if the candidate is absent. Old clients lack the required owner field and are rejected by the new server. An old deployed server may still expose its old HTTP contract, so server/client rollout and write access must be coordinated; SQL does not know browser proof identity. Pre-migration same-value receipts may have current revision equal to their old base. The new server requires current revision above that base and refuses such a receipt until later current state supplies that floor; it does not rewrite accepted history or claim completion from the old no-op receipt.

## Recovery and evidence limits

On web and native, selecting a response performs a fresh private Circle check
before showing the Circle, date, time, timezone, selected response and previous
response. Confirmation is separate; cancelling the review sends nothing.
Ordinary navigation and other participation actions pause during review and
unresolved sends. Current attendance comes from a separate fresh read after a
matching receipt, so historical Going cannot conceal later Not going.

The web workflow obtains canonical member proof for review and confirmation and
pins private reads and writes to that member. It retains uncertain requests
privately while the same component remains mounted, including temporary
retirement, and requires a fresh review before an exact retry. Unmount or Close
discards local recovery. Native Directory instead clears private detail, review
and local retry information on account changes, blur/background, offline,
disconnect or Close. Reopening requires explicit account and Circle checks;
there is no durable retry queue. Its exact retry action shows the previously
reviewed meeting and response beside the uncertainty notice.

Retained UI callbacks are bound to their view and review lifetime. Old Confirm,
Cancel, child-return and Close controls cannot act on a newer review or account
context. The optional native attendance connection preserves older bridges'
existing discovery, membership and discussion capabilities without exposing
unsupported attendance controls. See [native transport scope](native-attendance-transport.md).

A lost response stays uncertain. Clients hold the exact reviewed request while attached and require explicit same-key retry; a refused retry cannot prove the older in-flight request will not finish. Background, offline or account retirement clears displayed private state and explains that an already-sent request may still complete. Nothing automatically retries. Later fresh responses must be read back at or above the acknowledged revision before current participation is shown.

The new backend suite executes canonical identity resolution and HTTP handlers over actual local SQL, with synthetic identities and delivery. It covers held older Going versus later same-value Not going, loss/replay, raw write denial, account switching including signed wallet cookies, owner/receipt tampering, leave/removal and data-preserving disable/reapply. PGlite uses one connection: overlapping HTTP plus actual SQL CAS rejection are proved, not independent PostgreSQL-session lock scheduling. No provider operation, production SQL, deployment or device execution is claimed.

The new same-value revision rule is specific to RSVP. Existing join/leave/complete no-op semantics are unchanged, including their separate cross-restart opposite-intent ordering limitations. This milestone does not claim to fix those actions or introduce meeting cancellation, a third RSVP state, host roster disclosure or actual attendance tracking.
