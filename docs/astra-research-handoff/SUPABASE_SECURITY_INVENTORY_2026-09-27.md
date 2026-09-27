# Supabase security inventory — research participation

Date: 2026-09-27

Scope: the Astra research store that will be added to the Foreman/Builder exhibition. This is not a remediation plan for the marketplace database.

## Decision

Research participation needs a new, empty Supabase project. An isolated schema inside the marketplace project is not enough.

The marketplace project already serves the legacy app. Its anon key and service-role key are the keys for that product. SQL in `society-of-explorers` enables row level security on many tables and then adds `FOR ALL USING (true)` policies, which leave those tables open to the anon key. Other tables are queried from the browser with `select *` and have no `CREATE TABLE` in the repository, so their live policies are unknown. Sharing that project with research receipts would put contributor data behind the same keys and the same unknown policies.

A separate schema in that project would still be reachable by the legacy service-role key, which bypasses row level security. Use a new project so the exhibition research keys, backups, and advisors are not the marketplace keys.

Do not run marketplace RLS changes as part of this launch. The legacy site can keep its current database until someone schedules that work on its own.

## Research tables in pushed code

There are none.

Checked on 2026-09-27:

- `ChrisTaylor17/soe` is an empty repository. It has no migrations.
- Pushed branches of `society-of-explorers` have no research contribution, receipt, or Astra handoff migrations. `e284fd0` is not a git object in that clone. Chris confirmed the commit was never pushed.
- No `CREATE TABLE` for a research contribution or receipt exists in the marketplace tree.

This inventory does not invent column lists for tables that have not been exported. When `codex/research-handoff-clean` is exported from Codex, the migration files in that export become the source of the table list. Review them before applying anything.

## Controls required before any research table is created

Apply these in the new project, in this order:

1. Create the project. Do not paste the marketplace `NEXT_PUBLIC_SUPABASE_URL`, anon key, or service-role key into it.
2. Confirm the project has no imported marketplace tables.
3. Keep row level security enabled for every table the research migration creates. Supabase can still create a table in `public` without it if the migration forgets the clause. The review must reject a migration that omits `ENABLE ROW LEVEL SECURITY`.
4. Grants: `anon` gets no table privileges on contribution or receipt tables. `authenticated` gets only the policies below. `service_role` is for server-side admin export, not for the browser.
5. Apply the reviewed Codex migration in a transaction on a staging branch of this new project. Take a schema-only dump first. Rollback is restoring that dump, or dropping the new project if it still has no real contributor data.
6. Run the privacy test in `RELEASE_READINESS.md` against the staging project before any public intake exists.
7. Store the new project’s keys only on the future `soe` Vercel project, after that project exists. Do not add them to the marketplace Vercel project.

## Policy shape to require of the Codex migration

Names below are requirements, not a claim that these tables already exist. If the export uses different names, map them before apply. Reject the migration if the behavior is missing.

| Future data | Required behavior |
| --- | --- |
| Contribution body, identifiers, contact fields | Insert and select only for the signed-in contributor who owns the row. No anon select. No policy with `USING (true)`. |
| Receipt | A contributor can read only their own receipt. Another contributor’s receipt id returns no row. Receipt responses must not include another person’s body, name, email, or account id. |
| Public research page | No table reads. Static copy only, until the privacy test passes. |
| AI review output | No table, no job, and no provider call until provider, retention, and consent are approved. |
| Storage buckets | No public bucket for contribution files. Private bucket with the same owner rule as the receipt table, or no uploads at all. |

`auth.uid()` policies only protect visitors who have a Supabase session. Wallet-cookie identity from the marketplace app must not be copied into this project. Research access has to be a real Supabase user in the new project, or server routes that check that user before using the service role.

## What “advisor: RLS disabled” would mean later

An advisor warning is a property of the live new project after migrations run. It is not available tonight because this environment has no Supabase access token (`Access token not provided`) and no research project exists yet.

If the advisor later reports RLS disabled, that is a failed review of the migration: do not open intake. A demonstrated exposure path would be a successful read of another contributor’s receipt with the anon key or with a second user’s session. The privacy test is the check for that path. An advisor warning alone is not proof of exposure, and a missing warning is not proof of safety if a `USING (true)` policy is present.

## Explicitly out of scope

Rewriting marketplace policies, enabling RLS across the legacy public schema, and attaching the exhibition to the marketplace Supabase project. Those actions would either break the live legacy app or mix research data into it.
