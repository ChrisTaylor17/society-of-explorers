import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { memberFinderApp, IDS } from '../tests/support/member-finder-app.mjs';

const [prefix, run, ...rest] = process.argv.slice(2);
assert(!rest.length && /^built-shell-(?:matching-boundary|public-claims)-[a-z0-9-]+-$/.test(prefix ?? '') && /^matching-boundary-browser-[0-9]+$/.test(run ?? ''));
assert(process.execArgv.some(value => value.endsWith('/deny-build-network.cjs')));
const root = fileURLToPath(new URL('../../../', import.meta.url));
const ready = JSON.parse(readFileSync(resolve(root, 'verification/web/evidence', prefix + 'server-ready.json')));
assert.equal(ready.status, 'READY'); const origin = ready.origin;
assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
assert.equal(readFileSync(resolve(root, '.next/BUILD_ID'), 'utf8').trim(), ready.buildId);
const out = resolve(root, 'verification/web/evidence', run); mkdirSync(out, { recursive: true });
const require = createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');
const f = await memberFinderApp();
const requests = [], actualHttp = [], errors = [], external = [], stories = [], screenshots = [];
let browser, failure = null, closed = false;
const legacy = /^\/api\/(?:match(?:\/|$)|world\/match$|communities\/[^/]+\/(?:questionnaire|matches)$)/;
try {
  browser = await require('playwright').chromium.launch({ headless: true,
    executablePath: '/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' } });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await context.addCookies(Object.entries(f.browserCookies(IDS.owner)).map(([name, value]) => ({ name, value, url: origin, sameSite: 'Lax', httpOnly: name !== 'soe_auth_intent' })));
  await context.route('**/*', async route => {
    try {
      const req = route.request(), url = new URL(req.url());
      if (url.origin !== origin) { external.push(url.origin + url.pathname); return route.abort(); }
      if (!url.pathname.startsWith('/api/')) return route.continue();
      requests.push({ path: url.pathname, method: req.method(), body: req.postData() });
      // These requests exercise the actual built HTTP server, without an adapter.
      if (legacy.test(url.pathname)) return route.continue();
      assert.equal(req.method(), 'GET', 'Unrelated writes are outside this browser check');
      if (url.pathname === '/api/auth/member' || url.pathname === '/api/members/discover') {
        const response = await f.dispatch(url.pathname, req.headers());
        return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
      }
      const adapters = {
        '/api/message': { unreadCount: 0 }, '/api/feed': { events: [] },
        '/api/dashboard/briefing': { profile: null, triggers: [], sessionCount: 0, lastSessionAt: null, latestVerdict: null,
          memberName: 'Fictional Owner', events: [], scans: [], stampSpaces: [], showWelcome: false },
        '/api/book-salons': { cohorts: [], page: { offset: 0, limit: 50, total: 0, nextOffset: null } },
      };
      assert(Object.hasOwn(adapters, url.pathname), 'Unreviewed browser API: ' + url.pathname);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(adapters[url.pathname]) });
    } catch (error) { errors.push(String(error)); await route.abort().catch(() => {}); }
  });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(String(error)));
  const nav = page.getByRole('navigation', { name: 'Ways to meet explorers' });
  for (const path of ['/match', '/world/match']) {
    assert.equal((await page.goto(origin + path + '?enabled=true')).status(), 200);
    await page.getByRole('heading', { name: 'Start with a shared interest.', exact: true }).waitFor();
    const people = nav.getByRole('link', { name: 'Find people', exact: true });
    await people.focus(); assert.equal(await people.evaluate(node => node === document.activeElement), true);
    assert.equal(await people.getAttribute('href'), '/members');
    assert.equal(await nav.getByRole('link', { name: 'Explore salons', exact: true }).getAttribute('href'), '/book-salons');
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      for (const link of await nav.getByRole('link').all()) assert((await link.boundingBox()).height >= 44);
    }
  }
  assert.equal(requests.filter(x => legacy.test(x.path)).length, 0, 'A saved page must not call the old feature');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(out, 'saved-matching-link-phone.png'), fullPage: true }); screenshots.push('saved-matching-link-phone.png');
  stories.push('Both saved matching URLs show the boundary without legacy requests; layout, keyboard focus and action sizes pass.');

  await nav.getByRole('link', { name: 'Find people', exact: true }).click();
  await page.waitForURL(origin + '/members');
  await page.getByText('Fictional Ada', { exact: true }).first().waitFor();
  await page.getByRole('button', { name: 'FIND PEOPLE', exact: true }).click();
  const finder = page.getByRole('region', { name: 'Find people to explore with' });
  await finder.getByLabel('Skills, topics or projects').fill('history');
  await finder.getByRole('button', { name: 'Find people', exact: true }).click();
  await finder.getByRole('article', { name: 'Fictional Ada' }).waitFor();
  assert.doesNotMatch(await finder.innerText(), /PRIVATE_PERSON_CANARY|CANDIDATE_PRIVATE_/);
  stories.push('The replacement action reaches the compiled published-profile finder; the fictional published history profile is found.');

  await page.goto(origin + '/match'); await nav.getByRole('link', { name: 'Explore salons', exact: true }).click();
  await page.waitForURL(origin + '/book-salons');
  await page.getByRole('heading', { name: 'BOOK SALONS', exact: true }).waitFor();
  stories.push('The salon action reaches the existing book-salon page; its list is an explicit empty fixture, not a real meeting.');

  await page.goto(origin + '/dashboard');
  const people = page.getByRole('link', { name: /Find People Explore published interests/ });
  await people.waitFor(); assert.equal(await people.getAttribute('href'), '/members');
  assert.equal(await page.locator('a[href="/world/match"], a[href="/match"]').count(), 0);
  await page.goto(origin + '/soe');
  assert.equal(await page.getByRole('link', { name: 'Find people', exact: true }).getAttribute('href'), '/members');
  assert.doesNotMatch(await page.locator('body').innerText(), /After 7 responses, paired/);
  stories.push('Dashboard and public SoE entry actions lead to published people finding and no longer promise automatic pairing.');

  for (const [path, method] of [
    ['/api/world/match', 'GET'], ['/api/match', 'POST'], ['/api/match/generate', 'POST'],
    ['/api/match/history', 'GET'], ['/api/match/respond', 'POST'],
    ['/api/communities/unknown/questionnaire', 'GET'], ['/api/communities/unknown/questionnaire', 'POST'],
    ['/api/communities/unknown/matches', 'GET'], ['/api/communities/unknown/matches', 'POST'],
  ]) {
    const result = await page.evaluate(async ({ path, method }) => {
      const r = await fetch(path + '?enabled=true', { method, headers: { 'x-matching-enabled': 'true' },
        ...(method === 'POST' ? { body: '{malformed' } : {}) });
      return { status: r.status, body: await r.json(), cache: r.headers.get('cache-control'), type: r.headers.get('content-type') };
    }, { path, method });
    assert.equal(result.status, 503); assert.equal(result.body.code, 'MATCHING_NOT_AVAILABLE');
    assert.deepEqual(result.body.alternatives, { people: '/members', salons: '/book-salons' });
    assert.match(result.cache, /private.*no-store/); assert.match(result.type, /application\/json/);
    actualHttp.push({ path, method, ...result });
  }
  stories.push('All nine operations refuse through the actual compiled HTTP server, including malformed bodies and override attempts.');
  assert.deepEqual(external, []); assert.deepEqual(errors, []);
  assert(requests.filter(x => x.method !== 'GET').every(x => legacy.test(x.path)));
  await context.close();
} catch (error) { failure = error.stack || String(error); }
finally {
  if (browser) { try { await browser.close(); closed = true; } catch (error) { failure ??= String(error); } }
  const sources = ['lib/matching/releaseAvailability.ts', 'lib/matching/releaseBlock.ts', 'components/matching/MatchingUnavailable.tsx',
    'app/match/page.tsx', 'app/world/match/page.tsx', 'app/dashboard/page.tsx', 'app/soe/page.tsx', 'verification/web/scripts/browser-matching-boundary.mjs'];
  writeFileSync(resolve(out, 'result.json'), JSON.stringify({ status: failure ? 'FAIL' : 'PASS', buildId: ready.buildId,
    stories, actualHttp, requests, external, errors, screenshots, closed, failure,
    sourceHashes: Object.fromEntries(sources.map(name => [name, createHash('sha256').update(readFileSync(resolve(root, name))).digest('hex')])),
    limits: 'Actual compiled pages and deferred HTTP routes. Auth/directory transport uses fictional identities; dashboard/feed/salon lists use named synthetic adapters. No hosted access repair, issued identity, real meeting, member data or physical-device acceptance.' }, null, 2) + '\n', { flag: 'wx' });
}
if (failure) throw Error(failure);
console.log(JSON.stringify({ status: 'PASS', stories: stories.length, actualHttp: actualHttp.length, closed, external: external.length, errors: errors.length }));
