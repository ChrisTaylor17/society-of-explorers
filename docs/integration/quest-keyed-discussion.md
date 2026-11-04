# Quest keyed discussion composition

The active `/quest/[circleId]` member view now supports a new discussion root and replies through the same canonical preview, keyed POST and receipt protocol as the regular member discussion. No write occurs on mount, Connect, member Check, archive navigation or preview. A contribution posts only after its exact server preview is reviewed and the confirmation checkbox is selected.

The platform-owned DOM renders the shared writer model. The existing 19 reader/flat-composer IDs remain required. The 17 `circle-thread-*` controls form an optional complete island: older markup without them retains its existing reader/flat composer, partial new markup is rejected before subscriptions, and the active React page supplies all controls. A trusted `window.crypto.randomUUID()` callback supplies request keys; no random fallback or credential input was added. Rejected input is restored from the exact controller model. Preview text preserves whitespace. The confirmation label and visible controls were checked at 320px, including keyboard confirmation.

Unknown outcomes retain the exact request key and serialized body. Recovery uses only manual receipt lookup or exact retry; archive/new-key/legacy write controls are disabled while pending. A missing receipt is not displayed as proof of failure. A confirmed restricted/withdrawn receipt does not restore its former body. Opening the saved thread is a separate user action. Drafts, parent context, previews and receipt state retire on account/activity/connectivity/view changes. Report/withdraw links open the corresponding contribution in the regular member discussion; this slice does not implement or claim Quest-native report/withdraw controls.

## Actual composed evidence

`platforms/tests/browser-quest-thread-composed.mjs` mounts the actual `QuestCircle.tsx`, member-auth bridge, DOM view and generated shared host. `verification/web/tests/support/platforms-thread-app.mjs` executes the actual `/api/auth/member`, discussion preview/POST/receipt/archive/thread handlers against the current strict Circle SQL in disposable PGlite, with RPC names and argument names checked against its catalog. The receipt verifies both generated host bytes and the successful shared build's underlying TypeScript source manifest before and after execution.

Eight stories cover:

- No SDK methods or private request before manual Check, and selected provider/subject mismatch before any private RPC. Connect explicitly instantiates the synthetic SDK owner, without calling its methods.
- New root: preview writes no row, unchecked confirmation cannot send, one actual SQL receipt is followed only by an explicit thread GET and persisted-content check.
- Reply: verified root, canonical full-content suffix, reduced comment limit, exact parent/root linkage, actual thread readback and regular-view safety link.
- Lost committed response: unknown controls block navigation/new keys; manual receipt lookup observes an actual author withdrawal as a tombstone, without POST or revived content.
- Exact retry: byte-identical request body/key returns the real SQL replay receipt and creates no duplicate contribution.
- Human restriction after preview: SQL refuses stale parent evidence; a null lookup stays unknown.
- Held preview and committed-post replies: provider selection/SDK logout clear private state synchronously and late replies cannot restore it or trigger recovery.
- Unmount: SDK observation and the DOM host are disposed without a late request.

The earlier eight archive stories were rerun on the current UI/host: 27 actual handler GETs, all 108 contributions across five pages, nonmember denial, tombstones and retirement remain verified. Their original six artifacts are preserved byte-for-byte in `platforms/evidence/quest-read-29a6459-before-keyed/`; `preservation.json` records the original paths/hashes. Existing older archives and the separate Quest7 evidence were not edited. The new writer runner preserves prior PASS/FAIL receipts within `priorReceipt`; its first failed attempt was a copied old-fixture assertion that incorrectly prohibited legitimately visible baseline content, not an application failure.

The final receipt, source hashes, commands and static checks are recorded below.

## Boundaries

Identity verification is explicitly synthetic: the SDK's `getSession`/exact-token `getUser`, SDK events, selected cookie authority and `getAuthenticatedMember` are fixture ports with nonissued credentials. Executing the actual auth/member handler does not establish real provider/cookie verification. Public build configuration is synthetic. HTTPS requests are fulfilled only inside Playwright; no DNS/provider/application endpoint is contacted. The fixture uses bounded NextResponse/PostgREST and NextLink ports, actual React and Bun CSS modules. The strict SQL fixture retains its documented synthetic rows, sanitized catalog exceptions and single-backend limitations; it is not a production restore, concurrent-backend lock proof or applied migration.

This is browser/API/SQL acceptance for root/reply and manual recovery. It does not establish Quest headset/controller/immersive behavior, Android/iOS compilation, real native secure identity/storage/transport, live member acceptance, production deployment or provider calls. Production migrations remain unapplied in this task. No package installation, native SDK download or account/signing operation was performed.

## Reproduction

From the canonical repository root, use the already materialized Bun, clean environment and startup deny guard:

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/christaylor \
  ./verification/web/tooling/node_modules/@oven/bun-darwin-aarch64/bin/bun \
  --no-env-file --no-install --preload ./verification/web/scripts/deny-build-network.cjs \
  platforms/tests/bundle-quest-thread-composed.mjs
```

From `verification/web`, run only the intercepted browser fixture with the explicitly cached Playwright and Chromium:

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/christaylor \
  SOE_PLAYWRIGHT_PACKAGE=/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright \
  SOE_BROWSER_EXECUTABLE='/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' \
  node --require ./scripts/deny-build-network.cjs \
  ../../platforms/tests/browser-quest-thread-composed.mjs \
  > ../../platforms/evidence/quest-thread-composed.log 2>&1
```

Stat named inputs/runtimes first and refuse offloaded/symlink/non-file inputs. Do not run aggregate platform scanners or hydrate dependencies. Regenerate the shared host only from reviewed canonical source with `platforms/scripts/build-shared.py` under the same clean guard if its graph changed; a stale generated host fails this proof.

## Frozen result and hashes

Final keyed composition: **PASS 8/8 stories, 56 actual handler requests**, owned browser and database closed, empty page/console/unexpected-request/route-error arrays. Runtime: Node22.22.1, Bun1.4.4, Chromium149.0.7827.55. The final rerun clarified that Connect instantiates the SDK fixture but calls no SDK methods; previous receipts remain nested. The original archive regression also passed **8/8,27 GETs** on current source. Scoped Quest TypeScript and three-product-file ESLint both exited0 under the clean startup guard; `quest-thread-static.json` binds the exact checked files/commands. No product bytes changed after these checks.

| File | SHA256 |
| --- | --- |
| `app/quest/[circleId]/QuestCircle.tsx` | `678519735ba29931b9b65ca5c40c67931f24423b5b540b3d4b636a6528bb48e9` |
| `platforms/quest/circle-view.mjs` | `06006e222afe0676487811654985dd22a2d0e3ce05fab63dc098d5dff7815027` |
| `platforms/quest/member-circle-page.mjs` | `f938cc343946f67d629e68c59381a16e0744bfa2fcd943592036b3075a30bb8c` |
| `platforms/tests/browser-quest-thread-composed.mjs` | `390c096d5e98e9d9759d3811b12d00286ca0bd3033bb57809e47716c6bff0684` |
| `platforms/tests/bundle-quest-thread-composed.mjs` | `23d33262ff9c8816e081f34dca808b4b7cc2236bb8856cb48f449568f1f16329` |
| `platforms/tests/quest-thread-composed-entry.tsx` | `d0da702689fc97b3cb5d8bb2d7450ae21d2009e17341f3b45bfa78ba23abe704` |
| `platforms/tests/tsconfig.quest-ui.json` | `091524a9bdce8203fdd3f45229f3cf65381a2a1c4ea830cad0ae185678661306` |
| `platforms/evidence/quest-thread-composed.json` | `e45136f0ba06dcd693769210bbbd01875e9acb613a71ab60875e0cabf13d960c` |
| `platforms/evidence/quest-thread-composed.log` | `814c15bf74b2351906b50a1985e2a002ecebdf910667c1415485f74d3044adcf` |
| `platforms/evidence/quest-thread-composed-320.png` | `968e68b7650835ab6af26ee14823b48007b9943f8599d4b67338868f337c2356` |
| `platforms/evidence/quest-thread-static.json` | `a27a58d34b155bc6f6fb53ba0d359721a1bb705063a8fe18b20064ee8f11ccfb` |
| `platforms/evidence/quest-member-composed.json` | `51b8b6a8f55dd586e45edc2ccc41a554c7ae82aba625b8ce8a64383c8368bc7f` |
| `platforms/evidence/quest-read-29a6459-before-keyed/preservation.json` | `061aea1f2b7be630960bb0c716792c65bc6a11244fe4a8d56a67961ec437f276` |
| `platforms/evidence/quest-thread-composed-fixture/source-manifest.json` | `6785f59d8ae72ca5e53cd8b8a03dc48b1a87b1a1d936e82b24bec769330565d0` |
| `platforms/evidence/quest-thread-composed-fixture/page.js` | `0a1340dbcc93c391485c5d244a2d932f7b88a67f63bb0bae5c7d0e6545a4d20e` |
| `platforms/evidence/quest-thread-composed-fixture/page.css` | `5fd1eaf1efc6d140987709158842f96f4e2184353f6c068938f9be742930f839` |
