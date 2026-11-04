# Owner profile contract and unapplied privacy schema

This is a local milestone after integration checkpoint `e4961d5`. No production SQL, grant, account, provider or deployment action was performed. Initial checkpoint build/browser evidence remains historical evidence for that checkpoint; root owns the new combined build and browser receipts.

## Resulting local behavior

`lib/members/profile.ts` defines bounded authored fields, the private owner DTO and a separate public whitelist. Owner GET and POST return the same direct shape:

```ts
{ memberId, revision, visibility: 'private' | 'public',
  profile: { displayName, bio, discipline, skills, projectDescription, seeking, philosophy } }
```

Owner text fields are strings; nullable stored fields become empty strings and null skills become `[]`. Null/missing/blank legacy display names become the editable `Explorer`. Unknown visibility/revision schema does not receive a compatibility fallback. The public parser requires literal `profile_visibility === 'public'`, then returns only the route member ID and authored profile fields. It excludes auth/wallet/email/billing, activity, EXP/tier/streaks, responses, dates and revision. Private/missing/malformed opt-in cannot be inferred from an existing public-read policy or historical profile.

Limits are shared with the UI: display name 200 and required nonblank; discipline 100; bio/project description/philosophy 2,000 each; seeking 1,000; up to 40 skills of 100 each. Limits count JavaScript UTF16 units; SQL independently enforces the same bound for astral characters. Invalid types, unknown/protected keys, control characters, unpaired surrogates and empty skill entries are rejected instead of silently clipping them.

`GET /api/members/profile` derives its owner from verified canonical auth and reads an explicit owner projection. Query/body/header member hints cannot select another profile. `POST` requires exact `{ expectedMemberId, expectedRevision, patch }`; omitted patch fields survive, deliberate empty fields/skills clear them. Before obtaining the mutation RPC, it compares the draft owner with the server-derived current member. An A draft cannot turn into a B edit when both revisions happen to be zero. Unknown/protected fields are rejected.

POST enforces same-origin browser writes, JSON media type, a 64KiB **actual streamed UTF8 byte** budget, strict UTF8 decoding and a five-second body deadline. The declared content length is not trusted as a replacement for the byte budget. Responses use private/no-store headers; missing schema/RPC, malformed or wrong-owner replies and transport failures return generic unavailability without SQL details. Stale revision is 409. A transport failure may follow a committed write: the UI must manually reload; no exactly-once or automatic-retry promise is made.

## SQL review files — APPLY NOT RUN

Order: the separately reviewed raw-member containment must be in effect first, then `docs/sql/member-profile-preflight.sql` → `member-profile-apply.sql`. These files are not automatic migrations. Preflight requires current table ownership, known field types, existing service bypass/CRUD and **no effective raw member table/column privileges for browser roles**. It refuses role inheritance/bypass, unknown object collisions and unrecognized installed definitions rather than broadening grants.

Apply is one owner transaction with an ACCESS EXCLUSIVE member-table maintenance lock, five-second lock deadline and sixty-second statement deadline. It adds `profile_visibility NOT NULL DEFAULT 'private'` and a safe-integer `profile_revision NOT NULL DEFAULT 0`. Existing members therefore stay private; it performs no bulk publication, backfill consent, account merge or profile-data rewrite.

The INVOKER `soe_member_profile_revision_guard()` trigger increments revision for actual authored-field or visibility changes, including legacy server writers. Unrelated EXP/billing/other-column changes and no-op updates retain revision. Explicit counter changes and nonzero insert counters are refused. The trigger has no browser/service EXECUTE grant; actual service updates still fire it through PostgreSQL trigger mechanics.

Only `service_role` receives EXECUTE for INVOKER `soe_member_profile_update(uuid,bigint,jsonb)`. The API passes its verified actor, not the request's identity hint. The RPC validates bounded allowed fields, locks exactly that member, checks expected revision, verifies the full enabled BEFORE INSERT/UPDATE row-trigger signature, preserves omitted fields and returns only owner profile columns. Its postcondition requires exactly `expected+1` when saved authored fields/visibility changed and exactly `expected` for no-op. Missing/narrowed/disabled/nonfunctional revision protection refuses or rolls back the write.

Installed recognition checks exact private/zero defaults, check semantics, column markers/types, full trigger attributes (including no UPDATE OF subset, arguments, condition, constraint or deferrability), fixed function bodies/INVOKER ownership/path and function ACLs. It requires ordinary VOLATILE, non-SETOF PL/pgSQL functions with expected result/argument signature and function attributes; a STABLE or STRICT replacement is rejected despite unchanged body text. Unknown later indexes/checks on the new columns require review. Recognition uses the pinned transaction-local `pg_catalog,public` path; production PostgreSQL/version/caller compatibility still needs an approved rehearsal.

`member-profile-rollback.sql` is **unused-installation-only**: it refuses any publication or nonzero revision, altered owned functions/defaults/checks/trigger/grants, or later dependent profile index/constraint. Only then can it remove its own trigger/functions/new columns while keeping original profile rows/policies/grants. It never deletes a profile record or silently removes an unrelated index/check. Once anyone edits a profile or chooses public visibility, use an explicit data-preserving forward/restore plan; this script is not a down migration for an active feature. The executing database owner remains trusted, and real concurrent role administration/load/lock scheduling is not proved by a single local backend.

## Actual verification

- **29/29** actual backend cases: 16 PostgreSQL cases plus 13 HTTP/pure-contract cases, with exact handlers and actual unapplied SQL (`verification/web/evidence/member-profile-backend-tests.log`). Tests include private legacy defaults; preserved omitted/protected fields; current-owner binding; stale revisions; legacy writer revisions; all maximum UTF8 fields; browser/table/RPC denial; altered defaults/checks/trigger/body/volatility/strictness; safe rollback and later dependency refusal; CSRF; byte/media/JSON/UTF8/deadline rejection; generic missing schema; and committed-but-lost response followed by fresh owner GET without retry.
- **53/53** guarded existing Bun security cases (`member-profile-existing-security-tests.log`). New strict-profile cases preserve forged member rejection, reject A/B mismatches before RPC and prove the optimistic RPC receives only the verified actor. Original unrelated route assertions remain.
- Owned source scoped ESLint passes. Root/public owners run final combined TypeScript/build/browser acceptance. Separate browser DTO-double stories are not represented as backend proof.

The platform owner additionally composed the **actual root profile editor/page/CSS → actual owner HTTP handler → the same PostgreSQL schema/RPC → actual public loader** in cached Chromium. Four stories pass (`verification/web/evidence/profile-composed-browser.json`): legacy-private; publish/revision1/fresh owner readback and whitelisted public projection; unpublish/revision2/public404; stale A draft under selected B refused before SQL with B unchanged. Before/after hashes match the frozen SQL files. Identity and transport remain explicitly synthetic and every HTTPS route is fulfilled locally; this is not real-provider/deployed-browser proof.

```sh
# From verification/web; installed runtime, startup network denial.
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/christaylor node --require ./scripts/deny-build-network.cjs --test tests/member-profile-db.test.mjs tests/member-profile-http.test.mjs
# From canonical root; Bun subcommand precedes preload.
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/christaylor verification/web/tooling/node_modules/@oven/bun-darwin-aarch64/bin/bun test --preload ./verification/web/scripts/deny-build-network.cjs ./tests/security/s1b-body-member-routes.test.ts
```

Reusable test-only fixtures are in `verification/web/tests/support/member-profile-{fixture,http-fixture}.mjs`; they expose the actual route and PostgreSQL engine with synthetic identity/admin transport, no provider or issued credential. These are local acceptance tools, not app runtime bypasses.

Final SQL SHA-256: preflight `95f9b8549784e57b8ef542da0055dafb60aca0579f55ede4cfdf066de8c2c41a`; apply `6a51741e5267646a25de04981dca04358b26b284585e2662056214ce63d44dbf`; unused rollback `9bd710af0dfb3e9142117b38f84c8e037f423539632f14736573c20c67a14a95`. The final targeted rerun includes the last function-attribute drift regression; the earlier full application suite remains its own separately bound receipt.

Live remains unmodified: raw privacy findings and missing profile/Circle schema in `current-service-readiness.md` still apply. The public endpoint/roster slice is documented separately in `public-profile-integration.md`. Other public activity surfaces, privileged RPC bodies, the remaining RLS-disabled tables, provider/native/device behavior and strict Circle baseline/full-chain migration remain separate gates.
