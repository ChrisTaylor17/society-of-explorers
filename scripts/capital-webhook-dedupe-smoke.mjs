import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function count(source, needle) {
  return source.split(needle).length - 1;
}

function sliceBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  if (start === -1 || end === -1) return '';
  return source.slice(start, end);
}

function before(source, first, second) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  return firstIndex !== -1 && secondIndex !== -1 && firstIndex < secondIndex;
}

function beforeAll(source, first, needles) {
  return needles.every((needle) => before(source, first, needle));
}

const route = read('app/api/stripe/webhook/route.ts');
const packageJson = read('package.json');
const operatorSmoke = read('scripts/operator-smoke.mjs');
const docs = {
  handoff: read('docs/soe-current-thread-handoff.md'),
  operator: read('docs/soe-operator-system.md'),
  threatModel: read('docs/soe-privacy-threat-model.md'),
  runbook: read('docs/92b-capital-launch-runbook.md'),
  approvalPacket: read('docs/92b-stripe-approval-packet.md'),
};

const ninetyTwoBranch = sliceBetween(
  route,
  "if (session.metadata?.type === '92b_pledge')",
  '// --- PROJECT PLEDGE HANDLING ---',
);

const projectBranch = sliceBetween(
  route,
  "if (session.metadata?.type === 'project_pledge')",
  '// --- MEMBERSHIP SUBSCRIPTION HANDLING ---',
);

const ninetyTwoDuplicateBlock = sliceBetween(
  ninetyTwoBranch,
  'if (!ledger.isNew)',
  "await supabaseAdmin.from('founding_interest').insert",
);

const projectDuplicateBlock = sliceBetween(
  projectBranch,
  'if (!ledger.isNew)',
  '// Increment project funding',
);

const ninetyTwoSideEffects = [
  "await supabaseAdmin.from('founding_interest').insert",
  "await supabaseAdmin.from('members').update",
  "await supabaseAdmin.from('exp_events').insert",
  'await resend.emails.send',
];

const projectSideEffects = [
  "await supabaseAdmin.from('projects').update",
  "await supabaseAdmin.from('founding_interest').insert",
  "await supabaseAdmin.from('members').update",
  "await supabaseAdmin.from('exp_events').insert",
  'await resend.emails.send',
];

const checks = [
  {
    name: 'webhook imports paid pledge ledger and pledge type constants',
    ok:
      route.includes("import { recordPaidPledge } from '@/lib/capital/pledgeLedger'") &&
      route.includes('PLEDGE_TYPES'),
  },
  {
    name: '92B branch records paid pledge before any downstream side effect',
    ok:
      ninetyTwoBranch.includes('recordPaidPledge({') &&
      ninetyTwoBranch.includes('pledgeType: PLEDGE_TYPES.NINETY_TWO_B') &&
      beforeAll(ninetyTwoBranch, 'recordPaidPledge({', ninetyTwoSideEffects),
  },
  {
    name: '92B branch exits duplicate webhook events before lead, EXP, or email side effects',
    ok:
      ninetyTwoDuplicateBlock.includes('if (!ledger.isNew)') &&
      ninetyTwoDuplicateBlock.includes('Duplicate 92B pledge ignored') &&
      ninetyTwoDuplicateBlock.includes('break;'),
  },
  {
    name: 'project branch records paid pledge before project, lead, EXP, or email side effects',
    ok:
      projectBranch.includes('recordPaidPledge({') &&
      projectBranch.includes('pledgeType: PLEDGE_TYPES.PROJECT') &&
      projectBranch.includes('projectId') &&
      beforeAll(projectBranch, 'recordPaidPledge({', projectSideEffects),
  },
  {
    name: 'project branch exits duplicate webhook events before project, lead, EXP, or email side effects',
    ok:
      projectDuplicateBlock.includes('if (!ledger.isNew)') &&
      projectDuplicateBlock.includes('Duplicate project pledge ignored') &&
      projectDuplicateBlock.includes('break;'),
  },
  {
    name: 'webhook keeps exactly one paid pledge ledger call for each capital pledge branch',
    ok: count(route, 'recordPaidPledge({') === 2,
  },
  {
    name: 'package and operator smoke run webhook dedupe guard',
    ok:
      packageJson.includes('"capital:webhook-dedupe:smoke"') &&
      operatorSmoke.includes("npm', 'run', 'capital:webhook-dedupe:smoke'"),
  },
  {
    name: 'local docs record webhook dedupe guard and duplicate replay boundary',
    ok:
      Object.values(docs).every((doc) => doc.includes('capital:webhook-dedupe:smoke')) &&
      docs.handoff.includes('duplicate webhook events do not double-count') &&
      docs.operator.includes('Capital Webhook Dedupe') &&
      docs.threatModel.includes('webhook dedupe') &&
      docs.runbook.includes('Webhook replay does not double-count') &&
      docs.approvalPacket.includes('webhook replay approval'),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nCapital webhook dedupe smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nCapital webhook dedupe smoke passed.');
