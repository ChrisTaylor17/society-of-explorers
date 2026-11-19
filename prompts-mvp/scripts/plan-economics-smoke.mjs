import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(join(root, relativePath), "utf8");
}

const [plan, migration, execute, session, upgrade, workspace, readme, runbook] =
  await Promise.all([
    source("src/lib/billing/plan.ts"),
    source("supabase/migrations/202606180008_unlimited_pro_runs.sql"),
    source("src/app/api/prompts/execute/route.ts"),
    source("src/app/api/auth/session/route.ts"),
    source("src/components/prompts/UpgradeDialog.tsx"),
    source("src/components/prompts/PromptWorkspace.tsx"),
    source("README.md"),
    source("docs/deployment-runbook.md"),
  ]);

assert.match(plan, /PROMPT_ATLAS_FREE_MONTHLY_RUNS = 5/);
assert.match(plan, /PROMPT_ATLAS_PRO_MONTHLY_RUNS: number \| null = null/);
assert.match(plan, /PROMPT_ATLAS_PRO_MONTHLY_RUNS_LABEL = "Unlimited"/);
assert.match(plan, /PROMPT_ATLAS_HOURLY_RUNS = 10/);
assert.match(plan, /PROMPT_ATLAS_MAX_INPUT_TOKENS = 4000/);
assert.match(plan, /PROMPT_ATLAS_MAX_OUTPUT_TOKENS = 1400/);

const recentQuery = migration.slice(
  migration.indexOf("select count(*) into v_recent"),
  migration.indexOf("if v_recent >= 10"),
);
assert.match(migration, /v_limit integer := 5/);
assert.doesNotMatch(recentQuery, /r\.status in/);
assert.match(migration, /if v_recent >= 10/);
assert.match(migration, /v_limit := null/);
assert.match(migration, /v_effective_plan := 'explorer_pro'/);
assert.match(migration, /if v_limit is not null and v_used >= v_limit/);
assert.doesNotMatch(migration, /v_limit := 200|prompt_pro_limit_reached/);
assert.match(migration, /return query select v_run_id, v_used \+ 1, v_limit, v_effective_plan/);

assert.match(execute, /max_tokens: PROMPT_ATLAS_MAX_OUTPUT_TOKENS/);
assert.match(execute, /messages\.countTokens\(/);
assert.ok(
  execute.indexOf("messages.countTokens(") <
    execute.indexOf('"mark_prompt_run_started"') &&
    execute.indexOf('"mark_prompt_run_started"') <
    execute.indexOf("messages.stream("),
  "input must be counted before the billable provider-start marker and generation",
);
assert.match(execute, /countedInputTokens > PROMPT_ATLAS_MAX_INPUT_TOKENS/);
assert.match(execute, /code: "input_too_large"/);
assert.match(execute, /reservation\.runs_limit === null/);
assert.match(execute, /PROMPT_ATLAS_FREE_MONTHLY_RUNS/);
assert.doesNotMatch(execute, /prompt_pro_limit_reached|plan_limit_reached|PROMPT_ATLAS_PRO_MONTHLY_RUNS/);
assert.match(session, /PROMPT_ATLAS_PRO_MONTHLY_RUNS/);
assert.match(session, /PROMPT_ATLAS_FREE_MONTHLY_RUNS/);

assert.match(upgrade, /PROMPT_ATLAS_PRO_MONTHLY_RUNS_LABEL/);
assert.match(upgrade, /starts per hour for reliable shared access/);
assert.match(workspace, /PROMPT_ATLAS_FREE_MONTHLY_RUNS/);
assert.match(workspace, /PROMPT_ATLAS_PRO_MONTHLY_RUNS_LABEL/);
assert.match(readme, /unlimited/i);
assert.match(readme, /unlimited monthly runs and a 10\/hour fair-use pace/);
assert.match(runbook, /202606180008_unlimited_pro_runs\.sql/);

console.log("Prompt Atlas plan economics smoke checks passed.");
