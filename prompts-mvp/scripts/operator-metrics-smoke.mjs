import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(join(root, relativePath), "utf8");
}

const [migration, access, route, metrics, dashboard, page, env, runbook] = await Promise.all([
  source("supabase/migrations/202606180006_prompt_operator_metrics.sql"),
  source("src/lib/operator/access.ts"),
  source("src/app/api/operator/metrics/route.ts"),
  source("src/lib/operator/metrics.ts"),
  source("src/components/operator/OperatorDashboard.tsx"),
  source("src/app/operator/page.tsx"),
  source(".env.example"),
  source("docs/deployment-runbook.md"),
]);

assert.match(migration, /get_prompt_atlas_operator_metrics/);
assert.match(migration, /security invoker/);
assert.match(migration, /set search_path = public/);
assert.match(migration, /revoke all on function public\.get_prompt_atlas_operator_metrics\(\) from public/);
assert.match(migration, /grant execute on function public\.get_prompt_atlas_operator_metrics\(\) to service_role/);
assert.match(migration, /jsonb_build_object/);
assert.match(migration, /paidConversionPercent/);
assert.match(migration, /estimatedModelContributionCents/);
assert.match(migration, /estimatedMtdSubscriptionRevenueCents/);
assert.match(migration, /subscriptionRunRateCents/);
assert.doesNotMatch(migration, /from public\.members/);
for (const privateField of ["display_name", "email", "wallet_address", "prompt_text", "input_hash"]) {
  assert.doesNotMatch(migration, new RegExp(`\\b${privateField}\\b`, "i"));
}

assert.match(access, /import "server-only"/);
assert.match(access, /process\.env\.SOE_ADMIN_EMAILS \|\| ""/);
assert.match(access, /trim\(\)\.toLowerCase\(\)/);
assert.doesNotMatch(access, /chris@|christaylor/i);

assert.ok(
  route.indexOf("getAuthenticatedMember(request)") <
    route.indexOf('rpc(\n    "get_prompt_atlas_operator_metrics"'),
  "operator metrics must authenticate and authorize before the aggregate RPC",
);
assert.match(route, /isPromptAtlasOperator\(member\)/);
assert.match(route, /normalizePromptAtlasOperatorMetrics\(data\)/);
assert.match(route, /Cache-Control": "private, no-store, max-age=0"/);
assert.match(route, /Vary: "Cookie, Authorization"/);
assert.match(route, /X-Robots-Tag": "noindex, nofollow"/);
assert.match(route, /X-Content-Type-Options": "nosniff"/);
assert.doesNotMatch(route, /stripe/i);

assert.match(metrics, /PromptAtlasOperatorMetrics/);
assert.match(metrics, /Number\.isFinite/);
assert.match(dashboard, /fetch\("\/api\/operator\/metrics"/);
assert.match(dashboard, /cache: "no-store"/);
assert.match(dashboard, /Not profit\./);
assert.match(dashboard, /prorated month-to-date subscription revenue/);
assert.match(dashboard, /Aggregate by design/);
assert.match(dashboard, /Launch board/);
assert.match(dashboard, /What to do before buying attention/);
assert.match(dashboard, /MRR target/);
assert.match(dashboard, /Run economics/);
assert.match(dashboard, /Next operator moves/);
assert.match(dashboard, /More paid seats needed to reach a \$1,000 monthly subscription run rate/);
assert.match(dashboard, /10\/hour pace keep unlimited Pro bounded/);
assert.match(dashboard, /sends no\s+analytics event/);
assert.doesNotMatch(dashboard, /setInterval|localStorage|sessionStorage/);
for (const privateField of [
  "member\\.email",
  "wallet_address",
  "prompt_text",
  "input_hash",
  "stripe_customer",
  "stripe_subscription",
]) {
  assert.doesNotMatch(dashboard, new RegExp(privateField, "i"));
}
assert.match(page, /robots: \{ index: false, follow: false, noarchive: true \}/);
assert.match(env, /SOE_ADMIN_EMAILS=/);
assert.match(runbook, /202606180006_prompt_operator_metrics\.sql/);

console.log("Prompt Atlas aggregate operator metrics smoke checks passed.");
