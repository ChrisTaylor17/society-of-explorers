import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(join(root, relativePath), "utf8");
}

function catalogSlugs(sourceText) {
  return [...sourceText.matchAll(/slug: "([^"]+)"/g)].map((match) => match[1]);
}

const expansionSlugs = [
  "price-this-offer-without-apology",
  "find-my-first-ten-customers",
  "write-a-landing-page-that-earns-trust",
  "turn-community-energy-into-a-paid-ritual",
  "decide-what-to-make-free",
  "design-a-privacy-first-data-bargain",
  "recover-a-churn-risk-member",
  "choose-the-right-paid-tier",
];

const seedMirrorSlugs = [
  "make-the-meeting-worth-having",
  "notice-what-gives-energy",
  "steelman-the-other-side",
  "protect-a-deep-work-window",
  "write-a-respectful-no",
  "find-the-smallest-honest-offer",
  "plan-a-community-ritual",
  "end-the-day-without-carrying-it",
];

const [
  catalog,
  seed,
  expansionMigration,
  atlas,
  discoveryCanvas,
  promptWorkspace,
  launchSignals,
  uiSmoke,
  operatorSmoke,
  readme,
  runbook,
] = await Promise.all([
  source("src/lib/prompts/catalog.ts"),
  source("supabase/seed.sql"),
  source("supabase/migrations/202606180007_prompt_catalog_expansion.sql"),
  source("src/components/prompts/PromptAtlas.tsx"),
  source("src/components/prompts/DiscoveryCanvas.tsx"),
  source("src/components/prompts/PromptWorkspace.tsx"),
  source("src/lib/prompts/launchSignals.ts"),
  source("scripts/ui-smoke.mjs"),
  source("scripts/operator-smoke.mjs"),
  source("README.md"),
  source("docs/deployment-runbook.md"),
]);

const slugs = catalogSlugs(catalog);
assert(slugs.length >= 33, `Expected at least 33 fallback prompts, found ${slugs.length}.`);
assert.equal(new Set(slugs).size, slugs.length, "Fallback prompt slugs must be unique.");

for (const slug of [...seedMirrorSlugs, ...expansionSlugs]) {
  assert(slugs.includes(slug), `Missing fallback prompt: ${slug}`);
  assert(seed.includes(`'${slug}'`), `Missing seed prompt: ${slug}`);
}

for (const slug of expansionSlugs) {
  assert(
    expansionMigration.includes(`'${slug}'`),
    `Missing expansion migration prompt: ${slug}`,
  );
}

for (const slug of [
  "find-the-smallest-honest-offer",
  "price-this-offer-without-apology",
  "find-my-first-ten-customers",
  "write-a-landing-page-that-earns-trust",
]) {
  assert(atlas.includes(`slug: "${slug}"`), `Revenue path is missing ${slug}.`);
}

assert.match(catalog, /price this offer without shrinking from the value/i);
assert.match(catalog, /privacy-first data bargain/i);
assert.match(catalog, /no-pressure message/i);
assert.doesNotMatch(catalog.toLowerCase(), /guaranteed profit|get rich|dark pattern|trick users/);
assert.match(atlas, /const LAUNCH_PATH_STEPS/);
assert.match(discoveryCanvas, /Revenue path/);
assert.match(discoveryCanvas, /interface GuidedPathStep/);
assert.match(discoveryCanvas, /Profit loop/);
assert.match(discoveryCanvas, /Proof to collect/);
assert.match(promptWorkspace, /Launch path/);
assert.match(promptWorkspace, /onSelectPrompt/);
assert.match(promptWorkspace, /Target artifact/);
assert.match(launchSignals, /find-the-smallest-honest-offer/);
assert.match(launchSignals, /Proof to collect|proof:/);
assert.match(launchSignals, /Public signals stay aggregate|CATEGORY_SIGNALS/);
assert.match(uiSmoke, /Price this offer without apology/);
assert.match(uiSmoke, /Profit loop/);
assert.match(uiSmoke, /Launch path 4: Write a landing page that earns trust/);
assert.match(operatorSmoke, /"prompt-catalog-smoke\.mjs"/);
assert.match(readme, /npm run prompt:catalog:smoke/);
assert.match(runbook, /202606180007_prompt_catalog_expansion\.sql/);

console.log("Prompt Atlas catalog smoke checks passed.");
