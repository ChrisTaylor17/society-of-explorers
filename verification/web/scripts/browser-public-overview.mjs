import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [prefix, run, ...rest] = process.argv.slice(2);
assert(!rest.length && /^built-shell-public-claims-[a-z0-9-]+-$/.test(prefix ?? '') && /^public-overview-browser-[0-9]+$/.test(run ?? ''));
assert(process.execArgv.some(value => value.endsWith('/deny-build-network.cjs')));
const root = fileURLToPath(new URL('../../../', import.meta.url));
const ready = JSON.parse(readFileSync(resolve(root, 'verification/web/evidence', prefix + 'server-ready.json')));
assert.equal(ready.status, 'READY'); const origin = ready.origin;
assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
assert.equal(readFileSync(resolve(root, '.next/BUILD_ID'), 'utf8').trim(), ready.buildId);
const out = resolve(root, 'verification/web/evidence', run); mkdirSync(out, { recursive: true });
const require = createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');
const api = [], external = [], errors = [], stories = [], screenshots = [];
let browser, failure = null, closed = false, phase = 'overview-only';
try {
  browser = await require('playwright').chromium.launch({ headless: true,
    executablePath: '/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' } });
  const protect = async context => {
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin !== origin) { external.push(url.origin + url.pathname); return route.abort(); }
      if (!url.pathname.startsWith('/api/')) return route.continue();
      api.push({ path: url.pathname, method: req.method(), phase });
      // Existing destination navigation may check for a session. Supply only a
      // signed-out fixture; the new overview's initial no-request check stays strict.
      if (phase === 'existing-destinations' && req.method() === 'GET' && url.pathname === '/api/auth/member') {
        return route.fulfill({ status: 401, contentType: 'application/json', headers: { 'cache-control': 'private, no-store' }, body: '{"error":"Signed-out navigation fixture"}' });
      }
      // Only the older homepage may ask for a published pulse; no event/member row is supplied.
      if (req.method() === 'GET' && url.pathname === '/api/feed/pulse') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{"todayQuestion":null,"responses":[]}' });
      }
      errors.push('Unexpected API on public overview journey: ' + req.method() + ' ' + url.pathname);
      return route.abort();
    });
  };
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, serviceWorkers: 'block' });
  await protect(context);
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(String(error)));
  assert.equal((await page.goto(origin + '/soe')).status(), 200);
  const main = page.getByRole('main');
  await page.getByRole('heading', { name: /Come for a question.*Return for the people/ }).waitFor();
  assert.match(await main.innerText(), /First release in preparation/i);
  assert.match(await main.innerText(), /Host & dates\s+To be confirmed/);
  assert.match(await main.innerText(), /Prayer is optional/);
  assert.match(await main.innerText(), /plans under review/i);
  assert.match(await main.innerText(), /Root Kernel keeps its distinct principles/);
  assert.doesNotMatch(await main.innerText(), /first DAO built|Wednesday 8pm|CREATE YOUR OWN DAO|35 sessions/);
  assert.equal(api.length, 0, 'The overview needs no account, feed, roster or payment request');
  assert.equal(await main.locator('a[href="/92b/fund"], a[href="/billing"], a[href="/create-community"]').count(), 0);
  stories.push('The server-rendered overview separates the proposed pilot from the broader plans without an account, roster, payment or scheduling request.');

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1050 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Overflow at ' + width);
    for (const link of await main.getByRole('link').all()) {
      const box = await link.boundingBox(); assert(box && box.height >= 44);
      assert(box.x >= -1 && box.x + box.width <= width + 1);
    }
    if (width === 390 || width === 1440) {
      const name = width === 390 ? 'overview-phone.png' : 'overview-desktop.png';
      await main.locator('header').screenshot({ path: resolve(out, name) }); screenshots.push(name);
    }
  }
  // A 320px layout is the CSS reflow width of a 1280px desktop zoomed to 400%.
  // It does not certify every browser's native zoom implementation.
  await page.setViewportSize({ width: 320, height: 1050 });
  await page.keyboard.press('Tab');
  await page.getByRole('link', { name: 'Skip to the overview' }).focus();
  await page.keyboard.press('Enter');
  assert.equal(await main.evaluate(node => document.activeElement === node), true);
  await page.getByRole('link', { name: /Explore the society/ }).click();
  await page.waitForURL(origin + '/soe#explore');
  await page.waitForFunction(() => { const top = document.getElementById('explore').getBoundingClientRect().top; return top >= 0 && top < innerHeight - 50; });
  assert.equal(new URL(page.url()).hash, '#explore');
  assert(await page.locator('#explore').evaluate(node => node.getBoundingClientRect().top >= 0));
  stories.push('The overview fits four phone/tablet/desktop widths; main actions are at least 44px, with keyboard skip and section navigation.');

  phase = 'existing-destinations';
  await page.getByRole('link', { name: /Read the first salon plan/ }).click();
  await page.waitForURL(origin + '/salons/pilot');
  await page.getByRole('heading', { name: /Four weeks.*one small circle/i }).waitFor();
  assert.match(await page.getByRole('main').innerText(), /Host and dates to be confirmed/);
  await page.goto(origin + '/soe');
  await main.getByRole('link', { name: /Enter fellowship/ }).click();
  await page.waitForURL(origin + '/fellowship');
  await page.getByRole('heading', { name: 'Faith that makes room for honest questions.', exact: true }).waitFor();
  stories.push('The primary action reaches the actual four-week plan; the fellowship action reaches the existing Christian study section.');

  await page.goto(origin + '/');
  await page.getByRole('heading', { name: 'Read together. Meet online.', exact: true }).waitFor();
  const prototype = page.locator('#network-handshake');
  assert.match(await prototype.innerText(), /COLLABORATION PROTOTYPE/);
  assert.match(await prototype.innerText(), /not validated compatibility scores/);
  await prototype.getByRole('button', { name: 'Project workspace', exact: true }).click();
  assert.match(await prototype.innerText(), /Local change queue:/);
  assert.doesNotMatch(await prototype.innerText(), /Encrypted pod queue:/);
  assert.equal(api.filter(x => x.method !== 'GET').length, 0);
  const footer = page.getByRole('contentinfo');
  assert.doesNotMatch(await footer.innerText(), /92B SOUTH ST|CONSILIENCE SYSTEMS/);
  await footer.getByRole('link', { name: 'ABOUT', exact: true }).click();
  await page.waitForURL(origin + '/soe');
  stories.push('The older homepage labels its collaboration experiment and local queue honestly, and the shared footer reaches the overview without a venue/operator claim.');

  const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await protect(noJs); const plain = await noJs.newPage();
  await plain.goto(origin + '/soe');
  await plain.getByRole('heading', { name: /Come for a question.*Return for the people/ }).waitFor();
  await plain.getByRole('link', { name: /Read the first salon plan/ }).click();
  await plain.waitForURL(origin + '/salons/pilot');
  stories.push('The overview and its primary action also work without JavaScript; no form or invitation is submitted.');
  await noJs.close(); await context.close();
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
} catch (error) { failure = error.stack || String(error); }
finally {
  if (browser) { try { await browser.close(); closed = true; } catch (error) { failure ??= String(error); } }
  const files = ['app/soe/page.tsx', 'app/soe/soe-overview.module.css', 'app/HomePageClient.tsx', 'components/PublicFooter.tsx', 'verification/web/scripts/browser-public-overview.mjs'];
  writeFileSync(resolve(out, 'result.json'), JSON.stringify({ status: failure ? 'FAIL' : 'PASS', buildId: ready.buildId,
    stories, api, external, errors, screenshots, closed, failure,
    sourceHashes: Object.fromEntries(files.map(name => [name, createHash('sha256').update(readFileSync(resolve(root, name))).digest('hex')])),
    limits: 'Actual local compiled pages. The published pulse is an empty fixture and existing destination navigation receives a signed-out auth fixture. No provider identity, real event, member content, legal status, deployed state or device acceptance is verified.' }, null, 2) + '\n', { flag: 'wx' });
}
if (failure) throw Error(failure);
console.log(JSON.stringify({ status: 'PASS', stories: stories.length, apiRequests: api.length, closed, external: external.length, errors: errors.length }));
