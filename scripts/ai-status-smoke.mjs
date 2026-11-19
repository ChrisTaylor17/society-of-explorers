import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

const files = {
  statusLib: read('lib/ai/status.ts'),
  route: read('app/api/admin/ai/status/route.ts'),
  page: read('app/capital/ai-status/page.tsx'),
  capitalPage: read('app/capital/page.tsx'),
  launchRoom: read('lib/capital/launchRoom.ts'),
  handoff: read('docs/soe-current-thread-handoff.md'),
  operator: read('docs/soe-operator-system.md'),
};

const forbiddenResponseFragments = [
  'apiKey',
  'secret:',
  'serviceRoleKey',
  'process.env.OPENAI_API_KEY,',
  'process.env.ANTHROPIC_API_KEY,',
  'process.env.SUPABASE_SERVICE_ROLE_KEY,',
  'process.env.AI_GATEWAY_API_KEY,',
];

const checks = [
  {
    name: 'AI status route is admin-gated',
    ok:
      files.route.includes('requireCapitalAdmin') &&
      files.route.includes("privateJson({ error: 'Unauthorized' }"),
  },
  {
    name: 'AI status route uses the shared private JSON helper',
    ok:
      files.route.includes("import { privateJson } from '@/lib/http/routeError'") &&
      files.route.includes('return privateJson({') &&
      files.route.includes('return privateJson({ error: \'Unauthorized\' }'),
  },
  {
    name: 'AI status library reports provider and model names',
    ok:
      files.statusLib.includes('describeClaudeProvider') &&
      files.statusLib.includes('resolveClaudeModel') &&
      files.statusLib.includes('OPENAI_REALTIME_MODEL') &&
      files.statusLib.includes('text-embedding-3-small'),
  },
  {
    name: 'AI status library reports env presence without secret values',
    ok:
      files.statusLib.includes('present: hasEnv') &&
      files.statusLib.includes('exposesSecretValues: false') &&
      !forbiddenResponseFragments.some((fragment) => files.statusLib.includes(fragment)),
  },
  {
    name: 'AI status returns and displays read-only no-provider-call receipt',
    ok:
      files.statusLib.includes("action: 'ai_status_loaded'") &&
      files.statusLib.includes("mode: 'read_only_status_probe'") &&
      files.statusLib.includes('providerCallsMade: false') &&
      files.statusLib.includes('secretValuesExposed: false') &&
      files.statusLib.includes('mutableSystemsTouched: false') &&
      files.statusLib.includes('No external AI provider call, message generation, embedding generation, realtime session creation') &&
      files.page.includes('AI STATUS RECEIPT') &&
      files.page.includes('status.receipt.detail') &&
      files.page.includes('Provider calls:') &&
      files.page.includes('Secret values exposed:') &&
      files.page.includes('Mutable systems touched:'),
  },
  {
    name: 'AI status surface links from capital command center',
    ok: files.capitalPage.includes('/capital/ai-status') && files.page.includes('/api/admin/ai/status'),
  },
  {
    name: 'AI status smoke is included in launch-room dry runs',
    ok: files.launchRoom.includes('npm run ai:status:smoke'),
  },
  {
    name: 'operator docs mention private AI status',
    ok:
      files.handoff.includes('/capital/ai-status') &&
      files.operator.includes('/capital/ai-status') &&
      files.handoff.includes('AI Status now carries a read-only no-provider-call receipt') &&
      files.operator.includes('AI status receipts'),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nAI status smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nAI status smoke passed.');
