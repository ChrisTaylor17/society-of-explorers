# Android source hardening — first release candidate

The active Android source under `platforms/native/android` removes the imported storage/overlay permission and backup/signing defaults. This is a source hardening checkpoint, not an APK, device, store, signing-key ownership or deployment clearance.

## Permission and backup policy

The main manifest requests only INTERNET. The release overlay removes READ_EXTERNAL_STORAGE, WRITE_EXTERNAL_STORAGE, SYSTEM_ALERT_WINDOW and VIBRATE even if a dependency requests them, and disallows cleartext traffic. Debug/debugOptimized keep their existing overlay and local cleartext development behavior; the separately identified embedded synthetic fixture remains local test content. Those debug manifests and the synthetic instrumentation source were not edited.

The application sets `allowBackup=false`, references `soe_backup_rules.xml` for older Android and `soe_data_extraction_rules.xml` for Android 12+. Each rule set excludes all nine documented app domains: root, file, database, sharedpref, external and the four device-protected equivalents. The modern file applies exclusions independently to cloud-backup and device-transfer. This covers future credential-containing preferences/files/databases without assuming that an OS-protected storage bridge is already implemented. Cache/no-backup directories are already excluded by Android.

Android documents OEM-dependent device-transfer behavior despite allowBackup=false, which is why both XML formats are present. References: [Auto Backup](https://developer.android.com/identity/data/autobackup), [Android 12 backup changes](https://developer.android.com/about/versions/12/behavior-changes-12#backup-restore), and [manifest merge priorities/removal markers](https://developer.android.com/build/manage-manifests). The currently linked React Native version catalog declares minSdk 24, targetSdk 36, compileSdk 37; installed Expo root-plugin defaults agree. These are source declarations, not evidence that those SDKs are locally installed. Cross-platform transfer is not configured or opted into with an iOS identity; any future Android 36.1+ cross-platform transfer integration needs a separate explicit exclusion review before enablement.

## Release guard

`app/build.gradle` no longer assigns `signingConfigs.debug` to release. Release uses a separate `soeOwnedRelease` config, `debuggable=false`, and requires an explicit `-PsoeReleaseConfig=/absolute/canonical/private/release.json`. No release descriptor or key has been created. The default anonymous ID remains solely the existing debug/synthetic fixture identity; a release task cannot pass the guard without a validated owner-supplied ID. A supplied release descriptor also gives debug an additional `.debug` suffix to avoid installing over its release identity.

The dependency-free `release-policy.cjs` is used by Gradle during explicit descriptor loading and again by a prerequisite of every app task whose name contains release, including internal compile/package/sign tasks reached by aggregate assemble/bundle/build/install requests. The verification task has no up-to-date outputs and is marked incompatible with configuration cache. Run eventual release verification with `--no-configuration-cache`. Descriptor changes between configuration and task execution fail closed; every verification rechecks keystore bytes. Direct release work with no descriptor fails with a safe error and no credential discovery.

The descriptor is strict JSON version 1 with exactly these fields:

| Field | Required meaning |
| --- | --- |
| version | Numeric 1 |
| applicationId | Valid Android application ID; no anonymous/example/demo/synthetic/debug/test placeholder segment |
| applicationIdOwnership | Literal `owner-confirmed`; owner must verify actual ID control separately |
| signingKeyOwnership | Literal `owner-confirmed`; owner must verify actual key control separately |
| storeFile | Canonical absolute path to the owned keystore outside this checkout |
| storeSha256 | Exact lowercase SHA-256 of that retained keystore |
| keyAlias | Explicit alias; androiddebugkey is forbidden |
| storePassword | Nonempty private value; default android is forbidden |
| keyPassword | Nonempty private value; default android is forbidden |

Both descriptor and keystore must be private regular files (0600 or stricter), outside the checkout, with no symlink path aliases. Relative paths and unknown/missing fields fail. A renamed byte-identical copy of the checked-in debug keystore is rejected. The helper never reads environment credentials, never returns password fields, and sanitizes JSON/filesystem errors. Gradle does not echo helper output, descriptor contents or signing values. Do not put issued credentials into tracked files or command-line password arguments.

This gate verifies explicit configuration and byte identity; it cannot establish legal ownership or validate that a synthetic byte fixture is a usable signing key. Real AGP signing/certificate verification remains required. Existing versionName 0.0.0/versionCode 1 and synthetic app naming also require an owner-reviewed release/version decision before distribution. A completed descriptor is not distribution authorization.

## Evidence and remaining gates

`verification/android-hardening.test.mjs` runs under a clean environment with the existing startup network-denial guard. It exercises the actual validator and CLI using temporary synthetic non-key bytes: absent descriptors, placeholder/unconfirmed IDs, default debug aliases/passwords/filename, renamed bundled debug bytes, file/hash/config replacement, permissions, symlinks, sanitized errors and password-free success output. Python's installed XML parser verifies the actual manifests and both rule formats; a missing sharedpref exclusion is a rejecting negative case. The Gradle-wiring assertions are expressly static source checks.

The bounded check does not start Gradle, an SDK, emulator, device, provider or account. The cached Gradle core Groovy/JSON jars have zero allocated blocks and were not read/materialized. Therefore Groovy/AGP syntax, actual task graph behavior, merged manifest/dependency permission removal, AAPT resource acceptance, keystore/certificate signing and real Android cloud/device-transfer behavior remain unexecuted acceptance gates. They must be checked with an explicitly supplied owned identity/key and already available approved tooling before any native release claim. No package, SDK, dependency or key download/generation occurred.

`platforms/source/account-handover` remains the exact 300-file preserved archive. Before/after verification compares every relative path, byte size and SHA-256; the active hardening deliberately does not propagate back into that archive. Evidence and frozen active hashes are in `verification/web/evidence/android-hardening.json`; the passing test log is adjacent.
