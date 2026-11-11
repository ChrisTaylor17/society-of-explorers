# SoE finish checklist

Updated 2026-11-11. Target: a usable, honest public trial, followed by verified member features. Local completion is not a claim that the public domain runs this app or that hosted private data is safe.

Restore point: `7020eb5` on `codex/soe-first-release` preserves all 93 pre-existing changed files, including the unfinished reader fallback. Nothing was pushed.

## Ordered work

- [x] Save the existing work in a local restore commit without exposing credentials.
- [x] Inventory the tracked repository, release records, open issues, tests and user-visible unfinished work. The audit distinguishes an enumerated tree/core-journey review from a line-by-line review of every archived file. GitHub returned no open canonical-app issues. [Audit](docs/integration/finish-audit-2026-11-11.md).
- [x] Make the free reading journey recover without JavaScript, keeping exact edition checks and full source credits. Six focused groups, lint, full build and twelve before/after browser observations pass. [Evidence](docs/integration/reader-noscript.md).
- [x] Implement the public trial entry, direct reading/Scripture/salon paths and user-reviewed support email link; remove false travel activity, no-op member/mint controls and seeded homepage collaboration. Focused tests/lint pass; combined phone-browser acceptance is the separate item below. [Trial](docs/integration/public-trial-2026-11-11.md) · [Travel](docs/integration/travel-reading-2026-11-11.md) · [Additional repairs](docs/integration/finish-audit-2026-11-11.md).
- [x] Run the offline security/growth/web/platform checks and full lint. Reconciled outcome: 251 suite files accounted for, 3,180 passed cases, zero unresolved failures and five explicit historical skips; lint has zero errors and 46 fixture/tool warnings. The full current Next build/types passes on `7834733` with 1,263 unchanged inputs. [Check report](docs/integration/finish-checks-2026-11-11.md) · [Final build receipt](/Users/christaylor/Documents/Mewest/RESEARCH/soe-public-finish-2026-11-11/finish-current-next-build.json).
- [x] Check the combined app in a browser: navigation, Scripture/context, full reading, text sizing, salon plan, error recovery, keyboard, no JavaScript and 320/390/1280 layouts. Nineteen observations retain the initial test-gateway mistake and its corrected rerun; four final-build checks verify the title/singular wording corrections. [Browser record](/Users/christaylor/Documents/Mewest/RESEARCH/soe-public-finish-2026-11-11/BROWSER_CHECKS.json) · [Final build checks](/Users/christaylor/Documents/Mewest/RESEARCH/soe-public-finish-2026-11-11/FINAL_BUILT_BROWSER.json).
- [x] Replace boilerplate instructions with the actual public links, verified local preview/restart command, test commands, exact-source requirements and limits. [README](README.md).
- [x] Prepare the additive public website update: homepage entry, complete Apology, Scripture comparison and source/feedback links. Nine acceptance groups and thirteen browser observations pass. All 87 existing access redirects and 182 untouched old files are preserved; only one old homepage link and six additional rewrites change existing files. [Reviewable package](docs/integration/static-public-reading-candidate-2026-11-11.md).
- [ ] Reconcile final source, commits and evidence; leave every checklist item verified or explicitly blocked.

## Member and release dependencies to resolve or mark blocked

- [ ] **BLOCKED — hosted backup/restore:** the latest existing hidden-entry result is `NOT_READY_NO_PASSWORD_REQUESTED`, not a successful database login. The November 11 recheck read only that generic status and file metadata. Recovery procedures, provider records and the existing entry mechanism were cross-checked; no password was read, guessed or reset. [Current access receipt](/Users/christaylor/Documents/Mewest/RESEARCH/soe-public-finish-2026-11-11/RECOVERY_STATUS.json).
- [ ] **BLOCKED — hosted member release:** applying and testing the actual schema/access controls, real sign-in/recovery and two-account denials depends on the verified recovery step and real account/provider access. The prepared containment and local SQL tests are not hosted acceptance. Member intake stays unavailable.
- [ ] **BLOCKED — complete account erasure/provider services:** local deletion-request, privacy and per-message consent contracts pass; actual erasure/retention, real delivery and named-provider operation are not verified. Intake, AI moderation and paid/provider services remain closed where their promised outcome cannot be fulfilled. The free public trial needs none of them.
- [ ] **IN PROGRESS — Android package reconciliation:** compare current reader changes with the preserved November 10 APK and existing compilation receipts; build a current isolated debug package only with installed tools and the 8 GiB free-space floor. Signing/store releases, actual phones, iOS tooling and Quest hardware remain separate.
- [ ] **BLOCKED — publish the prepared static update:** the exact existing Vercel project, Git source and immediate rollback are verified. Its billing shows metered build/storage usage; a new deployment cannot be assumed free. The older spending reserve is not silently reactivated. No new release or charge occurred. [Destination](docs/integration/public-phone-release-options-2026-11-11.md) · [Cost boundary](/Users/christaylor/Documents/Mewest/RESEARCH/soe-public-finish-2026-11-11/HOSTING_COST_BOUNDARY.json).
- [ ] **BLOCKED — paid member offer/real cohort:** no verified hosted account/payment/fulfillment path or confirmed host and dates. Keep the optional supporter offer closed; the free readings and self-arranged salon planner work without a purchase. Tokens, investment, hardware promises and separate ventures are not activated by this finish pass.

## Completed corrections within this pass

- [x] World directory: failed/malformed requests show unavailable and explicit retry; a confirmed empty result alone shows zero spaces. [Evidence](docs/integration/world-directory-recovery.md).
- [x] Music interest: require a real success receipt, preserve inputs on failure, prevent overlapping submissions and retire timed-out responses. Nine offline component groups pass; no actual submission was sent. [Evidence](docs/integration/finish-audit-2026-11-11.md).
- [x] Growth checks: 20 files / 235 tests pass using current account receipts and profile-filtered synthetic fixtures; correct two duplicated page titles. [Evidence](docs/integration/growth-reconciliation-2026-11-11.md).
- [x] Replace malformed UUID checks in nine legacy routes while retaining current authority/provider gates. Root review caught an unsafe expansion of generic room writes: both generic creation and mutation endpoints now explicitly refuse before any database/provider effect. Dedicated Live Council remains separate; no mounted generic-room client was found. Commits `7d4922c`, `5746df9`.
- [x] Protect unpublished spaces and full location details. Anonymous directory queries accept only active summaries; full details require verified membership and active status before scans/annotations are read. Existing creation and owner mutation functions remain unchanged. Eleven focused checks and twenty-two static guard/regression checks pass. Commit `7834733`.
- [x] Confirm the compiled local routes reject pending/archived directory requests and anonymous detail/room operations with private, non-cacheable replies. Five actual HTTP checks pass; no real account or provider request was sent. [Receipt](/Users/christaylor/Documents/Mewest/RESEARCH/soe-public-finish-2026-11-11/COMPILED_BOUNDARY_CHECKS.json).

## Evidence and limits

Earlier dated receipts remain in `RELEASE_STATUS.md` and `docs/integration/`; they are reused only for the source and scope they actually tested. Test failures, the stopped build after a Python-version preparation error and cloud-source read failures are retained, followed by their successful alternatives. Nothing is relabeled as customer use, revenue, hosted safety or device acceptance. Deferred legacy programs and proposed tokens/hardware are not completed services.

## Owner-only dependencies

No owner action is requested while independent work remains. Record exact money, missing-login or irreversible-action dependencies here after the available alternatives are checked. Do not keep retrying authentication or alter production merely to meet a retry count.
