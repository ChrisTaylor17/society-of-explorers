import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(join(root, relativePath), "utf8");
}

const [helper, checkout, portal, upgrade, runbook] = await Promise.all([
  source("src/lib/billing/stripe.ts"),
  source("src/app/api/billing/checkout/route.ts"),
  source("src/app/api/billing/portal/route.ts"),
  source("src/components/prompts/UpgradeDialog.tsx"),
  source("docs/deployment-runbook.md"),
]);

assert.match(helper, /import "server-only"/);
assert.match(helper, /LOCAL_HOSTS/);
assert.match(helper, /secret\.startsWith\("sk_live_"\)/);
assert.match(helper, /live Stripe credentials cannot be used with a local origin/);
assert.match(helper, /NEXT_PUBLIC_SITE_URL \|\| request\.nextUrl\.origin/);
assert.match(helper, /isStripeCheckoutUrl/);
assert.match(helper, /url\.hostname === "checkout\.stripe\.com"/);

for (const [name, route] of [
  ["checkout", checkout],
  ["portal", portal],
]) {
  assert.match(route, /checkoutBaseUrl\(request\)/, `${name} must derive its return URL safely`);
  assert.match(route, /blockLocalLiveStripe\(request, baseUrl/, `${name} must call the live-mode guard`);
  assert.ok(
    route.indexOf("blockLocalLiveStripe(request, baseUrl") < route.indexOf("getSupabaseAdmin()"),
    `${name} must block before private database work`,
  );
  assert.ok(
    route.indexOf("blockLocalLiveStripe(request, baseUrl") < route.indexOf("getStripe()"),
    `${name} must block before Stripe work`,
  );
}

assert.match(checkout, /success_url: `\$\{baseUrl\}/);
assert.match(checkout, /cancel_url: `\$\{baseUrl\}/);
assert.match(checkout, /!isStripeCheckoutUrl\(checkout\.url\)/);
assert.match(checkout, /function checkoutJson/);
assert.match(checkout, /"Cache-Control": "private, no-store"/);
assert.match(checkout, /checkout session failed/);
assert.match(portal, /return_url: baseUrl/);
assert.match(upgrade, /destination\.hostname !== "checkout\.stripe\.com"/);
assert.match(runbook, /operator:smoke/);

console.log("Prompt Atlas checkout safety smoke checks passed.");
