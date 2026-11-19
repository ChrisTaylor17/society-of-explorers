// Actual Hall component/shared parser; controlled HTTPS DTOs only. No actual API/SQL/provider proof.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const executablePath = '/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const origin = 'https://hall-fixture.test';
const dir = path.join(root, 'verification/web/evidence/hall-fixture');
const bundle = fs.readFileSync(path.join(dir, 'page.js'));
const css = fs.readFileSync(path.join(dir, fs.readdirSync(dir).find(name => name.endsWith('.css'))));
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'source-manifest.json'), 'utf8'));
const html = '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/page.css"><style>body{margin:0}</style></head><body><div id="root"></div><script type="module" src="/page.mjs"></script></body></html>';
const hash = value => createHash('sha256').update(value).digest('hex');
const assertSources = () => { for (const [name, expected] of Object.entries(manifest.sourceHashes)) assert.equal(hash(fs.readFileSync(path.join(root, name))), expected, 'Re-bundle changed source: ' + name); };
assertSources();
const stories = [], requests = [], unexpected = [], errors = [], consoleErrors = [], routeErrors = [], cleanupErrors = [];
let failure = null, ownedBrowserPID = null;
const reportPath = path.join(root, 'verification/web/evidence/hall-browser.json');
const report = () => ({ status: failure ? 'FAIL' : 'RUNNING', failure, stories, requests, unexpected, errors, consoleErrors, routeErrors, cleanupErrors,
  ownedBrowserPID, sourceHashes: manifest.sourceHashes, bundleSHA256: hash(bundle), cssSHA256: hash(css), scope: manifest.scope, cssProcessing: manifest.cssProcessing,
  providerCalls: 0, authOrPrivateRequests: 0, mediaRequests: 0 });
const checkpoint = story => { stories.push(story); fs.writeFileSync(reportPath, JSON.stringify(report(), null, 2) + '\n'); console.log(`PASS ${stories.length}: ${story}`); };
const within = async (work, label, milliseconds = 5000) => { let timer; try { return await Promise.race([work(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label + ' timed out')), milliseconds); })]); } finally { clearTimeout(timer); } };
const browser = await chromium.launch({ headless: true, executablePath, env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' },
  args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'] });
for (const line of execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' }).split('\n')) {
  const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
  if (match && Number(match[2]) === process.pid && match[3].startsWith(executablePath + ' ')) ownedBrowserPID = Number(match[1]);
}
const item = (index, title = 'A public question', thinker = 'socrates') => ({ id: `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`, thinker_id: thinker,
  title, description: 'A public reflection about reading carefully.', philosophical_note: 'Keep asking honest questions.' });

try {
  async function fixture({ width = 390, mode = 'normal', clock = false, holdInitial = false, tag = '' } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    await context.addCookies([{ name: 'synthetic_cookie_must_not_be_sent', value: 'NONISSUED_LOCAL_FIXTURE', url: origin }]);
    const page = await context.newPage(); page.setDefaultTimeout(5000);
    if (clock) await page.clock.install();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && !message.text().includes('Failed to load resource:')) consoleErrors.push(message.text()); });
    const state = { mode, reads: 0, holdNext: holdInitial, held: false, release: null, tag };
    await context.route('**/*', async route => {
      try {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== origin) { unexpected.push(request.url()); await route.abort(); return; }
        if (url.pathname === '/') { await route.fulfill({ contentType: 'text/html', body: html }); return; }
        if (url.pathname === '/page.mjs') { await route.fulfill({ contentType: 'text/javascript', body: bundle }); return; }
        if (url.pathname === '/page.css') { await route.fulfill({ contentType: 'text/css', body: css }); return; }
        if (url.pathname !== '/api/hall') { unexpected.push(request.url()); await route.abort(); return; }
        assert.equal(request.method(), 'GET'); assert.equal(request.headers().cookie, undefined); assert.equal(request.headers().authorization, undefined); assert.equal(request.headers().referer, undefined);
        assert.deepEqual([...url.searchParams.keys()], url.searchParams.has('thinker') ? ['thinker'] : []);
        const thinker = url.searchParams.get('thinker');
        assert.ok(thinker === null || ['socrates', 'plato', 'nietzsche', 'aurelius', 'einstein', 'jobs'].includes(thinker));
        requests.push({ method: 'GET', thinker, cookieOmitted: true, bearerOmitted: true, referrerOmitted: true }); state.reads++;
        const selectedMode = state.mode;
        let value = { items: thinker ? [item(2, `${state.tag}Global ${thinker} creation`, thinker)]
          : [item(1, `${state.tag}A public question`), { ...item(3, 'Still learning', 'plato'), description: null, philosophical_note: null }], page: { limit: 48, hasMore: false } };
        if (selectedMode === 'empty') value.items = [];
        if (selectedMode === 'bounded') { value.items = Array.from({ length: 48 }, (_, index) => item(index + 1, `Bounded creation ${index + 1}`)); value.page.hasMore = true; }
        if (selectedMode === 'bad-limit') value.page.limit = 49;
        if (selectedMode === 'duplicate') value.items = [value.items[0], value.items[0]];
        if (selectedMode === 'oversized') value.items[0].title = 'x'.repeat(201);
        if (selectedMode === 'prototype-keys') value.items = ['__proto__', 'constructor', 'toString'].map((name, index) => item(index + 1, `Plain thinker ${index + 1}`, name));
        if (selectedMode === 'extras') {
          value.items[0] = { ...value.items[0], title: 'Literal <img src=https://unapproved.invalid/pixel>',
            description: '<script>window.HALL_INJECTED=true</script>', member_id: 'PRIVATE_MEMBER_ID', members: { display_name: 'PRIVATE_DISPLAY_NAME' },
            prompt_used: 'PRIVATE_PROMPT', conversation_context: 'PRIVATE_CONTEXT', image_url: 'https://unapproved.invalid/private-media.jpeg', created_at: 'PRIVATE_DATE' };
          value.privateLedger = 'PRIVATE_LEDGER';
        }
        if (state.holdNext) { state.holdNext = false; state.held = true; await new Promise(resolve => { state.release = resolve; }); state.held = false; }
        if (selectedMode === 'http-error') { await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic permission failure' }) }); return; }
        if (selectedMode === 'invalid-json') { await route.fulfill({ status: 200, contentType: 'application/json', body: 'interrupted synthetic JSON' }); return; }
        await route.fulfill({ contentType: 'application/json', headers: { 'Cache-Control': 'private, no-store' }, body: JSON.stringify(value) });
      } catch (error) { routeErrors.push(error.stack || String(error)); try { await route.abort(); } catch {} }
    });
    await page.goto(origin); await page.getByRole('heading', { name: 'Hall of Creations', exact: true }).waitFor();
    const errorMode = ['http-error', 'invalid-json', 'bad-limit', 'duplicate', 'oversized'].includes(mode);
    if (!holdInitial) await page.getByRole('status').filter({ hasText: errorMode ? 'Public creations are unavailable.' : 'Public text view loaded for' }).waitFor();
    const waitHeld = async () => { for (let index = 0; index < 200 && !state.held; index++) await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(state.held, true); };
    const release = () => { assert.ok(state.release); state.release(); state.release = null; };
    const settle = () => new Promise(resolve => setTimeout(resolve, 50));
    const close = async () => { if (state.release) release(); await within(() => context.close(), 'owned context close'); };
    return { page, context, state, waitHeld, release, settle, close };
  }

  const mobile = await fixture({ width: 320 });
  assert.equal(mobile.state.reads, 1); assert.equal(await mobile.page.locator('article').count(), 2);
  assert.equal(await mobile.page.getByText('Anonymous Explorer', { exact: true }).count(), 2);
  assert.equal(await mobile.page.locator('img,video,audio,iframe,source').count(), 0);
  assert.equal(await mobile.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  for (const control of await mobile.page.locator('main button,main a').all()) { const bounds = await control.boundingBox(); assert.ok(bounds && bounds.height >= 44); }
  await mobile.page.getByRole('button', { name: 'All minds', exact: true }).focus(); await mobile.page.keyboard.press('Tab');
  assert.equal(await mobile.page.getByRole('button', { name: 'Socrates', exact: true }).evaluate(element => element === document.activeElement), true);
  await mobile.page.screenshot({ path: path.join(root, 'verification/web/evidence/hall-mobile-320.png'), fullPage: true });
  await mobile.page.keyboard.press('Enter'); await mobile.page.getByRole('status').filter({ hasText: 'loaded for Socrates.' }).waitFor();
  await mobile.page.getByRole('heading', { name: 'Global socrates creation', exact: true }).waitFor();
  assert.equal(requests.at(-1).thinker, 'socrates');
  assert.doesNotMatch(await mobile.page.getByRole('region', { name: 'Public text creations' }).innerText(), /A public question/);
  checkpoint('320px/no overflow,44px controls and keyboard server-filter selection; initial public GET omits even a present fixture cookie and renders anonymous text-only cards'); await mobile.close();

  const empty = await fixture({ mode: 'empty' }); assert.equal(await empty.page.locator('article').count(), 0);
  await empty.page.getByText('No public text creations are available for this selection.', { exact: true }).waitFor();
  assert.doesNotMatch(await empty.page.locator('main').innerText(), /awaits its first|unavailable/);
  empty.state.mode = 'normal'; await empty.page.getByRole('button', { name: 'Refresh creations', exact: true }).click();
  await empty.page.getByRole('heading', { name: 'A public question', exact: true }).waitFor(); assert.equal(empty.state.reads, 2);
  checkpoint('only a valid200 empty DTO produces the selection-specific empty state; explicit refresh can reveal newly available text'); await empty.close();

  for (const mode of ['http-error', 'invalid-json', 'bad-limit', 'duplicate', 'oversized']) {
    const item = await fixture({ mode }); assert.equal(await item.page.locator('article').count(), 0);
    assert.doesNotMatch(await item.page.locator('main').innerText(), /No public text creations|Synthetic permission failure/);
    item.state.mode = 'normal'; await item.page.getByRole('button', { name: 'Retry loading creations', exact: true }).click();
    await item.page.getByRole('heading', { name: 'A public question', exact: true }).waitFor(); assert.equal(item.state.reads, 2); await item.close();
  }
  checkpoint('HTTP503, invalid JSON, wrong page limit, duplicate IDs and oversized title are unavailable rather than empty; manual retry succeeds without private/error details');

  const extras = await fixture({ mode: 'extras' });
  assert.match(await extras.page.locator('article').first().innerText(), /Literal <img/);
  assert.doesNotMatch(await extras.page.locator('main').innerText(), /PRIVATE_MEMBER_ID|PRIVATE_DISPLAY_NAME|PRIVATE_PROMPT|PRIVATE_CONTEXT|PRIVATE_DATE|PRIVATE_LEDGER/);
  assert.equal(await extras.page.locator('img,video,audio,iframe,source').count(), 0); assert.equal(await extras.page.evaluate(() => window.HALL_INJECTED), undefined);
  checkpoint('actual shared parser drops identity/prompt/context/date/media extras, React escapes authored markup, and no media or script is loaded'); await extras.close();

  const prototypeKeys = await fixture({ mode: 'prototype-keys' });
  assert.equal(await prototypeKeys.page.locator('article').count(), 3);
  for (const name of ['__proto__', 'constructor', 'toString']) {
    const label = prototypeKeys.page.locator('article').getByText(name, { exact: true });
    await label.waitFor();
    assert.equal(await label.evaluate(element => getComputedStyle(element).color), 'rgb(201, 168, 76)');
  }
  assert.deepEqual(errors, []); assert.deepEqual(consoleErrors, []);
  checkpoint('allowed unknown thinker IDs __proto__/constructor/toString render their literal names and safe gold color without inherited-object/function values or page/console errors'); await prototypeKeys.close();

  const bounded = await fixture({ mode: 'bounded' }); assert.equal(await bounded.page.locator('article').count(), 48);
  assert.match(await bounded.page.getByRole('region', { name: 'Public text creations' }).innerText(), /showing 48 creations, up to 48. More creations exist; earlier entries are not shown./);
  checkpoint('valid48-row hasMore response shows the global latest48 bound and explicitly withholds earlier entries'); await bounded.close();

  const deadline = await fixture({ holdInitial: true, clock: true, tag: 'LATE_' }); await deadline.waitHeld();
  await deadline.page.clock.fastForward(15_001); await deadline.page.getByRole('status').filter({ hasText: 'Public creations are unavailable.' }).waitFor();
  deadline.release(); await deadline.settle(); assert.equal(await deadline.page.locator('article').count(), 0);
  assert.match(await deadline.page.getByRole('status').innerText(), /unavailable/);
  deadline.state.tag = 'FRESH_'; await deadline.page.getByRole('button', { name: 'Retry loading creations', exact: true }).click();
  await deadline.page.getByRole('heading', { name: 'FRESH_A public question', exact: true }).waitFor();
  checkpoint('accelerated15-second GET deadline aborts the old request; late HTTP completion cannot reset error, and manual retry starts fresh'); await deadline.close();

  const jsonDeadline = await fixture({ holdInitial: true, clock: true, tag: 'LATE_JSON_' }); await jsonDeadline.waitHeld();
  await jsonDeadline.page.evaluate(() => { window.hallQa.holdNextBody = true; }); jsonDeadline.release();
  await jsonDeadline.page.waitForFunction(() => window.hallQa.bodyHeld); await jsonDeadline.page.clock.fastForward(15_001);
  await jsonDeadline.page.getByRole('status').filter({ hasText: 'Public creations are unavailable.' }).waitFor();
  await jsonDeadline.page.evaluate(() => window.hallQa.releaseBody()); await jsonDeadline.settle();
  assert.equal(await jsonDeadline.page.locator('article').count(), 0); assert.match(await jsonDeadline.page.getByRole('status').innerText(), /unavailable/);
  checkpoint('the same total deadline covers JSON parsing; a deliberately non-abortable late body cannot turn an error into data'); await jsonDeadline.close();

  const switched = await fixture({ holdInitial: true, tag: 'OLD_' }); await switched.waitHeld();
  await switched.page.evaluate(() => { window.hallQa.holdNextBody = true; }); switched.release(); await switched.page.waitForFunction(() => window.hallQa.bodyHeld);
  switched.state.tag = 'NEW_'; await switched.page.getByRole('button', { name: 'Plato', exact: true }).click();
  await switched.page.getByRole('heading', { name: 'NEW_Global plato creation', exact: true }).waitFor();
  await switched.page.evaluate(() => window.hallQa.releaseBody()); await switched.settle();
  assert.equal(await switched.page.getByRole('button', { name: 'Plato', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.doesNotMatch(await switched.page.locator('main').innerText(), /OLD_A public question/);
  await switched.page.getByRole('heading', { name: 'NEW_Global plato creation', exact: true }).waitFor();
  checkpoint('filter changes clear old cards and retire a pending JSON body; old all-minds data cannot replace the new global Plato result'); await switched.close();

  const restarted = await fixture({ holdInitial: true, tag: 'OLD_NETWORK_' }); await restarted.waitHeld();
  restarted.state.tag = 'NEW_NETWORK_'; await restarted.page.getByRole('button', { name: 'Refresh creations', exact: true }).click();
  await restarted.page.getByRole('heading', { name: 'NEW_NETWORK_A public question', exact: true }).waitFor(); restarted.release(); await restarted.settle();
  assert.doesNotMatch(await restarted.page.locator('main').innerText(), /OLD_NETWORK_A public question/);
  checkpoint('manual refresh during an in-flight load retires it; a later old network response cannot reset newer data'); await restarted.close();

  assert.deepEqual(errors, []); assert.deepEqual(consoleErrors, []); assert.deepEqual(unexpected, []); assert.deepEqual(routeErrors, []); assertSources();
} catch (error) { failure = error.stack || String(error); process.exitCode = 1; }
finally {
  fs.writeFileSync(reportPath, JSON.stringify(report(), null, 2) + '\n');
  try { await within(() => browser.close(), 'owned browser close'); }
  catch (error) { cleanupErrors.push(error.message); process.exitCode = 1; if (ownedBrowserPID) { try { process.kill(ownedBrowserPID, 'SIGTERM'); } catch {} } }
  const final = { ...report(), status: failure || cleanupErrors.length ? 'FAIL' : 'PASS', finishedAt: new Date().toISOString(),
    deadlineProof: 'Playwright clock.fastForward(15001); no real15-second sleeps', explicitHTTPFixtures: true };
  fs.writeFileSync(reportPath, JSON.stringify(final, null, 2) + '\n'); console.log(JSON.stringify(final));
}
