# Preserved Apple member policy source

`MemberPolicy.swift` is an exact copy of the already materialized account-handover source recorded in `provenance.json`. It was outside the earlier 300-file app archive. This directory is excluded from web deployment and is not wired into the active native composition.

The source includes request validation, an ephemeral-session configuration, a redirect-rejecting delegate and a device-only Keychain backend. It does not register a React Native module, execute the current bridge's `begin/send/cancel` transport or cover the current discussion routes. Its previous tests used `FakeKeychain`; no iOS SDK, native build or physical-device test was run here. Do not infer a production auth/storage/transport bridge from preserving this file.

Future implementation should reuse the existing `NativeMemberBridge` contract rather than add another parallel abstraction. Reconcile route/response limits, key namespace, serial storage, cancellation, redirect refusal and durable reset ownership before registration. Actual toolchain and binary/device acceptance remain required. Keep the original source unchanged as provenance; do not hydrate other candidate files to complete this archive without the user's direction.
