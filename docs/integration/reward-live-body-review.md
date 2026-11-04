# Exact reward-body offline rehearsal

This is an additional local proof using three exact definitions captured read-only on 2026-11-04. No live function was invoked, no member/event rows were read remotely, and no production access changed. The original 13 representative-body cases and frozen containment scripts remain unchanged. This rehearsal replaces the three functions’ earlier body uncertainty with a dated source snapshot; it does not turn the older representative tests into exact-body evidence.

## Provenance and fixture boundary

The root-owned tracked fixture is `verification/web/tests/fixtures/reward-live-bodies-2026-11-04.json`, SHA256 `e8a8a02d150e120adca9ccab34b0994564a4beb217cf36ab392ce832405211a0`. Its exact CREATE definitions are executed unchanged in disposable PGlite. Both extracted source and installed `pg_proc.prosrc` match the earlier independently saved catalog receipt:

| Function | Body bytes/characters | MD5 |
| --- | ---: | --- |
| `add_exp(uuid,integer,text)` |201|`45c3f91859a6c157ddbc6b155e40d524`|
| `increment_exp(uuid,integer)` |104|`d18f4bd9730603002d5c779f9843fc1d`|
| `increment_exp_tokens(uuid,integer)` |102|`8185aee4259a8ede92b7e14b5b7132af`|

Owner, language, volatility, security-definer status and absent function settings also agree. `add_exp` retains its one default argument, `p_reason text DEFAULT ''::text`.

The fixture reproduces the observed nullable integer `members.exp_tokens DEFAULT 10` and `exp_events` UUID primary key, creation timestamp, nullable member FK, non-null amount and nullable reason; both tables have RLS enabled but not forced and are owned by postgres. Uncaptured FK name/actions use explicit synthetic PostgreSQL defaults. Other profile columns, identities, starting balances and all records are synthetic. The actual planned profile migration is optionally added to test its revision guard; the separate unguarded fixture confirms the captured baseline has no user triggers.

Browser raw table grants/policies are deliberately absent. This isolates SECURITY DEFINER exposure even with closed raw tables; it is not a reconstruction of every deployed table policy. Broad synthetic default grants stress the new owner-only receipt’s ACL scrub. No production defaults are changed. This is not a 95-table restore or hosted Supabase runtime.

## Actual behavior observed locally

An anonymous caller with no auth identity or raw member-table read access can call the captured SECURITY DEFINER `add_exp` for arbitrary synthetic member B. The function changes B’s balance and creates an event. It does not check caller ownership, positivity or a request/idempotency key.

- Negative amounts subtract; zero amounts still create an event. Repeating identical arguments repeats both effects.
- A null existing balance remains null while a positive event is recorded; this function does not coalesce the old balance.
- A null member target creates an unattributed event because that column is nullable. A nonexistent non-null target fails the observed FK and rolls the whole call back.
- A null amount fails the event table’s non-null constraint and rolls back the preceding balance change. Integer overflow also fails atomically. These are database constraint failures, not deliberate input validation.
- Both invoker increment functions coalesce a null balance to zero, accept negative/repeated amounts, and set the balance to null for a null amount. A null target changes nothing. They create no events. Browser EXECUTE alone does not bypass their invoking role’s table authority; the deliberately closed-table fixture denies those calls before containment.

These findings demonstrate the captured definitions on synthetic rows. They do not claim a live exploitation attempt or establish every deployed invocation path.

## Containment, service caller and rollback

The unchanged catalog-only preflight preserves rows and function metadata. The unchanged apply script revokes only browser/PUBLIC EXECUTE, keeps service access, and preserves exact bodies, attributes, default argument and existing rewards/events. Anonymous/authenticated calls of all three signatures—including the two-argument default-reason call—then fail. The private receipt remains unreadable by browser and service roles.

Service calls still update only EXP without changing protected profile fields or advancing the actual planned profile revision guard. The actual canonical Thinker route is loaded with explicit synthetic auth/provider and controlled service transport to the exact SQL functions. A body claiming B still credits server-derived member A, whose verified subject is a distinct synthetic UUID. Its successful council response executes one `increment_exp` call and records exactly one event, with no fallback or profile edit. Without a verified member, it returns 401 before provider/reward/event work.

The Thinker event INSERT and increment RPC are separate service operations. This successful-path proof does not establish atomic accounting, failure recovery or idempotency across them. No application source was changed.

Rollback restores exact prior ACLs and preserves body/default metadata and all rewards/events created after containment. It can reopen the unsafe browser EXECUTE authority and requires separate impact/owner approval. A changed exact body after containment refuses rollback before any browser authority is restored. There is no reward reversal or account merge.

## Verification and remaining gates

The new suite is `verification/web/tests/reward-live-body-db.test.mjs`, using only its new isolated helper. Final source/evidence bindings and result are in `verification/web/evidence/reward-live-body-rehearsal.json`; TAP is `verification/web/evidence/reward-live-body-db.log`. Execution uses a clean PATH-only environment, cached PGlite/TypeScript and startup external-network denial. All source reads are guarded against symlinks and nonempty zero-block placeholders at the new boundary; the existing actual-module loader stats canonical imports before reading.

The 13 new cases are additional to the unchanged 13 representative cases, with overlapping coverage rather than a replacement or a fresh run of the older suite. PGlite has one backend; authentication, provider stream and PostgREST transport are controlled doubles. No provider account, actual model, issued credential, multi-backend schedule, hosted commit/delivery or deployed legacy caller was accepted.

The frozen containment scripts capture body fingerprints dynamically; they do not themselves require these reviewed MD5s. A separately approved production preflight must refresh and compare exact bodies/defaults/authority, review deployed callers and backup/restore/impact evidence, and refuse unexpected drift. The captured functions remain permissive for authorized service callers. This local result does not apply containment or clear any broader release gate.
