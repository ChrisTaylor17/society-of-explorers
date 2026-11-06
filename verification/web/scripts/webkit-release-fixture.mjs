import 'next/dist/server/node-environment.js';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:https';
import { resolve } from 'node:path';
import { Wallet } from 'ethers';
import next from 'next';
import { NextRequest, NextResponse } from 'next/server.js';
import { SiweMessage } from 'siwe';

const [work, ...extra] = process.argv.slice(2);
assert(!extra.length && /^\/private\/tmp\/soe-webkit\.[A-Za-z0-9]+$/.test(work ?? ''));
assert.equal(process.env.NODE_ENV, 'production');
const port = Number(process.env.SOE_BUILT_SHELL_PORT);
assert(Number.isInteger(port) && port >= 1024 && port <= 65535);
assert(globalThis.__soeBuiltShellGuard, 'Start with the guarded local server preload');
const root = process.cwd(), origin = 'https://127.0.0.1:' + port;
const buildId = readFileSync('.next/BUILD_ID', 'utf8').trim();
const memberId = '11111111-1111-4111-8111-111111111111';
const wallet = Wallet.createRandom();

process.chdir(resolve(root, 'verification/web'));
const { offlineApp } = await import('../tests/support/offline-app.mjs');
const { createPublicProfileApp, ORIGIN } = await import('../tests/support/public-profile-app.mjs');
const catalog = await createPublicProfileApp();
const expectedMemberId = catalog.actors.author;
const created = await catalog.dispatch('/api/circles', { method: 'POST',
  body: await catalog.createBody({ expectedMemberId, title: 'Philemon WebKit Circle', format: 'online',
    city: null, venueName: null, venueType: 'online', onlineUrl: 'https://fixture.invalid/meeting' }),
  headers: { authorization: 'Bearer ' + catalog.TOKENS.author, origin: ORIGIN, 'x-soe-expected-member': expectedMemberId },
});
assert.equal(created.status, 200);
const { circleId } = await created.json();
const auth = offlineApp({ root });
const db = auth.fakes.resetDb({ members: [{ id: memberId, display_name: 'Fixture reader', wallet_address: wallet.address.toLowerCase() }] });
db.strictSingle = true;
auth.context.process.env.NODE_ENV = 'production';
auth.setMock('next/server', () => ({ NextResponse }));
auth.setMock('@/lib/supabase/server', () => ({ createServiceClient: () => db }));
auth.setMock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => db }));
const authRoutes = new Map([
  ['GET /api/auth/nonce', auth.load('app/api/auth/nonce/route.ts').GET],
  ['POST /api/auth/siwe', auth.load('app/api/auth/siwe/route.ts').POST],
  ['GET /api/auth/member', auth.load('app/api/auth/member/route.ts').GET],
]);

process.chdir(root);
const app = next({ dev: false, dir: root, hostname: '127.0.0.1', port, quiet: true });
await app.prepare();
const handle = app.getRequestHandler();
const requests = [], failures = [];
let signatures = 0;

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    assert(size <= 4096, 'Fixture request body exceeds limit');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const server = createServer({ key: readFileSync(resolve(work, 'fixture.key')), cert: readFileSync(resolve(work, 'fixture.pem')) },
  async (req, res) => {
    try {
      assert(req.url.startsWith('/') && !req.url.startsWith('//'));
      const url = new URL(req.url, origin);
      assert.equal(url.origin, origin);
      assert.equal(req.headers.host, url.host);
      const key = req.method + ' ' + url.pathname;
      if (key === 'GET /api/auth/nonce' && url.search === '?compiled-origin-probe=1') {
        await handle(req, res);
        return;
      }
      const handler = authRoutes.get(key);
      let reply;
      if (handler) {
        assert(!req.headers.authorization);
        const body = req.method === 'POST' ? await readBody(req) : undefined;
        reply = await handler(new NextRequest(url, { method: req.method, headers: req.headers, body }));
      } else if (key === 'POST /__fixture/wallet-sign') {
        assert.equal(req.headers.origin, origin);
        const message = await readBody(req);
        const parsed = new SiweMessage(message);
        assert.equal(parsed.uri, origin);
        assert.equal(parsed.domain, url.host);
        assert.equal(parsed.address, wallet.address);
        signatures++;
        reply = Response.json({ signature: await wallet.signMessage(message) });
      } else if (key === 'GET /api/circles'
          || (key === 'GET /api/circles/' + circleId && url.search === '?view=listing')) {
        assert(!req.headers.cookie && !req.headers.authorization && !req.headers['x-soe-expected-member']);
        reply = await catalog.dispatch(url.pathname + url.search);
      } else {
        assert(!url.pathname.startsWith('/api/'), 'Unexpected fixture API path');
        await handle(req, res);
        return;
      }
      const headers = Object.fromEntries(reply.headers);
      const cookies = reply.headers.getSetCookie();
      if (cookies.length) headers['set-cookie'] = cookies;
      requests.push({ path: url.pathname, method: req.method, status: reply.status });
      res.writeHead(reply.status, headers);
      res.end(await reply.text());
    } catch (error) {
      failures.push(error.message);
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('Local fixture failed');
    }
  });
await new Promise((done, fail) => server.once('error', fail).listen(port, '127.0.0.1', done));
writeFileSync(resolve(work, 'fixture-ready.json'), JSON.stringify({
  buildId, origin, memberId, circleId, walletAddress: wallet.address, pid: process.pid,
}) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: 'READY', origin, buildId }));
process.once('SIGTERM', async () => {
  await new Promise(done => server.close(done));
  await catalog.close();
  await app.close();
  writeFileSync(resolve(work, 'fixture-stopped.json'), JSON.stringify({
    status: 'STOPPED', buildId, signatures, requests, failures, denied: globalThis.__soeBuiltShellGuard.denied,
  }, null, 2) + '\n', { flag: 'wx' });
  process.exit(failures.length || globalThis.__soeBuiltShellGuard.denied.length ? 1 : 0);
});
