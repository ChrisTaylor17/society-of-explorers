# Native profile transport

Two optional trusted native capabilities expose separate transports through member ports, owned-auth composition and `ExistingMemberAccountConfig`:

| Capability | Port | Exact operation |
| --- | --- | --- |
| `profilePolicy: 'owner-profile-v1'` | `profileTransport` | Authenticated `GET` or `POST /api/members/profile` |
| `publicProfilePolicy: 'published-profile-v1'` | `publicProfileTransport` | Anonymous `GET /api/explorer/<lowercase UUID>` |

Older modules without either capability do not expose its port. The private port uses the existing `send` engine; the public port requires the existing `sendPublic` engine. Member, Circle discovery and passage transports continue to reject both new routes. Profile transports reject all other routes. Queries, fragments, normalized alternate URLs, cross-origin requests and redirects are refused before native request allocation.

Private requests carry only the verified bearer and, for POST, `Content-Type: application/json`. Public requests accept no headers or body and use no bearer, API key or cookie. Both require omitted credentials, no-store caching and redirect rejection.

The native private write contract is deliberately narrower than the web API's partial patch contract. It accepts all seven normalized authored fields plus an explicit visibility choice, in this exact compact JSON key order:

```json
{"expectedMemberId":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","expectedRevision":0,"patch":{"displayName":"Explorer","bio":"","discipline":"","skills":[],"projectDescription":"","seeking":"","philosophy":"","visibility":"private"}}
```

JavaScript reuses `parseProfileMutation`, requires the full patch, and compares its ordered normalized serialization with the supplied bytes. The member ID must already be lowercase. Revision must be a nonnegative safe integer. Duplicate keys, unknown or protected fields, partial patches, extra whitespace, alternate key ordering, invalid Unicode and nonnormalized values are refused. Android independently enforces the same exact envelope, field bounds, normalization and canonical serialization. UTF-16 field limits match the shared profile contract. The profile POST alone permits up to 65,536 UTF-8 bytes so valid multibyte profiles fit; existing member and provider request limits remain 16,384 bytes.

The existing native generation, single-use handle, one physical HTTP transmission, cancellation, bounded deadline, exact response URL and one-megabyte reply protections remain shared. Account reset or owned-auth retirement cancels pending operations and prevents reading retained profile JSON. A lost write reply never causes an automatic transport resend. The profile API uses actor/revision compare-and-set rather than a Circle request receipt; the controller must handle uncertainty and fresh readback explicitly.

Local evidence: the combined affected policy suite passes 70 checks, including 14 new profile checks (13 executions of the actual JavaScript ports/composition with synthetic native primitives and one Kotlin static source check). Scoped lint passes. Exact commands, source bindings and log hashes are recorded in `platforms/evidence/native-profile-policy.json`. These checks do not compile Kotlin, run a device, contact a provider, install dependencies or establish production acceptance.

Run the affected policy checks from the canonical repository:

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/christaylor node --require ./verification/web/scripts/deny-build-network.cjs --test platforms/tests/native-profile-policy.test.mjs platforms/tests/native-passage-policy.test.mjs platforms/tests/native-discovery-policy.test.mjs platforms/tests/native-contributions-policy.test.mjs platforms/tests/native-account-setup-policy.test.mjs platforms/tests/android-member-policy.test.mjs platforms/tests/android-member-adapter.test.mjs platforms/tests/native-auth-ports.test.mjs
```
