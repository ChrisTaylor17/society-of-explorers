import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(join(root, relativePath), "utf8");
}

const [types, catalog, promptsRoute, communityRoute, signalRoute, atlas, community, workspace, card] =
  await Promise.all([
    source("src/lib/prompts/types.ts"),
    source("src/lib/prompts/catalog.ts"),
    source("src/app/api/prompts/route.ts"),
    source("src/app/api/community/route.ts"),
    source("src/app/api/prompts/[id]/signal/route.ts"),
    source("src/components/prompts/PromptAtlas.tsx"),
    source("src/components/prompts/CommunityView.tsx"),
    source("src/components/prompts/PromptWorkspace.tsx"),
    source("src/components/prompts/PromptCard.tsx"),
  ]);

assert.doesNotMatch(types, /created_by/);
assert.doesNotMatch(catalog, /created_by/);
assert.doesNotMatch(promptsRoute, /\.select\("\*"\)/);
assert.doesNotMatch(promptsRoute, /select\([\s\S]{0,160}created_by/);
assert.match(promptsRoute, /created_by: member\.id/);

assert.doesNotMatch(communityRoute, /\.select\("\*"\)/);
assert.match(communityRoute, /favorite_count, vote_count, momentum/);
assert.match(signalRoute, /function privateJson/);
assert.match(signalRoute, /"Cache-Control", "private, no-store, max-age=0"/);
assert.match(signalRoute, /"Vary", "Cookie, Authorization"/);
assert.ok(
  signalRoute.indexOf("getAuthenticatedMember") < signalRoute.indexOf(".from(\"prompt_votes\")"),
  "signal route must authenticate before writing a vote",
);
assert.match(signalRoute, /\.from\("prompts"\)/);
assert.match(signalRoute, /\.select\("id"\)/);
assert.match(signalRoute, /\.eq\("visibility", "public"\)/);
assert.match(signalRoute, /\.not\("published_at", "is", null\)/);
assert.match(signalRoute, /\.from\("prompt_votes"\)/);
assert.match(signalRoute, /\.upsert\(/);
assert.match(signalRoute, /\.delete\(\)/);
assert.doesNotMatch(signalRoute, /prompt_text|created_by|stripe_/);
assert.match(atlas, /fetch\("\/api\/community", \{ cache: "no-store" \}\)/);
assert.match(atlas, /const promptsById = new Map/);
assert.match(atlas, /fetch\(`\/api\/prompts\/\$\{selected\.id\}\/signal`/);
assert.match(promptsRoute, /\.from\("prompt_votes"\)/);
assert.match(promptsRoute, /signaled: signals\.has\(prompt\.id\)/);
assert.match(community, /right\.momentum \?\? right\.usage_count/);
assert.match(community, /function metricSummary/);
assert.match(community, /formatCompactNumber\(prompt\.favorite_count \?\? 0\)/);
assert.match(community, /formatCompactNumber\(prompt\.vote_count \?\? 0\)/);
assert.match(community, /Category demand from public prompt activity only/);
assert.match(community, /without harvesting private context/);
assert.match(workspace, /promptId: prompt\.id/);
assert.match(workspace, /Signal prompt/);
assert.match(card, /Signal this prompt/);

console.log("Prompt Atlas community privacy smoke checks passed.");
