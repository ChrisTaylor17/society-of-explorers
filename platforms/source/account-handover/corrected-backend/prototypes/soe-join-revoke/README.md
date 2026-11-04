# Join and revoke prototype

Working local prototype for one Society of Explorers path: discover a plan, request to join, host acceptance, mutual contact grants, then revoke future contact access.

This is not a hosted test and not production. It keeps no disk state. Synthetic people only. Nothing is on a chain, and there is no token.

## What already existed

Meridian, on `cursor/chain-link-check-52d5` (`376426b`, pull request 81) and its parent `cursor/meridian-live-demo-cbde`, already decides contact visibility. `meridian/src/lib/consent.ts` is that rule. `grantContact` and `revokePermission` in `meridian/src/lib/domain.ts` are the grant and revoke operations. The web demo reaches them through form actions and a `meridian_session` cookie. Sessions expire after seven days, and a new sign-in replaces that person's older tokens. Passcode checks live in `meridian/src/lib/passcode.ts`.

That server does not have a guest "request to join" route, a JSON idempotency store, account deletion, or a discover list. The host invites, and the guest answers. Contact is omitted until both contact grants are active. Revocation stops the next read. It does not claim to recall a relay that was already returned.

The synthetic mobile client (`cursor/soe-mobile-client-cc78`, commit `e94e182`, not on the remote) talks to an in-process fixture that imports `contactDisclosure`. Its HTTP adapter is disabled. It does not send a bearer token. This prototype speaks the fixture's read and write shapes over HTTP so a later adapter can call them. It does not change that branch, pull request 81, or pull request 82.

`src/consent.ts` and `src/passcode.ts` are byte copies of those Meridian files from `376426b`. The tests lock the file hashes. Disclosure reasons are the Meridian strings.

## Run and test

From this directory, with Node 22.14 or newer:

```bash
npm test
npm start
```

`npm test` runs the local suite. `npm start` listens on `127.0.0.1:8787`. `npm run trace` plays the path once and writes an HTTP trace under `/tmp/soe-join-revoke-trace.txt`. No install step and no network service.

Sign-in is `POST /api/session` with a synthetic magic name and the local passcode in `src/synthetic.js`. Later calls send `Authorization: Bearer <token>`. A token lasts seven days. A new sign-in for the same person replaces older tokens, matching Meridian `signIn`.

| Mobile port | HTTP |
| --- | --- |
| `discover` | `GET /api/plans` |
| `plan` | `GET /api/plans/:id` |
| `visibility` | `GET /api/plans/:id/visibility` |
| `requestJoin` | `POST /api/writes/join` |
| host accept (not sent by the current client) | `POST /api/writes/accept` |
| `acceptDisclosure` | `POST /api/writes/grant` |
| `revokeContact` | `POST /api/writes/revoke` |
| `lookup` | `POST /api/lookup` |
| account deletion (not in the client) | `POST /api/writes/delete-account` |

Writes use the client's envelope: `personId`, `idempotencyKey`, `payloadHash`, and `body`. The hash is SHA-256 of the canonical body, the same bytes the mobile client hashes. Only the plan host can accept a join request. A relay is returned only to the two participants, and only while both contact grants are active. After a revoke, later reads omit it.

Revoking stops future contact access. It cannot erase information someone already saw.

## Limitations

Label: working local prototype.

- One process, in memory. A restart drops sessions, joins, and grants.
- Not deployed. Do not point the public site or a preview at it.
- The mobile HTTP adapter does not call this server yet.
- Meridian's Ed25519 receipt chain, rate limits, and SQLite or Blob store are not wired in. Grants here do not append that chain.
- Account deletion and guest join requests are new. Meridian still has host invites and no deletion API.
- The passcodes in `src/synthetic.js` are fixture strings for this process. They are not provisioned secrets and must not be reused on a shared host.
- When the other person revokes, the reason text is Meridian's existing sentence: "You accepted disclosure. It stays hidden until they accept too." The person who revoked gets "You revoked contact, so the relay is hidden even though they had accepted."
- A single in-process queue serializes plan reads and writes. That is what makes the race tests deterministic. It is not a multi-instance lock.
- Test-only `x-soe-fault` headers exist when the suite constructs the world. `npm start` ignores them.

A hosted test would need a private staging process, a durable store with a real transaction around accept, grant, and revoke, server-side session storage, the existing Meridian rate limits, and a decision about whether guest join requests replace host invites. It would also need the mobile adapter pointed at that host. It would not need a new chain, a new token, or a DNS change on the public site.

## Local safety extension

`POST /api/writes/block` now enforces an authenticated participant block before new joins, acceptance, grants and contact reads. It uses the same serialized world and idempotency store. See [SAFETY_API.md](SAFETY_API.md) for exact responses, race semantics, existing tombstone deletion behavior and unsupported report/contact-purge endpoints. This remains a disposable synthetic backend with no durable blocking or live moderation operation.

## Optional local durability

The later local milestone adds opt-in built-in Node SQLite checkpoints via an explicit `SOE_DATABASE_PATH`. Existing in-memory mode remains available. See [DURABILITY.md](DURABILITY.md) for transaction/crash boundaries, storage contents, schema/migration assumptions and remaining pilot blockers. Earlier no-persistence statements describe the default ephemeral mode.

## Local report submission follow-up

The later version2 checkpoint adds bounded authenticated report creation, durable idempotency and minimal submitted receipts. No participant report-read or live moderation operation exists. See [REPORTS_API.md](REPORTS_API.md) for SQLite-only configuration, explicit migration from version1, privacy, quota, staffing and retention limitations. Earlier unsupported-report statements describe the prior milestones/default memory mode.
