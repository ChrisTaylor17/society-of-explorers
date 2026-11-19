import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];

const readText = (path) => readFileSync(join(root, path), 'utf8');
const fail = (message) => failures.push(message);
const assert = (condition, message) => {
  if (!condition) {
    fail(message);
  }
};

const packageJson = JSON.parse(readText('package.json'));
const packageScripts = packageJson.scripts ?? {};
const operatorSmokePath = 'scripts/operator-smoke.mjs';
const operatorSmoke = readText(operatorSmokePath);
const includeRoutesIndex = operatorSmoke.indexOf('if (includeRoutes)');
const optionalOperatorScripts = new Set(['capital:routes:smoke']);
const smokeCommandPattern = /^node (scripts\/[-\w]+\.mjs)$/;

assert(
  packageScripts['operator:manifest:smoke'] === 'node scripts/operator-manifest-smoke.mjs',
  'package.json must expose operator:manifest:smoke with node scripts/operator-manifest-smoke.mjs',
);
assert(
  packageScripts['prompt-atlas:verify'] === 'npm --prefix prompts-mvp run operator:smoke',
  'package.json must expose prompt-atlas:verify as the exact local Prompt Atlas operator command',
);
assert(
  packageScripts['prompt-atlas:verify:list'] === 'npm --prefix prompts-mvp run operator:smoke -- --list',
  'package.json must expose prompt-atlas:verify:list as the exact local Prompt Atlas operator plan command',
);

const promptAtlasPackageJson = JSON.parse(readText('prompts-mvp/package.json'));
const promptAtlasOperatorSmoke = readText('prompts-mvp/scripts/operator-smoke.mjs');
assert(
  promptAtlasPackageJson.scripts?.['operator:smoke'] === 'node scripts/operator-smoke.mjs',
  'prompts-mvp must expose its manifest-backed operator:smoke command',
);
assert(
  promptAtlasOperatorSmoke.includes('readdirSync(scriptsDirectory)') &&
    promptAtlasOperatorSmoke.includes('assert.deepEqual(') &&
    promptAtlasOperatorSmoke.includes('smoke manifest is stale') &&
    promptAtlasOperatorSmoke.includes('spawnSync(process.execPath') &&
    promptAtlasOperatorSmoke.includes('PROMPT_ATLAS_SMOKE_STEP_TIMEOUT_MS') &&
    promptAtlasOperatorSmoke.includes('DEFAULT_STEP_TIMEOUT_MS') &&
    promptAtlasOperatorSmoke.includes('MAX_STEP_TIMEOUT_MS') &&
    promptAtlasOperatorSmoke.includes('timeout: stepTimeoutMs') &&
    promptAtlasOperatorSmoke.includes('result.error.code === "ETIMEDOUT"') &&
    promptAtlasOperatorSmoke.includes(
      'const allowedArgs = new Set(["--list", "--with-ui", "--with-db-readiness", "--with-live-execution", "--with-vercel-env", "--with-stripe-live"])',
    ) &&
    promptAtlasOperatorSmoke.includes('Unknown Prompt Atlas operator smoke argument(s):') &&
    promptAtlasOperatorSmoke.includes(
      'Usage: npm run operator:smoke -- [--list] [--with-ui] [--with-db-readiness] [--with-live-execution] [--with-vercel-env] [--with-stripe-live]',
    ) &&
    promptAtlasOperatorSmoke.includes('optionalUiSmokeScripts') &&
    promptAtlasOperatorSmoke.includes('optionalDbReadinessSmokeScripts') &&
    promptAtlasOperatorSmoke.includes('optionalLiveExecutionSmokeScripts') &&
    promptAtlasOperatorSmoke.includes('optionalVercelEnvSmokeScripts') &&
    promptAtlasOperatorSmoke.includes('optionalStripeLiveSmokeScripts') &&
    promptAtlasOperatorSmoke.includes('ui-smoke.mjs') &&
    promptAtlasOperatorSmoke.includes('db-readiness-smoke.mjs') &&
    promptAtlasOperatorSmoke.includes('execute-live-smoke.mjs') &&
    promptAtlasOperatorSmoke.includes('prompt-catalog-smoke.mjs') &&
    promptAtlasOperatorSmoke.includes('prompt-packs-smoke.mjs') &&
    promptAtlasOperatorSmoke.includes('prompt-share-smoke.mjs') &&
    promptAtlasOperatorSmoke.includes('vercel-env-smoke.mjs') &&
    promptAtlasOperatorSmoke.includes('stripe-live-smoke.mjs') &&
    promptAtlasOperatorSmoke.includes('Optional UI smoke omitted') &&
    promptAtlasOperatorSmoke.includes('Optional database readiness smoke omitted') &&
    promptAtlasOperatorSmoke.includes('Optional live execution smoke omitted') &&
    promptAtlasOperatorSmoke.includes('Optional Vercel env smoke omitted') &&
    promptAtlasOperatorSmoke.includes('Optional live Stripe smoke omitted') &&
    promptAtlasOperatorSmoke.includes('Prompt Atlas operator smoke plan:') &&
    promptAtlasOperatorSmoke.includes('process.exit(0)'),
  'Prompt Atlas operator smoke must retain discovery, manifest alignment, local Node execution, bounded per-step timeouts, safe --list argument handling, and opt-in smoke handling',
);

const promptAtlasReadme = readText('prompts-mvp/README.md');
const promptAtlasDeploymentRunbook = readText('prompts-mvp/docs/deployment-runbook.md');
assert(
  promptAtlasReadme.includes('npm run prompt:catalog:smoke') &&
    promptAtlasReadme.includes('npm run prompt:packs:smoke') &&
    promptAtlasReadme.includes('npm run prompt:share:smoke') &&
    promptAtlasReadme.includes('prompt-pack') &&
    promptAtlasReadme.includes('share-link'),
  'Prompt Atlas README must document prompt catalog, prompt packs, and share-link smoke guards',
);
assert(
  promptAtlasDeploymentRunbook.includes('npm run prompt:catalog:smoke') &&
    promptAtlasDeploymentRunbook.includes('npm run prompt:packs:smoke') &&
    promptAtlasDeploymentRunbook.includes('npm run prompt:share:smoke') &&
    promptAtlasDeploymentRunbook.includes('prompt catalog') &&
    promptAtlasDeploymentRunbook.includes('prompt packs') &&
    promptAtlasDeploymentRunbook.includes('share links'),
  'Prompt Atlas deployment runbook must document prompt catalog, prompt packs, and share-link smoke guards',
);

const smokeScripts = Object.keys(packageScripts)
  .filter((scriptName) => scriptName.endsWith(':smoke'))
  .sort();

const operatorCommandEntries = [
  ...operatorSmoke.matchAll(/command:\s*\[\s*'npm'\s*,\s*'run'\s*,\s*'([^']+)'\s*\]/g),
].map((match) => ({
  name: match[1],
  index: match.index ?? 0,
}));

const operatorStepEntries = [
  ...operatorSmoke.matchAll(
    /\{\s*label:\s*'([^']*)'\s*,\s*command:\s*\[\s*'npm'\s*,\s*'run'\s*,\s*'([^']+)'\s*\]\s*,?\s*\}/g,
  ),
].map((match) => ({
  label: match[1],
  name: match[2],
  index: match.index ?? 0,
}));

const operatorCommands = operatorCommandEntries.map((entry) => entry.name);
const operatorCommandSet = new Set(operatorCommands);
const operatorStepLabels = operatorStepEntries.map((entry) => entry.label);
const expectedOperatorScripts = smokeScripts.filter((scriptName) => scriptName !== 'operator:smoke');
const allowedNonSmokeOperatorCommands = new Set(['prompt-atlas:verify']);
assert(
  allowedNonSmokeOperatorCommands.size === 1 && allowedNonSmokeOperatorCommands.has('prompt-atlas:verify'),
  'Prompt Atlas verify must remain the only allowed non-smoke operator command',
);
const defaultOperatorCommandSet = new Set(
  operatorCommandEntries
    .filter((entry) => includeRoutesIndex === -1 || entry.index < includeRoutesIndex)
    .map((entry) => entry.name),
);
const optInOperatorCommandSet = new Set(
  operatorCommandEntries
    .filter((entry) => includeRoutesIndex !== -1 && entry.index > includeRoutesIndex)
    .map((entry) => entry.name),
);

assert(
  operatorStepEntries.length === operatorCommandEntries.length,
  `${operatorSmokePath} must pair every operator smoke command with an adjacent step label`,
);

for (const { label, name } of operatorStepEntries) {
  assert(label.trim() !== '', `${operatorSmokePath} must give ${name} a non-empty operator smoke step label`);
}

const duplicateLabels = operatorStepLabels.filter((label, index) => operatorStepLabels.indexOf(label) !== index);

assert(
  duplicateLabels.length === 0,
  `Duplicate operator smoke step label(s): ${[...new Set(duplicateLabels)].join(', ')}`,
);

for (const scriptName of expectedOperatorScripts) {
  assert(
    operatorCommandSet.has(scriptName),
    `${scriptName} is defined in package.json but is not wired into ${operatorSmokePath}`,
  );
}

for (const commandName of operatorCommands) {
  assert(
    Boolean(packageScripts[commandName]),
    `${operatorSmokePath} runs ${commandName}, but package.json has no matching script`,
  );
  assert(
    expectedOperatorScripts.includes(commandName) || allowedNonSmokeOperatorCommands.has(commandName),
    `${operatorSmokePath} runs non-smoke command ${commandName}; add it to allowedNonSmokeOperatorCommands only if it is a manifest-backed local verification wrapper`,
  );
}

const operatorNonSmokeCommands = operatorCommands.filter((commandName) => !expectedOperatorScripts.includes(commandName));
assert(
  operatorNonSmokeCommands.length === allowedNonSmokeOperatorCommands.size &&
    operatorNonSmokeCommands.every((commandName) => allowedNonSmokeOperatorCommands.has(commandName)),
  `${operatorSmokePath} non-smoke operator command(s) must exactly match ${[
    ...allowedNonSmokeOperatorCommands,
  ].join(', ')}`,
);

for (const scriptName of expectedOperatorScripts) {
  if (optionalOperatorScripts.has(scriptName)) {
    assert(
      optInOperatorCommandSet.has(scriptName),
      `${scriptName} must stay wired as an opt-in operator smoke command`,
    );
    assert(
      !defaultOperatorCommandSet.has(scriptName),
      `${scriptName} must not run in default operator smoke because it requires localhost`,
    );
    continue;
  }

  assert(
    defaultOperatorCommandSet.has(scriptName),
    `${scriptName} must run in default operator smoke instead of an opt-in block`,
  );
}

for (const commandName of optInOperatorCommandSet) {
  assert(
    optionalOperatorScripts.has(commandName),
    `${commandName} is in an opt-in operator block but is not listed as an allowed opt-in smoke script`,
  );
}

const duplicateCommands = operatorCommands.filter(
  (commandName, index) => operatorCommands.indexOf(commandName) !== index,
);

assert(
  duplicateCommands.length === 0,
  `Duplicate operator smoke command(s): ${[...new Set(duplicateCommands)].join(', ')}`,
);

const smokeScriptTargets = smokeScripts.map((scriptName) => {
  const command = packageScripts[scriptName];
  const targetMatch = command.match(smokeCommandPattern);

  assert(
    Boolean(targetMatch),
    `${scriptName} must use a simple local node smoke command: node scripts/<name>.mjs`,
  );
  return {
    scriptName,
    scriptPath: targetMatch?.[1],
  };
});

for (const { scriptName, scriptPath } of smokeScriptTargets) {
  assert(
    Boolean(scriptPath) && existsSync(join(root, scriptPath)),
    `${scriptName} points at missing smoke script ${scriptPath ?? '<unresolved>'}`,
  );
}

const routeSmokeIndex = operatorSmoke.indexOf("capital:routes:smoke");

assert(includeRoutesIndex !== -1, `${operatorSmokePath} must keep localhost route smoke behind includeRoutes`);
assert(routeSmokeIndex !== -1, `${operatorSmokePath} must include capital:routes:smoke as an optional step`);
assert(
  includeRoutesIndex !== -1 && routeSmokeIndex > includeRoutesIndex,
  'capital:routes:smoke must stay inside the includeRoutes block instead of default operator smoke',
);
assert(
  operatorSmoke.includes('--with-routes'),
  `${operatorSmokePath} must document the --with-routes path for localhost route smoke`,
);
assert(
  operatorSmoke.includes('OPERATOR_SMOKE_STEP_TIMEOUT_MS') &&
    operatorSmoke.includes('DEFAULT_STEP_TIMEOUT_MS') &&
    operatorSmoke.includes('MAX_STEP_TIMEOUT_MS') &&
    operatorSmoke.includes('between 5000 and ${MAX_STEP_TIMEOUT_MS}') &&
    operatorSmoke.includes('timeout: stepTimeoutMs') &&
    operatorSmoke.includes("result.error.code === 'ETIMEDOUT'"),
  `${operatorSmokePath} must keep a bounded per-step timeout with a capped env override`,
);
assert(
  operatorSmoke.includes("args.includes('--list')") &&
    operatorSmoke.includes('Operator smoke plan:') &&
    operatorSmoke.includes('step.command.join') &&
    operatorSmoke.includes('Nested Prompt Atlas smoke plan: npm run prompt-atlas:verify:list') &&
    operatorSmoke.includes('process.exit(0)'),
  `${operatorSmokePath} must keep a --list plan mode for dry local audit`,
);
assert(
  operatorSmoke.includes("const allowedArgs = new Set(['--with-routes', '--list'])") &&
    operatorSmoke.includes('Unknown operator smoke argument(s):') &&
    operatorSmoke.includes('Usage: npm run operator:smoke -- [--list] [--with-routes]') &&
    operatorSmoke.includes('process.exit(1)'),
  `${operatorSmokePath} must reject unknown operator smoke arguments before running steps`,
);
assert(
  operatorSmoke.includes('function validateOperatorPlan(plan)') &&
    operatorSmoke.includes('validateOperatorPlan(steps)') &&
    operatorSmoke.includes('Operator smoke plan invalid:') &&
    operatorSmoke.includes('operator:script-boundary:smoke must be the first operator smoke step') &&
    operatorSmoke.includes('operator:manifest:smoke must be the second operator smoke step') &&
    operatorSmoke.includes('operator smoke steps must have non-empty labels') &&
    operatorSmoke.includes('operator smoke step label is duplicated') &&
    operatorSmoke.includes('duplicates operator smoke command'),
  `${operatorSmokePath} must validate the operator smoke plan before listing or running steps`,
);
assert(
  operatorSmoke.includes("label: 'Prompt Atlas safety manifest'") &&
    operatorSmoke.includes("command: ['npm', 'run', 'prompt-atlas:verify']"),
  `${operatorSmokePath} must run the Prompt Atlas manifest in the default local plan`,
);

const docsRequiringManifestReference = [
  'docs/soe-operator-system.md',
  'docs/soe-current-thread-handoff.md',
  'docs/soe-privacy-threat-model.md',
  'docs/92b-capital-launch-runbook.md',
];

const operatorSystemDoc = readText('docs/soe-operator-system.md');
assert(
  operatorSystemDoc.includes('npm run prompt-atlas:verify:list'),
  'docs/soe-operator-system.md must reference npm run prompt-atlas:verify:list',
);

function bashBlockAfterHeading(docText, heading) {
  const headingIndex = docText.indexOf(heading);
  if (headingIndex === -1) {
    return '';
  }

  return docText.slice(headingIndex).match(/```bash\n([\s\S]*?)```/)?.[1] ?? '';
}

for (const docPath of docsRequiringManifestReference) {
  const docText = readText(docPath);
  assert(
    docText.includes('npm run operator:manifest:smoke'),
    `${docPath} must reference npm run operator:manifest:smoke`,
  );
  assert(
    docText.includes('npm run operator:smoke -- --list'),
    `${docPath} must reference npm run operator:smoke -- --list`,
  );
}

for (const docPath of docsRequiringManifestReference.slice(0, 3)) {
  assert(
    readText(docPath).includes('simple local node smoke command'),
    `${docPath} must document the simple local node smoke command boundary`,
  );
  assert(
    readText(docPath).includes('unknown operator smoke arguments'),
    `${docPath} must document the unknown operator smoke argument boundary`,
  );
  assert(
    readText(docPath).includes('operator smoke plan validation'),
    `${docPath} must document runtime operator smoke plan validation`,
  );
}

assert(
  operatorSystemDoc.includes('Environment Readiness: run `npm run env:readiness:smoke`'),
  'docs/soe-operator-system.md must keep the environment readiness always-on loop',
);
assert(
  operatorSystemDoc.includes('Environment readiness template: `docs/soe-env-readiness-template.md`'),
  'docs/soe-operator-system.md must link docs/soe-env-readiness-template.md',
);
for (const term of [
  '.env.example',
  'provider-key',
  'cron-secret',
  'signer-secret',
  'fulfillment',
  'mint',
  'blockchain',
  'on-chain flag',
  'no-real-secret examples',
  'disabled-by-default gates',
  'exact approval text',
]) {
  assert(
    operatorSystemDoc.includes(term),
    `docs/soe-operator-system.md environment readiness loop must mention ${term}`,
  );
}

const handoffDoc = readText('docs/soe-current-thread-handoff.md');
assert(
  handoffDoc.includes('npm run prompt-atlas:verify:list'),
  'docs/soe-current-thread-handoff.md must reference npm run prompt-atlas:verify:list',
);
const requiredHandoffSmokeCommands = [...defaultOperatorCommandSet, ...optInOperatorCommandSet].sort();
const handoffCommandBlocks = [
  ['Current Verification Commands', bashBlockAfterHeading(handoffDoc, '## Current Verification Commands')],
  ['Start Commands', bashBlockAfterHeading(handoffDoc, '## Start Commands')],
];

for (const [blockName, blockText] of handoffCommandBlocks) {
  assert(blockText.includes('npm run operator:smoke'), `handoff ${blockName} must include npm run operator:smoke`);
  assert(
    blockText.includes('npm run prompt-atlas:verify:list'),
    `handoff ${blockName} must include npm run prompt-atlas:verify:list`,
  );
  for (const scriptName of requiredHandoffSmokeCommands) {
    assert(
      blockText.includes(`npm run ${scriptName}`),
      `handoff ${blockName} must include npm run ${scriptName}`,
    );
  }
}

if (failures.length > 0) {
  console.error('Operator manifest smoke failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Operator manifest smoke passed: ${defaultOperatorCommandSet.size} default smoke script(s), ${optInOperatorCommandSet.size} opt-in smoke script(s), and ${docsRequiringManifestReference.length} doc reference(s) are aligned.`,
);
