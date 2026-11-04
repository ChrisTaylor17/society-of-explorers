# Native and Quest integration milestone

The canonical branch is `codex/soe-first-release` in `/Users/christaylor/Documents/Codex/soe-release`. This milestone integrates existing app-bearing platform source with the current web discussion archive. It is tested local implementation, not a released or production-ready cross-device product.

## Source and preservation

The source is `/Users/christaylor/Documents/Codex/2026-11-01/task-4/soe-account-handover/candidate`, whose complete **300-file** manifest was checked before copying and again after integration. The preserved copy in `platforms/source/account-handover` is byte-identical. Original repositories, candidates and linked dependency contents were not modified.

| Evidence | SHA256 |
|---|---|
| Original `HANDOFF.json` | `82e41385c7f9c94a1989f631f8c2cda14e2e6755833e4f7782b4439cdee4a692` |
| Original `CANDIDATE_SHA256.json` | `4f79caee19e8ac4f29a21454f011f359e107ec2b18c352fadc46bf7d692a5b13` |
| Active generated `platforms/quest/circle-host.mjs` | `8989dbd9fe63ff7485589b5f10ef42b85b4ed2db3d7d6b353bac7b93ea2a362a` |

The separate latest `soe-account-authority-contract` folder explicitly reports `productChanged:false` and `nativeAuthorityImplemented:false`. It is a security model, not the app or an implemented native authority. It was not used as the product source.

The app task **Fix session recovery status**, thread `01a199aa-d8ae-7573-b7d5-03c835433012`, was observed idle through the Codex app while integrating. Its latest two turns were completed, ending with the model on November 3 around 19:23 UTC. No newer app-bearing source appeared in its handoff or manifest. This is an observed coordination state, not a permanent ownership claim.

The preserved archive includes unrelated historical Meridian/prototype code and the full synthetic app dependency graph. None is the active product entry. Two inherited archive files are ignored by the repository's normal Git patterns: Meridian's `.env.example` and `next-env.d.ts`. They remain preserved on disk and in the original candidate. A source export/commit must account for those exclusions before claiming a 300-file reconstructible clone. No environment/session values were inspected or printed.

## Active integration

`platforms/native/` preserves the existing Expo package/lock, Android project, actual `CircleScreen.tsx`, `MemberCircleScreen.tsx` and Circle controller/session/transport sources. The active `App.tsx` now opens the configured member Circle experience, with a close/reopen path. Its default unconfigured screen performs no sign-in or private read and contains no fictional actor or synthetic fallback. The old complete App remains in the preserved source.

The native application composition still must supply an existing verifying auth interface, strict Circle UUID, explicit HTTPS application origin and approved credential transport. No provider client, credential, account or native bridge is created by this milestone. The `memberCircleConfig` validator rejects malformed IDs, missing verification methods, HTTP origins, credentials/paths in origins and invalid deadlines.

`platforms/shared/archive.ts` imports the current canonical `lib/circles/thread.ts` DTO/cursor parser and UUID implementation. Both active platform hosts now load complete archive pages and thread pages through `GET /api/circles/:circleId/discussion`, including UUID pagination, focus outside the bounded reply page and moderation/withdrawal tombstones. There is no second copied discussion schema. The active native entry resolves a **14-file TS/TSX source closure**, with no missing relative imports; Expo, React and React Native remain external locked dependencies.

Opening the archive retires the latest-conversation view and memory draft. Identity changes, background/blur, offline signals, closure and stale responses cannot restore an old private page. Foreground/online return alone does not refetch private messages. Every private request reacquires the verified bearer and checks the view lifetime before and after transport. The native port adapter permits the canonical archive GET query modes; arbitrary parameters, duplicate cursors, receipt reads and new discussion POSTs remain refused there.

The existing `GET/POST /api/book-salons/:circleId` flat conversation/composer remains available after an explicit authorized refresh. **New thread replies, reports and contribution withdrawal are not yet implemented in the native/Quest controls**; their current member web paths remain authoritative. The new archive must not be mistaken for complete cross-device feature parity.

The canonical web route `/quest/[circleId]` can import `platforms/quest/member-circle-page.mjs` and mount it against its rendered controls. `mountExistingMemberCircle({window,document,config})` requires the existing verifying client and HTTPS origin. It makes no SDK method or private API call until the user chooses **Check member session**. A successful provider check alone does not load discussion: the member explicitly refreshes the conversation or opens the archive. Missing markup fails before provider attachment; cleanup removes listeners/subscriptions and clears private DOM even if markup changes while retiring.

The inherited fictional Quest launcher is not an active default. WebXR renderer/session source remains labeled in `platforms/quest/prototypes/`; it is not connected to authenticated member data. The current Quest milestone is a regular Browser member experience, not verified immersive input, headset support or a native Quest APK.

## Verification

Run from the canonical repository root:

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/christaylor python3 platforms/scripts/checks.py
```

All five final steps passed; exact commands, exits and logs are in `platforms/evidence/checks.json`:

- Existing Bun builds the shared ESM from actual TS source, with the external-network deny guard preloaded and environment loading disabled. The output hash is recorded in `shared-build.json`.
- Strict portable TypeScript checks pass against the shared contract, host, verified provider owner and port adapters.
- **11 integration regressions pass**: strict bootstrap, actual native App/Circle TSX server rendering, canonical archive pagination, held roots and out-of-page focus, forged/mismatched DTO refusal, identity retirement before/after transport, background/offline clearing, draft retirement, missing DOM preflight and native transport query restrictions.
- **Seven actual Chromium stories pass**: zero provider/API calls at mount; explicit fixture verification without a private read; 25-item archive paging to an older-than-100 contribution; held root plus independent reply and selected focus; 320px layout without horizontal overflow; synchronous sign-out clearing without auto-refetch; partial-DOM cleanup and missing-markup refusal. Requests are intercepted non-issued auth/API fixtures. No live Supabase or user account is involved.
- The complete preserved inventory/hashes and active native import closure verify exactly. `platforms/PLATFORM_SOURCE_SHA256.json` records the active source files.

`platforms/evidence/quest-browser.json`, `quest-browser.log` and `quest-archive-320.png` contain browser evidence. The screenshot was visually inspected. The native TSX test uses web React **19.2.4** and explicit React Native primitive doubles; the native package declares React **19.3.0**. The test establishes source composition and server-rendered controls, not Hermes, native layout/events, native React compatibility or device behavior. Portable types use TypeScript **5.9.3**, Node **22.22.1**.

The React review checked stable hook ordering, lifetime cleanup, bounded lists, text rendering, labeled inputs/buttons, minimum 48px actions, explicit status, no inline component definitions and no automatic private retries. Browser evidence supports the tested 320px DOM layout; screen-reader and native accessibility acceptance remain open.

## Remaining release gates

1. **Native authentication and storage:** connect the actual application-owned member client, login/refresh/sign-out flow and registered secure storage/transport. A supplied JavaScript interface or self-reported bridge capability does not establish OS security or provider configuration.
2. **Durable account transitions:** existing in-process handover protects one bridge object/key. Separate proxies/processes, crashes, restarts, ambiguous reset acknowledgements and durable recovery remain unresolved. The authority model has not solved them in the app.
3. **Native builds and tools:** a current metadata scan found **15,168 offloaded files out of 20,351** in the linked native runtime. Full native typechecks/exports were not retried against that incomplete tree. There is no iPhone SDK/simctl or generated iOS native project. The older workspace Android Java/toolchain exists, but adb/emulator files are offloaded. No package download, tool installation, SDK restoration, simulator or user device was launched.
4. **Android binary policy:** inherited application IDs/instrumentation remain synthetic; release Gradle currently selects debug signing. The main manifest also retains storage/overlay permissions and `allowBackup=true`. Review and test signing, identity, permissions, backup and secure storage before any distributable binary. No binary readiness is claimed.
5. **Feature parity:** add current discovery/Circle selection, member profiles, lawful reading/passage actions, keyed thread replies, report/withdrawal and moderation experiences to native/Quest using the canonical services. Do not promote the preserved fictional plan/consent backend as current membership authority.
6. **Quest acceptance:** connect a credible authenticated immersive experience if supported, and test headset lifecycle, controller/keyboard input, readable text, comfort, accessibility and browser fallback. The preserved WebXR panel is still a prototype.
7. **Release integration:** verify real auth/provider behavior, database authorization/grants/RLS, migration compatibility with the deployed security baseline, lawful content/clip rights, moderation operations and the complete integrated app. These local fixtures do not prove those requirements.

No deployment, production data/security change, provider/account operation, user contact, spending, package installation or commit was performed by this platform milestone.

Relevant primary documentation reviewed: [React Native AppState](https://reactnative.dev/docs/appstate), [Supabase Expo authentication](https://supabase.com/docs/guides/auth/quickstarts/with-expo-react-native-social-sign-in), and [Expo Linking](https://docs.expo.dev/versions/latest/sdk/linking/). The existing package versions and current source remain the implementation authority; no framework upgrade was attempted.

## Quest selected-account boundary

The actual `app/quest/[circleId]/QuestCircle.tsx` now wraps its existing SDK with `lib/circles/quest-member-auth.ts`. After verifying the exact SDK token, and before accepting identity or returning any bearer, the bridge makes a cookie-only `GET /api/auth/member` to confirm the website's currently selected provider and subject. The request is same-origin, no-store, redirect-error and no-referrer; it sends no bearer, subject query or member query. Only a matching Supabase provider/subject/member link is accepted. Wallet selection, a different subject, malformed metadata, HTTP failures and redirects fail closed with a generic error. Only the verified identity field is exposed to the platform owner; profile details are discarded.

The bridge deadline includes SDK verification, metadata fetch and response parsing. Activity loss aborts/fences pending bridge work. The shared selected-account notification retires the connection and clears private DOM synchronously, requiring a new explicit Connect and Check. Retirement detaches the SDK subscription. Already-sent work cannot be recalled, and these sequential checks do not establish atomic provider selection, server session revocation or native account authority.

Additional validation passed: **15 actual-module regressions**, focused TypeScript including the real Quest TSX, and targeted ESLint. `platforms/evidence/quest-member-auth-tests.log` records metadata mismatch/refusal, every-bearer recheck, private transport withholding, deadline, lifecycle, late completion and subscription cases.

The configured **actual QuestCircle TSX path** also passes **seven Chromium stories** in `platforms/evidence/quest-page-browser.json`. The fixture bundles the unchanged product component, React 19.2.4, the real bridge, shared account-change subscription and platform host, with explicit test-only SDK, Next Link and CSS adapters. It verifies zero SDK construction/provider/API work on mount, separate explicit Connect and Check, selected-cookie matching before controls enable, archive 25-to-older pagination with renewed subject checks, immediate clearing on the actual shared provider-change event, wallet refusal despite a retained SDK session, and a held real fetch whose late response cannot restore private text after retirement. All HTTPS requests are intercepted at a virtual test origin; there is no real DNS/provider call or issued credential. The CSS adapter does not prove real Next page styling; the canonical Next/browser checks remain separate.
