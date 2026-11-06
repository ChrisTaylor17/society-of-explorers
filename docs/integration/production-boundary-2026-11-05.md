# Production caller and restore review

On November 5 the Vercel control plane resolved `society-of-explorers.vercel.app` to CLI upload `dpl_FqmzK79EiKmDcur1of6RFPpbUyFX`, build `1dGZPeMaX3PSu8_pnZDGj`. Its complete file index has 5,728 entries. Twenty-three selected artifacts matched the listed provider content IDs and retained SHA-256 digests. The two function links resolve to one uploaded handler. Its launcher, file map and Next app manifest bind both route entries and their immediate loader dependencies. The compiled public project reference matches the connected Supabase catalog. This review used the uploaded bytes as source. The upload's Git provenance, runtime configuration and correspondence to other aliases remain open. [Vercel file index](https://vercel.com/docs/rest-api/deployments/list-deployment-files) · [Vercel file contents](https://vercel.com/docs/rest-api/deployments/get-deployment-file-contents) · [Verification receipt](production-boundary-2026-11-05-verification.json)

- **Thinker.** The deployed `/api/thinker` calls `increment_exp` through the shared service client and includes direct event and member-balance writes. The Stage 6 candidate preserves service EXECUTE. The Stage 8 accounting change still requires a coordinated server and client rollout.
- **Reading award.** The same upload's `/api/exp/award` accepts an amount from the signed-in member and uses the service client to insert an event and update the balance. Its actor, reason and amount checks leave repeat requests possible. The canonical app has already retired this route with HTTP 410. Include that retirement in any approved rollout, since revoking browser EXECUTE and event-table grants leaves the deployed service writer's authority in place. Historical reward balances and other callers still require review.

## Uploaded browser paths

Seven page manifests, the root build manifest and 23 referenced browser chunks matched their uploaded content IDs. The shared session helper asks the browser Supabase client for every column of a member record. It looks up a verified Supabase user by subject, or falls back to a member ID read from a cookie or local storage. Static calls to this helper occur in the dashboard, library, book reader, book-salon list and detail, and Circle start and detail chunks. The deployed book reader also submits `memberId`, `amount`, `reason`, `bookId` and `section` to the retired-in-source award route.

Stage 1 would deny those old browser queries. Pair it with the canonical session flow, which verifies identity through `/api/auth/member` and returns a bounded profile. Include both the reader update and the server's award retirement in the coordinated rollout. Verify signed-in navigation and recovery in the replacement, denial of the legacy browser query, and private HTTP 410 for the retired route before opening traffic. The artifact sample covers those seven screens. Additional deployments, other routes and dynamically assembled requests still need review. [Browser artifact and local replacement checks](production-boundary-2026-11-05-verification.json)

## Database and restore

The metadata-only Supabase refresh found the same three reward definitions and effective EXECUTE for anon, authenticated and service_role. All eight sampled tables still grant anon SELECT and authenticated UPDATE at the table level. Six private tables have RLS disabled. `members` and `exp_events` have RLS enabled and retain their separate policy considerations. These are catalog observations. Hosted API behavior requires separate acceptance. [Dated caller review](deployed-caller-impact-2026-11-04.md) · [Migration plan](production-migration-plan.md)

The authenticated Supabase Scheduled Backups page reports the production project is on the Free plan without scheduled backups. A tested owner-held production export and restore remain a release gate. An approved recovery plan must account for application assets separately from the database backup and identify an isolated restore target. [Supabase backup guidance](https://supabase.com/docs/guides/platform/backups)

The restore comparison can now check the seven Core tables and four Daily Practice tables together. The owner can capture a private reference from the approved export snapshot and check the isolated restoration before applying either change. [Restore procedure and rehearsal](privacy-restore-check.md)

The local rehearsal used PostgreSQL 17.11 with private Unix sockets and synthetic data. A roles-only archive and pre-change database archive restored the seven target row sets, grants including grant options, policies and RLS flags. A separate backend held a relation lock. The migration hit the expected lock timeout and left the grants and receipt unchanged. After apply, a second logical archive restored browser denial, service access and the original rows. The migration receipt reversed the original database in place. It rejected rollback on the restored copy because its table identities had changed. Preserve the original receipt for any reviewed in-place reversal. A restore to a new database needs its own verification and recovery procedure. Both rehearsal clusters stopped and their temporary directory was removed. The 14 existing disposable core cases also passed with the shared fixture.

From the release checkout, an unused run name writes a fresh receipt under `verification/web/evidence/`. The script uses the installed Homebrew PostgreSQL 17 tools and the tracked synthetic SQL fixture.

```sh
python3 verification/web/scripts/rehearse-native-core-restore.py native-core-restore-next
```

The production hold remains in effect. The observed scope covers the two uploaded server routes, seven browser page manifests, catalog metadata and backup availability. Other deployed or historical callers, a production restore, hosted API and provider acceptance still need verification. Application endpoints and data were exercised only in local fixtures.
