# Production migration plan — APPLY NOT RUN

**No migration in this plan has been applied to the connected project.** Approval must name exact reviewed files, target, expected client breakage, restore evidence and acceptance checks. This document is a reviewable local plan, not a deployment instruction or implicit permission to change production.

Current facts are in [current-service-readiness.md](current-service-readiness.md); metadata queries/results are archived under `verification/web/evidence/live-service-metadata-2026-11-04.json`. Application source is frozen for the canonical checkpoint. No legacy/public client adaptation is included in this SQL work.

## Stage 1: bounded private-data containment

Exact targets: `members`, `reading_progress`, `book_highlights`, `great_books_progress`, `great_books_highlights`, `book_reflections`, `thinker_memory`. Member containment covers its raw billing/identity/private profile columns. It is not an audit or repair of every billing table.

Review files, in this order:

1. `docs/sql/first-release-core-containment-preflight.sql` — read-only catalog/owned-receipt checks; no user-row reads. Requires the table owner, existing UUID keys/member references, ordinary tables, non-privileged non-inheriting browser roles, existing service bypass/CRUD, and reconstructible owner-issued target grants. Unknown ownership, schema, receipt, inherited authority or later state changes stop the operation.
2. `docs/sql/first-release-core-containment-apply.sql` — transactional, five-second lock deadline and sixty-second statement deadline. Acquires ACCESS EXCLUSIVE locks on the bounded targets and repeats acceptance checks under those locks. These short maintenance locks can block readers and writers; this is not a zero-downtime claim. Saves normalized prior/post table and column ACLs, grant options, RLS flags and tracked schema/policy/index/constraint/trigger fingerprints in a new owner-only metadata receipt. Revokes **all table and column privileges from PUBLIC/anon/authenticated only** on the seven targets and enables RLS. Existing policies, rows, constraints, functions and other roles' explicit ACLs are preserved. PUBLIC-derived effective access is intentionally removed. Service CRUD is checked again after revocation; if its access depended on PUBLIC, the whole transaction aborts instead of broadening grants or breaking the server. No role/account/public-profile/reviewer is created. No CASCADE is used. Re-application succeeds only for the recognized unchanged contained state.
3. `docs/sql/first-release-core-containment-rollback.sql` — locks the receipt and targets, then revalidates every current post-state before changing any target; restores the prior semantic ACLs/grant options and original RLS flags, verifies exact restoration and drops only its own metadata receipt. Later drift in tracked grants/policies/column attributes/indexes/constraints/triggers refuses reversal. Column fingerprints include default expression, identity/generated attributes and collation as well as name/type/nullability/ACL. This is not an assertion that every external function body or database setting is tracked. It never drops a pre-existing policy or constraint or deletes a user record. Reversal can deliberately re-expose private data and therefore needs its own approval; roll-forward is usually safer.

The receipt is migration metadata owned by the executing table owner, not a client API or credential store. Its integrity digest detects accidental before/after receipt edits; it is not a security boundary against that owner. PostgreSQL privileges cannot protect metadata from a malicious database owner; the rollback trust boundary is the reviewed owner and unmodified receipt. Dependencies or unknown grant chains fail with transaction rollback instead of broad cascading revocation. All three scripts pin transaction-local `search_path=pg_catalog,public` so caller paths cannot alter catalog deparsing/fingerprint comparison. Role membership/attribute maintenance must be coordinated separately; relation locks are not global role locks.

**Expected impact:** every raw `members` request made with anon/authenticated privileges will be denied, including previously public fields. The SQL does not guess that existing members consented to public profiles. Direct browser reads/writes for either old/new private reading tables and memory will also be denied. Canonical verified server endpoints use service-role access and retain it. Existing deployed clients, prompt/member lookup functions and other integrations must be inventoried before any application; app-server success alone does not prove those callers compatible. SECURITY DEFINER functions can remain a separate route around raw table privileges and require body/dependency review; this stage does not silently alter them.

Before approval: review exact source hashes, restore/backup evidence and a tested restoration process; check current schema/ACL drift; review blocked legacy flows; rehearse on a sanitized, isolated database with no real accounts/records; require anon/authenticated denial and service-only owner-endpoint success. Running the owner preflight is a production read action distinct from applying the draft. No live preflight/apply/rollback from these files was run here.

**Actual local proof:** `verification/web/tests/core-containment-db.test.mjs` passes **14/14** cases against the existing disposable PGlite runtime (`verification/web/evidence/core-containment-db-tests.log`). It executes the exact three SQL files and proves preflight silence/no changes; raw member billing and seven-table browser denial; service SELECT/INSERT/UPDATE/DELETE; preserved private rows/policies/constraints/functions/unrelated explicit grants; PUBLIC/column grants and grant-option exact reversal; mixed prior RLS flags; repeat apply/rollback; different caller search paths with unchanged caller configuration; service/schema/ownership/role failures; PUBLIC-only service privilege loss aborting with full rollback and no receipt; unknown receipt collision; later grant/policy/column/default/index drift; receipt content/access tampering; and non-owner refusal. This is a bounded live-derived schema/permission fixture with synthetic rows, not a complete 95-table production clone, concurrent-session/load test or proof that every legacy client remains functional. No existing SECURITY DEFINER function was changed, and the fixture explicitly preserves its EXECUTE grants to avoid claiming that this stage seals RPC paths.

```sh
# From verification/web; installed disposable local PostgreSQL only.
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/christaylor node --require ./scripts/deny-build-network.cjs --test tests/core-containment-db.test.mjs
```

## Stage 2: identity uniqueness

After caller/restore review, retain the separate `member-identity-preflight.sql` → `member-identity-unique.sql` sequence. Catalog metadata confirms nullable UUID subject and UUID primary-key assumptions. The separately authorized one-second read-only aggregate found zero duplicate non-null subject groups at its snapshot; the owner preflight must repeat its safe no-value duplicate check immediately before any approved DDL.

The draft aborts on duplicates without IDs, account merges/deletes or ownership guessing. It validates equivalent existing indexes semantically, preserves multiple NULL wallet-only members, uses a five-second lock deadline/sixty-second statement deadline and is not a concurrent-index/no-downtime promise. `member-identity-rollback.sql` removes only the unchanged draft-marked index and refuses constraint-backed/pre-existing indexes. Twelve disposable PostgreSQL tests pass. Actual load/lock scheduling and deployed uniqueness remain unverified.

## Stage 3: explicit profile consent and owner editing

After raw-member containment, review `member-profile-preflight.sql` → `member-profile-apply.sql` and the source/fixtures in `member-profile-owner-milestone.md`. Legacy members default private/revision zero; no publication consent is invented. Public server projections must deploy with explicit visibility predicates/whitelists and owner clients must use the verified endpoint. The unused-only reverse script refuses any edit/publication or later dependency. These files remain unapplied; local acceptance does not authorize changing live grants or deploying the app.

## Stage 4: review a strict Circle baseline before the full stack

**The current stack cannot be applied unchanged.** `circle-message-moderation.sql` requires RLS enabled and exactly four known legacy policies across `book_cohorts`, `book_cohort_members`, `seminar_messages`; later participation requires that baseline plus five restrictive policies. Live core tables have RLS disabled and lack the expected policies. The base Circle migration deliberately does not change existing-table policies.

Do not create broad PUBLIC policies merely to satisfy an old fixture. The next local milestone must design a strict service-only baseline for private Circle/member/message writes and revise preflight acceptance to recognize that stricter configuration, while separately reviewing ordinary book-salon behavior. It must begin from a sanitized fixture reproducing actual live catalog structure, grants and absent policies, then execute the **entire** migration chain and meaningful service/browser negative cases. Existing hand-seeded legacy-policy fixtures are not sufficient evidence of production compatibility. This stricter baseline and revised full-chain rehearsal are not completed by Stage 1.

Historical files and intended dependency order, only after that baseline is reviewed:

| Order | Local file | Purpose / stop condition |
| --- | --- | --- |
| 1 | `supabase/migrations/20261027_soe_circles.sql` | Base circle columns/private/rsvp/report tables; reconcile IF NOT EXISTS object semantics and explicit new-object grants. The old base preflight includes a row count and is outside the catalog-only audit performed here. |
| 2 | `docs/sql/circle-moderation.sql` | Reviewer grants, review decisions/report receipts, service-only review RPCs. No reviewer automatically provisioned. |
| 3 | `docs/sql/circle-message-moderation.sql` | Message state/reports/decisions/receipts, parent retention, scoped restrictions; **currently incompatible legacy baseline preflight**. |
| 4 | `docs/sql/circle-participation.sql` | Atomic join/leave/create/RSVP/complete, receipts/revision; requires the reviewed prior protections. |
| 5 | `docs/sql/circle-reading-programs.sql` | Pinned edition/program metadata and participation integration. |
| 6 | `docs/sql/circle-passage-posts.sql` | Rights/edition/program-bound passage posting and receipts. |
| 7 | `docs/sql/circle-discussion-threads.sql` | Immutable reply links, archive/thread reads and revision-bound posting. |
| 8 | `docs/sql/circle-discovery-unicode.sql` | Pinned generated fold/sort profile; verify embedded identity hash, do not hand edit. Can precede unrelated discussion deltas after prerequisites are reviewed. |
| 9 | `docs/sql/circle-discovery-search.sql` | Service-only live discovery using participation/program/Unicode prerequisites. |

`docs/sql/great-books-private-data.sql` is a separately reviewed two-table privacy candidate for `reading_progress`/`book_highlights`, not `great_books_progress`/`great_books_highlights`. Stage 1 already contains both pairs. Reconcile redundant operations and its policy expectations rather than automatically apply both as independent repairs.

Before each full-stack stage: compare expected object definitions, policies, role memberships, table/column/function ACLs, current grants/defaults, fixed search paths and migration-history provenance; stop on unknown collisions instead of bypassing preflight. Verify explicit RPC EXECUTE denial for PUBLIC/anon/authenticated and required service-only access, no SECURITY DEFINER escalation, current membership/visibility/revision/idempotency behavior, and old salon paths under their reviewed scope. No production RPC is to be invoked during metadata audit.

## Rollback and acceptance boundaries

Stage 1 and identity have bounded locally testable reverse scripts. The full Circle chain does **not** have a complete reviewed data-preserving reverse migration. A base-schema rollback is not safe after later moderation/participation/discussion use; dropping tables, messages, receipts or audit history is not authorized. Use an approved restore/roll-forward plan, keep new web writes unavailable during rollout, and never delete history to make an old version boot.

Production acceptance after separately approved application must freshly check schema/ACL/advisors, authenticated server-only HTTP behavior, deliberate provider selection/browser logout, cross-tab retirement, actual cookie domain/path persistence and provider/native/headset behavior. Local build/fixtures prove neither safe hosted configuration nor successful migration. Remaining advisory tables/function bodies/settings require their own scoped review; this plan is not a blanket 29-table rewrite.
