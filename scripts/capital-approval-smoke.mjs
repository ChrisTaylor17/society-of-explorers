#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function hasAll(source, terms) {
  return terms.every((term) => source.includes(term));
}

function lacksAll(source, terms) {
  const normalized = source.toLowerCase();
  return terms.every((term) => !normalized.includes(term.toLowerCase()));
}

const files = {
  checklist: read('lib/capital/approvalChecklist.ts'),
  receipts: read('lib/capital/prepReceipts.ts'),
  route: read('app/api/admin/capital/approvals/route.ts'),
  page: read('app/capital/approvals/page.tsx'),
  capitalPage: read('app/capital/page.tsx'),
  launchRoom: read('lib/capital/launchRoom.ts'),
  routeSmoke: read('scripts/capital-route-smoke.mjs'),
  handoff: read('docs/soe-current-thread-handoff.md'),
  externalMatrix: read('docs/soe-external-action-approval-matrix.md'),
};

const approvalPhrases = [
  'Approve setting STRIPE_PRICE_ORACLE',
  'Approve applying Supabase migration',
  'Approve running Stripe test checkout',
  'Approve replaying Stripe test webhook events',
  'Approve deploying',
  'Approve creating checkout sessions or payments',
  'Approve printing or placing the 92B window sign',
  'Approve contacting the landlord',
  'Approve sending this outreach batch',
  'Approve publishing creator content',
  'Approve connected-tool mutation',
  'Approve browser/computer automation',
];

const sendCapableTerms = [
  'resend',
  'sendgrid',
  'postmark',
  'twilio',
  'nodemailer',
  'gmail.users.messages.send',
  'chat.postMessage',
  'stripe.checkout.sessions.create',
  'stripe.webhookEndpoints.create',
  'vercel deploy',
  'supabase db push',
];

const checks = [
  {
    name: 'approval checklist model includes exact approval phrases for external action classes',
    ok: hasAll(files.checklist, approvalPhrases),
  },
  {
    name: 'approval checklist model states local review does not authorize external action',
    ok:
      files.checklist.includes('This checklist is local review state only') &&
      files.checklist.includes('Checking an item here does not authorize external action') &&
      files.checklist.includes('buildCapitalPrepReadiness') &&
      files.checklist.includes('prepReceipt: buildCapitalPrepReceipt') &&
      files.checklist.includes("action: 'approval_packet_prepared'") &&
      files.checklist.includes('No approvals were granted') &&
      files.checklist.includes('browser-effect clicks, or window actions occurred.'),
  },
  {
    name: 'approval checklist receipt helper blocks external approval side effects',
    ok:
      files.receipts.includes("mode: 'local_draft_only'") &&
      files.receipts.includes("externalActions: 'none'") &&
      files.receipts.includes('approvalRequiredBeforeExternalAction: true') &&
      files.receipts.includes('deploy or publish public changes') &&
      files.receipts.includes('mutate Gmail, Slack, Drive, Sheets, Vercel, Supabase, Stripe, or other third-party systems'),
  },
  {
    name: 'approval checklist route is admin-gated with private JSON responses',
    ok:
      files.route.includes('requireCapitalAdmin') &&
      files.route.includes("privateJson({ error: 'Unauthorized' }") &&
      files.route.includes("import { privateJson } from '@/lib/http/routeError'") &&
      (files.route.match(/return privateJson\(/g) || []).length >= 2,
  },
  {
    name: 'approval checklist page fetches admin route and stores browser-local review state only',
    ok:
      files.page.includes("fetch('/api/admin/capital/approvals'") &&
      files.page.includes('window.localStorage') &&
      files.page.includes('localStorage.setItem') &&
      files.page.includes('localStorage.removeItem') &&
      files.page.includes('Checking an item here does not authorize external action') &&
      files.page.includes('LAST PREP RECEIPT') &&
      files.page.includes('checklist.prepReceipt.detail') &&
      files.page.includes('checklist.prepReadiness.externalActions'),
  },
  {
    name: 'approval checklist page does not import send/deploy/payment-capable providers',
    ok: lacksAll(files.page, sendCapableTerms) && lacksAll(files.route, sendCapableTerms),
  },
  {
    name: 'capital command center links to private approvals page',
    ok: files.capitalPage.includes('href="/capital/approvals"') && files.capitalPage.includes('APPROVALS'),
  },
  {
    name: 'launch room and route smoke include approvals checks',
    ok:
      files.launchRoom.includes('Approval checklist smoke guard') &&
      files.routeSmoke.includes('/capital/approvals') &&
      files.routeSmoke.includes('/api/admin/capital/approvals'),
  },
  {
    name: 'handoff and external matrix document approvals surface',
    ok:
      files.handoff.includes('/capital/approvals') &&
      files.handoff.includes('npm run capital:approvals:smoke') &&
      files.externalMatrix.includes('/capital/approvals'),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nCapital approval smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nCapital approval smoke passed.');
