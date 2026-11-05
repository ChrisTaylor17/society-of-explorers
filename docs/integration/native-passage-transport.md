# Native anonymous passage transport

The optional native `readingPolicy: 'pinned-passage-v1'` capability exposes `passageTransport` through the member ports, owned-auth composition and `ExistingMemberAccountConfig`. It reuses the existing `sendPublic(id, { url, method: 'GET' })` engine. An older module without this capability continues to provide its existing discovery connection; it cannot open the passage channel.

The passage transport permits only:

```text
GET /api/great-books/passage?book=<catalogId>&edition=<pinnedEdition>&block=<zeroBasedIndex>
```

The parameters must appear exactly in that order with canonical encoding. The JavaScript boundary checks the current `passageIndexPin`, exact edition equality and block range before native handle allocation. Headers, body, offsets, identity fields, Circle identifiers and unrelated query parameters are refused. The discovery transport remains limited to Circle discovery, and the authenticated member transport does not accept this public passage endpoint.

Android independently requires the exact anonymous path, ordered fields, canonical encoding, bounded book/edition wire formats and a nonnegative block index no greater than 100,000. The JavaScript and canonical server layers enforce the exact pinned edition and its actual block count. The native engine sends no bearer, API key or cookie; it retains the account-generation, single-use handle, one-HTTP-transmission, cancellation, exact-response-URL, redirect rejection and one-megabyte response limits. Account retirement also prevents reading a retained passage response.

Local evidence: 10 new policy checks pass, comprising nine executions of actual JavaScript ports/composition with synthetic native primitives and one Kotlin source check. The combined affected suite passes 56 tests; scoped lint passes. Exact commands, log hashes and source hashes are in `platforms/evidence/native-passage-policy.json`. No Kotlin compilation, native installation, device execution, live provider traffic or production acceptance is claimed.

Run the combined checks from the canonical repository using the cached runtime:

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/christaylor node --require ./verification/web/scripts/deny-build-network.cjs --test platforms/tests/native-passage-policy.test.mjs platforms/tests/native-discovery-policy.test.mjs platforms/tests/native-contributions-policy.test.mjs platforms/tests/native-account-setup-policy.test.mjs platforms/tests/android-member-policy.test.mjs platforms/tests/android-member-adapter.test.mjs platforms/tests/native-auth-ports.test.mjs
```
