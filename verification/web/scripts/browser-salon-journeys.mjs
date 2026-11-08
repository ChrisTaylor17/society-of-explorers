import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [prefix, run, ...rest] = process.argv.slice(2);
assert(!rest.length && /^built-shell-salon-journey-[a-z0-9-]+-$/.test(prefix ?? '') && /^salon-journey-browser-[0-9]+$/.test(run ?? ''));
assert(process.execArgv.some(value => value.endsWith('/deny-build-network.cjs')));
const root = fileURLToPath(new URL('../../../', import.meta.url));
const ready = JSON.parse(readFileSync(resolve(root, 'verification/web/evidence', prefix + 'server-ready.json')));
assert.equal(ready.status, 'READY'); const origin = ready.origin;
assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
assert.equal(readFileSync(resolve(root, '.next/BUILD_ID'), 'utf8').trim(), ready.buildId);
const out = resolve(root, 'verification/web/evidence', run); mkdirSync(out, { recursive: true });
const require = createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');
const listing = { id: '22222222-2222-4222-8222-222222222222', title: 'Fictional guide program', description: 'Synthetic browser fixture only.', status: 'recruiting', max_members: 7, member_count: 7, topic_rotation: ['blockchain'], guide_name: 'Fictional guide' };
const requests = [], external = [], errors = [], stories = [], screenshots = [], analyticsIntercepted = [];
let browser, failure = null, closed = false, mode = 'error', release = null, probePage = null;
try {
  browser = await require('playwright').chromium.launch({ headless: true,
    executablePath: '/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' } });
  const protect = async context => context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== origin) { external.push(url.origin + url.pathname); return route.abort(); }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    requests.push({ method: req.method(), path: url.pathname, mode });
    if (url.pathname === '/api/events' && req.method() === 'POST') {
      const payload = req.postDataJSON();
      if (JSON.stringify(payload) !== JSON.stringify({ event: 'checkout_welcome_view', props: { path: '/salon' } })) {
        errors.push('Unexpected analytics payload'); return route.abort();
      }
      analyticsIntercepted.push(payload);
      return route.fulfill({ status: 204 }); // Preserve the notice; never forward its event to a server.
    }
    if (req.method() !== 'GET') { errors.push('Unexpected write ' + url.pathname); return route.abort(); }
    if (url.pathname === '/api/auth/member') return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ session: 'signed_out', browserSignedOut: true }) });
    if (url.pathname === '/api/book-salons') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"cohorts":[],"page":{"offset":0,"limit":50,"total":0,"nextOffset":null}}' });
    if (url.pathname !== '/api/salons' || url.searchParams.get('status') !== 'recruiting,active') {
      errors.push('Unexpected API ' + url.pathname); return route.abort();
    }
    const currentMode = mode;
    if (currentMode === 'stall') {
      await new Promise(resolve => { release = resolve; });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ salons: [listing] }) }).catch(() => {});
      return;
    }
    if (currentMode === 'error') return route.fulfill({ status: 503, contentType: 'application/json', body: '{"salons":[],"error":"Synthetic lookup failure"}' });
    if (currentMode === 'bad-json') return route.fulfill({ status: 200, contentType: 'application/json', body: '{broken' });
    if (currentMode === 'bad-envelope') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"salons":{}}' });
    const rows = currentMode === 'success' ? [listing] : currentMode === 'bad-row' ? [{ ...listing, member_count: 'unknown' }] : [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ salons: rows }) });
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, serviceWorkers: 'block' });
  // The unchanged proxy uses cookie presence to admit the document. This
  // nonissued local hint grants no API identity; all identity replies stay signed out.
  const documentHint = { name: 'sb-synthetic-auth-token', value: 'NONISSUED_DOCUMENT_PRESENCE_FIXTURE', url: origin, httpOnly: true, sameSite: 'Lax' };
  await context.addCookies([documentHint]);
  await protect(context); const page = await context.newPage(); page.setDefaultTimeout(15000);
  probePage = page;
  page.on('pageerror', error => errors.push(String(error)));
  const listings = page.getByRole('region', { name: 'Guide program listings' });
  const errorText = 'We could not load the program listings. Availability is unconfirmed.';
  const emptyText = 'No groups are listed for this program right now.';

  for (mode of ['error', 'bad-json', 'bad-envelope', 'bad-row']) {
    assert.equal((await page.goto(origin + '/salon')).status(), 200);
    await listings.getByText(errorText, { exact: true }).waitFor();
    assert.equal(await listings.getByText(emptyText, { exact: true }).count(), 0);
    assert.equal(await listings.getByRole('button', { name: 'JOIN', exact: true }).count(), 0);
    assert.equal(await page.getByRole('heading', { name: 'Learn to lead a conversation.', exact: true }).isVisible(), true);
  }
  stories.push('HTTP failure, invalid JSON, malformed envelope and invalid rows show a retryable failure, never a false empty list or available group.');

  mode = 'empty';
  await listings.getByRole('button', { name: 'Retry program listings', exact: true }).click();
  await listings.getByText(emptyText, { exact: true }).waitFor();
  assert.equal(await listings.getByRole('alert').count(), 0);
  assert.doesNotMatch(await page.locator('body').innerText(), /first salon launches when we reach 8 members|Max 7 per cohort|Complete 7 weeks\. Become a Guide/);
  assert.match(await page.locator('body').innerText(), /host and dates still to be confirmed/);
  stories.push('Retry makes a fresh lookup; a verified empty fixture is distinct from failure and does not invent a membership threshold or a launch date.');

  mode = 'success'; await page.goto(origin + '/salon');
  await listings.getByText(listing.title, { exact: true }).waitFor();
  assert.equal(await listings.getByRole('button', { name: 'FULL', exact: true }).isDisabled(), true);
  const choices = page.getByRole('navigation', { name: 'Other ways to gather', exact: true });
  assert.equal(await choices.getByRole('link', { name: 'Find an online reading Circle', exact: true }).getAttribute('href'), '/circles?format=online');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1050 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'salon overflow at ' + width);
    for (const link of await choices.getByRole('link').all()) {
      const box = await link.boundingBox(); assert(box && box.height >= 44);
      assert(box.x >= -1 && box.x + box.width <= width + 1);
    }
    if (width === 390 || width === 1440) {
      const name = 'salon-' + width + '.png';
      await page.screenshot({ path: resolve(out, name), fullPage: true, animations: 'disabled' }); screenshots.push(name);
    }
  }
  await choices.getByRole('link', { name: 'Read the four-week fellowship plan', exact: true }).click();
  await page.waitForURL(origin + '/salons/pilot');
  await page.getByRole('heading', { name: /Four weeks.*one small circle/i }).waitFor();
  stories.push('The older program remains visible with its recorded full-capacity fixture; usable actions fit four widths and reach the actual separate four-week pilot.');

  mode = 'stall'; await page.goto(origin + '/salon');
  await listings.getByText('Checking program listings…', { exact: true }).waitFor();
  assert(await choices.getByRole('link', { name: 'Read the four-week fellowship plan', exact: true }).isVisible());
  await listings.getByText(errorText, { exact: true }).waitFor();
  mode = 'empty'; await listings.getByRole('button', { name: 'Retry program listings', exact: true }).click();
  await listings.getByText(emptyText, { exact: true }).waitFor();
  release?.(); release = null;
  await page.waitForTimeout(150);
  assert.equal(await listings.getByText(listing.title, { exact: true }).count(), 0);
  stories.push('A stalled request times out after ten seconds while navigation stays usable; a late retired reply does not replace a successful retry.');

  mode = 'empty'; await page.goto(origin + '/salon?welcome=1');
  await page.getByText('RETURNED FROM CHECKOUT', { exact: true }).waitFor();
  assert.match(await page.locator('body').innerText(), /does not confirm a payment or membership change/);
  assert.equal(await page.getByRole('link', { name: 'Check your billing status', exact: true }).getAttribute('href'), '/billing');
  await page.waitForFunction(() => !new URL(location.href).searchParams.has('welcome'));
  stories.push('The existing checkout-return notice still points to verified billing and never turns a return URL into payment evidence.');

  await page.goto(origin + '/book-salons');
  const bookNav = page.getByRole('navigation', { name: 'Book salon navigation', exact: true });
  assert.equal(await bookNav.getByRole('link', { name: 'SIGN IN FOR THE GUIDE PROGRAM', exact: true }).getAttribute('href'), '/login?next=%2Fsalon');
  assert.match(await page.locator('body').innerText(), /any optional AI perspective before joining/);
  assert.doesNotMatch(await page.locator('body').innerText(), /Meet weekly with a thinker who guides the conversation/);
  assert.doesNotMatch(await page.locator('body').innerText(), /Each week, a thinker leads the discussion|3-8 members/);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1050 });
    const heading = await page.getByRole('heading', { name: 'BOOK SALONS', exact: true }).boundingBox();
    const nav = await bookNav.boundingBox(); assert(heading && nav && heading.y >= nav.y + nav.height);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'book salon overflow at ' + width);
    if (width === 390) {
      const name = 'book-salons-390.png';
      await page.screenshot({ path: resolve(out, name), fullPage: true, animations: 'disabled' }); screenshots.push(name);
    }
  }
  await page.getByRole('link', { name: 'Explore the four-week fellowship plan', exact: true }).click();
  await page.waitForURL(origin + '/salons/pilot');
  stories.push('Book salons route signed-out readers through explicit sign-in for the separate guide program, clarify optional AI and link to the actual pilot; navigation does not cover the heading at four widths.');

  const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await protect(noJs); const plain = await noJs.newPage();
  await plain.goto(origin + '/salon');
  assert.equal(new URL(plain.url()).pathname, '/');
  stories.push('Without a document presence hint the unchanged proxy returns the visitor to the home page; this verification does not weaken route access.');
  await noJs.addCookies([documentHint]);
  await plain.goto(origin + '/salon');
  await plain.getByRole('heading', { name: 'Learn to lead a conversation.', exact: true }).waitFor();
  assert(await plain.getByText(/Enable JavaScript to check program listings/).isVisible());
  await plain.getByRole('link', { name: 'Read the four-week fellowship plan', exact: true }).click();
  await plain.waitForURL(origin + '/salons/pilot');
  await plain.getByRole('heading', { name: /Four weeks.*one small circle/i }).waitFor();
  stories.push('Once the document gate is passed, the program explanation and pilot navigation are available before data loads and with JavaScript disabled.');
  await noJs.close(); await context.close();
  assert.equal(analyticsIntercepted.length, 1);
  assert.deepEqual(external, []); assert.deepEqual(errors, []);
} catch (error) {
  failure = error.stack || String(error);
  if (probePage && !probePage.isClosed()) {
    writeFileSync(resolve(out, 'failure-page.txt'), probePage.url() + '\n' + (await probePage.locator('body').innerText()).slice(0,10000));
    await probePage.screenshot({ path: resolve(out, 'failure-page.png'), fullPage: true }).catch(() => {});
  }
}
finally {
  release?.();
  if (browser) { try { await browser.close(); closed = true; } catch (error) { failure ??= String(error); } }
  const files = ['app/salon/page.tsx', 'app/book-salons/page.tsx', 'verification/web/scripts/browser-salon-journeys.mjs'];
  writeFileSync(resolve(out, 'result.json'), JSON.stringify({ status: failure ? 'FAIL' : 'PASS', buildId: ready.buildId,
    stories, requests, analyticsIntercepted, external, errors, screenshots, closed, failure,
    sourceHashes: Object.fromEntries(files.map(name => [name, createHash('sha256').update(readFileSync(resolve(root, name))).digest('hex')])),
    limits: 'Actual compiled local pages and navigation, with a nonissued document-presence cookie plus synthetic signed-out API identity and listing responses. This cookie is not identity or authorization evidence. No hosted API, membership join, private account lifecycle, provider sign-in, payment, live meeting or device acceptance.' }, null, 2) + '\n', { flag: 'wx' });
}
if (failure) throw Error(failure);
console.log(JSON.stringify({ status: 'PASS', stories: stories.length, closed, external: external.length, errors: errors.length }));
