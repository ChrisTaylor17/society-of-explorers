import assert from 'node:assert/strict';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const [prefix, name, ...extra] = process.argv.slice(2);
assert(/^built-shell-[a-z0-9-]+-$/u.test(prefix ?? ''));
assert(/^(?:salon-origin-browser|edge-account-browser)-[0-9]+$/u.test(name ?? '') && extra.length === 0);
const edgeAccount = name.startsWith('edge-account-browser-');
assert(process.execArgv.some(arg => arg.endsWith('/deny-build-network.cjs')));
function resident(path) {
  const info = lstatSync(path);
  assert(info.isFile() && info.blocks && info.size, path);
  return path;
}
const evidence = resolve('verification/web/evidence');
const ready = JSON.parse(readFileSync(resident(resolve(evidence, prefix + 'server-ready.json')), 'utf8'));
assert.equal(ready.status, 'READY');
assert.equal(readFileSync(resident(resolve('.next/BUILD_ID')), 'utf8').trim(), ready.buildId);
assert.match(ready.origin, /^http:\/\/127\.0\.0\.1:\d+$/u);
const origin = ready.origin;
const sibling = 'http://127.0.0.1:48993';
assert.notEqual(origin, sibling);
const require = createRequire(resident('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json'));
const executablePath = resident('/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const cohort = '33333333-3333-4333-8333-333333333333';
const forms = new Map(edgeAccount
  ? ['/api/match', '/api/projects/create', '/api/projects/invite', '/api/movement/pod/sync'].map(path => [path, {}])
  : [
  ['/api/book-salons', { bookId: 'apology', title: 'Synthetic sibling form' }],
  ['/api/book-salons/join', { cohortId: cohort }],
  ['/api/book-salons/' + cohort, { content: 'Synthetic sibling form' }],
  ]);
const cookieName = edgeAccount ? 'soe_wallet_id' : 'soe_synthetic_salon_test';
const probe = '/edge-account-fixture';
const attribute = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
const requests = [], sameOrigin = [], unexpected = [], errors = [];
let browser, closed = false, failure = null;
try {
  browser = await require('playwright').chromium.launch({ headless: true, executablePath, timeout: 12000,
    args: ['--disable-background-networking', '--disable-component-update', '--no-first-run',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.addCookies([{ name: cookieName, value: 'SYNTHETIC_TEST_ONLY', url: origin,
    sameSite: 'Lax', httpOnly: true }]);
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    const fields = forms.get(url.pathname);
    if (url.pathname === '/favicon.ico' && [origin, sibling].includes(url.origin)) return route.fulfill({ status: 204 });
    if (url.origin === origin && request.method() === 'POST' && fields) return route.continue();
    if (edgeAccount && url.origin === origin && request.method() === 'GET' && url.pathname === probe) {
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Local account fixture</title>' });
    }
    if (url.origin === sibling && request.method() === 'GET' && fields) {
      const text = JSON.stringify({ ...fields, padding: '=' }), index = text.lastIndexOf('=');
      const html = '<!doctype html><title>Synthetic sibling page</title>' +
        '<form method="post" enctype="text/plain" action="' + attribute(origin + url.pathname) + '">' +
        '<input type="hidden" name="' + attribute(text.slice(0, index)) + '" value="' + attribute(text.slice(index + 1)) + '">' +
        '<button>Submit test form</button></form>';
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
    }
    unexpected.push(url.origin + url.pathname);
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', error => errors.push(String(error)));
  // Playwright routing can see the request before Chromium attaches its
  // Fetch Metadata and cookie headers. Record only the wire evidence we need.
  const cdp = await context.newCDPSession(page);
  const postIds = new Map(), wire = new Map();
  await cdp.send('Network.enable');
  cdp.on('Network.requestWillBeSent', ({ requestId, request }) => {
    if (request.method === 'POST') postIds.set(request.url, requestId);
  });
  cdp.on('Network.requestWillBeSentExtraInfo', ({ requestId, headers }) => {
    const sent = new Headers(headers);
    wire.set(requestId, { origin: sent.get('origin'), site: sent.get('sec-fetch-site'),
      cookiePresent: (sent.get('cookie') ?? '').includes(cookieName + '=') });
  });
  for (const [path, fields] of forms) {
    await page.goto(sibling + path);
    const [response] = await Promise.all([
      page.waitForResponse(reply => reply.url() === origin + path && reply.request().method() === 'POST'),
      page.getByRole('button', { name: 'Submit test form', exact: true }).click(),
    ]);
    const request = response.request(), headers = await request.allHeaders();
    assert.match(headers['content-type'], /^text\/plain/u);
    assert.deepEqual(JSON.parse(request.postData()), { ...fields, padding: '=' });
    assert.equal(response.status(), 403);
    assert.match(response.headers()['cache-control'], /private.*no-store/u);
    assert.equal((await response.json()).error, edgeAccount ? 'Request refused.' : 'Use this site to submit the request.');
    const sent = wire.get(postIds.get(origin + path));
    assert.deepEqual(sent, { origin: sibling, site: 'same-site', cookiePresent: true });
    requests.push({ path, status: response.status(), site: sent.site, cookiePresent: sent.cookiePresent });
  }
  if (edgeAccount) {
    await page.goto(origin + probe);
    for (const signedOut of [false, true]) {
      if (signedOut) await context.addCookies([{ name: 'soe_auth_provider', value: 'signed_out', url: origin, httpOnly: true }]);
      for (const path of forms.keys()) {
        const reply = await page.evaluate(async ({ path, signedOut }) => {
          const headers = { 'content-type': 'application/json' };
          if (signedOut) headers.authorization = 'Bearer SYNTHETIC_TEST_ONLY';
          const result = await fetch(path, { method: 'POST', headers, body: '{}' });
          return { status: result.status, cache: result.headers.get('cache-control'), error: (await result.json()).error };
        }, { path, signedOut });
        assert.equal(reply.status, 401);
        assert.match(reply.cache, /private.*no-store/u);
        assert.equal(reply.error, 'Unauthorized');
        sameOrigin.push({ path, signedOut, status: reply.status });
      }
    }
  }
  await context.close();
  assert.deepEqual(unexpected, []);
  assert.deepEqual(errors, []);
} catch (error) { failure = error.stack || String(error); }
finally {
  if (browser) {
    try { await browser.close(); closed = true; }
    catch (error) { failure ??= String(error); }
  }
  writeFileSync(resolve(evidence, name + '.json'), JSON.stringify({
    status: failure ? 'FAIL' : 'PASS', buildId: ready.buildId, requests, sameOrigin, closed, unexpected, errors, failure,
  }, null, 2) + '\n', { flag: 'wx' });
}
if (failure) throw Error(failure);
console.log(JSON.stringify({ status: 'PASS', blockedBrowserRequests: requests.length, sameOriginRefusals: sameOrigin.length, closed }));
