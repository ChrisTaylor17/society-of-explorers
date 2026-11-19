# Native Circle directory transport

The optional `circle-discovery-v1` public capability exposes `publicTransport` separately from the authenticated member transport. Old version-2 native configurations remain valid without this capability. The app must not fall back to sending a member bearer when the public channel is unavailable.

Public requests permit only `GET /api/circles`, with empty caller headers, no body, omitted credentials, no cache and rejected redirects. The JavaScript boundary uses the canonical discovery request parser and serializer: bounded filters, pinned reading context, at most 25 results and an opaque cursor of at most 4,096 characters. Unknown, duplicate, noncanonical, empty-default and malformed query fields are rejected before native allocation. Android independently bounds the wire fields and their order; the JavaScript/server validators additionally check the pinned book/edition registry and reading range.

Authenticated additions are limited to:

- `GET /api/circles/mine`, with only an optional `after=UUID` and default page size 25.
- `GET /api/circles/:circleId` and `GET /api/circles/:circleId/membership`, without query parameters.
- `POST /api/circles/:circleId/join` and `POST /api/circles/:circleId/leave`, without query parameters. The body must be compact JSON containing exactly a UUID `requestId` and a nonnegative safe-integer `expectedRevision`; either property order is accepted. Duplicate/extra fields and noncanonical numeric spellings are refused.

The separate native `sendPublic` method accepts only URL and method. It adds no bearer, API key or cookie. All channels share the existing native account generation, single-use handle, cancellation, response size and single-HTTP-transmission boundaries. The owned-auth wrapper retires public requests and retained response bodies with the account. A canceled request may already have reached the server; cancellation does not undo membership changes.

The new policy suite has 12 checks: 11 execute actual JavaScript ports/build composition against synthetic native primitives; one checks Kotlin source only. Together with existing auth, account, contributions and Android adapter/policy checks, the recorded run passes 46 tests. See `platforms/evidence/native-discovery-policy.json` for exact source/log hashes and commands. No Kotlin compilation, native installation, device secure-storage proof, live provider traffic or production acceptance is claimed.

Run from the canonical repository with the existing cached Node runtime:

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/christaylor node --require ./verification/web/scripts/deny-build-network.cjs --test platforms/tests/native-discovery-policy.test.mjs platforms/tests/native-contributions-policy.test.mjs platforms/tests/native-account-setup-policy.test.mjs platforms/tests/android-member-policy.test.mjs platforms/tests/android-member-adapter.test.mjs platforms/tests/native-auth-ports.test.mjs
```
