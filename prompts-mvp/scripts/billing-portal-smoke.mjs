import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(join(root, relativePath), "utf8");
}

const [header, atlas, notice, portal, stripe, session, types] = await Promise.all([
  source("src/components/prompts/SiteHeader.tsx"),
  source("src/components/prompts/PromptAtlas.tsx"),
  source("src/components/prompts/BillingPortalErrorNotice.tsx"),
  source("src/app/api/billing/portal/route.ts"),
  source("src/lib/billing/stripe.ts"),
  source("src/app/api/auth/session/route.ts"),
  source("src/lib/prompts/types.ts"),
]);

assert.match(header, /member\.canManageBilling/);
assert.match(header, /billingActionCopy/);
assert.match(header, /timeZone: "UTC"/);
assert.match(header, /Pro through/);
assert.match(header, /Trial ends/);
assert.match(header, /Renews/);
assert.match(header, /Billing needs attention/);
assert.match(header, /onClick=\{onManagePlan\}/);
assert.match(header, /billingPortalBusy/);

assert.match(session, /cancel_at_period_end/);
assert.match(session, /const billingState: PromptBillingState/);
for (const state of ["none", "renews", "trial_ends", "access_ends", "attention", "inactive"]) {
  assert.match(session, new RegExp(`"${state}"`));
  assert.match(types, new RegExp(`\\| "${state}"|= "${state}"`));
}
assert.match(session, /currentPeriodEnd/);
assert.match(session, /Cache-Control": "private, no-store"/);
assert.match(types, /billingState: PromptBillingState/);
assert.match(types, /currentPeriodEnd: string \| null/);
assert.doesNotMatch(types, /subscriptionStatus/);
assert.match(atlas, /billingState: payload\.entitlement\.billingState/);
assert.match(atlas, /currentPeriodEnd: payload\.entitlement\.currentPeriodEnd/);

assert.match(atlas, /fetch\("\/api\/billing\/portal", \{ method: "POST" \}\)/);
assert.match(atlas, /destination\.protocol !== "https:"/);
assert.match(atlas, /destination\.hostname !== "billing\.stripe\.com"/);
assert.match(atlas, /window\.location\.assign\(destination\.toString\(\)\)/);
assert.match(atlas, /setBillingPortalError\(true\)/);

assert.match(notice, /role="alert"/);
assert.match(notice, /Your plan was not changed\./);
assert.match(notice, /Try again/);

assert.ok(
  portal.indexOf("getAuthenticatedMember(request)") <
    portal.indexOf("blockLocalLiveStripe(request, baseUrl"),
  "portal must authenticate before checking Stripe mode",
);
assert.ok(
  portal.indexOf("blockLocalLiveStripe(request, baseUrl") <
    portal.indexOf("billingPortal.sessions.create"),
  "portal must run the local live-mode guard before Stripe",
);
assert.match(portal, /portalJson/);
assert.match(portal, /Cache-Control": "private, no-store"/);
assert.match(portal, /isStripePortalUrl\(portal\.url\)/);
assert.match(portal, /portalError instanceof Error \? portalError\.name : "unknown"/);

assert.match(stripe, /url\.hostname === "billing\.stripe\.com"/);
assert.match(stripe, /url\.protocol === "https:"/);

console.log("Prompt Atlas billing portal smoke checks passed.");
