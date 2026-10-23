#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import * as ts from 'typescript';

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function loadRetrievalPolicy() {
  const source = read('lib/memory/retrievalPolicy.ts');
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

const { canUseMemoryInAI, filterUsableMemoryRows } = loadRetrievalPolicy();
const sharedMemory = read('lib/memory/sharedMemory.ts');
const insightsRoute = read('app/api/insights/route.ts');
const practiceReflectRoute = read('app/api/practice/reflect/route.ts');
const movementPod = read('lib/movement/pod.ts');
const sovereigntyPassport = read('lib/movement/sovereigntyPassport.ts');
const consentPlan = read('docs/soe-memory-consent-plan.md');
const threatModel = read('docs/soe-privacy-threat-model.md');
const handoff = read('docs/soe-current-thread-handoff.md');
const operatorSystem = read('docs/soe-operator-system.md');
const packageJson = read('package.json');

function hasActiveSemanticMemoryRead(source) {
  return (
    source.includes(".from('user_semantic_memory')") &&
    source.includes(".is('valid_until', null)")
  );
}

const rows = [
  { id: 'active', value: 'usable', status: 'active', valid_until: null, suppressed_at: null },
  { id: 'scheduled-expiry', value: 'future expiry', status: 'active', valid_until: '2099-05-28T00:00:00.000Z', suppressed_at: null },
  { id: 'expired', value: 'expired', status: 'active', valid_until: '2026-05-28T00:00:00.000Z', suppressed_at: null },
  { id: 'retracted', value: 'retracted', status: 'retracted', valid_until: null, suppressed_at: null },
  { id: 'do-not-use', value: 'do not use', consent_state: 'do_not_use', valid_until: null, suppressed_at: null },
  { id: 'suppressed', value: 'suppressed', status: 'active', valid_until: null, suppressed_at: '2026-05-28T00:00:00.000Z' },
  { id: 'invalid-valid-until', value: 'invalid expiry', status: 'active', valid_until: 'not-a-timestamp', suppressed_at: null },
];
const usable = filterUsableMemoryRows(rows);

const checks = [
  {
    name: 'retrieval policy allows active and future-dated memory only',
    ok:
      canUseMemoryInAI(rows[0]) &&
      canUseMemoryInAI(rows[1]) &&
      !canUseMemoryInAI(rows[2]) &&
      !canUseMemoryInAI(rows[3]) &&
      !canUseMemoryInAI(rows[4]) &&
      !canUseMemoryInAI(rows[5]) &&
      !canUseMemoryInAI(rows[6]) &&
      usable.length === 2 &&
      usable[0].id === 'active' &&
      usable[1].id === 'scheduled-expiry',
  },
  {
    name: 'shared memory filters matched facts before AI prompt assembly',
    ok:
      sharedMemory.includes("import { filterUsableMemoryRows } from './retrievalPolicy'") &&
      sharedMemory.includes('const matchedFacts = filterUsableMemoryRows((facts || []) as MatchedFact[])') &&
      sharedMemory.includes('const existingMemory = filterUsableMemoryRows((existingFacts || []) as MatchedFact[])'),
  },
  {
    name: 'insights headline filters active memory before AI prompt use',
    ok:
      hasActiveSemanticMemoryRead(insightsRoute) &&
      insightsRoute.includes("filterUsableMemoryRows") &&
      insightsRoute.includes("type MemoryRetrievalRow") &&
      insightsRoute.includes('const activeFactRows = filterUsableMemoryRows((factRows || []) as SemanticMemoryFactRow[])') &&
      insightsRoute.indexOf('const activeFactRows = filterUsableMemoryRows') <
        insightsRoute.indexOf('generateOpeningHeadline(displayName, semanticFacts)'),
  },
  {
    name: 'practice reflection filters active memory before AI prompt use',
    ok:
      hasActiveSemanticMemoryRead(practiceReflectRoute) &&
      practiceReflectRoute.includes("filterUsableMemoryRows") &&
      practiceReflectRoute.includes("type MemoryRetrievalRow") &&
      practiceReflectRoute.includes('semanticFacts = filterUsableMemoryRows(factRows as SemanticFact[])') &&
      practiceReflectRoute.indexOf('semanticFacts = filterUsableMemoryRows') <
        practiceReflectRoute.indexOf('const systemPrompt = buildPrompt'),
  },
  {
    name: 'pod export and sovereignty passport read active semantic memory only',
    ok:
      hasActiveSemanticMemoryRead(movementPod) &&
      hasActiveSemanticMemoryRead(sovereigntyPassport),
  },
  {
    name: 'matched fact type carries optional suppression metadata',
    ok:
      sharedMemory.includes('valid_until?: string | null') &&
      sharedMemory.includes('suppressed_at?: string | null') &&
      sharedMemory.includes('consent_state?: string | null'),
  },
  {
    name: 'memory consent docs list retrieval exclusion requirements',
    ok:
      consentPlan.includes('match_facts') &&
      consentPlan.includes('suppressed_at is null') &&
      consentPlan.includes('Personal AI context: never include `retracted`, `corrected` old facts, or `do_not_use`.'),
  },
  {
    name: 'operator docs and package scripts include retrieval smoke guard',
    ok:
      packageJson.includes('"memory:retrieval:smoke"') &&
      operatorSystem.includes('memory:retrieval:smoke') &&
      threatModel.includes('npm run memory:retrieval:smoke') &&
      handoff.includes('npm run memory:retrieval:smoke') &&
      threatModel.includes('prompt/read paths') &&
      handoff.includes('prompt/read paths'),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nMemory retrieval smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nMemory retrieval smoke passed.');
