# Reward RPC containment: local candidate

Current continuation: the original representative suite and frozen SQL below remain unchanged. A later read-only catalog inspection retrieved the three exact reward definitions, with matching prior digests. See [reward-live-body-review.md](reward-live-body-review.md) for the additive exact-body rehearsal and [deployed-caller-impact-2026-11-04.md](deployed-caller-impact-2026-11-04.md) for the still-incomplete deployed-source correspondence. Historical statements about unknown bodies below describe the original checkpoint. No production function was invoked or changed.

Prepared 2026-11-04 against canonical checkpoint `6d5bccfce8d7ef183261540eeb42cea179a79540`. These scripts have only run in an offline synthetic database. No hosted SQL, production function invocation, row read, provider authentication, deployment, or approval occurred.

## Exact change and expected impact

The three scripts under `docs/sql/reward-rpc-containment-{preflight,apply,rollback}.sql` target only:

| Function | Observed catalog attributes |
| --- | --- |
| `public.add_exp(uuid,integer,text)` | `postgres` owner; PL/pgSQL; VOLATILE; SECURITY DEFINER; void; no fixed function settings |
| `public.increment_exp(uuid,integer)` | `postgres` owner; SQL; VOLATILE; SECURITY INVOKER; void; no fixed function settings |
| `public.increment_exp_tokens(uuid,integer)` | `postgres` owner; SQL; VOLATILE; SECURITY INVOKER; void; no fixed function settings |

Apply revokes only their `EXECUTE` privileges from `PUBLIC`, `anon`, and `authenticated`, with `RESTRICT`. It preserves function definitions, attributes, ownership, explicit service/other-role grants and grant options. It adds no replacement function grants. The observed service access must still work after the revocation or the whole transaction aborts. An unrelated role relying solely on `PUBLIC` would also lose that inherited execution authority; preservation of other-role ACL entries is not a promise to preserve authority inherited from `PUBLIC`.

Direct browser or historical clients calling these reward RPCs would receive permission errors. No direct browser caller was found in the bounded current canonical inventory, but deployed historical clients and dynamic callers remain unknown. The current service caller is retained. This is a narrow execution boundary; it does not seal all reward writers or validate the unknown live reward logic.

`current_prompt_member_id()`, its eight policies, the Prompt Atlas leaderboard, existing tables/rows, and global default privileges are untouched. A new private, owner-only `public.soe_reward_rpc_containment_v1_state` table records three prior/post catalog fingerprints. Its inherited table grants are removed locally without changing global defaults.

## Caller and definition evidence

The only literal current reward RPC caller found in the bounded canonical application inventory is `app/api/thinker/route.ts:476`: server-side `supabaseAdmin().rpc('increment_exp', {member_id_input: memberId, amount_input: expAmount})`. The actor comes from `getAuthenticatedMember(req)` at lines 187–195. The service admin boundary is `lib/supabase/admin.ts`; only source and environment-variable names were inspected, never credential values. The server chooses reaction reward 4 or ordinary reward 8. Demo requests skip these reward writes. On an RPC error, the existing route falls back to a service member-token update; that fallback is unchanged and is not an atomic reward guarantee.

No current literal caller of `add_exp` or `increment_exp_tokens` was found, and no local definition of the three reward bodies was established. Other reward paths exist: `lib/actions/executeActions.ts:70–94`, `lib/thinkerActions.ts:98–113`, and `lib/wallets/disburse.ts:75–77,97–99` write through service paths rather than these three RPCs. They are outside this change.

The tracked catalog-only receipt is `verification/web/tests/fixtures/legacy-rpc-catalog-2026-11-04.json`, an exact copy of root's read-only receipt. It contains signatures, attributes, ACLs, dependency metadata, body digests and lengths, with no body text or user rows:

| Function | Observed body MD5 | Characters | Local correspondence |
| --- | --- | ---: | --- |
| `add_exp` | `45c3f91859a6c157ddbc6b155e40d524` | 201 | UNKNOWN body |
| `increment_exp` | `d18f4bd9730603002d5c779f9843fc1d` | 104 | UNKNOWN body |
| `increment_exp_tokens` | `8185aee4259a8ede92b7e14b5b7132af` | 102 | UNKNOWN body |
| `current_prompt_member_id` | `182a380be15d0befdd53a047060dd37b` | 84 | Exact local helper body digest/length match |

The helper correspondence is to materialized canonical `prompts-mvp/supabase/migrations/202606180001_prompt_atlas.sql:112–123`, file SHA256 `21ea7ff69810fda715aa3527a2538d419e4265235243c9e5b01d539a60085743`. Its local header is SQL/STABLE/SECURITY DEFINER with `search_path=public`. It derives a member through `supabase_auth_id=auth.uid()`; it does not implement signed-wallet or selected-provider authority. This is local source-to-catalog digest correspondence, not a newly retrieved live body or runtime proof.

Eight local policy objects have eleven helper expression references matching the observed catalog dependencies: published-prompt SELECT, prompt INSERT/UPDATE/DELETE, favorites, votes, entitlements, and runs. The local `security_invoker` leaderboard at lines 292–311 transitively uses those policies. The separate Prompt Atlas package currently uses server admin routes; absence of a direct JavaScript helper RPC call would not justify revoking policy execution. No live leaderboard-definition match is asserted here.

Earlier original/archive/candidate searches lacked per-file materialization baselines and were incomplete. They establish source pointers only, not exhaustive historical caller coverage; incidental hydration cannot be ruled out. All expanded older-candidate scanning has stopped. Current work uses materialized canonical files and exact-file stat checks. See `source-read-boundary-2026-11-04.md` for root's consolidated source-read account.

## Acceptance, receipt, and rollback contract

Preflight accepts only the observed three exact signatures and argument names, expected owner/language/security/volatility/return shape/settings, safe browser role authority, service execution, and no direct inbound catalog dependency. Unexpected overloads, delegated grantors, browser role memberships or schema CREATE authority refuse review. The empty dependency catalog does not establish absence of dynamic SQL or string-bodied function callers.

At first apply, each actual function's body is fingerprinted dynamically by MD5/length alongside argument/default/configuration hashes, binary/SQL-body hashes, owner/OID/type metadata, attributes, comment hash and normalized ACL. No plaintext body or configuration value is written to the receipt. **Dynamic capture does not establish that the body matches the earlier live receipt or that its semantics are safe.** Current body/impact acceptance remains an explicit production gate; these scripts do not implement a fixed live-body allowlist.

The transaction verifies that non-ACL metadata stayed identical, the only removed ACL entries are the three browser/public grantees, service execution remains effective, and browser execution is closed. Reapply and post-install preflight require the exact saved post-state. Receipt collisions, schema/ACL/integrity drift, function/body/attribute drift and direct dependencies refuse atomically. The receipt digest detects accidental drift inside this trusted-owner model; it is not protection against a malicious database owner who can rewrite both metadata and receipt.

The scripts pin `search_path=pg_catalog,public`, bound statements to 60 seconds and receipt-lock waits to 5 seconds, and repeat acceptance after the receipt lock. **The receipt table lock does not serialize function DDL or global role changes.** An owner must coordinate trusted-owner function/role maintenance during preflight/apply/rollback. No multi-backend concurrency guarantee is claimed.

Rollback checks all three exact post-states before its first grant, restores only the recorded removed `PUBLIC`/browser EXECUTE entries and grant options, verifies exact prior metadata/ACLs, then drops only its owned receipt with `RESTRICT`. Existing reward rows and subsequent rewards remain. It cannot infer whether functions were unused, reverse rewards, or recover previously disclosed data. Restoring browser EXECUTE can reopen SECURITY DEFINER reward authority and requires a separate owner approval; retaining the forward boundary is safer. No rollback approval or execution is implied.

## Local verification and limits

From `verification/web`, using cached runtime only:

```sh
env -i PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin node --require ./scripts/deny-build-network.cjs --test tests/reward-rpc-containment-db.test.mjs
```

Final result: **13 tests passed, 0 failed**, approximately 20 seconds, Node 22.22.1 / PGlite 0.4.1 (PostgreSQL 17.5). Log: `verification/web/evidence/reward-rpc-containment-final-tests.log`, SHA256 `5e9c2088991eac60aa049b6d82135b1a40c990e7d113568d5072866b52ace07a`.

Independent read-only review of the exact three frozen SQL files, 13-case test/support source and this contract found no unresolved concrete ACL/receipt/restore defect within the stated trusted-owner scope. That review did not execute SQL or establish live body equivalence.

Meaningful cases cover browser denial for all signatures, exact unrelated/service ACL preservation, owner-only receipt privacy despite broad synthetic default grants, idempotence, grant-option rollback, retained later rewards, PUBLIC-only service dependency rollback, owner/role/overload/attribute refusal, catalog dependency refusal, receipt collision/tampering, function/body/ACL drift, non-owner refusal and delegated grantor refusal. Snapshots check the helper, eight policy objects, leaderboard, other table ACLs/defaults and synthetic rows remain unchanged by containment.

The actual canonical Thinker POST module runs with explicit synthetic auth/provider doubles and a service transport into PGlite. Its real code selects verified synthetic actor A despite a forged B body field and dispatches `increment_exp(A,8)`. The representative database body changes only A's EXP; B and protected profile fields stay unchanged, actual canonical profile guard revision remains 0, and no fallback executes. This proves that local caller composition, not live provider/auth/PostgREST behavior or unknown production reward semantics.

Fixture bodies are unmistakably marked `REPRESENTATIVE_FIXTURE_ONLY_UNKNOWN_LIVE_REWARD_BODY`; all three digests differ from their corresponding observed live digests. Known catalog headers/grants are represented; uncaptured attributes use synthetic PostgreSQL defaults. Members, prompt tables, `auth.uid()` and reward-event tables are minimal synthetic stubs. The canonical profile guard and exact Prompt Atlas helper/policy/view slices run, not the entire Prompt Atlas migration or a full production schema. This suite's helper/policy snapshots prove non-mutation, not full Prompt Atlas compatibility; that separate proof belongs to `prompt-atlas-core-compatibility.md`. No issued token, provider, hosted endpoint, multi-backend scheduling or production load is exercised.

## Frozen files

| Path | SHA256 |
| --- | --- |
| `docs/sql/reward-rpc-containment-preflight.sql` | `bdd54a8eb1125d2b34641052e7be1adc8f8309befe6c1e7bd7531ea5140a8158` |
| `docs/sql/reward-rpc-containment-apply.sql` | `21d0e55aedf700c19dbb6f099fe0e34c092d00a65efff74a7484c43e7d709fc9` |
| `docs/sql/reward-rpc-containment-rollback.sql` | `807c10e6c3d6aa63deaddb6e8bb007f4ee306bb8f1d27bf7c94803d834900a9e` |
| `verification/web/tests/reward-rpc-containment-db.test.mjs` | `38930750eeebb527ccd2ee5c304cdc83757102b7e8c3ebe7d34b2c9f6d49c0f0` |
| `verification/web/tests/support/reward-rpc-fixture.mjs` | `f1da999f13cbc3c6ffa2856d0c37e3b97125b577e14e66b1709d5fc66bcc03cb` |
| `verification/web/tests/fixtures/legacy-rpc-catalog-2026-11-04.json` | `2ed02330357306c83abf5a862df59424679829399fd1a1c485e1db027ab546a6` |

Production gates remain: review the current catalog and unknown bodies without inferring semantics from names/digests; review historical/dynamic caller impact; confirm explicit service execution and owner/role assumptions; coordinate owner DDL; approve this exact local apply separately; and validate deployed behavior independently. Other reward writers, helper policy design and global default grants remain outside this candidate. Nothing is staged, committed or applied by this work.
