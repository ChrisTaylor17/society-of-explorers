import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [prefix, run, ...rest] = process.argv.slice(2);
assert(!rest.length && /^built-shell-direction-[a-z0-9-]+-$/.test(prefix ?? '') && /^project-direction-browser-[0-9]+$/.test(run ?? ''));
assert(process.execArgv.some(value => value.endsWith('/deny-build-network.cjs')));
const root = fileURLToPath(new URL('../../../', import.meta.url));
const ready = JSON.parse(readFileSync(resolve(root, 'verification/web/evidence', prefix + 'server-ready.json')));
assert.equal(ready.status, 'READY'); const origin = ready.origin;
assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
assert.equal(readFileSync(resolve(root, '.next/BUILD_ID'), 'utf8').trim(), ready.buildId);
const out = resolve(root, 'verification/web/evidence', run); mkdirSync(out, { recursive: true });
const require = createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');
const api = [], external = [], errors = [], stories = [], screenshots = [];
let browser, failure = null, closed = false, phase = 'direction-only';
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
      if (phase === 'existing-destinations' && req.method() === 'GET' && url.pathname === '/api/auth/member') {
        return route.fulfill({ status: 401, contentType: 'application/json', headers: { 'cache-control': 'private, no-store' }, body: '{"error":"Signed-out destination fixture"}' });
      }
      errors.push('Unexpected API: ' + req.method() + ' ' + url.pathname); return route.abort();
    });
  };
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, serviceWorkers: 'block' });
  await protect(context); const page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(String(error)));
  assert.equal((await page.goto(origin + '/roadmap')).status(), 200);
  const main = page.getByRole('main');
  await page.getByRole('heading', { name: /One circle first.*A wider world ahead/ }).waitFor();
  const roadmap = await main.innerText();
  assert.match(roadmap, /Host & dates\s+To be confirmed/);
  assert.match(roadmap, /prayer is optional/);
  assert.match(roadmap, /An Android test build and a Quest browser preview exist/);
  assert.match(roadmap, /paid second cycle would be a separate/);
  assert.doesNotMatch(roadmap, /LIVE TODAY|two pieces fully live|Honest pricing|\$49|\$499|seven-week|Wednesday 8pm/);
  assert.equal(await main.locator('a[href="/join"],a[href="/92b/fund"],a[href="/billing"]').count(), 0);
  assert.equal(api.length, 0);
  stories.push('The compiled roadmap identifies a proposed four-week pilot and distinct test/prototype stages, without pricing, checkout, account or member-data requests.');

  for (const route of ['roadmap', 'structure']) {
    await page.goto(origin + '/' + route);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1050 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), route + ' overflow at ' + width);
      for (const link of await main.locator('a:not([class*="inlineLink"])').all()) {
        const box = await link.boundingBox(); assert(box && box.height >= 44, route + ' action height');
        assert(box.x >= -1 && box.x + box.width <= width + 1, route + ' clipped action');
      }
      if (width === 390 || width === 1440) {
        const name = route + (width === 390 ? '-phone.png' : '-desktop.png');
        await main.locator('header').screenshot({ path: resolve(out, name) }); screenshots.push(name);
      }
    }
    stories.push(route + ' reflows at four phone/tablet/desktop widths with visible, unclipped primary actions of at least 44px.');
  }
  const structure = await main.innerText();
  assert.match(structure, /Root Kernel/); assert.match(structure, /retaining its own established principles/);
  assert.match(structure, /possible holding company/); assert.match(structure, /Model under review/);
  assert.match(structure, /not yet verified as device-only/);
  assert.doesNotMatch(structure, /92B South|88.7%|all visions failed|your name on-chain|first TribeKeys/);
  assert.equal(await main.getByRole('link', { name: 'Read the local-first research' }).getAttribute('href'), 'https://www.inkandswitch.com/essay/local-first/');
  assert.equal(await main.getByRole('link', { name: /IRS guidance/ }).getAttribute('href'), 'https://www.irs.gov/charities-non-profits/frequently-asked-questions-about-applying-for-tax-exemption');
  assert.equal(api.length, 0);
  stories.push('The principles page preserves fellowship, Root Kernel, Consilience and shared spaces while distinguishing aspirations from legal, privacy and hardware claims; research links are present but unopened.');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: 'Skip to the principles' }).focus(); await page.keyboard.press('Enter');
  assert(await main.evaluate(node => document.activeElement === node));
  await main.getByRole('link', { name: /Explore the principles/ }).click();
  await page.waitForURL(origin + '/structure#principles');
  await page.waitForFunction(() => { const top = document.getElementById('principles').getBoundingClientRect().top; return top >= 0 && top < innerHeight - 50; });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('dialog', { name: 'Site navigation' }).waitFor(); await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog', { name: 'Site navigation' }).isVisible(), false);
  stories.push('Phone keyboard skip, in-page navigation and the existing navigation dialog remain usable.');

  await main.getByRole('link', { name: 'See the roadmap' }).click(); await page.waitForURL(origin + '/roadmap');
  await main.getByRole('link', { name: /Read the principles & structure/ }).click(); await page.waitForURL(origin + '/structure');
  await main.getByRole('link', { name: /Return to the society overview/ }).click(); await page.waitForURL(origin + '/soe');
  await page.getByRole('heading', { name: /Come for a question.*Return for the people/ }).waitFor();
  stories.push('Actual compiled navigation connects roadmap, structure and the existing society overview.');

  phase = 'existing-destinations';
  await page.goto(origin + '/roadmap'); await main.getByRole('link', { name: /Read the four-week salon plan/ }).click();
  await page.waitForURL(origin + '/salons/pilot'); await page.getByRole('heading', { name: /Four weeks.*one small circle/i }).waitFor();
  await page.goto(origin + '/structure'); await main.getByRole('link', { name: 'Enter Christian fellowship' }).click();
  await page.waitForURL(origin + '/fellowship'); await page.getByRole('heading', { name: 'Faith that makes room for honest questions.', exact: true }).waitFor();
  stories.push('The main calls to action reach the actual existing pilot and fellowship pages; only signed-out identity fixtures are allowed on those destinations.');

  phase = 'direction-only';
  const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await protect(noJs); const plain = await noJs.newPage();
  await plain.goto(origin + '/structure');
  await plain.getByRole('heading', { name: 'One vision, distinct responsibilities.' }).waitFor();
  for (const heading of await plain.getByRole('main').getByRole('heading').all()) {
    assert(await heading.evaluate(node => { for (let el = node; el; el = el.parentElement) { if (getComputedStyle(el).opacity === '0' || getComputedStyle(el).visibility === 'hidden') return false; } return node.getBoundingClientRect().height > 0; }));
  }
  await plain.getByRole('link', { name: 'See the roadmap' }).click(); await plain.waitForURL(origin + '/roadmap');
  await plain.getByRole('heading', { name: 'Each stage earns the next.' }).waitFor();
  stories.push('Both pages and their connecting action remain readable and usable with JavaScript disabled, including all structure-page sections.');
  await noJs.close(); await context.close();
  assert.equal(api.filter(x => x.phase === 'direction-only').length, 0); assert.equal(api.filter(x => x.method !== 'GET').length, 0);
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
} catch (error) { failure = error.stack || String(error); }
finally {
  if (browser) { try { await browser.close(); closed = true; } catch (error) { failure ??= String(error); } }
  const files = ['app/roadmap/page.tsx', 'app/structure/page.tsx', 'components/ProjectDirection.module.css', 'verification/web/scripts/browser-project-direction.mjs'];
  writeFileSync(resolve(out, 'result.json'), JSON.stringify({ status: failure ? 'FAIL' : 'PASS', buildId: ready.buildId,
    stories, api, external, errors, screenshots, closed, failure,
    sourceHashes: Object.fromEntries(files.map(name => [name, createHash('sha256').update(readFileSync(resolve(root, name))).digest('hex')])),
    limits: 'Actual local compiled pages, no member or checkout data. Existing pilot/fellowship navigation may receive signed-out identity fixtures. No hosted state, legal authority, provider identity, native device or payment acceptance established.' }, null, 2) + '\n', { flag: 'wx' });
}
if (failure) throw Error(failure);
console.log(JSON.stringify({ status: 'PASS', stories: stories.length, apiRequests: api.length, closed, external: external.length, errors: errors.length }));
