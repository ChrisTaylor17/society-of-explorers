import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

const requiredNames = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SOE_ADMIN_EMAILS",
  "WALLET_SESSION_SECRET",
  "PROMPT_INPUT_HASH_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET_PROMPTS",
  "STRIPE_PROMPTS_PRO_PRICE_ID",
  "NEXT_PUBLIC_SITE_URL",
  "ANTHROPIC_API_KEY",
  "PROMPT_ATLAS_CLAUDE_MODEL",
];

const sensitiveNames = new Set([
  "SUPABASE_SERVICE_ROLE_KEY",
  "WALLET_SESSION_SECRET",
  "PROMPT_INPUT_HASH_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET_PROMPTS",
  "ANTHROPIC_API_KEY",
]);

const result = spawnSync(
  "npx",
  ["vercel", "env", "ls", "--format", "json"],
  { encoding: "utf8" },
);

if (result.error) throw result.error;
assert.equal(result.status, 0, result.stderr || result.stdout || "vercel env ls failed.");

const jsonStart = result.stdout.indexOf("{");
assert.notEqual(jsonStart, -1, "Vercel env output did not include JSON.");
const { envs } = JSON.parse(result.stdout.slice(jsonStart));
assert(Array.isArray(envs), "Vercel env output did not include envs array.");

const byName = new Map();
for (const item of envs) {
  if (!byName.has(item.key)) byName.set(item.key, []);
  byName.get(item.key).push(item);
}

const failures = [];
for (const target of ["production", "preview"]) {
  for (const name of requiredNames) {
    const entries = byName.get(name) || [];
    if (!entries.some((entry) => entry.target?.includes(target))) {
      failures.push(`${target}: missing ${name}`);
    }
  }
}

for (const name of sensitiveNames) {
  const entries = byName.get(name) || [];
  for (const entry of entries) {
    if (entry.type !== "sensitive") {
      failures.push(`${entry.target?.join(",") || "unknown target"}: ${name} should be sensitive, got ${entry.type}`);
    }
  }
}

if (failures.length) {
  console.error("Prompt Atlas Vercel environment checks failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Prompt Atlas Vercel environment checks passed.");
}
