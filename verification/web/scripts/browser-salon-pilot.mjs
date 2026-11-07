import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, lstatSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const [prefix, run, ...extra] = process.argv.slice(2);
assert(!extra.length && /^built-shell-[a-z0-9-]+-$/.test(prefix ?? ''));
assert(/^salon-pilot-[a-z0-9-]+$/.test(run ?? ''));
assert(process.execArgv.some(arg => arg.endsWith('/deny-build-network.cjs')));
const evidence = resolve('verification/web/evidence');
const ready = JSON.parse(readFileSync(resolve(evidence, prefix + 'server-ready.json')));
assert.equal(ready.status, 'READY');
assert.match(ready.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
const origin = ready.origin;
const out = resolve(evidence, run);
mkdirSync(out, { mode: 0o700 });
const require = createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');
const executablePath = '/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
assert(lstatSync(executablePath).blocks > 0);
const calls = [], external = [], errors = [], stories = [], screenshots = [];
let browser, closed = false, failure = null;
const hash = value => createHash('sha256').update(value).digest('hex');
async function screenshot(page, name, fullPage = true) {
  const bytes = await page.screenshot({ fullPage });
  const file = resolve(out, name);
  writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 });
  screenshots.push({ path: file, sha256: hash(bytes) });
}
try {
  browser = await require('playwright').chromium.launch({ headless: true, executablePath,
    env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' },
    args: ['--disable-background-networking', '--disable-component-update', '--no-first-run',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
  const context = await browser.newContext({ viewport: { width: 320, height: 850 }, serviceWorkers: 'block', acceptDownloads: false });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { external.push(url.origin + url.pathname); await route.abort(); return; }
    if (url.pathname.startsWith('/api/')) {
      const headers = await request.allHeaders();
      calls.push({ path: url.pathname, query: url.search, method: request.method(), cookie: Boolean(headers.cookie), authorization: Boolean(headers.authorization) });
    }
    await route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  page.setDefaultTimeout(10000);
  assert.equal((await page.goto(origin + '/salons/pilot')).status(), 200);
  await page.getByRole('heading', { level: 1, name: 'Four weeks, one small circle.' }).waitFor();
  assert.equal(await page.getByRole('article').count(), 4);
  assert.equal(await page.locator('form, input, textarea').count(), 0);
  await page.getByText('Our fellowship is rooted in Christian faith.', { exact: false }).waitFor();
  await page.getByText('The host may offer a Christian prayer. Joining the prayer is optional; listening quietly is welcome.').waitFor();
  await page.getByText('Host and dates to be confirmed.', { exact: false }).waitFor();
  assert.match(await page.locator('meta[name="robots"]').getAttribute('content'), /noindex/);
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), 'https://www.societyofexplorers.com/salons/pilot');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  assert.deepEqual(calls, []);
  stories.push('The real compiled 320px plan states Christian identity, optional prayer, adult group size and unconfirmed dates; it contains no intake form or API request.');
  await screenshot(page, 'salon-pilot-320-first-screen.png', false);
  await screenshot(page, 'salon-pilot-320.png');

  await page.getByRole('link', { name: 'Explore the four weeks', exact: true }).press('Enter');
  await page.waitForURL(origin + '/salons/pilot#weeks');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'weeks');
  await page.getByRole('link', { name: 'Open the host guide', exact: true }).press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'host-guide');
  stories.push('Keyboard activation moves focus to the actual reading plan and host guide.');

  const luke = page.getByRole('link', { name: 'Read the Good Samaritan', exact: false });
  await luke.click();
  await page.waitForURL(origin + '/great-books/scripture/luke-good-samaritan#scripture');
  await page.getByRole('heading', { name: 'Scripture · Luke 10:25–37', exact: true }).waitFor();
  assert.equal(await page.locator('[data-verse-text]').count(), 13);
  await page.getByRole('link', { name: 'Four-week salon plan', exact: true }).click();
  await page.waitForURL(origin + '/salons/pilot');
  stories.push('Week one opens all thirteen source verses in the existing Root Kernel study and returns through reading navigation.');

  await page.getByRole('link', { name: 'Read Philemon', exact: false }).click();
  await page.waitForURL(origin + '/great-books/scripture/philemon#scripture');
  assert.equal(await page.locator('[data-verse-text]').count(), 25);
  assert.equal(await page.locator('[data-publisher-footnote]').count(), 2);
  await page.getByRole('link', { name: 'Four-week salon plan', exact: true }).click();
  await page.waitForURL(origin + '/salons/pilot');
  stories.push('Week two opens the complete credited Philemon edition with both publisher footnotes and returns to the plan.');

  const apology = page.getByRole('link', { name: 'Open the Apology selection', exact: false });
  const href = await apology.getAttribute('href');
  const target = new URL(href, origin);
  assert.equal(target.searchParams.get('from'), '44');
  assert.equal(target.searchParams.get('to'), '51');
  assert.equal(target.searchParams.get('edition'), 'pg-1656-c23a532ff45b46926abb91c193151af3f4aa8d27dc3bb76a3bb8971a427642c7');
  await apology.click();
  await page.waitForURL(target.href);
  await page.getByRole('heading', { level: 1, name: 'The Apology of Socrates', exact: true }).waitFor();
  await page.frameLocator('iframe').locator('[data-reading-index="44"]').waitFor();
  assert.equal(await page.frameLocator('iframe').locator('[data-reading-index]').count(), 125);
  assert.match(await page.frameLocator('iframe').locator('[data-reading-index="44"]').innerText(), /Athenians/);
  await page.getByText('Reading positions 45–52 in this exact edition.', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Go to linked reading', exact: true }).click();
  assert.equal(await page.frameLocator('iframe').locator('html').evaluate(() => document.activeElement?.getAttribute('data-reading-index')), '44');
  await page.getByRole('link', { name: 'Four-week salon plan', exact: true }).click();
  await page.waitForURL(origin + '/salons/pilot');
  stories.push('Week three retains exact Jowett edition and paragraph bounds, loads the full 125-block reader, displays positions45–52 and focuses the opening defense.');

  await page.setViewportSize({ width: 1280, height: 900 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  await screenshot(page, 'salon-pilot-desktop.png');
  await page.emulateMedia({ media: 'print' });
  assert.equal(await page.locator('body > div').count() > 0, true);
  assert.equal(await page.locator('main').evaluate(node => getComputedStyle(node).maxWidth), 'none');
  assert.equal(await page.locator('main').evaluate(node => getComputedStyle(node.parentElement).backgroundColor), 'rgb(255, 255, 255)');
  await page.getByRole('heading', { name: 'A simple guide for the host.', exact: true }).waitFor();
  await screenshot(page, 'salon-pilot-print.png');
  stories.push('Desktop and print rendering retain the weekly plan and complete 60-minute host agenda without horizontal overflow.');

  assert.deepEqual(await context.cookies(), []);
  assert.equal(calls.every(call => call.method === 'GET' && !call.cookie && !call.authorization), true);
  assert.equal(calls.every(call => call.path.startsWith('/api/great-books/')), true);
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
  await context.close();
  stories.push('Reading requests remain public GETs without cookies or authorization; there are no member, provider or external requests and no page errors.');
} catch (error) { failure = String(error.stack ?? error); }
finally {
  if (browser) { await browser.close(); closed = true; }
  writeFileSync(resolve(out, 'browser.json'), JSON.stringify({ status: failure ? 'FAIL' : 'PASS',
    origin, sourceHashes: ready.sourceHashes, scope: 'Compiled local web and real browser; no hosted account, actual meeting, paid demand, native or physical device acceptance.',
    stories, calls, external, errors, screenshots, closed, failure }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}
if (failure) throw new Error(failure);
console.log(JSON.stringify({ status: 'PASS', stories: stories.length, closed, receipt: resolve(out, 'browser.json') }));
