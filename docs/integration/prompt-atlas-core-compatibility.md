# Prompt Atlas and private-core compatibility

The local compatibility suite passes **11/11** against cached PGlite 0.4.1 / PostgreSQL 17.5. It executes the **complete, unchanged** materialized Prompt Atlas migration, including pgcrypto, its five tables, update triggers, `current_prompt_member_id()`, eight policies, both accounting functions, and the security-invoker leaderboard view. It then executes the actual member-identity preflight/unique-index script followed by the actual seven-table core-containment preflight/apply scripts. No product or SQL source was edited, and nothing was applied to a hosted database.

## Source and evidence

The fixture refuses changed SQL hashes and refuses to read offloaded SQL files. The migration was checked before reading: 11,246 bytes / 24 allocated blocks. Its cached pgcrypto JavaScript and extension bundle were also confirmed materialized before loading.

| Actual source | SHA-256 |
| --- | --- |
| `prompts-mvp/supabase/migrations/202606180001_prompt_atlas.sql` | `21ea7ff69810fda715aa3527a2538d419e4265235243c9e5b01d539a60085743` |
| `docs/sql/member-identity-preflight.sql` | `30d7709378c54be2a7259ff0d5cc04b97bf04a79315f72cf9e255ffde7d29a21` |
| `docs/sql/member-identity-unique.sql` | `3d970b0c70ee47e6f073b37251b59a406a9211e03dafda6ccdc6b6ac4a97d4e8` |
| `docs/sql/first-release-core-containment-preflight.sql` | `17db6ff8b73d65de0b3d87fb60fc43a84d84437341a062cb2e195f078a2f34d1` |
| `docs/sql/first-release-core-containment-apply.sql` | `b88ffa86bb265f467dbf9fe9d7ba17ce246df8a8d2618db86ade8a6401fb1b1b` |

Run from the canonical root, without installs or provider access:

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/christaylor \
  node --require ./verification/web/scripts/deny-build-network.cjs \
  ./verification/web/scripts/test-prompt-atlas-core.mjs
```

The bounded driver launches only its own guarded Node test child with a clean environment. It records exit status, source/test/guard hashes, before/after input stability, test counts and local metadata in `verification/web/evidence/prompt-atlas-core-compatibility.json`; the TAP log is adjacent. Tests are `verification/web/tests/prompt-atlas-core-compatibility-db.test.mjs`, using `tests/support/prompt-atlas-core-db.mjs`. No persistent database or hosted client is created.

## What the tests establish

- All seven core tables deny raw `SELECT` to anonymous, authenticated, null-subject and unknown-subject fixture callers after containment. Existing explicit service access remains usable.
- The unchanged definer helper still returns member A for synthetic subject A and member B for subject B, where every member UUID differs from its auth subject UUID. Anonymous/null and unmapped subjects return SQL `NULL`; two null-subject member rows do not become an identity match. The function accepts no foreign-member argument.
- The actual identity index rejects duplicate non-null subjects and retains multiple null-subject members. Identity is installed before containment so the latter's receipt includes that index.
- All eight actual policies execute after containment: published/owner prompt reads, own prompt insert/update/delete, own favorites and votes, and own entitlement/run reads. Foreign private/future/unpublished prompt rows and foreign member-specific rows remain hidden. Foreign/subject-UUID ownership writes fail; foreign-row updates/deletes affect no rows. Read-only entitlement/run policies do not permit browser writes, even under the fixture's broad table CRUD grants.
- The exact helper body, policy metadata, view definition and execution privileges remain unchanged across identity/core apply and repeated apply. The eight policies contain eleven non-null USING/WITH CHECK expression slots.
- The actual invoker leaderboard remains queryable under caller RLS. Anonymous favorite/vote counts are zero; authenticated counts include that caller's own visible rows; the synthetic bypass service sees both members. These browser values are **not global community counts**. The view still excludes private/unlisted/future/unpublished prompts, including a caller's own private prompts.
- Both actual service-only invoker accounting functions reject browser execution. A synthetic service reservation and completion succeed after containment, with quota accounting and one public prompt usage increment.

## Metadata comparison and limits

The exact 84-character helper body has MD5 `182a380be15d0befdd53a047060dd37b`, matching the existing metadata-only catalog receipt. The fixture also compares all eight normalized policy signatures, roles, permissiveness, RLS flags and expression digests with the copied metadata-only reference in `tests/fixtures/prompt-member-dependency-digests-2026-11-04.json`. Every digest agrees. The local `pg_get_viewdef(oid,false)` MD5 is `baf7c5b3ea0875c3f3561b2efaf5d031`, also matching the existing receipt; `security_invoker=true` agrees. No live expressions, function bodies, view text or user rows were read for this proof.

The local object owner is PGlite's `web_user`; the reference catalog owner is `postgres`. Those names are deliberately reported rather than treated as equal. The seven minimal prerequisite tables, legacy permissive member-read policy, browser/service roles and initial grants are **synthetic**, not a reconstruction of complete production DDL or ACLs. The archived migration does not establish base-table grants: the fixture explicitly supplies CRUD on the five Atlas tables and service SELECT on the leaderboard, while the unchanged migration supplies browser SELECT on the view. These grants let actual RLS run; they do not prove live ACL equivalence.

`auth.uid()` is an explicit stable SQL test double over a harness-controlled subject setting. This proves SQL identity mapping under a selected subject; it does not verify a JWT, Supabase session, wallet, device or real account. Cached pgcrypto executes locally; no provider is contacted. This suite does not cover hosted load, concurrent owner/role changes, every external caller, all existing policies or other definer functions. It does not authorize production execution or a helper-EXECUTE revocation. Keeping this helper and its policy dependencies unchanged is part of the tested compatibility contract.
