/** Shared with the synthetic mobile client (mobile/src/copy.ts). */
export const REVOCATION_LIMIT =
  "Revoking stops future contact access. It cannot erase information someone already saw.";

export const DELETION_LIMIT =
  "Deleting this account stops future contact access and withdraws a pending join request. A relay someone already saw stays with them.";

export const BLOCK_LIMIT =
  "Blocking stops new invitations and future contact reads between these people. It cannot recall copies already returned. This run keeps block records only in memory; restarting the server loses them. This prototype provides no moderation. This is not a guarantee of permanent retention, backup recovery or production operation.";

export const BLOCK_SQLITE_LIMIT =
  "Blocking stops new invitations and future contact reads between these people. It cannot recall copies already returned. This run saves block records in a local SQLite file; they can survive closing and reopening that same file. This prototype provides no moderation. This is not a guarantee of permanent retention, backup recovery or production operation.";

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
