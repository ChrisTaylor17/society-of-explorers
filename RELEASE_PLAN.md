# RELEASE_PLAN — SoE app security rounds 1–3

## RELEASED — Fri Oct 23, 2026, 10:44 AM ET (security-only branch)

- Branch `release-r1-3-secure-only-2026-10-23`: `release-r1-3-on-prod-2026-10-23`, with `ab1e7c5` reverted (`1ad4948`).
  The broken UUID check is left exactly as it is in production, so twiddle, live, rooms, salons, book-salons, merch,
  projects invite/[id] and the **Stripe pledge checkout stay disabled**. No security commit depended on `ab1e7c5`:
  the salon-message routes and `lib/salons/access.ts` have their own correct regex. Tests accept a 400 refusal on
  the dead routes (`c3ae7cc`).
- Gates: suite 109/0; tsc 0; next build 0; live-smoke 12/12 on localhost, on preview and on the production
  candidate.
- Preview: `dpl_JCqyeoyCcM4swouVM9gau8eBkUBn` (target preview).
- Production: `dpl_E3hbXc8KdGeQ7Sux7hHoQSfPNKpM`. It was deployed with `--prod --skip-domain`, smoke-tested, then
  promoted. The previous production deployment was `dpl_8PSS1iRp7s7tvNx8mRnwQ38Lfv2d`.
- Rollback: `vercel rollback dpl_8PSS1iRp7s7tvNx8mRnwQ38Lfv2d --scope chris-projects-03dec906 --yes`
- No secret was added. No env var was changed: the production-only env names were NOT copied to preview. The
  NEXT_PUBLIC_* config values need a value read that was not approved, and the third-party secrets (Stripe live
  key, Resend, Printful and others) were deliberately not copied into preview.

## STATUS — updated Fri Oct 23, 2026, ~10:30 AM ET (Step 0 done on the box; nothing deployed or pushed)

**Release branch:** `release-r1-3-on-prod-2026-10-23`, in the box repo `/workspace/soe-security-fixes-2026-10-23`
(worktree `/workspace/soe-prod-snapshot-2026-10-23/wt-rel`; the repo has no remote). It exists **only on the box** and has not been pushed anywhere. No Vercel env var, deployment,
alias or domain was touched, and the Mac working tree was only read.

- `c48cf3d` / `3c45c22`: snapshot of production's deployed source (dpl_8PSS1…), taken from a tar of the Mac tree.
  The tar was copied and then deleted from the Mac. 1585/1585 files match production by sha1. That covers all 260
  modified and 222 production-only files from the drift list, plus `.gitignore`. The vendored
  `lib/openzeppelin-contracts` is not committed. `.env*`, `.vercel/`, `.claude/`, `cache/` and `out/` are excluded.
- Rounds 1–3, ported onto production's code (base `3c45c22`):
  `d1a2082` tests and tsconfig, `c9f0523` S1, `ab1e7c5` UUID regex, `ada19d7` S3, `af3d3ed` S8/S9, `0bff534` S2a,
  `c499067` S4/S2b, `85fcc97` S6, `dd7e77d` lazy-clients smoke, `7060a68` live-smoke and logs.

**No new production secret is needed. The secret steps in §1, 2a and 4b are now unnecessary; skip them.**
- The wallet session stays production's signed `soe_wallet_id` cookie, keyed by
  `WALLET_SESSION_SECRET || NEXTAUTH_SECRET`. `NEXTAUTH_SECRET` is already set in every environment.
- Round 1 is rebuilt on it as v2 cookies (`v2.<id>.<exp>.<sig>`) with a signed 30-day expiry.
- Existing v1 cookies keep working until `LEGACY_V1_ACCEPT_UNTIL = 2026-12-31T00:00:00Z`
  (`lib/auth/walletSession.ts`), so **nobody is forced to re-login**. If the release ships after Dec 1, 2026,
  move that date forward.
- The SIWE nonce cookie is HMAC-signed under the same secret with a separate domain prefix.
  `/api/auth/nonce` returns 503 only if neither secret exists.

**Gates already run on the box (logs are in `security-logs/` on the release branch):**
- Offline suite before the fixes, on production source: **85 pass / 25 fail**. Every failure is a real gap.
  After the fixes: **110 pass / 0 fail**. The run command is `bash tests/security/run.sh`.
- Production's own smoke scripts: 48 of 52 pass, the same pattern as on unmodified production source. The 4 that
  fail were already failing and are environmental:
  - `capital:webhook-safety`, `member:wallet-route` and `env:readiness` need `.env.example`, which is excluded
    from the snapshot.
  - `pod:wallet-seal` hits a Node webcrypto type error.
- `scripts/external-effect-lazy-clients-smoke.mjs` was updated to assert the new S6 and S9 invariants.
- `auth:wallet-session-secret:smoke` passes.
- In a `/tmp` git-archive copy with placeholder env: `tsc --noEmit` exit 0 and `next build` exit 0
  (186 pages).
- `live-smoke.sh` against **localhost only** (`next start` on 127.0.0.1:3123): **12 pass / 0 fail**.
  - The script now refuses the production hostnames.
  - Its request bodies pass production's validation, so each check reaches the auth step.
- gitleaks: only the 2 known false positives, `docs/soe-env-readiness-template.md` and
  `scripts/env-readiness-smoke.mjs`. Nothing was redacted.

**Left to do (each needs Chris's or Codex's decision):**
1. Agree with Codex/Wisdom on where the branch lives, then push it. It is box-only now and is not merged into
   `main`.
   - Also note that the Mac tree's auth files have changed since Jun 19. The release is built on what is actually
     deployed, not on the Mac's current state.
2. Review the diff: `git diff 3c45c22..release-r1-3-on-prod-2026-10-23` (48 files, +2515/−57).
   - Note that `ab1e7c5` **re-enables routes that were dead in production**. Their UUID regex rejected every id.
     The affected routes are twiddle, live, rooms, salons, book-salons, merch, projects/invite, projects/[id] and
     the public Stripe pledge checkout.
   - The commit stands alone, so it can be reverted by itself if those features should stay off.
3. §2 preview deploy (skip 2a), then `live-smoke.sh` against the preview with the bypass header (expect 12/12), and
   the manual checks.
4. §3 gates, §4 production (skip 4b and 4d), and rollback as written.

**Known remaining gaps (not fixed in this release):**
- The S4 rate limit is in memory and fixed-window, per serverless instance. Budgets per 10 minutes: anonymous 30,
  member 120, global anonymous 600. A distributed limiter (KV/Upstash) would be needed for a hard cap.
- The SIWE nonce is stateless. A signed nonce can be replayed by the same client within its 10-minute lifetime;
  the SIWE signature check still applies. Closing this needs a server-side nonce store.
- The strength of `NEXTAUTH_SECRET` can't be verified from here (values were not read). If it is weak, rotate it.
  Rotation logs every wallet user out once.
- Thinker memory and summaries now update only from the member's own private salon. `general` and shared salons
  no longer feed memory.
- The auto-generated council verdict is private by default. The share button opts in with `makePublic: true`.
- S5 (markdown escaping) and S7 (no hard-coded ref) already passed on production; nothing changed there.

---

_Original plan below (9:45 AM ET). Where it conflicts with STATUS, STATUS wins: test counts are now 110/0 offline
and 12/12 live-smoke, and the content cap is production's 4,000 characters._


Written Fri Oct 23, 2026, 9:45 AM ET. Nothing in this plan has been executed. No Vercel env var, deployment,
alias or domain was changed while writing it. The project was inspected read-only (`vercel project ls`,
`vercel domains inspect`, `vercel api` GETs).

## 0. What production actually is (read this first)

| Item | Finding (read-only, Oct 23 2026) |
|---|---|
| Vercel team | `chris-projects-03dec906` |
| Project serving this Next.js app | **`society-of-explorers`** (`prj_WI91SqGtnDGWMkrzVNumvqn8Tx4O`), framework `nextjs`, Node 24.x |
| Production URL | **https://society-of-explorers.vercel.app** (only domain attached to the project) |
| Custom domains | **None now serve this app.** `societyofexplorers.com` + `www` are attached to project `soe-exhibition` (static site). `app.societyofexplorers.com` is in the team's domain list but attached to no Vercel project; it currently answers from Cloudflare with a static "fictional plan-first prototype". |
| Current production deployment | **`dpl_8PSS1iRp7s7tvNx8mRnwQ38Lfv2d`** (READY, created Jun 19 2026 4:57 PM ET, source `cli`, actor `codex`, `githubCommitRef=codex/prompts-mvp`, sha `0383110`, **`gitDirty=1`**) |
| Previous production deployment (rollback target) | `dpl_JDSw4d8JvJHExskroa4bvqP6mQa3` (Jun 19 4:48 PM ET, same source) |
| Git integration | **No repository is connected** (`link` is empty). Nothing auto-deploys on push to any branch. Every deployment in the history is `source: cli`. `gitProviderOptions.createDeployments=enabled` has no effect without a link. |
| Deployment protection | `ssoProtection: all_except_custom_domains`: preview URLs (and the `*.vercel.app` hashes) need Vercel login or the automation-bypass header. |
| `SOE_WALLET_SESSION_SECRET` | **Does not exist** in any environment. |
| Env var NAMES (values not read or printed) | All three (dev/preview/prod): ANTHROPIC_API_KEY, CRON_SECRET, DAILY_API_KEY, NEXTAUTH_SECRET, NEXTAUTH_URL, NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL, OPENAI_API_KEY, SCAN_SCORING_API_KEY, STRIPE_PRICE_PHILOSOPHER, STRIPE_PRICE_SCHOLAR, STRIPE_PRICE_SEEKER, STRIPE_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY, WALLET_ENCRYPTION_KEY. Production+preview: MOVEMENT_POD_SECRET. Production only: ELEVENLABS_API_KEY, FAL_API_KEY, NEXT_PUBLIC_MOCK_SOE_ADDRESS, NEXT_PUBLIC_RITUAL_MARKETPLACE_ADDRESS, NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_SOCIETY_NFT_ADDRESS, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, PRINTFUL_API_KEY, RESEND_API_KEY, RUNWAY_API_KEY, STRIPE_PRICE_ORACLE, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET_MERCH. |

### BLOCKER: production was not built from git
`dpl_8PSS1…` was uploaded from a dirty working tree. When its source file list is compared with commit `0383110`:
- **260 tracked files differ**, including most of `app/api/**`, `lib/getAuthenticatedMember.ts`, `proxy.ts`,
  `package.json` and `tsconfig.json`.
- **222 files exist only in production**, not counting the vendored `lib/openzeppelin-contracts`. Examples:
  `app/capital/*`, `app/92b/*`, `app/api/admin/*`, `app/api/merch/*`, `app/api/salon-hub/*`,
  `lib/auth/walletSession.ts`, `lib/supabase/admin.ts`, `lib/http/routeError.ts`.

The full list is in `security-logs/PROD-DRIFT-vs-0383110.txt`.

The working tree that matches is on Chris's Mac at `/Users/christaylor/society-of-explorers`. It is on branch
`codex/prompts-mvp` at `3a7795b` (Jun 27, one commit ahead of origin), with 279 modified and 331 untracked
entries. Its `app/api/salon-message/route.ts` and `load/route.ts` are byte-identical to production. Its auth files
have changed since Jun 19.

**Consequence:** if rounds 1–3 are deployed from this repo, even as the clean merge
`release-r1-3-candidate-2026-10-23`, every production-only feature above is silently reverted. **Do not deploy
from this repo as-is.**

What production's code does today (from the deployed source):
- Wallet identity is a signed `soe_wallet_id` cookie, keyed by `WALLET_SESSION_SECRET || NEXTAUTH_SECRET`.
  `NEXTAUTH_SECRET` is set, so production wallet sessions are already HMAC-signed under a different design than
  round 1's.
- `POST /api/salon-message` is **still unauthenticated**: anyone can post under any `sender_name` and
  `sender_type`, including `thinker`. This is S9, still open in production.
- `GET /api/salon-message/load` refuses `private-*` ids (input validation) but returns any uuid salon's messages
  to anonymous callers. S8 is partly open.

### Step 0 (required before any release): put the production source into git, then port
1. **Coordinate with Codex/Wisdom.** They own the Mac working tree, and nobody else should edit it meanwhile.
2. On the Mac, create a snapshot branch. Use a temporary index so nothing in the working tree changes:
   `git switch -c prod-source-snapshot-2026-10-23`, then `git add -A` **excluding** `.env*`, `.claude/`,
   `$CODEX_HOME/`, `.vercel/`, `cache/` and `out/` (the same list as production's `.vercelignore`). Then
   `git commit` and push the branch only. Before the push, run a secrets scan on the staged diff, e.g.
   `git diff --cached | grep -nE "sk_live|sk_test|BEGIN .*PRIVATE KEY|SUPABASE_SERVICE_ROLE_KEY=|eyJhbGci"`.
3. **Port rounds 1–3 onto that branch.** This repo's patches won't apply cleanly, because the auth layer diverged.
   - Re-implement each fix against production's code (`getSupabaseAdmin`, `privateJson`, the signed
     `soe_wallet_id`).
   - **Choose one wallet-session design.** Recommendation: keep production's signed `soe_wallet_id` and
     `NEXTAUTH_SECRET`. Then **no new secret is needed and wallet users are not logged out.** If round 1's
     separate `SOE_WALLET_SESSION_SECRET` / `soe_wallet_session` cookie is kept instead, follow steps 1–2 below.
   - Bring `tests/security/*.test.ts` across and adapt `fakes.ts` (mock `@/lib/supabase/admin`). Keep the
     before-fail/after-pass logs.
4. Run the gates from §3 on the ported branch. Only then continue with §1.

If Chris or Codex decide the production-only work should be dropped, §1 can run directly on
`release-r1-3-candidate-2026-10-23`. That is a product decision and is not assumed here.

## 1. Secret (only if the round-1 `SOE_WALLET_SESSION_SECRET` design is kept). NOT NEEDED for `release-r1-3-on-prod-2026-10-23`
Never paste the value into chat, a repo, a log or a command line. `--value` would put it in shell history.
```bash
umask 077
openssl rand -base64 48 | tr -d '\n' > ~/.soe-wallet-session-secret      # 64 chars, ≥ 32 required
wc -c ~/.soe-wallet-session-secret                                         # check length only
```
Use separate values for Preview and Production. Generate the file a second time for Production.

## 2. Preview first
Run the commands from a clean checkout of the release branch, linked to the project with
`vercel link --project society-of-explorers --scope chris-projects-03dec906 --yes`.
```bash
# 2a. Secret into Preview only (stdin, stored as Sensitive)
vercel env add SOE_WALLET_SESSION_SECRET preview --sensitive --yes \
  --scope chris-projects-03dec906 < ~/.soe-wallet-session-secret
vercel env ls preview --scope chris-projects-03dec906 | grep SOE_WALLET_SESSION_SECRET   # name only

# 2b. Preview deployment (no --prod; it cannot touch production aliases)
vercel deploy --scope chris-projects-03dec906 --yes > /tmp/soe-preview-url.txt
PREVIEW=$(tail -1 /tmp/soe-preview-url.txt); echo "$PREVIEW"
vercel inspect "$PREVIEW" --scope chris-projects-03dec906           # must be READY, target preview

# 2c. Security tests against the preview
#   Preview is behind Vercel Authentication. Get the project's Protection Bypass for Automation
#   from the dashboard (Settings → Deployment Protection), export it in this shell only, never echo it.
export VERCEL_AUTOMATION_BYPASS_SECRET=...        # typed by a human, not stored
BASE_URL="$PREVIEW" bash tests/security/live-smoke.sh   # expect 12 pass, 0 fail
bash tests/security/run.sh                              # offline suite on the same commit, expect 110/0
```
Preview uses the same Supabase project as production, because the Supabase env names exist in all three
environments. `live-smoke.sh` only sends anonymous or forged requests that the fixed code rejects before it writes
anything.

**Don't point it at the current production.** S9 is open there, so its first check would insert a real row.

Manual check on the preview, signed in as Chris's own test member, using no real users' data:
1. Wallet (SIWE) login works: `/api/auth/nonce` returns 200, then sign, and the session persists.
2. Posting in `general` works, and the message shows your display name.
3. Posting to a uuid salon you don't belong to returns 403.
4. Private-salon thinker memory still updates.

## 3. Gates before Production
- Offline security suite: **110 pass, 0 fail** (`bash tests/security/run.sh`).
- `tsc --noEmit -p .` exit 0, and `next build` exit 0, in a throwaway copy.
- `live-smoke.sh` 12/12 against the preview, and the manual checks above pass.
- Release-branch diff reviewed against production. No production-only files were removed (see §0).
- Codex/Wisdom notified of the release window, so no other CLI deploy lands on top of it.

## 4. Production
```bash
# 4a. Record the rollback target first
ROLLBACK=dpl_8PSS1iRp7s7tvNx8mRnwQ38Lfv2d      # current production as of Oct 23 09:45 ET; re-check:
vercel api "/v9/projects/society-of-explorers?teamId=chris-projects-03dec906" | jq -r .targets.production.id

# 4b. Production secret: SKIP for release-r1-3-on-prod-2026-10-23 (uses existing NEXTAUTH_SECRET)
openssl rand -base64 48 | tr -d '\n' > ~/.soe-wallet-session-secret-prod
vercel env add SOE_WALLET_SESSION_SECRET production --sensitive --yes \
  --scope chris-projects-03dec906 < ~/.soe-wallet-session-secret-prod

# 4c. Deploy without moving the alias, verify, then promote
vercel deploy --prod --skip-domain --scope chris-projects-03dec906 --yes > /tmp/soe-prod-url.txt
PROD_CANDIDATE=$(tail -1 /tmp/soe-prod-url.txt)
BASE_URL="$PROD_CANDIDATE" bash tests/security/live-smoke.sh            # bypass header as above
vercel promote "$PROD_CANDIDATE" --scope chris-projects-03dec906 --yes
BASE_URL=https://society-of-explorers.vercel.app bash tests/security/live-smoke.sh   # 12/12

# 4d. Afterwards: shred the local secret files
shred -u ~/.soe-wallet-session-secret ~/.soe-wallet-session-secret-prod
```

### Rollback
```bash
vercel rollback dpl_8PSS1iRp7s7tvNx8mRnwQ38Lfv2d --scope chris-projects-03dec906 --yes
vercel rollback status society-of-explorers --scope chris-projects-03dec906
```
Leaving `SOE_WALLET_SESSION_SECRET` set is harmless to the old deployment, which ignores it. Remove it only if the
release is abandoned.

Note the crons in `vercel.json`. `CRON_SECRET` exists in all environments, so round 2's fail-closed cron checks
keep working.

## 5. User impact
- **Wallet users re-login once**, if round 1's separate cookie is kept. Old `soe_wallet_id` cookies stop
  authenticating everywhere. If `/api/auth/nonce` returns 503, the secret is missing, so check 2a or 4b. With the
  recommended port onto production's signed `soe_wallet_id`, there is no forced re-login.
- **Shared-salon memory is off.** Chats in `general` and other shared salons no longer feed a member's persistent
  thinker memory or summaries. Private-salon memory is unchanged. Restoring shared memory needs a
  `salon_messages.member_id` column and a filter on it.
- **Posting to salons (S9) now needs sign-in.** The author is always the signed-in member's display name, and
  `sender_type` is always `member`. Thinker replies are still written server-side by `/api/thinker`.
  - Posting to a uuid salon needs its guide or a `salon_members` row.
  - `private-<id>` salons accept posts only from that member.
  - `general` accepts any signed-in member.
  - Content is limited to 4,000 characters (production's existing cap).
- **Body, query and header member ids are ignored** on 38 routes (S1b). Clients that relied on sending `memberId`
  without a session get 401.
- **Rate limits (S4)** return 429 and `Retry-After` on thinker and verdict calls past the per-10-minute limits.
- **Verdicts** are private unless "Share verdict" is clicked (S6).

## 2026-10-23 SIWE wallet-login hotfix
Production dpl_DcS4fNJ64P4uZCmr1vAHbaUUC8GD (branch fix-siwe-wallet-session-2026-10-23) promoted 11:40 AM ET. Rollback target dpl_E3hbXc8KdGeQ7Sux7hHoQSfPNKpM. See security-logs/2026-10-23-siwe-login-incident.md.
