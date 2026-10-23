import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(projectRoot, "..");
const expectedWebhookEvents = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.deleted",
  "customer.subscription.updated",
];

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .flatMap((line) => {
        const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (!match) return [];
        const value = match[2].trim().replace(/^['"]|['"]$/g, "");
        return value ? [[match[1], value]] : [];
      }),
  );
}

const fileEnv = Object.assign(
  {},
  readEnvFile(resolve(repoRoot, ".env")),
  readEnvFile(resolve(repoRoot, ".env.production")),
  readEnvFile(resolve(repoRoot, ".env.local")),
  readEnvFile(resolve(projectRoot, ".env.local")),
  readEnvFile(resolve(projectRoot, ".vercel/.env.production.local")),
);

function env(name) {
  return process.env[name] || fileEnv[name] || "";
}

const stripeSecretKey = env("STRIPE_SECRET_KEY");
const priceId = env("STRIPE_PROMPTS_PRO_PRICE_ID");
const siteUrl = env("NEXT_PUBLIC_SITE_URL").replace(/\/$/, "");
assert(stripeSecretKey, "STRIPE_SECRET_KEY is missing.");
assert(priceId, "STRIPE_PROMPTS_PRO_PRICE_ID is missing.");
assert(siteUrl && new URL(siteUrl).protocol === "https:", "NEXT_PUBLIC_SITE_URL must be an HTTPS origin.");

const stripe = new Stripe(stripeSecretKey, { maxNetworkRetries: 2 });
const price = await stripe.prices.retrieve(priceId, { expand: ["product"] });
const product = typeof price.product === "string" ? null : price.product;
assert.equal(price.id, priceId);
assert.equal(price.active, true);
assert.equal(price.type, "recurring");
assert.equal(price.billing_scheme, "per_unit");
assert.equal(price.unit_amount, 1200);
assert.equal(price.currency, "usd");
assert.equal(price.recurring?.interval, "month");
assert.equal(price.recurring?.interval_count, 1);
assert.equal(price.recurring?.usage_type, "licensed");
assert.equal(price.custom_unit_amount, null);
assert(product, "Prompt Atlas price must expand to a product.");
assert.equal(product.active, true);
assert.equal(product.name, "Prompt Atlas Pro");

const webhookUrl = `${siteUrl}/api/billing/webhook`;
const matchingEndpoints = [];
for await (const endpoint of stripe.webhookEndpoints.list({ limit: 100 })) {
  if (endpoint.url === webhookUrl) matchingEndpoints.push(endpoint);
}
const enabledEndpoints = matchingEndpoints.filter((endpoint) => endpoint.status === "enabled");
assert.equal(enabledEndpoints.length, 1, `Expected exactly one enabled webhook endpoint for ${webhookUrl}.`);
const enabledEvents = new Set(enabledEndpoints[0].enabled_events);
for (const event of expectedWebhookEvents) {
  assert(enabledEvents.has(event), `Webhook endpoint is missing ${event}.`);
}

const portalConfigs = [];
for await (const config of stripe.billingPortal.configurations.list({ limit: 100 })) {
  if (config.active) portalConfigs.push(config);
}
assert(portalConfigs.length > 0, "Stripe Customer Portal has no active configuration.");
assert(
  portalConfigs.some((config) => config.features?.payment_method_update?.enabled),
  "Stripe Customer Portal must allow payment method updates.",
);
assert(
  portalConfigs.some((config) => config.features?.subscription_cancel?.enabled),
  "Stripe Customer Portal must allow subscription cancellation.",
);

console.log("Prompt Atlas live Stripe readiness checks passed.");
