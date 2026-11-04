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

Hall uses `scripts/verify-hall-public.mjs`, `scripts/bundle-hall-test.mjs` and `tests/browser-hall[-composed].mjs` with tracked catalog fixtures and the same cached-tool/clean-environment/startup-denial rules. The combined `scripts/verify-release-boundaries.mjs` proves only its documented synthetic twenty-file compatibility scope. Current build, 670-case selected suite, eleven built-browser stories and all explicit limits/digests are in `docs/integration/hall-release-verification.json`.
