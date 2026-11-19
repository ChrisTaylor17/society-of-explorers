# Local mobile controller + existing backend check

Run from the repository root with the already installed Node 22.22.1:

```sh
SOE_LOCAL_E2E_TRACE=/tmp/soe-mobile-backend-trace.json node --experimental-transform-types --test prototypes/soe-join-revoke/integration/mobile-http.test.mts
```

No dependency install is required. The tests start the existing backend on ephemeral `127.0.0.1` ports, use its synthetic Jules/Ada/Mina sessions, and close every server afterwards. The actual reviewed mobile controller and shell action dispatcher make HTTP calls through the small local adapter. The host-accept operation uses the existing backend route because the mobile UI does not yet have that action.

The adapter accepts only an explicit numeric loopback origin, checks the prototype health response, requests redirect rejection, checks response origins, holds synthetic sessions in memory, and preserves ambiguous write outcomes for lookup. Native `App.tsx` now selects this same adapter only through the explicit development configuration in `mobile/native/LOCAL_DEVELOPMENT.md`; its default remains the labeled fixture. The original production HTTP boundary remains disabled. No real participant data, external backend writes, native app build, UI launch, hosted integration or production readiness is claimed.

Run all integration files with `node --experimental-transform-types --test --test-timeout=15000 prototypes/soe-join-revoke/integration/*.test.mts`. Node's redirect rejection is covered by an actual HTTP redirect trap; native fetch/lifecycle behavior remains unvalidated until an approved emulator/simulator setup exists.

`controller-adversarial.test.mts` adds deterministic response delivery faults around the real controller and adapter. Its injected fetcher uses the unchanged synthetic backend world in-process; it does not open sockets and is not a native fetch test. It covers loss before/after join, grant and revoke commit; delayed writes/reads; duplicate actions and replayed responses; actor and session isolation; expiry; and background/foreground interleavings. Confirmed write and lookup versions now advance the controller's plan high-water mark. Recognized expiry is terminal for that controller. Revoke intent clears and invalidates an older in-flight read immediately. Native HTTP sessions use separate idempotency namespaces so new consent does not replay a previous session's revoked grant.

The stale-response guarantee is relative to a confirmed mutation or a newer observed server version. This prototype has no push channel, read-freshness challenge or bounded revocation polling: another actor's unseen revoke cannot invalidate an already authorized response or recall an already returned copy. Versions are assumed coherent and monotonically increasing within the single in-memory backend instance; process restart/reseed recovery is outside this local demonstration.

The first test records local revoke/next-refresh delay and confirms eleven reads without contact after revocation. That measurement is for this local process; it is not a polling or distributed-system guarantee. A previously returned copy remains possible.

The existing backend files are copied without changes from patch `soe-join-revoke-0529ecb.patch` (SHA-256 `4f03491f964f8487e4254c4efebac66c4b01b95f602df019297f858130551d05`); all 21 file Git blobs match source commit `0529ecbea46f76603a411e44d1483a808c1fb82a`. The controller and shell start from mobile commit `916978c489eb5cd4cc1ceaf27ffc62d157a3eff2`, with the local adversarial corrections described above. Existing mobile tests are unchanged.
