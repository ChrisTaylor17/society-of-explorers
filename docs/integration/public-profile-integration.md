# Public profile integration — local proof, 2026-11-04

This slice closes the legacy public activity/profile projections. It depends on the separately owned, unapplied member-profile visibility/revision migration and shared `lib/members/profile.ts` contract. No remote schema or account change was performed here.

## Product behavior

- `lib/explorer/publicProfile.ts` queries the current member ID and explicit `profile_visibility='public'` together, then validates the same publication proof through `parsePublicMemberProfile`. Missing fields, malformed rows, duplicate IDs, or provider/schema failures cannot fall back to historical public data. It never queries responses, practice dates, EXP events, or billing.
- `/explorer/[id]` renders only authored name, bio, discipline, skills, project, seeking, and philosophy. Private, missing, malformed, and unavailable profiles use the same generic not-found page. Metadata stays generic and noindex for every profile, including published profiles; metadata resolution performs no member query. `/api/explorer/[id]` returns `{profile: PublicMemberProfile}` or a generic unavailable response (404 for private/missing, 503 for unavailable), with private no-store/noindex headers.
- `/api/members/discover` verifies the selected account through the existing unified auth helper, looks up the active community, and confirms the requester's current community membership before reading the published roster. Being signed in or providing a slug is insufficient. Both signed-wallet and verified Supabase fixtures cross the actual helper.
- Directory and public community roster queries use `profile:members!community_members_member_id_fkey!inner(...)` and a `profile.profile_visibility='public'` predicate before their 50/20-item limits. The FK was independently confirmed as validated by the security owner in `verification/web/evidence/profile-community-fk-metadata.json`. Private rows cannot consume the publication window. Missing relation/schema returns unavailable; there is no limited raw scan or fallback. Returned nested rows are validated again for publication, relationship scope, and duplicate IDs.
- `/api/communities/[slug]` exposes a bounded authored roster and explicit public community/configuration/product projections. It removes owner IDs, member roles, joined dates, and complete member totals. Arbitrary contract parameter objects are no longer passed through. Its `viewer.canManage` is deliberately false. The community page uses published-profile links and does not infer owner status from roster data or an owner ID. Optional management controls remain hidden pending a separate verified capability; mutation handlers were not changed by this slice.
- The community page resets its state owner when the slug changes, aborts/fences a retired read, and treats a 503 as unavailable rather than a successful empty roster. An empty published roster does not imply founder status or zero community members.

The public DTO is exactly `id, display_name, bio, discipline, skills, project_description, seeking, philosophy`. Publication flag/revision, auth subjects, wallets, emails, account tier, balances, activity, reflection text, and private billing fields do not enter these responses. Authored fields are plain React text; a member choosing to place personal information in their own published biography remains an explicit publication decision.

## Verification

All executions used an empty environment with minimal PATH/HOME and the startup `verification/web/scripts/deny-build-network.cjs` guard. No installations, external requests, issued credentials, production writes, or commits occurred.

- **17 cases passed** in `verification/web/tests/public-member-profile{,-db}.test.mjs`. The actual-module loader and route fixtures check private defaults, publication revocation, API/HTML whitelist behavior, generic noindex metadata, dual-provider identity, outsider denial before roster reads, malformed nested rows, and schema failures. The cached actual Supabase/PostgREST SDK serializes the real route queries into a test-only HTTP transport backed by disposable PGlite, executing reads as `service_role`. The SQL join filters publication before the limit. More than 50 private records on both sort boundaries cannot hide an eligible older public profile; eligible outputs cap at 50/20. Missing publication column/FK and removed requester membership fail closed. Log: `verification/web/evidence/public-member-profile-final-tests.log`.
- **TypeScript and ESLint passed** for the six changed product modules. Logs: `public-member-profile-types.log` and `public-member-profile-lint.log`. The join result is narrowed from `unknown[]` with runtime record/profile checks; no `any` bypass was introduced.
- **Six affected Bun cases passed** in growth G14/G15. The obsolete explorer reflection-avatar expectations were removed; the actual feed's avatar/contrast checks remain. Explorer share-card/noindex checks now match its generic metadata. Log: `verification/web/evidence/public-member-profile-growth.log`. Invocation uses the explicit `bun test --no-env-file --preload <guard>` subcommand order.
- **Four actual community React/Chromium stories passed**: long published name fits 320px; injected owner/role/capability hints do not reveal controls; empty published list claims no founder/complete total; a retired slug response cannot restore the previous roster; 503 is generic unavailable. No browser errors. Evidence: `verification/web/evidence/public-community-browser.json`; screenshot: `public-community-profile-320.png`. The browser fixture replaces shared navigation/session-hint helpers and HTTP responses only. Every HTTPS virtual-origin request is fulfilled locally. It is a component proof, not real authentication, production PostgREST/schema-cache acceptance, or deployment proof.

## Frozen source

| File | SHA-256 |
| --- | --- |
| `lib/explorer/publicProfile.ts` | `632225aff1f5b560f118288efb3cb136abdfd800f1e0fe217a6e6188a67ec7ff` |
| `app/explorer/[id]/page.tsx` | `2df407c3e409a3b22dced7657d4e298ce5f5e34586c0065fdf2efc42be060250` |
| `app/api/explorer/[id]/route.ts` | `0f3c040e610a965c55430fafe503855286c4a1649824931f44b37ed7f0c9fc41` |
| `app/api/members/discover/route.ts` | `a01e34dea9693a4ae8d2350349095ae502728e35c9101fdc2749d28821ade70c` |
| `app/api/communities/[slug]/route.ts` | `224201d10658af4555b7486410eeb51c529d72f4dc8fbe37c427654691ef7bd1` |
| `app/c/[slug]/page.tsx` | `2fb180302eff07a4416be3d410a5d1a376fc4f9c1a3b94dcb120aaf17d7bd812` |

Release gates remain: reviewed migration approval/application and real service/schema-cache acceptance, root-owned owner-profile/legacy-link integration, and the combined build/browser pass. Private-first behavior intentionally does not publish old members automatically.
