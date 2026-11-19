# Canonical source inventory and merge decisions

Observed 2026-11-04. This is a local source audit, not production clearance.

## Canonical repository

Keep Git history in `/Users/christaylor/society-of-explorers`; integrate in the linked worktree `/Users/christaylor/Documents/Codex/soe-release`, branch `codex/soe-first-release`, based on `soe-payments-fix-2026-10-24` commit `984e69b7b44f312d3eb273a7ad3b2e82c9af9f03`. Both the new branch and worktree path were absent before root created them. Do not replace or reset the dirty original checkout.

Original checkout at inventory: `codex/prompts-mvp`, HEAD `3a7795b317ac307dd2347dcd85c3637fa6cccc6b`; 279 modified tracked paths and 402 untracked files. Its only registered worktree at inventory was the original checkout. `prod-dpl-EMvs-2026-10-23` is an ancestor of growth and payments branches; original HEAD is not an ancestor of the recovered production branch. The payments base preserves recovered security/growth/payment history. Commits `e55dad1` and `2ab6d6c` were unavailable locally; no missing history was invented.

## Strongest sealed web/community/content source

`/Users/christaylor/Documents/Codex/2026-11-03/soe-discussions/candidate`: all 1,233 source files freshly hash-verified, zero mismatches.

- Manifest SHA256: `a9475d857e76c0423b882f8da3bd1dc070e2dcc54f19ce58f74676297b254248`.
- HANDOFF SHA256: `c66d9504a5fb5db261fcb5ed40015f9eb12391e55e7bae9f59681818a2d1b34e`; completed `2026-11-04T00:05:26.668621+00:00`; productionClearance false.
- Parent passages manifest: `9b160130bb066b98aa0abe5c882a6f6025f83b60b6547e91ab48f0a115eb3552`.
- Payments branch comparison: 706 tracked paths, 648 exact matches, 54 differing, 531 candidate additions. Four base-only paths are two gitignore files and two historical broadcast JSON files.
- Dirty original comparison: 353 exact shared files, 281 differing, 599 candidate-only; 186 changed/untracked original paths absent from candidate.
- `soe-discovery-search` is an unfinished descendant at initial inventory; root is verifying it separately before integration. Its status must not be inferred from the discussions seal.
- Root regression/SQL/browser drivers lived outside candidate in milestone `tests/` and `scripts/`; canonical verification must import and rerun them, not merely quote historical reports.

## Merge matrix

| Area | Decision |
|---|---|
| Great Books editions, book Circles, membership, moderation, archive/replies, supporter and legacy billing | Retain latest verified candidate; reconcile actual new changes through tests |
| Signed wallet v2 expiry, signed SIWE nonce, canonical signatures, deterministic wallet recovery | Retain candidate; older dirty checkout lacks these improvements |
| Auth field projections, authenticated body parsing order | Restore selected original protections without replacing newer functionality |
| Server-only module boundaries | Restore with bundler and fixture loader verification |
| Redirect validation | Combine original encoded slash/backslash checks with candidate control-character checks in one shared helper |
| Private response headers and attachment filename bounds | Reconcile selected original protections; preserve intentional media/device capability requirements |
| Identity linking | Remove display-name/email based reassignment; authenticated subject is the only provisioning authority; deliberate linking remains future work |
| Email consent | Sign-in/provisioning must not subscribe or reactivate unsubscribed email preferences |
| Prompt Atlas/revenue shortlinks/automation reports | Preserve original work; do not silently import unrelated product changes into first release |

Core source differences identified: `lib/auth/getSession.ts`, `lib/auth/walletSession.ts`, `lib/auth/loginForm.ts`, `lib/getAuthenticatedMember.ts`, `lib/supabase/admin.ts`, `lib/supabase/server.ts`, `lib/http/routeError.ts`, `proxy.ts`, `app/api/auth/ensure-member/route.ts`, `app/api/auth/siwe/route.ts`, `app/api/auth/nonce/route.ts`, `app/auth/callback/route.ts`, `app/login/page.tsx`. Original-only `lib/auth/redirectPath.ts`, `lib/auth/cron.ts` and targeted privacy/auth smoke tests require selective assessment, not wholesale copying.

## Other repositories and source families

- `Documents/GAME SOE`: `codex/field-alpha` at `263ecff62e4afb1043b707779e96323d37abcdd9`, eight untracked files. Synthetic Field Alpha game; not the community app.
- `Documents/SOEAI`: clean `codex/revenue-takeover`, `936a012e340b12580d21ac9de6edcc368057be22`. Local-search service prototype; not app source.
- `.soe-genesis`: clean `main`, `42911cf5eb79300ba96f191aa7040558e63cb8d6`. Automation.
- Nov1/task4 has eighteen separate handoffs, including recovered 753-file October27 source, web participation, platform/native connection, transport/storage, review and account authority. No handoff clears production.
- `soe-account-authority-contract/HANDOFF.json` SHA256 `86bd6684126a2cc32aac3bb470add48c37abe29abd01d8c12d1fa6d11ebe8fd1`: mock contract only, productChanged false, nativeAuthorityImplemented false, no complete candidate directory. It is not the app.
- Native/Quest source is in separate candidate trees (`corrected-backend`, `source`) and must be deliberately integrated. Exports/tests do not prove device acceptance. Latest native handoffs report unconfigured default bootstrap and missing durable native cross-process authority.
- Older Oct15/task5 Git markers: `soe-homepage-release` detached at `f390e351c0ae4eb2c6be8a1ec2e2cebbbf37bf59`; status/log reads timed out. `soe-local-integration-review`, `soe-mobile-repair-review`, `soe-mobile-review` Git reads timed out (3s). State is unverified, not absent/abandoned.
- Older Oct17 messaging/session recovery and Oct20 library/community candidates remain preserved. Other agents assess strongest portable/native/Quest pieces.

Coverage: targeted home/Documents named SoE roots, Documents/Codex dated/task names through depth4, all Nov1/task4 and Nov3 handoffs, and Nov4 directory inventory. `.codex/worktrees` was absent. This does not claim a full-volume forensic scan or remote freshness. No credentials/env payloads, provider accounts or production data were inspected.

## Remaining release proof

Canonical rerun of integrated suites/build/browser flows; actual authenticated provider behavior; production schema/grants/RLS and later October28 delta reconciliation; complete native bootstrap and device acceptance; Quest UX/headset validation; rights by content/territory; moderation operations and retention. Existing candidate seals are evidence for their own scope only. No deployment or production changes authorized by this document.
