# Quest member discussion composition

2026-11-04: **8/8 composed Chromium stories PASS**, 27 actual handler GET requests; owned browser and disposable database closed, with zero unexpected requests, page errors, console errors or route errors. The only product correction suppresses the retired flat-conversation status while the archive/thread view is open (`platforms/quest/circle-view.mjs`); the archive status owns that view. Per-page and thread regressions confirm the contradictory status stays empty. This adds database/handler composition to the earlier seven-story Quest component fixture; it does not establish real authentication, a native bridge, immersive XR or headset acceptance.

## Executed closure

The bundle executes the actual `app/quest/[circleId]/QuestCircle.tsx`, `lib/circles/quest-member-auth.ts`, shared provider-selection notifications, `platforms/quest/member-circle-page.mjs`, `circle-view.mjs` and generated `circle-host.mjs`, with actual React and Bun CSS modules. The API boundary executes actual `app/api/auth/member/route.ts`, member DTO projection, `app/api/circles/[circleId]/discussion/route.ts`, `lib/circles/thread-server.ts` and discussion parsing.

`verification/web/tests/support/quest-member-app.mjs` binds those handlers to `createReviewCoverageDb({reportCount:0})`. Its narrow PostgREST adapter resolves actual SQL argument names, refuses unexpected RPCs/arguments, then executes the actual discussion functions as `service_role`. No authorization or visibility response is canned. The fixture installs the strict legacy baseline plus nine Circle migrations, consent, inactive allowance and review coverage: 14 SQL files including baseline preflight/apply. Every source/SQL digest is recorded and checked again after the run.

Authentication **verification remains synthetic**: `getAuthenticatedMember`, SDK `getSession/getUser(exact token)` and SDK events are explicit ports, using nonissued fixture credentials/subjects. The actual member handler does not make its underlying mocked authentication real. Cookie-only metadata selection and bearer-to-member mapping are independently configurable to test mismatches. NextResponse is the existing offline transport shim, and NextLink is an anchor adapter. Public provider config is a fixed synthetic bundle constant; all page/asset/API HTTPS requests are locally fulfilled, without contacting that provider hostname.

The database is a sanitized three-table catalog rehearsal with synthetic members, administrative roles, external FK/default exceptions and contributions. The base helper records these exceptions; it is not a hosted restore or proof of multi-backend lock scheduling. The 105 tied historical roots are direct owner fixture setup. Two replies use the actual discussion-post RPC; actual author withdrawal and human restriction RPCs create their tombstone context. These setup operations are not browser writes or a claim of user decisions.

## Eight stories

1. Mount performs no SDK construction, SDK method or private request. Explicit Connect constructs only the synthetic SDK. Manual Check calls the actual cookie-only member handler, with no Circle RPC.
2. Selected wallet/provider and mismatched Supabase subject metadata refuse the retained SDK identity before any private RPC.
3. A matched synthetic identity with a reviewer grant, but no Circle membership, reaches actual service-role discussion SQL and receives PT403/HTTP403.
4. Actual archive GET/parser/keyset SQL traverse all 108 contributions in five pages (25/25/25/25/8), exactly matching database order with no duplicates or legacy 100 cutoff.
5. A restricted root and withdrawn reply expose null text and tombstones; an independent visible reply remains readable. Responses contain only the discussion whitelist, with no reports, hashes or identity/profile fields. Actual CSS stays within 320px and thread controls meet 44px height.
6. Shared provider-selection notification clears private thread DOM synchronously and removes SDK observation without an automatic check/read.
7. Held responses already computed by actual SQL cannot restore private archive data or trigger more requests after provider change or SDK logout.
8. Unmount removes the platform DOM host and SDK observation with no late request. Final PASS is written only after bounded cleanup and final error checks.

This exercises **discussion GET/archive/thread reading only**. The flat conversation endpoint, composer POST, issued session/cookie verification, hosted PostgREST, provider acceptance, real Quest Browser and headset input/lifecycle remain outside this proof. The separate Next build/browser evidence covers its own runtime; this standalone component bundle does not substitute for it.

## Reproduce without downloads

Stat each named runtime/source first and refuse nonempty zero-block/offloaded files. Use the already cached runtime paths below; no install or provider operation is needed. From the canonical repository root:

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/christaylor \
  ./verification/web/tooling/node_modules/@oven/bun-darwin-aarch64/bin/bun \
  --preload ./verification/web/scripts/deny-build-network.cjs \
  platforms/tests/bundle-quest-member-composed.mjs
```

Then from `verification/web`:

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/christaylor \
  SOE_PLAYWRIGHT_PACKAGE=/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright \
  SOE_BROWSER_EXECUTABLE='/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' \
  node --require ./scripts/deny-build-network.cjs \
  ../../platforms/tests/browser-quest-member-composed.mjs \
  > ../../platforms/evidence/quest-member-composed.log 2>&1
```

Runtime: Node v22.22.1, Bun 1.4.4, Chromium 149.0.7827.55. The runner writes RUNNING before setup, source-checks before/after, retains a previous receipt if rerun, and bounds owned cleanup. Network startup deny is mandatory.

The first successful composition receipt is retained inside the final receipt as `priorReceipt` (SHA256 `70f57eb4b8e002c5865dfd54ce4ba3562f852f052e1825ee7328cfb665175a72`), preserving the pre-status-fix result. Final composition was rerun against regenerated source-bound assets.

## Frozen digests

| File | SHA256 |
| --- | --- |
| `platforms/tests/quest-member-composed-entry.tsx` | `eeb31bd83ea85de22104bdf9722038ed57c5257384c5d2e87bd214d158c67446` |
| `platforms/tests/bundle-quest-member-composed.mjs` | `0dc51e4e1015640c06f907326213d82d98d356dd6f4d1088f991d2df7b2e2ed2` |
| `platforms/tests/browser-quest-member-composed.mjs` | `5741ab46bf7763a27f9ec05c4f190033d05d57781513370a907905c03e1b46d3` |
| `verification/web/tests/support/quest-member-app.mjs` | `ed368c3adeec85a8549a3952c67d64e0a8cd553a7e28cca5649e2ce933b8cf2b` |
| `platforms/quest/circle-view.mjs` | `7f1b9400d8ce515bdf08544b85e35f9faa96a4e36ec291f5a904c555635678ab` |
| `app/quest/[circleId]/QuestCircle.tsx` | `49c997d44196ba674bb6f94e5436630d371d202457d449648c205b65f32ecca9` |
| `docs/sql/circle-review-coverage.sql` | `f084889a4917d17e08562c330de9372c098f6f1e0d79fc415d6400dc833d8cc4` |
| `platforms/evidence/quest-member-composed.json` | `0843a43a7fb044821d3318954dc09e4e74d884a2ce1f7a7704b0ab6564b6d373` |
| `platforms/evidence/quest-member-composed.log` | `25e03581f0a31c2f5296cd53410c41235e690582495764684d9911563d1a0603` |
| `platforms/evidence/quest-member-composed-fixture/page.js` | `99d7778164b3f7fa62690c84e557765004b66362d33a876141d24fe3a5f6cf3a` |
| `platforms/evidence/quest-member-composed-fixture/page.css` | `5fd1eaf1efc6d140987709158842f96f4e2184353f6c068938f9be742930f839` |
| `platforms/evidence/quest-member-composed-fixture/source-manifest.json` | `e05c066f36c7f7fcb49b637db19f7be04204496ef102b6f01f07a4df9958b3c0` |
| `platforms/evidence/quest-member-composed-320.png` | `d95e420189852be30bb32a2f2ef5bcfa94f42879d49f9e6778627eed490af6b8` |

Prior Quest7 evidence was not overwritten: `platforms/evidence/quest-page-browser.json` remains `85d38802e6162b91410d7b5b03e5a7a109a3e2058676450357afadfee4bf99ea`; its `quest-page-fixture/page.mjs` remains `b484f417f0c0848978b9a3b83fb86d1fe9f928017ef9bcc1a224e66c818e10bc`.
