#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

const files = {
  verifier: read('scripts/capital-post-promotion-verify.mjs'),
  package: read('package.json'),
  operatorSmoke: read('scripts/operator-smoke.mjs'),
  operatorDocs: read('docs/soe-operator-system.md'),
  handoff: read('docs/soe-current-thread-handoff.md'),
  runbook: read('docs/92b-capital-launch-runbook.md'),
};

const checks = [
  {
    name: 'post-promotion verifier requires explicit Vercel and Stripe read intent plus deployment id',
    ok:
      files.verifier.includes("allowedArgs = new Set(['--vercel-read', '--stripe-read', '--json'])") &&
      files.verifier.includes("args.includes('--vercel-read')") &&
      files.verifier.includes("args.includes('--stripe-read')") &&
      files.verifier.includes("arg.startsWith('--deployment=')") &&
      files.verifier.includes('Missing required --deployment=<preview-url-or-id>.') &&
      files.verifier.includes('Refusing post-promotion verification without both --vercel-read and --stripe-read.'),
  },
  {
    name: 'post-promotion verifier composes production, live payment, revenue, and first-revenue evidence',
    ok:
      files.verifier.includes("'scripts/capital-production-postlaunch.mjs'") &&
      files.verifier.includes("'capital:live-payment:readiness'") &&
      files.verifier.includes("'capital:revenue:snapshot'") &&
      files.verifier.includes("'capital:first-revenue:readiness'") &&
      files.verifier.includes('`--deployment=${deployment}`') &&
      files.verifier.includes("'--stripe-read'") &&
      files.verifier.includes("'--json'"),
  },
  {
    name: 'post-promotion verifier parses child JSON robustly around CLI progress output',
    ok:
      files.verifier.includes('[result.stdout, result.stderr].filter(Boolean).join') &&
      files.verifier.includes('function extractJsonObject(output)') &&
      files.verifier.includes('let inString = false') &&
      files.verifier.includes('let escaping = false') &&
      files.verifier.includes('return output.slice(start, index + 1)'),
  },
  {
    name: 'post-promotion verifier reports updated/profit statuses without claiming accounting profit',
    ok:
      files.verifier.includes('production_not_updated') &&
      files.verifier.includes('live_payment_not_ready') &&
      files.verifier.includes('stripe_cash_contribution_positive') &&
      files.verifier.includes('productionUpdated') &&
      files.verifier.includes('accountingBoundary') &&
      files.verifier.includes('All-time Stripe cash contribution:'),
  },
  {
    name: 'post-promotion verifier explicitly disclaims external mutations',
    ok:
      files.verifier.includes('No deploy, promotion, rollback, checkout session, payment, webhook replay') &&
      files.verifier.includes('outreach send') &&
      files.verifier.includes('connected-tool mutation') &&
      files.verifier.includes('file write') &&
      files.verifier.includes('one intentionally invalid checkout POST'),
  },
  {
    name: 'post-promotion verifier does not include mutation-capable provider, payment, deploy, send, or file-write commands',
    ok:
      !/\[\s*['"]vercel['"]\s*,\s*['"](deploy|promote|rollback)['"]/.test(files.verifier) &&
      !/\b(checkout\.sessions\.create|webhookEndpoints\.(?:create|update|del|delete)|refunds\.create|paymentIntents\.create)\s*\(/.test(
        files.verifier,
      ) &&
      !/\b(writeFile|appendFile|rmSync|unlinkSync)\s*\(/.test(files.verifier) &&
      !/from ['"]stripe['"]|import Stripe|new Stripe/.test(files.verifier) &&
      !files.verifier.includes('@supabase') &&
      !files.verifier.includes('Resend'),
  },
  {
    name: 'package exposes post-promotion verifier and smoke commands',
    ok:
      files.package.includes('"capital:post-promotion:verify": "node scripts/capital-post-promotion-verify.mjs"') &&
      files.package.includes('"capital:post-promotion:smoke": "node scripts/capital-post-promotion-verify-smoke.mjs"'),
  },
  {
    name: 'operator smoke runs the local post-promotion verifier contract guard',
    ok:
      files.operatorSmoke.includes("label: 'Capital post-promotion verifier contract'") &&
      files.operatorSmoke.includes("'capital:post-promotion:smoke'"),
  },
  {
    name: 'operator docs, handoff, and launch runbook document post-promotion verifier',
    ok:
      files.operatorDocs.includes('capital:post-promotion:verify') &&
      files.operatorDocs.includes('capital:post-promotion:smoke') &&
      files.handoff.includes('capital:post-promotion:verify') &&
      files.runbook.includes('capital:post-promotion:verify'),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nCapital post-promotion verifier smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nCapital post-promotion verifier smoke passed.');
