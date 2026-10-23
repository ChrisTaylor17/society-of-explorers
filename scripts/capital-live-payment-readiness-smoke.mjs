#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

const files = {
  readiness: read('scripts/capital-live-payment-readiness.mjs'),
  profitGate: read('scripts/capital-profit-gate.mjs'),
  package: read('package.json'),
  operatorSmoke: read('scripts/operator-smoke.mjs'),
  operatorDocs: read('docs/soe-operator-system.md'),
  handoff: read('docs/soe-current-thread-handoff.md'),
  runbook: read('docs/92b-capital-launch-runbook.md'),
};

const targetEndpoint = 'https://www.societyofexplorers.com/api/stripe/webhook';
const requiredEvents = [
  'checkout.session.completed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
];

const forbiddenReadinessPattern =
  /\b(webhookEndpoints\.(?:create|update|del)|checkout\.sessions\.create|refunds\.create|paymentIntents\.create|charges\.create|writeFile|appendFile|rmSync|unlinkSync|spawnSync|execSync|execFileSync)\s*\(/;

const checks = [
  {
    name: 'live payment readiness requires explicit read-only Stripe intent',
    ok:
      files.readiness.includes("allowedArgs = new Set(['--stripe-read', '--json'])") &&
      files.readiness.includes("args.includes('--stripe-read')") &&
      files.readiness.includes('Refusing to contact Stripe without explicit --stripe-read approval.') &&
      files.readiness.includes('Usage: npm run capital:live-payment:readiness -- --stripe-read [--json]'),
  },
  {
    name: 'live payment readiness reads the exact Stripe endpoint contract',
    ok:
      files.readiness.includes("import Stripe from 'stripe'") &&
      files.readiness.includes('stripe.webhookEndpoints.list({ limit: 100 })') &&
      files.readiness.includes(`const TARGET_WEBHOOK_URL = '${targetEndpoint}'`) &&
      requiredEvents.every((eventName) => files.readiness.includes(`'${eventName}'`)) &&
      files.readiness.includes("endpointStatus === 'enabled'") &&
      files.readiness.includes('endpointLivemode === true') &&
      files.readiness.includes('missingEvents.length === 0') &&
      files.readiness.includes('extraEvents.length === 0'),
  },
  {
    name: 'live payment readiness checks production signing secret shape without printing secret values',
    ok:
      files.readiness.includes('STRIPE_WEBHOOK_SECRET') &&
      files.readiness.includes('webhookSecretShape') &&
      files.readiness.includes("'whsec_*'") &&
      files.readiness.includes('Secret values were not printed') &&
      !files.readiness.includes('${webhookSecret}') &&
      !files.readiness.includes('webhookSecret,') &&
      !files.readiness.includes('process.env.STRIPE_WEBHOOK_SECRET,'),
  },
  {
    name: 'live payment readiness has no mutation-capable provider, payment, deploy, send, or file-write calls',
    ok:
      !forbiddenReadinessPattern.test(files.readiness) &&
      !/\bvercel\s+(?:deploy|promote|rollback)\b/.test(files.readiness) &&
      !/\.send\s*\(/.test(files.readiness) &&
      files.readiness.includes('No endpoint create/update/delete, checkout session, payment, webhook replay, deploy, send, or file write occurred.'),
  },
  {
    name: 'profit gate composes live payment readiness before traffic decisions',
    ok:
      files.profitGate.includes('capital:live-payment:readiness') &&
      files.profitGate.includes('livePaymentReady') &&
      files.profitGate.includes('needs_live_payment_readiness') &&
      files.profitGate.includes('Live payment readiness:'),
  },
  {
    name: 'package exposes live payment readiness and smoke commands',
    ok:
      files.package.includes('"capital:live-payment:readiness": "node scripts/capital-live-payment-readiness.mjs"') &&
      files.package.includes('"capital:live-payment:smoke": "node scripts/capital-live-payment-readiness-smoke.mjs"'),
  },
  {
    name: 'operator smoke runs the local live payment readiness contract guard',
    ok:
      files.operatorSmoke.includes("label: 'Capital live payment readiness contract'") &&
      files.operatorSmoke.includes("'capital:live-payment:smoke'"),
  },
  {
    name: 'operator docs, handoff, and launch runbook document live payment readiness',
    ok:
      files.operatorDocs.includes('capital:live-payment:readiness') &&
      files.operatorDocs.includes('capital:live-payment:smoke') &&
      files.handoff.includes('capital:live-payment:readiness') &&
      files.handoff.includes('capital:live-payment:smoke') &&
      files.runbook.includes('capital:live-payment:readiness') &&
      files.runbook.includes('capital:live-payment:smoke') &&
      files.runbook.includes(targetEndpoint),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nCapital live payment readiness smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nCapital live payment readiness smoke passed.');
