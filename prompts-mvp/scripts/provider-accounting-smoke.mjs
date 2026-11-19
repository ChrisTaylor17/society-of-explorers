import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(join(root, relativePath), "utf8");
}

const [migration, executeRoute, sessionRoute, runbook] = await Promise.all([
  source("supabase/migrations/202606180004_provider_run_accounting.sql"),
  source("src/app/api/prompts/execute/route.ts"),
  source("src/app/api/auth/session/route.ts"),
  source("docs/deployment-runbook.md"),
]);

assert.match(migration, /add column if not exists provider_started_at timestamptz/);
assert.match(migration, /create or replace function public\.mark_prompt_run_started/);
assert.match(migration, /and provider_started_at is null/);
assert.match(migration, /raise exception 'invalid_run_transition'/);
assert.match(migration, /grant execute on function public\.mark_prompt_run_started/);

assert.match(executeRoute, /"mark_prompt_run_started"/);
assert.ok(
  executeRoute.indexOf('"mark_prompt_run_started"') <
    executeRoute.indexOf("getAnthropicClient().messages.stream"),
  "provider start must be persisted before the model call",
);
assert.match(executeRoute, /\{ signal: request\.signal \}/);
assert.match(executeRoute, /providerStartMarked !== true/);
assert.match(executeRoute, /error: completionError/);
assert.match(executeRoute, /error: failureAccountingError/);
assert.match(executeRoute, /request\.signal\.aborted \|\| deliveryClosed/);
assert.ok(
  executeRoute.indexOf("request.signal.aborted || deliveryClosed") <
    executeRoute.indexOf('p_status: "failed"', executeRoute.indexOf("catch (error)")),
  "client-stopped provider calls must remain billable instead of being marked failed",
);

assert.match(sessionRoute, /pendingReservationCount/);
assert.match(sessionRoute, /providerStartedCount/);
assert.match(sessionRoute, /\.is\("provider_started_at", null\)/);
assert.match(sessionRoute, /\.not\("provider_started_at", "is", null\)/);
assert.match(runbook, /202606180004_provider_run_accounting\.sql/);

console.log("Prompt Atlas provider accounting smoke checks passed.");
