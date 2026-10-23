import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(join(root, relativePath), "utf8");
}

const [
  atlas,
  card,
  workspace,
  route,
  shareLib,
  ogImage,
  promptsRoute,
  uiSmoke,
  operatorSmoke,
  readme,
] = await Promise.all([
  source("src/components/prompts/PromptAtlas.tsx"),
  source("src/components/prompts/PromptCard.tsx"),
  source("src/components/prompts/PromptWorkspace.tsx"),
  source("src/app/p/[slug]/page.tsx"),
  source("src/lib/prompts/share.ts"),
  source("src/app/p/[slug]/opengraph-image.tsx"),
  source("src/app/api/prompts/route.ts"),
  source("scripts/ui-smoke.mjs"),
  source("scripts/operator-smoke.mjs"),
  source("README.md"),
]);

assert.match(atlas, /function promptKeyFromLocation\(\): string \| null/);
assert.match(atlas, /function safeDecode\(value: string\): string/);
assert.match(atlas, /const url = new URL\(window\.location\.href\)/);
assert.match(atlas, /url\.searchParams\.get\("prompt"\)/);
assert.match(atlas, /url\.pathname\.match/);
assert.match(atlas, /\^\\\/p\\\/\(\[\^\/\]\+\)\$/);
assert.match(atlas, /promptParams\.set\("prompt", promptKey\)/);
assert.match(atlas, /fetch\(`\/api\/prompts\?\$\{promptParams\.toString\(\)\}`\)/);
assert.match(atlas, /function findPromptByKey\(prompts: PromptRecord\[\], key: string \| null\)/);
assert.match(atlas, /\[prompt\.slug, prompt\.id\]/);
assert.match(atlas, /function shareUrlForPrompt\(prompt: PromptRecord\): string/);
assert.match(atlas, /new URL\(`\/p\/\$\{encodeURIComponent\(key\)\}`/);
assert.match(atlas, /await navigator\.clipboard\.writeText\(value\)/);
assert.match(atlas, /document\.execCommand\("copy"\)/);
assert.match(atlas, /navigator\.share/);
assert.match(atlas, /setSharedPromptId\(prompt\.id\)/);
assert.doesNotMatch(atlas, /prompt_text.*share|context.*share|\/api\/.*share/);

assert.match(card, /Copy share link for/);
assert.match(card, /Share link copied/);
assert.match(card, /Share2/);
assert.match(workspace, /Share prompt/);
assert.match(workspace, /Link copied/);

assert.match(route, /import type \{ Metadata \} from "next"/);
assert.match(route, /params: Promise<\{ slug: string \}>/);
assert.match(route, /findPublicPromptForShare/);
assert.match(route, /export async function generateMetadata/);
assert.match(route, /alternates: \{ canonical \}/);
assert.match(route, /openGraph: \{/);
assert.match(route, /twitter: \{/);
assert.match(route, /summary_large_image/);
assert.match(route, /\/p\/\$\{encodeURIComponent\(key\)\}\/opengraph-image/);
assert.match(route, /PromptAtlas initialPrompts/);
assert.doesNotMatch(route, /prompt_text|created_by|member_id|stripe_/i);
assert.doesNotMatch(route, /redirect\(/);

assert.match(shareLib, /export const promptShareSelect = "id, slug, title, description, category, usage_count"/);
assert.match(shareLib, /export async function findPublicPromptForShare/);
assert.match(shareLib, /\.select\(promptShareSelect\)/);
assert.match(shareLib, /\.eq\("visibility", "public"\)/);
assert.match(shareLib, /\.not\("published_at", "is", null\)/);
assert.match(shareLib, /\.lte\("published_at", new Date\(\)\.toISOString\(\)\)/);
assert.match(shareLib, /\.maybeSingle<SharePromptMetadata>\(\)/);
assert.doesNotMatch(shareLib, /prompt_text|created_by|member_id|stripe_/i);

assert.match(ogImage, /ImageResponse/);
assert.match(ogImage, /findPublicPromptForShare/);
assert.match(ogImage, /Prompt Atlas/);
assert.match(ogImage, /usage_count\.toLocaleString/);
assert.doesNotMatch(ogImage, /prompt_text|created_by|member_id|stripe_/i);

assert.match(promptsRoute, /const promptKey = promptKeySchema\.parse/);
assert.match(promptsRoute, /rows\.some\(\(prompt\) => prompt\.slug === promptKey \|\| prompt\.id === promptKey\)/);
assert.match(promptsRoute, /\.eq\("visibility", "public"\)/);
assert.match(promptsRoute, /\.not\("published_at", "is", null\)/);
assert.match(promptsRoute, /\.eq\("slug", promptKey\)/);
assert.doesNotMatch(promptsRoute, /promptKey[\s\S]{0,500}\.select\("\*"\)/);

assert.match(uiSmoke, /\/p\/create-a-one-page-business/);
assert.match(uiSmoke, /Copy share link for Create a one-page business/);
assert.match(uiSmoke, /clean prompt path/);
assert.match(operatorSmoke, /"prompt-share-smoke\.mjs"/);
assert.match(readme, /npm run prompt:share:smoke/);

console.log("Prompt Atlas share-link smoke checks passed.");
