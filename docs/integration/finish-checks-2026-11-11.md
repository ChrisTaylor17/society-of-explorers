# Finish-pass local verification — 2026-11-11

## Later Circle recovery verification

The later product commit `8bb9f1203477877d8b82c8320150f2241bd35a3a` repairs same-tab Circle creation recovery. It passes 14 new hook/form groups, nine new actual-handler/local-SQL groups, 41 existing hosting/admission groups and 25 Chromium stories. Scoped lint is clean and an independent code/evidence review found no blocking defect. The broad matrix below is the preserved baseline, not a claim that all 251 files were rerun after this change. [Affected implementation and receipts](circle-hosting.md#november-11-web-creation-recovery).

The combined Next build/type check passes in 50.27 seconds. All 1,266 build inputs match both the frozen snapshot and the committed Git blobs. Four actual local HTTP checks verify the new receipt route's malformed/anonymous private denials and the existing public trial. No issued credentials or hosted provider access were used. [Build/readback](/Users/christaylor/Documents/Mewest/RESEARCH/soe-public-finish-2026-11-11/RECOVERY_BUILD_READBACK.json) · [Compiled HTTP checks](/Users/christaylor/Documents/Mewest/RESEARCH/soe-public-finish-2026-11-11/RECOVERY_COMPILED_HTTP.json).

## Preserved broad baseline

The reconciled local checks have **3,180 passed cases, zero remaining failures and five explicitly skipped historical observations** across 251 suite files. Full current lint has **zero errors**. This is the result of a broad run followed by focused repairs and reruns, not a claim that the original broad invocation passed unchanged. The machine-readable [receipt](finish-checks-2026-11-11.json) identifies the source, per-file outcome, log digest and originating run.

These results do not establish hosted database safety, a successful production recovery, a live customer payment, a signed native build or real-device acceptance. The combined Next build and browser receipts were also reviewed and are linked below, separately from the test-case totals.

## Baseline acceptance matrix

| Group | Suite files | Passed cases | Failed cases | Skipped cases |
| --- | ---: | ---: | ---: | ---: |
| Security | 12 | 123 | 0 | 0 |
| Growth | 20 | 235 | 0 | 0 |
| Web, including DOM and disposable SQL | 173 | 2,073 | 0 | 5 |
| Shared/native/Quest Node contracts | 46 | 749 | 0 | 0 |
| **Reconciled total** | **251** | **3,180** | **0** | **5** |

One historical file, `circle-participation-ordering-audit.test.mjs`, deliberately skips its five old ordering observations when the pinned historical implementation hash no longer matches. It is not counted as a passed file. The current implementation is covered by `circle-hosting-backend.test.mjs`; the old behavior was not restored to make an obsolete test green. There are 250 passed files and one explicitly skipped file.

The broad web/platform invocation inspected 217 files: 213 passed, one skipped, and three failed. The three failures were a reader fixture that did not follow the new Fragment, a static guard that described the former generic-room routes, and a native callback assertion that described the former unconditional URI removal. Each was corrected against the actual intended contract and rerun. The newly added UUID/legacy-route suite was included separately. All 12 security suites and all 20 growth suites were rerun on the final materialized source.

## Source and evidence provenance

Canonical checkout: `/Users/christaylor/Documents/Codex/soe-release`.

Private, materialized verification root:

`/Users/christaylor/Library/Application Support/Society of Explorers/Verification/2026-11-11-finish-checks`

Its `source/` snapshot was first read back against commit `17bfc5fc3af0c2e265db99e20653e95147220f26`: all **3,007 tracked files** matched the Git blob bytes, with no mismatches. After the final world-space public-read repair, all **3,010 tracked files** matched commit `7834733e83171e7282130017f3f40ad0d38e51bb`. `SOURCE_READBACK-17bfc5f.json` and `SOURCE_READBACK.json` record those results. Generated evidence and installed dependencies are outside the tracked-file assertions.

The original broad run started at `a4bc6a7`. The thirteen UUID-repair files later committed as `7d4922c` were copied into its snapshot at `2026-11-11T15:13:40.896764Z` while the run was active. That mixed timing is preserved in the receipt. The later room closure (`5746df9`), reader/native fixture fixes and public polish are covered by exact-source reruns after the source readback. No initial failure is erased from its original log. The final world-space repair was then verified in three focused suites (33 cases), and lint was rerun on that final source. The aggregate covers all 251 files in the current runner selection, with no missing or extra suite files.

Evidence below is relative to the private verification root:

| Evidence | Scope |
| --- | --- |
| `source/verification/web/evidence/finish-full-acceptance/summary.json` | Original 217-file web/platform run, including its three failures and historical skip |
| `source/verification/web/evidence/finish-current-affected/summary.json` | All security files plus reader, static guards, legacy-room/UUID, Live Council and native/public-link checks: 18 files / 182 cases |
| `source/verification/web/evidence/finish-current-growth-confirmed/summary.json` | Confirmed exact-source growth rerun: 20 files / 235 cases |
| `source/verification/web/evidence/finish-public-polish/summary.json` | Current fellowship, public trial and travel wording: four files / 28 cases |
| `source/verification/web/evidence/finish-world-privacy/summary.json` | Final active-only world reads, directory states and static-effect guard: three files / 33 cases |
| `source/verification/web/evidence/finish-final-lint.json` | 1,556 files, zero errors, 46 warnings |
| `source/verification/web/evidence/finish-portable-types-final.json` | Portable TypeScript check, exit 0 |
| `source/verification/web/evidence/finish-regenerated-quest-bundle-final/summary.json` | Separate regenerated Quest bundle, 17 integration cases |

## What was repaired and preserved

- **Runnable verification:** `npm test` now invokes the existing security/growth suites through `scripts/run-tests.mjs`. Web and platform groups have explicit scripts. Every suite gets a bounded independent process, a clean environment, startup HTTP/fetch denial, a log and an incremental receipt. A failure or timeout does not suppress later suites. Empty test files cannot count as acceptance; skipped files remain visible. Runner regression tests cover environment/network denial, empty/failed-suite continuation and termination of owned descendants on timeout.
- **Current authentication fixtures:** security and message tests now use actual selected-provider, selected-intent and session-receipt inputs, valid synthetic identifiers and request-body streams. They do not replace the production authorization handler with an always-allow stub. Retired routes assert their deliberate refusal and absence of provider/database effects.
- **Current SQL fixtures:** the disposable SQL chain includes the existing passage guards and tenth Bible edition. Exact migration/hash checks, public-profile boundaries and selected-account behavior remain exercised. No live SQL or production migration was run.
- **DOM compatibility:** the current browser-derived fixtures supply `navigator`, canonical member identity, paging envelopes and stylesheet doubles. Six repaired suites pass 82 cases, including incomplete-review safeguards. Reading context now locates the actual `BookReader` child and still checks duplicate input, invalid context and query redaction.
- **Static effect guards:** legacy generic-room endpoints now intentionally refuse with `legacy_rooms_unavailable`. The static checks and mutation tests require the no-write/no-provider boundary; they do not accept silent success. Shared UUID checks require actual validation before access. Current Live Council behavior remains a separate exercised path.
- **World privacy:** the final public list accepts only strict reviewed query values and reads active spaces; detail authentication precedes privileged client creation, and the active-space predicate precedes associated scans/annotations. Seven actual-handler cases use the installed database client with synthetic transport. Existing write handlers were not changed.
- **Lint scope:** historical vendored platform snapshots are excluded explicitly; narrowly scoped test-double/CommonJS conventions are allowed where necessary. Current first-party syntax, hooks and normal rules remain enabled. The 46 warnings are in test fixtures, verification scripts and platform preparation tooling; no `app/`, `components/` or `lib/` production file has a warning. A documented native anchor exception is retained for the global error screen, where the client router itself may have failed.

The existing fake authentication, DOM transport and disposable database boundaries remain explicit. They test behavior with synthetic data; they are not customer validation or substitutes for hosted authorization checks.

## Tooling, storage and reproducibility

The exact existing Bun **1.4.4** and JSDOM **30.1.3** lock was restored to the isolated `test-tools/` directory. Its source was the task-4 security-review tooling lock; SHA-256 is `b3b4c2ad3233fbb9820b038dc5a40caa864cc98ed9fd3a784cb669a73a0e051f`. The same lock is versioned under `verification/web/runtime/`.

The explicit install used `npm ci --ignore-scripts --no-audit --no-fund`, empty npm user/global configuration and only the existing public-registry lock. It installed 37 packages in 12.46 seconds, occupying approximately 122 MiB. No lifecycle script, private registry token, global install or payment was used. Bun and JSDOM are MIT-licensed; reused PGlite **0.4.1** is Apache-2.0. `test-tools/INSTALL.json` and `install.log` preserve the receipt.

The observed Node version was **22.22.1**. JSDOM declares `^22.22.2 || ^24.15.0 || >=26.0.0`; these passing DOM results are observed compatibility on a host one patch below that declaration, not supported-engine certification. A release verification machine should use a supported Node patch. No global upgrade was made.

Root and tooling dependency links now resolve to the already verified, materialized locked runtimes. Previous links were preserved with `before-finish-2026-11-11` names and remain ignored by Git. No project, personal file, backup or old runtime was deleted. Final storage observation was **14.00 GiB available**, above the 8 GiB floor.

The cloud-managed canonical checkout still contains offloaded files. Direct canonical execution first exposed an incomplete old dependency link; after preserving and correcting that link, two source-scanning suites stalled on offloaded files. Explicit source-residency checks also correctly refused offloaded native files. The identical tests pass in the materialized snapshot. These direct failures remain in their evidence folders and were not reclassified as source successes. The alternatives used were the existing runtime, an isolated exact-lock restore and the verified materialized source snapshot; no safeguards or test timeouts were weakened.

From a materialized repository with the documented installed tools, use:

```sh
npm test
npm run test:web
npm run test:platforms
npm run test:all
```

See [verification/web/README.md](../../verification/web/README.md) for portable setup, explicit selection, artifact paths and limitations. The runner does not install tools, load `.env` files or supply issued credentials. Its application-level network guard is not an operating-system network firewall.

## Combined build and compiled behavior

The release owner's final offline webpack build of `7834733` exited 0 in **44.7 seconds**, with no issued provider credentials and 1,263 unchanged input files. Its source digest is `fb3d43a6fec188f7fb9e1c93b959361c0e3cef44d9ffdbcac478780fb8fce0a2`. The [build receipt](/Users/christaylor/Documents/Mewest/RESEARCH/soe-public-finish-2026-11-11/finish-current-next-build.json) and [source receipt](/Users/christaylor/Documents/Mewest/RESEARCH/soe-public-finish-2026-11-11/CURRENT_SOURCE.json) were read back during this review.

Five [actual compiled-handler checks](/Users/christaylor/Documents/Mewest/RESEARCH/soe-public-finish-2026-11-11/COMPILED_BOUNDARY_CHECKS.json) passed: pending/archived public-world queries return 400, anonymous private detail and both room POST endpoints return 401, all with private/no-store responses. Four [final built-browser observations](/Users/christaylor/Documents/Mewest/RESEARCH/soe-public-finish-2026-11-11/FINAL_BUILT_BROWSER.json) verify the corrected trial/travel titles, singular filtered result and 390-pixel phone layout. These compiled checks use local anonymous/synthetic inputs; authenticated behavior remains the separately labelled fixture evidence above. They are not added to the 3,180 automated-case total.

## Platform limits

`platforms/tsconfig.portable.json` passes using existing dependencies. It deliberately excludes React Native adapters, including the account-deletion `Linking` handoff; actual native compilation remains the native build lane. Adding a pretend `react-native` type declaration would have hidden that dependency and was not done.

Native email-link policy tests verify source ordering and filtering: cold callbacks are consumed before `super.onCreate`, warm intent sanitization preserves only reviewed public links, private auth callbacks remain in the native lifecycle, and `clipData` is removed. This is static and shared-code evidence, not Android lifecycle execution on a device.

A separate Quest bundle was generated with the pinned Bun tool and passed 17 integration cases. The generated bytes differed from the tracked bundle (primarily compiler formatting/identifier output); no functional need to replace the existing artifact was identified, so it was left unchanged. The separate output, build receipt and hashes remain in `quest-build-check/`. Neither that build nor the 749 platform contract cases proves headset rendering, controllers, microphone access, native signing, store acceptance or real member use.

## Still separate from this pass

- Hosted restore, production access policies, real sign-in/recovery and two-account private-data checks require their own verified access and evidence.
- Native binaries, signing and actual iOS/Android/Quest device acceptance require the correct device/build lane. No store release or hardware claim is made here.
- A deployment still requires verification of the exact destination and current release boundaries. No code was pushed, no public release was made and no outside message was sent by this verification work.
