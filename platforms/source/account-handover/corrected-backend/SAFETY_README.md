# Participant-blocking review kit

This milestone builds on the independently cleared local repair source archive SHA-256 `268be9b523e895a4b8fb477417cd1a8d08cffd8d4f5c795fb29ba19c035f8b2a` (209 files). That earlier source, patches, APK and completed native evidence are preserved. Changes are isolated to this source copy.

Read [the API behavior and limits](prototypes/soe-join-revoke/SAFETY_API.md). Server-enforced participant blocking is the new workflow. Existing tombstone account deletion is tested; report submission, physical contact purge and unblocking remain explicitly unsupported.

From `prototypes/soe-join-revoke`, run `npm test`. From this kit root, run `node --experimental-transform-types --test --test-timeout=15000 prototypes/soe-join-revoke/integration/*.test.mts`. Node22.14+ and local loopback sockets are required; neither command needs package installation. No native/mobile application source changed, and this milestone did not rerun native instrumentation or generate a new APK.

The safety delta applies to the exact earlier repaired source. The separately delivered safety cumulative patch includes all earlier changes and applies to repository commit `916978c489eb5cd4cc1ceaf27ffc62d157a3eff2`. A full source archive supports review without that checkout. Source manifests and reconstruction receipts identify the exact bytes.

Everything remains synthetic, process-local and unpushed. There is no durable block, physical erasure or live moderation service. No production readiness, real-person consent or response-time guarantee is asserted. The preexisting REPAIR_README.md describes the prior milestone; use this file and SAFETY_API.md for the safety extension.
