#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

const files = {
  snapshot: read('scripts/capital-revenue-snapshot.mjs'),
  package: read('package.json'),
  operatorSmoke: read('scripts/operator-smoke.mjs'),
  operatorDocs: read('docs/soe-operator-system.md'),
  handoff: read('docs/soe-current-thread-handoff.md'),
  runbook: read('docs/92b-capital-launch-runbook.md'),
};

const checks = [
  {
    name: 'revenue snapshot requires explicit read-only Stripe intent',
    ok:
      files.snapshot.includes("allowedArgs = new Set(['--stripe-read', '--json'])") &&
      files.snapshot.includes("args.includes('--stripe-read')") &&
      files.snapshot.includes('Refusing to contact Stripe without explicit --stripe-read approval.'),
  },
  {
    name: 'revenue snapshot uses aggregate read APIs only',
    ok:
      files.snapshot.includes('stripe.balanceTransactions.list') &&
      files.snapshot.includes('stripe.subscriptions.list') &&
      files.snapshot.includes('stripe.checkout.sessions.list') &&
      files.snapshot.includes('stripe.balance.retrieve') &&
      !/\bstripe\.[\w.]+\.(create|update|del|cancel|refund|capture|confirm|pay|finalize)\s*\(/.test(
        files.snapshot,
      ),
  },
  {
    name: 'revenue snapshot avoids customer and payment identifiers',
    ok:
      files.snapshot.includes('aggregate totals only; no customer or payment identifiers') &&
      !/\b(customer_email|customer_details|payment_intent|client_secret|receipt_url)\b/.test(
        files.snapshot,
      ) &&
      !/console\.(log|error)\([^\\n]*(session\\.id|subscription\\.id|transaction\\.id)/.test(
        files.snapshot,
      ),
  },
  {
    name: 'revenue snapshot distinguishes cash contribution from accounting profit',
    ok:
      files.snapshot.includes('cashContributionMinor') &&
      files.snapshot.includes('It is not accounting profit') &&
      files.snapshot.includes('payroll, hosting, taxes, fulfillment'),
  },
  {
    name: 'revenue snapshot reports paid 92B tier activity without inventing a conversion rate',
    ok:
      files.snapshot.includes('paidCheckoutGrossMinorByTypeLast30Days') &&
      files.snapshot.includes('paidNinetyTwoBTiersLast30Days') &&
      files.snapshot.includes("new Set(['supporter', 'patron', 'founder', 'architect'])") &&
      files.snapshot.includes("rawTierId) ? rawTierId : 'unclassified'") &&
      files.snapshot.includes('Conversion rate is not reported because this snapshot does not read visitor or page-view data.') &&
      !files.snapshot.includes("console.log('\\nRecent checkout conversion')"),
  },
  {
    name: 'package exposes snapshot and local smoke commands',
    ok:
      files.package.includes(
        '"capital:revenue:snapshot": "node scripts/capital-revenue-snapshot.mjs"',
      ) &&
      files.package.includes(
        '"capital:revenue:smoke": "node scripts/capital-revenue-snapshot-smoke.mjs"',
      ),
  },
  {
    name: 'operator smoke runs the local revenue contract guard',
    ok:
      files.operatorSmoke.includes("label: 'Capital revenue snapshot contract'") &&
      files.operatorSmoke.includes("'capital:revenue:smoke'"),
  },
  {
    name: 'operator docs, handoff, and launch runbook document aggregate revenue reads',
    ok:
      files.operatorDocs.includes('capital:revenue:snapshot') &&
      files.operatorDocs.includes('capital:revenue:smoke') &&
      files.handoff.includes('capital:revenue:snapshot') &&
      files.runbook.includes('capital:revenue:snapshot'),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nCapital revenue snapshot smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nCapital revenue snapshot smoke passed.');
