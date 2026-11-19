// Actual reviewer React components -> actual coverage handlers -> disposable SQL.
// Identity/credential/event/NextLink ports are explicit synthetic adapters.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url)), WEB = path.join(ROOT, 'verification/web');
const origin = 'https://review-coverage-fixture.test', reportPath = path.join(WEB, 'evidence/review-coverage-composed.json');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function read(name) { const file = path.isAbsolute(name) ? name : path.join(ROOT, name), stat = fs.statSync(file); assert.ok(stat.blocks, 'Refuse offloaded file: ' + name); return fs.readFileSync(file); }
const gate = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function bounded(work, milliseconds = 5000, label = 'Owned operation') { let timer; try { return await Promise.race([Promise.resolve().then(work), new Promise((_, reject) => { timer = setTimeout(() => reject(Error(label + ' timed out')), milliseconds); })]); } finally { clearTimeout(timer); } }
const stories = [], api = [], unexpected = [], pageErrors = [], consoleErrors = [], routeErrors = [], retiredRoutes = [];
const cleanup = { browser: 'pending', databases: 'pending' }, fixtures = [], pending = new Set(), controllers = new Map(), releases = new Set();
const startedAt = new Date().toISOString();
let browser, ownedBrowserPid, activeFixture, bundle, css, runtime = {}, sourceHashes = {}, sqlHashes = {}, limits = {}, finalCounts = null, failure = null;
let dropAck = false, dropDecision = false, holdRead = false, holdDecision = false, held = null;
const priorReceipt = fs.existsSync(reportPath) ? (() => { const bytes = read(reportPath); return { sha256: sha(bytes), receipt: JSON.parse(bytes) }; })() : null;
const executablePath = process.env.SOE_BROWSER_EXECUTABLE;
function report(status) { return { version: 1, status, startedAt, finishedAt: new Date().toISOString(), stories, api, unexpected, pageErrors, consoleErrors, routeErrors, retiredRoutes, cleanup, runtime, sourceHashes, sqlHashes,
  bundleSHA256: bundle ? sha(bundle) : null, cssSHA256: css ? sha(css) : null, limits, finalCounts, failure, priorReceipt,
  scope: 'Actual CircleReviews/MessageReviews/ReviewCoverage and Bun CSS modules, actual coverage/detail/queue route handlers and strict current SQL in disposable PGlite. Synthetic server identity and narrow PostgREST/NextResponse transport, browser credential/SDK event/NextLink adapters. Synthetic report rows; no real account, provider, network, hosted, multi-backend lock scheduling or human-comprehension acceptance. Global Next/PostCSS/fonts excluded.' }; }
const write = status => { fs.mkdirSync(path.dirname(reportPath), { recursive: true }); fs.writeFileSync(reportPath, JSON.stringify(report(status), null, 2) + '\n'); };
const cleanErrors = () => { assert.deepEqual(unexpected, []); assert.deepEqual(pageErrors, []); assert.deepEqual(consoleErrors, []); assert.deepEqual(routeErrors, []); };
const pass = name => { stories.push(name); write('RUNNING'); console.log('PASS ' + stories.length + ': ' + name); };
function ownedChrome() { return execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' }).split('\n').map(line => line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/)).filter(m => m && Number(m[2]) === process.pid && m[3].startsWith(executablePath + ' ')).map(m => Number(m[1])); }
function signalOwnedChrome(signal) { if (!ownedBrowserPid || !ownedChrome().includes(ownedBrowserPid)) return; const group = Number(execFileSync('/bin/ps', ['-p', String(ownedBrowserPid), '-o', 'pgid='], { encoding: 'utf8' }).trim()); process.kill(group === ownedBrowserPid ? -ownedBrowserPid : ownedBrowserPid, signal); }
write('RUNNING');
try {
  process.chdir(WEB);
  assert.ok(process.execArgv.some(value => value.endsWith('/deny-build-network.cjs')), 'Startup deny guard required');
  assert.ok(process.env.SOE_PLAYWRIGHT_PACKAGE && executablePath, 'Explicit cached runtimes required');
  read(process.env.SOE_PLAYWRIGHT_PACKAGE + '/package.json'); read(executablePath);
  const require = createRequire(path.join(process.env.SOE_PLAYWRIGHT_PACKAGE, 'package.json'));
  bundle = read('verification/web/evidence/review-coverage-fixture/page.js'); css = read('verification/web/evidence/review-coverage-fixture/page.css');
  const manifest = JSON.parse(read('verification/web/evidence/review-coverage-fixture/source-manifest.json'));
  sourceHashes = { ...manifest.sourceHashes };
  for (const file of ['verification/web/tests/browser-review-coverage-composed.mjs', 'verification/web/tests/support/review-coverage-app.mjs',
    'lib/circles/review-coverage-server.ts', 'lib/circles/moderation-server.ts', 'lib/circles/message-moderation-server.ts', 'lib/http/routeError.ts',
    'app/api/admin/circles/reports/route.ts', 'app/api/admin/circles/reports/[circleId]/route.ts',
    'app/api/admin/circles/reports/[circleId]/coverage/route.ts', 'app/api/admin/circles/reports/[circleId]/coverage/decision/route.ts',
    'app/api/admin/circles/messages/route.ts', 'app/api/admin/circles/[circleId]/messages/[messageId]/route.ts',
    'app/api/admin/circles/[circleId]/messages/[messageId]/coverage/route.ts', 'app/api/admin/circles/[circleId]/messages/[messageId]/coverage/decision/route.ts']) sourceHashes[file] = sha(read(file));
  for (const [file, expected] of Object.entries(sourceHashes)) assert.equal(sha(read(file)), expected, 'Review/rebundle changed source: ' + file);
  const module = await import('./support/review-coverage-app.mjs');
  for (const [file, digest] of Object.entries(module.COVERAGE_SOURCE_HASHES)) (file.endsWith('.sql') ? sqlHashes : sourceHashes)[file] = digest;
  limits = module.COVERAGE_FIXTURE_LIMITS;
  const large = await module.reviewCoverageApp({ reportCount: 250 }); fixtures.push(large);
  const medium = await module.reviewCoverageApp({ reportCount: 101 }); fixtures.push(medium);
  activeFixture = large;
  const { chromium } = require('playwright');
  browser = await chromium.launch({ headless: true, timeout: 15000, executablePath, env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' }, args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'] });
  const pids = ownedChrome(); assert.equal(pids.length, 1); ownedBrowserPid = pids[0];
  runtime = { node: process.version, chromium: browser.version(), startupDeny: true, cleanEnvironment: true, ownedBrowserPid };
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } }), page = await context.newPage(); page.setDefaultTimeout(7000);
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('Failed to load resource:')) consoleErrors.push(message.text()); });
  page.on('requestfailed', request => controllers.get(request)?.abort());
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    try {
      if (url.origin !== origin) { unexpected.push(url.origin + url.pathname); return await route.abort(); }
      if (url.pathname === '/') return await route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/page.css"></head><body style="margin:0;padding:16px;background:#0a0a0a;color:#f5f0e8;box-sizing:border-box"><div id="root"></div><script type="module" src="/page.mjs"></script></body></html>' });
      if (url.pathname === '/page.mjs') return await route.fulfill({ contentType: 'text/javascript', body: bundle });
      if (url.pathname === '/page.css') return await route.fulfill({ contentType: 'text/css', body: css });
      if (!url.pathname.startsWith('/api/')) { unexpected.push(url.pathname); return await route.abort(); }
      const headers = await request.allHeaders(); assert.equal(headers.authorization, undefined); assert.equal(headers.cookie, undefined);
      const service = activeFixture, controller = new AbortController(); controllers.set(request, controller);
      const body = request.postData() ?? undefined, parsed = body ? JSON.parse(body) : null;
      const entry = { path: url.pathname, method: request.method(), bodyKeys: parsed ? Object.keys(parsed).sort() : [], bodySHA256: body ? sha(body) : null,
        action: parsed?.action ?? null, status: null, delivered: false, replayed: null }; api.push(entry);
      const work = (async () => {
        const response = await service.dispatch(url.pathname + url.search, request.method(), body, controller.signal);
        entry.status = response.status; assert.match(response.headers.get('cache-control'), /private.*no-store/);
        const reply = await response.text(), value = JSON.parse(reply); entry.replayed = value.replayed ?? null;
        if (dropAck && parsed?.action === 'ack') { dropAck = false; await route.abort(); return; }
        if (dropDecision && url.pathname.endsWith('/coverage/decision')) { dropDecision = false; await route.abort(); return; }
        if ((holdRead && request.method() === 'GET' && url.pathname.endsWith('/coverage')) || (holdDecision && url.pathname.endsWith('/coverage/decision'))) {
          holdRead = false; holdDecision = false; held = gate(); releases.add(held.resolve); await held.promise; releases.delete(held.resolve);
        }
        await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: reply }); entry.delivered = true;
      })();
      pending.add(work); try { await work; } finally { pending.delete(work); controllers.delete(request); }
    } catch (error) {
      if (controllers.get(request)?.signal.aborted || /aborted|cancelled|Target.*closed|route.*handled/i.test(String(error))) retiredRoutes.push({ path: url.pathname, reason: 'Browser request retired' });
      else routeErrors.push(error.stack || String(error));
      try { await route.abort(); } catch {} controllers.delete(request);
    }
  });
  await page.goto(origin); await page.getByRole('button', { name: 'Load assigned Circles', exact: true }).waitFor(); assert.equal(api.length, 0);
  const full = () => page.getByRole('region', { name: 'Full report review', exact: true });
  const fieldset = () => page.locator('fieldset');
  async function decisionDisabled(expected) {
    await page.waitForFunction(value => document.querySelector('fieldset')?.disabled === value, expected);
    assert.equal(await fieldset().evaluate(element => element.disabled), expected);
    // Check a real form control as well: the cached Playwright container
    // isDisabled() predicate does not report fieldset.disabled itself.
    assert.equal(await fieldset().locator('select').first().isDisabled(), expected);
  }
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  async function open(f, kind) {
    activeFixture = f; f.setActor(f.reviewerId); await page.evaluate(view => window.coverageQa.show(view), kind);
    await page.getByRole('button', { name: kind === 'listing' ? 'Load assigned Circles' : 'Load assigned message reviews', exact: true }).click();
    const title = (await f.db.query('SELECT title FROM book_cohorts WHERE id=$1', [f.circleId])).rows[0].title;
    await page.getByRole('button', { name: (kind === 'listing' ? 'Review ' : 'Review message in ') + title, exact: true }).click();
    await page.getByRole('region', { name: kind === 'listing' ? 'Current Circle review' : 'Current message review', exact: true }).waitFor();
  }
  async function start(total) { await page.getByRole('button', { name: 'Start full case review', exact: true }).click(); await full().getByText(`Reviewed 0 of ${total} reports.`, { exact: true }).waitFor(); assert.equal(await full().locator('li').count(), 50); }
  async function ack(reviewed, total) { await full().getByRole('checkbox').check(); await full().getByRole('button', { name: 'Acknowledge this report page', exact: true }).click(); await full().getByText(`Reviewed ${Math.min(reviewed + 50, total)} of ${total} reports.`, { exact: true }).waitFor(); }
  async function finish(total) { for (let reviewed = 0; reviewed < total; reviewed += 50) await ack(reviewed, total); await decisionDisabled(false); }
  async function prepare(f, kind) {
    await page.getByLabel(kind === 'listing' ? 'Decision' : 'Moderator restriction', { exact: true }).selectOption('hide');
    await page.getByLabel('Reason based on conduct', { exact: true }).selectOption('safety');
    await page.getByLabel('Evidence source', { exact: true }).selectOption(f.evidence[kind].id);
    await page.getByLabel(kind === 'listing' ? 'Exact excerpt supporting this reason' : 'Exact evidence excerpt', { exact: true }).fill(f.evidence[kind].note.slice(0, 100));
    await page.getByLabel(kind === 'listing' ? 'Host-facing explanation' : 'Author-facing explanation', { exact: true }).fill('A human checked the complete case and found a conduct concern.');
    await fieldset().getByRole('checkbox').check();
  }
  const save = kind => page.getByRole('button', { name: kind === 'listing' ? 'Save reviewed decision' : 'Save message decision', exact: true }).click();

  await open(large, 'listing');
  await decisionDisabled(true); await start(250);
  await full().getByRole('button', { name: 'Use report 1 as evidence', exact: true }).click(); await finish(250);
  await full().getByRole('button', { name: 'Previous report page', exact: true }).click(); await full().getByText('Report page 4 of 5', { exact: true }).waitFor();
  await prepare(large, 'listing');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.ok((await page.locator('button').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height))).every(height => height >= 44));
  await page.screenshot({ path: path.join(WEB, 'evidence/review-coverage-composed-320.png'), fullPage: true });
  await save('listing'); await page.getByRole('status').filter({ hasText: 'Decision saved. Current case loaded' }).waitFor();
  assert.deepEqual(await large.counts('listing'), { total: 250, open: 0, decisions: 1 });
  assert.equal((await large.detail('listing')).decisions[0].report_count, 250);
  pass('listing250: five actual acknowledged SQL pages, earlier-page exact evidence, covered decision and fresh readback,320px/44px');

  await open(medium, 'message'); await start(101); await full().getByRole('button', { name: 'Use report 1 as evidence', exact: true }).click(); await finish(101); await prepare(medium, 'message');
  dropDecision = true; const beforeDecision = api.length; await save('message'); await page.getByRole('button', { name: 'Retry exact decision', exact: true }).waitFor();
  assert.equal(api.length, beforeDecision + 1); assert.deepEqual(await medium.counts('message'), { total: 101, open: 0, decisions: 1 });
  await page.getByRole('button', { name: 'Retry exact decision', exact: true }).click(); await page.getByRole('status').filter({ hasText: 'Decision confirmed. Current case loaded' }).waitFor();
  const attempts = api.slice(beforeDecision).filter(entry => entry.path.endsWith('/coverage/decision'));
  assert.equal(attempts.length, 2); assert.equal(attempts[0].bodySHA256, attempts[1].bodySHA256); assert.equal(attempts[1].replayed, true);
  assert.deepEqual(await medium.counts('message'), { total: 101, open: 0, decisions: 1 });
  pass('message101: complete three-page SQL coverage; lost committed decision reply recovers only by exact manual replay and fresh readback');

  await open(medium, 'listing'); await start(101); await full().getByRole('button', { name: 'Use report 1 as evidence', exact: true }).click();
  dropAck = true; const beforeAck = api.length; await full().getByRole('checkbox').check(); await full().getByRole('button', { name: 'Acknowledge this report page', exact: true }).click();
  await full().getByText(/acknowledgement reply could not be confirmed/).waitFor(); assert.equal(api.length, beforeAck + 1);
  assert.equal(await full().locator('li').count(), 0); await decisionDisabled(true);
  await full().getByRole('button', { name: 'Refresh review progress', exact: true }).click(); await full().getByText('Reviewed 50 of 101 reports.', { exact: true }).waitFor();
  assert.equal(api.length, beforeAck + 2); assert.equal(api.slice(beforeAck).filter(entry => entry.action === 'ack').length, 1);
  pass('lostACK: actual SQL commit is not assumed or automatically retried; explicit GET recovers current50-of101 progress');

  await medium.addReport('listing'); await full().getByRole('button', { name: 'Refresh review progress', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'This case changed. Load it again and read the latest reports before deciding.' }).waitFor();
  assert.equal(await full().count(), 0); assert.doesNotMatch(await page.locator('body').innerText(), /PRIVATE earlier|Chosen evidence/);
  assert.deepEqual(await medium.counts('listing'), { total: 102, open: 102, decisions: 0 });
  pass('real new listing report invalidates live coverage; actual409 clears private UI and leaves all102 reports open');

  for (const event of ['blur', 'SIGNED_OUT', 'SIGNED_IN']) {
    await open(large, 'message'); await start(250); await full().getByRole('button', { name: 'Use report 1 as evidence', exact: true }).click();
    holdRead = true; held = null; await full().getByRole('button', { name: 'Refresh review progress', exact: true }).click();
    await bounded(async () => { while (!held) await new Promise(resolve => setImmediate(resolve)); });
    if (event === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur'))); else await page.evaluate(value => window.coverageQa.emit(value), event);
    await page.getByRole('status').filter({ hasText: 'Private reports, evidence and drafts cleared.' }).waitFor();
    const beforeRelease = api.length; held.resolve(); await bounded(() => Promise.allSettled([...pending])); await settle();
    assert.equal(api.length, beforeRelease); assert.equal(await full().count(), 0); assert.doesNotMatch(await page.locator('body').innerText(), /PRIVATE earlier|Chosen evidence/);
    if (event === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  }
  await open(large, 'message'); await page.evaluate(() => window.coverageQa.holdCredentials());
  const beforeCredentials = api.length; await page.getByRole('button', { name: 'Start full case review', exact: true }).click();
  await page.evaluate(() => window.coverageQa.emit('SIGNED_OUT')); await page.evaluate(() => window.coverageQa.releaseCredentials()); await settle(); assert.equal(api.length, beforeCredentials);
  pass('blur/logout/account change fence actual held SQL pages and chosen evidence; retired credential waits issue no late mutation');

  await open(large, 'message'); await start(250); await full().getByRole('button', { name: 'Use report 1 as evidence', exact: true }).click(); await finish(250); await prepare(large, 'message');
  holdDecision = true; held = null; const beforeRetiredDecision = api.length; await save('message');
  await bounded(async () => { while (!held) await new Promise(resolve => setImmediate(resolve)); });
  assert.deepEqual(await large.counts('message'), { total: 250, open: 0, decisions: 1 });
  await page.evaluate(() => window.coverageQa.emit('SIGNED_OUT')); await page.getByRole('status').filter({ hasText: 'Private reports, evidence and drafts cleared.' }).waitFor();
  held.resolve(); await bounded(() => Promise.allSettled([...pending])); await settle();
  assert.equal(api.length, beforeRetiredDecision + 1); assert.equal(await page.getByRole('region', { name: 'Current message review', exact: true }).count(), 0);
  assert.doesNotMatch(await page.locator('body').innerText(), /PRIVATE earlier|Chosen evidence/);
  pass('retired committed decision reply cannot restore private data, claim confirmation or trigger readback; the already committed SQL decision remains');

  finalCounts = { listing250: await large.counts('listing'), message250: await large.counts('message'),
    listing101Invalidated: await medium.counts('listing'), message101: await medium.counts('message') };
  assert.equal(Object.values(finalCounts).reduce((sum, counts) => sum + counts.decisions, 0), 3);
  assert.equal(api.some(entry => entry.path.endsWith('/advice')), false); cleanErrors();
  for (const [file, digest] of Object.entries({ ...sourceHashes, ...sqlHashes })) assert.equal(sha(read(file)), digest, 'Source changed during composed proof: ' + file);
} catch (error) { failure = error.stack || String(error); }
finally {
  write(failure ? 'FAIL' : 'CLEANING_UP');
  for (const controller of controllers.values()) controller.abort(); for (const release of releases) release();
  try { await bounded(() => Promise.allSettled([...pending]), 5000, 'Owned route cleanup'); } catch (error) { failure ??= error.stack || String(error); }
  try { if (browser) await bounded(() => browser.close(), 5000, 'Owned browser cleanup'); cleanup.browser = browser ? 'closed' : 'not-created'; }
  catch (error) { cleanup.browser = 'failed'; failure ??= error.stack || String(error); try { signalOwnedChrome('SIGTERM'); if (ownedChrome().includes(ownedBrowserPid)) signalOwnedChrome('SIGKILL'); } catch {} }
  try { for (const fixture of fixtures) await bounded(() => fixture.close(), 5000, 'Owned database cleanup'); cleanup.databases = 'closed'; } catch (error) { cleanup.databases = 'failed'; failure ??= error.stack || String(error); }
  try { cleanErrors(); } catch (error) { failure ??= error.stack || String(error); }
  write(failure ? 'FAIL' : 'PASS');
}
if (failure) throw Error(failure);
console.log('PASS composed review coverage Chromium: ' + stories.length + ' stories; actual handlers/SQL; no provider calls.');
