# Explicit local synthetic backend mode

`App.tsx` defaults to **Fixture demo — no backend connection**. Its original fixture controls remain available only in that mode. Set `EXPO_PUBLIC_SOE_DEMO_MODE=fixture` explicitly for the same fallback. A failed local connection never silently becomes a fixture connection.

With the existing backend running separately on `127.0.0.1:8787`, start an installed native development environment with:

```sh
EXPO_PUBLIC_SOE_DEMO_MODE=local-http EXPO_PUBLIC_SOE_DEMO_ORIGIN=http://127.0.0.1:8787 npm start
```

These are process-local development settings, not secrets. No `.env` or global configuration is required. Release builds reject local HTTP mode. Other origins, paths, query strings, credentials in URLs, and unknown modes are blocked before network calls. The app uses only the existing fictional Jules session, kept in memory. Ada's host acceptance and host disclosure come from a separate synthetic session against the existing backend; this guest UI has no host-accept screen and never scripts the other person's consent in HTTP mode.

The shared session factory and activity callback are exercised by `prototypes/soe-join-revoke/integration/native-session.test.mts`. The callback immediately clears contact on background/inactive. Foreground refresh can restore it only after a fresh authorized read. Unconfirmed revoke responses stay unknown and hidden until the original key is reconciled.

The controller also rejects plan versions older than confirmed write/lookup receipts, latches recognized session expiry until a new controller/session, and clears contact immediately when a revoke is queued behind a read. HTTP-mode write keys include an in-memory session namespace to avoid replaying an earlier app session's consent. Deterministic in-process controller fault tests cover these boundaries; they do not establish native networking or lifecycle behavior. Remote revocation becomes known on a later fresh read; there is no automatic revocation polling or recall of previously returned copies.

For Android, `127.0.0.1` refers to the emulator/device itself. A future approved runtime setup must provide a deliberate local port route to the Mac; no route or SDK is configured by this change. iOS/Android native fetch and lifecycle behavior still require device/simulator validation. The installed React Native fetch polyfill does not enforce Node's redirect option; the adapter also checks response origins before accepting data. Node redirect checks are not claimed as native runtime evidence.

Initial validation covered source wiring, local HTTP tests, typechecking and static exports. The later scoped Android emulator run is recorded in the workspace artifact `soe-android-runtime-result.json`, with separate native lifecycle and controller evidence. It does not establish manual UI/pixel verification, iOS behavior, a hosted service, production readiness, persistent storage, receipt-chain integration or deployment.

Approved Android runtime validation uses the workspace-local toolchain and the separate `soe-android-runtime-gateway.mjs` test process. Set `EXPO_PUBLIC_SOE_RUNTIME_CHECKS=1` only for that process to reveal the labeled Android test button; its runner resets the disposable synthetic backend between cases. `EXPO_PUBLIC_SOE_RUNTIME_AUDIT=1` adds development console records of phase and held-contact booleans for actual AppState transitions, without recording relay values or tokens. Both controls require `__DEV__`; no product host-consent workflow is added. These are instrumentation, and their presence does not establish that native testing has passed; consult the resulting runtime receipts.

## Embedded synthetic Android variant

The separate `synthetic` build type uses application ID `com.anonymous.soesyntheticdemo.embedded`, label **SoE SYNTHETIC · embedded**, an APK asset bundle, and native developer support disabled. Its JavaScript is deliberately compiled with `--dev true` only for this named build type, so existing development-only fixture/loopback guards still apply. Ordinary release config keeps `SOE_EMBEDDED_SYNTHETIC=false`, `DEBUG=false` and bundling `--dev false`.

Build with the same explicit local HTTP and runtime-check/audit environment values above, `EXPO_PUBLIC_SOE_RUNTIME_JOURNEY=0`, and `./gradlew :app:assembleSynthetic :app:assembleSyntheticAndroidTest -PsoeTestBuildType=synthetic -PreactNativeArchitectures=arm64-v8a`. Normal launches do not script Ada. The native test runner supplies the synthetic-only launch property `soe.synthetic.autorun=true` to run the disposable journey. The built-in checks need the local test gateway on `127.0.0.1:8787`; JavaScript embedding removes Metro at runtime, not the backend.

Only this build installs `SyntheticHttpPolicy` for React Native fetch: explicit HTTP origin `127.0.0.1:8787`, no redirects, and no off-origin initial request. Controlled 301/302/303/307/308 fixtures cover same-origin/cross-origin GET and POST attempts using noncredential canaries. The Android runner uses a no-credential default-client positive control, real ActivityScenario lifecycle changes, owned-view text assertions, and PixelCopy of its own app window. Workspace artifact `soe-embedded-result.json` contains the exact APK/bundle/source hashes, native results and limitations. The previous Metro-based APK and evidence are preserved separately.

## Repair verification after the independent review

Run the gateway from this repository with explicit evidence output:

```sh
node local-test-tools/soe-android-runtime-gateway.mjs --output-dir /absolute/path/to/evidence --prefix soe-repair --port 8787 --trap-port 8788
```

The gateway resolves imports relative to its own file and accepts an unrelated working directory. Its output directory is mandatory. `node --test local-test-tools/gateway-relocation.test.mjs` exercises dynamic loopback ports and verifies output outside the source tree.

The controller keeps an explicit metadata-only plan copy with `other.contact=null`; only `RelayMemory` may hold contact for an authorized read. Release/expiry/offline/error/stale handling drops the controller's remaining contact reference. This removes JavaScript references; it does not promise secure heap erasure, clearing transport buffers, or recall of previously returned screens. Full read/write/lookup variants are validated before advancing version barriers or promoting receipts. Versions must be positive safe integers, and plan/visibility IDs and nested versions must match the requested resource and top-level version. A malformed write result stays ambiguous for reconciliation; a malformed lookup cannot promote it.

`repair-regressions.test.mts` contains 26 tests. Sixteen fail on the preserved pre-repair source. Removing only revoke-intent `readEpoch` invalidation from repaired source makes the strengthened delayed-return test fail, and also makes the corresponding native assertion body fail under its explicitly labeled Node shim. This sensitivity analysis is not native runtime evidence.

The current native runner defines 18 embedded controller/transport checks (11 without embedded transport policy checks), including malformed read and receipt cases. One separate Android ActivityScenario journey exercises real background/resume, owned-view assertions and owned-window PixelCopy. These are not 18 manual or full UI journeys, and scripted fictional host consent does not establish a human consent flow. Each redirect case now asserts exactly one arrival at its origin fixture and zero destination requests. Current execution status and exact artifact hashes are in the repair handoff; prior native receipts apply only to their older APK.

The synthetic variant uses the public template debug signing key. The ordinary release template still names `signingConfigs.debug`; no production build or signing readiness is certified. No iOS, persistent pilot storage, hosted deployment, real-user consent flow or production security validation is established.
