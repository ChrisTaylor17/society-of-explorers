import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(join(root, relativePath), "utf8");
}

const [checkout, portal, webhook] = await Promise.all([
  source("src/app/api/billing/checkout/route.ts"),
  source("src/app/api/billing/portal/route.ts"),
  source("src/app/api/billing/webhook/route.ts"),
]);

assert.match(checkout, /error: entitlementError/);
assert.match(checkout, /idempotencyKey: `prompt-atlas:customer:/);
assert.match(checkout, /error: customerError/);
assert.match(checkout, /Billing is unavailable right now\./);

assert.match(portal, /\{ data, error \}/);
assert.match(portal, /if \(error\)/);

assert.match(webhook, /STRIPE_PROMPTS_PRO_PRICE_ID/);
assert.match(webhook, /product !== "prompt_atlas"/);
assert.match(webhook, /matchesPromptAtlasProPriceTerms\(price, expectedPriceId\)/);
assert.match(webhook, /error\) throw new Error\("Prompt Atlas entitlement persistence failed\."\)/);
assert.match(webhook, /error\) throw new Error\("Prompt Atlas customer persistence failed\."\)/);
assert.match(webhook, /if \(session\.metadata\?\.product !== "prompt_atlas"\) break/);
assert.match(webhook, /getStripe\(\)\.subscriptions\.retrieve\(subscriptionId\)/);
assert.ok(
  webhook.indexOf("Prompt Atlas entitlement persistence failed.") <
    webhook.indexOf("return NextResponse.json({ received: true })"),
  "webhook persistence must fail before the event is acknowledged",
);

console.log("Prompt Atlas billing integrity smoke checks passed.");
