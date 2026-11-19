import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [prefix, run, ...rest] = process.argv.slice(2);
assert(!rest.length && /^built-shell-physical-space-[a-z0-9-]+-$/.test(prefix ?? '') && /^physical-space-browser-[0-9]+$/.test(run ?? ''));
assert(process.execArgv.some(value => value.endsWith('/deny-build-network.cjs')));
const root = fileURLToPath(new URL('../../../', import.meta.url));
const ready = JSON.parse(readFileSync(resolve(root, 'verification/web/evidence', prefix + 'server-ready.json')));
assert.equal(ready.status, 'READY'); const origin = ready.origin;
assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
assert.equal(readFileSync(resolve(root, '.next/BUILD_ID'), 'utf8').trim(), ready.buildId);
const out = resolve(root, 'verification/web/evidence', run); mkdirSync(out, { recursive: true });
const require = createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');
const api = [], external = [], errors = [], stories = [], screenshots = [], actualHttp = [];
const routeMethods = [['92b/checkout', 'POST'], ['92b/pledge', 'POST'], ['92b/propose', 'POST'], ['92b/progress', 'GET'], ['salons/cities', 'GET'], ['salons/propose', 'POST'], ['salons/support', 'POST']];
let browser, failure = null, closed = false, httpPhase = false;
try {
  browser = await require('playwright').chromium.launch({ headless: true,
    executablePath: '/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' } });
  const protect = async context => {
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin !== origin) { external.push(url.origin + url.pathname); return route.abort(); }
      if (url.pathname.startsWith('/api/')) {
        if (httpPhase && routeMethods.some(([path, method]) => url.pathname === '/api/' + path && req.method() === method)) return route.continue();
        api.push({ method: req.method(), path: url.pathname }); return route.abort();
      }
      return route.continue();
    });
  };
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, serviceWorkers: 'block' });
  await protect(context); const page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(String(error)));
  const main = page.getByRole('main');
  for (const [path, heading] of [['/92b', /A room for inquiry.*A place for each other/], ['/92b/fund', /A plan to examine.*Pledges are not open/], ['/salons', /The same people.*A conversation that continues/]]) {
    assert.equal((await page.goto(origin + path)).status(), 200);
    await page.getByRole('heading', { name: heading }).waitFor();
    const body = await main.innerText();
    assert.doesNotMatch(body, /LEASE: SIGNED|CONSTRUCTION: IN PROGRESS|SUPPORT RECORDED|PROPOSAL RECORDED|PAY WITH CARD|\$0 raised|50 supporters to trigger/);
    assert.equal(await main.locator('form, input, textarea, a[href^="https://checkout.stripe.com"]').count(), 0);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1050 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), path + ' overflow at ' + width);
      for (const link of await main.getByRole('link').all()) {
        const box = await link.boundingBox(); assert(box && box.height >= 44);
        assert(box.x >= -1 && box.x + box.width <= width + 1);
      }
      if (width === 390 || width === 1440) {
        const name = path.replaceAll('/', '-').slice(1) + (width === 390 ? '-phone.png' : '-desktop.png');
        await main.locator('header').screenshot({ path: resolve(out, name) }); screenshots.push(name);
      }
    }
    stories.push(path + ': actual compiled proposal fits four widths, has no collection form or false live/receipt/zero-total claim, and offers usable navigation.');
  }
  await page.goto(origin + '/92b/fund?success=true&session_id=NONISSUED_RETURN_FIXTURE');
  assert.match(await main.innerText(), /Verified campaign totals are not available here/);
  assert.match(await main.innerText(), /earlier proposed budget, not money raised/);
  assert.doesNotMatch(await main.innerText(), /Payment confirmed|Pledge received|Thank you for your pledge/i);
  assert.match(await page.locator('meta[name="description"]').getAttribute('content'), /campaign is on hold/);
  assert.match(await page.locator('meta[property="og:description"]').getAttribute('content'), /Pledges are not open/);
  await page.goto(origin + '/salons?support=Boston');
  await page.getByRole('heading', { name: 'City-interest registration is on hold.', exact: true }).waitFor();
  assert.equal(await main.locator('form').count(), 0);
  assert.equal(await main.getByRole('link', { name: 'Browse online circles' }).getAttribute('href'), '/circles?format=online');
  stories.push('Old payment-return and city-support links cannot imply a receipt or reopen forms; campaign metadata and the online-circle destination match the current state.');

  // Browser fetches pass through to the real loopback server only for these exact seven operations.
  httpPhase = true;
  for (const [path, method] of routeMethods) {
    const response = await page.evaluate(async ({ path, method }) => {
      const res = await fetch('/api/' + path + '?approved=true&enabled=true', {
        method, credentials: 'omit', cache: 'no-store',
        headers: { 'x-campaign-approved': 'true', ...(method === 'POST' ? { 'content-type': 'application/json' } : {}) },
        ...(method === 'POST' ? { body: '{private-invalid-fixture' } : {}),
      });
      return { status: res.status, headers: Object.fromEntries(res.headers.entries()), body: await res.json() };
    }, { path, method });
    const body = response.body; assert.equal(response.status, 503);
    assert.equal(body.code, 'PHYSICAL_SPACE_ON_HOLD');
    assert.equal(body.alternatives.onlineCircles, '/circles?format=online');
    for (const name of ['success', 'totalRaised', 'backerCount', 'cities', 'url']) assert.equal(name in body, false);
    assert.match(response.headers['cache-control'], /private.*no-store/);
    assert.equal(response.headers['surrogate-control'], 'no-store');
    assert.equal(response.headers['x-robots-tag'], 'noindex, nofollow, noarchive');
    actualHttp.push({ path, method, status: response.status, code: body.code });
  }
  httpPhase = false;
  assert.equal((await context.cookies()).length, 0, 'No identity cookie was introduced');
  stories.push('Seven real compiled HTTP operations refuse campaign/intake/progress work with private no-store503 responses and no false receipt, total or checkout URL.');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: 'Skip to ways to gather' }).focus(); await page.keyboard.press('Enter');
  assert(await main.evaluate(node => document.activeElement === node));
  await main.getByRole('link', { name: 'Explore the Boston proposal' }).click(); await page.waitForURL(origin + '/92b');
  await main.getByRole('link', { name: 'Review the funding proposal' }).click(); await page.waitForURL(origin + '/92b/fund');
  await main.getByRole('link', { name: 'Read the first salon plan' }).click(); await page.waitForURL(origin + '/salons/pilot');
  await page.getByRole('heading', { name: /Four weeks.*one small circle/i }).waitFor();
  stories.push('Keyboard skip and actual page navigation connect the physical proposal to the existing online pilot.');

  const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await protect(noJs); const plain = await noJs.newPage();
  for (const path of ['/92b', '/92b/fund', '/salons']) {
    await plain.goto(origin + path);
    for (const heading of await plain.getByRole('main').getByRole('heading').all()) {
      assert(await heading.evaluate(node => { for (let el = node; el; el = el.parentElement) { if (getComputedStyle(el).opacity === '0' || getComputedStyle(el).visibility === 'hidden') return false; } return node.getBoundingClientRect().height > 0; }));
    }
  }
  await plain.getByRole('link', { name: 'Read the four-week plan' }).click(); await plain.waitForURL(origin + '/salons/pilot');
  stories.push('All three proposal pages and their pilot action remain readable and usable with JavaScript disabled.');
  await noJs.close(); await context.close();
  assert.deepEqual(api, []); assert.deepEqual(errors, []); assert.deepEqual(external, []);
} catch (error) { failure = error.stack || String(error); }
finally {
  if (browser) { try { await browser.close(); closed = true; } catch (error) { failure ??= String(error); } }
  const files = ['app/92b/page.tsx', 'app/92b/fund/page.tsx', 'app/92b/fund/layout.tsx', 'app/salons/page.tsx', 'lib/capital/physicalSpaceReleaseBlock.ts', ...routeMethods.map(([path]) => 'app/api/' + path + '/route.ts'), 'verification/web/scripts/browser-physical-space-hold.mjs'];
  writeFileSync(resolve(out, 'result.json'), JSON.stringify({ status: failure ? 'FAIL' : 'PASS', buildId: ready.buildId,
    stories, api, actualHttp, external, errors, screenshots, closed, failure,
    sourceHashes: Object.fromEntries(files.map(name => [name, createHash('sha256').update(readFileSync(resolve(root, name))).digest('hex')])),
    limits: 'Actual local compiled pages and seven actual loopback HTTP refusals, without credentials, hosted/customer data or mocked API responses. This is not deployed gating, payment reconciliation, a venue/legal determination or a physical-device test.' }, null, 2) + '\n', { flag: 'wx' });
}
if (failure) throw Error(failure);
console.log(JSON.stringify({ status: 'PASS', stories: stories.length, actualHttp: actualHttp.length, browserApiRequests: api.length, closed, external: external.length, errors: errors.length }));
