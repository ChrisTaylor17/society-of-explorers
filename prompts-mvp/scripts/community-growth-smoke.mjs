import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(join(root, relativePath), "utf8");
}

const [community, atlas, operatorSmoke, readme] = await Promise.all([
  source("src/components/prompts/CommunityView.tsx"),
  source("src/components/prompts/PromptAtlas.tsx"),
  source("scripts/operator-smoke.mjs"),
  source("README.md"),
]);

assert.match(community, /member: MemberSummary \| null/);
assert.match(community, /onCreate\(\): void/);
assert.match(community, /onDiscover\(\): void/);
assert.match(community, /onViewPlan\(\): void/);
assert.match(community, /type LeaderboardMode = "momentum" \| "runs" \| "saves" \| "signals"/);
assert.match(community, /useState<LeaderboardMode>\("momentum"\)/);
assert.match(community, /const totalRuns = prompts\.reduce/);
assert.match(community, /const totalSaves = prompts\.reduce/);
assert.match(community, /const totalSignals = prompts\.reduce/);
assert.match(community, /const fastestMover = momentumRanked\[0\]/);
assert.match(community, /const mostSaved =/);
assert.match(community, /const mostSignaled =/);
assert.match(community, /\.find\(\(prompt\) => \(prompt\.favorite_count \?\? 0\) > 0\)/);
assert.match(community, /Saving signal is warming up/);
assert.match(community, /Signals are still gathering/);
assert.match(community, /Market signals/);
assert.match(community, /Category demand from public prompt activity only/);
assert.match(community, /Sort community leaderboard by \$\{mode\.id\}/);
assert.match(community, /activeMode\.description/);
assert.match(community, /member\?\.tier !== "explorer_pro"/);
assert.match(community, /Create prompt/);
assert.match(community, /View Pro/);
assert.match(community, /Discover prompts/);
assert.match(community, /signals/);
assert.match(community, /Ranked by aggregate runs, saves, and signals/);
assert.doesNotMatch(community, /prompt\.prompt_text/);
assert.doesNotMatch(community, /created_by|member_id|stripe_/);

assert.match(atlas, /member=\{member\}/);
assert.match(atlas, /onCreate=\{\(\) => navigate\("create"\)\}/);
assert.match(atlas, /onDiscover=\{\(\) => navigate\("discover"\)\}/);
assert.match(atlas, /onViewPlan=\{upgrade\}/);

assert.match(operatorSmoke, /"community-growth-smoke\.mjs"/);
assert.match(readme, /npm run community:growth:smoke/);

console.log("Prompt Atlas community growth smoke checks passed.");
