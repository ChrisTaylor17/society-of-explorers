# Local synthetic repair review kit

This source kit includes the entire 916978c489eb5cd4cc1ceaf27ffc62d157a3eff2 repository plus the local cumulative changes and unchanged synthetic backend export. It can be extracted anywhere; no sibling task directory is needed. The cumulative patch separately applies to that base commit. The repair delta applies to the previously delivered embedded source (the old source manifest is retained in evidence).

Use Node 22.14 or later. No dependency installation is needed for the integration and gateway tests:

```sh
NODE_NO_WARNINGS=1 node --experimental-transform-types --test --test-timeout=15000 prototypes/soe-join-revoke/integration/*.test.mts
node --test local-test-tools/gateway-relocation.test.mjs
cd prototypes/soe-join-revoke
npm test
```

All network fixtures bind numeric IPv4 loopback on temporary ports. Run where local sockets are allowed. Mobile tests and both TypeScript checks require the package-lock dependencies in `mobile` and `mobile/native`. The kit does not include node_modules, the Android SDK/JDK/NDK, caches, local.properties or machine configuration. Rebuilding Android requires the documented toolchain versions and existing dependencies; this package does not claim a reproducible full signed APK.

For the emulator gateway, from the kit root:

```sh
node local-test-tools/soe-android-runtime-gateway.mjs --output-dir /absolute/path/to/evidence --prefix soe-repair --port 8787 --trap-port 8788
```

With an already-running emulator, route only ports8787/8788 using adb reverse. The app is `com.anonymous.soesyntheticdemo.embedded`; its test runner is `com.anonymous.soesyntheticdemo.embedded.test/androidx.test.runner.AndroidJUnitRunner`. Installation/test execution requires authorization. Neither Metro nor production service access is required at runtime; the local synthetic backend remains required.

See `mobile/native/LOCAL_DEVELOPMENT.md` and the external repair evidence/handoff for limitations and the execution status. Older native reports do not validate this rebuilt APK. Preserve the pilot NO-GO pending independent review of these exact source bytes and completed runtime evidence. No deploy, push, payment, credentials, personal data or outreach is part of this work.
