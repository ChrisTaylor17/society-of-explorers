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
  lab: read('lib/capital/outreachLab.ts'),
  receipts: read('lib/capital/prepReceipts.ts'),
  route: read('app/api/admin/capital/outreach-lab/route.ts'),
  page: read('app/capital/outreach-lab/page.tsx'),
  capitalPage: read('app/capital/page.tsx'),
  routeSmoke: read('scripts/capital-route-smoke.mjs'),
  handoff: read('docs/soe-current-thread-handoff.md'),
  operator: read('docs/soe-operator-system.md'),
};

const labTerms = [
  'Draft lab only. Do not send',
  'Use redacted labels only',
  'one-supporter-validation',
  'supporter-first-pledge',
  'first-10-architects',
  'boston-signal-5',
  'operator-feedback-8',
  'creator-intro-6',
  'Approve sending this outreach batch',
  'Ask exactly one trusted person for the smallest tracked $25 Supporter pledge',
  'Do not import contacts from Gmail, Slack, Drive, Sheets, or any other connected tool without exact approval.',
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
  'mailto:',
  'sms:',
  'window.open',
  'navigator.share',
  'fetch("https://',
  "fetch('https://",
];

const riskyPositiveClaims = [
  'guaranteed return',
  'investment return',
  'secured lease',
  'space is secured',
  'will be open',
  'profit share',
  'dividend',
];

const safeNegations = [
  'not ',
  'no ',
  'without ',
  'do not',
  'does not',
  'is not',
  'are not',
];

function hasPositiveRisk(source, terms) {
  return source
    .split(/\r?\n/)
    .some((line) => {
      const normalized = line.toLowerCase();
      if (safeNegations.some((term) => normalized.includes(term))) return false;
      return terms.some((term) => normalized.includes(term.toLowerCase()));
    });
}

const checks = [
  {
    name: 'capital prep receipts require local draft mode and exact external approval',
    ok:
      files.receipts.includes("mode: 'draft_for_approval'") &&
      files.receipts.includes("mode: 'local_draft_only'") &&
      files.receipts.includes("externalActions: 'none'") &&
      files.receipts.includes('approvalRequiredBeforeExternalAction: true') &&
      files.receipts.includes('send outreach') &&
      files.receipts.includes('contact the landlord') &&
      files.receipts.includes('place window materials'),
  },
  {
    name: 'outreach lab contains batch templates, approval text, and no-import boundary',
    ok:
      hasAll(files.lab, labTerms) &&
      files.lab.includes('buildCapitalPrepReadiness') &&
      files.lab.includes('prepReceipt: buildCapitalPrepReceipt') &&
      files.lab.includes('One Supporter validation') &&
      files.lab.includes('First Supporter Pledge') &&
      files.lab.includes('patronage, not equity or a financial return') &&
      files.lab.includes('No messages were sent, scheduled, imported, charged, deployed, placed, or published.'),
  },
  {
    name: 'outreach lab route is admin-gated with private JSON responses',
    ok:
      files.route.includes('requireCapitalAdmin') &&
      files.route.includes("privateJson({ error: 'Unauthorized' }") &&
      files.route.includes("import { privateJson } from '@/lib/http/routeError'") &&
      (files.route.match(/return privateJson\(/g) || []).length >= 2,
  },
  {
    name: 'outreach lab page fetches private admin route and stores browser-local slots only',
    ok:
      files.page.includes("fetch('/api/admin/capital/outreach-lab'") &&
      files.page.includes('window.localStorage') &&
      files.page.includes('Redacted recipient label only') &&
      files.page.includes('no private contact details') &&
      files.page.includes('CAPITAL PREP READINESS') &&
      files.page.includes('LAST PREP RECEIPT') &&
      files.page.includes('lab.prepReceipt.detail'),
  },
  {
    name: 'outreach lab page and route expose no send/import/payment/deploy providers',
    ok: lacksAll(files.page, sendCapableTerms) && lacksAll(files.route, sendCapableTerms),
  },
  {
    name: 'outreach lab avoids positive financial-return or secured-location claims',
    ok: !hasPositiveRisk(files.lab, riskyPositiveClaims),
  },
  {
    name: 'capital command center and route smoke link outreach lab surface',
    ok:
      files.capitalPage.includes('href="/capital/outreach-lab"') &&
      files.routeSmoke.includes('/capital/outreach-lab') &&
      files.routeSmoke.includes('/api/admin/capital/outreach-lab'),
  },
  {
    name: 'handoff and operator docs mention private outreach lab',
    ok:
      files.handoff.includes('/capital/outreach-lab') &&
      files.handoff.includes('npm run capital:outreach-lab:smoke') &&
      files.operator.includes('/capital/outreach-lab'),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nCapital outreach lab smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nCapital outreach lab smoke passed.');
