# Matching access and consent review — local candidate, not released

The first-release people finder uses published profile words. The earlier audit below found four older matching families and dashboard links into them. Those experiments are now unavailable in the local pilot build; their records and algorithms are preserved. Direct database containment, a complete optional-participation contract and any hosted cutover remain separate requirements.

## November 8 local pilot boundary

Nine HTTP operations across seven legacy routes now return private, uncached `503 MATCHING_NOT_AVAILABLE` JSON before parsing input, resolving identity, loading a community or opening a database client. This includes questionnaires, results, generation, history and responses. The internal community matching writer is also blocked before data access. The release decision is a reviewed source constant, not an environment, URL or browser flag.

Both saved matching pages show a clear release notice and links to published-profile discovery and existing book salons. The dashboard and public SoE module no longer direct people into the scored prototypes or promise automatic pairing after seven answers. Legacy React screens remain preserved behind an outer component boundary, so their effects do not mount. No records, algorithm implementations or historical files were deleted.

Verification: 68 focused test results passed, including 37 new boundary results; the full web build covered 1,232 matching canonical inputs; scoped lint passed. Five compiled browser journeys passed at phone and desktop widths. Nine requests exercised the actual compiled HTTP routes with malformed bodies and override attempts; all returned the expected refusal. The browser fixtures use fictional accounts and explicit directory/dashboard/feed/salon adapters. The complete historical Bun suite was not run because its runtime is unavailable; its affected expectations were updated, and the same boundary is covered by the Node and compiled HTTP checks. Both owned app previews stopped with unchanged source, build, input and runtime hashes and no outbound network attempt.

See the [source-bound verification receipt](matching-pilot-boundary-verification.json) and [optional introductions design](matching-participation-design.md). No hosted migration, permission change, credential change, deployment, real-member call or spending occurred. The three-table containment candidate below is still unapplied. The older consent/validity flaws are contained locally by making those operations unavailable; they have not been repaired into an operational matching service.

## Earlier audit evidence and scope

A read-only hosted catalog query at **2026-11-08 09:16:49 UTC** inspected only three tables, their columns/policies/privileges, trigger metadata and relevant database roles. It read no member records. Both `community_match_profiles` and `community_matches` have **two** permissive `PUBLIC USING(true) WITH CHECK(true)` policies; the earlier source migration shows only one per table. `consented_match_projections` has no RLS and no policies. Browser roles have table-wide read/write privileges on all three. There are no direct dependent views in this query; that does not rule out dynamic SQL, indirect dependencies or other server callers.

The five observations below use actual current TypeScript handlers with fictional rows and signed synthetic wallet sessions. Database transport and the wallet-revocation store are test doubles; the erasure gate is disabled. Their purpose is to reproduce unsafe behavior, **not** to claim a live exploit, current personal-data exposure or release acceptance. The bound source and results are recorded in the [verification receipt](matching-data-containment-verification.json).

| Path | Reproduced behavior | Required follow-up |
| --- | --- | --- |
| `/api/world/match` | A private peer's name, derived coherence vector and labels appear without a separately checked matching permission. Omitting the peer's ID does not remove the name disclosure. | Keep frequency/biometric scoring outside the pilot; require a distinct purpose, data decision and evidence before considering it. |
| `/api/communities/[slug]/questionnaire` | A signed-in person with no current community membership can save answers. A request with another Origin is accepted. An eight-character answer becomes political-axis value 2. | Require current membership, bounded input, account/origin binding and an explained questionnaire. Replace the answer-length heuristic before offering interpretive scores. |
| `/api/communities/[slug]/matches` | A person with no current membership can retrieve their old pair rows, private peer names and every returned row field. A deliberately added synthetic column passes through. | Recheck membership/permission and use an exact result DTO. The extra test column is not claimed to exist in production. |
| `/api/match/generate` | A new pair is created from private response participation, with no separate peer-participation check. Another Origin is accepted. Raw reflection text is **not** returned by the tested handler. | Require explicit eligibility/participation by both people, request binding, blocks and an introduction lifecycle. Counts or common question IDs do not prove shared philosophy. |
| `/api/match` | A candidate in `consented_match_projections` is scored without a separate consent receipt or revision. | Review purpose, disclosure fields, permission version and withdrawal. The table name does not establish the decision; the probe does not establish whether consent existed elsewhere historically. |

The algorithms in these probed handlers are deterministic. Their labels and scores have no validation evidence in the inspected materials. No model provider, invitation or real member was used in the probes. Accepting a synthetic cross-origin request is a handler finding; an actual browser/session exploit was not tested.

## Tested three-table containment candidate

The [read-only preflight](../sql/matching-data-containment-preflight.sql) returns the bounded catalog above. The [apply candidate](../sql/matching-data-containment-apply.sql) is **not a deployed migration**. It:

- Locks the three ordinary tables together, requires the reviewed owner/role topology, both exact known policies on each community table, no unexpected view dependency and the preserved trigger definition.
- Narrows both policies on each community table to the service role, enables RLS on the projection table, and revokes table **and column** access from `PUBLIC`, `anon` and `authenticated`.
- Verifies that effective browser access is gone and existing service CRUD remains. It does not grant new service privileges, alter rows, replace the trigger, remove a table, modify credentials or change other objects.
- Aborts the whole transaction on unexpected state. Tests verify rollback of prior table/policy/column changes when a later precondition fails, and safe reapplication of the exact contained state.

The existing locked local PostgreSQL engine passed **15 test results**, including 11 deliberate authority/policy/dependency changes. It checks baseline public access, denied browser reads/writes, residual column grants, preserved service CRUD and update trigger, unchanged rows and unrelated public reading. One connection supplies these SQL tests; independent PostgreSQL-session races and hosted PostgREST are unverified. Scoped lint passes. No application code changed in this checkpoint, so the prior source-bound full web build remains the application evidence; no new full build is claimed.

Service credentials can bypass RLS and must remain server-side. Database grants and row policies are distinct controls; the service routes therefore need their own authorization. [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security). The current changelog was checked; this work installs/upgrades no CLI, library or database.

## Paired release plan

1. **Local pilot boundary implemented and verified.** The nine operations and internal writer are unavailable before private work, and the public entry links now lead to published profiles. Preserve this boundary until the optional participation, scoring and history/export contract is reviewed. A future deployment and database cutover still require their own recovery and approval gates; local enforcement does not change hosted routes.
2. **Model participation separately from public profiles.** An author must see the purpose, selected input, intended audience, result fields and whether any named provider receives text. Their choice should be optional, revision-bound and withdrawable. Existing per-message AI-moderation opt-in does not authorize matching from reflections, questionnaire answers or measurements. Legacy rows are not automatically opted in. Exact consent storage and UI remain proposals, not implemented facts.
3. **Define any future result honestly.** Favor declared topics, availability and project interests first. If an optional questionnaire is later worthwhile, explain each result and validate the measure before making a compatibility claim. Require current permissions and membership for both participants, block checks, bounded fields, separate acceptance/decline and cancellation. Withdrawal must stop new recommendations and pending introductions; it cannot retract information already seen.
4. **Rehearse the complete release on the coherent isolated restore.** These three existing tables are already part of the source inventory. Coordinate with the earlier member/practice containment drafts, new-object defaults, dependent functions/views and app callers. This candidate has not been added to or accepted as the full 95-table recovery rehearsal. Keep existing recovery pins unchanged until an explicitly reviewed successor is prepared.
5. **Approve and verify the cutover separately.** Test direct Data API denial and intended app behavior with controlled real accounts after recovery and exact approval. The full 05:09 UTC catalog's other tables and public media remain separate gaps. The new candidate adds three tables to the bounded draft coverage; no hosted gate is cleared by a local draft.

## Preservation and rollback

All records and existing project work are retained. Unexpected preconditions roll back before commit. After an eventual approved cutover, prefer correcting the application while keeping private access restricted. Do not automatically restore the old anonymous grants or open policies; any such reversal needs captured preimages, a specific risk review and fresh approval. No rollback, apply or hosted access change occurred here.

The owner is away from the Mac. Secure database entry is pending; no password prompt was opened and no password was requested in chat. Existing tools suffice for this review: **$0 spent; $200 remains; no charge scheduled**.
