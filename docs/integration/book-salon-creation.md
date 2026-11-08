# Ordinary book-salon creation

Ordinary book-salon creation previously saved a cohort, ignored a failed creator-membership insert and returned success. Admission containment deliberately closes that raw membership write. The new route delegates both records and a retry receipt to one service-only transaction. It never falls back to raw inserts or restores those broad grants.

The actual form stays open with its entries when creation fails or cannot be confirmed. It disables duplicate submission and editing during a save, binds the displayed account, and times out an unanswered request after 15 seconds. An unchanged retry from the same mounted form reuses the request ID, including when SQL committed but the response was lost. Success requires the matching request, creator and membership confirmation. A changed account is refused.

## Authority and consistency

- The server resolves the current wallet/provider identity before obtaining the database client. A submitted expected member is a comparison only; it cannot supply authority.
- `soe_circle_legacy_salon_create` is a public **security-invoker** wrapper executable only by the server role. The fixed-search-path definer implementation lives in the separate, unexposed `soe_book_salons_private` schema. It uses the existing account-removal gate before the existing actor lock, rejects unknown/malformed input and never creates a Circle. The service transport has no browser `auth.uid()`; verified server identity plus service-only execution is the existing application boundary, not browser claims.
- Any failed or silently skipped insert raises an exception and rolls back the cohort, membership and receipt. Replays hold the current cohort and creator membership; they do not recreate a deleted salon or restore a removed membership.
- Private receipts bind actor, request ID and a SHA-256 of normalized input. A reused key with changed details is refused. No duplicate title or description is retained in the receipt. A deleted salon leaves a receipt tombstone; actual member deletion cascades its receipts. Database owners remain trusted authorities.
- The request ID is held in page memory. A full reload, browser crash or edited form is **not** guaranteed to recover the same request. Review the salon list before starting over after an uncertain result. Persistent draft recovery remains a separate design question.

The implementation follows the current [Supabase database-function guidance](https://supabase.com/docs/guides/database/functions) on restricted execution, fixed search paths and transaction failure. The November 8 changelog review did not require a new dependency or CLI upgrade. Private candidates are exercised in disposable local SQL, not through the hosted SQL tools.

## Verification

The linked [verification receipt](book-salon-creation-verification.json) binds the product, SQL and test source to the exact starting Git archive. Focused cases exercise the real TypeScript route and actual candidate SQL, including failed and skipped inserts, unchanged/changed retries, removed membership, deleted salon, account removal, browser/default-grant denial and preserved Circle creation. Existing origin, admission and mutation-based static-guard suites remain covered.

The full offline Next build/type check passes with 1,226 product inputs. Six compiled browser journeys cover the 320/390-pixel form, database failure, a lost reply, a never-arriving reply, duplicate clicks, changed accounts and malformed success responses. Existing dependencies were reused. The owned browser, disposable database and local preview are closed. No paid provider was called.

These are local synthetic tests. The database transport, identity and listing adapters are explicit; PGlite queues work on one connection. Independent concurrent PostgreSQL sessions, hosted PostgREST/RLS, real provider identity and physical phones remain unverified. The full account-erasure workflow remains gated; the receipt cascade test alone does not establish its completion.

## Rollout and rollback — not executed

1. Preserve the recovery/checker pins and obtain the coherent hosted capture and isolated restore already required for release.
2. Add this new private table and its tombstone/cascade behavior to the candidate backup, retention and account-erasure inventory. The observed hosted 97-table backup scope is unchanged because this candidate is unapplied.
3. On the isolated restore, apply and verify the reviewed admission chain first, inspect [the read-only preflight](../sql/book-salon-creation-preflight.sql), then rehearse [the creation candidate](../sql/book-salon-creation-apply.sql). Verify role memberships, fixed owners/search paths, function ACLs, raw-write denials, actual PostgREST and independent-session failure/retry/removal races. The pinned admission schema/function counts are unchanged.
4. Coordinate SQL and application release only after approval. If the function is absent or disabled, the new route refuses creation with 503; it cannot report success by falling back to two inserts.
5. If rollback is needed, first disable creation with [the reviewed disable candidate](../sql/book-salon-creation-disable.sql). It revokes execution and preserves every salon, membership and receipt. Do not restore the old raw-writer route while the raw membership grants are closed. Do not drop receipt data or restore broad privileges as rollback.

Subsequent work corrected [member discovery](member-discovery.md) and [public book-salon discovery](book-salon-discovery.md). The latter preserves this creation POST/SQL and verifies six existing creation browser stories against the new list format. The later [account-lifecycle correction](book-salon-account-lifecycle.md) adds account/draft retirement and owned membership readback while preserving both writers and SQL. Its retry ledger remains page-local; durable browser recovery and join idempotency remain unresolved. Hosted privacy, recovery, real account/device acceptance and pilot demand remain open. This checkpoint does not authorize deployment, hosted writes, credential changes, outreach, new installations or spending.
