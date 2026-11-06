# Privacy cutover restore check

The first Core and Daily Practice cutover covers 11 tables. The restore check compares their row contents, definitions, ownership, grants and row policies with a reference captured from the export snapshot. It also compares public schema grants and the roles that `anon`, `authenticated` and `service_role` can inherit. Its report names mismatched tables without printing row values, counts, fingerprints or database errors.

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

Supply the trusted local `psql` path with `--psql` on a host without the default Homebrew installation. Use an account that can read every row in the scoped tables. `MATCH` compares the 11 tables before applying the privacy drafts. `MISMATCH` identifies drift, and `UNAVAILABLE` means the comparison could not run. Both return a failure status.

The operator still verifies that the reference came from the named export and the query reached its isolated restoration. Full backup acceptance also covers provider identities, other database objects and credentials, and file storage. Supabase stores object metadata in the database backup. The files need separate recovery evidence. [Supabase backup scope](https://supabase.com/docs/guides/platform/backups)

## Local rehearsal

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin \
  python3 -B verification/web/scripts/test-privacy-restore-check.py
```

The rehearsal creates two disposable PostgreSQL clusters and runs a real dump and restore from a shared snapshot. It checks that a later write stays out of the archive, tests row and permission drift, and applies both reviewed privacy drafts to the restored fixture. The PostgreSQL fixture uses `real[]` for embeddings. The separate Practice tests exercise the tracked vector schema. [Verification receipt](privacy-restore-check-verification.json)

The rehearsal also checks that the new Practice save function refuses the old browser grants. After containment it uses separate database sessions to exercise overlapping saves and a forced failure in the final update. [Practice save verification](practice-atomic-save-verification.json)
