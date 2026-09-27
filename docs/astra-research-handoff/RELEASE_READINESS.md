# Release readiness — exhibition plus optional research

Date: 2026-09-27

**NOT READY FOR APPROVE-TO-DEPLOY**

The launch product is the Foreman/Builder exhibition, landed in `https://github.com/ChrisTaylor17/soe`. Astra research is an optional addition inside that exhibition. This readiness note does not approve a deploy, and no deploy was attempted.

`prompts-mvp` and `society-of-explorers` are not the launch site. They stay the legacy archive. `https://www.societyofexplorers.com` stays on its current Vercel project until a later, separate decision to move the domain.

## Integration status

| Piece | Status |
| --- | --- |
| Exhibition source on this agent | Missing. `/workspace/soe-website-rc`, `/workspace/tmp-soe-pass8`, and `/workspace/NextChapter/soe-concepts/multimedia/web` are not on this machine. |
| `ChrisTaylor17/soe` | Empty private repository. Confirmed by GitHub contents API: `409 Git Repository is empty`. No branches. |
| Research handoff `e284fd0` | Not on GitHub. Lives in ChatGPT Work/Codex. Not searched further. |
| Research tables | None in `soe` or in pushed marketplace branches. |
| Supabase for research | Not created. A new project is required. See the security inventory. |
| Vercel for the exhibition | Not created. Team scope returns 403. No deployment was started. |
| This pull request | Planning documents only. It does not change the marketplace app and it does not add a research form. |

## Defects and blockers

1. The exhibition tree is not in git and was not available on this agent, so Explore → Gather → Build could not be verified from source.
2. `soe` has no first commit, so there is no canonical tree to preview.
3. Research participation cannot be reviewed because the Codex commit was never pushed.
4. Vercel team access is forbidden for this connector, so a new exhibition project cannot be checked or created from here.
5. This agent’s git credential and `gh` account `cursor` cannot see the private `soe` repository, so the plan could not be pushed there.

## Security findings

- Research needs its own Supabase project. The marketplace database is the wrong store: open `USING (true)` policies and a shared service-role key. No marketplace RLS rewrite is part of this release.
- There is no research schema to apply. Inventing tables would create a second, unreviewed store. Wait for the Codex export.
- Public intake stays closed. AI-assisted contribution review stays off until provider, retention, and consent are approved. No review flag exists in pushed code. Do not add one in the legacy app.

## Privacy test plan

Run this against the new Supabase project after the Codex migration is applied to staging, and before any public form exists.

1. Create two users, A and B, in the new project only.
2. A submits one contribution through the server path the migration defines. Record A’s receipt id.
3. With the anon key, request A’s receipt and A’s contribution. Expect no row and no body.
4. With B’s session, request A’s receipt by id and list receipts. Expect no row, and no name, email, account id, or contribution body from A.
5. With A’s session, read A’s own receipt. Expect success.
6. Repeat with the browser network panel open. Confirm the page does not call the marketplace Supabase host.
7. If the migration has a file bucket, confirm B cannot download A’s object.
8. Confirm no job writes an AI review.

A failure on steps 3, 4, or 7 blocks path A. Path B does not run this test because path B stores nothing.

## Access errors recorded

No production deploy was run. No paid plan was changed. No Supabase project was created.

Vercel `list_deployments` for team `team_cjQKLRhwsyaUtOLJoA4sfxbS`:

```text
Vercel API request failed (403 Forbidden): {"error":{"code":"forbidden","message":"Not authorized: Trying to access resource under scope \"chris-projects-03dec906\". You must re-authenticate to this scope or use a token with access to this scope.","saml":false,"teamId":"team_cjQKLRhwsyaUtOLJoA4sfxbS","scope":"chris-projects-03dec906","enforced":false}}
```

Git clone of `ChrisTaylor17/soe` with this workspace’s GitHub credential:

```text
remote: Repository not found.
fatal: repository 'https://github.com/ChrisTaylor17/soe/' not found
```

`gh repo view ChrisTaylor17/soe` as account `cursor`:

```text
GraphQL: Could not resolve to a Repository with the name 'ChrisTaylor17/soe'. (repository)
```

The GitHub connector used by this agent can see the empty repository (`409 Git Repository is empty`). The git push credential cannot. That is an authorization gap, not proof that `soe` is missing.

Supabase CLI on this machine, from the earlier check: `Access token not provided. Supply an access token by running supabase login or setting the SUPABASE_ACCESS_TOKEN environment variable.` No legacy project was contacted after the course correction.

## Deploy and rollback

Nothing was deployed. There is no new production deployment to roll back.

When a later approval happens:

- Deploy only a new Vercel project whose Git repository is `ChrisTaylor17/soe`.
- Do not deploy `soe` into the Vercel project that serves `www.societyofexplorers.com`.
- Do not attach that domain as part of the first exhibition preview.
- Rollback of a future preview is a Vercel rollback of that new project, or leaving the preview unpublished. The legacy site is untouched, so it does not need a rollback for this work.

## Paths

| Path | Meaning | Tonight |
| --- | --- | --- |
| A. Full participation | Exhibition on `soe`, reviewed research migration, new Supabase, privacy test passed, consent approved. | Not available. |
| B. Exhibition plus a closed research note | Exhibition shipped as itself. Research page has no form and no personal data. | Not available until the exhibition tree is pushed to `soe` and previewed. |

## Chris actions

1. On the shared box, name the single exhibition directory (the examples were `/workspace/soe-website-rc`, `/workspace/tmp-soe-pass8`, and `/workspace/NextChapter/soe-concepts/multimedia/web`). Confirm it is the Foreman/Builder exhibition and that it is not `society-of-explorers` or `prompts-mvp`.
2. From that directory, create a new git history that excludes `node_modules`, `.next`, env files, and the old `.git`. Push it to `https://github.com/ChrisTaylor17/soe`. Do not push marketplace history.
3. Grant this agent, or a follow-up agent, write access to `ChrisTaylor17/soe` if the landing commit should be made from Cursor. This environment’s git credential received `Repository not found`.
4. In Vercel, re-authenticate to scope `chris-projects-03dec906` (`team_cjQKLRhwsyaUtOLJoA4sfxbS`). The connector returned 403 with `Not authorized` for that scope. After re-auth, create a new project for `soe` only. Do not deploy, and do not point the marketplace project at the exhibition.
5. Export `codex/research-handoff-clean` at `e284fd0` from ChatGPT Work/Codex. Push that branch to `soe` when the exhibition history exists. Do not push it to `society-of-explorers`.
6. Create a new empty Supabase project for research. Do not reuse the marketplace project or its keys. Apply no SQL until the exported migration is reviewed against the policy shape in the security inventory.
7. Keep AI-assisted contribution review off until provider, retention, and consent are approved in writing.
8. Approve path B only after the exhibition is on `soe` and a preview of that new project has been checked. Approve path A only after the privacy test passes. Tonight the status remains **NOT READY**.
