#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function walk(dir) {
  const entries = readdirSync(join(root, dir));
  const files = [];

  for (const entry of entries) {
    const absolute = join(root, dir, entry);
    const stats = statSync(absolute);
    if (stats.isDirectory()) {
      files.push(...walk(relative(root, absolute)));
    } else if (entry === 'route.ts' || entry === 'route.js') {
      files.push(relative(root, absolute));
    }
  }

  return files.sort();
}

const inventory = read('docs/soe-external-effect-route-inventory.md');
const matrix = read('docs/soe-external-action-approval-matrix.md');
const handoff = read('docs/soe-current-thread-handoff.md');
const operator = read('docs/soe-operator-system.md');
const packageJson = read('package.json');
const operatorSmoke = read('scripts/operator-smoke.mjs');

const patterns = {
  paymentOrWebhook: /checkout\.sessions\.create|webhooks\.constructEvent/,
  emailOrNotification: /RESEND_API_KEY|api\.resend\.com\/emails|emails\.send|new Resend|sendPublicLeadNotification/,
  aiOrMediaProvider:
    /Anthropic|anthropic\.messages|createAnthropicClient|api\.openai\.com|OPENAI_API_KEY|FAL_API_KEY|fal\.run|DAILY_API_KEY|api\.daily\.co|ELEVENLABS_API_KEY|elevenlabs\.io|createLiveSession|storeConversationEmbedding|generateEmbedding/,
  fulfillmentOrMint:
    /PRINTFUL|printful|mintMembershipNFT|nft_mints|membership_nft|mintExp|writeContract|sendTransaction/,
  externalEffectProxy: /\/api\/onboarding\/trigger|ONBOARDING_BATCH_TRIGGER_ENABLED/,
};

const routeFiles = walk('app/api');
const detected = routeFiles.filter((file) => {
  const source = read(file);
  return Object.values(patterns).some((pattern) => pattern.test(source));
});

const documentedInventoryRoutes = [
  ...new Set([...inventory.matchAll(/`(app\/api\/[^`]+\/route\.(?:ts|js))`/g)].map((match) => match[1])),
];
const inventoryRouteRows = inventory.split('\n').filter((line) => /^\| `app\/api\//.test(line));
const incompleteInventoryRows = inventoryRouteRows.filter((row) => {
  const cells = row.split('|').slice(1, -1).map((cell) => cell.trim());
  return cells.length !== 3 || cells.some((cell) => !cell || /\b(?:TBD|TODO|unknown)\b/i.test(cell));
});
const missingFromInventory = detected.filter((file) => !inventory.includes(file));
const staleInventoryRoutes = documentedInventoryRoutes.filter((file) => !routeFiles.includes(file));
const documentedButUndetected = documentedInventoryRoutes.filter((file) => !detected.includes(file));

const requiredInventoryTerms = [
  'Payment And Webhook Routes',
  'Email And Notification Routes',
  'AI And Media Provider Routes',
  'Fulfillment, Publishing, And Minting Routes',
  'app/api/onboarding/send-all/route.ts',
  'does not authorize calling',
  'Broad permission to control the computer is not enough',
  'npm run external:effects:smoke',
];

const requiredApprovalTerms = [
  'Approve running external provider call',
  'calls external AI/media providers',
  'Approve creating checkout sessions or payments',
  'Approve publishing creator content',
  'Approve connected-tool mutation',
];

const checks = [
  {
    name: 'external effect inventory lists every currently detected high-risk app route',
    ok: missingFromInventory.length === 0,
    detail: missingFromInventory.join(', '),
  },
  {
    name: 'external effect inventory route paths still exist locally',
    ok: staleInventoryRoutes.length === 0,
    detail: staleInventoryRoutes.join(', '),
  },
  {
    name: 'external effect inventory routes are covered by detector patterns',
    ok: documentedButUndetected.length === 0,
    detail: documentedButUndetected.join(', '),
  },
  {
    name: 'external effect inventory route rows include effect and approval guidance',
    ok: inventoryRouteRows.length > 0 && incompleteInventoryRows.length === 0,
    detail: incompleteInventoryRows.join('\n'),
  },
  {
    name: 'external effect inventory states categories and no-authorization boundary',
    ok: requiredInventoryTerms.every((term) => inventory.includes(term)),
  },
  {
    name: 'approval matrix covers external provider calls as blocked actions',
    ok: requiredApprovalTerms.every((term) => matrix.includes(term)),
  },
  {
    name: 'handoff and operator docs link inventory and smoke guard',
    ok:
      handoff.includes('docs/soe-external-effect-route-inventory.md') &&
      handoff.includes('npm run external:effects:smoke') &&
      operator.includes('External Effect Inventory') &&
      operator.includes('npm run external:effects:smoke'),
  },
  {
    name: 'package and operator smoke run external effect inventory guard',
    ok:
      packageJson.includes('"external:effects:smoke"') &&
      operatorSmoke.includes("npm', 'run', 'external:effects:smoke'"),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
  if (!check.ok && check.detail) console.log(`  ${check.detail}`);
}

if (failures.length > 0) {
  console.error(`\nExternal effect route inventory smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log(`\nExternal effect route inventory smoke passed. Detected ${detected.length} high-risk app route(s).`);
