import 'next/dist/server/node-environment.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:https';
import { resolve } from 'node:path';
import { Wallet } from 'ethers';
import next from 'next';
import { NextRequest, NextResponse } from 'next/server.js';
import { SiweMessage } from 'siwe';

const [work, ...extra] = process.argv.slice(2);
assert(!extra.length && /^\/private\/tmp\/soe-webkit\.[A-Za-z0-9_]+$/.test(work ?? ''));
assert.equal(process.env.NODE_ENV, 'production');
const port = Number(process.env.SOE_BUILT_SHELL_PORT);
assert(Number.isInteger(port) && port >= 1024 && port <= 65535);
assert(globalThis.__soeBuiltShellGuard, 'Start with the guarded local server preload');
const root = process.cwd(), origin = 'https://127.0.0.1:' + port;
const buildId = readFileSync('.next/BUILD_ID', 'utf8').trim();
const wallet = Wallet.createRandom();

process.chdir(resolve(root, 'verification/web'));
const { offlineApp } = await import('../tests/support/offline-app.mjs');
const { createPublicProfileApp, ORIGIN } = await import('../tests/support/public-profile-app.mjs');
const catalog = await createPublicProfileApp();
const memberId = catalog.actors.outsider;
await catalog.db.query('UPDATE public.members SET wallet_address=$1 WHERE id=$2', [wallet.address.toLowerCase(), memberId]);
for (const name of ['wallet-challenge-consumption', 'wallet-session-revocation']) {
  await catalog.db.exec(readFileSync(resolve(root, 'docs/sql', name + '-apply.sql'), 'utf8'));
}
const auth = offlineApp({ root });
const db = auth.fakes.resetDb({ members: [{ id: memberId, display_name: 'Fixture reader', wallet_address: wallet.address.toLowerCase() }] });
db.strictSingle = true;
auth.context.process.env.NODE_ENV = 'production';
auth.context.process.env.WALLET_SESSION_SECRET = catalog.app.context.process.env.WALLET_SESSION_SECRET;
const walletArgs = {
  soe_wallet_challenge_consume: ['p_digest', 'p_expires_at'],
  soe_wallet_session_access: ['p_digest', 'p_expires_at', 'p_revoke'],
};
db.rpc = (name, args) => ({ async abortSignal(signal) {
  signal.throwIfAborted();
  assert(Object.hasOwn(walletArgs, name));
  const keys = walletArgs[name];
  assert.deepEqual(Object.keys(args).sort(), [...keys].sort());
  return catalog.db.transaction(async tx => {
    await tx.exec('SET LOCAL ROLE service_role');
    const sql = `SELECT public.${name}(${keys.map((_, i) => '$' + (i + 1)).join(',')}) AS result`;
    const { rows } = await tx.query(sql, keys.map(key => args[key]));
    return { data: rows[0].result, error: null };
  });
} });
auth.setMock('next/server', () => ({ NextResponse }));
auth.setMock('@/lib/supabase/server', () => ({ createServiceClient: () => db }));
auth.setMock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => db }));
// Set up the shared SQL session store before either loader caches a route.
const walletStore = auth.load('lib/auth/walletSessionStore.ts');
auth.setMock('@/lib/auth/walletSessionStore', () => walletStore);
catalog.app.setMock('@/lib/auth/walletSessionStore', () => walletStore);
const authRoutes = new Map([
  ['GET /api/auth/nonce', auth.load('app/api/auth/nonce/route.ts').GET],
  ['POST /api/auth/siwe', auth.load('app/api/auth/siwe/route.ts').POST],
  ['POST /api/auth/logout', auth.load('app/api/auth/logout/route.ts').POST],
]);

const reading = await catalog.dispatch('/api/great-books/text/philemon');
assert.equal(reading.status, 200);
const { edition } = await reading.json();
const expectedMemberId = catalog.actors.author;
const hostHeaders = { authorization: 'Bearer ' + catalog.TOKENS.author, origin: ORIGIN, 'x-soe-expected-member': expectedMemberId };
const created = await catalog.dispatch('/api/circles', { method: 'POST',
  body: await catalog.createBody({ expectedMemberId, title: 'Philemon WebKit Circle', format: 'online',
    city: null, venueName: null, venueType: 'online', onlineUrl: 'https://fixture.invalid/meeting',
    readingProgram: { version: 1, bookId: 'philemon', editionId: edition.editionId, sessions: [{ from: 0, to: 0 }] } }),
  headers: hostHeaders,
});
assert.equal(created.status, 200);
const { circleId } = await created.json();
const circlePath = '/api/circles/' + circleId;
const discussionPath = circlePath + '/discussion';
const parentComment = 'What does the letter ask of its first reader?';
const replyComment = 'The letter asks him to receive Onesimus as a brother.';
const parentRequest = { requestId: randomUUID(), comment: parentComment, parentMessageId: null };
const preview = await catalog.dispatch(discussionPath + '/preview', { method: 'POST', body: parentRequest, headers: hostHeaders });
assert.equal(preview.status, 200);
const { contentHash, reviewKey } = await preview.json();
const posted = await catalog.dispatch(discussionPath, { method: 'POST', headers: hostHeaders,
  body: { ...parentRequest, expectedParentRevision: null, expectedParentHash: null, contentHash, reviewKey },
});
assert.equal(posted.status, 200);
const { message: { id: parentId } } = await posted.json();

process.chdir(root);
const app = next({ dev: false, dir: root, hostname: '127.0.0.1', port, quiet: true });
await app.prepare();
const handle = app.getRequestHandler();
const requests = [], failures = [];
let signatures = 0, savedWalletCookie, walletReplayStatus;

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
        if (key === 'POST /api/auth/logout' && reply.ok) {
          assert(savedWalletCookie);
          walletReplayStatus = (await catalog.dispatch('/api/auth/member', { headers: { cookie: savedWalletCookie } })).status;
          assert.equal(walletReplayStatus, 401);
          savedWalletCookie = undefined;
        }
      } else if (key === 'POST /__fixture/wallet-sign') {
        assert.equal(req.headers.origin, origin);
        const message = await readBody(req);
        const parsed = new SiweMessage(message);
        assert.equal(parsed.uri, origin);
        assert.equal(parsed.domain, url.host);
        assert.equal(parsed.address, wallet.address);
        signatures++;
        reply = Response.json({ signature: await wallet.signMessage(message) });
      } else if (key === 'GET /api/circles' || key === 'GET /api/auth/member'
          || key === 'GET ' + circlePath || key === 'POST ' + circlePath + '/join'
          || key === 'GET ' + discussionPath || key === 'POST ' + discussionPath || key === 'POST ' + discussionPath + '/preview') {
        const publicRead = key === 'GET /api/circles' || url.search === '?view=listing';
        if (publicRead) assert(!req.headers.cookie && !req.headers.authorization && !req.headers['x-soe-expected-member']);
        const headers = new Headers(req.headers);
        if (headers.has('origin')) {
          assert.equal(headers.get('origin'), origin);
          headers.set('origin', ORIGIN);
        }
        assert(!headers.has('authorization'));
        const body = req.method === 'POST' ? (await readBody(req)).toString('utf8') : undefined;
        reply = await catalog.dispatch(url.pathname + url.search, { method: req.method, headers, body });
        if (key === 'GET /api/auth/member' && reply.ok && !savedWalletCookie) savedWalletCookie = req.headers.cookie;
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
  buildId, origin, memberId, circleId, walletAddress: wallet.address, parentComment, replyComment, pid: process.pid,
}) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: 'READY', origin, buildId }));
process.once('SIGTERM', async () => {
  await new Promise(done => server.close(done));
  const { rows } = await catalog.db.query(`
    SELECT r.parent_message_id, m.content FROM public.seminar_messages m
    JOIN public.circle_message_reply_links r ON r.message_id=m.id AND r.cohort_id=m.cohort_id
    WHERE m.cohort_id=$1 AND m.member_id=$2`, [circleId, memberId]);
  const savedReply = rows.length === 1 && rows[0].parent_message_id === parentId && rows[0].content.includes(replyComment);
  const joins = (await catalog.db.query('SELECT count(*)::int AS n FROM public.book_cohort_members WHERE cohort_id=$1 AND member_id=$2', [circleId, memberId])).rows[0].n;
  const usedChallenges = (await catalog.db.query('SELECT count(*)::int AS n FROM soe_wallet_private.used_challenges')).rows[0].n;
  const revokedSessions = (await catalog.db.query('SELECT count(*)::int AS n FROM soe_wallet_private.revoked_sessions')).rows[0].n;
  await catalog.close();
  await app.close();
  writeFileSync(resolve(work, 'fixture-stopped.json'), JSON.stringify({
    status: 'STOPPED', buildId, signatures, requests, failures, walletReplayStatus,
    savedReply, joins, usedChallenges, revokedSessions, denied: globalThis.__soeBuiltShellGuard.denied,
  }, null, 2) + '\n', { flag: 'wx' });
  process.exit(failures.length || globalThis.__soeBuiltShellGuard.denied.length ? 1 : 0);
});
