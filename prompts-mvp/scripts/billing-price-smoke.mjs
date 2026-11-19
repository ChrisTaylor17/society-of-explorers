import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(join(root, relativePath), "utf8");
}

const [plan, stripe, checkout, webhook, upgrade] = await Promise.all([
  source("src/lib/billing/plan.ts"),
  source("src/lib/billing/stripe.ts"),
  source("src/app/api/billing/checkout/route.ts"),
  source("src/app/api/billing/webhook/route.ts"),
  source("src/components/prompts/UpgradeDialog.tsx"),
]);

assert.match(plan, /PROMPT_ATLAS_PRO_MONTHLY_USD = 12/);
assert.match(plan, /PROMPT_ATLAS_PRO_MONTHLY_CENTS = PROMPT_ATLAS_PRO_MONTHLY_USD \* 100/);
assert.match(plan, /PROMPT_ATLAS_PRO_CURRENCY = "usd"/);
assert.match(plan, /PROMPT_ATLAS_PRO_INTERVAL = "month"/);
assert.match(plan, /PROMPT_ATLAS_PRO_INTERVAL_COUNT = 1/);
assert.match(plan, /PROMPT_ATLAS_PRO_MONTHLY_RUNS: number \| null = null/);
assert.match(plan, /PROMPT_ATLAS_PRO_MONTHLY_RUNS_LABEL = "Unlimited"/);

assert.match(upgrade, /PROMPT_ATLAS_PRO_MONTHLY_USD/);
assert.doesNotMatch(upgrade, />\$12</);
assert.match(upgrade, /PROMPT_ATLAS_PRO_MONTHLY_RUNS_LABEL/);
assert.match(upgrade, /prompt runs each month/);
assert.match(upgrade, /starts per hour for reliable shared access/);
assert.match(upgrade, /No raw personal context added to the usage ledger/);
assert.match(upgrade, /Cancel anytime through Stripe/);
assert.doesNotMatch(upgrade, /200 prompt runs|200 explorations/);
assert.doesNotMatch(upgrade, /Private and public custom prompts/);
assert.doesNotMatch(upgrade, /Favorites and community discovery/);

for (const contract of [
  /price\.active/,
  /price\.type === "recurring"/,
  /price\.billing_scheme === "per_unit"/,
  /price\.unit_amount === PROMPT_ATLAS_PRO_MONTHLY_CENTS/,
  /price\.currency === PROMPT_ATLAS_PRO_CURRENCY/,
  /price\.recurring\?\.interval === PROMPT_ATLAS_PRO_INTERVAL/,
  /price\.recurring\.interval_count === PROMPT_ATLAS_PRO_INTERVAL_COUNT/,
  /price\.recurring\.usage_type === "licensed"/,
]) {
  assert.match(stripe, contract);
}

assert.match(checkout, /stripe\.prices\.retrieve\(priceId\)/);
assert.match(checkout, /isPromptAtlasProCheckoutPrice\(price, priceId\)/);
assert.ok(
  checkout.indexOf("isPromptAtlasProCheckoutPrice(price, priceId)") <
    checkout.indexOf("stripe.customers.create"),
  "price terms must be verified before customer creation",
);
assert.ok(
  checkout.indexOf("isPromptAtlasProCheckoutPrice(price, priceId)") <
    checkout.indexOf("checkout.sessions.create"),
  "price terms must be verified before Checkout Session creation",
);

assert.match(webhook, /matchesPromptAtlasProPriceTerms\(price, expectedPriceId\)/);
assert.ok(
  webhook.indexOf("matchesPromptAtlasProPriceTerms(price, expectedPriceId)") <
    webhook.indexOf("plan: active \? \"explorer_pro\" : \"free\""),
  "webhook must validate price terms before granting Pro",
);

console.log("Prompt Atlas billing price smoke checks passed.");
