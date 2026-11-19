#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

const files = {
  packet: read('scripts/capital-go-live-packet.mjs'),
  package: read('package.json'),
  operatorSmoke: read('scripts/operator-smoke.mjs'),
  operatorDocs: read('docs/soe-operator-system.md'),
  handoff: read('docs/soe-current-thread-handoff.md'),
  runbook: read('docs/92b-capital-launch-runbook.md'),
};

const exactApproval =
  'Approve promoting Vercel preview deployment dpl_GAdFZyzEinPbfqXRrrkUPaqRryQC to production for www.societyofexplorers.com and societyofexplorers.com.';

const checks = [
  {
    name: 'go-live packet is a local packet with no external execution imports',
    ok:
      !files.packet.includes('child_process') &&
      !files.packet.includes('fetch(') &&
      !files.packet.includes('Stripe') &&
      !files.packet.includes('@supabase') &&
      !files.packet.includes('Resend') &&
      !files.packet.includes('writeFile') &&
      !files.packet.includes('appendFile') &&
      files.packet.includes('No deploy, promotion, rollback, checkout session, payment, webhook replay, outreach send'),
  },
  {
    name: 'go-live packet preserves the exact production approval phrase',
    ok: files.packet.includes(exactApproval),
  },
  {
    name: 'go-live packet records release candidate, domains, and rollback target',
    ok:
      files.packet.includes("const deploymentId = 'dpl_GAdFZyzEinPbfqXRrrkUPaqRryQC'") &&
      files.packet.includes("const previewUrl = 'https://society-of-explorers-jzd7yvty1-chris-projects-03dec906.vercel.app'") &&
      files.packet.includes("'www.societyofexplorers.com'") &&
      files.packet.includes("'societyofexplorers.com'") &&
      files.packet.includes("const rollbackTarget = 'dpl_A3UZ6YV9EE6vmdfFWvDDMnektEYC'"),
  },
  {
    name: 'go-live packet lists command plan as do-not-run text, not executed code',
    ok:
      files.packet.includes('doNotRunWithoutApproval') &&
      files.packet.includes('npx vercel promote') &&
      files.packet.includes('npx vercel rollback') &&
      !/spawnSync|execFile|execSync|exec\(/.test(files.packet),
  },
  {
    name: 'go-live packet includes post-promotion verification and stop rules',
    ok:
      files.packet.includes('prePromotionReadiness') &&
      files.packet.includes('npm run capital:go-live:readiness -- --vercel-read --stripe-read') &&
      files.packet.includes('capital:post-promotion:verify') &&
      files.packet.includes('npm run capital:production:verify') &&
      files.packet.includes('capital:revenue:snapshot') &&
      files.packet.includes('capital:profit:gate') &&
      files.packet.includes('capital:first-revenue:readiness') &&
      files.packet.includes('If /92b/fund is old, rollback') &&
      files.packet.includes('If /api/92b/checkout creates a session for an invalid body'),
  },
  {
    name: 'go-live packet queues next paid-traffic approval templates',
    ok:
      files.packet.includes('Approve creating checkout sessions or payments for [flow] using [test/live] mode.') &&
      files.packet.includes('Approve sending this outreach batch: [recipients], [channels], [final draft/version], [send window].') &&
      files.packet.includes('Approve printing or placing the 92B window sign at [location] using [copy/version] and QR destination [url].'),
  },
  {
    name: 'package exposes go-live packet and smoke commands',
    ok:
      files.package.includes('"capital:go-live:packet": "node scripts/capital-go-live-packet.mjs"') &&
      files.package.includes('"capital:go-live:smoke": "node scripts/capital-go-live-packet-smoke.mjs"'),
  },
  {
    name: 'operator smoke runs the go-live packet contract guard',
    ok:
      files.operatorSmoke.includes("label: 'Capital go-live packet contract'") &&
      files.operatorSmoke.includes("'capital:go-live:smoke'"),
  },
  {
    name: 'operator docs, handoff, and runbook document the go-live packet',
    ok:
      files.operatorDocs.includes('capital:go-live:packet') &&
      files.operatorDocs.includes('capital:go-live:smoke') &&
      files.handoff.includes('capital:go-live:packet') &&
      files.runbook.includes('capital:go-live:packet'),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nCapital go-live packet smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nCapital go-live packet smoke passed.');
