# Ordinary book salon conversation milestone

This is a local implementation and unapplied SQL candidate. Ordinary salon messages remain publicly readable, as the prior route intended; Circle discussions keep their separate current-member authorization. No live schema or access was changed.

## Server and database contract

The route uses the service-only INVOKER functions in `docs/sql/book-salon-conversation.sql`. Both functions recheck ordinary classification under a cohort row lock. Posting also checks current membership under a row lock. The route's initial classification cannot authorize use of a public RPC for a Circle. Valid uppercase UUIDs normalize once; missing cohorts return 404 through `maybeSingle`.

The public reader explicitly joins `members.id`, without depending on the absent live membership-to-member foreign key. Its roster includes only currently published profiles, filters before a 50-profile cap and returns their intentional public-profile IDs and safe display names. The independent membership count is not the roster length. Private profile/member IDs, identity and billing columns never enter the response.

Messages include only ID, posting name, bounded text/availability, nullable time and server-derived ownership. Names attached to deliberately public contributions remain public even when the author's profile is private. The UI explains this before drafting. Historical null `member_name` becomes “Unattributed message”; it does not copy `sender_name`, infer human ownership from a legacy label, or alter sender/type/passage data. Invalid or oversized historical text becomes the explicit unavailable marker. Dates are never invented. The latest 100 messages return in ascending order with an honest truncation marker. Roster and message caps are independent.

New posts require verified identity, same-origin/browser forgery checks, a bounded UTF-8 body and plain text up to 2,000 UTF-16 units. `expectedMemberId` must equal the current server actor before any mutation. The SQL RPC admits only a current ordinary member and derives the receipt from the inserted row. Database refusal or known missing RPC is reported as not attempted; transport or malformed receipt can remain unknown. No automatic retry or duplicate-free/idempotency promise is made for this legacy salon endpoint.

The actual client loads public history without SDK or identity lookup. Explicit Prepare to post binds the actor before editing. Cookie authority is compared before/after SDK token lookup and around fresh readback. Selection changes abort and retire drafts and ownership context. A matching receipt alone is insufficient: fresh history must contain the same ID/content/name/time under the same actor. Deadlines and uncertain sends require manual reload.

## Migration and rollback limits

Requires the reviewed strict Circle legacy baseline, all nine Circle files in their documented order, and contained private-by-default member profiles. The local fixture's minimal `members` prerequisite is explicitly synthetic; separate profile SQL/HTTP/browser verification covers the complete profile migration. This is not one fully hosted restore/rollout proof.

The apply transaction refuses raw browser table/column authority, unexpected browser inheritance, unsafe role/table ownership, missing service access and any preexisting function-name collision. The observed broad function defaults are revoked explicitly; only the owner and service role can execute the four INVOKER functions. Fixed search paths and private/no-store HTTP projections are preserved. Neither script changes global defaults, existing table grants, foreign keys or rows.

`book-salon-conversation-rollback.sql` validates exact function signatures, owners, bodies, attributes, comments, search paths and ACLs before dropping the two RPCs and two helpers with RESTRICT in one transaction. It preserves every post and all containment. Later dependencies or drift abort atomically. Coordinate trusted-owner maintenance; function checks do not serialize arbitrary concurrent owner DDL or discover every application caller. This is not a full release rollback. The legacy baseline's own rollback is unused-only and refuses later Circle DDL or used names.

## Verification

- 23/23 final affected SQL/HTTP/parser cases, including atomic post/readback, explicit joins/publication, 51 published profiles, more than 100 messages, legacy/null handling, UTF-16 boundaries, browser RPC/raw table/column/TRUNCATE denials, missing/uppercase IDs and function rollback retention/drift/dependency checks.
- 15 actual React/Chromium component stories, plus five composed component → actual salon/auth handler → actual local SQL stories. The composed proof held both the commit receipt and fresh readback, exercised private/public roster changes and refused stale cross-actor drafts in browser and server. Identity is synthetic; publication changes are controlled fixture SQL, not another owner-profile flow claim.
- Independent API/SQL and bounded rollback reviews found no unresolved scoped issue after the UUID/missing-row fixes. Full web build, TypeScript, built regression and wider suite results are in `circle-salon-verification.json`.

PGlite is a single PostgreSQL 17.5 session, not the live PostgreSQL 17.6 service, PostgREST/schema cache, provider transport or concurrent multi-backend scheduling. No provider sign-in, issued key, package installation, production application, deployment, push or physical-device acceptance occurred. The live Data API risks remain open, including the separately observed artifact table; this route does not close them.
