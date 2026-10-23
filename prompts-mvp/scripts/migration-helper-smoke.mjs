import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(join(root, relativePath), "utf8");
}

const [helper, packageJson, operatorSmoke, readme, runbook, continuation] =
  await Promise.all([
    source("scripts/apply-unlimited-pro-migration.mjs"),
    source("package.json"),
    source("scripts/operator-smoke.mjs"),
    source("README.md"),
    source("docs/deployment-runbook.md"),
    source("docs/codex-continuous-work.md"),
  ]);

assert.match(packageJson, /"db:apply:unlimited-pro": "node scripts\/apply-unlimited-pro-migration\.mjs"/);
assert.match(packageJson, /"migration:helper:smoke": "node scripts\/migration-helper-smoke\.mjs"/);
assert.match(operatorSmoke, /"migration-helper-smoke\.mjs"/);

assert.match(helper, /202606180008_unlimited_pro_runs\.sql/);
assert.match(helper, /allowedArgs = new Set\(\["--apply", "--dry-run", "--skip-readiness"\]\)/);
assert.match(helper, /if \(!apply\)/);
assert.match(helper, /No database changes were made/);
assert.match(helper, /SUPABASE_DB_URL/);
assert.match(helper, /DATABASE_URL/);
assert.match(helper, /POSTGRES_URL/);
assert.match(helper, /SUPABASE_ACCESS_TOKEN/);
assert.match(helper, /SUPABASE_SERVICE_ROLE_KEY can validate the app but cannot apply schema DDL/);
assert.match(helper, /SUPABASE_TELEMETRY_DISABLED: "1"/);
assert.match(helper, /"supabase", "db", "query"/);
assert.match(helper, /"--file", migrationFile/);
assert.match(helper, /redact/);
assert.match(helper, /\["run", "db:readiness:smoke"\]/);
assert.doesNotMatch(helper, /console\.log\(dbUrl|process\.stdout\.write\(dbUrl/);

for (const doc of [readme, runbook, continuation]) {
  assert.match(doc, /db:apply:unlimited-pro/);
  assert.match(doc, /202606180008_unlimited_pro_runs\.sql/);
}

console.log("Prompt Atlas migration helper smoke checks passed.");
