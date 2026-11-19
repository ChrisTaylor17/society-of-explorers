# Society of Explorers Memory State Migration Draft

Status: local draft. This is not approved for production and has not been applied.

Updated: May 28, 2026.

## Purpose

The current memory controls can correct, retract, or suppress facts by expiring rows with `valid_until`. That is schema-safe today, but it does not preserve enough explicit consent state for a mature personal AI product.

This draft adds consent-state metadata to `user_semantic_memory` so every memory fact can be audited and excluded from retrieval intentionally.

## Draft Migration

Local file:

```text
supabase/migrations/20260528_memory_consent_states.sql
```

Adds:

- `status`: `active`, `corrected`, `retracted`, `do_not_use`, or `expired`.
- `replacement_fact_id`: links a corrected fact to its replacement.
- `correction_note`: optional note explaining the member-approved change.
- `suppressed_at`: hard exclusion timestamp for retrieval and summaries.
- `suppressed_reason`: audit reason for suppression or retraction.
- `last_member_reviewed_at`: timestamp for member review history.

Adds an active-only retrieval index requiring:

```sql
valid_until IS NULL
AND status = 'active'
AND suppressed_at IS NULL
```

## Supabase Review Notes

Reviewed current Supabase changelog guidance before drafting. The April 28, 2026 Data API breaking change says newly created public tables/functions may require explicit grants. This draft alters an existing table and creates no new public tables or functions, so it avoids that exposure path.

Source: https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically

The local environment does not currently have the Supabase CLI installed, so `supabase migration new` could not be used. The fallback is a manually named local draft plus a smoke guard. Before applying anywhere, regenerate or verify the migration with the Supabase CLI in an environment where it is available.

## Approval Gate

Do not apply this migration until Chris explicitly approves database mutation.

Exact approval text to request later:

```text
Approve applying the memory consent state migration to the target Supabase environment after a backup and staging verification.
```

## Required Follow-Up After Approval

- Apply the migration in staging, verify the columns exist, then set `MEMORY_CONSENT_STATE_COLUMNS_ENABLED=true` for that environment.
- `PATCH /api/movement/memory/facts/[id]` is already prepared to write `status`, `suppressed_at`, `suppressed_reason`, `replacement_fact_id`, and `last_member_reviewed_at` when that flag is enabled.
- Update memory overview to display explicit states and suppression metadata.
- Update all retrieval queries and any future `match_facts` RPC to require `valid_until is null`, `status = 'active'`, and `suppressed_at is null`.
- Run Supabase advisors or equivalent SQL review before production application.

## Local Verification

```bash
npm run memory:state-migration:smoke
npm run memory:consent-actions:smoke
npm run memory:retrieval:smoke
npm run operator:smoke
```
