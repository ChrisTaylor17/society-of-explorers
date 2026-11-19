# Optional local SQLite durability

This source builds on the independently reviewed215-file S1 denial-repair source (`soe-denial-repair-source.zip`, SHA-256 `4f90067b38dad10d326bfbf5d6b1333d04780903f40325efb6ead241b4d340e1`). Earlier author trees, artifacts and protocols are unchanged.

The existing backend now supports an explicit `databasePath` / `SOE_DATABASE_PATH` using the already available Node22.22.1 built-in SQLite module. [DURABILITY.md](prototypes/soe-join-revoke/DURABILITY.md) describes storage contents, atomicity/crash tests, migration assumptions and limitations. Default in-memory mode remains available. No external service, package installation, native application change or production-readiness claim is part of this milestone.

The implementation preserves the same consent rules and S1 versioned-denial barrier. Full-world checkpoints include grants, blocks, versions and idempotency receipts in the same SQLite transaction. Tests kill only their own child processes before/after commit and exercise a real local HTTP backend restart. Run the backend tests and all integration tests using the commands in DURABILITY.md.

The database deliberately retains synthetic profile/contact/session material without encryption. Reports remain unsupported; deletion remains a tombstone. Review this milestone independently before using even a broader synthetic environment; real users, production services, release/native testing, retention/erasure policy, backup/restore and distributed deployment remain outside scope.
