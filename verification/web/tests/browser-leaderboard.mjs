// Actual canonical page + actual closed API handler. No hosted transport or data.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
function readMaterialized(name) {
  const stat = fs.statSync(name);
  if (!stat.blocks || (stat.flags ?? 0) & 1073741824) throw Error('Refusing nonmaterialized file: ' + name);
  return fs.readFileSync(name);
}
const hash = value => createHash('sha256').update(value).digest('hex');
const require = createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');
const executablePath = '/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const origin = 'https://leaderboard-fixture.test';
const dir = path.join(root, 'verification/web/evidence/leaderboard-fixture');
const reportPath = path.join(root, 'verification/web/evidence/leaderboard-browser.json');
const stories = [], requests = [], unexpected = [], pageErrors = [], consoleErrors = [], routeErrors = [];
let failure = null, browser = null, bundle = null, manifest = null, sourceHashes = {}, handler = null;
let forbiddenImports = 0, actualHandlerCalls = 0;
const cleanup = { status: 'pending', error: null };
async function bounded(work, milliseconds) {
  let timer;
  try { return await Promise.race([work(), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Owned browser cleanup timed out')), milliseconds); })]); }
  finally { clearTimeout(timer); }
}
function report(status) { return { status, cleanup, stories, requests, unexpected, pageErrors, consoleErrors, routeErrors, forbiddenImports, actualHandlerCalls,
  sourceHashes, bundleSHA256: bundle ? hash(bundle) : null, scope: (manifest?.scope ?? 'Setup incomplete.') + ' Page-only bundle has no UI/auth/Next adapters. The composed actual API route/privateJson uses the existing offline-app NextResponse JSON/header transport shim. HTTP error/legacy DTO and nonabortable transport doubles are explicit. No SDK, database, hosted provider or production acceptance.' }; }
const checkpoint = story => { stories.push(story); fs.writeFileSync(reportPath, JSON.stringify(report('RUNNING'), null, 2) + '\n'); console.log('PASS ' + stories.length + ': ' + story); };
// Replace a previous receipt before any bundle, module or browser setup can fail.
fs.writeFileSync(reportPath, JSON.stringify(report('RUNNING'), null, 2) + '\n');
try {
  bundle = readMaterialized(path.join(dir, 'page.js'));
  manifest = JSON.parse(readMaterialized(path.join(dir, 'source-manifest.json')));
  sourceHashes = { ...manifest.sourceHashes, 'app/api/leaderboard/route.ts': hash(readMaterialized(path.join(root, 'app/api/leaderboard/route.ts'))),
    'lib/http/routeError.ts': hash(readMaterialized(path.join(root, 'lib/http/routeError.ts'))) };
  for (const [name, expected] of Object.entries(sourceHashes)) assert.equal(hash(readMaterialized(path.join(root, name))), expected, 'Re-bundle changed source: ' + name);
  const { offlineApp } = await import('./support/offline-app.mjs');
  const app = offlineApp();
  for (const name of ['@/lib/supabase/admin', '@/lib/auth/getSession', '@/lib/getAuthenticatedMember']) {
    app.setMock(name, () => { forbiddenImports++; throw Error('Closed route imported authority'); });
  }
  handler = app.load('app/api/leaderboard/route.ts');
  const { chromium } = require('playwright');
  browser = await chromium.launch({ headless: true, timeout: 15_000, executablePath, env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' },
    args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'] });
  async function fixture() {
    const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
    await context.addCookies([{ name: 'must_not_send', value: 'NONISSUED_LOCAL_FIXTURE', url: origin }]);
    const page = await context.newPage(); page.setDefaultTimeout(5000); await page.clock.install();
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && !message.text().includes('Failed to load resource:')) consoleErrors.push(message.text()); });
    const state = { mode: 'actual', reads: 0 };
    await context.route('**/*', async route => {
      try {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== origin) { unexpected.push(request.url()); await route.abort(); return; }
        if (url.pathname === '/') { await route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en"><body style="margin:0"><div id="root"></div><script type="module" src="/page.mjs"></script></body></html>' }); return; }
        if (url.pathname === '/page.mjs') { await route.fulfill({ contentType: 'text/javascript', body: bundle }); return; }
        if (url.pathname !== '/api/leaderboard') { unexpected.push(request.url()); await route.abort(); return; }
        assert.equal(request.method(), 'GET'); assert.equal(request.headers().cookie, undefined); assert.equal(request.headers().authorization, undefined); assert.equal(request.headers().referer, undefined);
        requests.push({ method: 'GET', mode: state.mode, cookieOmitted: true, bearerOmitted: true, referrerOmitted: true }); state.reads++;
        if (state.mode === 'network') { await route.abort(); return; }
        if (state.mode === 'old') { await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ guides: [{ displayName: 'PRIVATE_OLD_NAME', guideExp: 91234, salonsLed: 9 }] }) }); return; }
        if (state.mode === 'invalid') { await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'PRIVATE_ERROR', guides: [{ displayName: 'PRIVATE_OLD_NAME' }] }) }); return; }
        if (state.mode === 'broken-json') { await route.fulfill({ status: 503, contentType: 'application/json', body: 'PRIVATE_BROKEN_JSON' }); return; }
        const response = await handler.GET(); actualHandlerCalls++;
        assert.equal(response.status, 503); assert.match(response.headers.get('cache-control'), /private.*no-store/);
        const body = await response.text(); assert.deepEqual(JSON.parse(body), { error: 'Leaderboard unavailable.', code: 'leaderboard_unavailable' });
        await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body });
      } catch (error) { routeErrors.push(error.stack || String(error)); try { await route.abort(); } catch {} }
    });
    await page.goto(origin); await page.getByRole('status').filter({ hasText: 'The guide leaderboard is unavailable.' }).waitFor();
    const status = () => page.getByRole('status').innerText();
    const retry = () => page.getByRole('button', { name: 'Retry leaderboard availability', exact: true }).click();
    const hold = async kind => { await page.evaluate(kind => { window.leaderboardQa[kind] = true; }, kind); await retry(); await page.waitForFunction(() => window.leaderboardQa.held); };
    const release = () => page.evaluate(() => { if (!window.leaderboardQa.release) throw Error('No held local transport'); window.leaderboardQa.release(); });
    const settle = () => page.evaluate(() => new Promise(resolve => window.setTimeout(resolve, 0)));
    const assertPrivateAbsent = async () => { assert.doesNotMatch(await page.locator('main').innerText(), /PRIVATE_|91234|No Guides yet|graduated|EXP/); assert.equal(await page.locator('main img,main video,main audio,main iframe').count(), 0); };
    return { page, context, state, status, retry, hold, release, settle, assertPrivateAbsent };
  }

  const closed = await fixture(); assert.equal(closed.state.reads, 1); await closed.retry();
  await closed.page.getByRole('status').filter({ hasText: 'The guide leaderboard is unavailable.' }).waitFor(); assert.equal(closed.state.reads, 2);
  assert.equal(await closed.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  for (const control of await closed.page.locator('main button,main a').all()) { const bounds = await control.boundingBox(); assert.ok(bounds && bounds.height >= 44); }
  assert.equal(await closed.page.getByRole('link', { name: 'Browse published profiles' }).getAttribute('href'), '/members');
  assert.equal(await closed.page.getByRole('link', { name: 'Find a community' }).getAttribute('href'), '/community');
  await closed.assertPrivateAbsent(); checkpoint('actual page→actual503 handler on initial load and retry; no auth/database/cookie/referrer/private fields, 320px and44px controls'); await closed.context.close();

  const malformed = await fixture();
  for (const mode of ['old', 'invalid', 'broken-json', 'network']) {
    malformed.state.mode = mode; await malformed.retry();
    await malformed.page.getByRole('status').filter({ hasText: ['invalid', 'broken-json'].includes(mode) ? 'The availability response could not be verified.' : 'We could not check leaderboard availability.' }).waitFor();
    await malformed.assertPrivateAbsent();
    malformed.state.mode = 'actual'; await malformed.retry(); await malformed.page.getByRole('status').filter({ hasText: 'The guide leaderboard is unavailable.' }).waitFor();
  }
  checkpoint('legacy200 rankings, unknown503 payload, broken JSON and network errors stay distinct from known closure; manual retry never renders private extras'); await malformed.context.close();

  for (const kind of ['holdNextHeaders', 'holdNextBody']) {
    const timed = await fixture(); await timed.hold(kind); await timed.page.clock.fastForward(10_001);
    await timed.page.getByRole('status').filter({ hasText: 'The availability check took too long.' }).waitFor();
    await timed.release(); await timed.page.clock.runFor(1); assert.match(await timed.status(), /took too long/);
    await timed.retry(); await timed.page.getByRole('status').filter({ hasText: 'The guide leaderboard is unavailable.' }).waitFor();
    await timed.assertPrivateAbsent(); await timed.context.close();
  }
  checkpoint('one10-second deadline covers nonabortable delayed headers AND JSON; late completion cannot replace timeout and retry starts fresh');

  const race = await fixture(); race.state.mode = 'invalid'; await race.hold('holdNextBody');
  race.state.mode = 'actual'; await race.retry(); await race.page.getByRole('status').filter({ hasText: 'The guide leaderboard is unavailable.' }).waitFor();
  await race.release(); await race.page.clock.runFor(1); assert.equal(await race.status(), 'The guide leaderboard is unavailable.'); await race.assertPrivateAbsent();
  checkpoint('retry retires an old held invalid JSON body immediately; late prior-generation payload cannot overwrite newer verified closure'); await race.context.close();

  const unmounted = await fixture(); await unmounted.hold('holdNextBody'); await unmounted.page.evaluate(() => window.unmountLeaderboard());
  assert.equal(await unmounted.page.locator('main').count(), 0); await unmounted.release(); await unmounted.page.clock.runFor(10_001);
  assert.equal(await unmounted.page.locator('main').count(), 0);
  checkpoint('unmount aborts and retires held JSON work; delayed completion and deadline cannot resurrect the page or issue another request'); await unmounted.context.close();

  assert.equal(forbiddenImports, 0); assert.deepEqual(unexpected, []); assert.deepEqual(pageErrors, []); assert.deepEqual(consoleErrors, []); assert.deepEqual(routeErrors, []);
  for (const [name, expected] of Object.entries(sourceHashes)) assert.equal(hash(readMaterialized(path.join(root, name))), expected, 'Source changed during proof: ' + name);
} catch (error) { failure = error.stack || String(error); }
finally {
  // Never leave an earlier PASS while cleanup is pending or a fresh run has failed.
  fs.writeFileSync(reportPath, JSON.stringify({ ...report(failure ? 'FAIL' : 'CLEANING_UP'), failure }, null, 2) + '\n');
  try { if (browser) await bounded(() => browser.close(), 5000); cleanup.status = 'closed'; }
  catch (error) { cleanup.status = 'failed'; cleanup.error = error.message; failure ??= error.stack || String(error); }
  fs.writeFileSync(reportPath, JSON.stringify({ ...report(failure ? 'FAIL' : 'PASS'), failure }, null, 2) + '\n');
}
if (failure) throw Error(failure);
console.log('PASS actual leaderboard Chromium: ' + stories.length + ' stories; zero provider/auth/database calls.');
