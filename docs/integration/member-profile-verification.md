# Profile privacy milestone — 2026-11-04

**Local milestone passes; first release remains HOLD.** Canonical source is `/Users/christaylor/Documents/Codex/soe-release`, branch `codex/soe-first-release`. No production access/schema change, deployment, provider sign-in, package/SDK installation or push occurred.

Profiles start private in the unapplied schema. The verified owner can edit bounded authored fields, preview publication, publish or withdraw publication. Saves bind the loaded owner and revision; omitted fields survive. Success requires a matching receipt and a separate fresh readback. Unknown saves and conflicts require explicit reload; account changes retire private views and fence late replies. Public pages/rosters expose authored fields only, and community membership is checked before directory reads. Private members do not consume the published-result limit. Other contributions/activity are outside this profile-visibility control.

## Verification

| Check | Result | Boundary |
| --- | --- | --- |
| Combined Next webpack build | PASS, 60.8s; full TypeScript 18.8s | Offline invalid public placeholders; 976 source files unchanged |
| Build identity | `dhI-c9JrdcZhfKSeWd04n` | Source fingerprint `d19cfa867ed0bb1d98482222bfe54618c2a919d0d54e27daad0d3000286d3fc2` rechecked against current app |
| Selected backend/SQL suite | 600/600, 47 files, no skips within selection | Fourteen DOM suites excluded for dataless cached JSDOM; ran before last SQL metadata recognition guard |
| Final affected profile backend | 29/29: 16 SQL + 13 HTTP/contract | Rerun after final SQL guard; actual handlers/PGlite, synthetic identity/transport |
| Bun security/growth | 122/122 and 225/225 | All files pass; no real buyer/provider/payment proof |
| Built Next Chromium | Nine grouped stories PASS, owned server stopped, no cleanup errors | Actual clip FS gateways and credential-free auth/profile GET401; discovery route/SQL uses intercepted local transport |
| Profile editor Chromium | Eleven stories PASS | Actual React/CSS/helpers, controlled HTTP DTOs; deadlines, cross-tab retirement, late JSON and manual recovery |
| Composed profile Chromium | Four stories PASS on final SQL | Actual editor → owner API → PGlite → fresh readback → public loader; synthetic identity and local HTTPS transport |
| Public projections/community | Seventeen module/SDK+SQL cases and four browser stories PASS | Includes more than 50 private members before older published profiles; actual SDK with custom local SQL transport |

These counts overlap and must not be summed. [Machine-readable receipt](member-profile-verification.json) binds the exact evidence and final SQL hashes. Application/test code runs in clean environments with external-network denial installed before imports. No issued credentials or real member records are used.

The composed browser proves legacy-private state, publication at revision one, a held fresh GET before confirmed success, whitelisted public output, unpublishing at revision two/public404, and refusal of an A draft under selected B before any SQL write. B remains unchanged. This is a local vertical slice, not deployed/provider acceptance.

The built profile page passes actual Next CSS/320px/44px/keyboard checks and initially performs no auth/profile request. Explicit Load alone reaches the real cookie/token-free auth/member and owner-profile GET401 handlers, then shows sign-in guidance with no editable fields. The other eight stories cover discovery paging/history/errors/reading context, unconfigured Quest and original captioned clip playback. Initial failed compiler/cache, bounded cold type-check and browser-verifier attempts are preserved separately; they are not counted as passes. The final verifier bounds response/cleanup waits and records progress. It omits a redundant Playwright error-body read that the actual UI does not consume; route payloads have independent actual-handler coverage.

## Review and release limits

[Owner contract and SQL](member-profile-owner-milestone.md) records exact bounds, optimistic trigger/RPC, strict default/constraint/function/trigger recognition and unused-installation-only rollback. Independent review found no unresolved concrete issue within that scoped contract. Later use, dependencies or changed owned objects refuse rollback. Production lock/load/role administration and actual PostgREST schema-cache behavior remain unverified.

[Public profile integration](public-profile-integration.md) covers private-safe metadata, explicit opt-in and directory joins. Community management controls are hidden pending a separately verified capability. Profiles and public server projections require coordinated source/schema rollout; the connected service still has the observed raw-member/private-table exposure. Local code does not repair deployed permissions. [Current service readiness](current-service-readiness.md) and the [unapplied migration plan](production-migration-plan.md) remain authoritative.

Next local gate: obtain complete metadata for the three legacy Circle tables, build a faithful sanitized live-schema fixture and reconcile a strict service-only baseline plus schema adapter. Live `seminar_messages` has sender fields and lacks historical `member_name`; simply relaxing policy preflights is insufficient. Keep user rows and original sender semantics intact. The full nine-file chain, ordinary salon behavior and negative role tests must pass before requesting production application.

Native secure bridges/durable authority, actual iOS/Android binaries and Quest hardware, hosted provider/storage/cookie/revocation checks, remaining access advisories/functions, unresolved image provenance and release accessibility/security remain open. First release is not production-ready.

This checkpoint is retained as historical profile verification. Build and built-browser files are preserved under `verification/web/evidence/checkpoint-d50de94/`; the source inventory was reconstructed from `d50de94` and matched its original SHA256 exactly. See `relocation.json`. Subsequent Circle/salon acceptance is recorded separately.
