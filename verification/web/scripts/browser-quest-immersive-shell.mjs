import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const [prefix, output, ...extra] = process.argv.slice(2);
assert(!extra.length && /^built-shell-quest-[a-z0-9-]+-$/.test(prefix ?? ''));
assert(/^quest-immersive-built-[0-9]+$/.test(output ?? ''));
assert(process.execArgv.some(value => value.endsWith('/deny-build-network.cjs')));
const evidence = resolve('verification/web/evidence');
const run = resolve(evidence, output);
const readyPath = resolve(evidence, prefix + 'server-ready.json');
const resident = path => {
  const info = lstatSync(path);
  assert(info.isFile() && info.blocks, path);
  return path;
};
const hash = path => createHash('sha256').update(readFileSync(resident(path))).digest('hex');
const readyHash = hash(readyPath);
const ready = JSON.parse(readFileSync(readyPath));
assert.equal(ready.status, 'READY');
assert.match(ready.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
const require = createRequire(resident('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json'));
const executablePath = resident('/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const circle = '01234567-aaaa-4abc-8abc-123456789abc';
const secureOrigin = 'https://quest-immersive-shell.test';
const stories = [], privateCalls = [], external = [], errors = [], screenshots = [];
const get = promisify(execFile);
const loopbackGuard = resident(resolve('verification/web/scripts/built-shell-network-guard.cjs'));
const forwarded = ['accept', 'rsc', 'next-router-prefetch', 'next-router-state-tree', 'next-url', 'next-router-segment-prefetch'];
let forwardedResponses = 0;
let browser, closed = false, failure = null;
async function localResponse(url, request) {
  assert.equal(request.method(), 'GET');
  const supplied = request.headers();
  const headers = Object.fromEntries(forwarded.filter(key => key in supplied).map(key => [key, supplied[key]]));
  // The launcher must spawn Chromium, while this separate GET worker can be
  // restricted to the exact guarded HTTP listener. Forward only router hints.
  const { stdout } = await get(process.execPath, ['--require', loopbackGuard, '-e', `
    (async () => {
      const guard = globalThis.__soeBuiltShellGuard;
      const url = new URL(process.argv[1], guard.origin);
      if (url.origin !== guard.origin) throw Error('Unexpected fixture origin');
      const response = await fetch(url, { headers: JSON.parse(process.argv[2]), redirect: 'manual' });
      const headers = Object.fromEntries(response.headers);
      for (const key of ['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'set-cookie']) delete headers[key];
      const bytes = Buffer.from(await response.arrayBuffer());
      if (guard.denied.length || bytes.length > 8000000) throw Error('Unexpected fixture response');
      process.stdout.write(JSON.stringify({ status: response.status, headers, body: bytes.toString('base64') }));
    })().catch(error => { console.error(error.message); process.exitCode = 1; });`, url.pathname + url.search, JSON.stringify(headers)],
  { env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor', SOE_BUILT_SHELL_PORT: new URL(ready.origin).port },
    timeout: 6000, maxBuffer: 12000000 });
  const reply = JSON.parse(stdout);
  forwardedResponses++;
  return { ...reply, body: Buffer.from(reply.body, 'base64') };
}
async function open(origin) {
  const context = await browser.newContext({ viewport: { width: 320, height: 850 }, serviceWorkers: 'block' });
  await context.addInitScript(() => {
    window.xrFixtureCalls = 0;
    Object.defineProperty(navigator, 'xr', { value: {
      isSessionSupported: async () => { window.xrFixtureCalls++; return true; },
      requestSession: async () => { window.xrFixtureCalls++; throw Error('Unexpected immersive request'); },
    } });
  });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    try {
      if (url.origin !== origin) { external.push(url.origin + url.pathname); await route.abort(); return; }
      if (url.pathname.startsWith('/api/')) { privateCalls.push(url.pathname); await route.abort(); return; }
      if (origin === ready.origin) { await route.continue(); return; }
      await route.fulfill(await localResponse(url, route.request()));
    } catch (error) { errors.push(String(error)); await route.abort().catch(() => {}); }
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  page.setDefaultTimeout(8000);
  return { context, page };
}

try {
  browser = await require('playwright').chromium.launch({ executablePath, headless: true, timeout: 12000,
    env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' },
    args: ['--disable-background-networking', '--disable-component-update', '--no-first-run',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
  const local = await open(ready.origin), path = '/quest/' + circle;
  assert.equal((await local.page.goto(ready.origin + '/quest')).status(), 200);
  await local.page.getByRole('heading', { name: 'Your Circle in Quest Browser' }).waitFor();
  await local.page.getByText(/read recent Circle discussion and write short posts or replies/).waitFor();
  assert.equal((await local.page.goto(ready.origin + '/quest/not-a-circle')).status(), 404);
  stories.push('The built Quest entry explains both modes and invalid Circle links return HTTP 404.');
  const response = await local.page.goto(ready.origin + path);
  assert.equal(response.status(), 200);
  assert.doesNotMatch(response.headers()['permissions-policy'] ?? '', /xr-spatial-tracking\s*=\s*\(\s*\)/);
  const connect = page => page.getByRole('button', { name: 'Connect signed-in account', exact: true });
  const enter = page => page.getByRole('button', { name: 'Enter immersive room', exact: true });
  await local.page.getByRole('heading', { name: 'Immersive Circle discussion', exact: true }).waitFor();
  await local.page.getByText(/Point your controller at the buttons to write, review and post/).waitFor();
  assert(await enter(local.page).isDisabled());
  assert.equal(await local.page.getByRole('link', { name: 'Regular Circle view and safety controls', exact: true }).getAttribute('href'), '/circles/' + circle);
  await connect(local.page).click();
  await local.page.getByText(/This view needs a secure connection/).waitFor();
  assert.equal(await local.page.evaluate(() => window.xrFixtureCalls), 0);
  assert.equal(await local.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const shot = resolve(run, 'quest-320.png');
  await local.page.screenshot({ path: shot, fullPage: true });
  screenshots.push({ path: shot, sha256: hash(shot) });
  await local.context.close();
  stories.push('At 320px the built Circle keeps its same-Circle fallback. The HTTP page cannot open the account or headset.');
  const secure = await open(secureOrigin);
  assert.equal((await secure.page.goto(secureOrigin + path)).status(), 200);
  await connect(secure.page).click();
  await secure.page.getByText(/Member sign-in is unavailable for this view/).waitFor();
  assert(await enter(secure.page).isDisabled());
  assert.equal(await secure.page.evaluate(() => window.xrFixtureCalls), 0);
  assert.equal((await secure.page.goto(secureOrigin + '/quest/contributions')).status(), 200);
  await secure.page.getByRole('heading', { name: 'My Quest Browser contributions' }).waitFor();
  assert.equal(await enter(secure.page).count(), 0);
  await secure.page.waitForLoadState('networkidle');
  await secure.context.close();
  stories.push('Synthetic HTTPS backed by the guarded local build still holds private access. The account-level contributions page has no headset controls.');
  assert.deepEqual({ privateCalls, external, errors }, { privateCalls: [], external: [], errors: [] });
} catch (error) { failure = error.stack || String(error); }
finally {
  if (browser) {
    try { await browser.close(); closed = true; }
    catch (error) { failure ??= String(error); }
  }
  assert.equal(hash(readyPath), readyHash);
  writeFileSync(resolve(run, 'browser.json'), JSON.stringify({ status: failure ? 'FAIL' : 'PASS', buildId: ready.buildId,
    readyHash, stories, privateCalls, external, errors, closed, screenshots, forwardedResponses, failure }, null, 2) + '\n', { flag: 'wx' });
}
if (failure) throw Error(failure);
console.log(JSON.stringify({ status: 'PASS', stories: stories.length, closed }));
