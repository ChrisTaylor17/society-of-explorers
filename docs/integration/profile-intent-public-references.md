# Profile intent ordering and published Circle references

These are unapplied local review candidates. No provider operation, live SQL, deployment, production restore or native device verification is represented by this milestone.

## Profile choice ordering

The saved baseline reproduction is `verification/web/evidence/profile-intent-ordering-audit.json`. Against the unchanged prior profile SQL, a held public save at revision zero could commit after a newer unchanged private confirmation also returned revision zero. A new client context could therefore confirm private and later become public. This was an actual canonical HTTP/SQL reproduction, not an inferred UI race.

Apply `member-profile-intent-preflight.sql` and `member-profile-intent-apply.sql` only after the reviewed original owner-profile migration. The original schema, data, revision guard and validations remain pinned. A new alphabetically later `BEFORE UPDATE OF` trigger advances every accepted authored profile intent exactly once, even if all values are unchanged. PostgreSQL runs the original revision guard first, preserving rejection of caller-supplied revision changes; changed saves already advanced by that guard are not incremented twice. Updates that target only unrelated account columns do not invoke the new trigger. Raw service updates of authored fields also receive this ordering barrier.

The profile update RPC retains its runtime check of the original revision guard and additionally requires a result at submitted revision plus one. The new intent trigger shape is pinned by migration preflight; a disabled or missing trigger cannot commit an unchanged save because the result postcondition aborts that transaction. The current HTTP route and shared native controller require that same exact floor. Missing/disabled ordering SQL or a stale no-op response fails closed. Deploy these server/client changes with the candidate; do not restore an older writer while retaining newer client assumptions.

An uncertain operation is still not a receipt. A fresh GET at unchanged revision cannot prove that a held request will not finish. Explicit exact-payload/base retries remain safe under CAS. A committed save, including an unchanged save, advances revision; an old-base retry conflicts. A higher-revision GET establishes current state and fences the earlier base, without claiming which request committed. The shared controller preserves its private pending payload across view detach and ordinary lifecycle retirement, hides it until fresh owner verification, and destroys it at terminal account disposal. A later deliberate unchanged confirmation also fences an older held change across that terminal boundary.

The preflight pins trigger names, target columns, event kind, function bodies, ownership, grants, search paths and existing profile objects; partial installs, disabled/foreign interfering triggers and drift require review. Default function grants to unrelated roles are removed for the new guard. The original v1 profile preflight intentionally refuses the newer update definition. Disable-only rollback revokes service execution of profile updates but retains profile choices, revisions and both guards; reapply restores the same stronger RPC. It does not restore the former no-op behavior or erase data.

## Circle navigation references

After the current Circle reading/discussion, attendance and membership-intent chain and profile consent schema, review `circle-public-profiles-preflight.sql` and `circle-public-profiles-apply.sql`. Six additive service-only invoker read wrappers call the existing authorizing functions and then add narrow publication references. Original functions and immutable histories remain unchanged:

- `soe_circle_detail_profiles`: `circle.publicProfileId` identifies the currently published host; public visible Circle detail retains its existing anonymous policy.
- `soe_circle_messages_read_profiles`: latest100 conversation authors.
- `soe_circle_discussion_read_profiles`, `soe_circle_discussion_thread_profiles`, and `soe_circle_discussion_receipt_profiles`: archive, thread root/focus/items and exact receipt lookup.
- `soe_circle_message_state_profiles`: the current message safety projection, including the existing author-after-leave access rule.

Only actual `members.id` values with `profile_visibility='public'` can become references. Message references additionally require the actual message to belong to the requested Circle, its current visible/unwithdrawn state, valid bounded discussion content/time, and a visible Circle. Hidden, withdrawn, unavailable or quarantined views return null. The wrappers do not expose authentication subjects, wallet addresses, email, roles, membership-row IDs or private profile fields. In particular, legacy conversation roster IDs remain membership-row IDs and are not profile IDs.

The current server requires the explicit reference field from these wrappers; absent SQL/privileges and malformed or missing references return unavailable. Optional absence is supported only by pure parsers for historical DTO compatibility and means no navigation. Mutation responses without a reference also mean no link until a fresh read. No authority is inferred from display names or `is_mine`.

A reference is a navigation hint captured at read time, not perpetual publication consent. Opening it uses the existing anonymous exact-ID `/api/explorer/:id` projection, validates the returned ID and narrow fields, and handles unavailable/private results. A later unpublication removes future references and makes the public endpoint unavailable; it cannot recall data already read. Host/author links grant no membership, posting, management, private profile or account authority. Avatar upload/storage and a new member directory are outside this change.

The candidate pins prerequisite read function bodies and service-only execution, and pins new wrapper identities, signatures, bodies and ACLs. Duplicate apply is checked; disable-only rollback revokes only new wrapper execution. Current reads then fail closed instead of using old routes to guess references. Original participation/read access remains unchanged. Reapply restores these reviewed wrappers. Trusted-owner function DDL and grants must be coordinated separately; local tests do not claim concurrent maintenance or independent PostgreSQL-session scheduling.

## Local evidence

`public-profile-backend.json` binds actual canonical identity/HTTP handlers, both new SQL candidates, the reusable current fixture and focused shared controller tests. Its SQL proof covers unchanged/changed ordering, old-base conflicts, owner mismatch, response privacy, unrelated updates, direct revision refusal, duplicate apply, disable/reapply, trigger/grant drift, publication changes, member/author access, and all six reference read paths. Synthetic provider identities and HTTP delivery are explicit; the local PGlite connection executes real SQL. Browser and native proofs separately bind the same fixture. The baseline gap receipt is preserved and is not relabelled as a passing current implementation.
