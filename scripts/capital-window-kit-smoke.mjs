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
  kit: read('lib/capital/windowKit.ts'),
  route: read('app/api/admin/capital/window-kit/route.ts'),
  page: read('app/capital/window-kit/page.tsx'),
  capitalPage: read('app/capital/page.tsx'),
  routeSmoke: read('scripts/capital-route-smoke.mjs'),
  operatorSmoke: read('scripts/operator-smoke.mjs'),
  handoff: read('docs/soe-current-thread-handoff.md'),
  operator: read('docs/soe-operator-system.md'),
  privacy: read('docs/soe-privacy-threat-model.md'),
};

const modelTerms = [
  'draft_for_approval',
  'Do not print, place, publish, send, contact the landlord',
  'WINDOW_KIT_QR_URL',
  'WINDOW_KIT_QR_ASSET',
  'Founder outreach drafts',
  'Approve physical placement before printing or putting anything in the storefront window.',
  'Approve landlord conversation script before contacting the landlord.',
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
    name: 'window kit model contains QR, sign, docs, and physical-action boundary',
    ok: hasAll(files.kit, modelTerms),
  },
  {
    name: 'window kit model returns no-action readiness and receipt',
    ok:
      files.kit.includes('buildCapitalPrepReadiness') &&
      files.kit.includes('prepReceipt: buildCapitalPrepReceipt') &&
      files.kit.includes("action: 'window_kit_prepared'") &&
      files.kit.includes('No printing, placement, landlord contact, messages, charges, deploys, or publishing occurred.'),
  },
  {
    name: 'window kit route is admin-gated with private JSON responses and uses kit timestamp',
    ok:
      files.route.includes('requireCapitalAdmin') &&
      files.route.includes("privateJson({ error: 'Unauthorized' }") &&
      files.route.includes("import { privateJson } from '@/lib/http/routeError'") &&
      (files.route.match(/return privateJson\(/g) || []).length >= 2 &&
      files.route.includes('const kit = buildWindowKit()') &&
      files.route.includes('generatedAt: kit.generatedAt'),
  },
  {
    name: 'window kit page fetches private admin route and displays prep receipt',
    ok:
      files.page.includes("fetch('/api/admin/capital/window-kit'") &&
      files.page.includes('CAPITAL PREP READINESS') &&
      files.page.includes('LAST PREP RECEIPT') &&
      files.page.includes('kit.prepReceipt.detail') &&
      files.page.includes('kit.readiness.exactApprovalRequiredFor.map'),
  },
  {
    name: 'window kit page and route expose no send/import/payment/deploy providers',
    ok: lacksAll(files.page, sendCapableTerms) && lacksAll(files.route, sendCapableTerms),
  },
  {
    name: 'window kit avoids positive financial-return or secured-location claims',
    ok: !hasPositiveRisk(files.kit, riskyPositiveClaims) && !hasPositiveRisk(files.page, riskyPositiveClaims),
  },
  {
    name: 'capital command center and route smoke link window kit surface',
    ok:
      files.capitalPage.includes('href="/capital/window-kit"') &&
      files.routeSmoke.includes('/capital/window-kit') &&
      files.routeSmoke.includes('/api/admin/capital/window-kit'),
  },
  {
    name: 'operator docs and smoke include window kit receipt guard',
    ok:
      files.operatorSmoke.includes('capital:window-kit:smoke') &&
      files.handoff.includes('npm run capital:window-kit:smoke') &&
      files.operator.includes('Capital window kit') &&
      files.privacy.includes('Capital prep surfaces return local-draft-only readiness'),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nCapital window kit smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nCapital window kit smoke passed.');
