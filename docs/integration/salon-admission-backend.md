# Member-bound salon invitation backend

This is a locally tested backend candidate. No hosted SQL, membership, access rule, credential or deployment was changed. The pilot still needs host/member screens, phone link handling, complete restore coverage and hosted acceptance.

A Circle created with `admissionMode: "host_approval"` requires an invitation for a specific existing account. The host checks that member's code and display name, reviews the current salon and invitation revisions and a UTC expiry, then issues a signed invitation lasting at most 24 hours. Issuance does not add a member. The recipient must sign in to the named account and explicitly confirm joining. A forwarded or edited token cannot approve another account or salon.

This controls membership. The existing public listing can still disclose the salon's title, description and schedule. It does not make a Circle invisible or make a meeting room private by itself. Meeting links stay behind current membership; the host still needs a waiting room and the privacy checks in the pilot plan.

## Authority and recovery

The server derives a purpose-specific signing key from the existing `NEXTAUTH_SECRET`; it refuses missing or short configuration. No new key is created or stored. Signature verification binds the salon, recipient, host, invitation revision, nonce and expiry. Issuance checks the authenticated host again after the database review. The database trusts the authenticated server's verified attestation; browser roles cannot call its public or private routines. A compromised service credential is outside this boundary.

The database rechecks the current host and account-removal guard, invitation revision, expiry, Circle revision, visibility, schedule and capacity. Direct service-role membership insertion/upsert and member/cohort reassignment are refused. Controlled private functions perform the reviewed writes. A narrow surrogate-id update grant is retained because PostgreSQL requires an update privilege when existing access checks lock a membership row.

The existing open Circle create/join signatures remain. Older ordinary book salons use a separate controlled writer that refuses every SoE Circle and checks capacity under one cohort lock. This preserves their unkeyed legacy join response while removing the raw insertion path. After the complete admission candidate is installed, that writer also uses the current account-removal guard.

An invitation nonce is consumed once. Only an exact join request can recover its receipt; an expired or revoked invitation cannot create a fresh membership. A recovered receipt can say the old join committed while current state says the person has since left. Lost, malformed or signed-out post-commit responses remain unknown. They do not trigger an automatic retry. The signing secret must remain available for token-based recovery; key rotation and a separate owner-bound receipt lookup need explicit design before release.

The receipt stores only the recipient's opaque approval nonce and proof hash, with the existing recipient-owned participation record. It does not store the raw signed token, additional host identity claims or a new request queue. A synthetic native PostgreSQL rehearsal now restores the complete 67-table release with private admission implementations and verifies recipient receipt removal and wallet identity detachment through the existing owner workflow. The matching hosted-source backup and real provider acceptance remain pending.

Host revocation increments the invitation revision. It refuses unused older invitations and preserves existing members. It does not evict someone who already joined. The disable-only rollback closes new private creation and invitation use, preserves membership and receipts, and permits exact receipt recovery. It never reopens a private Circle or restores raw membership writes.

## Local endpoints and staged SQL

| Endpoint | Purpose |
| --- | --- |
| `POST /api/circles/:id/invitation-review` | Check the actual host, recipient code and current revisions; return a bounded expiry. |
| `POST /api/circles/:id/invitations` | Recheck the reviewed target/revisions/expiry and current account before signing. |
| `POST /api/circles/:id/join-invited` | Verify the recipient-bound signature and submit the exact reviewed join. |
| `POST /api/circles/:id/invitations/revoke` | Revoke outstanding invitations with revision checks and receipt recovery. |

The proposed order is `circle-legacy-salon-membership.sql`, then `circle-admission-apply.sql`, after the existing reading, membership-intent and account-access candidates. The admission preflight pins the predecessor definitions and the prepared legacy writer. These are review scripts, not generated or applied deployment migrations. The Supabase CLI is not available on the current command path; nothing was installed. A real cutover needs a generated migration, current schema/advisor review and coordinated SQL/server acceptance. Older running servers still using raw ordinary-salon insertion must be quiesced during that cutover.

## Required next work

The post-cutover checker now requires `--include-circle-admission` (v18) for a database containing the admission schema or columns. It compares all 67 release tables, every private admission function, the schema owner/access, routine grants and column authority. Earlier scopes refuse that database, and a missing required helper refuses reference capture or comparison. The separately prepared 97-table pre-cutover source backup is unchanged and still needs secure Mac entry.

The complete synthetic PostgreSQL 17.11 chain passed 65 ordered SQL files and a restore into another socket-only cluster. Deliberately omitted recipient receipts, each of eight missing helpers, changed bodies, schema/function/column grants and changed approval-mode data were detected. Independent PostgreSQL sessions verified revoke-first and account-removal-first joins wait and then refuse. The restored recipient's owner workflow removes the invitation receipt and membership, anonymizes the retained member row and detaches the wallet identity. Both clusters stopped; 1,128 source inputs stayed unchanged. This does not prove a live provider call or the separately prepared matching hosted-version/source recovery. [Restore verification](salon-admission-restore-verification.json).

1. Add host and recipient screens with an explicit account check, complete review, accessible confirmation, unknown-result recovery and clearing on account/lifecycle changes. Show that the listing is public and that revocation affects outstanding invitations. Agree how a person shares their own member code before exposing that label to a host.
2. Carry a token in a URL fragment or another explicit private entry flow, never an automatically fetched query URL. Keep it out of logs, storage and third-party requests. Implement and test cold/warm phone delivery, account changes and browser fallback; do not silently discard the recipient binding.
3. Complete hosted backup/privacy/authentication gates before real pilot intake. Nothing here proves a real invitation, attendee, paid sign-up, installed phone build or physical Quest session.

The local checks cover raw/legacy bypasses, stale/wrong/expired scopes, per-account forwarding, host sign-out, actual protected reads, one-use nonce and exact retry behavior, revocation, rollback and ordinary-salon compatibility. The full compiled build and credential-free compiled route checks are recorded in [the verification receipt](salon-admission-backend-verification.json).
