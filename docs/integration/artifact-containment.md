# Artifact raw-access containment

This local draft is unapplied. No production rows, grants, schema, accounts, or provider calls were changed. It scopes containment to public.artifacts and a new owner-only metadata receipt. Any production application or reversal needs a separate owner decision.

## Observed metadata and fixture limits

The saved 2026-11-04 catalog receipts were collected read-only without user rows or function bodies:

| Tracked fixture | SHA256 |
| --- | --- |
| verification/web/tests/fixtures/hall-catalog-2026-11-04.json | 11a86194c0ebbef4cb2454aed760e6e64bd3d3896298469514d7fff02caed8e4 |
| verification/web/tests/fixtures/hall-catalog-supplement-2026-11-04.json | 0a1e2bf6b9c67666949906a154733e50b5da97249551521913560eac8f09902e |

Both are exact-byte copies of the original ignored evidence, with their original timestamps/query/boundaries preserved. The observations show an ordinary postgres-owned artifacts table with 13 columns, a UUID primary key, nullable member_id referencing members(id) ON DELETE CASCADE, title/thinker_id NOT NULL, and private prompt/context plus text/media/theme fields. RLS is enabled, with public SELECT when is_public=true and public INSERT WITH CHECK(true). anon/authenticated/service_role each have all eight direct table privileges, including MAINTAIN/TRUNCATE. There are no column ACLs, partitions or inheritance links, and only the primary-key index.

Six internal FK triggers include outgoing member checks and incoming nft_mints CASCADE-delete/NO ACTION-update plus artifact_merch NO ACTION-delete/update. Their actual external child column names/full schemas were not collected. The local fixture therefore uses explicitly synthetic minimal members, nft_mints and artifact_merch stubs, preserving only the known target FK behavior. No real member or artifact values enter the fixture.

The id, boolean and timestamp default expressions are explicitly whitelisted in the supplement and verified against their MD5s. The theme JSON default remains unknown: only its observed MD5 f3db357cf4f4a03883484fa3281a056c is preserved. The fixture uses a visibly synthetic JSON default and never executes a redaction marker or claims exact literal fidelity. The migration dynamically fingerprints each actual current default and never reconstructs, compares against an invented literal, or modifies it.

The synthetic fixture also enables broad new-table default grants after building the target objects. This is a deliberate receipt-privacy stress test, not a new Hall-specific observation or modification of production default privileges. Synthetic local postgres administration and PGlite do not model hosted Supabase accounts or connections.

## Apply behavior and impact

artifact-containment-preflight.sql is read-only and inspects only catalog/receipt metadata. It verifies the exact 13-column type/nullability contract, trusted table ownership, the existing primary/member FK shape, browser authority constraints, and effective service CRUD. It does not inspect artifact rows, decide publication consent, or repair data.

artifact-containment-apply.sql:

- Revalidates role/schema/table/receipt acceptance after acquiring bounded ACCESS EXCLUSIVE locks.
- Revokes ALL table privileges and every column privilege from PUBLIC, anon and authenticated on artifacts, including MAINTAIN and TRUNCATE.
- Enables RLS without changing either existing policy, any field/default/row, index, trigger or FK action.
- Verifies service SELECT/INSERT/UPDATE/DELETE again after revocation. If service access came only through PUBLIC, the whole transaction aborts instead of broadening service permissions.
- Creates only public.soe_artifact_containment_v1_state, with RLS/no policies and every inherited non-owner default grant removed, including service_role and unknown grantees.

Raw browser/Data API artifact reads and writes intentionally stop working, even for is_public rows. Before this change, the public SELECT policy and table-wide SELECT exposed prompt_used and conversation_context along with public fields; the policy's name did not provide a column whitelist. The Hall client must use the reviewed server projection. Anonymous/raw client INSERT is also removed rather than treated as ownership proof.

Current canonical callers are the server Hall projection and service-role artifact generation/merchandise/mint/count paths. Their source compatibility and the Hall UI are a separate review by the owning agents; this containment does not prove that those handlers authorize every operation correctly. Older deployed clients were not inventoried or exercised. Existing privileged functions, other roles/tables, storage/media, and unrelated exposure advisories remain outside this draft.

No global default ACL, role grant, membership, public schema permission, existing function, or other table grant is modified. Existing authority of the owner, service and unrelated roles is preserved; this is closure of PUBLIC/browser raw authority, not a claim that no other principal can read artifacts.

## Receipt, reapply and reversal

The owner-only receipt stores normalized prior/post ACLs and bounded metadata fingerprints: table owner/OID/RLS, 13 columns with default/comment MD5s, policies, constraints, indexes, all target triggers, and trigger-function metadata/body/config hashes. It stores no artifact values or unknown default literals. Its MD5 integrity field detects accidental receipt drift, not a malicious trusted owner who can alter both catalog and receipt.

Preflight/reapply is idempotent while the tracked post-state is unchanged. Unknown same-name receipt objects, delegated browser grantors, service loss, changed owner/schema, receipt access/content drift, and later tracked grant/default/policy/FK/index/trigger changes require review. Existing policy definitions are preserved dynamically; this migration does not replace unexpected policies with broad defaults.

artifact-containment-rollback.sql validates the receipt and every tracked post-state under locks before reconstructing only the revoked prior PUBLIC/browser table/column grants, including grant options, and prior RLS state. It never drops artifact columns, policies, constraints, indexes, triggers, dependencies, or rows, and it drops only its owned receipt with RESTRICT. A later dependency or state change aborts atomically. There is no CASCADE cleanup.

This is an access rollback, not a data rollback. The catalog-only receipt cannot establish that the feature is unused: it records no row counts, values, write history, or usage events. Unused or used rows all survive. Restoring old grants may expose newly created is_public rows and their prompt/context fields under the old policy. Tests explicitly demonstrate that risk; passing reversal tests does not authorize reopening access. Forward containment/reconciliation is safer. An operator must separately review current exposure and approve any reversal.

Relation locks bound table/receipt changes and pause conflicting traffic; there is no zero-downtime claim. Cluster-wide role changes and arbitrary concurrent trusted-owner/function maintenance require coordination. Drift guarantees apply to the tracked catalog contract, not every external application dependency or hosted setting.

## Local verification

The actual SQL runs against a disposable PGlite PostgreSQL 17.5 instance, with no installed dependency changes, issued credentials, live project connection, provider request, or external socket. Live metadata is PostgreSQL 17.6; a current authorized restore remains a production gate.

The final database file passed 16/16 cases, including:

- Faithful 13-column, known-default, ACL/policy and six-trigger semantics, with explicit synthetic exceptions.
- Preflight preserving all rows/catalog state and returning no private values.
- Actual public prompt exposure before apply and raw table/column/browser DML denial afterward, plus all eight effective privilege checks.
- Actual service create/read/update/delete without changing its prior grants.
- Original row, default, policy, FK/index/trigger, external dependency and unrelated-role preservation; receipt inaccessible to browser/service/unrelated roles under broad synthetic defaults.
- Exact ACL/grant-option/RLS rollback and reapply/search-path stability.
- Atomic refusal of service-via-PUBLIC loss, delegated grants, role/schema/owner drift, receipt collisions/tampering, and later target/incoming-FK drift.
- Actual preserved CASCADE/NO ACTION FK behavior and used-row retention/re-exposure on explicit local rollback.

Command from verification/web:

    env -i PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin node --require ./scripts/deny-build-network.cjs --test tests/artifact-containment-db.test.mjs

Final log: evidence/artifact-containment-final-tests.log, SHA256 34e9c875f75ebb5ad131aa473290e46381b889d7c6fa387f76b55d2c2ff9b499.

Independent read-only review of all three final SQL files found no unresolved concrete issue within the documented trusted-owner maintenance and catalog scope. It did not execute SQL or verify live behavior. The review explicitly retained the used-rollback exposure limit rather than claiming an unused-only rollback.

The separately owned Hall composition receipt was inspected at evidence/hall-composed-browser.json, SHA256 7b4b8aaff3caa9b5d476ec9fd7ede61eae0f98567323db4f658701ddbe6533e5. It records four actual component → canonical handler → cached SDK → contained service-SQL stories, seven service queries, and unchanged before/after source hashes. This strengthens the Hall read path; its owner separately owns API/parser/browser acceptance and limitations.

## Frozen source

| File | SHA256 |
| --- | --- |
| docs/sql/artifact-containment-preflight.sql | 38fef591fcb880891c0bf730f3fab73b9c682be44eac62a593af5b6c86338b6d |
| docs/sql/artifact-containment-apply.sql | da579600db111fca48c9bfb0347985ff221af7dddd8ea502e79f1776554465b5 |
| docs/sql/artifact-containment-rollback.sql | 22a2ff82534343c4fa3f725bcf39b496efe159195dc13890e0bcca74f6c47043 |
| verification/web/tests/artifact-containment-db.test.mjs | 8116a27ceef5ec56bf547ddf9ba51d7671d483392a93738ad10740d79599a541 |
| verification/web/tests/support/artifact-containment-fixture.mjs | 87aa7915b6529605411dd0606130a3f92b0af828f54447555e44682a04552fcc |

All production migration, provider/account, media, deployment and user-data compatibility gates remain separate. These are local SQL and synthetic integration results, not production application or consent evidence.
