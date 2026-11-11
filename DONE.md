# SoE finish checklist

Updated 2026-11-11. Target: a usable, honest public trial, followed by verified member features. Local completion is not a claim that the public domain runs this app or that hosted private data is safe.

Restore point: `7020eb5` on `codex/soe-first-release` preserves all 93 pre-existing changed files, including the unfinished reader fallback. Nothing was pushed.

## Ordered work

- [x] Save the existing work in a local restore commit without exposing credentials.
- [x] Inventory the tracked repository, release records, open issues, tests and user-visible unfinished work. The audit distinguishes an enumerated tree/core-journey review from a line-by-line review of every archived file. GitHub returned no open canonical-app issues. [Audit](docs/integration/finish-audit-2026-11-11.md).
- [x] Make the free reading journey recover without JavaScript, keeping exact edition checks and full source credits. Six focused groups, lint, full build and twelve before/after browser observations pass. [Evidence](docs/integration/reader-noscript.md).
- [x] Implement the public trial entry, direct reading/Scripture/salon paths and user-reviewed support email link; remove false travel activity, no-op member/mint controls and seeded homepage collaboration. Focused tests/lint pass; combined phone-browser acceptance is the separate item below. [Trial](docs/integration/public-trial-2026-11-11.md) · [Travel](docs/integration/travel-reading-2026-11-11.md) · [Additional repairs](docs/integration/finish-audit-2026-11-11.md).
- [ ] Run the existing offline security/growth/web checks and full lint, resolve failures, then build the combined current source. Record exclusions and failures rather than relabeling them as passes.
- [ ] Check the combined public trial in a browser: navigation, Scripture/context, free book reading, salon plan, recovery and narrow-screen layout. No fabricated accounts or payments count as live acceptance.
- [ ] Replace boilerplate run instructions with exact verified startup/trial instructions and record the remaining release dependencies below.
- [ ] Reconcile final source, commits and evidence; leave every checklist item verified or explicitly blocked.

## Member and release dependencies to resolve or mark blocked

- [ ] Hosted backup and isolated restore: inspect existing authorized recovery records; a real database login has not yet been verified. Never read a password into chat or reset it.
- [ ] Hosted privacy, account sign-in/recovery and two-account access checks: keep member intake unavailable until real recovery and access-denial evidence exists.
- [ ] Account deletion, retained-data disclosures and provider consent/cost controls: verify what can work locally and hold capabilities that cannot yet make their promised outcome real.
- [ ] Android, iOS and Quest: reconcile current builds and local checks; separate signed builds and physical-device acceptance from simulations.
- [ ] Live domain/release destination: verify its actual source and rollback path before any release; the current static public site and this member app are different products/deployments.
- [ ] Sales/paid delivery: do not expose an unverified checkout or promise a cohort, device, token or AI service that cannot be delivered. Keep separate ventures and ownership decisions intact.

## Completed corrections within this pass

- [x] World directory: failed/malformed requests show unavailable and explicit retry; a confirmed empty result alone shows zero spaces. [Evidence](docs/integration/world-directory-recovery.md).
- [x] Music interest: require a real success receipt, preserve inputs on failure, prevent overlapping submissions and retire timed-out responses. Nine offline component groups pass; no actual submission was sent. [Evidence](docs/integration/finish-audit-2026-11-11.md).
- [x] Growth checks: 20 files / 235 tests pass using current account receipts and profile-filtered synthetic fixtures; correct two duplicated page titles. [Evidence](docs/integration/growth-reconciliation-2026-11-11.md).

## Evidence and limits

This file starts the new finish pass. Earlier dated receipts remain in `RELEASE_STATUS.md` and `docs/integration/`; they are reused only for the source and scope they actually tested. The finish audit and check report will link current results. No customer use, revenue, hosted safety or device acceptance is implied by generated drafts or offline tests.

## Owner-only dependencies

No owner action is requested while independent work remains. Record exact money, missing-login or irreversible-action dependencies here after the available alternatives are checked. Do not keep retrying authentication or alter production merely to meet a retry count.
