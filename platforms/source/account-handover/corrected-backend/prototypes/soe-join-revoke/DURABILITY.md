# Local SQLite durability milestone

This change extends the reviewed synthetic backend from the 215-file denial-repair source archive (SHA-256 `4f90067b38dad10d326bfbf5d6b1333d04780903f40325efb6ead241b4d340e1`). It preserves the HTTP protocol, authorization rules, block behavior, versioned denial packets and mobile denial barriers. There is no new service or identity system.

## Available runtime and explicit opt-in

The current Mac already has Node **22.22.1** with built-in experimental `node:sqlite`, reporting SQLite **3.53.3**. No dependency or system installation was needed. These exact versions were exercised; other Node/SQLite combinations are not certified by these tests. The existing dependency-free backend package remains unchanged.

`createWorld()` retains its isolated in-memory behavior for existing tests. Durable operation requires an explicit **absolute**, previously nonexistent database path:

```js
const world = createWorld({ databasePath: "/absolute/private-directory/world.sqlite" });
// Existing world APIs and response shapes are unchanged.
await world.close();
```

For the existing HTTP server, create a trusted user-controlled directory (0700 recommended), choose a new file inside it, then run:

```sh
SOE_DATABASE_PATH=/absolute/private-directory/world.sqlite npm start
```

The server still binds numeric IPv4 loopback. Omitting `SOE_DATABASE_PATH` is explicitly ephemeral and is identified as `Storage: memory` on startup. No database is silently placed in a home/project directory. The SQLite file is created mode0600; symlink files, nonregular files, group/other-readable files and an immediately containing group/world-writable directory are rejected. Use a trusted filesystem/path; this is not protection against a malicious account with write access to that path or a hostile ancestor-directory race. The supplied `.sqlite` state/journal patterns are ignored by source control; keep database paths in a private directory outside source/evidence, and exclude any custom filename explicitly. No database file is included in the delivered archives.

## What persists, and the transaction boundary

One `soe_state` row contains a versioned JSON checkpoint of the complete small world: people/tombstones and fixture profile/passcode hashes, sessions/expiry, plans and versions, invitations and `wasVisible`, grants and grant serial, blocks, and person/endpoint/key-scoped idempotency hashes and committed receipts. Preserving all this context avoids replaying a grant receipt against a reseeded plan or restoring a grant ID counter to zero.

Every operation obtains `BEGIN IMMEDIATE`, reloads the latest checkpoint, runs the existing synchronous domain function, validates the result state, saves a changed checkpoint and commits **before returning**. The block, both grant revocations, invitation withdrawal, affected versions and idempotency receipt therefore share one SQLite transaction. Reads also participate because an authorized read may set `wasVisible`. Unchanged snapshots skip the row update. Separate processes/connections reload inside the lock, rather than trusting a stale in-memory cache.

SQLite uses rollback journals (`journal_mode=DELETE`), `synchronous=EXTRA`, and requests `fullfsync=ON` on this Mac. Busy waiting is bounded to5 seconds; a storage error rejects the operation instead of returning a false committed receipt. The existing HTTP/client unknown-outcome handling remains relevant to a lost reply or storage exception. A committed same-key retry returns the stored historical receipt without advancing the plan version again.

Each process still queues its own calls. Cross-process exclusion is provided by SQLite's local write lock. This is a bounded single-host design, not a distributed lock, cloud database or scalable relational model. The synchronous full-snapshot transaction blocks the event loop and grows with retained history; it is appropriate only for this small synthetic world. There is no compaction/retention policy, high-volume performance claim or network-filesystem support.

`world.close()` drains already accepted work and rejects new work. The HTTP entrypoint handles SIGINT/SIGTERM by closing its owned server, then the world. An ungraceful process kill relies on SQLite recovery rather than shutdown callbacks.

## Crash and recovery evidence

`tests/durability.test.js` checks restart preservation of grants, blocks, versions, receipts, sessions, invitation/visibility context, grant serials and tombstones. It also checks rejected/expired sessions, block-before-any-join, failed commit rollback, multiple connections, concurrent child processes, lost delivery and storage identity failures.

The crash cases use only test-owned child processes. With test hooks explicitly gated by `allowFaults:true`, a child pauses after the SQL update but before COMMIT, or after COMMIT but before returning the reply. The test kills it with SIGKILL, reopens the same database and verifies:

- Before commit: old visible plan/version5 remains, no block or receipt exists, both grants remain active, invitation remains accepted. Retrying commits the block once.
- After commit: block/withdrawal/both revocations/version6/receipt all survive. Lookup finds the receipt and retry returns that same version6 receipt.

The hooks are not accepted in the normal server configuration and have no HTTP endpoint or environment toggle. A real-HTTP integration test restarts only its own durable backend on its own port, preserves its synthetic sessions, replays the captured pre-block response and checks that the existing S1 denial barrier still withholds contact.

These are **process-crash** tests. They do not simulate sudden power loss, controller firmware failures, filesystem corruption, malicious database editing, or all operating-system failures. Durability depends on SQLite and the local filesystem/device honoring synchronization requests; no physical-media guarantee is asserted.

## Identity, migration and rollback assumptions

The file must carry the SoE SQLite application ID, schema version1, and exactly one valid checkpoint. Checkpoint format1 is restricted to the existing three fictional people and one plan, with validated references, grant serials, safe versions and block/grant consistency. Unrelated databases, newer schema versions, missing rows, invalid JSON/state and existing zero-length files fail closed. They are never silently reseeded or automatically migrated.

A brand-new path starts a **new synthetic fixture world** once. This milestone does not import the state of an already running ephemeral process. Do not replace a live backend with a fresh path while reusing old clients/sessions/version assumptions. Start fresh synthetic sessions when first opting in. Subsequent restarts must use the same intact database.

Future fixture/schema/policy changes require an explicit versioned migration with separately reviewed invariants; no migration from a future format, seed change, or arbitrary external database is supplied. Deleting/replacing the file or restoring an older backup resets/rolls back its history; there is no trusted external epoch or anti-rollback mechanism. Copying a live file by hand is not a supported backup process. No backup/restore or disaster-recovery workflow is implemented here.

## Privacy and remaining pilot blockers

The file now deliberately retains synthetic profile/contact fields, passcode hashes and session bearer tokens on disk. It is **not encrypted**. The fixture passcodes and relays were already fictional source values; no real credentials or personal records were used. Mode0600 is not encryption or a production secret-storage design. Database/journal/backups and old pages are not claimed to provide physical erasure.

Deletion remains a tombstone, reports/moderation and unblock remain unsupported, prior copies cannot be recalled, and real identity/abuse controls and retention policy remain missing. There is no APK/native validation for this milestone. Local durability does not establish production readiness, a real-user pilot, multi-instance service safety, physical-device/iOS coverage or release signing readiness.

## Reproduce

From the backend directory with the already available Node runtime:

```sh
node --experimental-strip-types --test --test-timeout=25000 tests/durability.test.js
npm test
```

From the source-kit root, with local sockets permitted:

```sh
node --experimental-transform-types --test --test-timeout=25000 prototypes/soe-join-revoke/integration/*.test.mts
```

All database paths in tests are created in disposable private temporary directories. No author service, emulator, original source tree or real record is used.
