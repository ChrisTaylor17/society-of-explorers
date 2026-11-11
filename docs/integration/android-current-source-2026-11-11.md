# Current Android linked package — 2026-11-11

A fresh local arm64 synthetic/debug APK now includes the current reader-size controls. Native types, 30 existing reader/Fellowship policy tests, offline linking and direct package inspection pass. No product code was changed in this continuation.

The previous November 10 APK already included the Fellowship text-update fix; its earlier general source manifest did not. The later reader-size work had Codegen/Kotlin/Java class evidence but no linked package. This new build closes that exact gap. The original APK and class archive remain unchanged.

Source snapshot: `bb4c02becbc6caf0bd0114aee336aa1bf317af44`, with native-relevant inputs rechecked against current HEAD. Existing locked tools/dependencies only; no installation, acquisition, cleanup, device action, provider request, credential change, publication or spending.

## Verified artifact

- APK: `/Users/christaylor/Library/Application Support/Society of Explorers/Verification/2026-11-11-native-current-build/source/platforms/native/android/app/build/outputs/apk/synthetic/app-synthetic.apk`.
- Size: 64,511,013 bytes.
- SHA-256: `3df4fbca3f1dddfebc968303608d3552125da170fdaf3449f250728b72d21017`.
- Debug/v2 signature; arm64-v8a; minimum SDK 24 and target SDK 36; `com.anonymous.soesyntheticdemo.embedded`.
- Member/provider configuration remains blank. Backup and cleartext are disabled; permissions match the prior debug package.
- Current reader view, manager and generated Fabric classes are in DEX. Compiled native text zoom, 80/150 bounds and manager setter call are present.
- Canonical catalog and five clips match their inputs. ZIP and native ELF 16 KB LOAD alignment pass; physical 16 KB runtime remains untested.
- All 3,012 frozen source inputs, the previous APK/class archive and held book-header source are preserved. No held test or security proposal was applied.

The actual APK build succeeded in 81.99 seconds. Minimum sampled free space was 13.24 GiB, with 13.10 GiB after inspection, above the 8 GiB floor.

[Machine-readable receipt](android-current-source-verification-2026-11-11.json) · [Detailed local evidence](/Users/christaylor/Documents/Mewest/RESEARCH/soe-public-finish-2026-11-11/native-current/README.md). The parent's initial `NATIVE_RECONCILIATION.json` remains unchanged; the precise follow-up is `NATIVE_CURRENT_RESULT.json` beside it.

## Still open

This package has not been installed or run on Android. No ADB client was found at the approved SDK or usual executable paths, so the count of authorized devices is unknown. Device/runtime acceptance needs an accessible authorized Android device, or an emulator/tooling setup that fits the retained storage budget. Neither was exercised here; no device IDs were collected. The current broad instruction permits reversible free local work, so missing access/capacity must not be mislabeled as a fresh generic installation-approval requirement.

Named Xcode/Xcode-beta and simulator-runtime paths are absent; CommandLineTools is selected. Full Xcode/iOS SDK, storage/setup review, compilation and signing/device acceptance remain open. The iOS source is preserved, not compiled by this build.

Real account/recovery/security, hosted source behavior, configured networking, release signing, permissions/store review and the held book-header decision remain separate. Compilation and static inspection are not real-device or customer acceptance.
