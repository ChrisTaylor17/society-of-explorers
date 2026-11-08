# Guide-program read access and pilot decision

8 November 2026. This review concerns the older seven-week program, not the first four-week fellowship plan or the newer Circle membership model. The source baseline was `7ad2a54e0ed0cfcac1d775cf67816799ae173934`. The changes below are local; hosted recovery and release remain on hold.

## Findings that change the release plan

The detail and session-list GET handlers previously used the privileged server database client without authenticating or authorizing their caller. Their bounded projections still contained member display names, participation/progress and session topics/dates. A document cookie or an unguessable-looking ID was not a data-access boundary. No hosted member data was queried to demonstrate this source defect.

The local handlers now resolve the current verified account, validate the program identifier, and require either the assigned guide or a current membership row before reading those details. A member of another program, a generic profile guide flag, caller-supplied member ID, or the shared chat’s `general` identifier grants no access. Missing identity returns 401; missing/invalid programs return 404; a verified outsider receives 403; an unavailable authorization query returns 503. Lookup failure never grants access. The existing output projections and private/no-store response headers remain intact.

Public listing counts previously converted failed or absent counts into zero members. The statistics helper similarly invented zero progress when a query failed. These failures now produce an unavailable response, while a genuine zero/empty result remains valid. The next scheduled date is selected in date order. The personal-program route also propagates a statistics/guide lookup failure without returning a partial success.

The personal-program query filtered an embedded salon status and then limited the parent memberships to one. Without an inner relation, a completed membership could occupy that result with an empty embedded salon and hide a later active one. The route and existing member-lookup helper now require the matching active relation. Multiple active-program selection still has no explicit member preference; this correction does not invent one.

## What stays distinct

The first fellowship plan is four weekly meetings. The legacy guide scheduler generates **35 weekday sessions over seven weeks**, with software graduation based on leadership, attendance and absence records. That is a materially different commitment and host workload. It should be reviewed as a separate facilitator-development program before being offered; it is not a required step for hosting the first Circle pilot.

Use the existing Circle host/member contracts for the first fellowship pilot after recovery and hosted acceptance. Preserve the guide program, its history and records. Before expanding it, decide whether “Guide” means a human facilitator credential, a software permission, or both; distinguish that role from a historical AI persona. Do not grant a role merely because seven weeks elapsed or because a model labels someone a guide.

## Remaining source gaps

| Area | Current evidence and consequence |
| --- | --- |
| Browser account lifecycle | `/salon` still loads personal data through a retained bearer and does not implement the newer account-retirement/subscription contract. Wallet-only entry and late replies after switching accounts remain unaccepted. This API correction does not clear an already rendered private view. |
| Guide permission projection | `getAuthenticatedMember` selects no `is_guide` or guide-stat columns. Both guide routes cast the result and read `is_guide`, so the current verified projection cannot satisfy that gate. The ordinary program creator similarly cannot infer a guide from that row. Adding a cast or broadening a shared profile response is not a safe authority design. Resolve the fresh server-side guide lookup and writer contract together. |
| Creation and joining | Ordinary and guide creation perform several separate writes; later failure can leave a partial program. Joining checks a count, inserts, then updates status without one transaction, so concurrent capacity and retry behavior are unresolved. |
| Attendance and progress | Attendance-array and member-counter writes are separate. Concurrent requests can lose updates; a partially completed operation can leave inconsistent counts. Session completion and week progression have similar separate-write risks. |
| Graduation | Membership status, guide promotion, guide statistics and program completion are separate writes. The source does not establish atomic, idempotent graduation. Repeating work can change counters again. These are source findings, not exercised production mutations. |
| Publication and direct access | The public program/guide-name projection retains its older behavior; publication/consent must still be reviewed. The historical SQL uses broadly permissive policies. The retained hosted access catalog and containment plan remain separate; no database grant, policy or stored row changed here. |

These remaining issues prevent claiming that the complete seven-week program is pilot-ready. The four-week plan and broader Circle work retain their own evidence and gates; this is not a replacement architecture or a decision to abandon the larger SoE vision.

## Evidence and limits

See [the source-bound verification receipt](guide-program-read-verification.json). The tests execute the actual TypeScript handlers/helpers and locked Supabase client against disposable PostgreSQL data, including the historical guide schema. The transport adapter supplies a bounded PostgREST-like surface and synthetic identity. It verifies membership/guide predicates, denied reads, revocation on a later request, projections, count/query errors and completed-versus-active membership selection. It does not prove hosted PostgREST/RLS, real provider identity, concurrent authorization changes or browser account retirement.

Separate actual compiled HTTP checks use loopback only: anonymous requests, a nonissued document hint, and an explicit signed-out marker with a nonissued retained bearer must be refused. The listing route must report unavailable when the server is intentionally missing credentials. The local server denies outbound networking; no API response is intercepted in that check. All owned processes are stopped and input/source/build hashes are compared afterward.

Supabase documents both [privileged service access and row policies](https://supabase.com/docs/guides/database/postgres/row-level-security) and [embedded relation/inner-join behavior](https://supabase.com/docs/guides/database/joins-and-nesting). A privileged service reader needs its own verified caller and resource authorization; these local checks do not substitute for the separately required hosted access repair. Current documentation was inspected, and the same-day changelog record remains preserved. No package or schema upgrade is part of this change.

## Preservation and rollback

No database migration is required for these source changes. Existing POST/PATCH program writers, guide creation/graduation behavior, page membership handlers, shared-chat authorization, credentials and database state are unchanged. The first-cycle invitation remains available under its existing route. A local code revert is technically possible and originals are preserved, but reverting the new read authorization would restore the identified data exposure; any rollback or deployment must preserve the access boundary. A code revert cannot undo an already disclosed response. No deployment, hosted request, invitation, purchase, installation or deletion occurs in this work.
