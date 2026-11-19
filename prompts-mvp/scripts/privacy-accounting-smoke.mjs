import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(join(root, relativePath), "utf8");
}

const [fingerprint, executeRoute, sessionRoute, recoveryMigration, runbook] =
  await Promise.all([
    source("src/lib/prompts/inputFingerprint.ts"),
    source("src/app/api/prompts/execute/route.ts"),
    source("src/app/api/auth/session/route.ts"),
    source("supabase/migrations/202606180002_prompt_run_recovery.sql"),
    source("docs/deployment-runbook.md"),
  ]);

assert.match(fingerprint, /import "server-only"/);
assert.match(fingerprint, /name: "HMAC", hash: "SHA-256"/);
assert.match(fingerprint, /PROMPT_INPUT_HASH_SECRET/);
assert.match(fingerprint, /WALLET_SESSION_SECRET/);
assert.match(fingerprint, /prompt-atlas:v1/);

assert.match(executeRoute, /hasInputFingerprintConfig\(\)/);
assert.match(executeRoute, /await inputFingerprint\(/);
assert.match(executeRoute, /function privateJson/);
assert.match(executeRoute, /"Cache-Control": "private, no-store, max-age=0"/);
assert.match(executeRoute, /"Cache-Control": "private, no-store, no-transform"/);
assert.match(executeRoute, /Vary: "Cookie, Authorization"/);
assert.doesNotMatch(executeRoute, /crypto\.subtle\.digest/);
assert.ok(
  executeRoute.indexOf("safeParse") < executeRoute.indexOf("inputFingerprint("),
  "input fingerprinting must happen only after input validation",
);

assert.match(recoveryMigration, /pg_advisory_xact_lock/);
assert.match(recoveryMigration, /status = 'failed'/);
assert.match(recoveryMigration, /error_code = 'reservation_expired'/);
assert.match(recoveryMigration, /interval '10 minutes'/);
assert.ok(
  recoveryMigration.indexOf("error_code = 'reservation_expired'") <
    recoveryMigration.indexOf("select count(*) into v_recent"),
  "expired reservations must be released before rate and quota counts",
);

assert.match(sessionRoute, /reservationCutoff/);
assert.match(sessionRoute, /\.eq\("status", "completed"\)/);
assert.match(sessionRoute, /\.eq\("status", "reserved"\)/);
assert.match(sessionRoute, /pendingReservationCount/);
assert.match(sessionRoute, /providerStartedCount/);
assert.match(sessionRoute, /\.is\("provider_started_at", null\)/);
assert.match(sessionRoute, /\.not\("provider_started_at", "is", null\)/);
assert.match(sessionRoute, /\(completedCount \|\| 0\) \+/);
assert.match(sessionRoute, /\(pendingReservationCount \|\| 0\) \+/);
assert.match(sessionRoute, /\(providerStartedCount \|\| 0\)/);
assert.match(runbook, /202606180002_prompt_run_recovery\.sql/);

console.log("Prompt privacy and accounting smoke checks passed.");
