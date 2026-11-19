# Optional introductions — design for review

This is a proposed successor to the preserved matching experiments. It is not an implemented consent system, a validated compatibility measure, an announced service or authority to apply database changes. The first pilot can still bring people together through published profiles, reading salons and host-led introductions.

## Start with an understandable offer

“Would you like suggestions of other participants who share the interests and meeting availability you choose below?”

The review screen should show the exact fields used, the community and audience, what the other participant can see, how long participation lasts, and how to stop it. Participation starts off and is separate from profile publication, joining a salon, answering a daily question and per-message AI moderation permission. Existing questionnaire, measurement and projection rows do not establish current permission.

Start with declared reading interests, projects and availability. Explain a suggestion with those shared declarations. Do not label a person’s politics, philosophical trust, compatibility or character from answer length, response counts, scans or physiological measurements. Any proposed new measure needs its own research, data choice and validation before product use.

## Authority and lifecycle

| Step | Required behavior |
| --- | --- |
| Review | The signed-in person sees the current purpose, selected fields, audience and participation version. No private reflection, reporter note or measurement is preselected. |
| Opt in | A same-origin, account-bound write records the exact reviewed version and field projection. Server authority binds it to the person and current community membership. An idempotent retry cannot create a second decision. |
| Change | A material purpose, input or audience change requires a new decision. Updating a public profile does not silently expand matching permission. |
| Suggest | Both participants must still be eligible, participating and unblocked when the suggestion is produced. Bounded output explains declared common interests; a GET creates no pair or invitation. |
| Introduce | Each participant separately accepts a specific introduction. A single person cannot accept for both or turn a suggestion into a scheduled meeting. Create a shared conversation only after both decisions still pass an atomic recheck. |
| Decline or stop | Declining creates no penalty. Withdrawal immediately excludes new suggestions and cancels pending introductions. Explain that it cannot retract information someone already saw. |
| Expire | Participation and pending introductions expire. The duration, reminder behavior and renewal copy remain product decisions; no automatic indefinite renewal is assumed. |

Records need the person, purpose/version, community scope, reviewed field revision, decision time, withdrawal/expiry state and an audit reference. Avoid storing duplicate private text merely to prove permission. Concurrency checks must reject stale versions, membership loss, new blocks and withdrawal between suggestion and acceptance. Reopening any route requires these checks at the service layer even if database RLS is correct.

No AI provider is needed for the initial declared-interest design. Adding one would require a separate exact-data and named-provider choice, plus cost limits and a review of what is retained.

## Existing records, history and migration

The release boundary does not delete or alter existing profiles, questions, matches or conversation records. Historical matching code remains in source, but its HTTP handlers and internal writer are unavailable in the local pilot build.

The old history endpoint also joins a peer’s name without the new participation contract. It therefore stays unavailable with the other legacy operations. Before offering a replacement, define a participant-only history and export view: each person’s own decisions, a bounded introduction status and only peer information they are still authorized to receive. Withdrawal, blocking and another person’s privacy must be considered independently of the requester’s right to inspect their own records. Retention and deletion rules still need owner and qualified professional review where applicable; this document does not set them.

Do not backfill current opt-in from a table name, old match, daily-answer count or previous publication setting. A migration may preserve legacy records as inactive historical records; it must not initiate introductions or send notifications. Review any new tables against backup, recovery, export and deletion inventories before use.

## Evidence required before reopening

Use fictional accounts first to test mismatched identities, nonmembers, stale decisions, blocked peers, withdrawal races, duplicate acceptance, expiration, bounded output and failed transactions. Then test independent PostgreSQL sessions and the actual API on an isolated coherent restore. Physical-client acceptance and controlled real-account testing remain separate gates.

The current database containment candidate is still unapplied. Reopening requires reviewed scoring claims, a complete consent/withdrawal interface, an approved history/export decision, coherent recovery and explicit hosted cutover approval. A configuration flag or a changed link cannot supply those requirements.
