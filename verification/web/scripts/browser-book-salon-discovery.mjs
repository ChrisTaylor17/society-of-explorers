import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bookSalonDiscoveryFixture } from '../tests/support/book-salon-discovery-fixture.mjs';

const [prefix, run] = process.argv.slice(2);
assert(/^built-shell-book-salon-discovery-[a-z0-9-]+-$/.test(prefix ?? '') && /^book-salon-discovery-browser-[0-9]+$/.test(run ?? ''));
assert(process.execArgv.some(v => v.endsWith('/deny-build-network.cjs')));
const root = fileURLToPath(new URL('../../../', import.meta.url));
const ready = JSON.parse(readFileSync(resolve(root, 'verification/web/evidence', prefix + 'server-ready.json')));
assert.equal(ready.status, 'READY'); const origin = ready.origin; assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
const out = resolve(root, 'verification/web/evidence', run); mkdirSync(out, { recursive: true });
const require = createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');
const f = await bookSalonDiscoveryFixture();
const stories = [], requests = [], errors = [], external = [], screenshots = [], compiledHttp = [];
let browser, page, failure = null, release = null, releaseAuth = null, holdAuth = true, mode = 'normal', held = false;
const id = n => `88888888-8888-4888-8888-${String(n).padStart(12, '0')}`;
try {
  browser = await require('playwright').chromium.launch({ headless: true,
    executablePath: '/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' } });
  const probeContext = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' });
  await probeContext.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { external.push(url.origin + url.pathname); return route.abort(); }
    return route.continue();
  });
  const probe = await probeContext.newPage();
  // These requests reach the compiled handler without browser interception.
  // The owned server has no issued database credentials: only refusal paths
  // can be accepted here; success is exercised separately against local SQL.
  for (const [path, expected] of [['/api/book-salons', 503], ['/api/book-salons?offset=-1', 400],
    ['/api/book-salons?offset=0&offset=0', 400], ['/api/book-salons?offset=9007199254740991', 400]]) {
    const response = await probe.goto(origin + path, { timeout: 5000 });
    assert.equal(response.status(), expected); assert.equal(response.url(), origin + path);
    assert.match(response.headers()['cache-control'], /private.*no-store/);
    assert.equal(response.headers()['surrogate-control'], 'no-store'); assert.equal(response.headers()['set-cookie'], undefined);
    const value = await response.json(); assert.deepEqual(Object.keys(value), ['error']);
    compiledHttp.push({ path, status: response.status(), privateNoStore: true, noSetCookie: true });
  }
  await probeContext.close();
  await f.db.query("DELETE FROM book_cohorts WHERE book_id <> 'soe-circles-path'"); f.unavailable = true;
  const context = await browser.newContext({ viewport: { width: 390, height: 950 }, timezoneId: 'America/Los_Angeles', serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    try {
      const req = route.request(), url = new URL(req.url());
      if (url.origin !== origin) { external.push(url.origin + url.pathname); return route.abort(); }
      if (!url.pathname.startsWith('/api/')) return route.continue();
      requests.push({ path: url.pathname, query: url.search, method: req.method(), authorization: !!req.headers().authorization });
      assert.equal(req.method(), 'GET');
      if (url.pathname === '/api/auth/member') {
        if (holdAuth) await new Promise(r => { releaseAuth = r; });
        return route.fulfill({ status: 401, contentType: 'application/json', body: '{"session":"signed_out","browserSignedOut":true}' }).catch(() => {});
      }
      assert.equal(url.pathname, '/api/book-salons'); assert(!req.headers().authorization); assert(!req.headers().cookie);
      if (mode === 'bad-json') return route.fulfill({ status: 200, contentType: 'application/json', body: 'not json' });
      if (mode === 'bad-page') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"cohorts":[]}' });
      const response = await f.dispatch(url.pathname + url.search);
      const body = await response.text();
      if (mode === 'hold') { held = true; await new Promise(r => { release = r; }); }
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body }).catch(() => {});
    } catch (error) { errors.push(String(error.stack ?? error)); return route.abort().catch(() => {}); }
  });
  page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(String(error)));
  const list = page.getByRole('region', { name: 'Public book salon listings', exact: true });
  const missing = 'No public book salons are listed right now.';
  const failureText = 'We could not load the book salons. Availability is unconfirmed.';
  const retry = () => list.getByRole('button', { name: 'Retry salon listings', exact: true });
  const links = () => list.locator('a[href^="/book-salons/"]');
  assert.equal((await page.goto(origin + '/book-salons')).status(), 200);
  await list.getByText(failureText, { exact: true }).waitFor(); assert(releaseAuth);
  assert.equal(await list.getByText(missing, { exact: true }).count(), 0);
  assert(requests.some(r => r.path === '/api/book-salons'));
  holdAuth = false; releaseAuth(); releaseAuth = null;
  stories.push('A compiled public listing request completes while account lookup is held; failed data is unavailable, not a false empty community. No cookie or bearer is sent on discovery.');

  f.unavailable = false;
  for (mode of ['bad-json', 'bad-page']) { await retry().click(); await list.getByText(failureText, { exact: true }).waitFor(); assert.equal(await list.getByText(missing).count(), 0); }
  mode = 'normal'; await retry().click(); await list.getByText(missing, { exact: true }).waitFor(); assert.equal(await list.getByRole('alert').count(), 0);
  stories.push('Malformed JSON and an incomplete page envelope are retryable failures. A subsequent actual empty SQL result has a distinct empty state.');

  for (let i = 1; i <= 55; i++) await f.db.query(`INSERT INTO book_cohorts(id,book_id,title,description,max_members,status,start_date,created_at,thinker_id)
    VALUES($1,'apology',$2,'Fictional public group for local verification.',8,'forming','2026-11-09T00:00:00Z','2026-11-08T12:00:00Z',$3)`,
    [id(i), i === 55 ? 'A long fictional title '.repeat(12) : 'Fictional group ' + i, i === 55 ? null : 'plato']);
  await page.reload(); await list.getByText('50 SALONS SHOWN', { exact: true }).waitFor(); assert.equal(await links().count(), 50);
  assert.match(await page.locator('body').innerText(), /Book-salon discussions are public/);
  assert.match(await list.innerText(), /Human host: confirm with the group/);
  assert.match(await list.innerText(), /Optional AI perspective: not specified/);
  assert.match(await list.innerText(), /Optional AI perspective: Plato/);
  assert.doesNotMatch(await list.innerText(), /Led by|Recorded start: Nov 8/);
  assert.match(await list.innerText(), /Recorded start: Nov 9, 2026/);
  stories.push('Actual route/SDK/SQL listings disclose public discussion, distinguish a human host from optional AI, omit an invented default thinker, and preserve the recorded calendar day in a western time zone.');

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 950 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'overflow at ' + width);
    const box = await links().first().boundingBox(); assert(box && box.height >= 44 && box.x >= 0 && box.x + box.width <= width + 1);
  }
  await page.setViewportSize({ width: 390, height: 950 });
  await page.screenshot({ path: resolve(out, 'listing-phone.png'), animations: 'disabled' }); screenshots.push('listing-phone.png');
  stories.push('Populated cards, long titles and their actions fit 320, 390, 768 and 1440 pixels; discussion links have a 44-pixel touch target.');

  f.missingCount = true; await list.getByRole('button', { name: 'Load more salons', exact: true }).click();
  await list.getByText('More salons could not be loaded. The groups already shown are from the earlier lookup.', { exact: true }).waitFor(); assert.equal(await links().count(), 50);
  f.missingCount = false; await retry().click(); await list.getByText('55 SALONS SHOWN', { exact: true }).waitFor();
  const hrefs = await links().evaluateAll(nodes => nodes.map(node => node.getAttribute('href'))); assert.equal(new Set(hrefs).size, 55);
  assert.equal(await list.getByRole('button', { name: 'Load more salons' }).count(), 0);
  assert(requests.filter(r => r.path === '/api/book-salons' && r.query === '?offset=50').length >= 2);
  stories.push('A second-page count failure retains the first page and retries the same offset. The actual subsequent page completes all 55 distinct fixture groups.');

  f.corrupt = rows => rows.map((row, i) => i ? row : { ...row, max_members: null, start_date: '2026-02-30' });
  await list.getByRole('button', { name: 'Refresh salon listings' }).click(); await list.getByText('0 members · capacity unconfirmed', { exact: true }).waitFor();
  assert.match(await list.innerText(), /Start date to confirm/); f.corrupt = null;
  stories.push('Explicit malformed historical-field transport fixtures render unknown capacity/date without fabricating eight seats or a scheduled day.');

  mode = 'hold'; held = false; await list.getByRole('button', { name: 'Refresh salon listings' }).click();
  await list.getByText(failureText, { exact: true }).waitFor({ timeout: 15000 }); assert(held && release); const late = release; release = null;
  mode = 'normal'; await retry().click(); await list.getByText('50 SALONS SHOWN', { exact: true }).waitFor(); late();
  await page.waitForTimeout(50); assert.equal(await list.getByRole('alert').count(), 0); assert.equal(await links().count(), 50);
  stories.push('A held response reaches the ten-second deadline. Its late completion cannot overwrite the successful refreshed page.');

  mode = 'hold'; held = false; await list.getByRole('button', { name: 'Refresh salon listings' }).click();
  for (let i = 0; i < 100 && !held; i++) await page.waitForTimeout(10); assert(held && release);
  await page.getByRole('link', { name: 'Explore the four-week fellowship plan', exact: true }).click(); await page.waitForURL(origin + '/salons/pilot');
  release(); release = null; await page.getByRole('heading', { name: /Four weeks.*one small circle/i }).waitFor();
  assert.equal(await page.getByRole('region', { name: 'Public book salon listings' }).count(), 0);
  stories.push('Navigating to the separate fellowship plan disposes pending discovery without updating an unmounted page.');

  const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 950 } });
  await noJs.route('**/*', route => { const url = new URL(route.request().url()); if (url.origin !== origin) { external.push(url.href); return route.abort(); } return route.continue(); });
  const reader = await noJs.newPage(); await reader.goto(origin + '/book-salons');
  assert(await reader.getByText('Public salon listings require JavaScript. You can still read the fellowship plan and browse the Great Books library.', { exact: true }).isVisible());
  await reader.getByRole('link', { name: 'Explore the four-week fellowship plan' }).click(); await reader.waitForURL(origin + '/salons/pilot'); await noJs.close();
  stories.push('With JavaScript disabled, the invitation explains its listing limit and still reaches the actual public four-week plan.');
  assert.deepEqual(errors, []); assert.deepEqual(external, []); assert(requests.every(r => r.method === 'GET'));
} catch (error) { failure = String(error.stack ?? error); }
finally {
  release?.(); releaseAuth?.();
  if (failure && page) await page.screenshot({ path: resolve(out, 'failure.png') }).catch(() => {});
  if (browser) await browser.close(); await f.close();
  const files = ['app/book-salons/page.tsx', 'app/api/book-salons/route.ts', 'lib/books/salon-discovery.ts', 'lib/books/useBookSalonDiscovery.ts'];
  const result = { status: failure ? 'FAIL' : 'PASS', failure, stories, requests, errors, external, screenshots, compiledHttp,
    sourceHashes: Object.fromEntries(files.map(name => [name, createHash('sha256').update(readFileSync(resolve(root, name))).digest('hex')])),
    buildId: ready.buildId, browserClosed: true, disposableDatabaseClosed: true,
    scope: 'Compiled Next page plus actual GET source and locked SDK against disposable SQL. Account refusals and malformed/held replies are explicit fixtures; no hosted Auth/PostgREST or membership write acceptance.' };
  writeFileSync(resolve(out, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ status: result.status, stories: stories.length, failure, result: resolve(out, 'result.json') }));
}
process.exitCode = failure ? 1 : 0;
