import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { publicFeedFixture, EVENT, LEGACY, summary } from '../tests/support/public-feed-fixture.mjs';

const [prefix, run, ...rest] = process.argv.slice(2);
assert(!rest.length && /^built-shell-public-feed-[a-z0-9-]+-$/.test(prefix ?? '') && /^public-feed-browser-[0-9]+$/.test(run ?? ''));
assert(process.execArgv.some(v => v.endsWith('/deny-build-network.cjs')));
const hash = value => createHash('sha256').update(value).digest('hex');
const readyPath = resolve('verification/web/evidence', prefix + 'server-ready.json');
const ready = JSON.parse(readFileSync(readyPath)); assert.equal(ready.status, 'READY');
const origin = ready.origin; assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
const output = resolve('verification/web/evidence', run); mkdirSync(output, { recursive: true });
const require = createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');
const closes = [], f = await publicFeedFixture({ after: fn => closes.push(fn) });
await f.seed(); await f.seed(LEGACY, { metadata: { private_note: 'PRIVATE_LEGACY_MEMBER_ACTIVITY' } });
const stories = [], external = [], errors = [], api = [], screenshots = [];
let browser, context, failure = null, mode = 'normal', release = null;
try {
  browser = await require('playwright').chromium.launch({ headless: true,
    executablePath: '/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' } });
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    try {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { external.push(url.origin + url.pathname); return route.abort(); }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    api.push({ path: url.pathname, method: request.method() });
    if (url.pathname === '/api/auth/member' && request.method() === 'GET') return route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Signed-out navigation fixture"}' });
    assert.equal(url.pathname, '/api/feed'); assert.equal(request.method(), 'GET');
    if (mode === 'real-api') return route.continue();
    if (mode === 'hold') {
      await new Promise(resolve => { release = resolve; });
      try { return await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ schema: 'soe-public-activity-v1', events: [] }) }); }
      catch { return; } // The page deliberately aborts the timed-out request.
    }
    if (mode === 'old-server') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events: [{ id: EVENT, title: 'PRIVATE_OLD_RESPONSE', member_id: 'PRIVATE_OWNER' }] }) });
    const response = await f.GET(f.request(url.search));
    return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
    } catch (error) { errors.push(String(error)); await route.abort().catch(() => {}); }
  });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(String(error)));
  const open = async () => { assert.equal((await page.goto(origin + '/activity')).status(), 200); };
  const fits = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await open(); await page.getByText(summary.title, { exact: true }).waitFor();
  assert(!(await page.locator('body').innerText()).includes('PRIVATE_')); await fits();
  const shot = resolve(output, 'published-activity-phone.png'); await page.screenshot({ path: shot, fullPage: true });
  screenshots.push({ path: shot, sha256: hash(readFileSync(shot)) });
  stories.push('The actual compiled activity page shows only the reviewed public copy from the actual route and synthetic SQL; raw and legacy private canaries are absent.');
  await f.db.query('UPDATE activity_feed SET is_public=false WHERE id=$1', [EVENT]);
  await open(); await page.getByText('No published activity is available yet.', { exact: false }).waitFor();
  assert.equal(await page.getByText(summary.title, { exact: true }).count(), 0);
  assert.equal(await page.getByRole('link', { name: 'Explore the Circles', exact: true }).getAttribute('href'), '/circles');
  stories.push('Withdrawal disappears on the next load; the empty state points to Circles and does not promise that a private Council action will be published.');
  f.failure = 'communities'; await open();
  await page.getByText('Published activity could not be loaded.', { exact: true }).waitFor();
  assert.equal(await page.getByText('No published activity is available yet.', { exact: false }).count(), 0);
  f.failure = null; await f.db.query('UPDATE activity_feed SET is_public=true WHERE id=$1', [EVENT]);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.getByText(summary.title, { exact: true }).waitFor();
  stories.push('A database error is shown as unavailable, not empty; an explicit retry recovers the reviewed feed.');
  mode = 'old-server'; await open(); await page.getByText('Published activity could not be loaded.', { exact: true }).waitFor();
  assert(!(await page.locator('body').innerText()).includes('PRIVATE_OLD_RESPONSE'));
  stories.push('An old or malformed raw response is rejected by the new display contract. This is display defense, not protection against an old server disclosing data over the network.');
  mode = 'hold'; await open(); await page.getByText('Loading published activity…', { exact: true }).waitFor();
  await page.getByText('Published activity could not be loaded.', { exact: true }).waitFor({ timeout: 12500 });
  release(); release = null; mode = 'normal';
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.getByText(summary.title, { exact: true }).waitFor();
  stories.push('A stalled request reaches the ten-second unavailable state; retry works and the retired response cannot replace the current feed.');
  await page.setViewportSize({ width: 320, height: 900 }); await fits();
  mode = 'real-api';
  const unavailable = await page.evaluate(async () => {
    const response = await fetch('/api/feed', { credentials: 'omit', cache: 'no-store', redirect: 'error' });
    return { status: response.status, body: await response.json(), cacheControl: response.headers.get('cache-control') };
  });
  assert.equal(unavailable.status, 503);
  assert.deepEqual(unavailable.body, { error: 'Community activity is unavailable.' });
  assert.match(unavailable.cacheControl, /no-store/);
  stories.push('The screen fits 390px and 320px; the actual built API returns a generic no-store 503 when its real service configuration is absent.');
  assert.deepEqual(external, []); assert.deepEqual(errors, []); assert.deepEqual(f.providerCalls, []);
} catch (error) { failure = String(error.stack ?? error); }
finally {
  if (release) release();
  if (context) await context.close();
  if (browser) await browser.close();
  for (const close of closes) await close();
}
const report = { status: failure ? 'FAIL' : 'PASS', stories, failure, external, errors, api, screenshots,
  sourceHashes: ready.sourceHashes, buildId: ready.buildId, testSha256: hash(readFileSync(new URL(import.meta.url))),
  fixtureSha256: hash(readFileSync(new URL('../tests/support/public-feed-fixture.mjs', import.meta.url))),
  cleanup: { browser: true, database: true }, scope: 'Compiled local Next activity page, actual API/helper over disposable synthetic SQL and the real installed Supabase client with a bounded transport adapter. No hosted database, real member, issued provider credential, paid model call or publication. SDK transport adapter is not hosted PostgREST acceptance.' };
writeFileSync(resolve(output, 'browser.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: report.status, stories: stories.length, failure, output }));
if (failure) process.exitCode = 1;
