# Native Circle creation response recovery

The active native hosting controller no longer treats an HTTP error status alone as proof that creation failed. It clears a first attempt only when a supported refusal status, including 503, carries exactly `{error: <nonempty string>, outcome: "not_attempted"}`. Gateway, malformed, extra-field and unknown replies retain the original request. A later refusal never settles an earlier uncertain send.

This prevents a committed creation followed by a gateway 403 or 429 from opening a fresh draft with a new key. It also lets a host prepare and explicitly confirm a new intent after a definite first-attempt rejection, including a service-unavailable response that proves no write was attempted. The implementation matches the verified web response semantics and reuses the existing typed record guard. It changes no transport policy, schema, queue, persistence or terminal-close behavior.

## Verification

- The new regressions on the unchanged controller produced 56 passes and 12 expected failures. They demonstrated both discarded uncertain keys and a definite 503 incorrectly remaining uncertain.
- The final controller suite passes 68 cases. It checks committed-then-gateway replies, unchanged key/body on exact retry, blocked duplicate drafts, separately reviewed new intent after definite refusal, malformed/extra-field bodies, invalid JSON and later refusals.
- The existing native hosting policy suite passes all 17 cases. Its transport checks use explicit native doubles; Kotlin assertions inspect source rather than executing Android.
- Portable TypeScript passes. The first check's narrowing error is retained in evidence; the existing `membershipRecord` type guard resolves it without weakening runtime validation. The existing configuration excludes React Native adapter/OS types.
- Scoped ESLint passes for both changed source/test files with zero errors or warnings. The final snapshot matches 541 selected current platform/library/configuration inputs with the two reviewed worktree files overlaid. Both unchanged Kotlin inputs read by the policy suite also match the earlier verified native-build snapshot. More than 11 GiB remains free, above the 8 GiB floor.

The [source-bound receipt](native-creation-refusal-verification-2026-11-11.json) contains final file hashes and the preserved before/after logs. The baseline ran from canonical source; final checks ran in the existing materialized `finish-checks/source` snapshot. No dependencies were installed and no issued credential or external service was supplied.

Cloud eviction interrupted final Git source inspection. Only the two frozen owned files were restored atomically from the verified snapshot, with their original modes and tested hashes preserved, then staged for parent review. Untouched offloaded source was not hydrated. The two Kotlin inputs use the existing verified snapshot provenance; no new device or Kotlin compilation claim is made.

## Remaining boundary

These are local implementation checks, not customer validation, hosted acceptance or a new Android/iOS package. The earlier verified Android artifact remains preserved; it predates this controller repair. A subsequent parent-owned build must include these exact source bytes before claiming the fix is packaged. Physical device, real account/provider and signing acceptance remain separate. Native recovery still retains uncertain requests only within the existing owned connection; this change does not promise recovery after terminal Close or process termination.
