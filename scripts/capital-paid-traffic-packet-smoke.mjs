#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

const files = {
  packet: read('scripts/capital-paid-traffic-packet.mjs'),
  campaign: read('lib/capital/campaign.ts'),
  package: read('package.json'),
  operatorSmoke: read('scripts/operator-smoke.mjs'),
  operatorDocs: read('docs/soe-operator-system.md'),
  handoff: read('docs/soe-current-thread-handoff.md'),
  runbook: read('docs/92b-capital-launch-runbook.md'),
};

const productionPromotionReceipt =
  'Preview deployment dpl_GAdFZyzEinPbfqXRrrkUPaqRryQC was promoted to production as dpl_2hkoxV6BewU9RCWtEhWUD5XUuTJR for www.societyofexplorers.com and societyofexplorers.com on 2026-06-19.';

const checks = [
  {
    name: 'paid-traffic packet is local-only with no external execution imports',
    ok:
      !files.packet.includes('child_process') &&
      !files.packet.includes('fetch(') &&
      !/from ['"]stripe['"]|import Stripe|new Stripe/.test(files.packet) &&
      !files.packet.includes('@supabase') &&
      !files.packet.includes('Resend') &&
      !files.packet.includes('writeFile') &&
      !files.packet.includes('appendFile') &&
      files.packet.includes('No deploy, promotion, checkout session, payment, webhook replay, outreach send'),
  },
  {
    name: 'paid-traffic packet records verified production before first revenue',
    ok:
      files.packet.includes(productionPromotionReceipt) &&
      files.packet.includes("status: 'ready_for_first_revenue_approval'") &&
      files.packet.includes("const productionDeploymentId = 'dpl_2hkoxV6BewU9RCWtEhWUD5XUuTJR'") &&
      files.packet.includes('Production promotion is complete; run production verification and stop on any failure.') &&
      !files.packet.includes('const exactProductionApproval ='),
  },
  {
    name: 'paid-traffic packet records release candidate and production funding URL',
    ok:
      files.packet.includes("const promotedPreviewDeploymentId = 'dpl_GAdFZyzEinPbfqXRrrkUPaqRryQC'") &&
      files.packet.includes("const promotedPreviewUrl = 'https://society-of-explorers-jzd7yvty1-chris-projects-03dec906.vercel.app'") &&
      files.packet.includes("const productionDeploymentUrl = 'https://society-of-explorers-kaxpq0qxn-chris-projects-03dec906.vercel.app'") &&
      files.packet.includes("const productionFundUrl = 'https://www.societyofexplorers.com/92b/fund'"),
  },
  {
    name: 'paid-traffic packet includes post-promotion measurement commands',
    ok:
      files.packet.includes('npm run capital:production:verify') &&
      files.packet.includes('capital:post-promotion:verify') &&
      files.packet.includes('capital:revenue:snapshot') &&
      files.packet.includes('capital:profit:gate') &&
      files.packet.includes('capital:first-revenue:readiness') &&
      files.packet.includes('After the approved action, run the aggregate revenue snapshot, profit gate, and first-revenue readiness again.'),
  },
  {
    name: 'paid-traffic packet includes a minimum live Checkout validation approval',
    ok:
      files.packet.includes(
        'Approve creating checkout sessions or payments for one 92B Supporter pledge validation from https://www.societyofexplorers.com/92b/fund using live mode.',
      ) &&
      files.packet.includes("tierId: 'supporter'") &&
      files.packet.includes("utm_campaign: '92b-live-checkout'") &&
      files.packet.includes("tier_id: 'supporter'") &&
      files.packet.includes("amount_cents: '2500'") &&
      files.packet.includes('Stop before paying if the Stripe-hosted Checkout page is not checkout.stripe.com.') &&
      files.packet.includes('Stop before paying if the Checkout amount is not USD $25.00 for SUPPORTER.'),
  },
  {
    name: 'paid-traffic packet includes a concrete first-conversion sequence',
    ok:
      files.packet.includes('firstConversionSequence') &&
      files.packet.includes("status: 'ready_for_exact_first_conversion_approval'") &&
      files.packet.includes('One verified paid 92B Checkout session on the production funding page') &&
      files.packet.includes('Supporter pledge is the smallest live validation unit') &&
      files.packet.includes('Stripe cash contribution turns positive from the current negative balance') &&
      files.packet.includes('the revenue snapshot is the only authority') &&
      files.packet.includes('Run the aggregate measurement commands and first-revenue readiness immediately after the action'),
  },
  {
    name: 'paid-traffic packet includes approval-ready first-conversion actions and drafts',
    ok:
      files.packet.includes('supporter-live-checkout-validation') &&
      files.packet.includes('one-supporter-validation-outreach') &&
      files.packet.includes('one-architect-call-ask') &&
      files.packet.includes('first-supporter-pledge-v1') &&
      files.packet.includes('First Supporter Pledge draft') &&
      files.packet.includes('one-supporter-validation') &&
      files.packet.includes('/capital/outreach-lab') &&
      files.packet.includes('92b-architect-call-v1') &&
      files.packet.includes('not equity or a financial return') &&
      files.packet.includes('not an investment or promised return') &&
      files.packet.includes('no send occurs without approved recipient/channel/draft/window') &&
      files.packet.includes('Ask one warm believer for the smallest tracked pledge') &&
      files.packet.includes('Ask one high-trust candidate for a founding strategy conversation'),
  },
  {
    name: 'paid-traffic packet tier contract matches campaign tiers',
    ok:
      files.campaign.includes("id: 'supporter'") &&
      files.campaign.includes("name: 'SUPPORTER'") &&
      files.campaign.includes('amount: 25') &&
      files.packet.includes("{ id: 'supporter', label: 'SUPPORTER', amount: 25, amountCents: 2500 }") &&
      files.campaign.includes("id: 'patron'") &&
      files.campaign.includes("name: 'PATRON'") &&
      files.campaign.includes('amount: 100') &&
      files.packet.includes("{ id: 'patron', label: 'PATRON', amount: 100, amountCents: 10000 }") &&
      files.campaign.includes("id: 'founder'") &&
      files.campaign.includes("name: 'RENAISSANCE FOUNDER'") &&
      files.campaign.includes('amount: 500') &&
      files.packet.includes("{ id: 'founder', label: 'RENAISSANCE FOUNDER', amount: 500, amountCents: 50000 }") &&
      files.campaign.includes("id: 'architect'") &&
      files.campaign.includes("name: 'ARCHITECT PATRON'") &&
      files.campaign.includes('amount: 1111') &&
      files.packet.includes("{ id: 'architect', label: 'ARCHITECT PATRON', amount: 1111, amountCents: 111100 }"),
  },
  {
    name: 'paid-traffic packet queues exact first revenue approval options',
    ok:
      files.packet.includes('Approve creating checkout sessions or payments for 92B funding page pledge validation using live mode.') &&
      files.packet.includes('Approve sending this outreach batch: [one warm recipient], [channel], First Supporter Pledge draft, [send window].') &&
      files.packet.includes('Approve sending this outreach batch: [recipients], [channels], [final draft/version], [send window].') &&
      files.packet.includes('Approve printing or placing the 92B window sign at [location] using [copy/version] and QR destination [url].'),
  },
  {
    name: 'paid-traffic packet includes stop rules for each option',
    ok:
      files.packet.includes('Stop before sharing or paying if mode, domain, amount, tier metadata, return URL, or Stripe-hosted destination differs') &&
      files.packet.includes('Stop if production is not promoted and verified') &&
      files.packet.includes('Stop if recipient, channel, copy, send window, or link target differs from the approval.') &&
      files.packet.includes('Stop if the location, copy, QR destination, permission status, or public claim differs from the approval.'),
  },
  {
    name: 'paid-traffic packet uses shared measurement commands after first-conversion actions',
    ok:
      files.packet.includes('const measurementCommands = [') &&
      files.packet.includes('const postPromotionVerifyCommand =') &&
      files.packet.includes('capital:revenue:snapshot') &&
      files.packet.includes('capital:profit:gate') &&
      files.packet.includes('capital:first-revenue:readiness') &&
      files.packet.includes('measurementCommands,') &&
      files.packet.includes('After the approved action, run the aggregate revenue snapshot, profit gate, and first-revenue readiness again.'),
  },
  {
    name: 'paid-traffic packet does not execute command text',
    ok: !/spawnSync|execFile|execSync|exec\(|createRequire|import\(/.test(files.packet),
  },
  {
    name: 'package exposes paid-traffic packet and smoke commands',
    ok:
      files.package.includes('"capital:paid-traffic:packet": "node scripts/capital-paid-traffic-packet.mjs"') &&
      files.package.includes('"capital:paid-traffic:smoke": "node scripts/capital-paid-traffic-packet-smoke.mjs"'),
  },
  {
    name: 'operator smoke runs the paid-traffic packet contract guard',
    ok:
      files.operatorSmoke.includes("label: 'Capital paid-traffic packet contract'") &&
      files.operatorSmoke.includes("'capital:paid-traffic:smoke'"),
  },
  {
    name: 'operator docs, handoff, and runbook document the paid-traffic packet',
    ok:
      files.operatorDocs.includes('capital:paid-traffic:packet') &&
      files.operatorDocs.includes('capital:paid-traffic:smoke') &&
      files.handoff.includes('capital:paid-traffic:packet') &&
      files.runbook.includes('capital:paid-traffic:packet'),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nCapital paid-traffic packet smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nCapital paid-traffic packet smoke passed.');
