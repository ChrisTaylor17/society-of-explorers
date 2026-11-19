#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

const files = {
  gate: read('scripts/capital-profit-gate.mjs'),
  verifier: read('scripts/capital-production-postlaunch.mjs'),
  package: read('package.json'),
  operatorSmoke: read('scripts/operator-smoke.mjs'),
  operatorDocs: read('docs/soe-operator-system.md'),
  handoff: read('docs/soe-current-thread-handoff.md'),
  runbook: read('docs/92b-capital-launch-runbook.md'),
};

const checks = [
  {
    name: 'profit gate requires explicit Vercel and Stripe read intent plus deployment id',
    ok:
      files.gate.includes("allowedArgs = new Set(['--vercel-read', '--stripe-read', '--json', '--strict'])") &&
      files.gate.includes("args.includes('--vercel-read')") &&
      files.gate.includes("args.includes('--stripe-read')") &&
      files.gate.includes("arg.startsWith('--deployment=')") &&
      files.gate.includes('Refusing to run external read checks without both --vercel-read and --stripe-read.'),
  },
  {
    name: 'profit gate composes production, protected preview, live payment readiness, and aggregate Stripe evidence',
    ok:
      files.gate.includes("'scripts/capital-production-postlaunch.mjs'") &&
      files.gate.includes('`--vercel-deployment=${deployment}`') &&
      files.gate.includes("'vercel'") &&
      files.gate.includes("'env'") &&
      files.gate.includes("'capital:live-payment:readiness'") &&
      files.gate.includes("'capital:revenue:snapshot'") &&
      files.gate.includes("'--stripe-read'") &&
      files.gate.includes("'--json'"),
  },
  {
    name: 'profit gate parses child JSON robustly around CLI progress output',
    ok:
      files.gate.includes('[result.stdout, result.stderr].filter(Boolean).join') &&
      files.gate.includes('function extractJsonObject(output)') &&
      files.gate.includes('let inString = false') &&
      files.gate.includes('let escaping = false') &&
      files.gate.includes('return output.slice(start, index + 1)'),
  },
  {
    name: 'profit gate does not include mutation-capable provider, payment, deploy, send, or file-write commands',
    ok:
      !/['"](?:deploy|promote|rollback|send)['"]/.test(files.gate) &&
      !/\b(checkout\.sessions\.create|webhookEndpoints\.create|refunds\.create)\s*\(/.test(
        files.gate,
      ) &&
      !/\b(writeFile|appendFile|rmSync|unlinkSync)\s*\(/.test(files.gate) &&
      !files.gate.includes('${webhookSecret}') &&
      !files.gate.includes('customer_email') &&
      !files.gate.includes('payment_intent'),
  },
  {
    name: 'profit gate blocks production promotion and paid traffic when live payment readiness is missing',
    ok:
      files.gate.includes('livePaymentReady') &&
      files.gate.includes('needs_live_payment_readiness') &&
      files.gate.includes('LIVE_PAYMENT_READINESS_APPROVAL') &&
      files.gate.includes('Live payment readiness:') &&
      files.gate.includes('exactLivePaymentReadinessApproval'),
  },
  {
    name: 'profit gate distinguishes Stripe cash contribution from accounting profit',
    ok:
      files.gate.includes('stripeCashContributionPositive') &&
      files.gate.includes('accountingBoundary') &&
      files.gate.includes('revenueSnapshot.accountingBoundary') &&
      files.gate.includes('Accounting boundary:'),
  },
  {
    name: 'profit gate preserves the exact production approval phrase',
    ok: files.gate.includes(
      'Approve promoting Vercel preview deployment dpl_GAdFZyzEinPbfqXRrrkUPaqRryQC to production for www.societyofexplorers.com and societyofexplorers.com.',
    ),
  },
  {
    name: 'profit gate points live zero-checkout status to the paid-traffic packet',
    ok:
      files.gate.includes('production_live_needs_paid_traffic') &&
      files.gate.includes('capital:paid-traffic:packet') &&
      files.gate.includes('approved live checkout validation, warm outreach, or window activation request'),
  },
  {
    name: 'production verifier can emit JSON for composed gates',
    ok:
      files.verifier.includes("const json = args.includes('--json')") &&
      files.verifier.includes('const report = {') &&
      files.verifier.includes('JSON.stringify(report, null, 2)'),
  },
  {
    name: 'package exposes profit gate and smoke commands',
    ok:
      files.package.includes('"capital:profit:gate": "node scripts/capital-profit-gate.mjs"') &&
      files.package.includes('"capital:profit:smoke": "node scripts/capital-profit-gate-smoke.mjs"'),
  },
  {
    name: 'operator smoke runs the local profit gate contract guard',
    ok:
      files.operatorSmoke.includes("label: 'Capital profit gate contract'") &&
      files.operatorSmoke.includes("'capital:profit:smoke'"),
  },
  {
    name: 'operator docs, handoff, and launch runbook document the profit gate',
    ok:
      files.operatorDocs.includes('capital:profit:gate') &&
      files.operatorDocs.includes('capital:profit:smoke') &&
      files.handoff.includes('capital:profit:gate') &&
      files.runbook.includes('capital:profit:gate'),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nCapital profit gate smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nCapital profit gate smoke passed.');
