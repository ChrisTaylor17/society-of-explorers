import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createWorld } from '../corrected-backend/prototypes/soe-join-revoke/src/world.js';
import { createHttp } from '../corrected-backend/prototypes/soe-join-revoke/src/http.js';
import { payloadHash } from '../corrected-backend/prototypes/soe-join-revoke/src/hash.js';
import { readQuestAsset } from './quest-assets.mjs';
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

export async function startDiscussionFixture({ contract = false } = {}) {
  if (contract !== 'plan-discussion-v1') throw Error('Explicit plan-discussion-v1 contract required');
  const manifest = JSON.parse(await readFile(join(ROOT, 'COMMUNITY_CANDIDATE_SHA256.json'), 'utf8'));
  for (const [path, expected] of Object.entries(manifest)) assert.equal(createHash('sha256').update(await readFile(join(ROOT, path))).digest('hex'), expected, path);
  const runtime = join(ROOT, '.runtime'); await mkdir(runtime, { recursive: true, mode: 0o700 });
  const owned = await mkdtemp(join(runtime, 'discussion-v1-'));
  let world, backend, server, origin, closed = false;
  try {
    world = createWorld({ allowFaults: true, syntheticOps: true, privacyQueue: 'safety-queue-v1', syntheticDiscussion: contract, databasePath: join(owned, 'world.sqlite') });
    await world.seedSyntheticOpsFixture({ marker: 'TEST_ONLY', assignments: [
      { assignmentId: 'lead-jules', personId: 'jules', role: 'lead', planId: 'plan-riverside', epoch: 1 },
      { assignmentId: 'review-mina', personId: 'mina', role: 'safety', planId: 'plan-riverside', epoch: 1 },
      { assignmentId: 'review-ada', personId: 'ada', role: 'safety_triage', planId: 'plan-riverside', epoch: 1 },
    ] });
    const jules = await world.signIn('jules', 'synthetic-jules'), ada = await world.signIn('ada', 'synthetic-ada');
    const write = (session, endpoint, body) => world.write(session.token, endpoint, { personId: session.person.id, idempotencyKey: 'fixture-' + endpoint, payloadHash: payloadHash(body), body });
    const joined = await write(jules, 'join', { planId: 'plan-riverside' }); assert.equal(joined.status, 'committed');
    assert.equal((await write(ada, 'accept', { planId: 'plan-riverside', requesterId: 'jules', invitationId: joined.data.invitationId })).status, 'committed');
    backend = createHttp(world); const { url: backendOrigin } = await backend.listen(0);
    const files = new Set(['plan.html', 'plan.css', 'plan-app.mjs', 'plan-client.mjs', 'field-render.mjs', 'message-client.mjs', 'message-view.mjs', 'discussion-client.mjs', 'discussion-view.mjs']);
    const api = /^\/api\/(health|session|lookup|membership\/plan-riverside|plans(?:\/plan-riverside(?:\/(?:visibility|discussion))?)?|writes\/(?:join|accept|grant|revoke|leave|block|report|discussion-consent|discussion-post|discussion-flag|discussion-decide|discussion-appeal))$/;
    server = createServer(async (req, res) => {
      const send = (status, type, data) => { res.writeHead(status, { 'content-type': type + '; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" }); res.end(data); };
      try {
        if (req.headers.origin && req.headers.origin !== origin) return send(403, 'application/json', JSON.stringify({ status: 'rejected', error: 'local_origin_only' }));
        const url = new URL(req.url, origin), file = url.pathname === '/' ? 'plan.html' : url.pathname.slice(1);
        if(req.method==='GET'){const asset=await readQuestAsset(url.pathname);if(asset)return send(200,asset.type,asset.body);}
        if (req.method === 'GET' && files.has(file)) return send(200, file.endsWith('.mjs') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html', await readFile(join(ROOT, 'source/public', file)));
        if (req.method === 'GET' && url.pathname === '/local-fixture.json') return send(200, 'application/json', JSON.stringify({ synthetic: true, localOnly: true, contract, discussion: await world.discussionIdentity(), storage: 'disposable-sqlite', assistance: 'local_rule_fixtures_only', staffing: 'fictional-assignments-only', productionClearance: false }));
        if (['GET', 'POST'].includes(req.method) && api.test(url.pathname)) {
          const chunks = []; let bytes = 0;
          for await (const chunk of req) { bytes += chunk.length; if (bytes > 8192) return send(413, 'application/json', JSON.stringify({ status: 'rejected', error: 'too_large' })); chunks.push(chunk); }
          const response = await fetch(backendOrigin + url.pathname + url.search, { method: req.method, redirect: 'error', signal: AbortSignal.timeout(10000), headers: { accept: 'application/json', ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}), ...(req.method === 'POST' ? { 'content-type': 'application/json' } : {}) }, ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}) });
          return send(response.status, 'application/json', await response.text());
        }
        send(404, 'application/json', JSON.stringify({ status: 'unavailable', blocker: 'No discussion fixture route.' }));
      } catch { send(500, 'application/json', JSON.stringify({ status: 'unavailable', blocker: 'Local fixture unavailable; no action confirmed.' })); }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    origin = `http://127.0.0.1:${server.address().port}`;
    return { origin, world, async close() {
      if (closed) return; closed = true;
      try { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
      finally { try { await backend.close(); } finally { await world.close(); await rm(owned, { recursive: true, force: true }); } }
    } };
  } catch (error) {
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    // A denied listen must remain the reported error; a not-started backend's
    // cleanup must not mask it with ERR_SERVER_NOT_RUNNING.
    try { await backend?.close(); } catch {}
    try { await world?.close(); } finally { await rm(owned, { recursive: true, force: true }); }
    throw error;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv.includes('--synthetic-discussion')) throw Error('Pass --synthetic-discussion to start this local-only fixture');
  const fixture = await startDiscussionFixture({ contract: 'plan-discussion-v1' });
  console.log(JSON.stringify({ origin: fixture.origin, synthetic: true, localOnly: true, assistance: 'local_rule_fixtures_only', productionClearance: false }));
  const close = async () => { await fixture.close(); process.exit(0); }; process.once('SIGINT', close); process.once('SIGTERM', close);
}
