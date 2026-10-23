import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

const files = {
  queueRoute: read('app/api/movement/scripts/route.ts'),
  opsRoute: read('app/api/movement/scripts/ops/route.ts'),
  socialRoute: read('app/api/social/generate/route.ts'),
  receiptLib: read('lib/movement/creatorOpsReceipts.ts'),
  generateRoute: read('app/api/movement/scripts/generate/route.ts'),
  statusRoute: read('app/api/movement/scripts/status/[scriptId]/route.ts'),
  performanceRoute: read('app/api/movement/scripts/performance/[scriptId]/route.ts'),
  studioPage: read('app/movement/studio/page.tsx'),
  handoff: read('docs/soe-current-thread-handoff.md'),
  operator: read('docs/soe-operator-system.md'),
};

const checks = [
  {
    name: 'creator ops route requires movement manager access',
    ok:
      files.opsRoute.includes('getMovementAccess') &&
      files.opsRoute.includes("privateJson({ error: 'Unauthorized' }") &&
      files.opsRoute.includes('access.canManage') &&
      !files.opsRoute.includes('console.error') &&
      !files.opsRoute.includes('String(err)') &&
      !files.opsRoute.includes('details:'),
  },
  {
    name: 'creator ops route is read-only and cache-disabled',
    ok:
      files.opsRoute.includes('export async function GET') &&
      !files.opsRoute.includes('.insert(') &&
      !files.opsRoute.includes('.update(') &&
      !files.opsRoute.includes('.delete(') &&
      files.opsRoute.includes('privateJson('),
  },
  {
    name: 'social draft route requires auth and ignores caller-supplied member ids',
    ok:
      files.socialRoute.includes('getAuthenticatedMember(req)') &&
      files.socialRoute.includes("privateJson({ error: 'Unauthorized' }") &&
      files.socialRoute.includes("privateJson({ error: 'Invalid JSON body' }") &&
      files.socialRoute.includes("privateJson({ error: 'eventId and a valid platform are required' }") &&
      files.socialRoute.includes('generateSocialDraft(eventId, auth.memberId, platform)') &&
      !files.socialRoute.includes('body.memberId') &&
      !files.socialRoute.includes('{ eventId, memberId, platform }') &&
      !files.socialRoute.includes('NextResponse.json('),
  },
  {
    name: 'creator ops route returns latest-question checklist and publishing boundary',
    ok:
      files.opsRoute.includes('latestQuestion') &&
      files.opsRoute.includes('checklist') &&
      files.opsRoute.includes('readiness: buildCreatorOpsReadiness()') &&
      files.opsRoute.includes('externalActionBoundary') &&
      files.opsRoute.includes('No posting, sending, paid boosting'),
  },
  {
    name: 'creator ops readiness is draft-only and no-publish',
    ok:
      files.receiptLib.includes("mode: 'draft_only'") &&
      files.receiptLib.includes("externalActions: 'none'") &&
      files.receiptLib.includes('publishBlockedWithoutApproval: true') &&
      files.receiptLib.includes('approvalRequirement') &&
      files.receiptLib.includes('buildCreatorOpsReceipt'),
  },
  {
    name: 'Movement Studio fetches creator ops alongside queue data',
    ok:
      files.queueRoute.includes('MOVEMENT_SCRIPT_QUEUE_SELECT') &&
      files.queueRoute.includes('publicMovementStudioScript') &&
      files.queueRoute.includes('select(MOVEMENT_SCRIPT_QUEUE_SELECT)') &&
      files.queueRoute.includes('safeRequestJson(req)') &&
      files.queueRoute.includes("return privateJson({ scripts: (data || []).map((script) => publicMovementStudioScript(script)) })") &&
      !files.queueRoute.includes("select('*,") &&
      !files.queueRoute.includes("select('*')") &&
      !files.queueRoute.includes('console.error') &&
      !files.queueRoute.includes('String(err)') &&
      !files.queueRoute.includes('details:') &&
      files.studioPage.includes("fetch('/api/movement/scripts/ops'") &&
      files.studioPage.includes('Promise.all') &&
      files.studioPage.includes('DAILY CREATOR OPS'),
  },
  {
    name: 'Movement Studio displays checklist and no-publish boundary',
    ok:
      files.studioPage.includes('ops.externalActionBoundary') &&
      files.studioPage.includes('CREATOR READINESS') &&
      files.studioPage.includes('ops.readiness.approvalRequirement') &&
      files.studioPage.includes('ops.checklist.map') &&
      files.studioPage.includes('ops.nextActions.map'),
  },
  {
    name: 'creator local mutations return no-publish receipts',
    ok:
      files.generateRoute.includes('creatorReceipt: buildCreatorOpsReceipt') &&
      files.statusRoute.includes('creatorReceipt: buildCreatorOpsReceipt') &&
      files.performanceRoute.includes('creatorReceipt: buildCreatorOpsReceipt') &&
      files.generateRoute.includes('No publish, send, schedule, or paid promotion was triggered') &&
      files.statusRoute.includes('No publish, send, schedule, or paid promotion was triggered') &&
      files.performanceRoute.includes('No external analytics import, publish, send, schedule, or paid promotion was triggered'),
  },
  {
    name: 'creator generation failures stay generic',
    ok:
      files.generateRoute.includes("internalRouteError('Script generation failed'") &&
      !files.generateRoute.includes('console.error') &&
      !files.generateRoute.includes('String(err)') &&
      !files.generateRoute.includes('String(error)') &&
      !files.generateRoute.includes('details:'),
  },
  {
    name: 'script status route validates bounded local metadata updates',
    ok:
      files.statusRoute.includes('safeRequestJson(req)') &&
      files.statusRoute.includes('UUID_RE.test(scriptId)') &&
      files.statusRoute.includes('MOVEMENT_SCRIPT_STATUS_SELECT') &&
      files.statusRoute.includes('publicScriptStatusReceipt') &&
      files.statusRoute.includes('select(MOVEMENT_SCRIPT_STATUS_SELECT)') &&
      !files.statusRoute.includes("select('*')") &&
      !files.statusRoute.includes('console.error') &&
      !files.statusRoute.includes('String(err)') &&
      !files.statusRoute.includes('details:'),
  },
  {
    name: 'Movement Studio displays last local creator receipt',
    ok:
      files.studioPage.includes('LAST CREATOR RECEIPT') &&
      files.studioPage.includes('lastCreatorReceipt') &&
      files.studioPage.includes('data.creatorReceipt?.detail') &&
      files.studioPage.includes('Publish triggered:'),
  },
  {
    name: 'performance notes route requires manager access',
    ok:
      files.performanceRoute.includes('getMovementAccess') &&
      files.performanceRoute.includes("privateJson({ error: 'Unauthorized' }") &&
      files.performanceRoute.includes('access.canManage'),
  },
  {
    name: 'performance notes route only updates script metadata',
    ok:
      files.performanceRoute.includes('export async function PATCH') &&
      files.performanceRoute.includes('.update({ performance })') &&
      !files.performanceRoute.includes('fetch(') &&
      !files.performanceRoute.includes('.insert(') &&
      !files.performanceRoute.includes('.delete('),
  },
  {
    name: 'performance notes route returns sanitized local metadata receipts',
    ok:
      files.performanceRoute.includes('safeRequestJson(req)') &&
      files.performanceRoute.includes('UUID_RE.test(scriptId)') &&
      files.performanceRoute.includes('MOVEMENT_SCRIPT_PERFORMANCE_SELECT') &&
      files.performanceRoute.includes('publicMovementStudioScript') &&
      files.performanceRoute.includes('publicCreatorOpsPerformance') &&
      files.performanceRoute.includes('select(MOVEMENT_SCRIPT_PERFORMANCE_SELECT)') &&
      !files.performanceRoute.includes("select('*,") &&
      !files.performanceRoute.includes("select('*')") &&
      !files.performanceRoute.includes('console.error') &&
      !files.performanceRoute.includes('String(err)') &&
      !files.performanceRoute.includes('details:'),
  },
  {
    name: 'Movement Studio exposes local performance note controls',
    ok:
      files.studioPage.includes('PerformancePanel') &&
      files.studioPage.includes('/api/movement/scripts/performance/') &&
      files.studioPage.includes('Experiment hypothesis') &&
      files.studioPage.includes('Result notes'),
  },
  {
    name: 'operator docs mention creator ops',
    ok:
      files.handoff.includes('/api/movement/scripts/ops') &&
      files.handoff.includes('/api/movement/scripts/performance/[scriptId]') &&
      files.operator.includes('Daily creator ops'),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nCreator ops smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nCreator ops smoke passed.');
