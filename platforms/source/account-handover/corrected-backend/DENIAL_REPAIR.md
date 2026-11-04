# S1: preserve known denial across older response replay

This is a separate local repair over the213-file safety archive SHA-256 `dec58a8b65aba46c18cb8d1eba29118f009d55d16ded78c425cdf522a45d523d`. Earlier safety/repair source trees, patches, APKs and evidence remain unchanged.

## Verified cause

After mutual consent, a valid visible plan response has version5. A block changes the server plan to version6. The old backend returned an unversioned `rejected` read. The adapter could not validate it as a read variant and converted it to generic `unavailable`. The client cleared contact but kept its high-water mark at5. A later delivery wrapper replaying the captured version5 response was then accepted as current. The independent review reproduced this over real loopback HTTP. Fresh server reads still denied access; no fresh server authorization bypass was demonstrated.

## Protocol and controller change

Blocked plan and visibility reads retain HTTP403 and `status: rejected`, but now include the requested `planId`, current positive safe-integer `version` and generic `error`. No blocker identity, block direction, participant contact or block-record data is returned.

```json
{"status":"rejected","planId":"plan-riverside","version":6,"error":"This plan is unavailable."}
```

The shared read validator accepts this variant only for plan/visibility reads with a matching requested plan ID, valid version and string error. The adapter's existing shared-validation path preserves it. Discover does not accept this plan-denial variant. Legacy/unversioned or malformed rejection packets remain unsupported read shapes; they are not treated as valid denial evidence.

The controller records both the highest observed version and a per-plan/per-viewer denied-through version using monotonic maxima. A successful plan or visibility response must be at least as new as the ordinary high-water mark **and strictly newer than every validated denial observed for that resource**. Contradictory success at the denied version is rejected as well as older success. Background/release behavior, terminal recognized expiry, write/lookup barriers, malformed-version validation and metadata-only plan storage are retained.

A validated denial clears held contact and uses existing failed-read handling, preserving an unresolved write's unknown/pending status. A transient network failure or generic unavailability clears contact without creating authoritative denial evidence, so normal same-version recovery remains possible. Older denials cannot lower either watermark.

A strictly newer, coherent success can supersede a prior denial under this protocol. The recovery test injects such a packet to exercise that rule; it is not an implemented unblock operation or proof of authentic freshness. Server enforcement still has no unblock endpoint. Shape/version validation is not cryptographic response authentication, and the in-memory process/reset/durability limitations remain.

## Validation and sensitivity

From this source root, with Node22.14+ and numeric loopback sockets permitted:

```sh
node --experimental-transform-types --test --test-timeout=15000 prototypes/soe-join-revoke/integration/denial-replay.test.mts
#6 pass: plan/visibility replays; denial ordering; malformed wire/injected-port denial; transient recovery.
node --experimental-transform-types --test --test-timeout=15000 prototypes/soe-join-revoke/integration/*.test.mts
#68 pass, including the previous malformed-version, revoke, expiry and safety checks.
cd prototypes/soe-join-revoke
npm test
#53 backend cases pass.
```

The exact same6-test file on the preserved safety baseline yields1 pass/5 fail. The failures include actual contact restoration after observed denial. In an isolated repaired copy, replacing only the plan-read denial-observation call with ordinary fail-closed handling yields2 pass/4 fail. Removing only the equal-version denial comparison yields3 pass/3 fail. Neither mutation touches the delivered source. The mobile31-test suite and mobile/native typechecks also pass using existing local dependencies; no packages were installed.

This milestone does not build a new APK or rerun native instrumentation. Existing APK/native results apply to their prior source and backend combinations, not this changed controller/protocol. The native TypeScript check establishes source compatibility only. There is no production, real-user-pilot, physical-device, iOS, durable-storage or secure-heap-erasure clearance.

See the separate denial-repair handoff/evidence for hashes, failing-before/passing-after logs, exact mutations, source reconstruction and preservation checks. The prior SAFETY_README.md and REPAIR_README.md describe earlier milestones.
