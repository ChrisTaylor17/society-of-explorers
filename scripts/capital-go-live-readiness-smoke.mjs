#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

const files = {
  readiness: read('scripts/capital-go-live-readiness.mjs'),
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
    name: 'go-live readiness requires explicit Vercel and Stripe read flags',
    ok:
      files.readiness.includes("const allowedArgs = new Set(['--vercel-read', '--stripe-read', '--json'])") &&
      files.readiness.includes('Refusing to inspect go-live readiness without both --vercel-read and --stripe-read.') &&
      files.readiness.includes('Usage: npm run capital:go-live:readiness -- --vercel-read --stripe-read [--json]'),
  },
  {
    name: 'go-live readiness only runs read-only Vercel inspect, local verifiers, and live payment readiness',
    ok:
      files.readiness.includes('result.stdout') &&
      files.readiness.includes('result.stderr') &&
      files.readiness.includes('function extractJsonObject(output)') &&
      files.readiness.includes("'npx', ['vercel', 'inspect', productionUrl]") &&
      files.readiness.includes("'npx', ['vercel', 'inspect', deploymentId]") &&
      files.readiness.includes("['scripts/capital-production-postlaunch.mjs', '--soft', '--json'") &&
      files.readiness.includes("'capital:live-payment:readiness'") &&
      files.readiness.includes("'--stripe-read'") &&
      !/vercel['"],\s*['"]promote|vercel['"],\s*['"]rollback|vercel['"],\s*['"]deploy|stripe\.checkout\.sessions\.create|fetch\(/.test(files.readiness),
  },
  {
    name: 'go-live readiness preserves exact promotion approval and command text only',
    ok:
      files.readiness.includes(exactApproval) &&
      files.readiness.includes('promotionCommandAfterApproval') &&
      files.readiness.includes('npx vercel promote ${deploymentId}') &&
      files.readiness.includes('rollbackCommandIfVerificationFails') &&
      files.readiness.includes('npx vercel rollback ${expectedCurrentProductionDeploymentId}'),
  },
  {
    name: 'go-live readiness verifies current production rollback target and preview identity',
    ok:
      files.readiness.includes("const expectedCurrentProductionDeploymentId = 'dpl_A3UZ6YV9EE6vmdfFWvDDMnektEYC'") &&
      files.readiness.includes("const deploymentId = 'dpl_GAdFZyzEinPbfqXRrrkUPaqRryQC'") &&
      files.readiness.includes("const previewUrl = 'https://society-of-explorers-jzd7yvty1-chris-projects-03dec906.vercel.app'") &&
      files.readiness.includes("productionInspect.id === expectedCurrentProductionDeploymentId") &&
      files.readiness.includes("previewInspect.id === deploymentId") &&
      files.readiness.includes("previewInspect.url === previewUrl"),
  },
  {
    name: 'go-live readiness reports verifier pass/fail evidence and approval status',
    ok:
      files.readiness.includes("status = readyForApproval ? 'ready_for_exact_production_approval' : 'not_ready_for_promotion'") &&
      files.readiness.includes('productionReport.failed > 0') &&
      files.readiness.includes('previewReport.failed === 0') &&
      files.readiness.includes('livePaymentReadiness.ready === true') &&
      files.readiness.includes('livePaymentReady') &&
      files.readiness.includes('Live payment readiness:') &&
      files.readiness.includes('capital:live-payment:readiness') &&
      files.readiness.includes('process.exitCode = 1') &&
      files.readiness.includes('No deploy, promotion, rollback, checkout session, payment, webhook replay'),
  },
  {
    name: 'go-live packet points operators to readiness before packet-only planning',
    ok:
      files.packet.includes('npm run capital:go-live:readiness -- --vercel-read --stripe-read') &&
      files.packet.includes('prePromotionReadiness') &&
      files.packet.includes('capital:first-revenue:readiness') &&
      files.packet.includes('capital:post-promotion:verify') &&
      files.readiness.includes('capital:first-revenue:readiness') &&
      files.readiness.includes('capital:post-promotion:verify'),
  },
  {
    name: 'package exposes go-live readiness and smoke commands',
    ok:
      files.package.includes('"capital:go-live:readiness": "node scripts/capital-go-live-readiness.mjs"') &&
      files.package.includes('"capital:go-live:readiness:smoke": "node scripts/capital-go-live-readiness-smoke.mjs"'),
  },
  {
    name: 'operator smoke runs the go-live readiness contract guard',
    ok:
      files.operatorSmoke.includes("label: 'Capital go-live readiness contract'") &&
      files.operatorSmoke.includes("'capital:go-live:readiness:smoke'"),
  },
  {
    name: 'operator docs, handoff, and runbook document go-live readiness',
    ok:
      files.operatorDocs.includes('capital:go-live:readiness') &&
      files.operatorDocs.includes('capital:go-live:readiness:smoke') &&
      files.handoff.includes('capital:go-live:readiness') &&
      files.runbook.includes('capital:go-live:readiness'),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nCapital go-live readiness smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nCapital go-live readiness smoke passed.');
