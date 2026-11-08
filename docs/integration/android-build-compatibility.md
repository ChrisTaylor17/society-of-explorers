# Android build compatibility checkpoint

The current integrated source now compiles into a private Android test APK with
the approved, installed toolchain. This replaces the earlier state where only an
older isolated baseline built. The working source retains the newer Fellowship
web section, but **Fellowship screens are not yet implemented in the native app**.

## Changes

- Circle discovery uses a shared public projection module. Its mapping is copied
  unchanged from the server; existing server exports remain compatible. Native
  type checking no longer follows the server's Node-only dependencies.
- Native startup owns its trusted configuration rather than accepting Expo's
  initial properties as account configuration. Link handling normalizes a missing
  initial URL, and absent native modules consistently use the unavailable path.
- Android generated reader assets and clip resources are registered through
  typed variant sources. Rights/withdrawal checks still run for every build.
- Library build tools and CMake use the approved installed versions. Dependency
  versions, application identity, release guards and account permissions are
  unchanged.
- Secure-storage directory synchronization uses public Android APIs: open
  without following a final symlink or blocking on a substituted FIFO, verify the
  opened descriptor is a directory, synchronize it and close it. Failures remain
  failures; the existing account-retirement behavior is retained.

## Evidence

The source was preserved in a private candidate from commit
`1287f748219aea90c09aa5bf24e7699a3dcf12fa`. All twelve compatibility postimages were
matched again before local integration. The original checkout, previous test
APK, previous receipts and existing dependency links were preserved.

- Native TypeScript checking passed against the locked installed dependencies.
- Scoped lint passed with zero errors and zero warnings on the final files.
- 98 focused tests passed: 35 native adapter/discovery/link/account checks,
  53 web discovery/Fellowship/media-packaging checks, and 10 Android policy checks.
  These use synthetic accounts and explicit platform doubles, not real members.
- The full offline web webpack/type build passed with 1,223 unchanged product
  inputs. Provider values were deliberately invalid placeholders; external
  network requests were blocked.
- The offline Android build completed 181 tasks: 153 executed, 28 up to date.
  It used Java 17, Gradle 9.4.1, Build Tools 37.0.0, compile SDK 37, NDK
  27.1.12297006 and CMake 3.30.5, with downloads disabled.
- The resulting 64,354,742-byte arm64 APK has a verified Android Debug v2
  signature, minimum SDK 24 and target SDK 36. Its ZIP, defined native classes,
  reader catalog and all five clip byte hashes were inspected. Live configuration
  remains empty; backup and cleartext traffic remain disabled.
- The changed directory method exactly matches the earlier seven compiled JVM
  fault-injection cases. Those tests substitute OS calls and do not prove Android
  filesystem, Keystore or power-loss behavior.

Detailed bindings are in [the verification record](android-build-compatibility-verification.json).
Two initial mixed test invocations used incompatible working directories for the
web and native harnesses. They failed and are retained. Separate runs in each
harness's expected directory passed without changing their assertions.

## Limits and next work

This is a debuggable, synthetic test package, not a release-signed app. No device
was installed, no emulator was added, no account or permission was changed, and
no money was spent. Debug dependency permissions include legacy external storage
and developer networking/overlay capabilities; review the actual release
manifest separately before release.

Next, build the requested prominent native Fellowship experience through the
existing source, discovery and membership contracts. Verify its source context,
navigation, accessibility and lifecycle before a physical-device check. Continue
iOS and Quest as separate acceptance tracks. Hosted recovery, privacy repair,
real sign-in and the actual salon pilot remain independent launch gates.

Rollback is the inverse of the twelve-file compatibility patch, using the
retained preimages. It contains no database migration or external state change.
Do not reverse later unrelated work or treat a source rollback as a recovery of
hosted data.
