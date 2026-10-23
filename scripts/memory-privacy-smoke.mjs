import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

const files = {
  overview: read('app/api/movement/memory/overview/route.ts'),
  memoryPage: read('app/movement/memory/page.tsx'),
  factRoute: read('app/api/movement/memory/facts/[id]/route.ts'),
  consentActions: read('lib/memory/consentActions.ts'),
  sharedMemory: read('lib/memory/sharedMemory.ts'),
  embeddings: read('lib/memory/embeddings.ts'),
  extractFacts: read('lib/memory/extractFacts.ts'),
  episodes: read('lib/memory/episodes.ts'),
  consentPlan: read('docs/soe-memory-consent-plan.md'),
  threatModel: read('docs/soe-privacy-threat-model.md'),
  handoff: read('docs/soe-current-thread-handoff.md'),
  operatorSystem: read('docs/soe-operator-system.md'),
};

const checks = [
  {
    name: 'memory overview requires signed-in member auth',
    ok:
      files.overview.includes('getAuthenticatedMember') &&
      files.overview.includes("privateJson({ error: 'Unauthorized' }"),
  },
  {
    name: 'memory overview reads semantic memory through active fact filter',
    ok:
      files.overview.includes(".from('user_semantic_memory')") &&
      files.overview.includes(".is('valid_until', null)"),
  },
  {
    name: 'memory overview exposes consent-state readiness without secrets',
    ok:
      files.overview.includes('consentReadiness') &&
      files.overview.includes('buildMemoryConsentReadiness') &&
      files.consentActions.includes('writeMode') &&
      files.consentActions.includes('activeReadFilter') &&
      !files.overview.includes('process.env.MEMORY_CONSENT_STATE_COLUMNS_ENABLED'),
  },
  {
    name: 'memory fact route exposes a signed-in forget endpoint',
    ok:
      files.factRoute.includes('export async function DELETE') &&
      files.factRoute.includes('getAuthenticatedMember') &&
      files.factRoute.includes("privateJson({ error: 'Unauthorized' }"),
  },
  {
    name: 'memory fact forget is scoped to the signed-in member',
    ok:
      files.factRoute.includes(".eq('member_id', auth.memberId)") &&
      files.factRoute.includes(".eq('id', id)"),
  },
  {
    name: 'memory fact forget soft-expires active facts',
    ok:
      files.factRoute.includes('buildMemoryFactExpirationPayload') &&
      files.consentActions.includes('valid_until: params.now') &&
      files.consentActions.includes('updated_at: params.now') &&
      files.factRoute.includes(".is('valid_until', null)"),
  },
  {
    name: 'memory fact route exposes signed-in correction and suppression actions',
    ok:
      files.factRoute.includes('export async function PATCH') &&
      files.factRoute.includes("'correct'") &&
      files.factRoute.includes("'retract'") &&
      files.factRoute.includes("'do_not_use'") &&
      files.factRoute.includes('replacementFact'),
  },
  {
    name: 'memory API failures stay generic',
    ok:
      files.overview.includes('reportMemoryOverviewFailure') &&
      files.factRoute.includes('reportMemoryFactFailure') &&
      !files.overview.includes('console.error') &&
      !files.factRoute.includes('console.error') &&
      !files.overview.includes('String(error)') &&
      !files.factRoute.includes('String(error)') &&
      !files.overview.includes('String(err)') &&
      !files.factRoute.includes('String(err)') &&
      !files.overview.includes('details:') &&
      !files.factRoute.includes('details:') &&
      !files.overview.includes('error.message') &&
      !files.factRoute.includes('error.message'),
  },
  {
    name: 'memory helper failures stay generic',
    ok:
      files.sharedMemory.includes('reportSharedMemoryFailure') &&
      files.embeddings.includes('reportEmbeddingFailure') &&
      files.extractFacts.includes('reportFactExtractionFailure') &&
      files.episodes.includes('reportEpisodeWriteFailure') &&
      [files.sharedMemory, files.embeddings, files.extractFacts, files.episodes].every(
        (source) =>
          !source.includes('console.error') &&
          !source.includes('String(err)') &&
          !source.includes('String(error)') &&
          !source.includes('error.message') &&
          !source.includes('details:'),
      ),
  },
  {
    name: 'memory fact correction inserts replacement and expires old fact',
    ok:
      files.factRoute.includes('.insert(buildMemoryReplacementInsertPayload') &&
      files.factRoute.includes('const version = Math.max') &&
      files.factRoute.includes('Unable to replace memory safely'),
  },
  {
    name: 'shared memory extraction reads only active facts',
    ok:
      files.sharedMemory.includes(".from('user_semantic_memory')") &&
      files.sharedMemory.includes(".is('valid_until', null)") &&
      files.sharedMemory.includes("supabase.rpc('match_facts'"),
  },
  {
    name: 'memory consent plan documents correction and suppression states',
    ok:
      files.consentPlan.includes('corrected') &&
      files.consentPlan.includes('retracted') &&
      files.consentPlan.includes('do_not_use') &&
      files.consentPlan.includes('retrieval-exclusion') &&
      files.consentPlan.includes('PATCH'),
  },
  {
    name: 'memory page displays consent readiness mode',
    ok:
      files.memoryPage.includes('CONSENT MODE') &&
      files.memoryPage.includes('ReadinessDetail') &&
      files.memoryPage.includes('formatWriteMode') &&
      files.memoryPage.includes('Off until migration'),
  },
  {
    name: 'memory page displays last consent action receipt',
    ok:
      files.memoryPage.includes('LAST CONSENT RECEIPT') &&
      files.memoryPage.includes('lastConsentReceipt') &&
      files.memoryPage.includes('Explicit state') &&
      files.memoryPage.includes('data.consentReceipt?.retrievalEffect'),
  },
  {
    name: 'memory consent plan documents voice transcript and memory consent',
    ok:
      files.consentPlan.includes('Transcript retention: off by default') &&
      files.consentPlan.includes('Memory extraction: off by default'),
  },
  {
    name: 'operator docs link the memory consent plan',
    ok:
      files.threatModel.includes('docs/soe-memory-consent-plan.md') &&
      files.threatModel.includes('memory helper failures stay generic') &&
      files.handoff.includes('docs/soe-memory-consent-plan.md') &&
      files.handoff.includes('memory helper failures stay generic') &&
      files.operatorSystem.includes('docs/soe-memory-consent-plan.md'),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nMemory privacy smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nMemory privacy smoke passed.');
