#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

const files = {
  readiness: read('scripts/capital-first-revenue-readiness.mjs'),
  profitGate: read('scripts/capital-profit-gate.mjs'),
  paidTrafficPacket: read('scripts/capital-paid-traffic-packet.mjs'),
  package: read('package.json'),
  operatorSmoke: read('scripts/operator-smoke.mjs'),
  operatorDocs: read('docs/soe-operator-system.md'),
  handoff: read('docs/soe-current-thread-handoff.md'),
  runbook: read('docs/92b-capital-launch-runbook.md'),
};

const exactProductionApproval =
  'Approve promoting Vercel preview deployment dpl_GAdFZyzEinPbfqXRrrkUPaqRryQC to production for www.societyofexplorers.com and societyofexplorers.com.';
const minimumLiveCheckoutValidationApproval =
  'Approve creating checkout sessions or payments for one 92B Supporter pledge validation from https://www.societyofexplorers.com/92b/fund using live mode.';

const checks = [
  {
    name: 'first revenue readiness requires explicit Vercel and Stripe read intent plus deployment id',
    ok:
      files.readiness.includes("allowedArgs = new Set(['--vercel-read', '--stripe-read', '--json'])") &&
      files.readiness.includes("args.includes('--vercel-read')") &&
      files.readiness.includes("args.includes('--stripe-read')") &&
      files.readiness.includes("arg.startsWith('--deployment=')") &&
      files.readiness.includes('Missing required --deployment=<preview-url-or-id>.') &&
      files.readiness.includes('Refusing to inspect first revenue readiness without both --vercel-read and --stripe-read.'),
  },
  {
    name: 'first revenue readiness composes profit gate and paid-traffic packet JSON',
    ok:
      files.readiness.includes("'capital:profit:gate'") &&
      files.readiness.includes("'capital:paid-traffic:packet'") &&
      files.readiness.includes('`--deployment=${deployment}`') &&
      files.readiness.includes("'--vercel-read'") &&
      files.readiness.includes("'--stripe-read'") &&
      files.readiness.includes("'--json'"),
  },
  {
    name: 'first revenue readiness parses child JSON robustly around CLI progress output',
    ok:
      files.readiness.includes('[result.stdout, result.stderr].filter(Boolean).join') &&
      files.readiness.includes('function extractJsonObject(output)') &&
      files.readiness.includes('let inString = false') &&
      files.readiness.includes('let escaping = false') &&
      files.readiness.includes('return output.slice(start, index + 1)'),
  },
  {
    name: 'first revenue readiness reports the launch and revenue statuses operators need',
    ok:
      files.readiness.includes('needs_live_payment_readiness') &&
      files.readiness.includes('needs_production_promotion_approval') &&
      files.readiness.includes('ready_for_first_revenue_approval') &&
      files.readiness.includes('stripe_cash_contribution_positive') &&
      files.readiness.includes('paid_sessions_need_cash_contribution_review') &&
      files.readiness.includes('needs_launch_work'),
  },
  {
    name: 'first revenue readiness preserves exact production and first-conversion approval gates',
    ok:
      files.readiness.includes('exactProductionApproval') &&
      files.readiness.includes('minimumLiveCheckoutValidationApproval') &&
      files.readiness.includes('approvalReadyActions') &&
      files.readiness.includes('Choose exactly one first-conversion action') &&
      files.profitGate.includes(exactProductionApproval) &&
      files.paidTrafficPacket.includes(minimumLiveCheckoutValidationApproval),
  },
  {
    name: 'first revenue readiness carries measurement commands and stop rules',
    ok:
      files.readiness.includes('measurementCommands') &&
      files.readiness.includes('postPromotionVerification') &&
      files.readiness.includes('productionPromotionCommandAfterExactApproval') &&
      files.readiness.includes('stopRules') &&
      files.readiness.includes('Measurement commands after an exactly approved first action') &&
      files.readiness.includes('Post-promotion verification') &&
      files.readiness.includes('Stop rules') &&
      files.paidTrafficPacket.includes('capital:post-promotion:verify') &&
      files.paidTrafficPacket.includes('firstConversionSequence') &&
      files.paidTrafficPacket.includes('liveCheckoutValidation') &&
      files.paidTrafficPacket.includes('capital:first-revenue:readiness'),
  },
  {
    name: 'first revenue readiness does not include mutation-capable provider, payment, deploy, send, or file-write commands',
    ok:
      !/['"](?:deploy|promote|rollback|send)['"]/.test(files.readiness) &&
      !/\b(checkout\.sessions\.create|webhookEndpoints\.(?:create|update|del|delete)|refunds\.create|paymentIntents\.create)\s*\(/.test(
        files.readiness,
      ) &&
      !/\b(writeFile|appendFile|rmSync|unlinkSync)\s*\(/.test(files.readiness) &&
      !/from ['"]stripe['"]|import Stripe|new Stripe/.test(files.readiness) &&
      !files.readiness.includes('@supabase') &&
      !files.readiness.includes('Resend'),
  },
  {
    name: 'first revenue readiness receipt explicitly disclaims external mutations',
    ok:
      files.readiness.includes('No deploy, promotion, rollback, checkout session, payment, webhook replay, outreach send') &&
      files.readiness.includes('connected-tool mutation') &&
      files.readiness.includes('public post') &&
      files.readiness.includes('file write'),
  },
  {
    name: 'package exposes first revenue readiness and smoke commands',
    ok:
      files.package.includes('"capital:first-revenue:readiness": "node scripts/capital-first-revenue-readiness.mjs"') &&
      files.package.includes('"capital:first-revenue:smoke": "node scripts/capital-first-revenue-readiness-smoke.mjs"'),
  },
  {
    name: 'operator smoke runs the local first revenue readiness contract guard',
    ok:
      files.operatorSmoke.includes("label: 'Capital first revenue readiness contract'") &&
      files.operatorSmoke.includes("'capital:first-revenue:smoke'"),
  },
  {
    name: 'operator docs, handoff, and launch runbook document first revenue readiness',
    ok:
      files.operatorDocs.includes('capital:first-revenue:readiness') &&
      files.operatorDocs.includes('capital:first-revenue:smoke') &&
      files.handoff.includes('capital:first-revenue:readiness') &&
      files.handoff.includes('capital:first-revenue:smoke') &&
      files.runbook.includes('capital:first-revenue:readiness') &&
      files.runbook.includes('capital:first-revenue:smoke'),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nCapital first revenue readiness smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nCapital first revenue readiness smoke passed.');
