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

const files = {
  matrix: read('docs/soe-external-action-approval-matrix.md'),
  handoff: read('docs/soe-current-thread-handoff.md'),
  operator: read('docs/soe-operator-system.md'),
  runbook: read('docs/92b-capital-launch-runbook.md'),
  outreachQueue: read('docs/92b-outreach-approval-queue.md'),
};

const approvalPhrases = [
  'Approve setting STRIPE_PRICE_ORACLE',
  'Approve applying Supabase migration',
  'Approve running Stripe test checkout',
  'Approve replaying Stripe test webhook events',
  'Approve deploying',
  'Approve creating checkout sessions or payments',
  'Approve running external provider call',
  'Approve sending this outreach batch',
  'Approve contacting the landlord',
  'Approve printing or placing the 92B window sign',
  'Approve publishing creator content',
  'Approve connected-tool mutation',
  'Approve browser/computer automation',
];

const blockedExternalActions = [
  'sends',
  'publishes',
  'deploys',
  'charges money',
  'creates checkout sessions',
  'replays webhooks',
  'applies production migrations',
  'calls external AI/media providers',
  'mutates a connected tool',
  'contacts a person',
  'physically places material',
];

const connectedToolTerms = [
  'Gmail',
  'Slack',
  'Google Drive',
  'Google Calendar',
  'Canva',
  'Docs',
  'Sheets',
  'Slides',
];

const approvalMatrixRows = files.matrix
  .split('\n')
  .filter((line) => line.startsWith('| ') && !line.includes('| ---') && !line.includes('| Action |'))
  .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));

const incompleteApprovalRows = approvalMatrixRows.filter((cells) => {
  if (cells.length !== 7) {
    return true;
  }

  const [action, defaultStatus, exactApproval, prerequisites, verification, stopRule, readOnlyPrep] = cells;

  return (
    !action ||
    defaultStatus !== 'Blocked' ||
    !/^`Approve .+`\.?$/.test(exactApproval) ||
    [prerequisites, verification, stopRule, readOnlyPrep].some(
      (cell) => !cell || /\b(?:TBD|TODO|unknown)\b/i.test(cell),
    )
  );
});

const exactApprovalTexts = approvalMatrixRows.map((cells) => cells[2]).filter(Boolean);
const duplicateExactApprovals = exactApprovalTexts.filter(
  (approvalText, index) => exactApprovalTexts.indexOf(approvalText) !== index,
);

const checks = [
  {
    name: 'approval matrix contains exact approval phrases for all blocked external action classes',
    ok: hasAll(files.matrix, approvalPhrases),
  },
  {
    name: 'approval matrix rows stay blocked and fully specified',
    ok: approvalMatrixRows.length > 0 && incompleteApprovalRows.length === 0,
  },
  {
    name: 'approval matrix exact approval phrases stay unique',
    ok: duplicateExactApprovals.length === 0,
  },
  {
    name: 'approval matrix defines broad permission as insufficient for external mutation',
    ok:
      files.matrix.includes('Broad permission such as "take over the computer" does not authorize an external mutation') &&
      hasAll(files.matrix, blockedExternalActions),
  },
  {
    name: 'approval matrix covers connected tools and browser/computer automation explicitly',
    ok:
      hasAll(files.matrix, connectedToolTerms) &&
      files.matrix.includes('browser/computer automation') &&
      files.matrix.includes('payment') &&
      files.matrix.includes('deploy'),
  },
  {
    name: 'launch handoff links the external action approval matrix',
    ok:
      files.handoff.includes('docs/soe-external-action-approval-matrix.md') &&
      files.handoff.includes('npm run external:boundary:smoke'),
  },
  {
    name: 'operator system links the external action approval matrix and smoke check',
    ok:
      files.operator.includes('External action approval matrix') &&
      files.operator.includes('npm run external:boundary:smoke'),
  },
  {
    name: 'approval matrix links external effect route inventory',
    ok:
      files.matrix.includes('docs/soe-external-effect-route-inventory.md') &&
      files.matrix.includes('send, publish, charge, fulfill, mint, or call external providers'),
  },
  {
    name: 'capital runbook points operators to the approval matrix',
    ok:
      files.runbook.includes('docs/soe-external-action-approval-matrix.md') &&
      files.runbook.includes('exact approval text'),
  },
  {
    name: 'outreach queue still blocks sending without recipient/channel/final-copy approval',
    ok:
      files.outreachQueue.includes('Do not send, schedule, import, DM, email, text, call, post, or automate any outreach') &&
      files.outreachQueue.includes('explicit approval of the recipient, channel, and final copy'),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nExternal action boundary smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nExternal action boundary smoke passed.');
