# Canonical web verification

This directory imports the regression drivers from the complete web milestone and its current discovery-search descendant. The drivers resolve the canonical app root directly, two levels above this directory. There is no recursive app-root symlink. `tooling/node_modules` and the root `node_modules` reuse existing local runtimes; no dependency installation is implied.

Run from this directory:

```sh
python3 scripts/build-offline.py --webpack --fixture-public-config
python3 scripts/run-root-tests.py --non-dom --output-name canonical-backend-tests
python3 scripts/run-backend-checks.py suites --output-dir evidence/canonical-suites
```

These wrappers start app/test code in a clean environment under `scripts/deny-build-network.cjs`. Invalid public build placeholders are fixtures, not issued credentials. Real account/provider/production calls remain prohibited. Browser scripts require explicitly configured already-installed Playwright and Chromium paths.

`evidence/` holds fresh local outputs and is ignored by Git. Source/test code is versioned; historical evidence stays in its original milestone directories. Older delivery/patch verifiers in `scripts/` describe those historical envelopes; they are not a canonical release gate and require their original metadata. Use canonical source provenance in `docs/integration/` and fresh acceptance results instead.

The exact reused JSDOM runtime currently has dataless files. `--non-dom` records the excluded suite list rather than claiming a complete DOM run. Built-browser checks cover their explicitly listed stories; they do not replace all excluded suites or device acceptance.

The strict Circle rehearsal reads the tracked sanitized catalog in `tests/fixtures/circle-live-catalog-2026-11-04.json`, not an ignored evidence file. Run `node --require ./scripts/deny-build-network.cjs scripts/verify-circle-live-chain.mjs` under the same clean environment. The fixture explicitly labels its redacted-default, minimal external-table and runtime exceptions. Ordinary salon SQL/HTTP is `tests/book-salon-conversation.test.mjs`; actual component and composed scripts are `tests/browser-legacy-salon.mjs` and `tests/browser-legacy-salon-composed.mjs`, after `scripts/bundle-legacy-salon-test.mjs` using the existing cached tools. Their generated bundle and outputs remain ignored. Current source/evidence digests and boundaries are recorded in `docs/integration/circle-salon-verification.json`.

Hall uses `scripts/verify-hall-public.mjs`, `scripts/bundle-hall-test.mjs` and `tests/browser-hall[-composed].mjs` with tracked catalog fixtures and the same cached-tool/clean-environment/startup-denial rules. The combined `scripts/verify-release-boundaries.mjs` proves only its documented synthetic twenty-file compatibility scope. The saved Hall checkpoint's 670-case selected suite, eleven built-browser stories and explicit limits/digests remain in `docs/integration/hall-release-verification.json`; shared build/browser outputs were copied byte-for-byte under `evidence/checkpoint-6d5bccf/` before replacement.

The separate `scripts/test-prompt-atlas-core.mjs` runs the complete unchanged Prompt Atlas migration with actual identity/core SQL; its eleven database cases preserve the helper and all eight policy paths. `tests/reward-rpc-containment-db.test.mjs` runs thirteen cases against the new three-function EXECUTE-only candidate, with explicitly representative unknown reward bodies and an actual Thinker route call using synthetic services. These are separate proofs, not additions to the twenty-file full-chain claim. Read `docs/integration/prompt-atlas-core-compatibility.md` and `reward-rpc-containment.md` for exact source hashes, role/auth/default exceptions and production gates.

Current reward/guide checkpoint: `docs/integration/rpc-guide-release-verification.{md,json}`. It records 697 selected cases, final build and twelve built-browser stories. The guide closure has three actual-route cases and five final-component stories in `tests/leaderboard-closure.test.mjs` and `tests/browser-leaderboard.mjs`, bundled by `scripts/bundle-leaderboard-test.mjs`. Its intercepted actual handler uses the existing NextResponse transport shim; the React page/footer have no UI/auth adapter. Final global CSS/layout acceptance is separate in the built-browser receipt.

Before further source reads, inspect allocation and refuse nonempty zero-block/cloud placeholders. The build snapshot, selected-test discovery and current built-browser driver's own reads now stop at that boundary. Do not recursively follow older candidate/tooling symlinks. Earlier source audits had an incidental materialization and incomplete allocation baselines, recorded in `docs/integration/source-read-boundary-2026-11-04.md`; application network-denial results do not establish OS-level isolation for those reads.

The subsequent shared message-AI allowance runs `tests/message-ai-allowance-db.test.mjs`, the current advice/provider suites and `tests/message-ai-integration.test.mjs` under the same startup-denial/clean-environment rules. The composed AI browser includes exhausted allowance with human review still available. SQL defaults disabled/zero; explicit owner activation occurs only in disposable synthetic fixtures. See `docs/integration/message-ai-allowance.md` and its verification receipt. The prior `37a0204` eighteen pinned outputs are preserved under `evidence/checkpoint-37a0204/`.
