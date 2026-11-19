# Synthetic participant-blocking milestone

This change extends the existing `createWorld` backend. It adds no second server, repository, identity system, consent implementation, database or moderation operation. All tests use the three fictional fixtures. The prior repaired mobile source and native APK remain unchanged.

## Inspection and bounded scope

| Workflow | Before | This milestone |
| --- | --- | --- |
| Participant blocking | No endpoint or enforcement | Adds authenticated block and server-side enforcement |
| Report submission | No endpoint, storage or moderator access model | Explicitly unsupported; no report is received or queued |
| Account deletion | Existing authenticated `delete-account` tombstone, pending invitation withdrawal and future contact denial | Existing behavior retained and tested adversarially |
| Contact purging | No separate endpoint or physical purge | Explicitly unsupported; revoking access is not erasing profile data |

The existing Next.js Meridian source is unchanged. This milestone targets the already integrated synthetic `prototypes/soe-join-revoke` backend; the existing vendored Meridian `contactDisclosure` and passcode modules are unchanged.

## API contract

Use the existing synthetic bearer session and idempotent-write envelope:

`POST /api/writes/block`

```json
{
  "personId": "jules",
  "idempotencyKey": "block-intent-1",
  "payloadHash": "<SHA-256 of canonical body from src/hash.js>",
  "body": {"otherId": "ada"}
}
```

Only the session's own person may be the actor. `body` must contain exactly one `otherId` string naming a different, nondeleted fixture person. No `blockerId`, target account deletion, moderator identity or impersonation field is accepted.

| Request/outcome | HTTP and body |
| --- | --- |
| First accepted block | 200, `status: committed`, positive `version`, `data: {blocked: true, otherId, limit}` |
| Same actor/endpoint/key/body | Replays the original committed receipt without another mutation |
| Same stored key with another body | 409, `status: conflict` |
| Another key for the same already-blocked target | 200 committed; does not undo the block or reapply invitation/grant changes |
| Missing, replaced or expired bearer session | 401, `status: expired-session` |
| Forged actor, self/unknown/deleted target, wrong body shape/hash | 403, `status: rejected` |
| `POST /api/lookup` with actor's original endpoint/key/hash | Existing person-scoped lookup returns the stored block result; never sends another block |
| Fault-test loss before storage | 202 ambiguous; lookup absent; block is not assumed to have occurred |
| Fault-test loss after storage | 202 ambiguous; lookup recorded; block is already enforced |
| `/api/writes/report`, `/api/writes/delete-contact`, `/api/writes/unblock` | 404, `status: unavailable`; no operation is performed |

Only committed writes enter the existing idempotency map. Test-only delivery faults remain disabled in the normal server. As for existing account deletion, the receipt version is the highest current plan version; it is mutation history, not access authorization or an independent resource-version/checkpoint protocol.

## Enforcement

A block record belongs to its authenticated creator and is directional in storage. Either person's record denies interaction in both directions. No unblock operation is added.

Within the existing single serialized world operation, the backend records the block, withdraws pending **and accepted** invitations between that host/guest pair, revokes active contact grants in both directions, and advances each affected plan version once. This frees the prototype's single invitation seat. Unrelated participants may still join and use the unchanged mutual-consent rule.

Every fresh join, host acceptance and contact grant checks the block. Discover omits a plan whose host is blocked with the viewer. The blocked guest's direct plan and visibility reads return 403 with a generic unavailability message. A host may still read their own public plan or a later unrelated participant; the blocked participant's contact is never returned. Pair snapshots also deny contact before calling the unchanged consent rule.

A revoke racing a block may commit first, or return the existing 'already revoked' rejection after the block revoked it. Old committed join/accept/grant receipts can still replay as history, but cannot reinsert invitations, reactivate grants or authorize contact. The existing ownership checks still reject cross-user revokes/deletes/lookups.

Tests force both queue orderings for block versus join/accept/grant/revoke, and also send concurrent HTTP operations and outsider reads. A read authorized before the block may already have returned a copy; the server cannot recall it. Later reads enforce the block. The existing mobile HTTP adapter fails closed on the next blocked refresh and drops held contact. No background push, automatic polling delay or response-time guarantee is added.

## Existing deletion and remaining architecture

Account deletion still disables sign-in and later participant access, closes a deleted host's plan, withdraws a pending guest request and revokes the deleting person's active outgoing grants. It leaves a tombstone and can retain the stored profile/relay/passcode fields and accepted-invitation history in the in-memory world. It is **not** physical contact erasure. A retained accepted invitation is not reallocated by this existing deletion policy; block withdrawal is a separate explicit rule. Previously returned copies remain outside server control.

Blocks, sessions, invitations, grants and idempotency records live in the same process-local world. Restart/reset loses them. The single queue is not a multi-instance transaction or durable lock. The fixed one-plan fixture does not establish multi-plan/production behavior. A durable data model, transaction/locking strategy, retention and deletion policy, real identity/abuse controls, and a moderator authorization/delivery workflow remain launch gates. No report intake or real moderation response is claimed.

## Reproduce and review

From this backend directory with Node22.14+ and local sockets allowed:

```sh
npm test
node --experimental-strip-types --test --test-timeout=15000 tests/safety-block.test.js
node --experimental-transform-types --test --test-timeout=15000 integration/block-refresh.test.mts
```

From the source-kit root:

```sh
node --experimental-transform-types --test --test-timeout=15000 prototypes/soe-join-revoke/integration/*.test.mts
```

The focused backend file has22 tests. The unchanged baseline passes2 (existing deletion and unsupported endpoints) and fails20 because blocking is missing. The implementation passes all22. The separately executed mobile refresh test passes. Final evidence records the complete53-test backend and62-test integration runs, source hashes, patch reconstruction and a one-line join-guard mutation check. These are local synthetic tests, not production clearance. Native tests were not rerun for this backend-only milestone; previous native results apply to the prior repaired package and do not certify this new backend.

## S1 protocol follow-up

The later S1 repair keeps blocked plan/visibility reads at HTTP403 with `status: rejected`, adding `planId`, the current plan `version` and generic `error`. This is validated denial evidence in the paired updated client, which rejects successful responses at or below the denied version. Transient network failures remain distinct. See the source root's `DENIAL_REPAIR.md`; the earlier backend-only test/native scope statements above describe the preceding milestone.
