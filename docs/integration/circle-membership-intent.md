# Membership intent ordering and hosted Circle authority

This is an unapplied local candidate following the installed Circle attendance candidate. It preserves that candidate and its historical files and pins.

The five-observation before-state audit at commit `5a1fba426d22441a992b7b106d7c715400743a99` reproduced two canonical HTTP cases: an already-joined member's new join no-op left revision unchanged, so an older held leave still succeeded; an already-absent member's new leave no-op likewise failed to fence an older held join. These new no-op intentions were API-reachable. The actual native reviewed controls correctly did not offer join to an existing member or leave to a nonmember, so the audit does not claim the normal UI exposed either choice. The historical audit source/log and observed gaps are recorded in `circle-participation-ordering-audit.json`; its baseline tests skip when the historical server hash is absent. The current positive tests are separate.

## Additive SQL candidate

Run only after separately reviewing the current database, deployment and approved change:

1. `circle-membership-intent-preflight.sql`
2. `circle-membership-intent-apply.sql`
3. Matching server and clients.

Preflight requires the installed exact attendance RSVP function, its raw service SELECT-only barrier, the reviewed existing join/leave bodies, ownership/ACL/function metadata, and helper body hashes. Apply repeats the checks with five-second lock and sixty-second statement deadlines while locking the relevant Circle, membership, RSVP and receipt tables. Every new accepted join or leave request advances the Circle revision once, whether or not a membership/RSVP row changed. Actor/request exact replay returns before this advance. The existing payload and immutable receipt representation is unchanged. Existing membership, RSVP rows, revisions and receipt history are retained. The attendance RPC and completion SQL are unchanged. Join remains service-only SECURITY INVOKER; leave keeps the attendance candidate's service-only SECURITY DEFINER boundary so it can remove departing members' RSVP rows while raw RSVP DML remains blocked.

Completion is terminal: the existing database guard refuses reopening. The audit found no opposite completion transition requiring a same-value ordering change. A new no-op completion can still return its base revision. No host transfer, reopening, cancellation or deletion is added.

The matching HTTP server requires a join/leave receipt's current revision to exceed its submitted base; this refuses old no-op SQL behavior if the candidate is missing. A pre-candidate no-op receipt may remain below that floor until later current state advances. Such history is retained and the server reports uncertainty; it is never rewritten into a newer confirmation. Existing exact replay still cannot rejoin a member after departure or restore removed RSVP rows.

`circle-membership-intent-rollback.sql` validates the installed candidate and disables service execution of join only. It preserves the fixed leave for member exit, all state/history, and the attendance raw-write barrier. Reapply restores joining. It never restores the older unsafe leave body. Older attendance preflight/apply/rollback files deliberately reject this newer leave body; their historical pins are not broadened. Use the current candidate for its reviewed rollback, or obtain a separate reviewed change to disable other functions. Do not blindly re-run an older migration or restore raw grants.

## Hosting HTTP authority

Creation and completion now require canonical lowercase `expectedMemberId` in their JSON body, compared to the actual server-resolved account before an RPC. This is a mismatch guard, not authority. Creation keeps its normalized listing and request ID; completion keeps its request ID and reviewed revision. New strict pure parsers/serializers in `lib/circles/hosting.ts` reject extra fields, coercions and unnormalized values. Exact creation retry validates normalization against its supplied start day, allowing historical receipt lookup; SQL checks current eligibility only after replay. GET hosting access and create/complete replies include the canonical member ID. GET hosting access honors the optional reviewed-member header, and detail retains its existing header check. Old ownerless create/complete clients are refused and must roll out with the server.

Creation retains actor/request idempotency, not listing deduplication. The same key replays one Circle; a different key intentionally creates another Circle within current quotas. A current hosting count or absent My Circles row cannot prove an older in-flight create will not commit. Ordinary UI retirement must retain private uncertain identity while clearing displayed private state; terminal abandonment must disclose that a sent request may still finish. Nothing retries automatically. Host completion remains an explicit reviewed operation and does not delete contributions or remove continuing members' discussion access.

The composed HTTP tests run canonical identity resolution, route handlers, materialized editions and the current SQL chain on one PGlite connection. They cover account switches, old-body refusal, exact replay, quotas, historical compatibility, the raw RSVP write restriction and disable/reapply.

## PostgreSQL cutover rehearsal

PostgreSQL 17 restored the synthetic fixture and applied the 41 files in the staged migration chain for the dated zero-policy reading baseline. The original columns and rows matched before and after the chain across 12 tables. Five competing requests waited on an observed PostgreSQL lock. Exact creation retry returned the original listing, one request took the last seat, an explicit same-value join fenced an older leave, and an RSVP rollback left no receipt. A Circle detail read that waited on leave returned without the private link or the departed member’s RSVP. The database also denied browser-role access and direct service writes to RSVP rows. [Verification record](native-circle-cutover-verification.json)

Run from a materialized checkout with the cached fixture runtime and local PostgreSQL 17. The script starts an isolated database on a private Unix socket and removes the fixture after shutdown. The production restore, hosted Data API and physical device checks remain open. [Supabase Data API security](https://supabase.com/docs/guides/api/securing-your-api)

```sh
mkdir -p verification/web/evidence
python3 -B verification/web/scripts/test-native-circle-cutover.py circle-cutover-local
```
