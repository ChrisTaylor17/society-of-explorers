# Quest message safety

The active /quest/[circleId] view now offers **Check message actions** on loaded archive/thread contributions. A fresh canonical message-state GET supplies the only report/withdraw permissions. Selecting it first clears cached archive/flat content and keyed parent/preview state; it does not reuse is_mine or visibility as authorization. Hidden and withdrawn contributions can still be checked. In particular, an author's hidden contribution may remain withdrawable after membership ends.

The new 17-ID circle-safety* DOM island sits outside the archive. It is independent of the existing 19 required reader controls and optional 17-ID keyed writer. Absent safety markup preserves older behavior; partial markup refuses mounting. Real DOM duplicate known IDs refuse preflight before member bindings; lightweight test DOMs without querySelectorAll retain completeness checks. The member bootstrap is unchanged: its existing preflight and trusted async crypto.randomUUID factory serve both writers. No credential input/storage or new identity mechanism was added.

Reports require a reason, optional private note of at most 1000 characters and explicit confirmation. Editing reason/note clears confirmation, and rejected input is restored from the actual model. Copy asks for conduct rather than political/religious disagreement and describes a report as an allegation, not a finding. Withdrawal requires its separate irreversible-view-removal acknowledgement and explicitly discloses that restricted evidence may remain and retention policy is unfinished. AI consent remains separate; no consent/advice endpoint is called.

A lost, malformed or stale-action response remains unknown. While pending, its exact key/body survives manual **Check current message**; that GET is not receipt lookup and cannot confirm the earlier action. Only **Retry exact report/withdrawal** can return the canonical POST replay receipt. Pending actions block new actions, target/navigation changes and both legacy/keyed writing. Authorization/unavailability responses 401/403/404 and global close/account/activity/connectivity changes retire private state and pending keys; a previously sent action may nevertheless complete. No automatic retry, refresh, moderation decision or provider request was added.

## Composed acceptance

platforms/tests/browser-quest-message-actions-composed.mjs executes actual QuestCircle, DOM view, generated shared controller/host, canonical auth/member + discussion GET + message GET/POST handlers and current strict Circle SQL in disposable PGlite. The new platforms-message-actions-app.mjs helper checks service RPC names/argument names; successful POST replies are dropped only after actual SQL commit. Its predecessor thread helper/driver and prior proof outputs were not overwritten.

**PASS 8/8 stories, 56 actual handler requests; owned browser/database closed; no page, console, route or unexpected-request errors.** The proof binds 60 unique paths (46 nonSQL + 14 SQL), including generated-host provenance and its 16-input source manifest. The JSON stores 60 sourceHashes and repeats the same 14 SQL bindings in sqlHashes; those are not 74 distinct files. All 60 were independently rehashed unchanged after the helper/controller freeze.

Covered:

- Independent/legacy/partial islands, duplicate preflight and no SDK methods/private request before manual Check; selected provider/subject mismatch before private RPC.
- Fresh report capability, explicit fields/checkbox, private real SQL receipt without automatic hiding or AI consent.
- Lost committed report, unknown-state GET, byte-identical manual retry and no duplicate report.
- Another actual report after the checked snapshot invalidating the checked revision; stale POST 409 remains unknown instead of claiming success/failure.
- Held real checked-state/committed-action replies retired by provider selection or SDK logout, without restoring private text/note/receipt or triggering recovery.
- A previously loaded author-owned hidden contribution: actual leave RPC removes membership, fresh state still permits withdrawal, lost withdrawal reply/current tombstone GET stays unknown until exact SQL replay.
- Another member reads the actual withdrawal tombstone without author-only explanations or report notes.
- Unmount disposal; 320px/no-overflow/44px controls, keyboard confirmation and model-aligned input. The final tombstone screenshot was visually reviewed.

Scoped Quest TypeScript and ESLint of all three active Quest integration files exited 0 under a clean environment/startup deny guard. The static receipt binds checked files and exact commands; their clean stdout/stderr logs are empty. No product change followed those checks. Independent canonical-agent source review found no actionable issue.

## Scope limits and reproduction

Identity/SDK methods/events, selected-cookie authority and getAuthenticatedMember are explicit synthetic fixture boundaries with nonissued credentials. Actual auth/member handler execution does not prove real provider/cookie verification. NextResponse/PostgREST/NextLink are bounded offline ports; React, CSS modules, canonical parsers, handlers and SQL execute. All fixture application requests are fulfilled on a virtual HTTPS origin; no provider/production endpoint is used.

This is one disposable PGlite backend with the existing sanitized-catalog/synthetic-row exceptions, not a production restore or multi-backend lock proof. It does not establish native compilation, Android/iOS secure-store/transport execution, headset/controller acceptance, production deployment or physical erasure. No dependency download, SDK hydration or live provider/SQL/account/signing operation occurred during verification.

Stat named inputs/runtimes and refuse offloaded/symlink/non-file sources. Bundle only with the installed Bun and startup guard from the repository root:

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/christaylor \
  ./verification/web/tooling/node_modules/@oven/bun-darwin-aarch64/bin/bun \
  --no-env-file --no-install --preload ./verification/web/scripts/deny-build-network.cjs \
  platforms/tests/bundle-quest-message-actions-composed.mjs
```

From verification/web:

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/christaylor \
  SOE_PLAYWRIGHT_PACKAGE=/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright \
  SOE_BROWSER_EXECUTABLE='/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' \
  node --require ./scripts/deny-build-network.cjs \
  ../../platforms/tests/browser-quest-message-actions-composed.mjs \
  > ../../platforms/evidence/quest-message-actions-composed.log 2>&1
```

## Frozen hashes

| File | SHA256 |
| --- | --- |
| app/quest/[circleId]/QuestCircle.tsx | fc262c1f0d92b87520a33df1c645170a8a57fce05c738f29407cc4c1372c839d |
| platforms/quest/circle-view.mjs | 2fa52a53ca5eae4d1dc3e47f637638493e818a523dcc4c49395e103397315da3 |
| platforms/quest/member-circle-page.mjs | f938cc343946f67d629e68c59381a16e0744bfa2fcd943592036b3075a30bb8c |
| platforms/tests/quest-message-actions-composed-entry.tsx | 6c9eb8e6de8313cc0d83165239b072c32405305b4b0c85e9e38b251589aee6b9 |
| platforms/tests/bundle-quest-message-actions-composed.mjs | 13c4393ed26e52033015984e6d4f3ddc9b0d9aedc96bebffed550a246b1b2d4c |
| platforms/tests/browser-quest-message-actions-composed.mjs | 0febd3a980f17f0a0d3a3ba0db3e4d3b1ec1a2fdf1a41fa6b6649a2de5731e56 |
| verification/web/tests/support/platforms-message-actions-app.mjs | 37b205bd27323974ee4cf240a58ef0c65817ea599eb838a73f025658ae5878ab |
| platforms/evidence/quest-message-actions-composed.json | 76bed30f5ae317dcec9d2b5a640d0dff415203ba2889a997a8719ea547f70c0b |
| platforms/evidence/quest-message-actions-composed.log | ea2a28b3b7d3974a15cdcaf6ce523e4ea5ebf9a6ce454366db2863651461c4e5 |
| platforms/evidence/quest-message-actions-composed-320.png | 91e6d798f6f796a71e85dd5000592c4956f082937a729de88d28aff7b1fff9a2 |
| platforms/evidence/quest-message-actions-static.json | cc0fb4ff033f008e3b56e715b0530ccd1f5a29d00397b6ec2e7495f552c48d35 |

Generated shared host: cb7460b48e787f410669bf83cee8350b984c32fd8f16cfb03453a1bc3a6ce338.
