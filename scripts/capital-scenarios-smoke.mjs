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
  planner: read('lib/capital/scenarioPlanner.ts'),
  receipts: read('lib/capital/prepReceipts.ts'),
  route: read('app/api/admin/capital/scenarios/route.ts'),
  page: read('app/capital/scenarios/page.tsx'),
  capitalPage: read('app/capital/page.tsx'),
  routeSmoke: read('scripts/capital-route-smoke.mjs'),
  handoff: read('docs/soe-current-thread-handoff.md'),
  operator: read('docs/soe-operator-system.md'),
};

const plannerTerms = [
  'CAPITAL_CAMPAIGN_GOAL_DOLLARS',
  'NINETY_TWO_B_TIERS',
  'High-trust compact circle',
  'Architect-led first circle',
  'Balanced community campaign',
  'Community-wide patronage',
  'Private planning only',
  'Do not treat scenario math as pledged revenue.',
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
    name: 'scenario planner uses real capital goal and 92B tier constants',
    ok:
      hasAll(files.planner, plannerTerms) &&
      files.planner.includes('buildCapitalPrepReadiness') &&
      files.planner.includes('prepReceipt: buildCapitalPrepReceipt') &&
      files.planner.includes("action: 'scenario_planner_prepared'") &&
      files.planner.includes('No pledges, payments, checkout sessions, outreach, deploys, landlord contact, window actions, or public claims occurred.'),
  },
  {
    name: 'scenario planner prep receipt blocks money/action side effects',
    ok:
      files.receipts.includes("'scenario_planner_prepared'") &&
      files.receipts.includes("externalActions: 'none'") &&
      files.receipts.includes('approvalRequiredBeforeExternalAction: true') &&
      files.receipts.includes('create checkout sessions or take payments'),
  },
  {
    name: 'scenario planner route is admin-gated with private JSON responses',
    ok:
      files.route.includes('requireCapitalAdmin') &&
      files.route.includes("privateJson({ error: 'Unauthorized' }") &&
      files.route.includes("import { privateJson } from '@/lib/http/routeError'") &&
      (files.route.match(/return privateJson\(/g) || []).length >= 2,
  },
  {
    name: 'scenario planner page fetches private admin route and has no external action providers',
    ok:
      files.page.includes("fetch('/api/admin/capital/scenarios'") &&
      files.page.includes('It is planning math, not pledged revenue.') &&
      files.page.includes('CAPITAL PREP READINESS') &&
      files.page.includes('LAST PREP RECEIPT') &&
      files.page.includes('planner.prepReceipt.detail') &&
      lacksAll(files.page, sendCapableTerms) &&
      lacksAll(files.route, sendCapableTerms),
  },
  {
    name: 'scenario planner avoids positive financial-return or secured-location claims',
    ok: !hasPositiveRisk(files.planner, riskyPositiveClaims),
  },
  {
    name: 'capital command center and route smoke link scenario planner surface',
    ok:
      files.capitalPage.includes('href="/capital/scenarios"') &&
      files.routeSmoke.includes('/capital/scenarios') &&
      files.routeSmoke.includes('/api/admin/capital/scenarios'),
  },
  {
    name: 'handoff and operator docs mention private scenario planner',
    ok:
      files.handoff.includes('/capital/scenarios') &&
      files.handoff.includes('npm run capital:scenarios:smoke') &&
      files.operator.includes('/capital/scenarios'),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nCapital scenario smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nCapital scenario smoke passed.');
