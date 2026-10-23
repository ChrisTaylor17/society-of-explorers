import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function before(source, first, second) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  return firstIndex !== -1 && secondIndex !== -1 && firstIndex < secondIndex;
}

function beforeNext(source, first, second) {
  const firstIndex = source.indexOf(first);
  if (firstIndex === -1) return false;
  const secondIndex = source.indexOf(second, firstIndex + first.length);
  return secondIndex !== -1;
}

function allInclude(files, needle) {
  return files.every((file) => file.source.includes(needle));
}

function noneInclude(files, needle) {
  return files.every((file) => !file.source.includes(needle));
}

function privateHeaderSetPattern(headerName, valuePattern) {
  return new RegExp(`(?:response\\.headers|headers)\\.set\\('${headerName}',\\s*'${valuePattern}'\\)`);
}

const routeFiles = [
  'app/api/movement/personal-ai/chat/route.ts',
  'app/api/movement/personal-ai/rebuild/route.ts',
  'app/api/movement/memory/overview/route.ts',
  'app/api/movement/memory/facts/[id]/route.ts',
  'app/api/movement/pod/stats/route.ts',
  'app/api/movement/pod/manifest/route.ts',
  'app/api/movement/pod/payload/route.ts',
  'app/api/movement/pod/refresh/route.ts',
  'app/api/movement/pod/export/route.ts',
  'app/api/movement/pod/receipt/route.ts',
  'app/api/movement/pod/sync/route.ts',
  'app/api/movement/realtime/session/route.ts',
  'app/api/movement/scripts/route.ts',
  'app/api/movement/scripts/[questionId]/route.ts',
  'app/api/movement/scripts/generate/route.ts',
  'app/api/movement/scripts/ops/route.ts',
  'app/api/movement/scripts/performance/[scriptId]/route.ts',
  'app/api/movement/scripts/status/[scriptId]/route.ts',
  'app/api/movement/sovereignty/passport/route.ts',
  'app/api/movement/personalities/[slug]/generate/route.ts',
].map((path) => ({ path, source: read(path) }));

const privateJsonRoutes = routeFiles.filter(
  (file) =>
    !file.path.endsWith('/pod/export/route.ts') &&
    !file.path.endsWith('/pod/receipt/route.ts'),
);

const attachmentRoutes = routeFiles.filter(
  (file) => file.path.endsWith('/pod/export/route.ts') || file.path.endsWith('/pod/receipt/route.ts'),
);

const managerRoutes = routeFiles.filter((file) =>
  file.path.includes('/scripts/') ||
  file.path.endsWith('/scripts/route.ts') ||
  file.path.includes('/personalities/'),
);

const files = Object.fromEntries(routeFiles.map((file) => [file.path, file.source]));
const podSovereigntyGenericFailureRoutes = [
  'app/api/movement/pod/stats/route.ts',
  'app/api/movement/pod/manifest/route.ts',
  'app/api/movement/pod/payload/route.ts',
  'app/api/movement/pod/refresh/route.ts',
  'app/api/movement/pod/export/route.ts',
  'app/api/movement/pod/receipt/route.ts',
  'app/api/movement/sovereignty/passport/route.ts',
].map((path) => ({ path, source: files[path] }));
const helperFiles = [
  'lib/movement/access.ts',
  'lib/movement/scriptgen.ts',
].map((path) => ({ path, source: read(path) }));
const podSovereigntyHelperFiles = [
  'lib/movement/pod.ts',
  'lib/movement/sovereigntyPassport.ts',
].map((path) => ({ path, source: read(path) }));
const docs = {
  handoff: read('docs/soe-current-thread-handoff.md'),
  operator: read('docs/soe-operator-system.md'),
  threatModel: read('docs/soe-privacy-threat-model.md'),
  packageJson: read('package.json'),
  operatorSmoke: read('scripts/operator-smoke.mjs'),
  routeErrorHelper: read('lib/http/routeError.ts'),
};

const checks = [
  {
    name: 'private Movement JSON routes use the shared no-store response helper',
    ok: allInclude(privateJsonRoutes, 'privateJson') && noneInclude(privateJsonRoutes, 'NextResponse.json'),
  },
  {
    name: 'pod attachment routes require auth and set no-store attachment headers',
    ok:
      attachmentRoutes.every(
        (file) =>
          file.source.includes('getAuthenticatedMember') &&
          file.source.includes('privateJson({ error:') &&
          file.source.includes('privateAttachmentJson('),
      ) &&
      docs.routeErrorHelper.includes('export function privateAttachmentJson') &&
      docs.routeErrorHelper.includes('content-disposition') &&
      privateHeaderSetPattern('cache-control', "[^']*private[^']*no-store[^']*").test(docs.routeErrorHelper),
  },
  {
    name: 'pod sync route authenticates, uses private JSON, and disables event-stream caching',
    ok:
      files['app/api/movement/pod/sync/route.ts'].includes('authenticateMember') &&
      files['app/api/movement/pod/sync/route.ts'].includes('privateJson(result.body') &&
      files['app/api/movement/pod/sync/route.ts'].includes('privateJson(normalized.body') &&
      files['app/api/movement/pod/sync/route.ts'].includes("'x-sync-audit-id': audit.auditId") &&
      files['app/api/movement/pod/sync/route.ts'].includes("'cache-control': 'no-store, no-transform'"),
  },
  {
    name: 'pod sync route redacts private failure context from responses and audit logs',
    ok:
      files['app/api/movement/pod/sync/route.ts'].includes('publicSyncErrorMessage') &&
      files['app/api/movement/pod/sync/route.ts'].includes('private_context_redacted') &&
      files['app/api/movement/pod/sync/route.ts'].includes('member_authenticated: Boolean(audit.memberId)') &&
      files['app/api/movement/pod/sync/route.ts'].includes('device_id_present: Boolean(audit.deviceId)') &&
      !files['app/api/movement/pod/sync/route.ts'].includes('NextResponse') &&
      !files['app/api/movement/pod/sync/route.ts'].includes('console.error') &&
      !files['app/api/movement/pod/sync/route.ts'].includes('String(err)') &&
      !files['app/api/movement/pod/sync/route.ts'].includes('details:') &&
      !files['app/api/movement/pod/sync/route.ts'].includes('error.message'),
  },
  {
    name: 'pod and sovereignty routes return generic private failure receipts',
    ok:
      podSovereigntyGenericFailureRoutes.every(
        (file) =>
          file.source.includes('internalRouteError(') &&
          !file.source.includes('console.error') &&
          !file.source.includes('String(err)') &&
          !file.source.includes('details:'),
      ),
  },
  {
    name: 'pod and sovereignty helpers log scoped generic failures',
    ok:
      files['app/api/movement/pod/stats/route.ts'].includes("internalRouteError('Pod stats failed'") &&
      podSovereigntyHelperFiles.every(
        (file) =>
          !file.source.includes('console.error') &&
          !file.source.includes('String(err)') &&
          !file.source.includes('String(error)') &&
          !file.source.includes('error.message') &&
          !file.source.includes('details:'),
      ),
  },
  {
    name: 'member routes require signed-in member auth before private state work',
    ok:
      routeFiles
        .filter((file) => file.source.includes('getAuthenticatedMember'))
        .every((file) => beforeNext(file.source, 'getAuthenticatedMember(req)', 'getSupabaseAdmin') || beforeNext(file.source, 'getAuthenticatedMember(req)', 'getPodStats') || beforeNext(file.source, 'getAuthenticatedMember(req)', 'buildPodExportManifest') || beforeNext(file.source, 'getAuthenticatedMember(req)', 'buildPodPayload') || beforeNext(file.source, 'getAuthenticatedMember(req)', 'buildPodSealReceipt') || beforeNext(file.source, 'getAuthenticatedMember(req)', 'buildSovereigntyPassport') || beforeNext(file.source, 'getAuthenticatedMember(req)', 'buildManifest') || beforeNext(file.source, 'getAuthenticatedMember(req)', 'createAnthropicClient()') || beforeNext(file.source, 'getAuthenticatedMember(req)', 'fetch(')),
  },
  {
    name: 'manager routes require Movement access before generation or database writes',
    ok:
      managerRoutes.every((file) => file.source.includes('getMovementAccess')) &&
      before(files['app/api/movement/scripts/generate/route.ts'], 'getMovementAccess', 'generateScripts') &&
      before(files['app/api/movement/personalities/[slug]/generate/route.ts'], 'getMovementAccess', 'personality.generate') &&
      before(files['app/api/movement/scripts/status/[scriptId]/route.ts'], 'getMovementAccess', '.update(') &&
      before(files['app/api/movement/scripts/performance/[scriptId]/route.ts'], 'getMovementAccess', '.update('),
  },
  {
    name: 'manager generation routes return generic private failures',
    ok:
      files['app/api/movement/scripts/generate/route.ts'].includes("internalRouteError('Script generation failed'") &&
      files['app/api/movement/personalities/[slug]/generate/route.ts'].includes("internalRouteError('Personality generation failed'") &&
      !files['app/api/movement/scripts/generate/route.ts'].includes('console.error') &&
      !files['app/api/movement/personalities/[slug]/generate/route.ts'].includes('console.error') &&
      !files['app/api/movement/scripts/generate/route.ts'].includes('String(err)') &&
      !files['app/api/movement/personalities/[slug]/generate/route.ts'].includes('String(err)') &&
      !files['app/api/movement/scripts/generate/route.ts'].includes('String(error)') &&
      !files['app/api/movement/personalities/[slug]/generate/route.ts'].includes('String(error)') &&
      !files['app/api/movement/scripts/generate/route.ts'].includes('details:') &&
      !files['app/api/movement/personalities/[slug]/generate/route.ts'].includes('details:'),
  },
  {
    name: 'manager routes and Movement helpers use lazy Supabase admin clients',
    ok:
      allInclude(
        managerRoutes.filter((file) => file.source.includes('.from(') || file.source.includes('.insert(') || file.source.includes('.update(')),
        'getSupabaseAdmin',
      ) &&
      allInclude(helperFiles, 'getSupabaseAdmin') &&
      noneInclude([...managerRoutes, ...helperFiles], 'createClient('),
  },
  {
    name: 'script-by-question route returns bounded public script fields',
    ok:
      files['app/api/movement/scripts/[questionId]/route.ts'].includes('UUID_RE.test(questionId)') &&
      files['app/api/movement/scripts/[questionId]/route.ts'].includes('MOVEMENT_SCRIPT_BY_QUESTION_SELECT') &&
      files['app/api/movement/scripts/[questionId]/route.ts'].includes('publicMovementQuestionScript') &&
      files['app/api/movement/scripts/[questionId]/route.ts'].includes('publicUtmLinks') &&
      files['app/api/movement/scripts/[questionId]/route.ts'].includes('MAX_UTM_LINKS') &&
      files['app/api/movement/scripts/[questionId]/route.ts'].includes('performance: canManage ?') &&
      files['app/api/movement/scripts/[questionId]/route.ts'].includes('select(MOVEMENT_SCRIPT_BY_QUESTION_SELECT)') &&
      files['app/api/movement/scripts/[questionId]/route.ts'].includes('.limit(30)') &&
      !files['app/api/movement/scripts/[questionId]/route.ts'].includes("select('*,") &&
      !files['app/api/movement/scripts/[questionId]/route.ts'].includes("select('*')") &&
      !files['app/api/movement/scripts/[questionId]/route.ts'].includes('console.error') &&
      !files['app/api/movement/scripts/[questionId]/route.ts'].includes('String(err)') &&
      !files['app/api/movement/scripts/[questionId]/route.ts'].includes('details:'),
  },
  {
    name: 'script ops route returns generic private failure receipts',
    ok:
      files['app/api/movement/scripts/ops/route.ts'].includes("privateJson({ error: 'Script operations check failed' }") &&
      files['app/api/movement/scripts/ops/route.ts'].includes('latestQuestionRes.error || scriptsRes.error') &&
      !files['app/api/movement/scripts/ops/route.ts'].includes('console.error') &&
      !files['app/api/movement/scripts/ops/route.ts'].includes('String(err)') &&
      !files['app/api/movement/scripts/ops/route.ts'].includes('details:'),
  },
  {
    name: 'personal mirror routes return generic private and stream failures',
    ok:
      files['app/api/movement/personal-ai/rebuild/route.ts'].includes("internalRouteError('Personal AI rebuild failed'") &&
      files['app/api/movement/personal-ai/chat/route.ts'].includes("internalRouteError('Personal AI chat failed'") &&
      files['app/api/movement/personal-ai/chat/route.ts'].includes("error: 'Mirror stream failed'") &&
      !files['app/api/movement/personal-ai/rebuild/route.ts'].includes('console.error') &&
      !files['app/api/movement/personal-ai/chat/route.ts'].includes('console.error') &&
      !files['app/api/movement/personal-ai/rebuild/route.ts'].includes('String(error)') &&
      !files['app/api/movement/personal-ai/chat/route.ts'].includes('String(error)') &&
      !files['app/api/movement/personal-ai/rebuild/route.ts'].includes('details:') &&
      !files['app/api/movement/personal-ai/chat/route.ts'].includes('details:') &&
      !files['app/api/movement/personal-ai/rebuild/route.ts'].includes('error.message') &&
      !files['app/api/movement/personal-ai/chat/route.ts'].includes('error.message'),
  },
  {
    name: 'memory API routes keep database failures generic',
    ok:
      files['app/api/movement/memory/overview/route.ts'].includes('reportMemoryOverviewFailure') &&
      files['app/api/movement/memory/facts/[id]/route.ts'].includes('reportMemoryFactFailure') &&
      !files['app/api/movement/memory/overview/route.ts'].includes('console.error') &&
      !files['app/api/movement/memory/facts/[id]/route.ts'].includes('console.error') &&
      !files['app/api/movement/memory/overview/route.ts'].includes('String(error)') &&
      !files['app/api/movement/memory/facts/[id]/route.ts'].includes('String(error)') &&
      !files['app/api/movement/memory/overview/route.ts'].includes('String(err)') &&
      !files['app/api/movement/memory/facts/[id]/route.ts'].includes('String(err)') &&
      !files['app/api/movement/memory/overview/route.ts'].includes('details:') &&
      !files['app/api/movement/memory/facts/[id]/route.ts'].includes('details:') &&
      !files['app/api/movement/memory/overview/route.ts'].includes('error.message') &&
      !files['app/api/movement/memory/facts/[id]/route.ts'].includes('error.message'),
  },
  {
    name: 'provider-call routes return private no-store JSON and keep provider calls behind auth',
    ok:
      beforeNext(files['app/api/movement/personal-ai/chat/route.ts'], 'getAuthenticatedMember(req)', 'createAnthropicClient()') &&
      files['app/api/movement/personal-ai/chat/route.ts'].includes("'Cache-Control': 'no-store, no-transform'") &&
      beforeNext(files['app/api/movement/realtime/session/route.ts'], 'getAuthenticatedMember(req)', "fetch('https://api.openai.com/v1/realtime/client_secrets'") &&
      files['app/api/movement/realtime/session/route.ts'].includes('privateJson') &&
      files['app/api/movement/realtime/session/route.ts'].includes('readThinkerId') &&
      !files['app/api/movement/realtime/session/route.ts'].includes('console.error') &&
      !files['app/api/movement/realtime/session/route.ts'].includes('details:') &&
      !files['app/api/movement/realtime/session/route.ts'].includes('OpenAI returned') &&
      beforeNext(files['app/api/movement/personalities/[slug]/generate/route.ts'], 'getMovementAccess(req)', 'personality.generate'),
  },
  {
    name: 'operator docs and scripts include Movement API boundary guard',
    ok:
      docs.packageJson.includes('"movement:api-boundary:smoke"') &&
      docs.operatorSmoke.includes("npm', 'run', 'movement:api-boundary:smoke'") &&
      docs.handoff.includes('movement:api-boundary:smoke') &&
      docs.handoff.includes('generic memory API database failures') &&
      docs.handoff.includes('generic manager generation failures') &&
      docs.handoff.includes('generic pod helper failures') &&
      docs.operator.includes('Movement API Boundary') &&
      docs.operator.includes('memory API failures generic') &&
      docs.operator.includes('manager generation failures generic') &&
      docs.operator.includes('pod and sovereignty helper failures generic') &&
      docs.threatModel.includes('Movement API routes use private no-store responses'),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nMovement API boundary smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nMovement API boundary smoke passed.');
