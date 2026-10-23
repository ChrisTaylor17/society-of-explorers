import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function count(source, needle) {
  return source.split(needle).length - 1;
}

function beforeEverySend(source) {
  const sendNeedle = 'await resend.emails.send';
  const sendIndexes = [];
  let index = source.indexOf(sendNeedle);
  while (index !== -1) {
    sendIndexes.push(index);
    index = source.indexOf(sendNeedle, index + sendNeedle.length);
  }

  return sendIndexes.every((sendIndex) => {
    const branchStart = Math.max(source.lastIndexOf('capitalWebhookEmailSkipReason(event)', sendIndex), 0);
    const snippet = source.slice(branchStart, sendIndex);
    return (
      snippet.includes('capitalWebhookEmailSkipReason(event)') &&
      snippet.includes('notificationSkipReason') &&
      snippet.includes('process.env.RESEND_API_KEY')
    );
  });
}

const route = read('app/api/stripe/webhook/route.ts');
const helper = read('lib/capital/webhookSafety.ts');
const packageJson = read('package.json');
const operatorSmoke = read('scripts/operator-smoke.mjs');
const envExample = read('.env.example');
const docs = {
  handoff: read('docs/soe-current-thread-handoff.md'),
  operator: read('docs/soe-operator-system.md'),
  threatModel: read('docs/soe-privacy-threat-model.md'),
  runbook: read('docs/92b-capital-launch-runbook.md'),
  approvalPacket: read('docs/92b-stripe-approval-packet.md'),
  envReadiness: read('docs/soe-env-readiness-template.md'),
};

const checks = [
  {
    name: 'webhook helper requires live-mode Stripe events and explicit notification opt-in',
    ok:
      helper.includes("event.livemode === true") &&
      helper.includes("process.env.CAPITAL_WEBHOOK_EMAIL_NOTIFICATIONS_ENABLED === 'true'") &&
      helper.includes('Stripe event is test-mode') &&
      helper.includes('outbound capital webhook email is suppressed'),
  },
  {
    name: 'Stripe webhook imports and uses capital webhook email safety guard',
    ok:
      route.includes("import { capitalWebhookEmailSkipReason } from '@/lib/capital/webhookSafety'") &&
      count(route, 'capitalWebhookEmailSkipReason(event)') >= 2,
  },
  {
    name: 'capital notification email sends remain behind safety guard and Resend key check',
    ok: count(route, 'await resend.emails.send') === 2 && beforeEverySend(route),
  },
  {
    name: 'webhook route keeps Resend lazy-loaded inside guarded branches',
    ok:
      route.includes("import { getResend } from '@/lib/email/resend'") &&
      count(route, 'getResend()') === 2 &&
      count(route, "await import('resend')") === 0 &&
      !route.includes("import { Resend } from 'resend'") &&
      !route.includes('new Resend(process.env.RESEND_API_KEY);'),
  },
  {
    name: 'env example defaults webhook notification email off',
    ok: envExample.includes('CAPITAL_WEBHOOK_EMAIL_NOTIFICATIONS_ENABLED=false'),
  },
  {
    name: 'package and operator smoke run webhook safety guard',
    ok:
      packageJson.includes('"capital:webhook-safety:smoke"') &&
      operatorSmoke.includes("npm', 'run', 'capital:webhook-safety:smoke'"),
  },
  {
    name: 'local docs record webhook email opt-in and smoke guard',
    ok:
      Object.values(docs).every((doc) => doc.includes('CAPITAL_WEBHOOK_EMAIL_NOTIFICATIONS_ENABLED')) &&
      docs.handoff.includes('capital:webhook-safety:smoke') &&
      docs.operator.includes('Capital Webhook Safety') &&
      docs.threatModel.includes('capital:webhook-safety:smoke') &&
      docs.runbook.includes('npm run capital:webhook-safety:smoke') &&
      docs.approvalPacket.includes('capital:webhook-safety:smoke'),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nCapital webhook safety smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nCapital webhook safety smoke passed.');
