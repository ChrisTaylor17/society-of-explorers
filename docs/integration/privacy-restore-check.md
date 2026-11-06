# Privacy cutover restore check

The default restore check covers 14 tables across Core, Daily Practice and Live Council. It compares row contents, definitions, ownership, grants and row policies against the export snapshot. Live Council coverage includes meeting links, attendance and transcripts. The check also compares public schema grants and the roles that `anon`, `authenticated` and `service_role` can inherit. Its report names mismatched tables and keeps individual rows, row counts, fingerprints and database errors private.

## Capture the approved export reference

Use the owner-approved source connection and a private directory for the reference and backup. Set the shell’s file creation mask to `077` before launching `psql`. Start `psql` with `-X -qAt -v ON_ERROR_STOP=1`, then run the following from the release checkout. Replace the example path with the owner’s private path.

```sql
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT pg_export_snapshot();
\o /private/path/soe-restore-reference.json
\i docs/sql/privacy-restore-reference.sql
\o
```

Keep that transaction open while the approved database dump uses the returned snapshot ID with `pg_dump --snapshot`. Close the transaction with `ROLLBACK` once the dump finishes. Keep the reference with the exact backup and record the source, capture time and artifact checksums in the owner’s private manifest. Separate exports need their own consistency proof if they cannot share that snapshot. [PostgreSQL synchronized snapshots](https://www.postgresql.org/docs/17/app-pgdump.html)

## Check the isolated restore

Restore the trusted archive and its roles in the approved isolated environment with the same PostgreSQL major version and required extensions. PostgreSQL executes code supplied by a dump during restoration. The verifier below only reads an already restored database. It accepts an owner-only Unix socket directory and checks that the server has TCP listeners disabled. [PostgreSQL restore behavior](https://www.postgresql.org/docs/17/app-pgrestore.html) · [Supabase restore requirements](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)

```sh
python3 -B verification/web/scripts/verify-privacy-restore.py \
  --reference /private/path/soe-restore-reference.json \
  --socket-dir /private/path/restore-socket \
  --port 55421 --database soe_restore --user restore_owner
```

Supply the trusted local `psql` path with `--psql` on a host without the default Homebrew installation. Use an account that can read every row in the scoped tables. The default `MATCH` result covers all 14 tables before applying the privacy drafts. `MISMATCH` identifies drift, and `UNAVAILABLE` means the comparison could not run. Both return a failure status.

To compare an existing 11-table Core and Daily Practice reference, add `--core-practice-only`. To capture that scope, run `\set soe_restore_include_rooms off` in psql before loading the reference query. An 11-table match covers Core and Daily Practice. Use the default 14-table capture and check for the Live Council cutover.

The operator still verifies that the reference came from the named export and the query reached its isolated restoration. Full backup acceptance also covers provider identities, other database objects and credentials, and file storage. Supabase stores object metadata in the database backup. The files need separate recovery evidence. [Supabase backup scope](https://supabase.com/docs/guides/platform/backups)

## Include sign-in data

For an approved backup that includes Supabase Auth, run the following in the same snapshot transaction before loading the reference query.

```sql
\set soe_restore_include_auth on
```

Verify that private reference with the same command and add `--include-auth`. It requires 16 tables, including `auth.users` and `auth.identities`. It compares the complete rows, including stored password hashes and linked provider identities. The Auth schema permissions and the Auth service role are checked alongside table definitions and the existing app-table scope. The report gives mismatch categories and table names. Keep the reference and the archive in the owner's private storage. [Supabase Auth backup scope](https://supabase.com/kb/troubleshooting/migrating-auth-users-between-projects) · [Supabase database roles](https://supabase.com/docs/guides/database/postgres/roles)

A 16-table match proves the named account records were preserved in the restored snapshot. Verify other Auth records, signing keys, provider settings and a fresh sign-in separately.

## Include direct messages

Capture the direct-message rows and publication metadata in the same snapshot as the archive.

```sql
\set soe_restore_include_direct_messages on
```

Add `--include-direct-messages` to the verifier command for the 15-table comparison. With `\set soe_restore_include_auth on` at capture and both verifier flags, the comparison covers 17 tables. The direct-message definition comparison includes replica identity and the effective publication membership, including any row filter, column list or schema-level membership. A different message body or a missing publication entry fails the comparison. [Direct-message containment proof](direct-message-containment-verification.json)

## Include Circle listings, memberships and posts

For the first-release backup, capture the Circle tables in the same snapshot as the accounts, direct messages and other private app data. Set this flag before loading the reference query.

```sql
\set soe_restore_include_circles on
```

Add `--include-circles` to the isolated verifier command for the 20-table comparison. It includes the 17-table scope and checks `book_cohorts`, `book_cohort_members` and `seminar_messages`. The check compares their stored rows, definitions, grants, row security, replica identity and effective publication membership. It requires all three tables. Use this scope before applying the first privacy drafts. [Circle restore verification](circle-restore-verification.json)

## Include wallet sign-in state

After both wallet migrations are installed, capture the 19-table reference. Set this flag in the same read-only export transaction before loading the reference query.

```sql
\set soe_restore_include_wallet_state on
```

Add `--include-wallet-state` to the isolated verifier command. This scope includes Auth, direct messages and both wallet tables. It compares used sign-in challenges, revoked session fingerprints, table and schema access, publication membership, the four wallet routines and their owners' role memberships. A missing table or routine stops the check. The report identifies drift while keeping row contents, fingerprints and routine definitions private. For first-release backups taken after both wallet migrations, set both Circle and wallet flags at capture and pass `--include-circles --include-wallet-state` for the 22-table comparison.

The archive and reference must cover the same snapshot. A match establishes wallet state at capture time. If a later restore could lose security state written after that snapshot, keep wallet access closed until that state is recovered or the signing secret is rotated. Verify challenge reuse refusal and revoked-session replay refusal before reopening. [Synchronized PostgreSQL snapshots](https://www.postgresql.org/docs/17/app-pgdump.html#APP-PGDUMP) · [Wallet restore verification](wallet-restore-verification.json)

## Verify a backup after the Circle release

Once both wallet migrations and the full Circle release schema are installed, including the shared-salon presence table, set the following flag before loading the reference query in the export transaction.

```sql
\set soe_restore_include_circle_release_state on
```

Add `--include-circle-release-state` to the isolated verifier command. This 42-table scope adds 20 Circle tables to the 22-table scope. It covers private meeting links, RSVP and post receipts, thread links, reviewer assignments, reports, human decisions, review coverage, author AI consent, the AI allowance and debit ledger, and shared salon presence. It compares each table’s rows, grants, row security, constraints, triggers, comments and Realtime publication membership. It also compares the definitions, owners, comments and grants of the public Circle routines. A missing table or older reference prevents a match. The maintenance journal and unrelated application tables remain outside this comparison. [Circle release restore verification](circle-release-restore-verification.json)

Use the reference from the same snapshot as the archive. Keep member traffic closed and Circle AI disabled while reconciling membership changes, moderation actions, consent revocations and allowance debits that happened after that snapshot. In the isolated restore, verify that an authorized member can open the private meeting, a removed member is refused, hidden text stays hidden and an earlier consent revision cannot re-enable AI. Reopen only after the separate hosted acceptance checks.

## Verify a backup after the coordinated first release

After the Circle release, both wallet migrations, atomic Practice save and Live Council containment, set this flag in the same read-only export transaction.

```sql
\set soe_restore_include_first_release_state on
```

Add `--include-first-release-state` to the isolated verifier command. Use the new reference format from the same snapshot as the archive. It compares the same 42 tables, plus the Practice save and Live Council join routine definitions, owners, grants and role memberships. A difference reports `releaseServiceRoutinesMatch: false`. A missing routine stops verification. Existing Circle-only references use `--include-circle-release-state`.

On the isolated restore, exercise a Practice answer save and a Live Council join as the service role. Check that both browser roles are refused and that Realtime still excludes direct messages. A matching reference establishes snapshot parity. The expected access probes establish the release boundary. [Combined rehearsal](first-release-restore-verification.json)

## Verify a backup after the account erasure drafts

Once the queue, processing and erasure drafts have been installed, capture the post-erasure reference inside the same snapshot as the backup.

```sql
\set soe_restore_include_account_deletion_state on
```

Add `--include-account-deletion-state` to the isolated verifier command. The 63-table scope adds the 15 deletion tables, the three archived Twiddle tables, and Auth sessions, refresh tokens and flow state to the 42-table release scope. It compares account deletion routine definitions and grants, the private schema and its role access, and archived table publication settings. A change in a deletion routine reports `accountDeletionRoutinesMatch: false`. A missing required table or routine stops verification.

The local test used two archives from the same PostgreSQL snapshot. The 42-table check matched the incomplete archive even though it lost both pending status receipts and opened a frozen test account. The expanded check identified all 17 populated row sets that were missing. The complete restore kept both receipts, the access block, verified identity removals and the withdrawn Twiddle anchors. The verifier also detected changed routine authority, schema access, column grants and replication exposure. [Verification](account-erasure-restore-verification.json)

The check compares the restored database to the chosen point in time. Keep member access closed until the operator has reconciled any deletion and access changes recorded after that snapshot. Review the other provider records, signing configuration and stored files separately. Database backups cover Storage metadata and the actual files need their own recovery evidence. [PostgreSQL synchronized snapshots](https://www.postgresql.org/docs/17/app-pgdump.html) · [Supabase backup scope](https://supabase.com/docs/guides/platform/backups)

## Verify Waddle and archived Twiddle recovery

Before the approved cutover, set `soe_restore_include_voice_archive` to `on` in the same read-only export transaction. Add `--include-voice-archive` to the isolated verifier. This extends the 20-table Circle scope to 24 tables. It covers Waddle rows and the three archived Twiddle tables, including their grants, row security and Realtime exposure. The older Circle reference remains available for comparison to its original scope.

At the Waddle containment stage with the earlier account erasure drafts, set `soe_restore_include_voice_archive` and `soe_restore_include_account_deletion_state` to `on`. Add `--include-voice-archive --include-account-deletion-state` to the isolated verifier. The 64-table reference requires the Waddle consent column and compares its definition, provenance comment and stored values. The rehearsal found that the older 20- and 63-table references accepted partial restores with missing voice records. The expanded references detected those omissions. [Voice recovery verification](voice-archive-restore-verification.json)

After the [Waddle erasure draft](../sql/account-erasure-waddle-apply.sql), use `soe_restore_include_waddle_erasure=on` in the read-only reference capture and `--include-waddle-erasure` by itself for the isolated verifier. This compares 65 tables and requires the new owner routines. Keep the pending file list in the private restore only. Compare the Storage bytes separately and reconcile removals recorded after the snapshot before reopening media access. [Voice erasure verification](account-erasure-waddle-verification.json)

After the [direct-message blocking draft](../sql/direct-message-blocks-apply.sql), capture with `soe_restore_include_member_safety=on` and compare with `--include-member-safety` by itself. This adds private block records and the messaging routines to the 66-table scope. Check current block enforcement on the restored app before reopening messages. [Block recovery verification](direct-message-blocking-verification.json)

After the [Circle member blocks draft](../sql/circle-member-blocks-apply.sql), capture with `soe_restore_include_circle_member_blocks=on` and compare with `--include-circle-member-blocks` by itself. This still compares 66 tables. It also requires the Circle block write and the private revision check. The previous scope can match a restore missing the private function. Use this scope for backups after the Circle block stage.

## Verify the separate audio archive

The `waddles` bucket also holds older Twiddle objects. Preserve every inventoried object, including ones with no current app reference. Use the same approved capture window for the database and media, with writes to the shared bucket held for the capture. In the export transaction, direct the output of `docs/sql/voice-storage-inventory.sql` to a private `inventory.json`. Repeat on the isolated Storage target after import. The inventory contains private object keys and captures the bucket settings and recorded media metadata. Keep both inventories and the files in the owner's private recovery directory. [Supabase database backup scope](https://supabase.com/docs/guides/platform/backups)

Use the approved Storage or S3 client to read each inventoried object by its exact key, once from the source and separately from the restored target. Save each response in an owner-only `objects` directory as `<sha256-of-UTF-8-key>.blob`. This keeps object keys out of filesystem paths and handles names that would collide on a case-insensitive filesystem. The source bytes and their sealed reference belong with the approved recovery archive. Restore through the Storage API or the S3 endpoint so the target has usable object records. Keep the isolated bucket private and preserve its other settings and object content types and encodings. [Supabase S3 copy procedure](https://supabase.com/docs/guides/self-hosting/copy-from-platform-s3)

```sh
python3 -B verification/web/scripts/verify-voice-storage.py seal \
  --inventory /private/owner-recovery/source/inventory.json \
  --objects /private/owner-recovery/source/objects \
  --reference /private/owner-recovery/voice-reference.json

python3 -B verification/web/scripts/verify-voice-storage.py check \
  --inventory /private/owner-recovery/restore/inventory.json \
  --objects /private/owner-recovery/restore/objects \
  --reference /private/owner-recovery/voice-reference.json
```

Record the source and restore identifiers, capture times and archive hashes in the owner's private manifest. Use fresh readback files from the isolated endpoint for the second command. The verifier compares exact keys, lengths, SHA-256 digests and playback metadata. It requires a private target and matching size and MIME settings. It reports only result categories and counts. This procedure covers unversioned objects and requires a separate recovery review if the bucket has version history.

After both comparisons pass, check direct access with anonymous and signed-in browser roles. Use a synthetic publication to check the replacement app, including a seek request and a denial after consent withdrawal. Keep that acceptance separate from the database and file comparisons. [Waddle cutover](waddle-privacy.md#hosted-cutover)

## Local rehearsal

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin \
  python3 -B verification/web/scripts/test-privacy-restore-check.py
```

The rehearsal creates two disposable PostgreSQL clusters and runs a real dump and restore from a shared snapshot. It checks later writes to answers and transcripts, detects data and permission drift, and applies the Core, Daily Practice and Live Council drafts to the same restored fixture. Both browser roles lose read access across all 14 tables and the service role retains reads. The service-only Live Council join records attendance after the changes. The PostgreSQL fixture uses `real[]` for embeddings. The separate Practice tests exercise the tracked vector schema. [Verification receipt](privacy-room-restore-verification.json)

The account rehearsal restores a second archive that omits the rows in both Auth tables. The 14-table check matches that archive, and the 16-table check detects the omissions. On the complete restore, the 16-table check detects a replaced password hash, a rebound provider identity and changed Auth grants or role flags. [Account restore verification](privacy-auth-restore-verification.json)

The direct-message rehearsal restores a second archive with the message rows omitted. The 16-table check passes that archive and the 17-table check flags the omission. A successful repair preserves the restored rows and denies direct reads and writes to both browser roles. The resulting archive restores the same 17 table definitions and data, including the contained permissions. [Direct-message containment proof](direct-message-containment-verification.json)

The rehearsal also checks that the new Practice save function refuses the old browser grants. After containment it uses separate database sessions to exercise overlapping saves and a forced failure in the final update. [Practice save verification](practice-atomic-save-verification.json)

The same rehearsal applies both wallet migrations to the contained restore, then restores complete and deliberately incomplete archives from one later snapshot. The 17-table check passes the incomplete archive. The 19-table check identifies both missing wallet row sets. The complete archive preserves both replay refusals. [Wallet restore verification](wallet-restore-verification.json)

The Circle rehearsal showed that the 17-table check could pass an archive with every Circle row omitted. The 20-table check flags all three omissions and accepts the complete archive from the same snapshot. The 22-table check also covers missing wallet rows after both wallet migrations. [Circle restore verification](circle-restore-verification.json)

The coordinated rehearsal restores a 20-table pre-cutover snapshot and role export in a second PostgreSQL 17 cluster. It applies 48 reviewed SQL files to that copy and checks the original columns of every tracked table. It then restores the populated release archive and verifies 42 tables and the three routine groups. Practice saves, Live Council joins, Auth links, private direct messages, wallet replay refusals, moderation and the Philemon reading plan all survive. The older Circle check passes with a changed Practice grant or Live Council security mode. The first-release check flags both and refuses a missing routine. [Combined rehearsal](first-release-restore-verification.json) · [Earlier Circle proof](circle-release-restore-verification.json)

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin \
  python3 -B verification/web/scripts/test-circle-release-restore.py
```
