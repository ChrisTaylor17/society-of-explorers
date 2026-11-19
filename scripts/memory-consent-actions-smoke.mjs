#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import * as ts from 'typescript';

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function loadConsentActions() {
  const source = read('lib/memory/consentActions.ts');
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
    process: { env: {} },
  });
  return cjsModule.exports;
}

const {
  buildMemoryFactExpirationPayload,
  buildMemoryConsentReceipt,
  buildMemoryReplacementInsertPayload,
  memoryConsentStateColumnsEnabled,
  memoryConsentStateSchemaError,
} = loadConsentActions();

const factRoute = read('app/api/movement/memory/facts/[id]/route.ts');
const consentPlan = read('docs/soe-memory-consent-plan.md');
const migrationDraft = read('docs/soe-memory-state-migration-draft.md');
const operatorSystem = read('docs/soe-operator-system.md');
const packageJson = read('package.json');

const now = '2026-05-28T07:33:40.790Z';
const legacyRetract = buildMemoryFactExpirationPayload({
  action: 'retract',
  now,
  note: 'Wrong inference',
  includeStateColumns: false,
});
const statefulRetract = buildMemoryFactExpirationPayload({
  action: 'retract',
  now,
  note: 'Wrong inference',
  includeStateColumns: true,
});
const statefulCorrection = buildMemoryFactExpirationPayload({
  action: 'correct',
  now,
  note: 'Stale memory',
  replacementFactId: '00000000-0000-0000-0000-000000000001',
  includeStateColumns: true,
});
const legacyReceipt = buildMemoryConsentReceipt({
  action: 'do_not_use',
  now,
  includeStateColumns: false,
});
const fallbackReceipt = buildMemoryConsentReceipt({
  action: 'retract',
  now,
  includeStateColumns: true,
  usedSchemaFallback: true,
  note: 'Wrong inference',
});
const explicitCorrectionReceipt = buildMemoryConsentReceipt({
  action: 'correct',
  now,
  includeStateColumns: true,
  replacementFactId: '00000000-0000-0000-0000-000000000001',
  note: 'Stale memory',
});
const legacyReplacement = buildMemoryReplacementInsertPayload({
  memberId: 'member-1',
  category: 'goal',
  key: 'primary project',
  value: 'Build Society of Explorers',
  confidence: 1,
  version: 2,
  now,
  includeStateColumns: false,
});
const statefulReplacement = buildMemoryReplacementInsertPayload({
  memberId: 'member-1',
  category: 'goal',
  key: 'primary project',
  value: 'Build Society of Explorers',
  confidence: 1,
  version: 2,
  now,
  includeStateColumns: true,
});

const checks = [
  {
    name: 'feature flag defaults off and enables explicit consent-state writes only by env',
    ok:
      memoryConsentStateColumnsEnabled({}) === false &&
      memoryConsentStateColumnsEnabled({ MEMORY_CONSENT_STATE_COLUMNS_ENABLED: 'false' }) === false &&
      memoryConsentStateColumnsEnabled({ MEMORY_CONSENT_STATE_COLUMNS_ENABLED: 'true' }) === true,
  },
  {
    name: 'legacy expiration payload remains schema-safe before migration',
    ok:
      legacyRetract.valid_until === now &&
      legacyRetract.updated_at === now &&
      !('status' in legacyRetract) &&
      !('suppressed_at' in legacyRetract),
  },
  {
    name: 'stateful expiration payload records explicit suppression metadata after migration',
    ok:
      statefulRetract.status === 'retracted' &&
      statefulRetract.suppressed_at === now &&
      statefulRetract.suppressed_reason === 'Wrong inference' &&
      statefulRetract.last_member_reviewed_at === now,
  },
  {
    name: 'stateful correction links old fact to replacement',
    ok:
      statefulCorrection.status === 'corrected' &&
      statefulCorrection.replacement_fact_id === '00000000-0000-0000-0000-000000000001' &&
      statefulCorrection.correction_note === 'Stale memory',
  },
  {
    name: 'replacement insert payload stays legacy-safe unless flag is enabled',
    ok:
      legacyReplacement.member_id === 'member-1' &&
      !('status' in legacyReplacement) &&
      statefulReplacement.status === 'active' &&
      statefulReplacement.last_member_reviewed_at === now,
  },
  {
    name: 'schema fallback detects missing consent-state columns',
    ok:
      memoryConsentStateSchemaError({
        code: 'PGRST204',
        message: "Could not find the 'status' column of 'user_semantic_memory' in the schema cache",
      }) === true &&
      memoryConsentStateSchemaError({ message: 'Network request failed' }) === false,
  },
  {
    name: 'consent receipt explains write mode and retrieval effect without private content',
    ok:
      legacyReceipt.writeMode === 'legacy_valid_until' &&
      legacyReceipt.explicitStateRecorded === false &&
      legacyReceipt.retrievalEffect === 'Memory excluded from active AI use.' &&
      fallbackReceipt.writeMode === 'legacy_schema_fallback' &&
      fallbackReceipt.noteStored === false &&
      explicitCorrectionReceipt.writeMode === 'explicit_state_columns' &&
      explicitCorrectionReceipt.noteStored === true &&
      explicitCorrectionReceipt.replacementFactId === '00000000-0000-0000-0000-000000000001',
  },
  {
    name: 'memory fact route uses feature flag and schema fallback',
    ok:
      factRoute.includes('memoryConsentStateColumnsEnabled') &&
      factRoute.includes('memoryConsentStateSchemaError') &&
      factRoute.includes("action: 'forget'") &&
      factRoute.includes("action: 'correct'") &&
      factRoute.includes('buildMemoryReplacementInsertPayload') &&
      factRoute.includes('buildMemoryFactExpirationPayload') &&
      factRoute.includes('consentReceipt: buildMemoryConsentReceipt'),
  },
  {
    name: 'docs and package expose consent action readiness guard',
    ok:
      packageJson.includes('"memory:consent-actions:smoke"') &&
      consentPlan.includes('MEMORY_CONSENT_STATE_COLUMNS_ENABLED') &&
      migrationDraft.includes('MEMORY_CONSENT_STATE_COLUMNS_ENABLED') &&
      operatorSystem.includes('memory:consent-actions:smoke'),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nMemory consent actions smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nMemory consent actions smoke passed.');
