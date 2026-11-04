# Society of Explorers release status

Updated 2026-11-04. **Canonical local milestone verified; first release remains HOLD. Production clearance is false.**

Canonical repository: `/Users/christaylor/society-of-explorers`.
Canonical working checkout: `/Users/christaylor/Documents/Codex/soe-release`.
Branch: `codex/soe-first-release`, based on `soe-payments-fix-2026-10-24` at `984e69b7b44f312d3eb273a7ad3b2e82c9af9f03`.
The original dirty checkout remains untouched. This worktree integrates existing work; it is not a replacement Git history.

Saved checkpoints: integration `e4961d5`, unapplied seven-table containment `68e641c`. The subsequent profile privacy milestone is verified locally; the current build and receipts below include its owner UI/API, public projections and directory adaptation. Production remains unchanged.

## What works locally

- Web integrates the complete 1,233-file discussions parent and its discovery descendant: reading editions/passage context, Circle participation, moderation/review, discussion roots/replies/archive, receipts and search. SQL remains unapplied. Search reaches eligible Circles beyond stale inventory, preserves Unicode/literal matching, and supports reload/Back/Forward cursors and explicit retry/restart.
- Verified subject-only account provisioning, minimal private DTOs, deliberate wallet/Supabase selection, signed wallet expiry/nonces and bounded browser sign-out are reconciled. Sign-out retires private views across tabs and requires a matching receipt plus cookie readback; it does not claim all-device revocation. No email-based account linking or implicit resubscription is performed.
- `/account/profile` supports verified-owner edits, explicit publication/withdrawal and a public preview. Saves bind owner plus revision and require fresh readback; account changes/deadlines retire late work, unknown outcomes require manual reload. Unapplied schema defaults every profile private. Public profiles/rosters omit responses, activity, stats, identity and billing. Directory eligibility is filtered before limits; community membership is checked first. Community management controls stay hidden pending verified capability.
- User chose **both clip formats**. `/clips` offers three source-linked text selections and an original, silent, captioned 24-second SoE introduction. Explicit Load verifies bounded media/caption bytes; no autoplay, account cookies or referrer. Third-party audio/video proposals remain held. The first-party video was decoded and six actual frames reviewed locally.
- `/quest` and `/quest/[circleId]` expose a real member browser with same-Circle web fallbacks and fail-closed provider selection. Configured auth uses synthetic acceptance fixtures. Immersive XR remains a prototype; headset acceptance is unverified.
- The app-bearing 300-file account-handover source is preserved under `platforms/source/`. Active native entry is member-first, shares current archive/thread contracts and requires an injected verified owner/credential transport. Android release configuration rejects default debug signing, removes unnecessary permissions and excludes app data from backup. Native binaries, secure-storage registration and durable account authority are unfinished.

## Fresh canonical verification

- Offline Next webpack build: **PASS**, including full TypeScript; 976-file source snapshot unchanged. Build ID `dhI-c9JrdcZhfKSeWd04n`; source fingerprint `d19cfa867ed0bb1d98482222bfe54618c2a919d0d54e27daad0d3000286d3fc2`.
- Selected non-DOM suite: **600/600**; Bun security **122/122**, growth **225/225**. After the final SQL function-metadata guard, only affected profile SQL/HTTP was rerun: **29/29**, plus composed browser proof on final hashes. Fourteen DOM suites remain explicitly excluded for dataless cached JSDOM.
- Built Next Chromium: **9 grouped stories**, including actual clip gateways/playback, discovery, unconfigured Quest and actual profile page/anonymous GET401 routes at 320px. Discovery uses actual handler/SQL behind a disposable intercepted transport; it is not live PostgREST acceptance. Owned browser/server stopped cleanly.
- Profile editor: eleven actual-component browser stories; four composed editor → actual API → SQL → fresh readback/public loader stories; seventeen public projection/SDK+SQL cases and four community UI stories. Identity/transport are explicitly synthetic. Final independent profile SQL review is clear within scope. These results do not repair live permissions.
- Additional actual-component Chromium fixtures cover six account-sign-out stories, seven configured Quest stories and four clip revision/lifetime stories. Android has twelve configuration/validator cases. These overlap other coverage and are not summed into one test total.
- All application/test execution used clean environments and startup external-network denial. No deployment, production mutation, issued credential, provider sign-in, communication, purchase or real-member acceptance occurred. Current receipts: [member-profile-verification.md](docs/integration/member-profile-verification.md). Earlier integration evidence remains preserved separately.

## Release gates

1. **Highest priority: live privacy/access repair.** Read-only metadata confirms the connected Supabase project is ACTIVE_HEALTHY, superseding older inactive notes. Browser roles currently have raw member-table access including private columns; several private reading/memory tables have RLS disabled. Local DTOs do not close direct Data API access. Seven-table containment has fourteen local database cases and independent review, but remains unapplied. Production access changes require explicit approval plus restore/impact review. [Current service facts](docs/integration/current-service-readiness.md) and [unapplied migration plan](docs/integration/production-migration-plan.md).
2. Coordinate profile schema/server rollout and approved deployed acceptance. Native/browser provider and actual PostgREST schema-cache behavior remain unverified. The legacy anonymous Hall artifact→member join needs adaptation before containment; other activity surfaces and privileged RPCs are outside profile consent. Existing members are not bulk-published by the local draft.
3. **Next local milestone:** complete three-table catalog metadata, a faithful sanitized live-schema fixture and strict service-only Circle baseline/schema adapter. Live `seminar_messages` has sender fields and no historical `member_name`; old policy assumptions also differ. Preserve sender data/meaning, add no broad PUBLIC policies, and rehearse the entire nine-file chain plus ordinary salon flows. Identity uniqueness and all Circle/profile SQL remain unapplied.
4. Register native secure identity/storage/transport and durable account reset ownership, then complete iOS/Android binary, backup/signing and physical Quest acceptance. No SDK/runtime download is authorized by this checkpoint.
5. Review unresolved hero-image provenance and any third-party clip rights/territories. Complete approved hosted provider/storage/cookie/revocation, release security/accessibility and device acceptance before a production-ready claim. Other database advisory tables/functions/settings remain outside the narrow containment scope.

## Resume

Source provenance and reconciliation notes: `docs/integration/`. Preserve the original 681 dirty paths and immutable parent candidates; the later account-authority folder is a model, not the full application.
Canonical offline fixture harness: `verification/web/README.md`.
Keep all app/test execution externally denied from startup with a clean environment. Reuse existing runtimes; do not download packages, sign into providers or mutate production without authorization. Read-only control-plane/catalog observations are recorded separately from application acceptance.
