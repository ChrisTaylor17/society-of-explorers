#!/usr/bin/env node

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), 'utf8');
}

function findObjectEnd(source, startIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }

    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }

  return -1;
}

function extractMetadataBlocks(source) {
  const blocks = [];
  const regex = /metadata\s*:\s*\{/g;
  let match;

  while ((match = regex.exec(source))) {
    const objectStart = source.indexOf('{', match.index);
    const objectEnd = findObjectEnd(source, objectStart);
    if (objectEnd > objectStart) blocks.push(source.slice(objectStart, objectEnd));
  }

  return blocks;
}

function metadataKeys(block) {
  const keys = new Set();
  const regex = /(?:^|[\s,{])([A-Za-z_$][\w$]*)\s*:/g;
  let match;

  while ((match = regex.exec(block))) {
    keys.add(match[1]);
  }

  return keys;
}

function allMetadataKeys(source) {
  const keys = new Set();
  for (const block of extractMetadataBlocks(source)) {
    for (const key of metadataKeys(block)) keys.add(key);
  }
  return keys;
}

function hasAll(source, snippets) {
  return snippets.every((snippet) => source.includes(snippet));
}

const routeSources = {
  ninetyTwoB: read('app/api/92b/checkout/route.ts'),
  projectPledge: read('app/api/projects/[id]/pledge/route.ts'),
  membership: read('app/api/checkout/route.ts'),
  merch: read('app/api/merch/checkout/route.ts'),
  webhook: read('app/api/stripe/webhook/route.ts'),
};

const forbiddenMetadataKeys = new Set([
  'email',
  'customer_email',
  'customer',
  'customerId',
  'customer_id',
  'name',
  'full_name',
  'first_name',
  'last_name',
  'wallet',
  'wallet_address',
  'address',
  'phone',
  'relationship_context',
  'notes',
  'notes_redacted',
  'message',
  'stripe_customer_id',
  'payment_intent',
  'paymentIntent',
  'checkout_session',
  'checkoutSession',
  'session_id',
]);

const allKeys = new Map(
  Object.entries(routeSources)
    .filter(([name]) => name !== 'webhook')
    .map(([name, source]) => [name, allMetadataKeys(source)]),
);

const checks = [
  {
    label: '92B checkout metadata is classification-only',
    ok: hasAll(routeSources.ninetyTwoB, [
      "type: '92b_pledge'",
      'pledge_type: PLEDGE_TYPES.NINETY_TWO_B',
      'campaign_slug: CAPITAL_CAMPAIGN_SLUG',
      'tier_id: tierDefinition.id',
      'tier_label: tierLabel',
      'amount_cents: String(amountCents)',
      "const source = '92b_fund_page'",
      'source,',
      'sanitizeUtm(body.utm)',
    ]),
  },
  {
    label: 'Project pledge checkout metadata is classification-only',
    ok: hasAll(routeSources.projectPledge, [
      "type: 'project_pledge'",
      'pledge_type: PLEDGE_TYPES.PROJECT',
      'campaign_slug: CAPITAL_CAMPAIGN_SLUG',
      'project_id: projectId',
      'tier_id: tierId',
      'tier_label: tierLabel',
      'amount_cents: String(amountCents)',
      "const source = boundedText(body.source, 80) || 'project_page'",
      'source,',
      'sanitizeUtm(body.utm)',
    ]),
  },
  {
    label: 'Membership checkout metadata is minimal',
    ok: hasAll(routeSources.membership, [
      "type: 'membership'",
      'tier_id: tier',
      'tier_label: String(tier).toUpperCase()',
      "source: 'join_page'",
    ]),
  },
  {
    label: 'Merch checkout metadata is minimal',
    ok: hasAll(routeSources.merch, [
      "type: 'merch'",
      'product_id: productId.toString()',
      'quantity: quantity.toString()',
    ]),
  },
  {
    label: 'Checkout metadata excludes contact, wallet, relationship, notes, and payment identifiers',
    ok: [...allKeys.values()].every((keys) => [...keys].every((key) => !forbiddenMetadataKeys.has(key))),
  },
  {
    label: 'Webhook branches on normalized pledge metadata types',
    ok: hasAll(routeSources.webhook, [
      "session.metadata?.type === '92b_pledge'",
      "session.metadata?.type === 'project_pledge'",
      'recordPaidPledge({',
      'pledgeType: PLEDGE_TYPES.NINETY_TWO_B',
      'pledgeType: PLEDGE_TYPES.PROJECT',
    ]),
  },
];

const failed = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.label}`);
}

if (failed.length > 0) {
  console.log('');
  for (const [name, keys] of allKeys.entries()) {
    const forbidden = [...keys].filter((key) => forbiddenMetadataKeys.has(key));
    if (forbidden.length) console.log(`${name} forbidden metadata keys: ${forbidden.join(', ')}`);
  }
  process.exitCode = 1;
}
