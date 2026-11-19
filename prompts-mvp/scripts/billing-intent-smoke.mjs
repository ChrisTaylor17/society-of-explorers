import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(join(root, relativePath), "utf8");
}

const [atlas, authDialog, callback, header, workspace] = await Promise.all([
  source("src/components/prompts/PromptAtlas.tsx"),
  source("src/components/auth/AuthDialog.tsx"),
  source("src/app/auth/callback/route.ts"),
  source("src/components/prompts/SiteHeader.tsx"),
  source("src/components/prompts/PromptWorkspace.tsx"),
]);

assert.match(atlas, /url\.searchParams\.set\("intent", UPGRADE_INTENT\)/);
assert.match(atlas, /returnTo=\{upgradeIntentPending \? "\/\?intent=upgrade" : "\/"\}/);
assert.match(atlas, /if \(payload\.member\) consumeUpgradeIntent\(\)/);
assert.match(atlas, /url\.searchParams\.delete\("intent"\)/);
assert.match(atlas, /setUpgradeOpen\(true\)/);
assert.match(atlas, /onRequireAuth=\{requireAuthForUpgrade\}/);
assert.match(atlas, /onViewPlan=\{upgrade\}/);

assert.match(header, /onViewPlan\(\): void/);
assert.match(
  header,
  /!member \|\| \(member\.tier === "free" && member\.canStartCheckout\)/,
);
assert.match(header, /"View Prompt Atlas Pro plan"/);
assert.match(header, /"Restart Prompt Atlas Pro"/);
assert.match(header, /const proActionLabel = isRestartingPro \? "Restart Pro" : "View Pro"/);
assert.match(header, /onClick=\{onViewPlan\}/);
assert.doesNotMatch(header, /\/api\/billing\/checkout|window\.location\.assign/);

assert.match(
  workspace,
  /const freeAllowanceUsed = member\?\.tier === "free" && runsRemaining === 0/,
);
assert.match(workspace, /member\.canManageBilling/);
assert.match(workspace, /member\.canStartCheckout/);
assert.match(workspace, /"Manage plan to keep exploring"/);
assert.match(workspace, /"Restart Pro to keep exploring"/);
assert.match(workspace, /"View Pro to keep exploring"/);
assert.match(workspace, /onClick=\{freeAllowanceUsed \? onUpgrade : beginExploration\}/);
assert.match(
  workspace,
  /disabled=\{running \|\| \(!freeAllowanceUsed && !promptText\.trim\(\)\)\}/,
);
assert.match(workspace, /if \(payload\?\.code === "quota_exceeded"\) onUpgrade\(\)/);

assert.match(authDialog, /returnTo\?: string/);
assert.match(authDialog, /encodeURIComponent\(returnTo\)/);
assert.equal(
  authDialog.match(/encodeURIComponent\(returnTo\)/g)?.length,
  2,
  "Email and Google auth must preserve the same upgrade return intent.",
);

assert.match(callback, /safeDestination/);
assert.match(callback, /!value\?\.startsWith\("\/"\)/);
assert.match(callback, /value\.startsWith\("\/\/"\)/);
assert.match(callback, /value\.includes\("\\\\"\)/);
assert.match(callback, /destination\.origin === requestOrigin/);

const requireAuthStart = atlas.indexOf("function requireAuthForUpgrade()");
const requireAuthEnd = atlas.indexOf("\n  function closeAuth()", requireAuthStart);
const requireAuthFlow = atlas.slice(requireAuthStart, requireAuthEnd);
assert.doesNotMatch(requireAuthFlow, /\/api\/billing\/checkout|window\.location\.assign/);

console.log("Prompt Atlas upgrade intent smoke checks passed.");
