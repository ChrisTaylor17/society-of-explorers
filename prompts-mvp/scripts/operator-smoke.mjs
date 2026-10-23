import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const DEFAULT_STEP_TIMEOUT_MS = 30_000;
const MAX_STEP_TIMEOUT_MS = 120_000;
const allowedArgs = new Set(["--list", "--with-ui", "--with-db-readiness", "--with-live-execution", "--with-vercel-env", "--with-stripe-live"]);
const args = process.argv.slice(2);
const unknownArgs = args.filter((arg) => !allowedArgs.has(arg));

if (unknownArgs.length > 0) {
  console.error(`Unknown Prompt Atlas operator smoke argument(s): ${unknownArgs.join(", ")}`);
  console.error("Usage: npm run operator:smoke -- [--list] [--with-ui] [--with-db-readiness] [--with-live-execution] [--with-vercel-env] [--with-stripe-live]");
  process.exit(1);
}

const listOnly = args.includes("--list");
const includeUi = args.includes("--with-ui");
const includeDbReadiness = args.includes("--with-db-readiness");
const includeLiveExecution = args.includes("--with-live-execution");
const includeVercelEnv = args.includes("--with-vercel-env");
const includeStripeLive = args.includes("--with-stripe-live");

function resolveStepTimeoutMs(value) {
  if (!value) return DEFAULT_STEP_TIMEOUT_MS;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 5_000 || parsed > MAX_STEP_TIMEOUT_MS) {
    throw new Error(
      `PROMPT_ATLAS_SMOKE_STEP_TIMEOUT_MS must be between 5000 and ${MAX_STEP_TIMEOUT_MS}.`,
    );
  }

  return Math.trunc(parsed);
}

let stepTimeoutMs;
try {
  stepTimeoutMs = resolveStepTimeoutMs(process.env.PROMPT_ATLAS_SMOKE_STEP_TIMEOUT_MS);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const defaultSmokeScripts = [
  "billing-duplicate-smoke.mjs",
  "billing-intent-smoke.mjs",
  "billing-integrity-smoke.mjs",
  "billing-lifecycle-smoke.mjs",
  "billing-portal-smoke.mjs",
  "billing-price-smoke.mjs",
  "billing-return-smoke.mjs",
  "checkout-safety-smoke.mjs",
  "community-growth-smoke.mjs",
  "community-privacy-smoke.mjs",
  "migration-helper-smoke.mjs",
  "operator-metrics-smoke.mjs",
  "plan-economics-smoke.mjs",
  "prompt-catalog-smoke.mjs",
  "prompt-packs-smoke.mjs",
  "prompt-share-smoke.mjs",
  "privacy-accounting-smoke.mjs",
  "provider-accounting-smoke.mjs",
].sort();
const optionalUiSmokeScripts = ["ui-smoke.mjs"];
const optionalDbReadinessSmokeScripts = ["db-readiness-smoke.mjs"];
const optionalLiveExecutionSmokeScripts = ["execute-live-smoke.mjs"];
const optionalVercelEnvSmokeScripts = ["vercel-env-smoke.mjs"];
const optionalStripeLiveSmokeScripts = ["stripe-live-smoke.mjs"];
const smokeScripts = [
  ...defaultSmokeScripts,
  ...(includeUi ? optionalUiSmokeScripts : []),
  ...(includeDbReadiness ? optionalDbReadinessSmokeScripts : []),
  ...(includeLiveExecution ? optionalLiveExecutionSmokeScripts : []),
  ...(includeVercelEnv ? optionalVercelEnvSmokeScripts : []),
  ...(includeStripeLive ? optionalStripeLiveSmokeScripts : []),
].sort();

const discoveredSmokeScripts = readdirSync(scriptsDirectory)
  .filter((name) => name.endsWith("-smoke.mjs") && name !== "operator-smoke.mjs")
  .sort();

assert.deepEqual(
  discoveredSmokeScripts,
  [
    ...defaultSmokeScripts,
    ...optionalUiSmokeScripts,
    ...optionalDbReadinessSmokeScripts,
    ...optionalLiveExecutionSmokeScripts,
    ...optionalVercelEnvSmokeScripts,
    ...optionalStripeLiveSmokeScripts,
  ].sort(),
  "Prompt Atlas smoke manifest is stale; classify every added or removed smoke script.",
);

if (listOnly) {
  console.log(`Prompt Atlas operator smoke plan: ${smokeScripts.length} script(s), ${stepTimeoutMs}ms timeout per script.`);
  smokeScripts.forEach((script, index) => {
    console.log(`${index + 1}. ${script}: node scripts/${script}`);
  });
  if (!includeUi) {
    console.log("Optional UI smoke omitted. Add --with-ui to launch or reuse a local dev server and write screenshots.");
  }
  if (!includeDbReadiness) {
    console.log("Optional database readiness smoke omitted. Add --with-db-readiness after Supabase migrations are applied.");
  }
  if (!includeLiveExecution) {
    console.log("Optional live execution smoke omitted. Add --with-live-execution with PROMPT_ATLAS_BASE_URL set to call Claude once.");
  }
  if (!includeVercelEnv) {
    console.log("Optional Vercel env smoke omitted. Add --with-vercel-env to check Production/Preview env parity without reading values.");
  }
  if (!includeStripeLive) {
    console.log("Optional live Stripe smoke omitted. Add --with-stripe-live to verify product, price, webhook, and Customer Portal readiness without creating charges.");
  }
  process.exit(0);
}

for (const script of smokeScripts) {
  console.log(`\n== ${script} ==`);
  const result = spawnSync(process.execPath, [join(scriptsDirectory, script)], {
    encoding: "utf8",
    stdio: "inherit",
    timeout: stepTimeoutMs,
  });

  if (result.error) {
    if (result.error.code === "ETIMEDOUT") {
      console.error(`\nPrompt Atlas smoke timed out during ${script} after ${stepTimeoutMs}ms.`);
    } else {
      console.error(`\nPrompt Atlas smoke failed during ${script}: ${result.error.message}`);
    }
    process.exit(1);
  }
  if (result.signal) {
    console.error(`\nPrompt Atlas smoke failed during ${script}: terminated by ${result.signal}.`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`\nPrompt Atlas operator smoke passed: ${smokeScripts.length} script(s).`);
if (!includeUi) {
  console.log("Skipped UI smoke. Run npm run operator:smoke -- --with-ui to include browser screenshots.");
}
if (!includeDbReadiness) {
  console.log("Skipped database readiness smoke. Run npm run operator:smoke -- --with-db-readiness after Supabase migrations are applied.");
}
if (!includeLiveExecution) {
  console.log("Skipped live execution smoke. Run npm run operator:smoke -- --with-live-execution with PROMPT_ATLAS_BASE_URL set to call Claude once.");
}
if (!includeVercelEnv) {
  console.log("Skipped Vercel env smoke. Run npm run operator:smoke -- --with-vercel-env to check Production/Preview env parity without reading values.");
}
if (!includeStripeLive) {
  console.log("Skipped live Stripe smoke. Run npm run operator:smoke -- --with-stripe-live to verify product, price, webhook, and Customer Portal readiness without creating charges.");
}
