import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(join(root, relativePath), "utf8");
}

const [packs, packsView, atlas, siteHeader, types, catalog, uiSmoke, operatorSmoke, readme] =
  await Promise.all([
    source("src/lib/prompts/packs.ts"),
    source("src/components/prompts/PromptPacksView.tsx"),
    source("src/components/prompts/PromptAtlas.tsx"),
    source("src/components/prompts/SiteHeader.tsx"),
    source("src/lib/prompts/types.ts"),
    source("src/lib/prompts/catalog.ts"),
    source("scripts/ui-smoke.mjs"),
    source("scripts/operator-smoke.mjs"),
    source("README.md"),
  ]);

for (const slug of [
  "find-the-smallest-honest-offer",
  "price-this-offer-without-apology",
  "find-my-first-ten-customers",
  "write-a-landing-page-that-earns-trust",
  "turn-community-energy-into-a-paid-ritual",
  "decide-what-to-make-free",
  "recover-a-churn-risk-member",
  "choose-the-right-paid-tier",
  "design-a-privacy-first-data-bargain",
  "make-this-more-generous",
  "write-a-respectful-no",
  "audit-for-sovereignty",
]) {
  assert(packs.includes(`"${slug}"`), `Prompt pack is missing ${slug}.`);
  assert(catalog.includes(`slug: "${slug}"`), `Prompt pack slug is missing from catalog: ${slug}.`);
}

assert.match(packs, /export const PROMPT_PACKS/);
assert.match(packs, /resolvePromptPacks/);
assert.match(packs, /Revenue Launch/);
assert.match(packs, /Community Market/);
assert.match(packs, /Sovereignty Audit/);
assert.match(packs, /revenueLever/);
assert.match(packs, /upgradeMoment/);
assert.match(packs, /Paid validation brief/);
assert.match(packs, /Member-value offer map/);
assert.match(packs, /Sovereignty risk brief/);
assert.doesNotMatch(packs, /guaranteed profit|get rich|dark pattern|trick users/i);

assert.match(types, /"packs"/);
assert.match(siteHeader, /label: "Packs", surface: "packs"/);
assert.match(atlas, /surface === "packs"/);
assert.match(atlas, /<PromptPacksView/);
assert.match(atlas, /setCustomize\(true\)/);
assert.match(packsView, /Free members can inspect every pack/);
assert.match(packsView, /Revenue loop/);
assert.match(packsView, /Pick the move that can become paid/);
assert.match(packsView, /No private prompt context/);
assert.match(packsView, /Inspect revenue loop/);
assert.match(packsView, /Start \{selectedPack\.title\}/);
assert.match(packsView, /View Pro/);
assert.match(packsView, /Start pack/);
assert.match(packsView, /onOpen\(prompt\)/);
assert.doesNotMatch(packsView, /prompt\.prompt_text|created_by|member_id|stripe_/);

assert.match(uiSmoke, /Prompt packs/);
assert.match(uiSmoke, /Revenue loop/);
assert.match(uiSmoke, /Inspect revenue loop/);
assert.match(uiSmoke, /Open Revenue Launch step 2: Price this offer without apology/);
assert.match(uiSmoke, /mobile-packs\.png/);
assert.match(operatorSmoke, /"prompt-packs-smoke\.mjs"/);
assert.match(readme, /npm run prompt:packs:smoke/);

console.log("Prompt Atlas prompt packs smoke checks passed.");
