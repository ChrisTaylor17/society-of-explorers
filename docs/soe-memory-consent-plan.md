# Society of Explorers Memory Consent Plan

Status: local operator draft. This is not a migration plan approved for production.

Updated: May 27, 2026.

## Purpose

Personal AI memory should make members feel seen without making them feel trapped by an old inference. The system needs explicit consent, correction, retraction, and retrieval-exclusion controls before memory becomes a major product promise.

## Current State

- Memory overview is a signed-in private route.
- Memory overview now shows consent-state readiness: legacy-safe write mode by default, explicit-state mode only after `MEMORY_CONSENT_STATE_COLUMNS_ENABLED=true`.
- Memory actions return a compact consent receipt with action, write mode, retrieval effect, and whether explicit state was recorded; it contains no raw memory content.
- Active facts are read from `user_semantic_memory` only when `valid_until is null`.
- The current fact delete route soft-expires a fact by setting `valid_until`.
- The current fact patch route supports `correct`, `retract`, and `do_not_use` actions using existing schema-safe active-recall expiration.
- The fact route is prepared for the explicit state columns behind `MEMORY_CONSENT_STATE_COLUMNS_ENABLED=true`; the flag must stay off until the approved migration is applied.
- Correction currently inserts a replacement fact and expires the old fact. Explicit correction audit columns still require a later migration.
- A local memory consent state migration draft exists at `supabase/migrations/20260528_memory_consent_states.sql`; it is not approved for production and has not been applied.
- Shared memory extraction reads active facts with `valid_until is null` before writing new facts.
- Insights, practice reflection, pod export, and sovereignty passport reads keep active-only semantic memory filters, with prompt/read paths covered by `memory:retrieval:smoke`.
- Retrieval uses `match_facts` and `match_episodes`; the RPCs must also exclude expired, retracted, and do-not-use records.

## Required Memory States

Each semantic memory fact should have an explicit state:

| State | Meaning | Retrieval Behavior |
| --- | --- | --- |
| `active` | Usable member memory. | May be retrieved. |
| `corrected` | Superseded by a member-approved replacement. | Exclude old fact; retrieve replacement only. |
| `retracted` | Member says the fact should no longer be treated as true. | Exclude from all AI context. |
| `do_not_use` | Member does not want this fact used, even if retained for audit/export. | Exclude from all AI context and summaries. |

Recommended fields:

- `status text not null default 'active'`
- `replacement_fact_id uuid null`
- `correction_note text null`
- `suppressed_at timestamptz null`
- `suppressed_reason text null`
- `last_member_reviewed_at timestamptz null`

## API Requirements

Keep the existing `DELETE /api/movement/memory/facts/[id]` behavior as a forget shortcut, but add a signed-in `PATCH` route for explicit agency:

```json
{
  "action": "correct",
  "replacement": {
    "category": "goal",
    "key": "primary project",
    "value": "Build Society of Explorers patronage engine"
  },
  "note": "Old memory was stale."
}
```

Supported actions:

- `correct`: expire the old fact, insert a replacement, link both records, and mark the old record `corrected`.
- `retract`: mark the fact `retracted`, set `valid_until`, and store an optional member note.
- `do_not_use`: mark the fact `do_not_use`, set `suppressed_at`, and exclude from all retrieval while preserving export/audit visibility.
- `restore`: only restore a member-owned fact after explicit confirmation, and never restore a `do_not_use` fact without a second confirmation.

## UI Requirements

The private memory view should expose controls per fact:

- Correct this
- This is wrong
- Do not use this
- Forget this

The UI should show what will happen before the action is committed:

- Whether the fact remains visible in export.
- Whether it can influence Great Thinkers or the personal mirror.
- Whether a replacement will be created.

## Retrieval Exclusion

Every memory read path must exclude suppressed memory before it can influence AI output:

- SQL list queries: require `valid_until is null` and `status = 'active'`.
- `match_facts` RPC: require `valid_until is null`, `status = 'active'`, and `suppressed_at is null`.
- Profile summary: rebuild from active facts only.
- Personal AI context: never include `retracted`, `corrected` old facts, or `do_not_use`.
- Pod export: include suppression metadata so the member can audit what was retained and why.

## Voice And Live Council Consent

Voice sessions should default to no durable memory until the member opts in for that session.

Per-session controls:

- Transcript retention: off by default.
- Memory extraction: off by default until explicitly enabled.
- Do not remember this: available during and after the session.
- End-of-session review: show proposed memories before saving when practical.

Current local Live Council behavior:

- `/movement/voice-council` exposes defaults-off controls for transcript retention and memory extraction.
- `/api/movement/realtime/session` passes session-level consent into the temporary Realtime session instructions.
- The current local prototype does not write voice transcripts or memories from the Live Council page.

## Verification

Local guards should fail if:

- Memory overview stops requiring authentication.
- Memory overview stops filtering active facts with `valid_until is null`.
- Fact deletion stops scoping by `member_id`.
- Fact deletion stops soft-expiring facts.
- Shared memory extraction stops reading only active facts.
- Shared AI context assembly stops using `filterUsableMemoryRows`.
- Insights or practice prompt/read paths stop filtering active facts before AI prompt use.
- Memory overview stops exposing consent-state readiness without secret values.
- Memory actions stop returning consent receipts or the memory page stops displaying the latest receipt.
- The consent plan stops documenting `corrected`, `retracted`, `do_not_use`, retrieval exclusion, and `PATCH`.

Run:

```bash
npm run memory:privacy:smoke
npm run memory:retrieval:smoke
npm run memory:state-migration:smoke
npm run memory:consent-actions:smoke
```
