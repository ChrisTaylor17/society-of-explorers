import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(join(root, relativePath), "utf8");
}

const [stripe, webhook] = await Promise.all([
  source("src/lib/billing/stripe.ts"),
  source("src/app/api/billing/webhook/route.ts"),
]);

const termsStart = stripe.indexOf("export function matchesPromptAtlasProPriceTerms");
const checkoutStart = stripe.indexOf("export function isPromptAtlasProCheckoutPrice");
assert.notEqual(termsStart, -1);
assert.notEqual(checkoutStart, -1);

const termsContract = stripe.slice(termsStart, checkoutStart);
const checkoutContract = stripe.slice(checkoutStart);
assert.doesNotMatch(
  termsContract,
  /price\.active/,
  "archiving a price must not invalidate existing subscriptions",
);
assert.match(checkoutContract, /return price\.active && matchesPromptAtlasProPriceTerms/);

assert.match(webhook, /subscription\.items\.data\.length === 1/);
assert.match(webhook, /!subscription\.items\.has_more/);
assert.match(webhook, /item\?\.quantity === 1/);
assert.match(webhook, /const active = eligiblePrice && \["active", "trialing"\]/);
assert.ok(
  webhook.indexOf("subscription no longer matches Prompt Atlas terms") <
    webhook.indexOf('plan: active ? "explorer_pro" : "free"'),
  "unsupported subscription terms must revoke Pro instead of being acknowledged unchanged",
);

assert.match(
  webhook,
  /getStripe\(\)\.subscriptions\.retrieve\(event\.data\.object\.id\)/,
);
assert.doesNotMatch(
  webhook,
  /syncSubscription\(event\.data\.object, event\.id, event\.created\)/,
);
assert.match(webhook, /getStripe\(\)\.subscriptions\.retrieve\(subscriptionId\)/);

console.log("Prompt Atlas billing lifecycle smoke checks passed.");
