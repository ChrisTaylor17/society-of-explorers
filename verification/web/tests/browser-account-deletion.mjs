import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import {
  browserCookies, createAccountDeletionApp, intent, linked, providerOnly,
} from './support/account-deletion-app.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const evidence = new URL('../evidence/', import.meta.url);
const require = createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const executablePath = '/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const env = { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' };
const build = JSON.parse(await readFile(new URL('built-shell-account-deletion-final-next-build.json', evidence), 'utf8'));
assert(build.sourceUnchangedDuringBuild && build.exitCode === 0);
const report = {
  scenarios: [], errors: [], endpointRequests: 0,
  buildSourceSha256: build.sourceSha256, cleanup: { servers: 0, browser: false, database: false },
  scope: 'Compiled Next pages and proxy. Synthetic provider and PostgREST transports for enabled browser flows, with actual deletion handlers and disposable SQL. The default-off page and auth/origin refusal use the actual compiled server routes. No deployment, live provider, production database, or account erasure.',
};
const pass = story => { report.scenarios.push(story); console.log('PASS ' + story); };

async function startServer(enabled) {
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
  const origin = 'http://127.0.0.1:' + port;
  const server = spawn(process.execPath, [
    '--require', './verification/web/scripts/built-shell-network-guard.cjs',
    './node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port),
  ], {
    cwd: root,
    env: {
      ...env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', CI: '1',
      SOE_BUILT_SHELL_PORT: String(port), NEXT_PUBLIC_SUPABASE_URL: 'https://offline.invalid',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'OFFLINE_PUBLIC_BUILD_PLACEHOLDER_NOT_A_CREDENTIAL',
      ...(enabled ? { SOE_ACCOUNT_DELETION_REQUESTS_ENABLED: 'true', SOE_ACCOUNT_DELETION_REVIEW_DAYS: '4' } : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const closed = once(server, 'close');
  server.stdout.on('data', data => { output += data; });
  server.stderr.on('data', data => { output += data; });
  async function stop() {
    server.kill('SIGTERM');
    const timer = setTimeout(() => server.kill('SIGKILL'), 3000);
    try { await closed; report.cleanup.servers++; } finally { clearTimeout(timer); }
  }
  try {
    const deadline = Date.now() + 12000;
    while (!output.includes('Ready in')) {
      assert(Date.now() < deadline && server.exitCode === null, 'Next failed to become ready: ' + output);
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    return { origin, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

let browser, server, app, failed;
try {
  browser = await chromium.launch({ executablePath, headless: true, env, args: [
    '--disable-background-networking', '--disable-component-update', '--no-first-run',
  ] });
  const options = { viewport: { width: 320, height: 900 }, serviceWorkers: 'block' };
  server = await startServer(false);
  {
    const context = await browser.newContext(options);
    const { origin } = server;
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage();
    const landing = await page.goto(origin + '/account/delete');
    assert.equal(landing.status(), 200);
    assert.match(landing.headers()['cache-control'], /private.*no-store/);
    assert.match(landing.headers()['x-robots-tag'], /noindex/);
    await page.getByText('New deletion requests are currently unavailable here.', { exact: false }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Check my account' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Check request status' }).count(), 1);
    await page.goto(origin + '/account/profile');
    assert.equal(await page.getByRole('link', { name: 'Delete account', exact: true }).getAttribute('href'), '/account/delete');
    const productionApi = await page.evaluate(async () => {
      const response = await fetch('/api/account/deletion');
      return { status: response.status, cache: response.headers.get('cache-control') };
    });
    assert.equal(productionApi.status, 401);
    assert.match(productionApi.cache, /private.*no-store/);
    const queryWrite = await page.evaluate(async () => (await fetch('/api/account/deletion?code=invalid', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    })).status);
    assert.equal(queryWrite, 403);
    await context.close();
    pass('compiled page is public, private-cache, reachable from settings, and starts with intake off');
  }
  await server.stop(); server = null;

  server = await startServer(true);
  const { origin } = server;
  app = await createAccountDeletionApp(origin);
  let gate = null, lostReply = false;
  const observed = [];
  const now = Math.floor(Date.now() / 1000), expires = now + 3600;
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const access = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({
    sub: providerOnly, exp: expires, amr: [{ method: 'password', timestamp: now }],
  }) + '.synthetic';
  const email = 'fictional.reader@example.test';
  const password = 'Synthetic-password-only-28';
  const user = { id: providerOnly, aud: 'authenticated', role: 'authenticated', email, user_metadata: {}, app_metadata: { provider: 'email' } };

  async function makePage(seed = null) {
    const context = await browser.newContext(options);
    if (seed) await context.addCookies(Object.entries(browserCookies(seed)).map(([name, value]) => ({ name, value, url: origin })));
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), method = request.method();
      try {
        if (url.origin === 'https://offline.invalid' && url.pathname.startsWith('/auth/v1/')) {
          const headers = await request.allHeaders();
          assert.equal(headers.apikey, 'OFFLINE_PUBLIC_BUILD_PLACEHOLDER_NOT_A_CREDENTIAL');
          if (url.pathname === '/auth/v1/token' && url.search === '?grant_type=password' && method === 'POST') {
            const data = request.postDataJSON();
            assert.equal(data.email, email);
            assert.equal(data.password, password);
            await route.fulfill({ json: {
              access_token: access, refresh_token: 'SYNTHETIC_REFRESH_FOR_ACCOUNT_DELETION',
              token_type: 'bearer', expires_in: 3600, expires_at: expires, user,
            }});
            return;
          }
          if (url.pathname === '/auth/v1/user' && method === 'GET') {
            assert.equal(headers.authorization, 'Bearer ' + access);
            await route.fulfill({ json: user });
            return;
          }
        }
        if (url.origin !== origin) {
          await route.abort();
          return;
        }
        if (url.pathname === '/api/auth/provider' && method === 'POST') {
          const selection = request.postDataJSON();
          const headers = await request.allHeaders();
          assert.equal(headers.origin, origin);
          assert.equal(selection.provider, 'supabase');
          assert.equal(selection.expectedSubject, providerOnly);
          assert.match(headers.cookie, /sb-offline-auth-token=/);
          assert(headers.cookie.includes('soe_auth_intent=' + selection.intent));
          const cookies = browserCookies(providerOnly, 'supabase', selection.intent);
          await context.addCookies(Object.entries(cookies).map(([name, value]) => ({ name, value, url: origin })));
          observed.push({ kind: 'selection' });
          await route.fulfill({ json: { selected: 'supabase', subject: providerOnly, intent: selection.intent } });
          return;
        }
        if (url.pathname === '/api/auth/member' || url.pathname === '/api/auth/ensure-member') {
          observed.push({ kind: 'member-route' });
          await route.fulfill({ status: 401, json: { error: 'No member' } });
          return;
        }
        if (url.pathname === '/api/account/deletion') {
          report.endpointRequests++;
          const headers = await request.allHeaders();
          const body = request.postData() ?? undefined;
          const action = body ? JSON.parse(body).action : 'read';
          assert.equal(url.search, '');
          assert.equal(headers.authorization, undefined);
          // Chromium's route interception omits the implicit HTTP Host.
          // NextRequest needs the same loopback authority that Next receives.
          const response = await app.dispatch(method, { headers: { ...headers, host: url.host }, body });
          observed.push({ kind: action, status: response.status });
          if (gate && method === 'GET') {
            const hold = gate;
            gate = null;
            hold.ready();
            await hold.done;
          }
          if (action === 'request' && lostReply) {
            lostReply = false;
            assert.equal(response.status, 200);
            await route.fulfill({ status: 503, json: { error: 'Simulated lost response' } });
          } else {
            await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
          }
          return;
        }
        await route.continue();
      } catch (error) {
        report.errors.push(error.message);
        await route.abort().catch(() => {});
      }
    });
    const page = await context.newPage();
    page.setDefaultTimeout(9000);
    page.on('pageerror', error => report.errors.push(error.message));
    return { context, page };
  }

  const web = await makePage();
  const { page } = web;
  const button = name => page.getByRole('button', { name, exact: true });
  const target = origin + '/account/delete';
  await page.goto(target);
  await button('Check my account').waitFor();
  assert.equal(report.endpointRequests, 0);
  const link = page.getByRole('link', { name: 'Sign in on this website', exact: true });
  assert.equal(await link.getAttribute('href'), '/login?next=%2Faccount%2Fdelete');
  await link.click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await button('Sign in').click();
  await page.waitForURL(target);
  assert.deepEqual(observed.map(entry => entry.kind), ['selection', 'read']);
  pass('password sign-in opens deletion after a fresh selected-provider read with no member lookup or setup');

  await button('Check my account').click();
  await page.getByText(email, { exact: true }).waitFor();
  await page.screenshot({ path: new URL('account-deletion-320.png', evidence).pathname, fullPage: true });
  await button('Prepare deletion request').click();
  const display = page.locator('output[aria-label="Private status code"] code');
  const code = await display.innerText();
  assert.match(code, /^[0-9a-f-]{36}\.[0-9a-f]{64}$/);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const input = await page.locator('#deletion-status-code').boundingBox();
  assert(input && input.height >= 44);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true, value: { writeText: async value => { window.copiedStatusCode = value; } },
    });
  });
  await button('Copy status code').click();
  await page.getByText('Private status code copied.').waitFor();
  assert(await page.evaluate(expected => window.copiedStatusCode === expected, code));
  assert(await button('Submit deletion request').isDisabled());
  assert.deepEqual(observed.map(entry => entry.kind), ['selection', 'read', 'read']);

  await page.getByLabel('Type DELETE to confirm').fill('DELETE');
  lostReply = true;
  await button('Submit deletion request').click();
  await page.getByText('The request may have been received.', { exact: false }).waitFor();
  assert.equal((await app.db.query('SELECT count(*)::int AS n FROM soe_account_deletion_private.requests')).rows[0].n, 1);
  await button('Submit deletion request').click();
  await page.getByText('Request received. Account deletion is pending.', { exact: true }).waitFor();
  assert.equal((await app.db.query('SELECT count(*)::int AS n FROM soe_account_deletion_private.requests')).rows[0].n, 1);
  assert.deepEqual(observed.filter(entry => entry.kind === 'request').map(entry => entry.status), [200, 200]);
  await web.context.close();
  pass('the 320px browser requires typed confirmation, handles a lost response, and confirms only one persisted request');

  const anonymous = await makePage();
  await anonymous.page.goto(target);
  await anonymous.page.locator('#deletion-status-code').fill(code);
  await anonymous.page.getByRole('button', { name: 'Check request status' }).click();
  await anonymous.page.getByText('Request received. Account deletion is pending.', { exact: true }).waitFor();
  assert.equal(await anonymous.page.locator('#deletion-status-code').inputValue(), '');
  assert.equal(anonymous.page.url(), target);
  assert.doesNotMatch(await anonymous.page.locator('body').innerText(), new RegExp(email));
  await anonymous.context.close();
  pass('a fresh anonymous browser retrieves pending status using the full code, without exposing the account identity');

  const google = await makePage(linked);
  await google.page.goto(origin + '/auth/complete?next=%2Faccount%2Fdelete&intent=' + intent);
  await google.page.getByRole('button', { name: 'Continue to your account' }).click();
  await google.page.waitForURL(target);
  assert(!observed.some(entry => entry.kind === 'member-route'));
  await google.context.close();
  pass('the Google completion page checks the selected provider without provisioning a member for deletion');

  const stale = await makePage(providerOnly);
  await stale.page.goto(target);
  let release, entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const done = new Promise(resolve => { release = resolve; });
  gate = { ready: entered, done };
  await stale.page.getByRole('button', { name: 'Check my account' }).click();
  const timeout = setTimeout(release, 5000);
  try {
    await Promise.race([ready, done]);
    assert.equal(gate, null, 'Expected an owned held read');
    await stale.context.addCookies(Object.entries(browserCookies(linked)).map(([name, value]) => ({ name, value, url: origin })));
    await stale.page.evaluate(() => window.dispatchEvent(new Event('soe:auth-provider-changed')));
  } finally {
    clearTimeout(timeout);
    release();
  }
  await stale.page.getByRole('button', { name: 'Check my account' }).click();
  await stale.page.getByText(email, { exact: true }).waitFor();
  assert.equal(await stale.page.getByText('Request received. Account deletion is pending.', { exact: true }).count(), 0);
  assert.equal(await stale.page.getByRole('button', { name: 'Prepare deletion request' }).count(), 1);
  await stale.context.close();
  pass('an account change retires an in-flight read and the replacement account starts with its own review');
  assert.deepEqual(report.errors, []);
} catch (error) {
  failed = error;
  console.error(error);
} finally {
  if (browser) { await browser.close(); report.cleanup.browser = true; }
  if (server) await server.stop();
  if (app) { await app.close(); report.cleanup.database = true; }
  await writeFile(new URL('account-deletion-browser.json', evidence), JSON.stringify({
    ...report, result: failed ? 'FAIL' : 'PASS', ...(failed ? { failure: failed.message } : {}),
  }, null, 2) + '\n');
}
if (failed) process.exitCode = 1;
