import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(join(root, relativePath), "utf8");
}

const [checkout, session, atlas, header, upgrade, types, plan] = await Promise.all([
  source("src/app/api/billing/checkout/route.ts"),
  source("src/app/api/auth/session/route.ts"),
  source("src/components/prompts/PromptAtlas.tsx"),
  source("src/components/prompts/SiteHeader.tsx"),
  source("src/components/prompts/UpgradeDialog.tsx"),
  source("src/lib/prompts/types.ts"),
  source("src/lib/billing/plan.ts"),
]);

for (const status of ["active", "trialing", "past_due", "unpaid", "incomplete", "paused"]) {
  assert.match(plan, new RegExp(`"${status}"`));
}
assert.match(checkout, /stripe_subscription_id, subscription_status/);
assert.match(checkout, /promptAtlasSubscriptionBlocksCheckout\(entitlement\.subscription_status\)/);
assert.match(checkout, /code: "subscription_exists"/);
assert.match(checkout, /409,/);
assert.ok(
  checkout.indexOf("promptAtlasSubscriptionBlocksCheckout(entitlement.subscription_status)") <
    checkout.indexOf("checkout.sessions.create"),
  "existing subscriptions must be rejected before Checkout Session creation",
);
assert.match(checkout, /Math\.floor\(Date\.now\(\) \/ \(30 \* 60 \* 1000\)\)/);
assert.match(checkout, /idempotencyKey: `prompt-atlas:checkout:/);

assert.match(session, /canManageBilling: false/);
assert.match(session, /canStartCheckout: true/);
assert.match(session, /const hasSubscription = Boolean\(entitlement\?\.stripe_subscription_id\)/);
assert.match(session, /hasSubscription && promptAtlasSubscriptionBlocksCheckout/);
assert.match(session, /canManageBilling: hasSubscription/);
assert.match(session, /canStartCheckout: !checkoutBlocked/);
assert.match(types, /canManageBilling: boolean/);
assert.match(types, /canStartCheckout: boolean/);
assert.match(atlas, /canManageBilling: payload\.entitlement\.canManageBilling/);
assert.match(atlas, /canStartCheckout: payload\.entitlement\.canStartCheckout/);
assert.match(atlas, /member\?\.canManageBilling && !member\.canStartCheckout/);
assert.match(header, /member\.canManageBilling/);
assert.match(header, /member\.canStartCheckout/);
assert.match(header, /member\.tier === "explorer_pro"/);
assert.match(upgrade, /mustManageExistingPlan/);
assert.match(upgrade, /isRestarting/);
assert.match(upgrade, /onManagePlan\(\)/);
assert.match(upgrade, /Manage existing plan/);
assert.match(upgrade, /Your previous plan is no longer active/);
assert.match(upgrade, /Restart Pro with secure checkout/);

console.log("Prompt Atlas duplicate subscription smoke checks passed.");
