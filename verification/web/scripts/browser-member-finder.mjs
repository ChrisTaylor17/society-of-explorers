import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { memberFinderApp, IDS } from '../tests/support/member-finder-app.mjs';

const [prefix, run, ...rest] = process.argv.slice(2);
assert(!rest.length && /^built-shell-member-finder-[a-z0-9-]+-$/.test(prefix ?? '') && /^member-finder-browser-[0-9]+$/.test(run ?? ''));
assert(process.execArgv.some(value => value.endsWith('/deny-build-network.cjs')));
const hash = value => createHash('sha256').update(value).digest('hex');
const root = fileURLToPath(new URL('../../../', import.meta.url));
const ready = JSON.parse(readFileSync(resolve(root, 'verification/web/evidence', prefix + 'server-ready.json')));
assert.equal(ready.status, 'READY'); const origin = ready.origin; assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
assert.equal(readFileSync(resolve(root, '.next/BUILD_ID'), 'utf8').trim(), ready.buildId);
const output = resolve(root, 'verification/web/evidence', run); mkdirSync(output, { recursive: true });
const require = createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');
const f = await memberFinderApp();
const stories = [], external = [], errors = [], requests = [], screenshots = [];
let browser, failure = null, closed = false, mode = 'normal', actor = IDS.owner;
let heldResolve = null, release = null;
const hold = async () => { await new Promise(resolve => { release = resolve; heldResolve?.(); }); };
const publish = value => { f.db.rows('members').find(row => row.id === IDS.published).profile_visibility = value; };
try {
  browser = await require('playwright').chromium.launch({ headless: true,
    executablePath: '/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' } });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  // The real HTML proxy requires a cookie hint before rendering /members.
  // API authority below is independently checked against fixture-signed sessions.
  await context.addCookies(Object.entries(f.browserCookies(IDS.owner)).map(([name, value]) => ({ name, value, url: origin, sameSite: 'Lax', httpOnly: name !== 'soe_auth_intent' })));
  await context.route('**/*', async route => {
    try {
      const req = route.request(), url = new URL(req.url()), headers = req.headers();
      if (url.origin !== origin) { external.push(url.origin + url.pathname); return route.abort(); }
      if (!url.pathname.startsWith('/api/')) return route.continue();
      requests.push({ path: url.pathname, query: url.search, method: req.method(), body: req.postData(), owner: headers['x-soe-expected-member'] ?? null });
      assert.equal(req.method(), 'GET', 'No message, profile or model write belongs in this finder test');
      if (url.pathname === '/api/message') {
        // Explicit unread/thread adapter, not evidence of real DM delivery.
        return route.fulfill({ status: url.search ? 403 : 200, contentType: 'application/json',
          body: JSON.stringify(url.search ? { error: 'Synthetic unavailable conversation' } : { unreadCount: 0 }) });
      }
      const isSearch = url.pathname === '/api/members/discover' && headers['x-soe-expected-member'];
      assert.equal(url.search, '', 'Search words must not leave the page');
      if (mode === 'auth-hold' && url.pathname === '/api/auth/member') await hold();
      const response = await f.dispatch(url.pathname, headers, actor);
      let status = response.status, body = await response.text(), replyHeaders = Object.fromEntries(response.headers);
      if (isSearch) {
        assert.equal(headers['x-soe-expected-member'], IDS.owner);
        assert.doesNotMatch(body, /OWNER_PRIVATE_CANARY|CANDIDATE_PRIVATE_|PRIVATE_PERSON_CANARY/);
        if (mode === 'hold') await hold();
        if (mode === 'unavailable') { status = 503; body = '{"error":"Synthetic unavailable"}'; }
        if (mode === 'malformed') body = '{"members":[{"id":"not-confirmed"}]}';
        if (mode === 'wrong-owner') replyHeaders['x-soe-directory-owner'] = IDS.published;
      }
      return route.fulfill({ status, headers: replyHeaders, body }).catch(() => {});
    } catch (error) { errors.push(String(error)); await route.abort().catch(() => {}); }
  });
  const page = await context.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(String(error)));
  const finder = page.getByRole('region', { name: 'Find people to explore with' });
  const input = finder.getByLabel('Skills, topics or projects');
  const submit = () => finder.getByRole('button', { name: 'Find people', exact: true }).click();
  const fresh = async () => {
    mode = 'normal'; actor = IDS.owner; publish('public');
    assert.equal((await page.goto(origin + '/members')).status(), 200);
    assert.equal(new URL(page.url()).pathname, '/members');
    await page.getByText('Fictional Ada', { exact: true }).first().waitFor();
    await page.getByRole('button', { name: 'FIND PEOPLE', exact: true }).click();
    await input.waitFor();
  };
  const search = async query => { await input.fill(query); await submit(); };
  const status = () => finder.getByRole('status');
  const alert = () => finder.getByRole('alert');
  const card = () => finder.getByRole('article', { name: 'Fictional Ada' });
  const fit = async () => {
    assert(await finder.evaluate(element => element.scrollWidth <= element.clientWidth + 1));
    for (const node of [input, finder.getByRole('button', { name: 'Find people', exact: true })]) {
      const rect = await node.boundingBox(); assert(rect.x >= 0 && rect.x + rect.width <= page.viewportSize().width + 1);
      assert(rect.height >= 40);
    }
  };

  await fresh(); await input.fill('history design'); await input.press('Enter'); await card().waitFor();
  assert.match(await status().innerText(), /1 person matches/);
  assert.match(await card().getByRole('list').innerText(), /Skills: design/);
  assert.equal(await card().getByRole('link', { name: 'View published profile' }).getAttribute('href'), '/explorer/' + IDS.published);
  await fit(); await page.setViewportSize({ width: 320, height: 760 }); await fit();
  const screenshot = resolve(output, 'published-profile-search-phone.png'); await page.screenshot({ path: screenshot });
  screenshots.push({ path: screenshot, sha256: hash(readFileSync(screenshot)) });
  await card().scrollIntoViewIfNeeded();
  const resultScreenshot = resolve(output, 'published-profile-result-phone.png'); await page.screenshot({ path: resultScreenshot });
  screenshots.push({ path: resultScreenshot, sha256: hash(readFileSync(resultScreenshot)) });
  await finder.locator('summary').click();
  await finder.getByText('No AI service receives your search words.', { exact: false }).waitFor();
  await finder.locator('summary').click();
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; }); await fit();
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  stories.push('The compiled member page searches actual filtered route output, explains published word matches, supports keyboard submission and fits 390/320 pixels with enlarged text.');

  await search('no-such-topic'); await status().filter({ hasText: 'None of the checked profiles' }).waitFor();
  assert.equal(await alert().count(), 0); publish('private');
  await search('history'); await status().filter({ hasText: 'No other published profiles' }).waitFor(); assert.equal(await card().count(), 0);
  publish('public'); await submit(); await card().waitFor();
  stories.push('No matching words and no other published people have distinct valid empty states; a withdrawn publication disappears on the next fresh search.');

  for (const next of ['unavailable', 'malformed', 'wrong-owner']) {
    mode = next; await submit(); await alert().waitFor(); assert.equal(await card().count(), 0);
    assert.equal(await status().count(), 0);
  }
  mode = 'normal'; actor = IDS.published; await submit(); await alert().filter({ hasText: 'sign-in changed' }).waitFor();
  actor = IDS.owner; await submit(); await card().waitFor();
  stories.push('Server failure, malformed success and mismatched response ownership show errors; a changed account is refused by the actual handler and cannot become an empty or successful match.');

  mode = 'hold'; let held = new Promise(resolve => { heldResolve = resolve; }); await search('history'); await held;
  await input.fill('design'); mode = 'normal'; await submit(); await card().waitFor();
  release(); release = null; await page.waitForTimeout(100);
  assert.match(await status().innerText(), /design/); assert.doesNotMatch(await status().innerText(), /history/);
  stories.push('Changing the query retires an older held response; releasing it cannot overwrite the newer search.');

  mode = 'hold'; held = new Promise(resolve => { heldResolve = resolve; }); await submit(); await held;
  await alert().waitFor({ timeout: 15000 }); assert.equal(await finder.getByRole('button', { name: 'Find people', exact: true }).isEnabled(), true);
  mode = 'normal'; await submit(); await card().waitFor(); release(); release = null;
  stories.push('A stalled directory response times out, restores controls and allows a fresh successful retry.');

  mode = 'auth-hold'; held = new Promise(resolve => { heldResolve = resolve; }); const beforeAuth = requests.filter(request => request.owner).length;
  await submit(); await held; await alert().waitFor({ timeout: 15000 });
  mode = 'normal'; release(); release = null; await page.waitForTimeout(100);
  assert.equal(requests.filter(request => request.owner).length, beforeAuth);
  await submit(); await card().waitFor();
  stories.push('A stalled sign-in lookup also restores controls, and its late completion cannot launch a directory request after retirement.');

  mode = 'hold'; held = new Promise(resolve => { heldResolve = resolve; }); await submit(); await held;
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  assert.equal(await status().count(), 0); assert.equal(await card().count(), 0);
  mode = 'normal'; release(); release = null;
  await page.evaluate(() => { delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); });
  await submit(); await card().waitFor();
  await card().getByRole('button', { name: 'Open conversation' }).click();
  await page.getByRole('button', { name: 'CHAT', exact: true }).waitFor();
  await page.waitForFunction(id => performance.getEntriesByType('resource').some(entry => entry.name.includes('/api/message?peerId=' + id)), IDS.published);
  assert.equal(requests.filter(request => request.method !== 'GET').length, 0);
  stories.push('Backgrounding clears held results. Opening a published result selects the existing conversation screen and reads its thread; it sends no message.');

  await page.getByRole('button', { name: 'FIND PEOPLE', exact: true }).click(); await search('history'); await card().waitFor();
  await page.evaluate(() => window.dispatchEvent(new Event('soe:auth-provider-changed')));
  await page.getByText('Sign-in changed', { exact: true }).waitFor(); assert.equal(await finder.count(), 0);
  assert(!requests.some(request => request.path === '/api/match' || request.body || request.query.includes('history')));
  assert.deepEqual(external, []); assert.deepEqual(errors, []);
  stories.push('An account-change notification retires the whole member view and its search results. No query text, private candidate field, model request or write leaves the finder.');
  await context.close();
} catch (error) { failure = error.stack || String(error); }
finally {
  release?.();
  if (browser) { try { await browser.close(); closed = true; } catch (error) { failure ??= String(error); } }
  writeFileSync(resolve(output, 'result.json'), JSON.stringify({ status: failure ? 'FAIL' : 'PASS', buildId: ready.buildId,
    stories, external, errors, requests, screenshots, closed, failure,
    sourceSha256: Object.fromEntries(['app/members/page.tsx', 'app/members/MemberFinder.tsx', 'app/members/member-finder.module.css', 'lib/members/finder.ts', 'app/api/members/discover/route.ts', 'verification/web/tests/support/member-finder-app.mjs', 'verification/web/scripts/browser-member-finder.mjs']
      .map(path => [path, hash(readFileSync(resolve(root, path)))])),
    limits: 'Compiled Next page and real auth/directory handlers with synthetic signed wallet identities and explicit FakeDb relation transport. No hosted database, real member, provider login, DM delivery or device acceptance. No publication or spending.' }, null, 2) + '\n', { flag: 'wx' });
}
if (failure) throw Error(failure);
console.log(JSON.stringify({ status: 'PASS', stories: stories.length, closed, external: external.length, errors: errors.length }));
