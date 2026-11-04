# Society of Explorers release status

Updated 2026-11-04. **Canonical local milestone verified; first release remains HOLD. Production clearance is false.**

Canonical repository: `/Users/christaylor/society-of-explorers`.
Canonical working checkout: `/Users/christaylor/Documents/Codex/soe-release`.
Branch: `codex/soe-first-release`, based on `soe-payments-fix-2026-10-24` at `984e69b7b44f312d3eb273a7ad3b2e82c9af9f03`.
The original dirty checkout remains untouched. This worktree integrates existing work; it is not a replacement Git history.

## What works locally

- Web integrates the complete 1,233-file discussions parent and its discovery descendant: reading editions/passage context, Circle participation, moderation/review, discussion roots/replies/archive, receipts and search. SQL remains unapplied. Search reaches eligible Circles beyond stale inventory, preserves Unicode/literal matching, and supports reload/Back/Forward cursors and explicit retry/restart.
- Verified subject-only account provisioning, minimal private DTOs, deliberate wallet/Supabase selection, signed wallet expiry/nonces and bounded browser sign-out are reconciled. Sign-out retires private views across tabs and requires a matching receipt plus cookie readback; it does not claim all-device revocation. No email-based account linking or implicit resubscription is performed.
- User chose **both clip formats**. `/clips` offers three source-linked text selections and an original, silent, captioned 24-second SoE introduction. Explicit Load verifies bounded media/caption bytes; no autoplay, account cookies or referrer. Third-party audio/video proposals remain held. The first-party video was decoded and six actual frames reviewed locally.
- `/quest` and `/quest/[circleId]` expose a real member browser with same-Circle web fallbacks and fail-closed provider selection. Configured auth uses synthetic acceptance fixtures. Immersive XR remains a prototype; headset acceptance is unverified.
- The app-bearing 300-file account-handover source is preserved under `platforms/source/`. Active native entry is member-first, shares current archive/thread contracts and requires an injected verified owner/credential transport. Android release configuration rejects default debug signing, removes unnecessary permissions and excludes app data from backup. Native binaries, secure-storage registration and durable account authority are unfinished.

## Fresh canonical verification

- Offline Next webpack build: **PASS**, 972-file source snapshot unchanged during build. Build ID `qcvPoICRg37_81ghn_0cs`; source fingerprint `e3da10628b7422c3662f9f11ecbf7399a4ea659924cfc88944b451ad527785e0`.
- Full selected non-DOM suite: **541/541**; Bun security **119/119**, growth **225/225**. Fourteen DOM suites are explicitly excluded because the exact cached JSDOM runtime is dataless.
- Built Next Chromium: **8 grouped stories**, including actual clip filesystem gateways/playback, discovery and unconfigured Quest routes at 320px. Discovery API/SQL uses a disposable intercepted transport; it is not live PostgREST acceptance.
- Additional actual-component Chromium fixtures cover six account-sign-out stories, seven configured Quest stories and four clip revision/lifetime stories. Android has twelve configuration/validator cases. These overlap other coverage and are not summed into one test total.
- All application/test execution used clean environments and startup external-network denial. No deployment, production mutation, issued credential, provider sign-in, communication, purchase or real-member acceptance occurred. Details and boundaries: [canonical-verification.md](docs/integration/canonical-verification.md).

## Release gates

1. **Highest priority: live privacy/access repair.** Read-only metadata confirms the connected Supabase project is ACTIVE_HEALTHY, superseding older inactive notes. Anonymous/authenticated roles currently have raw member-table access including private columns; several private reading/memory tables have RLS disabled. Local DTOs do not close direct Data API access. A seven-table containment draft is under local verification; applying it changes production access and requires explicit approval plus restore/impact review. [Current service facts](docs/integration/current-service-readiness.md) and [unapplied migration plan](docs/integration/production-migration-plan.md).
2. Adapt first-release profile/private-data clients to verified server DTO endpoints with explicit public-profile consent. Inventory legacy direct browser calls before access changes. No existing member is assumed to have consented to a public profile.
3. Reconcile a strict service-only Circle baseline and rehearse the complete migration chain from a sanitized live-schema fixture. The live service lacks the new Circle schema and the legacy policies required by existing preflights. Do not add broad public policies to satisfy those preflights. Identity uniqueness is also drafted/tested but unapplied.
4. Register native secure identity/storage/transport and durable account reset ownership, then complete iOS/Android binary, backup/signing and physical Quest acceptance. No SDK/runtime download is authorized by this checkpoint.
5. Review unresolved hero-image provenance and any third-party clip rights/territories. Complete approved hosted provider/storage/cookie/revocation, release security/accessibility and device acceptance before a production-ready claim. Other database advisory tables/functions/settings remain outside the narrow containment scope.

## Resume

Source provenance and reconciliation notes: `docs/integration/`. Preserve the original 681 dirty paths and immutable parent candidates; the later account-authority folder is a model, not the full application.
Canonical offline fixture harness: `verification/web/README.md`.
Keep all app/test execution externally denied from startup with a clean environment. Reuse existing runtimes; do not download packages, sign into providers or mutate production without authorization. Read-only control-plane/catalog observations are recorded separately from application acceptance.
