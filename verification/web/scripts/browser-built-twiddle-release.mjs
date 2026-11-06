import assert from 'node:assert/strict';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const [prefix, ...extra] = process.argv.slice(2);
assert(!extra.length && /^built-shell-[a-z0-9-]+-$/.test(prefix ?? ''));
assert(process.execArgv.some(arg => arg.endsWith('/deny-build-network.cjs')));
const evidence = resolve('verification/web/evidence', prefix);
const ready = JSON.parse(readFileSync(evidence + 'server-ready.json', 'utf8'));
assert.equal(ready.status, 'READY');
assert.equal(readFileSync('.next/BUILD_ID', 'utf8').trim(), ready.buildId);
assert.match(ready.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
const { origin } = ready;
const require = createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');
const executablePath = '/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
assert(lstatSync(executablePath).blocks, 'Chromium must be resident');
const id = '2b16ec64-5d9d-4029-96d5-9efdb2adaaba';
const heading = 'Twiddle is paused';
const noticeLink = 'Find an online salon';
const routes = [
  ['GET', '/api/twiddle?filter=recent'],
  ['GET', '/api/twiddle?filter=my'],
  ['POST', '/api/twiddle', { content: 'Retired tab fixture', thread_type: 'open' }],
  ['GET', '/api/twiddle/' + id],
  ['PATCH', '/api/twiddle/' + id, { content: 'Retired edit fixture' }],
  ['GET', '/api/twiddle/' + id + '/react'],
  ['POST', '/api/twiddle/' + id + '/react', { reaction_type: 'illuminate' }],
  ['POST', '/api/twiddle/' + id + '/respond', { thinker_key: 'socrates' }],
  ['GET', '/api/twiddle/cron'],
  ['HEAD', '/api/twiddle/' + id],
];
const browser = await require('playwright').chromium.launch({
  executablePath,
  headless: true,
  timeout: 15_000,
  env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' },
  args: ['--disable-background-networking', '--disable-component-update', '--no-first-run',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'],
});
const report = { status: 'FAIL', buildId: ready.buildId, notices: [], api: [], externalBrowserRequests: [],
  pageErrors: [], legacyPageApiCalls: [], discovery: null, browserClosed: false };
try {
  const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false,
    viewport: { width: 320, height: 730 } });
  let verifyingNotices = true;
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      report.externalBrowserRequests.push(url.origin);
      return route.abort();
    }
    if (verifyingNotices && url.pathname.startsWith('/api/twiddle')) report.legacyPageApiCalls.push(url.pathname);
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.on('pageerror', error => report.pageErrors.push(error.message));
  for (const path of ['/twiddle', '/twiddle/' + id, '/twiddle/constellation']) {
    assert.equal((await page.goto(origin + path)).status(), 200);
    await page.getByRole('heading', { name: heading, exact: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: noticeLink }).getAttribute('href'), '/circles?format=online');
    assert.equal(await page.locator('main input, main textarea').count(), 0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    report.notices.push(path);
  }
  assert.deepEqual(report.legacyPageApiCalls, []);
  await page.screenshot({ path: evidence + 'notice-320.png' });
  verifyingNotices = false;

  for (const session of ['guest', 'stale-tab']) {
    if (session === 'stale-tab') {
      await context.addCookies([{ name: 'soe_auth_provider', value: 'password', url: origin },
        { name: 'sb-fixture-auth-token', value: 'synthetic-stale-token', url: origin }]);
    }
    for (const [method, path, data] of routes) {
      const response = await page.evaluate(async ({ method, path, data, session }) => {
        const headers = {};
        if (session === 'stale-tab') headers.authorization = 'Bearer synthetic-stale-token';
        if (data) headers['content-type'] = 'application/json';
        const result = await fetch(path, { method, headers, body: data && JSON.stringify(data) });
        return { status: result.status, body: await result.text(), headers: Object.fromEntries(result.headers) };
      }, { method, path, data, session });
      assert.equal(response.status, 410, method + ' ' + path);
      assert.deepEqual(method === 'HEAD' ? response.body : JSON.parse(response.body),
        method === 'HEAD' ? '' : { error: 'Twiddle is paused. Find conversations in Circles.' });
      assert.match(response.headers['cache-control'], /private.*no-store/);
      assert.match(response.headers['x-robots-tag'], /noindex/);
      assert.match(response.headers.vary, /Authorization/i);
      assert.equal(response.headers['set-cookie'], undefined);
      report.api.push({ method, path, session, status: response.status });
    }
  }

  // Exercise the actual page and routing. Circle listing contents are covered
  // by the separate discovery rehearsal, so keep that request local and empty.
  await context.route(url => url.origin === origin && url.pathname === '/api/circles', route =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Fixture listing unavailable"}' }));
  const link = page.getByRole('link', { name: noticeLink, exact: true });
  await link.focus();
  await page.keyboard.press('Enter');
  await page.waitForURL(origin + '/circles?format=online');
  await page.getByRole('heading', { name: 'Read together in a weekly salon' }).waitFor();
  assert.equal(await page.getByLabel('Format', { exact: true }).inputValue(), 'online');
  report.discovery = { url: '/circles?format=online', format: 'online', listing: 'synthetic unavailable' };
  assert.deepEqual(report.externalBrowserRequests, []);
  assert.deepEqual(report.pageErrors, []);
  report.status = 'PASS';
} finally {
  await browser.close();
  report.browserClosed = true;
  writeFileSync(evidence + 'browser.json', JSON.stringify(report, null, 2) + '\n');
}
