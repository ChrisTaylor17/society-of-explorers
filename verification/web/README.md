# Canonical web verification

Run the current offline checks from a materialized repository or verification snapshot root, using the existing installed application and verification dependencies:

```sh
npm test
npm run test:web
npm run test:platforms
npm run test:all
```

`npm test` runs security and growth suites. `test:web` includes the DOM suites; it no longer requires a `--non-dom` exclusion. `test:platforms` runs the Node-based shared/native/Quest contract tests, not an Android or iOS build, a simulator, or a real headset. `platforms/tsconfig.portable.json` similarly excludes React Native adapters, including the account-deletion Linking handoff; those still require the actual native dependency/build lane. The combined command runs all four groups.

For a bounded selection or separately named evidence:

```sh
node scripts/run-tests.mjs --groups=web --files=verification/web/tests/message-api.test.mjs --output=message-api
node scripts/run-tests.mjs --groups=web,platforms --concurrency=2 --timeout=180 --output=review
node scripts/run-tests.mjs --groups=security,growth,web,platforms --list
```

The runner starts each suite in its own clean process, supplies no issued credentials, denies external HTTP/fetch at startup, and does not load dotenv files or install packages. It continues after a failed or timed-out suite and reports the failure in its exit code. It stops only the process group it created on timeout. Empty Node file wrappers are not counted as successful tests. Entirely skipped historical suites remain separately labelled. Logs and incremental `summary.json` files are under ignored `verification/web/evidence/<output>/`.

The canonical checkout is under cloud-managed Documents. Some unchanged source and historical documents there are offloaded: direct canonical runs can fail residency checks or stall while macOS retrieves a file. Use the materialized finish-checks snapshot recorded in the integration report for current repeatable local verification. Do not replace or silently ignore an offloaded file or an uncommitted change.

These are local checks. The guard is not OS-level network isolation. Synthetic identities, PGlite fixtures, DOM mocks and local transport do not establish hosted privacy, real sign-in, customer use, transactions or device acceptance. SQL is executed only in disposable local databases; migration files and fixtures retain their source/hash guards.

## Installed tools and reproducibility

The application's `node_modules` and `verification/web/tooling/node_modules` are ignored local dependency links. On the current Mac they are already prepared; the previous root link is preserved as ignored `node_modules.before-finish-2026-11-11`. The previous tooling link was preserved as `tooling/node_modules.before-finish-2026-11-11`; its offloaded files were not replaced or deleted. Current test tools live in the private finish-checks verification folder recorded in `docs/integration/finish-checks-2026-11-11.md`.

The versioned `verification/web/runtime/package-lock.json` restores the **existing exact** Bun 1.4.4 and JSDOM 30.1.3 graph. It is a macOS Apple Silicon lock because Bun is pinned as `@oven/bun-darwin-aarch64`, rather than an automatic platform download. The runner also accepts an existing Bun on PATH or `SOE_BUN_BIN`. No install runs automatically.

When an operator needs to restore those locked tools, this is the explicit no-lifecycle-script command, run from the repository root:

```sh
npm ci --prefix verification/web/runtime --ignore-scripts --no-audit --no-fund
```

Use an empty npm user/global configuration if a workstation normally carries private registry credentials. The restored packages are from the public npm registry. The application dependencies must also already be available from the root lockfile. Full web/database verification additionally uses the existing **PGlite 0.4.1** package under `tooling/node_modules/@electric-sql/pglite`, plus existing bundle tools for the separately invoked browser scripts. The two-dependency runtime lock is not a fresh-machine installer for all historical browser tooling. Preserve an existing tooling directory or link before repointing it; never merge installs into a shared historical runtime.

For an existing complete, materialized test tool directory on another checkout, the explicit link is:

```sh
# Set this to the reviewed existing node_modules directory, not a download URL.
SOE_TEST_MODULES='/absolute/path/to/existing/test/node_modules'
# Only when this destination does not already exist; preserve an old link first.
ln -s "$SOE_TEST_MODULES" verification/web/tooling/node_modules
```

JSDOM 30.1.3 declares Node `^22.22.2 || ^24.15.0 || >=26.0.0`. This Mac's observed runtime is Node 22.22.1, one patch below the declared minimum. The current local DOM results are recorded as observed compatibility, not supported-engine certification. No global Node installation or upgrade was made. A release verification machine should use a Node version satisfying the declared range.

## Builds, browser stories and historical evidence

The offline build remains a separate action, run from this directory:

```sh
python3 scripts/build-offline.py --webpack --fixture-public-config
```

Invalid public build placeholders are fixtures, not issued credentials. Browser scripts require explicitly configured, already-installed Playwright and Chromium paths. `scripts/run-root-tests.py --non-dom` remains a historical partial-run option for a machine without a materialized DOM runtime; its selection receipt must not be described as a complete test pass. Prefer the current bounded runner above.

Source and test code are versioned; historical evidence stays in its original milestone directories. Older delivery/patch verifiers describe their original envelopes and are not a canonical release gate. Use current provenance in `docs/integration/` and fresh acceptance receipts. The five ordering observations in `circle-participation-ordering-audit.test.mjs` deliberately skip when the pinned historical implementation has changed; the current fixed contract is exercised in `circle-hosting-backend.test.mjs`.

The strict Circle rehearsal reads the tracked sanitized catalog in `tests/fixtures/circle-live-catalog-2026-11-04.json`, not an ignored evidence file. Run `node --require ./scripts/deny-build-network.cjs scripts/verify-circle-live-chain.mjs` under the same clean environment. The fixture explicitly labels its redacted-default, minimal external-table and runtime exceptions. Ordinary salon SQL/HTTP is `tests/book-salon-conversation.test.mjs`; actual component and composed scripts are `tests/browser-legacy-salon.mjs` and `tests/browser-legacy-salon-composed.mjs`, after `scripts/bundle-legacy-salon-test.mjs` using the existing cached tools. Their generated bundle and outputs remain ignored. Current source/evidence digests and boundaries are recorded in `docs/integration/circle-salon-verification.json`.

Hall uses `scripts/verify-hall-public.mjs`, `scripts/bundle-hall-test.mjs` and `tests/browser-hall[-composed].mjs` with tracked catalog fixtures and the same cached-tool/clean-environment/startup-denial rules. The combined `scripts/verify-release-boundaries.mjs` proves only its documented synthetic twenty-file compatibility scope. The saved Hall checkpoint's 670-case selected suite, eleven built-browser stories and explicit limits/digests remain in `docs/integration/hall-release-verification.json`; shared build/browser outputs were copied byte-for-byte under `evidence/checkpoint-6d5bccf/` before replacement.

The separate `scripts/test-prompt-atlas-core.mjs` runs the complete unchanged Prompt Atlas migration with actual identity/core SQL; its eleven database cases preserve the helper and all eight policy paths. `tests/reward-rpc-containment-db.test.mjs` runs thirteen cases against the new three-function EXECUTE-only candidate, with explicitly representative unknown reward bodies and an actual Thinker route call using synthetic services. These are separate proofs, not additions to the twenty-file full-chain claim. Read `docs/integration/prompt-atlas-core-compatibility.md` and `reward-rpc-containment.md` for exact source hashes, role/auth/default exceptions and production gates.

Current reward/guide checkpoint: `docs/integration/rpc-guide-release-verification.{md,json}`. It records 697 selected cases, final build and twelve built-browser stories. The guide closure has three actual-route cases and five final-component stories in `tests/leaderboard-closure.test.mjs` and `tests/browser-leaderboard.mjs`, bundled by `scripts/bundle-leaderboard-test.mjs`. Its intercepted actual handler uses the existing NextResponse transport shim; the React page/footer have no UI/auth adapter. Final global CSS/layout acceptance is separate in the built-browser receipt.

Before further source reads, inspect allocation and refuse nonempty zero-block/cloud placeholders. The build snapshot, selected-test discovery and current built-browser driver's own reads now stop at that boundary. Do not recursively follow older candidate/tooling symlinks. Earlier source audits had an incidental materialization and incomplete allocation baselines, recorded in `docs/integration/source-read-boundary-2026-11-04.md`; application network-denial results do not establish OS-level isolation for those reads.

The subsequent shared message-AI allowance runs `tests/message-ai-allowance-db.test.mjs`, the current advice/provider suites and `tests/message-ai-integration.test.mjs` under the same startup-denial/clean-environment rules. The composed AI browser includes exhausted allowance with human review still available. SQL defaults disabled/zero; explicit owner activation occurs only in disposable synthetic fixtures. See `docs/integration/message-ai-allowance.md` and its verification receipt. The prior `37a0204` eighteen pinned outputs are preserved under `evidence/checkpoint-37a0204/`.

Full report coverage uses `tests/review-coverage-api.test.mjs`, `tests/review-coverage-db.test.mjs` and `tests/review-coverage-integration.test.mjs`. `scripts/bundle-review-coverage-test.mjs` builds the actual reviewer components for `tests/browser-review-coverage.mjs` and `tests/browser-review-coverage-composed.mjs`. The composed driver connects those components to the actual new routes and strict SQL chain with explicit synthetic authentication and transport. It does not prove independent PostgreSQL-session scheduling. Ordinary cases keep their existing path; cases above100 require every bounded page to be acknowledged before a human decision. AI advice remains unavailable for those large cases. The allowance checkpoint's twelve pinned outputs were preserved under `evidence/checkpoint-a21b399/` before shared outputs were replaced. See `docs/integration/circle-review-coverage-verification.json` for the final scope, counts and hashes.

The later exact-body reward rehearsal uses `tests/reward-live-body-db.test.mjs` and the tracked `reward-live-bodies-2026-11-04.json` fixture. Its thirteen cases execute the captured definitions, unchanged containment and actual canonical Thinker route with synthetic identity/provider transport. It preserves the original representative-body suite and does not establish deployed caller correspondence. See `docs/integration/reward-live-body-review.md`. Native connectivity and Quest member composition have separate actual-component drivers under `platforms/tests/`; their runtime doubles and device limits are recorded in the current release receipt.
