import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { Wallet } from 'ethers';
import { NextRequest, NextResponse } from 'next/server.js';
import { SiweMessage } from 'siwe';

const [prefix, ...extra] = process.argv.slice(2);
assert(!extra.length && /^built-shell-[a-z0-9-]+-$/.test(prefix ?? ''));
assert(process.execArgv.some(arg => arg.endsWith('/deny-build-network.cjs')));
const root = process.cwd();
const evidence = resolve('verification/web/evidence');
const readyPath = resolve(evidence, prefix + 'server-ready.json');
const ready = JSON.parse(readFileSync(readyPath));
assert.equal(ready.status, 'READY');
assert.equal(readFileSync('.next/BUILD_ID', 'utf8').trim(), ready.buildId);
const origin = ready.origin;
assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
for (const path of ['app/layout.tsx', 'app/login/page.tsx', 'lib/auth/webAccount.ts',
  'lib/auth/request.ts', 'app/api/auth/nonce/route.ts', 'app/api/auth/siwe/route.ts', 'app/api/auth/member/route.ts',
  'app/api/auth/logout/route.ts', 'components/AccountSignOut.tsx', 'lib/auth/walletSessionStore.ts', 'proxy.ts']) {
  assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), ready.sourceHashes[path], path);
}
const require = createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');
const executablePath = '/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
assert(lstatSync(executablePath).blocks, 'Chromium must be resident');

process.chdir(resolve(root, 'verification/web'));
const { offlineApp } = await import('../tests/support/offline-app.mjs');
const app = offlineApp({ root });
const id = '11111111-1111-4111-8111-111111111111';
const wallet = Wallet.createRandom();
const db = app.fakes.resetDb({ members: [{ id, display_name: 'Fixture reader', wallet_address: wallet.address.toLowerCase() }] });
db.strictSingle = true;
const rpc = db.rpc.bind(db), revoked = new Set();
let revocationUnavailable = false;
db.rpc = (name, args) => {
  if (name !== 'soe_wallet_session_access') return rpc(name, args);
  return { async abortSignal(signal) {
    assert(signal instanceof AbortSignal);
    if (args.p_revoke && revocationUnavailable) return { data: null, error: { message: 'Synthetic ledger outage' } };
    if (args.p_revoke) revoked.add(args.p_digest);
    return { data: args.p_revoke || !revoked.has(args.p_digest), error: null };
  } };
};
app.context.process.env.NODE_ENV = 'production';
app.setMock('next/server', () => ({ NextResponse }));
app.setMock('@/lib/supabase/server', () => ({ createServiceClient: () => db }));
app.setMock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => db }));
app.setMock('@/lib/auth/walletSessionStore', () => app.load('lib/auth/walletSessionStore.ts'));
const handlers = new Map([
  ['GET /api/auth/nonce', app.load('app/api/auth/nonce/route.ts').GET],
  ['POST /api/auth/siwe', app.load('app/api/auth/siwe/route.ts').POST],
  ['GET /api/auth/member', app.load('app/api/auth/member/route.ts').GET],
  ['POST /api/auth/logout', app.load('app/api/auth/logout/route.ts').POST],
]);
const errors = [], requests = [];
let signatures = 0;
const browser = await require('playwright').chromium.launch({
  headless: true, executablePath, timeout: 15_000,
  env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' },
  args: ['--disable-background-networking', '--disable-component-update', '--no-first-run',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'],
});
try {
  const options = { serviceWorkers: 'block', acceptDownloads: false };
  const intercept = context => context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    try {
      assert.equal(url.origin, origin, 'External request refused');
      if (!url.pathname.startsWith('/api/')) return await route.continue();
      const method = request.method(), key = method + ' ' + url.pathname;
      const handler = handlers.get(key);
      assert(handler, key);
      const headers = { ...await request.allHeaders(), host: url.host };
      assert(!headers.authorization, 'Wallet sign-in must not use a bearer token');
      const response = await handler(new NextRequest(url, { method, headers, body: request.postData() ?? undefined }));
      const delivery = Object.fromEntries(response.headers);
      const cookies = response.headers.getSetCookie();
      if (cookies.length) delivery['set-cookie'] = cookies.join('\n');
      requests.push({ method, path: url.pathname, status: response.status });
      await route.fulfill({ status: response.status, headers: delivery, body: await response.text() });
    } catch (error) {
      if (request.failure()?.errorText !== 'net::ERR_ABORTED') errors.push(error.message);
      await route.abort().catch(() => {});
    }
  });
  const context = await browser.newContext(options);
  await intercept(context);
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.on('pageerror', error => errors.push(error.message));
  const login = origin + '/login?next=%2Fmanifesto';
  const connect = page.getByRole('button', { name: 'Connect wallet', exact: true });
  assert.equal((await page.goto(login)).status(), 200);
  await connect.click();
  await page.getByText('Open this page in a browser with an Ethereum wallet, or sign in with email.').waitFor();
  assert.deepEqual(requests, []);

  await page.exposeFunction('signFixtureMessage', message => {
    const parsed = new SiweMessage(message);
    assert.equal(parsed.uri, origin);
    assert.equal(parsed.domain, new URL(origin).host);
    assert.equal(parsed.address, wallet.address);
    signatures++;
    return wallet.signMessage(message);
  });
  await page.addInitScript(address => {
    window.ethereum = {
      async request({ method, params }) {
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [address];
        if (method === 'eth_chainId') return '0x1';
        if (method === 'personal_sign') return window.signFixtureMessage(params[0]);
        throw new Error('Unexpected wallet method');
      },
    };
  }, wallet.address);
  assert.equal((await page.reload()).status(), 200);
  await connect.click();
  await page.waitForURL(origin + '/manifesto');
  assert.equal(signatures, 1);
  assert.deepEqual(requests.slice(0, 3), [
    { method: 'GET', path: '/api/auth/nonce', status: 200 },
    { method: 'POST', path: '/api/auth/siwe', status: 200 },
    { method: 'GET', path: '/api/auth/member', status: 200 },
  ]);
  const cookies = await context.cookies();
  for (const name of ['soe_wallet_id', 'soe_auth_provider', 'soe_auth_selection_v1']) {
    const cookie = cookies.find(cookie => cookie.name === name);
    assert(cookie?.httpOnly && cookie.secure, name);
  }
  assert(!cookies.some(cookie => cookie.name === 'soe_siwe_nonce'));
  assert.equal((await page.reload()).status(), 200);
  const member = await page.evaluate(async () => (await fetch('/api/auth/member', { cache: 'no-store' })).json());
  assert.deepEqual(member.auth, { provider: 'wallet', subject: id });
  assert.equal(member.member.id, id);

  const replay = await browser.newContext(options);
  await intercept(replay);
  await replay.addCookies(cookies);
  const replayPage = await replay.newPage();
  replayPage.on('pageerror', error => errors.push(error.message));
  await replayPage.goto(origin + '/login');
  const readMember = current => current.evaluate(async () => (await fetch('/api/auth/member', { cache: 'no-store' })).status);
  assert.equal(await readMember(replayPage), 200);

  revocationUnavailable = true;
  await page.getByRole('button', { name: 'Sign out of this browser', exact: true }).click();
  const retry = page.getByRole('button', { name: 'Retry browser sign-out', exact: true });
  await retry.waitFor();
  assert.equal(requests.filter(request => request.path === '/api/auth/logout').at(-1)?.status, 503);
  assert.equal(await readMember(page), 401);
  assert.equal(await readMember(replayPage), 200);
  const protectedPath = '/dashboard?tab=profile';
  await page.goto(origin + protectedPath);
  assert.equal(new URL(page.url()).pathname, '/login');
  assert.equal(new URL(page.url()).searchParams.get('next'), protectedPath);
  assert.equal(new URL(page.url()).searchParams.get('walletSignOut'), 'pending');
  await retry.waitFor();

  revocationUnavailable = false;
  await retry.click();
  await page.getByText('This wallet session was revoked.', { exact: true }).waitFor();
  assert.equal(revoked.size, 1);
  assert.equal(await readMember(replayPage), 401);
  const newValue = await app.load('lib/auth/walletSession.ts').createWalletSessionValue(id);
  await replay.addCookies([{ ...cookies.find(cookie => cookie.name === 'soe_wallet_id'), value: newValue }]);
  assert.equal(await readMember(replayPage), 200);
  await page.reload();
  assert.equal(new URL(page.url()).searchParams.has('walletSignOut'), false);
  assert.equal(await retry.count(), 0);
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
const receipt = { status: 'PASS', buildId: ready.buildId, signatures, requests,
  scenarios: ['No injected wallet leaves email sign-in available', 'Injected wallet signs and verifies the numeric loopback origin',
    'HttpOnly session survives reload and the signed challenge is cleared',
    'An unavailable revocation locks private access and a protected reload exposes the retry on the actual login page',
    'Retry revokes the copied cookie, preserves a distinct session and clears the retry on reload'],
  scope: 'Built Chromium UI and proxy, actual intercepted auth handlers and Next cookies, synthetic wallet and lower-level database double, local network only.' };
writeFileSync(resolve(evidence, prefix + 'wallet-browser.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(receipt));
