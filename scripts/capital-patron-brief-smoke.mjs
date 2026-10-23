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
  brief: read('lib/capital/patronBrief.ts'),
  receipts: read('lib/capital/prepReceipts.ts'),
  route: read('app/api/admin/capital/patron-brief/route.ts'),
  page: read('app/capital/patron-brief/page.tsx'),
  capitalPage: read('app/capital/page.tsx'),
  routeSmoke: read('scripts/capital-route-smoke.mjs'),
  handoff: read('docs/soe-current-thread-handoff.md'),
  operator: read('docs/soe-operator-system.md'),
};

const requiredBriefTerms = [
  'Patronage toward a conditional Boston physical node',
  'Draft only. Do not send',
  'Architect patron',
  'Is this an investment?',
  'They do not receive equity, debt, securities, dividends, or promised financial return.',
  'Is the Boston space secured?',
  'lease status, repairs, access, and landlord alignment',
  'Do not contact, send, publish, or post from this brief without exact approval.',
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
  'no.',
  'no ',
  'without ',
  'do not',
  'never ',
  'except to explicitly reject',
  'they do not receive',
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
    name: 'patron brief contains ask ladder, objections, and conditional-space language',
    ok:
      hasAll(files.brief, requiredBriefTerms) &&
      files.brief.includes('buildCapitalPrepReadiness') &&
      files.brief.includes('prepReceipt: buildCapitalPrepReceipt') &&
      files.brief.includes("action: 'patron_brief_prepared'") &&
      files.brief.includes('No calls, messages, emails, payments, deploys, landlord contact, window placement, or publishing occurred.'),
  },
  {
    name: 'capital prep receipt helper blocks patron-brief external actions',
    ok:
      files.receipts.includes("mode: 'local_draft_only'") &&
      files.receipts.includes("externalActions: 'none'") &&
      files.receipts.includes('approvalRequiredBeforeExternalAction: true') &&
      files.receipts.includes('send outreach') &&
      files.receipts.includes('create checkout sessions or take payments') &&
      files.receipts.includes('contact the landlord'),
  },
  {
    name: 'patron brief route is admin-gated with private JSON responses',
    ok:
      files.route.includes('requireCapitalAdmin') &&
      files.route.includes("privateJson({ error: 'Unauthorized' }") &&
      files.route.includes("import { privateJson } from '@/lib/http/routeError'") &&
      (files.route.match(/return privateJson\(/g) || []).length >= 2,
  },
  {
    name: 'patron brief page fetches private admin route and exposes no send action',
    ok:
      files.page.includes("fetch('/api/admin/capital/patron-brief'") &&
      files.page.includes('Draft only') &&
      files.page.includes('CAPITAL PREP READINESS') &&
      files.page.includes('LAST PREP RECEIPT') &&
      files.page.includes('brief.prepReceipt.detail') &&
      lacksAll(files.page, sendCapableTerms) &&
      lacksAll(files.route, sendCapableTerms),
  },
  {
    name: 'patron brief avoids positive financial-return or secured-location claims',
    ok: !hasPositiveRisk(files.brief, riskyPositiveClaims),
  },
  {
    name: 'capital command center and route smoke link patron brief surface',
    ok:
      files.capitalPage.includes('href="/capital/patron-brief"') &&
      files.routeSmoke.includes('/capital/patron-brief') &&
      files.routeSmoke.includes('/api/admin/capital/patron-brief'),
  },
  {
    name: 'handoff and operator docs mention private patron brief',
    ok:
      files.handoff.includes('/capital/patron-brief') &&
      files.handoff.includes('npm run capital:patron-brief:smoke') &&
      files.operator.includes('/capital/patron-brief'),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nCapital patron brief smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nCapital patron brief smoke passed.');
