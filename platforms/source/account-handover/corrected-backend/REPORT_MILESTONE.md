# Authenticated local report submission

This source extends the independently accepted221-file local durability archive SHA-256 `58083c84991cbab77232ade6f413080b42757a224dccee79f1712bc246c64340`. Reviewed artifacts and author trees remain unchanged.

The existing synthetic backend now supports SQLite-only participant reports through its authenticated/idempotent write envelope. [REPORTS_API.md](prototypes/soe-join-revoke/REPORTS_API.md) defines bounded inputs, minimal submitted receipts, participant access isolation, explicit schema1→2 migration, persisted quota and the missing staffing/retention decisions. There is no moderator or report-read interface, no native UI change, and no external transmission or notification.

Older durability/safety documents describe their prior milestones. Reports are now supported only with configured version2 SQLite storage; default memory mode explicitly declines submission. The existing consent, block and versioned-denial behavior remains intact. Local submission durability alone is not safety staffing, a real-user pilot or production readiness.
