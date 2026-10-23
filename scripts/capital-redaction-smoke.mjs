#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import * as ts from 'typescript';

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function loadRedactionModule() {
  const source = read('lib/capital/redaction.ts');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });

  const cjsModule = { exports: {} };
  vm.runInNewContext(compiled.outputText, {
    module: cjsModule,
    exports: cjsModule.exports,
  });
  return cjsModule.exports;
}

const {
  redactCapitalText,
  hasCapitalPrivateIdentifier,
  sanitizeCapitalLeadLabel,
  CAPITAL_REDACTION_PATTERNS,
} = loadRedactionModule();
const pipelineRoute = read('app/api/admin/capital/pipeline/route.ts');
const pipelinePage = read('app/capital/pipeline/page.tsx');
const pipelineReceipts = read('lib/capital/pipelineReceipts.ts');
const privacyModel = read('docs/soe-privacy-threat-model.md');
const operatorDocs = read('docs/soe-operator-system.md');

const sensitiveSample = [
  'Lead: person@example.com',
  'Phone: (617) 555-1212',
  'Wallet: 0x1234567890abcdef1234567890abcdef12345678',
  'Stripe: cus_1234567890abcdef and pi_1234567890abcdef',
  'Checkout: cs_test_1234567890abcdef',
].join(' | ');

const redacted = redactCapitalText(sensitiveSample);
const expectedTokens = [
  '[redacted-email]',
  '[redacted-phone]',
  '[redacted-wallet]',
  '[redacted-stripe-id]',
];
const leakedTerms = [
  'person@example.com',
  '(617) 555-1212',
  '0x1234567890abcdef1234567890abcdef12345678',
  'cus_1234567890abcdef',
  'pi_1234567890abcdef',
  'cs_test_1234567890abcdef',
];

const checks = [
  {
    name: 'capital redaction helper defines email, phone, wallet, and Stripe patterns',
    ok:
      Array.isArray(CAPITAL_REDACTION_PATTERNS) &&
      ['email', 'phone', 'wallet', 'stripe'].every((id) => CAPITAL_REDACTION_PATTERNS.some((item) => item.id === id)),
  },
  {
    name: 'capital redaction masks representative private identifiers',
    ok: expectedTokens.every((token) => redacted.includes(token)),
  },
  {
    name: 'capital redaction removes raw private identifiers from representative sample',
    ok: leakedTerms.every((term) => !redacted.includes(term)),
  },
  {
    name: 'private identifier detector recognizes sensitive samples and ignores neutral text',
    ok:
      hasCapitalPrivateIdentifier(sensitiveSample) &&
      !hasCapitalPrivateIdentifier('Warm intro from a member, no private contact details included.'),
  },
  {
    name: 'capital lead labels collapse likely raw full names while preserving aliases',
    ok:
      sanitizeCapitalLeadLabel('Jane Taylor') === 'Private lead' &&
      sanitizeCapitalLeadLabel('Chris Morgan Ellis') === 'Private lead' &&
      sanitizeCapitalLeadLabel('person@example.com') === 'Private lead' &&
      sanitizeCapitalLeadLabel('Boston patron 01') === 'Boston patron 01' &&
      sanitizeCapitalLeadLabel('Warm Creator Intro') === 'Warm Creator Intro',
  },
  {
    name: 'capital pipeline route redacts free-text fields before writing to Supabase',
    ok:
      pipelineRoute.includes("import { redactCapitalText, sanitizeCapitalLeadLabel } from '@/lib/capital/redaction'") &&
      pipelineRoute.includes('const displayLabel = sanitizeCapitalLeadLabel(body.displayLabel)') &&
      pipelineRoute.includes('display_label: displayLabel') &&
      pipelineRoute.includes('relationship_context: redactedText(body.relationshipContext)') &&
      pipelineRoute.includes('objection: redactedText(body.objection)') &&
      pipelineRoute.includes('notes_redacted: redactedText(body.notesRedacted)') &&
      pipelineRoute.includes("recordPipelineEvent(data.id, 'created', redactedText(body.eventNote)"),
  },
  {
    name: 'capital pipeline receipts distinguish redacted metadata writes from external outreach',
    ok:
      pipelineReceipts.includes("writeMode: 'private_redacted_pipeline_metadata'") &&
      pipelineReceipts.includes('databaseWrite: params.databaseWrite') &&
      pipelineReceipts.includes('externalOutreachTriggered: false') &&
      pipelineReceipts.includes('paymentTriggered: false') &&
      pipelineReceipts.includes('contactImportTriggered: false') &&
      pipelineRoute.includes('pipelineReceipt: buildCapitalPipelineReceipt') &&
      pipelineRoute.includes("action: 'lead_created'") &&
      pipelineRoute.includes("action: 'lead_updated'") &&
      pipelineRoute.includes('No message, contact import, checkout session, payment, deploy, landlord contact, public post, or window action was triggered.'),
  },
  {
    name: 'capital pipeline route does not store raw admin email in pipeline metadata',
    ok:
      !pipelineRoute.includes('created_by_admin: admin.email') &&
      !pipelineRoute.includes('updated_by_admin: admin.email') &&
      pipelineRoute.includes('created_by_admin_method: admin.adminMethod') &&
      pipelineRoute.includes('updated_by_admin_method: admin.adminMethod'),
  },
  {
    name: 'capital pipeline page previews redaction before save',
    ok:
      pipelinePage.includes("import { hasCapitalPrivateIdentifier, redactCapitalText, sanitizeCapitalLeadLabel } from '@/lib/capital/redaction'") &&
      pipelinePage.includes('buildRedactionPreview') &&
      pipelinePage.includes('sanitizeCapitalLeadLabel(form.displayLabel)') &&
      pipelinePage.includes('REDACTION PREVIEW') &&
      pipelinePage.includes('PIPELINE RECEIPT') &&
      pipelinePage.includes('data.pipelineReceipt.detail') &&
      pipelinePage.includes('External outreach:') &&
      pipelinePage.includes('Human names still need manual redaction') &&
      pipelinePage.includes('likely raw full names store as Private lead') &&
      pipelinePage.includes('WILL STORE AS'),
  },
  {
    name: 'privacy and operator docs mention capital redaction guard',
    ok:
      privacyModel.includes('npm run capital:redaction:smoke') &&
      operatorDocs.includes('capital:redaction:smoke'),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nCapital redaction smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nCapital redaction smoke passed.');
