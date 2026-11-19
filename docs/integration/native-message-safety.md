# Native message reporting and withdrawal

The native `CircleScreen` opens actions only from an already loaded archive message and then requests its current safety state. Opening clears the archive and keyed writer view before the response. Current server permissions govern reporting and author withdrawal, including author permissions after leaving a Circle. Hidden and withdrawn messages use tombstones; author-facing explanations come only from the checked DTO.

Reports require one of six reasons and an explicit confirmation. The optional private note is bounded to 1,000 characters. The UI describes a report as an allegation for private human review. Withdrawal requires an explicit acknowledgement that member views lose the message while restricted safety evidence may remain; retention policy remains unfinished. These actions do not grant or change AI consent.

An uncertain POST retains its original request key and body in memory. Navigation and new writes are locked until a valid receipt or retirement. A manual state check does not prove an earlier report was received, even if current permissions changed. Only an explicit exact retry can recover the action receipt; there is no automatic mutation retry. Blur, offline/unknown connectivity, owner change and closure retire private state and pending local retry details. A transmitted operation may still complete after retirement.

The Android transport source additionally allows exactly `GET` and `POST /api/circles/{uuid}/messages/{uuid}`, without a query or suffix. Its existing exact-origin/canonical-URL, redirect rejection, single-exchange, cancellation, generation, deadline and body limits remain. No new permissions or native capabilities are added.

## Local verification

`platforms/tests/browser-native-message-safety.mjs` runs the actual `CircleScreen` and portable host/archive/writer/message-safety source in cached React/Chromium. Eight stories cover explicit opening and draft retirement, report confirmation, hidden-author withdrawal after synthetic departure, a lost committed report response and exact replay, mismatched receipts/malformed state, held JSON retirement through blur/offline/owner change/unmount, committed held POST retirement, and keyboard/48px controls using a 320px DOM-primitive screenshot. The React Native primitives/AppState, owner, connectivity, deterministic keys, current-state server and receipt store are explicitly synthetic. They do not execute canonical APIs or SQL.

`platforms/tests/native-message-safety-policy.test.mjs` has three actual JavaScript-port cases and one explicitly static Android-source assertion. Runtime negatives include empty query/fragment, dot segments, whitespace canonicalization, wrong UUID/origin, extra queries, action/AI suffixes, unsupported methods/headers and oversized bodies. Rejected inputs allocate no native handle and call no native send. An initial cross-VM test assertion failure is preserved in `verification/web/evidence/initial-native-message-safety/policy.log`; its comparison was corrected, without changing product behavior.

Evidence uses new `native-message-safety-*` names. The prior twelve-story native connectivity/keyed fixture sources and outputs are preserved. The browser receipt records source hashes, a running state before setup, failure state before cleanup, bounded owned-browser closure and final error/source checks before PASS.

Run from the repository root with a clean environment and startup network guard:

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/christaylor node --require ./verification/web/scripts/deny-build-network.cjs --test platforms/tests/native-message-safety-policy.test.mjs
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/christaylor NODE_OPTIONS='--require /Users/christaylor/Documents/Codex/soe-release/verification/web/scripts/deny-build-network.cjs' ./verification/web/tooling/node_modules/@oven/bun-darwin-aarch64/bin/bun --no-env-file --no-install --preload ./verification/web/scripts/deny-build-network.cjs platforms/tests/bundle-native-message-safety.mjs
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/christaylor node --require ./verification/web/scripts/deny-build-network.cjs platforms/tests/browser-native-message-safety.mjs
```

This does not establish Codegen/Android compilation, Hermes execution, native endpoint enforcement, real account/credential ownership, OS connectivity/storage/cancellation, native accessibility/layout, device or store acceptance. No providers, installs, downloads, real credentials, native tools or production data are used by these checks. Actual API/SQL composition is independently scoped by the platform proof.
