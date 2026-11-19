# Strict legacy Circle baseline and additive message adapter

This is an unapplied local migration draft. No production rows, schema, grants, policies, roles, or default privileges were changed. Production application remains a separate owner decision after a current isolated restore and operational review.

## Source and scope

The 2026-11-04 read-only catalog receipt covers exactly public.book_cohorts, public.book_cohort_members and public.seminar_messages. Saved sanitized receipt: verification/web/evidence/circle-live-catalog-2026-11-04.json, SHA256 e6819adff5ff99ff14563eb1636cde1370efe0d3713445b2c4ac7a5760941c67. An owner-authorized exact-byte copy at verification/web/tests/fixtures/circle-live-catalog-2026-11-04.json makes the offline fixture reproducible without ignored evidence. Live metadata showed 27 columns, six constraints, seven indexes, RLS off, no policies, broad direct anon/authenticated/service_role grants including TRUNCATE and MAINTAIN, and broad public-schema object-creation defaults. It showed no members foreign key.

The baseline accepts the observed table types, nullability, known defaults, constraints and exact index definitions under the current table owner. It refuses unexpected initial policies, user triggers, inherited/privileged browser authority, browser schema CREATE, unknown grantees, delegated grantors, ownership drift, pre-existing adapter columns, or absent effective service CRUD. It neither invents policies nor repairs legacy data.

The only application-schema addition is nullable public.seminar_messages.member_name text, with no default and no backfill. Existing sender_name, sender_type, thinker_id, passage_reference, all row values, nullable references and NO ACTION foreign keys remain unchanged. Historical labels remain null/unattributed through this new column. New verified member posts can use the existing canonical member_name write path; the observed sender_type default remains member. Display labels never establish account ownership.

## Effect and compatibility

circle-legacy-baseline-apply.sql revokes ALL table privileges and every column privilege from PUBLIC, anon and authenticated on the three tables, then enables RLS without adding permissive policies. ALL includes MAINTAIN and TRUNCATE on the tested PostgreSQL 17 runtime. Each table's service CRUD is checked both before and after revocation; a service permission supplied only by PUBLIC causes an atomic abort. Existing owner/service authority is retained.

Raw browser Data API reads and writes, including ordinary salons, are intentionally closed. Legacy direct-Supabase clients therefore require the reviewed server DTO/RPC paths before release. This baseline does not itself make ordinary conversations public, grant Circle membership, disclose roster identities, or authorize any new participant. Root's ordinary-salon read/write adapter is separate.

The two existing migration preflights now have explicit branches:

- Strict: owned/private baseline receipt plus no effective browser table or column authority; zero initial policies become exactly five existing restrictive Circle policies. Participation accepts those five.
- Historical: the unchanged four permissive fixture policies become the existing nine-policy configuration. This remains a compatibility fixture path.
- A strict receipt cannot fall back to the historical four/nine-policy path. Unknown/mixed policies, reopened grants, altered receipt authority, or absent adapter shape refuse migration.

Both scripts pin the transaction-local search_path to pg_catalog,public. Restrictive policies add no access when no permissive policies or browser privileges exist. They are retained so the existing Circle protection contract remains explicit.

The owner-only receipt public.soe_circle_legacy_baseline_v1_state has RLS, no policies, and all inherited non-owner default grants removed, including service_role. It stores normalized prior/post ACLs and bounded catalog fingerprints, with MD5 integrity checks for accidental drift. A trusted owner can modify both catalog and receipt; these are review/restore guards, not a cryptographic boundary against that owner. No SQL function or browser capability is installed by this baseline.

## Order and rollback boundary

For a reviewed isolated restore:

1. Verify the actual service/owner/browser roles, schema and current metadata. Run circle-legacy-baseline-preflight.sql.
2. Run circle-legacy-baseline-apply.sql atomically. Run its preflight/reapply immediately if checking idempotence, before later Circle DDL.
3. Apply the existing 20261027_soe_circles.sql migration, circle-moderation.sql, circle-message-moderation.sql, circle-participation.sql, then reading-programs, passage-posts, discussion-threads, discovery-unicode and discovery-search in their existing order.
4. Separately apply/review the member containment/identity/profile prerequisites and ordinary-salon server adapter in their required order. This document does not approve those production operations.
5. Verify effective table/column/function ACLs after the complete chain under the observed broad creation defaults. Do not change global defaults or the other exposed tables as an implicit part of this baseline.

circle-legacy-baseline-rollback.sql is an unused-baseline rollback, not a full release reversal. It acquires target and receipt locks, revalidates all tracked post-state before restoring any table, refuses any non-null additive member_name, and drops only the unused new column and owned receipt with RESTRICT. It then reconstructs only the revoked prior browser/PUBLIC table/column grants, including grant options, and the prior RLS state. Reopening those previous raw grants is itself an approval-sensitive operational decision.

Any later Circle migration, extra policy/index/constraint/column, default change, receipt alteration, or target grant drift refuses rollback. Relation locks do not serialize cluster-wide role changes or arbitrary owner activity; the operational review must coordinate trusted-owner maintenance. Fingerprints cover the tracked target catalog metadata and direct member_name dependencies, not every external application dependency. No row repair, account merge, author backfill, cascade change, default rewrite, or unrelated table change is performed.

## Offline proof

The reusable fixture verification/web/tests/support/circle-live-db.mjs is derived from the saved sanitized catalog, not the old permissive historical DDL. It reproduces observed table shapes, broad table/function/sequence defaults, eight table privileges, role membership options, and the incoming FK-trigger semantics. The members prerequisite and external book_reflections child are explicitly synthetic minimal stubs; the unknown external-child schema and hosted administrative grantor behavior remain fixture exceptions.

The weekly_schedule JSON literal was redacted in the catalog receipt. The fixture uses an explicitly synthetic default, never executes the redaction marker, and never claims exact fidelity for that one expression. The baseline neither compares it to an invented literal nor changes it: it fingerprints the existing definition for later drift detection.

Guarded clean-environment runs:

- 55/55 passed across circle-legacy-baseline-db.test.mjs, message-db.test.mjs and participation-db.test.mjs: 16 new security cases plus 39 historical compatibility cases.
- The final strengthened baseline file independently passed 16/16, including actual service create/read/update/delete on all three tables, unchanged original rows/sender fields, nullable/no-default/no-backfill adapter, all eight denied browser privileges, column/PUBLIC grants and grant options, service-via-PUBLIC atomic abort, owner-only receipt, unknown object/authority refusal, strict 0→5 behavior, fallback refusal, and unused rollback/drift cases.
- The separate sanitized-live full-chain suite passed 8/8 with identical before/after source hashes. After moving the exact metadata bytes to the tracked fixture path, it passed 8/8 again with unchanged SQL. Its final receipt is evidence/circle-live-chain.json, SHA256 f257f47aa17a44f34d8bff1bed50ae035c6fe6c1cccde11599cdc8af29ea0a48; this covers the three baseline files and nine existing Circle migrations under the declared fixture exceptions. The final shared fixture helper SHA256 is af3ca0acc419eb8badb93305f94675f3d0e351a955fc20a2034d6f9355bb2652.

Independent read-only review of the final five owned SQL files found no unresolved concrete issue within this baseline/receipt/unused-rollback scope. That review did not execute SQL and did not verify live state, cluster-wide owner maintenance, or hosted behavior.

Commands, from verification/web:

    env -i PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin node --require ./scripts/deny-build-network.cjs --test tests/circle-legacy-baseline-db.test.mjs tests/message-db.test.mjs tests/participation-db.test.mjs
    env -i PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin node --require ./scripts/deny-build-network.cjs --test tests/circle-legacy-baseline-db.test.mjs

Receipts:

- evidence/circle-legacy-baseline-tests.log SHA256 d9cf6c4bca49e5138fb6113c3b09606e815e319ac9a365fb296e4b7367ae3340.
- evidence/circle-legacy-baseline-final-tests.log SHA256 d68504eea7bf6eb8ca25ff04088219662b3a97c2e2d6737daab6dab800ea2195.

Final owned source hashes at freeze:

| File | SHA256 |
| --- | --- |
| circle-legacy-baseline-preflight.sql | b35bfae01d27c59ca12e7fede593419ce83a960519142a6bb6802a6f37dc2be1 |
| circle-legacy-baseline-apply.sql | 923814c08149be78bbc3c2990dc3220f2f737cb748cbd316ebaefd84fb7b3280 |
| circle-legacy-baseline-rollback.sql | 0a8770268eb7b50d562a738addf4c4fe3278e500e5a773177d0980a32ea5765d |
| circle-message-moderation.sql | 672758fe331a8814454f80cc0ff005ce5676556a68a1846bb5b45fb4ae09fa49 |
| circle-participation.sql | 7b35c0db4cc84b82c8620a67625519dec53b4a9a9dc6abd332674a3e33200917 |
| circle-legacy-baseline-db.test.mjs | 0750c4b4211db226dccd83013e4ed2c2ec054a8728a59c520ab961d20ccd6f84 |

The local PGlite runtime reports PostgreSQL 17.5, while the live control-plane snapshot reports 17.6. PGlite proves actual SQL/ACL/transaction behavior in one synthetic local PostgreSQL session. It does not prove live row compatibility, hosted PostgREST/schema cache behavior, multi-backend scheduling, production deployment, or absence of other private-data exposures. All production gates remain open until separately reviewed and authorized.
