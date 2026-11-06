# Android member bridge source

The active Android application now contains an app-local `NativeSoeMember` TurboModule implementation, package registration and a typed v2 specification. This source has **not** been processed by React Native Codegen, compiled against Android/RN/OkHttp, installed, or run on a device/emulator. It does not connect the missing account/sign-in owner or configure the registered App with a member account.

## Configuration and registration

`platforms/native/package.json` configures module Codegen from `specs/` into `com.anonymous.soesyntheticdemo.member`. `SoeMemberPackage` supplies `NativeSoeMemberModule`; `MainApplication` adds that package to the existing Expo host package list. The module extends the future generated `NativeSoeMemberSpec`; generated Java/JNI are intentionally not handwritten or checked in. This follows the current [React Native module guide](https://reactnative.dev/docs/turbo-native-modules-introduction) and [typed native event guide](https://reactnative.dev/docs/the-new-architecture/native-modules-custom-events).

The only new manifest permission is `ACCESS_NETWORK_STATE`. Existing backup exclusions, release signing/identity gates and the separate synthetic-only HTTP policy remain in place.

The build accepts two **public** Gradle properties, `soeMemberOrigin` and `soeMemberStorageKey`, through the actual `android/member-config.cjs` validator. Both absent produces empty BuildConfig fields and unavailable capabilities. Partial or invalid configuration fails with a generic error. The origin must be a bounded canonical HTTPS origin with a lowercase DNS/IPv4 host, optional non-default port, and no credentials, path, trailing slash, query or fragment. The storage namespace is 1–160 ASCII letters/digits/period/underscore/hyphen. No environment, launch extra, signing key, account token or provider credential is read by that validator. These public properties do not satisfy the separate owned release descriptor gate.

## Transport and generation fencing

Capabilities report v2, the configured origin/key, the fixed redirect/storage policies and the currently ready storage generation. Every storage command and `begin(generation)` rejects a stale epoch under the shared store lock. A native handle records its epoch, is single-use, expires after 15 seconds and cannot authorize a second send. At most 32 handles exist per module transport. The bounded single storage worker queue holds at most 64 waiting operations; overload fails closed.

The member transport uses a dedicated OkHttp client, not the RN global client. It disables redirects, connection retries, cookies, cache and authenticators. An additional per-request atomic network-interceptor guard refuses a second HTTP exchange, including status-driven follow-ups. It accepts only the configured origin, current member legacy-salon GET/POST, bounded discussion archive/thread GET queries, exact single-key receipt GET, and discussion/preview POSTs without queries. Caller headers are not forwarded wholesale. Bearer, request body and response limits are 16,384 characters, 16,384 bytes and 1,048,576 bytes respectively. Responses with redirects, unexpected URLs, oversized bodies or invalid UTF-8 fail closed.

Keyed discussion support is an optional v2 extension: `requestIdPolicy: 'os-random-uuid'` plus `newRequestId(generation)` uses `UUID.randomUUID()` under the same native epoch and lock checks. The JS adapter/binding forwards this explicit port only when both are present. It never manufactures a key with browser/Hermes globals or a nonsecure random fallback. This does not alter storage generations or allocate a network request handle. Older modules remain read-only for this feature.

Native cancellation works before send, during the call, after reset and on module destruction; repeated cancellation is harmless. Native deadlines, response checks and JS lifecycle fences are complementary. Cancellation cannot recall a request that has already reached the server, and transport failure does not prove that a POST did not commit. No automatic resubmission is implemented here.

## Storage and interrupted reset

The process-wide namespace singleton serializes all store operations across module instances. It stores one AES-GCM encrypted record with the generation and three bounded slots (`session`, `pkce`, `user`) under `Context.noBackupFilesDir`. The AES key remains in Android Keystore; the namespace is authenticated as additional data. The source checks both Direct-Boot user unlock and ordinary Keyguard device lock before cached reads, storage operations and transport epoch authorization; missing services or a locked state fail closed. These checks have not run on Android. This is not a guarantee of hardware/StrongBox backing, biometric protection or resistance to a compromised application/OS. See [Android Keystore](https://developer.android.com/privacy-and-security/keystore), [UserManager unlock](https://developer.android.com/reference/android/os/UserManager#isUserUnlocked()), [Keyguard device lock](https://developer.android.com/reference/android/app/KeyguardManager#isDeviceLocked()) and [no-backup files](https://developer.android.com/reference/android/content/Context#getNoBackupFilesDir()).

Reset checks the expected generation and closes the cached record and its transports before disk work. It writes a marker containing the format version and old and new generation IDs, then replaces the encrypted record with empty slots under the new generation. The app acknowledges the clear after it verifies both writes and confirms that marker removal was synced. If a write fails, the current vault stops serving cached state. When a fresh vault opens, a committed marker takes precedence over the old ciphertext and recovery must verify an empty successor before granting access.

Android’s `AtomicFile.finishWrite` can log a failed commit without throwing. The store explicitly syncs the stream, checks for pending file replacements, compares the saved bytes with the intended bytes, and syncs the containing directory. The singleton monitor serializes these operations. [Android implementation](https://raw.githubusercontent.com/aosp-mirror/platform_frameworks_base/main/core/java/android/util/AtomicFile.java) · [Android directory sync API](https://developer.android.com/reference/android/system/Os#fsync(java.io.FileDescriptor))

The successful reset receipt concerns local account storage and epoch retirement. It does not revoke an already issued server session, recall transmitted requests, promise forensic ciphertext erasure, or prove crash durability before a reset marker has committed. A lost/failed reset receipt is an unknown outcome and needs a fresh explicit state check, not an automatic reset retry.

## Connectivity

The native callback registers before sampling the default network. Registration-time events supersede the sample; obsolete-network callbacks cannot replace the current default. Online requires both Internet and validated capabilities. Registration failure, missing capabilities and retirement yield unknown/offline. The synchronous getter exposes the current serialized state; events are notifications and JS should sample the getter again to avoid queued stale event payloads. Invalidation unregisters the callback and cancels owned requests. Network validation is an OS observation, not proof the application server is reachable. [Android network state](https://developer.android.com/develop/connectivity/network-ops/reading-network-state)

## Local proof and remaining gates

`platforms/tests/android-member-policy.test.mjs` executes the actual public-config validator and its CLI with positive, partial, malformed, normalization, injection and redacted-error cases under the startup network guard. Its remaining tests parse the real TypeScript specification and inspect actual Gradle/XML/Kotlin source for registration and security invariants. Those tests are explicitly marked **static**; they do not execute Kotlin, Codegen, Keystore, OkHttp or Android connectivity.

Run from the canonical root with the existing runtime:

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/christaylor \
node --require ./verification/web/scripts/deny-build-network.cjs \
--test platforms/tests/android-member-policy.test.mjs
```

The root-owned v2 ports and Android JS adapter are separately tested and composed; their evidence must identify synthetic native doubles. Real acceptance still requires approved materialization of the exact RN/Expo/Codegen and Android toolchain, generated-signature/API compatibility, release configuration, device Keystore/lock behavior, cross-process interrupted reset tests, network redirects/retries/cancellation and actual connectivity/lifecycle tests. No provider, issued credential, SDK acquisition, native execution or production change occurred in this source milestone.
