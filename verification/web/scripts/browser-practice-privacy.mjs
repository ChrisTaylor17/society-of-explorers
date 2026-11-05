import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { A, B, C, D, Q, prompt, practiceHttp } from '../tests/support/practice-privacy-fixture.mjs';

const [prefix, run, ...extra] = process.argv.slice(2);
assert(!extra.length && /^built-shell-practice-privacy-[0-9]+-$/.test(prefix ?? ''));
assert(/^practice-browser-[0-9]+$/.test(run ?? ''));
assert(process.execArgv.some(arg => arg.endsWith('/deny-build-network.cjs')));
const directory = resolve('evidence', run);
const ready = JSON.parse(readFileSync(resolve('evidence', prefix + 'server-ready.json')));
assert.equal(ready.status, 'READY');
assert.match(ready.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
const origin = ready.origin;

function resident(path) {
  const info = lstatSync(path);
  assert(info.isFile() && info.blocks && info.size, path);
  return path;
}
const require = createRequire(resident('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json'));
const chrome = resident('/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const stories = [], calls = [], screenshots = [], pageErrors = [], requestErrors = [], external = [];
const close = [];
let browser, fixture, failure, browserClosed = false, dbClosed = false;
let currentActor = null, failFirstPulse = true, held = null;
const routes = new Map([
  ['/api/feed/pulse', 'app/api/feed/pulse/route.ts'],
  ['/api/practice/my-today', 'app/api/practice/my-today/route.ts'],
  ['/api/practice/respond', 'app/api/practice/respond/route.ts'],
]);
async function snapshot(page, name) {
  const data = await page.screenshot({ animations: 'disabled' });
  writeFileSync(resolve(directory, name), data, { flag: 'wx' });
  screenshots.push({ name, sha256: createHash('sha256').update(data).digest('hex') });
}
function defer() {
  let done;
  const promise = new Promise(resolve => { done = resolve; });
  return { promise, done };
}
function soon(promise) {
  let timer;
  const expired = new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Fixture did not reach save')), 8000); });
  return Promise.race([promise, expired]).finally(() => clearTimeout(timer));
}

try {
  fixture = await practiceHttp(cleanup => close.push(cleanup));
  browser = await require('playwright').chromium.launch({
    headless: true, executablePath: chrome, timeout: 12000,
    env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' },
    args: ['--disable-background-networking', '--disable-component-update', '--no-first-run',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'],
  });
  const context = await browser.newContext({ viewport: { width: 320, height: 840 }, serviceWorkers: 'block', acceptDownloads: false });
  await context.route('**/*', async route => {
    let allowAbort = false;
    try {
      const request = route.request(), url = new URL(request.url()), method = request.method();
      if (url.origin !== origin) {
        external.push(url.origin + url.pathname);
        return await route.abort();
      }
      if (!url.pathname.startsWith('/api/')) return await route.continue();
      const log = { path: url.pathname, method };
      calls.push(log);
      if (url.pathname === '/api/auth/member') {
        return await route.fulfill({ status: 401, json: { session: 'signed_out' } });
      }
      if (url.pathname === '/api/feed/pulse' && failFirstPulse) {
        failFirstPulse = false;
        return await route.fulfill({ status: 503, json: { error: 'Fixture retry' } });
      }
      const handler = routes.get(url.pathname);
      if (!handler) return await route.continue();
      fixture.setActor(currentActor);
      const response = await fixture.app.load(handler)[method](new Request(url, {
        method, headers: await request.allHeaders(), ...(method === 'POST' ? { body: request.postDataBuffer() } : {}),
      }));
      log.status = response.status;
      log.expectedOwner = (await request.headerValue('x-soe-practice-owner')) !== null;
      if (url.pathname === '/api/practice/respond' && held) {
        allowAbort = true;
        held.reached.done(response.status);
        await held.release.promise;
      }
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
    } catch (error) {
      if (!allowAbort) requestErrors.push(String(error));
      try { await route.abort(); } catch {}
    }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', error => pageErrors.push(String(error)));
  const main = page.getByRole('main');

  assert.equal((await page.goto(origin + '/feed')).status(), 200);
  await main.getByRole('alert').waitFor();
  await main.getByRole('button', { name: 'Try again' }).press('Enter');
  await main.getByText(prompt, { exact: true }).waitFor();
  assert.equal(await main.getByRole('link', { name: 'Watch Reels and read passages' }).getAttribute('href'), '/clips');
  assert.equal(await main.getByRole('link', { name: 'Find a Circle' }).getAttribute('href'), '/circles');
  assert.doesNotMatch(await main.innerText(), /OWNER_|Leaderboard|Wisdom moments/i);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const heading = await main.getByRole('heading', { name: 'Community feed' }).boundingBox();
  assert(heading && heading.y >= 70 && heading.x >= 15);
  await snapshot(page, 'feed-320.png');
  stories.push('The built public Feed recovered after a test outage and showed the stored prompt, Clips and Circles at 320px.');

  assert.equal((await page.goto(origin + '/practice')).status(), 200);
  await main.getByRole('textbox', { name: /your answer/i }).waitFor();
  assert.equal(await main.getByRole('link', { name: 'Save with a free account' }).count(), 1);
  assert.doesNotMatch(await main.innerText(), /OWNER_|other explorers today/i);
  const old = await page.evaluate(async q => {
    const others = await fetch('/api/practice/others?questionId=' + q);
    const responses = await fetch('/api/practice/responses?days=7');
    const reflect = await fetch('/api/practice/reflect', { method: 'POST' });
    return [others.status, responses.status, reflect.status];
  }, Q);
  assert.deepEqual(old, [410, 410, 503]);
  stories.push('Anonymous Practice offers a local draft and the built legacy answer and automatic reflection routes return retirement or paused responses.');

  currentActor = A;
  await page.reload();
  await main.getByText('OWNER_A_ANSWER', { exact: true }).waitFor();
  await main.getByText('OWNER_A_REFLECTION', { exact: true }).waitFor();
  assert.doesNotMatch(await main.innerText(), /OWNER_B_/);
  stories.push('A verified author reopened their saved answer and historical reflection without another author’s content.');

  currentActor = C;
  await page.reload();
  const composer = main.getByRole('textbox', { name: /your answer/i });
  await composer.fill('SYNTHETIC_PRIVATE_SAVE');
  await main.getByRole('button', { name: 'Save answer' }).click();
  await main.getByText('SYNTHETIC_PRIVATE_SAVE', { exact: true }).waitFor();
  assert.equal(await main.getByRole('link', { name: 'Find a Circle' }).getAttribute('href'), '/circles');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await main.getByText('SYNTHETIC_PRIVATE_SAVE', { exact: true }).scrollIntoViewIfNeeded();
  await snapshot(page, 'practice-320.png');
  assert.equal(calls.filter(x => x.path === '/api/practice/reflect').length, 1);
  await page.reload();
  await main.getByText('SYNTHETIC_PRIVATE_SAVE', { exact: true }).waitFor();
  stories.push('A member saved, received the exact persisted text, and reopened it after reload. The save made no automatic AI request.');

  currentActor = D;
  await page.reload();
  await composer.fill('STALE_ACCOUNT_SAVE_MUST_FAIL');
  currentActor = B;
  const before = fixture.calls.length;
  await main.getByRole('button', { name: 'Save answer' }).click();
  await main.getByRole('alert').waitFor();
  assert.equal(calls.filter(x => x.path === '/api/practice/respond').at(-1).status, 409);
  assert.equal(fixture.calls.length, before);
  assert.doesNotMatch(await main.innerText(), /STALE_ACCOUNT_SAVE|OWNER_B_/);
  stories.push('Changing the server account before a save caused an owner-mismatch response and no database call.');

  currentActor = D;
  await page.reload();
  await composer.fill('LATE_OWNER_RECEIPT');
  held = { reached: defer(), release: defer() };
  await main.getByRole('button', { name: 'Save answer' }).click();
  assert.equal(await soon(held.reached.promise), 200);
  await page.evaluate(() => window.dispatchEvent(new Event('soe:auth-provider-changed')));
  await main.getByRole('alert').waitFor();
  held.release.done();
  await page.waitForLoadState('networkidle');
  assert.doesNotMatch(await main.innerText(), /LATE_OWNER_RECEIPT|OWNER_/);
  held = null;
  await page.reload();
  await main.getByText('LATE_OWNER_RECEIPT', { exact: true }).waitFor();
  stories.push('An account-change event retired a late save response. A fresh author load confirmed the already committed entry.');

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(requestErrors, []);
  assert.deepEqual(external, []);
  assert.deepEqual(fixture.failures, []);
  assert.equal(fixture.providers(), 0);
  assert.equal(calls.filter(x => x.path === '/api/practice/reflect').length, 1);
} catch (error) {
  failure = String(error?.stack || error);
} finally {
  held?.release.done();
  if (browser) { await browser.close(); browserClosed = true; }
  for (const cleanup of close) await cleanup();
  dbClosed = close.length === 1;
  const report = {
    status: !failure && browserClosed && dbClosed ? 'PASS' : 'FAIL', buildId: ready.buildId,
    stories, calls, screenshots, browserClosed, dbClosed, pageErrors, requestErrors, external,
    databaseCalls: fixture?.calls.length ?? 0, providerCalls: fixture?.providers() ?? null,
    failure: failure ?? null,
  };
  writeFileSync(resolve(directory, 'browser.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ status: report.status, stories: stories.length, browserClosed, dbClosed, failure: report.failure }));
  if (report.status !== 'PASS') process.exitCode = 1;
}
