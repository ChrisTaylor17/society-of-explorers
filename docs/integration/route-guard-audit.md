# Route checks reconciled with current behavior

The four broad static failures recorded during the public-feed review were caused by expectations for older implementations. This checkpoint updates their assertions to the current controls, repairs two outdated test setups and preserves the failing evidence. It changes verification and documentation only; application and SQL behavior are unchanged.

| Original failure | What changed in the application before this audit | What this audit checks |
| --- | --- | --- |
| Book salon actor/origin | Ordinary joining moved from raw membership queries/inserts into `soe_circle_legacy_salon_join`. | Authenticated actor passed to the controlled function, Circle delegation, absence of raw membership writes, origin refusal, actual synthetic SQL join and denial after raw grants close. |
| Direct messages | Auth/body checks moved into `direct-message-server`; guarded SQL functions replaced raw sender/read queries. | Authentication, expected account, origin/body bounds, lazy RPC access, read/send/ack actor scope, current conversation scope and no raw-table bypass. Actual route/client/synthetic SQL cases cover participant projection, blocked conversations, selected incoming read flags and stale/account refusal. |
| Great Books metadata | The public route uses the shared reading-edition helper for Gutenberg and Scripture. | Local edition fallback, Scripture source hash checking and no added database or remote fetch. Actual metadata, archive, raster, source-integrity and bookmark behavior are exercised. |
| Thinker identity/member page | Thinker destructures the verified account. Private messages offer a prepared local question instead of sending their history to a model. | Verified actor binding before service/provider use, existing lazy clients and no model request from the private conversation page. Actual route/reward SQL tests use a fake provider and synthetic identity. |

The old origin fixture's fake database did not implement the controlled salon-join function. Its updated fixture asserts the exact authenticated handoff and absence of raw membership mutation; the separate admission SQL suite verifies the real function's behavior. The reading fixture now copies the current shared helper, Scripture data and origin/public-Circle dependencies. No assertion about authorization, rights or integrity was removed to make missing dependencies pass.

## Verification and limits

- All 73 broad static checks pass.
- 62 behavioral cases have passing final results across six existing suites. The initial run passed 47 and failed 15 because of the two stale setups; repaired fixtures passed on subsequent scoped runs. Individual case names and last-run evidence are retained.
- Eleven guard regression cases pass: the current source is accepted and ten deliberate changes are rejected, including submitted actors, missing origin/auth checks, raw messaging access, lost conversation scope, remote reading content, skipped source integrity and a private-message model request. Mutations are in memory; product source is never rewritten for these tests.
- Scoped lint passes with zero warnings. All 2,853 base tracked files are source-bound; application and SQL bytes match the clean starting commit. No full app rebuild was needed for these verification-only edits; the preceding build remains dated evidence for unchanged product code.
- Tests use local source, fictional accounts, offline transport and disposable SQL. They do not establish actual provider sessions, hosted PostgREST, direct production access, physical devices or completed recovery.

See the [machine-readable receipt](route-guard-audit-verification.json). Earlier failed logs remain available; they are not rewritten as successes.

## Two separate product gaps reproduced

1. **Ordinary book-salon creation can report a false success.** With the creator-membership insert denied, the actual route returns HTTP 200 and leaves a created cohort without the creator membership. The route-level reproduction injects a permission error into a fake database. Independently, the admission SQL test verifies that its cutover denies raw service-role membership insertion. Repair creation and membership atomically through an authorized controlled path before that cutover; do not restore broad raw grants. This is separate from the already controlled Circle-creation path.
2. **The member-directory collaborator request does not match its server contract.** The page sends a free-text query, profile text and seeker fields. The actual `/api/match` route rejects that shape with HTTP 400, “Missing projection payload.” It expects a reviewed matching projection and returns a different result contract. Do not label this AI matcher working. Reconcile the intended consent, input, result and error experience without silently sending private profile data to a provider.

These gaps are not repaired by correcting the static checks. They are the next local implementation targets. Hosted backup/access, real account/recovery and device acceptance still block release. No publication, deployment, hosted write, credential change, new installation or spending occurred.

## Preservation

The exact starting Git archive, diagnostic clauses, source hashes and test attempts are retained privately. Revert this local verification commit after reviewing dependencies if needed; there is no schema or product data migration. Do not change pinned recovery inputs or infer production clearance from the passing checklist.

## Subsequent local repair — November 8

The ordinary creation gap is now repaired and verified locally through a controlled atomic path with account-bound retry confirmation and visible failure states. Its SQL remains unapplied; hosted and independent-session acceptance are still open. See [the creation repair and rollout limits](book-salon-creation.md). The matching-contract gap remains unrepaired. The earlier probe and failed logs above describe their original checkpoint and remain preserved.
