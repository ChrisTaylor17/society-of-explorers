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
  model: read('lib/capital/weeklyReview.ts'),
  receipts: read('lib/capital/prepReceipts.ts'),
  route: read('app/api/admin/capital/weekly-review/route.ts'),
  page: read('app/capital/weekly-review/page.tsx'),
  capitalPage: read('app/capital/page.tsx'),
  capitalApi: read('app/api/admin/capital/route.ts'),
  launchReadiness: read('lib/capital/launchReadiness.ts'),
  launchRoom: read('lib/capital/launchRoom.ts'),
  routeSmoke: read('scripts/capital-route-smoke.mjs'),
  operatorSmoke: read('scripts/operator-smoke.mjs'),
  handoff: read('docs/soe-current-thread-handoff.md'),
  operator: read('docs/soe-operator-system.md'),
  runbook: read('docs/92b-capital-launch-runbook.md'),
};

const modelTerms = [
  'soe.capital.weeklyReview.v1',
  'Cash collected',
  'Committed pledges',
  'Strongest story',
  'Top objection',
  'Next ask',
  'Local review only.',
  'Do not treat local notes as pledge ledger data.',
  'Do not store private names, emails, phone numbers, wallet addresses, payment ids, or relationship history',
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
  'unable to',
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
    name: 'weekly review model contains campaign metrics, review questions, and local-only boundary',
    ok:
      hasAll(files.model, modelTerms) &&
      files.model.includes('buildCapitalPrepReadiness') &&
      files.model.includes('prepReceipt: buildCapitalPrepReceipt') &&
      files.model.includes("action: 'weekly_review_prepared'") &&
      files.model.includes('No ledger rows, CRM records, messages, checkout sessions, deploys, landlord contact, window actions, connected-tool mutations, or public posts occurred.'),
  },
  {
    name: 'weekly review prep receipt blocks CRM, ledger, and external action side effects',
    ok:
      files.receipts.includes("'weekly_review_prepared'") &&
      files.receipts.includes("externalActions: 'none'") &&
      files.receipts.includes('approvalRequiredBeforeExternalAction: true') &&
      files.receipts.includes('mutate Gmail, Slack, Drive, Sheets, Vercel, Supabase, Stripe, or other third-party systems'),
  },
  {
    name: 'weekly review route is admin-gated with private JSON responses',
    ok:
      files.route.includes('requireCapitalAdmin') &&
      files.route.includes("privateJson({ error: 'Unauthorized' }") &&
      files.route.includes("import { privateJson } from '@/lib/http/routeError'") &&
      (files.route.match(/return privateJson\(/g) || []).length >= 2,
  },
  {
    name: 'weekly review page fetches private admin route and stores browser-local notes only',
    ok:
      files.page.includes("fetch('/api/admin/capital/weekly-review'") &&
      files.page.includes('window.localStorage') &&
      files.page.includes('Saved only in this browser') &&
      files.page.includes('Use redacted summaries only') &&
      files.page.includes('CAPITAL PREP READINESS') &&
      files.page.includes('LAST PREP RECEIPT') &&
      files.page.includes('review.prepReceipt.detail'),
  },
  {
    name: 'weekly review page and route expose no send/import/payment/deploy providers',
    ok: lacksAll(files.page, sendCapableTerms) && lacksAll(files.route, sendCapableTerms),
  },
  {
    name: 'weekly review avoids positive financial-return or secured-location claims',
    ok: !hasPositiveRisk(files.model, riskyPositiveClaims) && !hasPositiveRisk(files.page, riskyPositiveClaims),
  },
  {
    name: 'capital command center and admin API link weekly review surface',
    ok:
      files.capitalPage.includes('href="/capital/weekly-review"') &&
      files.capitalApi.includes('/capital/weekly-review') &&
      files.capitalApi.includes('money collected, committed pledges, strongest story, top objection, and next ask'),
  },
  {
    name: 'readiness, launch room, route smoke, and operator smoke include weekly review',
    ok:
      files.launchReadiness.includes('app/capital/weekly-review/page.tsx') &&
      files.launchRoom.includes('npm run capital:weekly-review:smoke') &&
      files.routeSmoke.includes('/capital/weekly-review') &&
      files.routeSmoke.includes('/api/admin/capital/weekly-review') &&
      files.operatorSmoke.includes('capital:weekly-review:smoke'),
  },
  {
    name: 'handoff, operator docs, and runbook mention private weekly review',
    ok:
      files.handoff.includes('/capital/weekly-review') &&
      files.handoff.includes('npm run capital:weekly-review:smoke') &&
      files.operator.includes('/capital/weekly-review') &&
      files.runbook.includes('/capital/weekly-review'),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nCapital weekly review smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nCapital weekly review smoke passed.');
