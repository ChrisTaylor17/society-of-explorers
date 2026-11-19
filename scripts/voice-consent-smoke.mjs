import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

const files = {
  page: read('app/movement/voice-council/page.tsx'),
  route: read('app/api/movement/realtime/session/route.ts'),
  memoryPlan: read('docs/soe-memory-consent-plan.md'),
  threatModel: read('docs/soe-privacy-threat-model.md'),
  handoff: read('docs/soe-current-thread-handoff.md'),
};

const checks = [
  {
    name: 'voice UI defaults transcript and memory consent to off',
    ok:
      files.page.includes('useState(false)') &&
      files.page.includes('transcriptRetention') &&
      files.page.includes('memoryExtraction'),
  },
  {
    name: 'voice UI sends session consent flags to the realtime route',
    ok:
      files.page.includes("fetch('/api/movement/realtime/session'") &&
      files.page.includes('consent: {') &&
      files.page.includes('transcriptRetention,') &&
      files.page.includes('memoryExtraction,'),
  },
  {
    name: 'voice UI displays consent status in the session panel',
    ok:
      files.page.includes('Retain transcript') &&
      files.page.includes('Extract memory') &&
      files.page.includes('Off by default'),
  },
  {
    name: 'voice UI keeps session failure details generic',
    ok:
      files.page.includes('reportVoiceCouncilClientFailure') &&
      files.page.includes('Unable to open voice session. Check sign-in, microphone permission, and try again.') &&
      !files.page.includes('console.error') &&
      !files.page.includes('String(error)') &&
      !files.page.includes('error.message') &&
      !files.page.includes('OpenAI Realtime call failed'),
  },
  {
    name: 'realtime route requires auth before creating client secrets',
    ok:
      files.route.includes('getAuthenticatedMember') &&
      files.route.includes("privateJson({ error: 'Unauthorized' }"),
  },
  {
    name: 'realtime route bounds thinker ids and returns generic provider failures',
    ok:
      files.route.includes('readThinkerId') &&
      files.route.includes("return privateJson({ error: 'Unable to create realtime session.' }") &&
      files.route.includes("return privateJson({ error: 'Realtime voice sessions are not configured.' }") &&
      !files.route.includes('console.error') &&
      !files.route.includes('details:') &&
      !files.route.includes('OpenAI returned'),
  },
  {
    name: 'realtime route parses transcript and memory consent flags',
    ok:
      files.route.includes('readConsentFlag') &&
      files.route.includes("readConsentFlag(body, 'transcriptRetention')") &&
      files.route.includes("readConsentFlag(body, 'memoryExtraction')"),
  },
  {
    name: 'realtime route injects consent boundaries into session instructions',
    ok:
      files.route.includes('Transcript retention consent') &&
      files.route.includes('Memory extraction consent') &&
      files.route.includes('consentInstructions'),
  },
  {
    name: 'realtime route returns consent metadata to the client',
    ok:
      files.route.includes('consent: {') &&
      files.route.includes('transcriptRetention,') &&
      files.route.includes('memoryExtraction,'),
  },
  {
    name: 'operator docs record voice consent behavior',
    ok:
      files.memoryPlan.includes('/movement/voice-council') &&
      files.memoryPlan.includes('/api/movement/realtime/session') &&
      files.threatModel.includes('Default transcript retention to off') &&
      files.handoff.includes('defaults-off transcript and memory consent controls'),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nVoice consent smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nVoice consent smoke passed.');
