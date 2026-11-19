# Native saved-reading transport

The optional trusted native capability `savedReadingPolicy: 'owner-reading-v1'` exposes `savedReadingTransport` through member ports, owned-auth composition and `ExistingMemberAccountConfig`. An older module without that capability does not expose the port. It uses the existing authenticated native `send` method, account generation and request handles; no new native method or provider operation is introduced.

The private channel allows only:

```text
GET /api/great-books/progress
GET /api/great-books/progress?bookId=<canonical catalog slug>
POST /api/great-books/progress
```

The collection read covers the canonical eight-book catalog. A selected-book read accepts one literal `bookId` query in canonical encoding. Empty, duplicated, unknown, alias or identity queries are refused. POST accepts no query. All requests require a bearer, omitted credentials, no-store caching and redirect rejection. No API key or cookie input is allowed.

The POST body is limited to 4,096 UTF-8 bytes and must match the shared parser and serializer exactly. Save requires the complete fixed-order envelope:

```text
{expectedMemberId, expectedRevision, bookId, action: 'save', editionId, blockIndex, completed}
```

Remove requires exactly:

```text
{expectedMemberId, expectedRevision, bookId, action: 'remove'}
```

The member UUID is lowercase, the revision is a nonnegative safe integer, and completion is an explicit boolean for every save. JavaScript additionally verifies the current pinned edition and its actual block range. Partial/legacy upsert bodies, member overrides, extra fields, duplicate JSON keys, alternate key order or whitespace, wrong edition pins and invalid positions are rejected before native handle allocation.

Android independently enforces the exact route, optional canonical book query, eight catalog IDs, actor/revision fields, ordered save/remove JSON, required completion, 4 KiB bound, edition wire format and block index below 100,000. JavaScript and the canonical server enforce the exact edition pin and actual block count. Existing member/provider body bounds remain unchanged; the separate profile write still has its existing 64 KiB bound.

Circle discovery, anonymous passage, public profile, private profile and ordinary member ports continue to reject saved-reading routes. The saved-reading port rejects their routes. Anonymous passage requests remain credential-free: saving a private position does not change how text is fetched or confer Circle membership.

Cancellation, deadlines, exact response URLs, redirect rejection, one-megabyte responses, single-use native handles and one physical HTTP transmission retain their existing safeguards. Account reset or owned-auth retirement cancels pending operations and prevents later JSON reads from retained responses. The transport never retries a save or remove automatically. It does not interpret current-state replies as proof that an earlier request completed; the saved-reading controller and server CAS contract handle that distinction.

Local verification passes 84 affected policy checks: 14 new saved-reading checks (13 actual JavaScript/composition executions with synthetic native primitives, one Kotlin static source check) and the unchanged prior 70 transport checks. Scoped lint passes. The exact command, source hashes and log hashes are in `platforms/evidence/native-saved-reading-policy.json`. This is local verification only: no Kotlin compilation, Codegen, native installation, device execution, provider traffic or production acceptance is claimed.

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/christaylor node --require ./verification/web/scripts/deny-build-network.cjs --test platforms/tests/native-saved-reading-policy.test.mjs platforms/tests/native-profile-policy.test.mjs platforms/tests/native-passage-policy.test.mjs platforms/tests/native-discovery-policy.test.mjs platforms/tests/native-contributions-policy.test.mjs platforms/tests/native-account-setup-policy.test.mjs platforms/tests/android-member-policy.test.mjs platforms/tests/android-member-adapter.test.mjs platforms/tests/native-auth-ports.test.mjs
```
