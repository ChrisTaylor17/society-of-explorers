import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(join(root, relativePath), "utf8");
}

const [checkout, atlas, notice] = await Promise.all([
  source("src/app/api/billing/checkout/route.ts"),
  source("src/components/prompts/PromptAtlas.tsx"),
  source("src/components/prompts/BillingReturnNotice.tsx"),
]);

assert.match(checkout, /success_url: `\$\{baseUrl\}\/\?billing=success`/);
assert.match(checkout, /cancel_url: `\$\{baseUrl\}\/\?billing=cancelled`/);

assert.match(atlas, /status !== "success" && status !== "cancelled"/);
assert.match(atlas, /url\.searchParams\.delete\("billing"\)/);
assert.match(atlas, /window\.history\.replaceState/);
assert.match(atlas, /await refreshSession\(\)/);
assert.match(atlas, /confirmed=\{member\?\.tier === "explorer_pro"\}/);

assert.match(notice, /role="status"/);
assert.match(notice, /aria-live="polite"/);
assert.match(notice, /You returned from checkout/);
assert.match(notice, /server-side entitlement is confirmed/);
assert.match(notice, /Nothing changed\. Your free explorations and private prompts are still here\./);
assert.match(notice, /Check access/);
assert.match(notice, /View Pro plan/);
assert.doesNotMatch(notice, /Payment (succeeded|received|confirmed)/i);

console.log("Prompt Atlas billing return smoke checks passed.");
