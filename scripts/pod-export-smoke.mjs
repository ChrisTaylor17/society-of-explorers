import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

const files = {
  routeHelper: read('lib/http/routeError.ts'),
  statsRoute: read('app/api/movement/pod/stats/route.ts'),
  manifestRoute: read('app/api/movement/pod/manifest/route.ts'),
  manifestLib: read('lib/movement/podManifest.ts'),
  podPage: read('app/movement/pod/page.tsx'),
  refreshRoute: read('app/api/movement/pod/refresh/route.ts'),
  payloadRoute: read('app/api/movement/pod/payload/route.ts'),
  exportRoute: read('app/api/movement/pod/export/route.ts'),
  receiptRoute: read('app/api/movement/pod/receipt/route.ts'),
  podLib: read('lib/movement/pod.ts'),
  handoff: read('docs/soe-current-thread-handoff.md'),
  threatModel: read('docs/soe-privacy-threat-model.md'),
};

function privateHeaderSetPattern(headerName, valuePattern) {
  return new RegExp(
    String.raw`headers\.set\(\s*['"]${headerName}['"]\s*,\s*${valuePattern}\s*\)`,
    's',
  );
}

function appendVaryPattern(token) {
  return new RegExp(
    String.raw`appendVary\(\s*(?:response(?:\.headers)?|headers)\s*,\s*['"]${token}['"]\s*\)`,
  );
}

const checks = [
  {
    name: 'pod manifest route requires signed-in member auth',
    ok:
      files.manifestRoute.includes('getAuthenticatedMember') &&
      files.manifestRoute.includes("privateJson({ error: 'Unauthorized' }"),
  },
  {
    name: 'pod manifest route uses private JSON and returns manifest only',
    ok:
      files.manifestRoute.includes('buildPodExportManifest') &&
      files.manifestRoute.includes("import { internalRouteError, privateJson } from '@/lib/http/routeError'") &&
      files.manifestRoute.includes('return privateJson({ manifest })') &&
      files.manifestRoute.includes('{ manifest }'),
  },
  {
    name: 'pod routes return generic private failures without raw error details',
    ok:
      [
        files.statsRoute,
        files.manifestRoute,
        files.payloadRoute,
        files.refreshRoute,
        files.exportRoute,
        files.receiptRoute,
      ].every(
        (source) =>
          source.includes('internalRouteError(') &&
          !source.includes('console.error') &&
          !source.includes('String(err)') &&
          !source.includes('details:'),
      ),
  },
  {
    name: 'pod helper logs scoped generic failures',
    ok:
      files.podLib.includes('reportPodFailure') &&
      !files.podLib.includes('console.error') &&
      !files.podLib.includes('String(err)') &&
      !files.podLib.includes('String(error)') &&
      !files.podLib.includes('error.message') &&
      !files.podLib.includes('details:'),
  },
  {
    name: 'pod manifest helper returns counts without raw export material',
    ok:
      files.manifestLib.includes('sourceSnapshot') &&
      files.manifestLib.includes('sections') &&
      files.manifestLib.includes('memoryConsent') &&
      files.manifestLib.includes('suppressedOrExpiredFactsIncluded: false') &&
      files.manifestLib.includes('rawMemoryContentIncludedInManifest: false') &&
      files.manifestLib.includes('rawPayloadIncluded: false') &&
      files.manifestLib.includes('ciphertextIncluded: false') &&
      files.manifestLib.includes('rawMemberIdIncluded: false') &&
      files.manifestLib.includes('rawWalletAddressIncluded: false') &&
      files.manifestLib.includes('rawWalletSignatureIncluded: false'),
  },
  {
    name: 'pod page loads and displays export manifest before download',
    ok:
      files.podPage.includes("fetch('/api/movement/pod/manifest'") &&
      files.podPage.includes('EXPORT MANIFEST') &&
      files.podPage.includes('Manifest sections:') &&
      files.podPage.includes('Memory consent:') &&
      files.podPage.includes('Suppressed or expired facts included:'),
  },
  {
    name: 'private attachment helper adds no-store and vary protections to member downloads',
    ok:
      files.routeHelper.includes('export function privateAttachmentJson') &&
      files.routeHelper.includes('function sanitizeAttachmentFilename') &&
      files.routeHelper.includes(".replace(/[\\\\\\/]+/g, '-')") &&
      files.routeHelper.includes('const headers = new Headers(init.headers);') &&
      files.routeHelper.includes("headers.set('content-disposition', `attachment; filename=\"${filename}\"`);") &&
      files.routeHelper.includes('applyPrivateHeaders(response.headers)') &&
      privateHeaderSetPattern('cache-control', String.raw`['"][^'"]*no-store[^'"]*['"]`).test(files.routeHelper) &&
      appendVaryPattern('Cookie').test(files.routeHelper) &&
      appendVaryPattern('Authorization').test(files.routeHelper),
  },
  {
    name: 'encrypted pod export and receipt use private attachment responses',
    ok:
      files.exportRoute.includes("export const dynamic = 'force-dynamic';") &&
      files.exportRoute.includes('society-of-explorers.encrypted-pod') &&
      files.exportRoute.includes('privateAttachmentJson(envelope') &&
      files.receiptRoute.includes('privateAttachmentJson(receipt'),
  },
  {
    name: 'operator docs mention pod export manifest',
    ok:
      files.handoff.includes('/api/movement/pod/manifest') &&
      files.handoff.includes('generic pod helper failures') &&
      files.threatModel.includes('export manifest'),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nPod export smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nPod export smoke passed.');
