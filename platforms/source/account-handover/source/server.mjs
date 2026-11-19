import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, readdir, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createWorld } from '../corrected-backend/prototypes/soe-join-revoke/src/world.js';
import { createHttp } from '../corrected-backend/prototypes/soe-join-revoke/src/http.js';
import { EXPECTED_BACKEND_SHA256 } from './public/fixture-contract.mjs';

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const sha = data => createHash('sha256').update(data).digest('hex');
export async function verifyBackendPins() {
  const pins = JSON.parse(await readFile(join(ROOT, 'BACKEND_PINS.json'), 'utf8'));
  assert.equal(sha(await readFile(join(ROOT, 'reference/backend-repaired-source.zip'))), pins.backendSourceArchiveSHA256);
  assert.equal(pins.backendSourceArchiveSHA256, EXPECTED_BACKEND_SHA256);
  const manifestBytes = await readFile(join(ROOT, 'reference/BACKEND_REPAIRED_SHA256.json'));
  assert.equal(sha(manifestBytes), pins.backendSourceManifestSHA256);
  assert.equal(sha(await readFile(join(ROOT, 'reference/API_CONTRACT.md'))), pins.contractSHA256);
  assert.equal(sha(await readFile(join(ROOT, 'reference/OPS01_CONTRACT_ADDENDUM.md'))), pins.contractAddendumSHA256);
  const expected = JSON.parse(manifestBytes), actual = {};
  async function visit(path, prefix = '') {
    for (const item of await readdir(path, { withFileTypes: true })) {
      assert(!item.isSymbolicLink());
      if (item.isDirectory()) await visit(join(path, item.name), prefix + item.name + '/');
      else { assert(item.isFile()); actual[prefix + item.name] = sha(await readFile(join(path, item.name))); }
    }
  }
  await visit(join(ROOT, 'corrected-backend'));
  let candidateExpected = null;
  try { candidateExpected = JSON.parse(await readFile(join(ROOT, 'CANDIDATE_BACKEND_SHA256.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  assert.deepEqual(actual, candidateExpected ?? expected);
  return { ...pins, actualBackendFiles: Object.keys(actual).length };
}

export async function startLocalOperatorFixture({ extraAssignments = [] } = {}) {
  const pins = await verifyBackendPins();
  const runtime = join(ROOT, '.runtime'); await mkdir(runtime, { recursive: true, mode: 0o700 });
  const owned = await mkdtemp(join(runtime, 'operator-ui-'));
  const world = createWorld({ allowFaults: true, syntheticOps: true, databasePath: join(owned, 'world.sqlite') });
  let backend, server, origin, backendOrigin, closed = false;
  try {
    await world.seedSyntheticOpsFixture({ marker: 'TEST_ONLY', assignments: [
      { assignmentId: 'A-L', personId: 'jules', role: 'lead', planId: 'plan-riverside', epoch: 7 },
      { assignmentId: 'A-S', personId: 'mina', role: 'safety', planId: 'plan-riverside', epoch: 3 }, ...extraAssignments,
    ] });
    backend = createHttp(world); ({ url: backendOrigin } = await backend.listen(0));
    const gate = JSON.parse(await readFile(join(ROOT, 'REVIEW_GATE.json'), 'utf8'));
    const files = new Map([['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']],
      ['/style.css', ['style.css', 'text/css']], ['/app.mjs', ['app.mjs', 'text/javascript']],
      ['/operator-client.mjs', ['operator-client.mjs', 'text/javascript']], ['/fixture-contract.mjs', ['fixture-contract.mjs', 'text/javascript']]]);
    const allowedApi = /^\/api\/(health|session|lookup|ops\/state|plans(?:\/plan-riverside(?:\/visibility)?)?|writes\/(?:hold|hold-resolve|handoff-request|handoff-ack|assignment-revoke))$/;
    const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" };
    const send = (res, code, type, data) => { res.writeHead(code, { ...headers, 'content-type': type + '; charset=utf-8' }); res.end(data); };
    server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url, origin);
        if (req.headers.origin && req.headers.origin !== origin) return send(res, 403, 'application/json', JSON.stringify({ status: 'rejected', error: 'local_origin_only' }));
        if (req.method === 'GET' && url.pathname === '/local-fixture.json') return send(res, 200, 'application/json', JSON.stringify({
          synthetic: true, localOnly: true, staffing: 'UNASSIGNED', resumePolicyConfigured: false,
          backendSourceArchiveSHA256: pins.backendSourceArchiveSHA256, independentReview: gate.status,
        }));
        if (req.method === 'GET' && files.has(url.pathname)) {
          const [name, type] = files.get(url.pathname); return send(res, 200, type, await readFile(join(ROOT, 'source/public', name)));
        }
        if (['GET', 'POST'].includes(req.method) && allowedApi.test(url.pathname)) {
          const chunks = []; let size = 0;
          for await (const chunk of req) { size += chunk.length; if (size > 16384) return send(res, 413, 'application/json', JSON.stringify({ status: 'rejected', error: 'local_request_too_large' })); chunks.push(chunk); }
          const response = await fetch(backendOrigin + url.pathname + url.search, { method: req.method, redirect: 'error', signal: AbortSignal.timeout(10000), headers: {
            accept: 'application/json', ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}),
            ...(req.method === 'POST' ? { 'content-type': 'application/json' } : {}),
          }, ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}) });
          return send(res, response.status, 'application/json', await response.text());
        }
        send(res, 404, 'application/json', JSON.stringify({ status: 'unavailable', blocker: 'No local UI route.' }));
      } catch { send(res, 500, 'application/json', JSON.stringify({ status: 'unavailable', blocker: 'Local fixture unavailable; no success is confirmed.' })); }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    origin = `http://127.0.0.1:${server.address().port}`;
    return { origin, backendOrigin, world, pins,
      async close() {
        if (closed) return; closed = true;
        try { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
        finally { try { await backend.close(); } finally { try { await world.close(); } finally { await rm(owned, { recursive: true }); } } }
      },
    };
  } catch (error) {
    try { await backend?.close(); } finally { await world.close(); await rm(owned, { recursive: true }); }
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const fixture = await startLocalOperatorFixture();
  console.log(JSON.stringify({ origin: fixture.origin, source: fixture.pins.backendSourceArchiveSHA256, synthetic: true, resumePolicyConfigured: false }));
  await writeFile(join(ROOT, 'evidence/LIVE_FIXTURE.json'), JSON.stringify({ origin: fixture.origin, backendSourceArchiveSHA256: fixture.pins.backendSourceArchiveSHA256, startedAtUTC: new Date().toISOString(), status: 'RUNNING_LOCAL_SYNTHETIC_ONLY' }, null, 2) + '\n');
  const stop = async () => { await fixture.close(); await writeFile(join(ROOT, 'evidence/LIVE_FIXTURE_STOPPED.json'), JSON.stringify({ stoppedAtUTC: new Date().toISOString(), ownedDatabaseRemoved: true }) + '\n'); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
