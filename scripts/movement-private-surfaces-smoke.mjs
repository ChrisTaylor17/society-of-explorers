import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function count(source, needle) {
  return source.split(needle).length - 1;
}

function hasFetchWithNoStore(source, path, method) {
  const pathIndex = source.indexOf(path);
  if (pathIndex === -1) return false;
  const fetchIndex = source.lastIndexOf('fetch(', pathIndex);
  if (fetchIndex === -1) return false;
  const nextFetchIndex = source.indexOf('fetch(', pathIndex + path.length);
  const block = source.slice(fetchIndex, nextFetchIndex === -1 ? undefined : nextFetchIndex);
  return block.includes(`method: '${method}'`) && block.includes("cache: 'no-store'");
}

const files = {
  personalAiPage: read('app/movement/personal-ai/page.tsx'),
  podPage: read('app/movement/pod/page.tsx'),
  memoryPage: read('app/movement/memory/page.tsx'),
  sovereigntyPage: read('app/movement/sovereignty/page.tsx'),
  voicePage: read('app/movement/voice-council/page.tsx'),
  studioPage: read('app/movement/studio/page.tsx'),
  handoff: read('docs/soe-current-thread-handoff.md'),
  operator: read('docs/soe-operator-system.md'),
  threatModel: read('docs/soe-privacy-threat-model.md'),
  packageJson: read('package.json'),
  operatorSmoke: read('scripts/operator-smoke.mjs'),
};

const checks = [
  {
    name: 'personal mirror rebuild and chat calls are no-store',
    ok:
      hasFetchWithNoStore(files.personalAiPage, '/api/movement/personal-ai/rebuild', 'POST') &&
      hasFetchWithNoStore(files.personalAiPage, '/api/movement/personal-ai/chat', 'POST'),
  },
  {
    name: 'personal mirror page keeps client failures generic',
    ok:
      files.personalAiPage.includes('reportPersonalMirrorClientFailure') &&
      files.personalAiPage.includes('The mirror is quiet right now.') &&
      files.personalAiPage.includes('Mirror failed. Try again.') &&
      !files.personalAiPage.includes('console.error') &&
      !files.personalAiPage.includes('String(error)') &&
      !files.personalAiPage.includes('error.message') &&
      !files.personalAiPage.includes('setStatusText(data.error'),
  },
  {
    name: 'sovereign pod stats, manifest, refresh, payload, and sync calls are no-store',
    ok:
      files.podPage.includes("fetch('/api/movement/pod/stats', { cache: 'no-store' })") &&
      files.podPage.includes("fetch('/api/movement/pod/manifest', { cache: 'no-store' })") &&
      hasFetchWithNoStore(files.podPage, '/api/movement/pod/refresh', 'POST') &&
      files.podPage.includes("fetch('/api/movement/pod/payload'") &&
      files.podPage.includes("cache: 'no-store'") &&
      hasFetchWithNoStore(files.podPage, '/api/movement/pod/sync', 'POST'),
  },
  {
    name: 'sovereign pod page keeps client failures generic',
    ok:
      files.podPage.includes('reportPodClientFailure') &&
      files.podPage.includes('Wallet seal failed. No pod data was synced.') &&
      !files.podPage.includes('console.error') &&
      !files.podPage.includes('String(error)') &&
      !files.podPage.includes('error.message') &&
      !files.podPage.includes('syncData?.message'),
  },
  {
    name: 'memory overview and consent mutations are no-store',
    ok:
      files.memoryPage.includes("fetch('/api/movement/memory/overview', { cache: 'no-store' })") &&
      hasFetchWithNoStore(files.memoryPage, '/api/movement/memory/facts/${fact.id}', 'DELETE') &&
      count(files.memoryPage, "method: 'PATCH'") >= 2 &&
      count(files.memoryPage, "cache: 'no-store'") >= 4,
  },
  {
    name: 'memory page keeps client failures generic',
    ok:
      files.memoryPage.includes('reportMemoryClientFailure') &&
      files.memoryPage.includes('Unable to load memory overview.') &&
      files.memoryPage.includes('Unable to forget memory.') &&
      files.memoryPage.includes('Unable to update memory consent.') &&
      files.memoryPage.includes('Unable to correct memory.') &&
      !files.memoryPage.includes('console.error') &&
      !files.memoryPage.includes('String(error)') &&
      !files.memoryPage.includes('error.message'),
  },
  {
    name: 'sovereignty passport stays private and no-store',
    ok:
      files.sovereigntyPage.includes("fetch('/api/movement/sovereignty/passport'") &&
      files.sovereigntyPage.includes("cache: 'no-store'") &&
      files.sovereigntyPage.includes("credentials: 'same-origin'"),
  },
  {
    name: 'sovereignty passport page keeps client failures generic',
    ok:
      files.sovereigntyPage.includes('reportSovereigntyClientFailure') &&
      files.sovereigntyPage.includes('Unable to load sovereignty passport.') &&
      !files.sovereigntyPage.includes('console.error') &&
      !files.sovereigntyPage.includes('String(error)') &&
      !files.sovereigntyPage.includes('error.message'),
  },
  {
    name: 'voice session token fetch is no-store and consent-gated',
    ok:
      hasFetchWithNoStore(files.voicePage, '/api/movement/realtime/session', 'POST') &&
      files.voicePage.includes('transcriptRetention') &&
      files.voicePage.includes('memoryExtraction') &&
      files.voicePage.includes('Both controls start off'),
  },
  {
    name: 'voice council page keeps client failures generic',
    ok:
      files.voicePage.includes('reportVoiceCouncilClientFailure') &&
      files.voicePage.includes('Unable to open voice session. Check sign-in, microphone permission, and try again.') &&
      !files.voicePage.includes('console.error') &&
      !files.voicePage.includes('String(error)') &&
      !files.voicePage.includes('error.message') &&
      !files.voicePage.includes('OpenAI Realtime call failed'),
  },
  {
    name: 'Movement Studio queue, ops, status, performance, and generation calls are no-store',
    ok:
      files.studioPage.includes('fetch(`/api/movement/scripts?status=${nextStatus}`, { cache: \'no-store\' })') &&
      files.studioPage.includes("fetch('/api/movement/scripts/ops', { cache: 'no-store' })") &&
      hasFetchWithNoStore(files.studioPage, '/api/movement/scripts/status/${scriptId}', 'PATCH') &&
      hasFetchWithNoStore(files.studioPage, '/api/movement/scripts/performance/${scriptId}', 'PATCH') &&
      hasFetchWithNoStore(files.studioPage, '/api/movement/scripts/generate', 'POST'),
  },
  {
    name: 'Movement Studio page keeps client failures generic',
    ok:
      files.studioPage.includes('reportMovementStudioClientFailure') &&
      files.studioPage.includes('Unable to load Movement scripts.') &&
      files.studioPage.includes('Status update failed.') &&
      files.studioPage.includes('Copy failed.') &&
      files.studioPage.includes('Performance notes failed.') &&
      files.studioPage.includes('Generation failed.') &&
      !files.studioPage.includes('console.error') &&
      !files.studioPage.includes('String(error)') &&
      !files.studioPage.includes('error.message') &&
      !files.studioPage.includes('setMessage(data.error'),
  },
  {
    name: 'local docs record the grouped Movement private-surface guard',
    ok:
      files.handoff.includes('movement:private-surfaces:smoke') &&
      files.operator.includes('Movement private surfaces') &&
      files.threatModel.includes('Movement private surfaces use explicit no-store fetches'),
  },
  {
    name: 'package and operator smoke run the grouped Movement guard',
    ok:
      files.packageJson.includes('"movement:private-surfaces:smoke"') &&
      files.operatorSmoke.includes("npm', 'run', 'movement:private-surfaces:smoke'"),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nMovement private surfaces smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nMovement private surfaces smoke passed.');
