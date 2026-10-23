#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as ts from 'typescript';

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function walkFiles(relativeDir, predicate) {
  const results = [];
  const absoluteDir = join(root, relativeDir);
  for (const entry of readdirSync(absoluteDir)) {
    const absolutePath = join(absoluteDir, entry);
    const relativePath = join(relativeDir, entry);
    if (statSync(absolutePath).isDirectory()) {
      results.push(...walkFiles(relativePath, predicate));
    } else if (predicate(relativePath)) {
      results.push(relativePath);
    }
  }
  return results;
}

function selectBlocks(source) {
  const blocks = [];
  const regex = /\.select\(([\s\S]*?)\)/g;
  let match;
  while ((match = regex.exec(source))) blocks.push(match[1]);
  return blocks;
}

function normalizeKey(key) {
  return String(key).replace(/[^a-z0-9]/gi, '').toLowerCase();
}

const forbiddenResponseKeys = new Map([
  ['email', 'raw email address'],
  ['emailaddress', 'raw email address'],
  ['phone', 'raw phone number'],
  ['phonenumber', 'raw phone number'],
  ['wallet', 'raw wallet identifier'],
  ['walletaddress', 'raw wallet address'],
  ['stripecustomer', 'Stripe customer id'],
  ['stripecustomerid', 'Stripe customer id',
  ],
  ['customerid', 'customer id'],
  ['paymentintent', 'Stripe payment intent'],
  ['paymentintentid', 'Stripe payment intent id'],
  ['checkoutsession', 'Stripe checkout session'],
  ['checkoutsessionid', 'Stripe checkout session id'],
  ['sessionid', 'external session id'],
  ['fullname', 'full legal or contact name'],
  ['firstname', 'first name'],
  ['lastname', 'last name'],
  ['rawnotes', 'raw private notes'],
  ['privatenotes', 'private notes'],
  ['patronnotes', 'patron notes'],
]);

const forbiddenSelectTerms = [
  'email',
  'phone',
  'wallet',
  'wallet_address',
  'stripe',
  'customer',
  'payment_intent',
  'checkout_session',
  'session_id',
  'full_name',
  'first_name',
  'last_name',
];

const allowedPipelinePrivateKeys = new Set([
  'display_label',
  'relationship_context',
  'notes_redacted',
]);

function forbiddenKeyFinding(key, path) {
  const normalized = normalizeKey(key);
  if (forbiddenResponseKeys.has(normalized)) {
    return `${path}: ${forbiddenResponseKeys.get(normalized)} exposed as "${key}"`;
  }
  if (normalized.includes('stripe') && (normalized.includes('customer') || normalized.includes('payment') || normalized.includes('checkout'))) {
    return `${path}: Stripe identifier-like key exposed as "${key}"`;
  }
  return null;
}

function scanShape(value, path = '$') {
  const findings = [];
  if (!value || typeof value !== 'object') return findings;

  if (Array.isArray(value)) {
    value.forEach((item, index) => findings.push(...scanShape(item, `${path}[${index}]`)));
    return findings;
  }

  for (const [key, nested] of Object.entries(value)) {
    const keyFinding = forbiddenKeyFinding(key, `${path}.${key}`);
    if (keyFinding) findings.push(keyFinding);
    findings.push(...scanShape(nested, `${path}.${key}`));
  }
  return findings;
}

function propertyNameText(name, sourceFile) {
  if (!name) return '<anonymous>';
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return name.getText(sourceFile);
}

function collectObjectLiteralKeys(node, sourceFile, path = '$', findings = [], spreads = []) {
  for (const property of node.properties) {
    if (ts.isSpreadAssignment(property)) {
      spreads.push({ path, expression: property.expression.getText(sourceFile) });
      continue;
    }

    if (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property) || ts.isMethodDeclaration(property)) {
      const key = propertyNameText(property.name, sourceFile);
      const nextPath = `${path}.${key}`;
      const keyFinding = forbiddenKeyFinding(key, nextPath);
      if (keyFinding) findings.push(keyFinding);

      if (ts.isPropertyAssignment(property)) {
        if (ts.isObjectLiteralExpression(property.initializer)) {
          collectObjectLiteralKeys(property.initializer, sourceFile, nextPath, findings, spreads);
        } else if (ts.isArrayLiteralExpression(property.initializer)) {
          property.initializer.elements.forEach((element, index) => {
            if (ts.isObjectLiteralExpression(element)) {
              collectObjectLiteralKeys(element, sourceFile, `${nextPath}[${index}]`, findings, spreads);
            }
          });
        }
      }
    }
  }
  return { findings, spreads };
}

const jsonResponseCallNames = new Set(['privateJson', 'commandCenterJson', 'pipelineJson']);

function isJsonResponseCall(node, sourceFile) {
  if (
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === 'json' &&
    node.expression.expression.getText(sourceFile) === 'NextResponse'
  ) {
    return true;
  }

  return ts.isIdentifier(node.expression) && jsonResponseCallNames.has(node.expression.text);
}

function collectJsonResponseShapes(relativePath) {
  const source = read(relativePath);
  const sourceFile = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const results = [];

  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      isJsonResponseCall(node, sourceFile)
    ) {
      const [firstArg] = node.arguments;
      if (firstArg && ts.isObjectLiteralExpression(firstArg)) {
        results.push(collectObjectLiteralKeys(firstArg, sourceFile, relativePath));
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return results;
}

function collectTypePropertyKeys(relativePath) {
  const source = read(relativePath);
  const sourceFile = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const keys = [];

  function visit(node) {
    if (ts.isPropertySignature(node)) keys.push(propertyNameText(node.name, sourceFile));
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return keys;
}

function includesForbiddenSelect(blocks) {
  return blocks.some((block) => {
    const normalized = block.toLowerCase();
    return forbiddenSelectTerms.some((term) => normalized.includes(term));
  });
}

const capitalCommandFixture = {
  campaign: {
    name: '92B Founding Node',
    goal: 120000,
    stance: 'Conditional physical anchor',
    externalActionBoundary: 'Draft for approval',
  },
  prepReadiness: {
    mode: 'draft_for_approval',
    externalActions: 'none',
    approvalRequiredBeforeExternalAction: true,
    receiptRequiredForPrep: true,
    exactApprovalRequiredFor: ['recipient or audience'],
    localOnlySurfaces: ['/capital'],
    boundary: 'No external action.',
  },
  prepReceipt: {
    action: 'command_center_loaded',
    generatedAt: '2026-05-28T00:00:00.000Z',
    mode: 'local_draft_only',
    externalActions: 'none',
    approvalRequiredBeforeExternalAction: true,
    allowedUse: 'Review aggregate metrics.',
    blockedActions: ['send outreach'],
    detail: 'No external action occurred.',
  },
  metrics: {
    membersTotal: 7,
    paidMembers: 2,
    tierCounts: { seeker: 2 },
    foundingInterestCount: 8,
    leadBuckets: { ninetyTwoB: 3, projects: 2, salons: 1, general: 2 },
    projectsTotal: 6,
    activeProjects: 6,
    projectRaised: 0,
    pledgeLedgerAvailable: true,
    pledgeLedgerRaised: 0,
    pledgeLedgerByType: { '92b': 0 },
    movementScripts: { draft: 3 },
    pipelineTotal: 0,
    pipelinePledgeIntent: 0,
  },
  projects: [
    {
      id: 'project-id',
      title: 'Project title',
      status: 'active',
      fundingGoal: 10000,
      amountRaised: 0,
      backerCount: 0,
      hasUseOfFunds: true,
      updateCount: 0,
    },
  ],
  operations: {
    launchChecks: [{ id: 'admin-privacy', label: 'Admin privacy boundary', status: 'ready', detail: 'aggregate', nextAction: 'keep redacted' }],
    pipeline: {
      available: true,
      summary: {
        total: 0,
        byStatus: {},
        bySegment: {},
        pledgeIntentCents: 0,
        nextActions: [],
        noSendBoundary: 'No sending.',
      },
      nextActions: [],
    },
    nextActions: [],
    draftMaterials: [],
  },
};

const pipelineFixture = {
  available: true,
  leads: [
    {
      id: 'lead-id',
      display_label: 'Redacted lead label',
      relationship_context: 'Redacted source context only',
      segment: 'warm_believer',
      channel: 'email',
      draft_key: 'architect_patron',
      status: 'candidate',
      pledge_status: 'none',
      pledge_amount_cents: 0,
      objection: null,
      next_action_at: null,
      source_utm: 'warm_outreach',
      notes_redacted: 'No private contact details',
      approved_at: null,
      sent_at: null,
      responded_at: null,
      closed_at: null,
      created_at: '2026-05-28T00:00:00.000Z',
      updated_at: '2026-05-28T00:00:00.000Z',
    },
  ],
  summary: {
    available: true,
    total: 1,
    byStatus: { candidate: 1 },
    bySegment: { warm_believer: 1 },
    pledgeIntentCents: 0,
    nextActions: [],
    noSendBoundary: 'No sending.',
  },
  options: {},
  boundary: 'No sending.',
};

const adminRouteFiles = walkFiles('app/api/admin/capital', (relativePath) => relativePath.endsWith('/route.ts'));
const privateJsonHelper = read('lib/http/routeError.ts');

function privateHeaderSetPattern(headerName, valuePattern) {
  return new RegExp(`(?:response\\.headers|headers)\\.set\\('${headerName}',\\s*'${valuePattern}'\\)`);
}

function disablesResponseCaching(routeFile) {
  const source = read(routeFile);
  if (source.includes("'cache-control': 'no-store'")) return true;
  return (
    source.includes("import { privateJson } from '@/lib/http/routeError'") &&
    source.includes('return privateJson') &&
    privateHeaderSetPattern('cache-control', "[^']*no-store[^']*").test(privateJsonHelper)
  );
}

const responseShapeFindings = adminRouteFiles.flatMap((routeFile) => (
  collectJsonResponseShapes(routeFile).flatMap((shape) => shape.findings)
));
const responseSpreads = adminRouteFiles.flatMap((routeFile) => (
  collectJsonResponseShapes(routeFile).flatMap((shape) => shape.spreads.map((spread) => `${routeFile}: ${spread.path} spreads ${spread.expression}`))
));
const allowedSpreads = responseSpreads.every((spread) => (
  spread.endsWith('spreads pipeline')
));

const typeKeyFindings = collectTypePropertyKeys('lib/capital/pipeline.ts')
  .filter((key) => !allowedPipelinePrivateKeys.has(key))
  .map((key) => forbiddenKeyFinding(key, `lib/capital/pipeline.ts.${key}`))
  .filter(Boolean);

const fixtureFindings = [
  ...scanShape(capitalCommandFixture, 'capitalCommandFixture'),
  ...scanShape(pipelineFixture, 'pipelineFixture'),
];

const checks = [
  {
    label: 'Capital command fixture exposes aggregate/redacted keys only',
    ok: scanShape(capitalCommandFixture).length === 0,
    detail: scanShape(capitalCommandFixture).join('; '),
  },
  {
    label: 'Capital command center returns and displays local-only prep receipt',
    ok:
      read('app/api/admin/capital/route.ts').includes('buildCapitalPrepReadiness') &&
      read('app/api/admin/capital/route.ts').includes('prepReceipt: buildCapitalPrepReceipt') &&
      read('app/api/admin/capital/route.ts').includes("action: 'command_center_loaded'") &&
      read('app/api/admin/capital/route.ts').includes('No outreach, contact import, checkout session, payment, webhook replay, deploy, migration, landlord contact, window action, connected-tool mutation, CRM write, public post, or public claim occurred.') &&
      read('app/capital/page.tsx').includes('COMMAND CENTER RECEIPT') &&
      read('app/capital/page.tsx').includes('data.prepReceipt.detail') &&
      read('app/capital/page.tsx').includes('data.prepReadiness.externalActions') &&
      read('lib/capital/prepReceipts.ts').includes("'/capital'"),
  },
  {
    label: 'Capital pipeline fixture exposes redacted lead fields and no contact/payment identifiers',
    ok: scanShape(pipelineFixture).length === 0,
    detail: scanShape(pipelineFixture).join('; '),
  },
  {
    label: 'Capital admin JSON response object keys avoid forbidden PII identifiers',
    ok: responseShapeFindings.length === 0,
    detail: responseShapeFindings.join('; '),
  },
  {
    label: 'Capital pipeline type avoids forbidden PII identifiers except explicitly redacted fields',
    ok: typeKeyFindings.length === 0,
    detail: typeKeyFindings.join('; '),
  },
  {
    label: 'Capital command center select blocks avoid contact and payment identifiers',
    ok: !includesForbiddenSelect(selectBlocks(read('app/api/admin/capital/route.ts'))),
  },
  {
    label: 'Capital pipeline store select blocks avoid raw contact and payment identifiers',
    ok: !includesForbiddenSelect(selectBlocks(read('lib/capital/pipelineStore.ts'))),
  },
  {
    label: 'All capital admin route files use no-store/private response paths',
    ok: adminRouteFiles.every(disablesResponseCaching),
    detail: adminRouteFiles.filter((routeFile) => !disablesResponseCaching(routeFile)).join(', '),
  },
  {
    label: 'Capital admin routes avoid raw NextResponse JSON responses',
    ok: adminRouteFiles.every((routeFile) => !read(routeFile).includes('NextResponse.json')),
    detail: adminRouteFiles.filter((routeFile) => read(routeFile).includes('NextResponse.json')).join(', '),
  },
  {
    label: 'Only reviewed response spreads are used by capital admin routes',
    ok: allowedSpreads,
    detail: responseSpreads.join('; '),
  },
  {
    label: 'Privacy threat model records response-shape guard as a current control',
    ok:
      read('docs/soe-privacy-threat-model.md').includes('npm run capital:admin-shape:smoke') &&
      read('docs/soe-privacy-threat-model.md').includes('Capital admin response-shape smoke test'),
  },
];

for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.label}${check.detail && !check.ok ? ` - ${check.detail}` : ''}`);
}

if (fixtureFindings.length > 0) {
  console.error(`\nFixture shape findings: ${fixtureFindings.join('; ')}`);
}

const failures = checks.filter((check) => !check.ok);
if (failures.length > 0) {
  console.error(`\nCapital admin shape smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nCapital admin shape smoke passed.');
