# Guide-program authority and writer audit

8 November 2026. Baseline application source: `98f16272b5de33eeac23468ab47066f5ca8fc93f`. This is a bounded audit of the older Guide program and one local access correction, not acceptance of that program or a change to the Society's legal governance.

## Product implication

Keep the proposed first four-week fellowship Circle, ordinary public book salons and the older seven-week Guide program distinct. The Guide scheduler generates **35 weekday sessions**, and its graduation rule checks five sessions led, at least 80% attendance and fewer than three unexcused absences. That is a substantially different commitment from four weekly 60–75-minute gatherings. Current topics in its creation code are singularity, blockchain and consciousness; a Christian Scripture curriculum is not silently substituted.

The first pilot should use the existing Circle organizer/member contract and reviewed readings. Its human backup host needs an agreed meeting handoff or cancellation plan; this audit does not grant that person software management rights. No intensive training, global Guide badge, token or corporate membership should be assumed necessary to host that pilot. These are recommendations for the roadmap, not changes to historical graduation rules.

| Experience or role | Existing source | Recommended boundary |
| --- | --- | --- |
| Four-week fellowship pilot | Circle routes and `book_cohorts` classified with the Circle book ID; organizer is checked against `created_by` | Use its existing scoped admission, discussion and host contract. Confirm a real host, backup plan and dates after recovery. |
| Ordinary book group | Public `/book-salons`, separate ordinary creation/join writers | Keep its public-discussion disclosure and current-account checks. A creator membership does not prove a human meeting is scheduled. |
| Intensive Guide development | `/salon`, `/guide`, `salons`, `salon_members`, `salon_sessions` | Preserve as a separate optional program; review workload, authority and transactions before offering it. |
| Historical Guide designation | Guide fields on `members`; graduation writes global promotion fields | Separate an educational achievement from permission to manage another group. Any replacement role/grant model needs explicit design review. |
| Root Kernel inquiry | Distinct source/perspective layers and Fellowship research | Offer sourced readings and inspectable analysis within the chosen group's format. Do not merge private histories or infer consent to send member discussion to AI. |
| Legal membership or venture participation | Executed governing instruments and separate contracts, still under review | An app account, host role, graduation or software vote does not by itself establish corporate voting rights, equity or authority. |

Keeping these programs separate is the lowest-change path. A single generalized program engine is an alternative, but would require an approved product model, identifiers/role mapping, data migration and rollback. It is not justified merely to reuse a salon label. Preserve the broader incubator, physical-space and Quest vision while validating the first recurring human experience.

## Reproduced baseline findings

The [audit receipt](guide-program-writer-verification.json) points to ten retained observations from actual route/helper source and the locked Supabase client over a bounded transport adapter and disposable PostgreSQL. Identity, injected failures and captured activity delivery were explicit fixtures. They reproduce defects; they are not ten successful release tests.

| ID | Baseline observation | Current implication |
| --- | --- | --- |
| G01 | The declared auth-member projection omits `is_guide` and related fields. With that exact projection shape, Guide dashboard/creation refuse even when the synthetic stored member is a guide. Generic creation instead assigns no guide and schedules 35 sessions. | Do not widen the general profile projection to grant authority. Design a narrow, fresh role lookup and establish who may grant/revoke it. Real provider acceptance remains open. |
| G02 | Failing creator membership leaves an orphan program. Retrying after the failure is removed creates a second program. | Program, creator membership, schedule and receipt need one transaction and durable request recovery. |
| G03 | With explicit synthetic Guide authority, a later statistics failure leaves a program, membership and 35 sessions saved. Retrying duplicates the program. | A response error cannot be assumed to mean no work was saved. Both creation routes need the same reviewed transaction contract. |
| G04 | Join membership persists before the program-status update fails; the retry is refused and the status remains recruiting. | Capacity/admission and lifecycle transitions require one coherent writer. |
| G05 | Attendance-list update persists while the member count update fails. Retry returns success without fixing the count. | Counts should follow a durable attendance fact; replay must repair or return the same outcome. |
| G06 | Session completion persists while leader credit fails. Retry sees completion and skips the missing increment. | Completion and its progress effects need an atomic, replayable transition. |
| G07 | Repeating the same graduation increments the guide's graduated-member statistic again and emits another activity. | Graduation and derived statistics need uniqueness/idempotency and reviewed promotion authority. |
| G08 | Failed promotion can leave a graduating member and a completed program while global guide status remains false. | Do not mark the aggregate complete from partially applied individual transitions. |
| G09 | A removed session leader is denied private reads but can change session state/summary before a later missing-membership error. | **Corrected locally for removal already visible at the authority check**, as described below. Concurrent revocation remains a transaction requirement. |
| G10 | Session PATCH writes `updated_at`, absent from the inspected source migration; that schema rejects the call. | Confirm the actual restored schema and all migration provenance before proposing a compatible migration. This does not establish absence of a hosted column. |

The audit did not exercise independent concurrent PostgreSQL sessions, actual hosted PostgREST/RLS, real accounts or private member records. Read-then-write capacity and counter races are additional source concerns, not newly reproduced concurrency results. The old SQL policies and hosted data were not changed.

## Bounded access correction

The action POST now applies the same current-member/assigned-guide authority used by private reads before attendance, completion or graduation. Join remains outside that precondition because joining is specifically for a nonmember. Session PATCH also checks current participation before reading or changing the session. A retained `led_by_member_id` is no longer enough after membership removal.

Seven new cases cover removed leaders on both paths, unavailable membership proof, a participant lacking management assignment, current leaders, an assigned guide without a participant row, legitimate join/attendance and signed-out/removed callers. Together with the existing read/browser-controller suites, 43 checks pass. The full 1,243-input web build/type check and scoped lint pass. UI source, scheduling, promotion algorithms, creation handlers, join implementation, auth projection and SQL are preserved.

This is a fresh preflight check, not an atomic revocation guarantee. Removal after that check can still race the later write. The source-migration mismatch for an otherwise authorized PATCH remains open. No new physical-device or compiled-browser interaction acceptance is claimed for this server-only change.

## Implementation sequence and acceptance

1. Preserve the isolated backup/restore and direct-access gates. On a verified restore, inventory actual columns, policies, functions, role grants and existing partial records; do not infer production schema from the single historical migration.
2. Agree on the intensive program's curriculum, host workload, authority and promotion rules. The first Circle pilot is not contingent on reviving this separate offer. Keep educational achievement, per-program management and legal/entity authority distinct.
3. Design narrow server-authorized transactional writers for creation, admission, attendance, completion and graduation. Authenticate independently of input IDs, recheck current membership/assignment under the chosen lock, enforce capacity and transition invariants, and store an account-scoped request ID plus input digest and bounded receipt. A changed payload must not reuse an earlier successful key.
4. Give uncertain requests a durable readback/recovery route across reloads and devices. Avoid silently retrying a new creation. Derive progress from canonical events or verify cached totals; enqueue external activity only once after a committed transition, with a deduplication key and explicit publication permission.
5. Rehearse failures after each step, concurrent joins at the last seat, duplicate/reordered requests, concurrent role removal, account erasure, duplicate graduation and failed activity delivery using independent database sessions and the real gateway. A passing local adapter is insufficient for these gates.
6. Audit historical inconsistent records on the restore. Produce an owner-reviewable repair plan with counts and exact effects; do not delete orphaned programs or recalculate/publish badges automatically. Promote only after authorization and a tested disable/rollback path.

The transaction recommendation follows PostgreSQL's [all-or-nothing transaction model](https://www.postgresql.org/docs/current/tutorial-transactions.html). Its [isolation guidance](https://www.postgresql.org/docs/current/transaction-iso.html) explains why separate reads are insufficient to establish a concurrency guarantee. Supabase's [database-function guidance](https://supabase.com/docs/guides/database/functions) documents RPCs and warns to control execution privileges and pin a definer function's search path. These are design inputs; no new RPC, grant or deployment was applied.

For rollback, revert only the two caller preflight changes and their tests if needed; preserve the audit and all records. There is no schema migration in this correction. Reverting would restore G09's known sequential access defect, so it is not a recommended release fallback. A future transactional migration needs its own data-compatible rollback or disable plan.
