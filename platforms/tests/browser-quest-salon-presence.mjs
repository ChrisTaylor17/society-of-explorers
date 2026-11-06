// Two isolated browser contexts exercise the actual app, handler and disposable Circle schema.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { asRole, rpc, runSql } from '../../verification/web/tests/support/circle-live-db.mjs';
import { creationInput, participate } from '../../verification/web/tests/support/participation-db.mjs';
import { installQuestXrDouble } from './quest-xr-browser-double.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const run = process.argv[2];
assert.match(run ?? '', /^immersive-salon-[a-z0-9-]{1,16}$/);
assert.ok(process.execArgv.some(value => value.endsWith('/deny-build-network.cjs')));
assert.ok(process.env.SOE_PLAYWRIGHT_PACKAGE && process.env.SOE_BROWSER_EXECUTABLE);
const evidence = resolve(root, 'platforms/evidence', 'quest-salon-' + run + '.json');
const fixture = resolve(root, 'platforms/evidence', 'quest-member-composed-fixture-' + run);
const { sourceHashes, bunVersion } = JSON.parse(await readFile(resolve(fixture, 'source-manifest.json')));
const [bundle, css] = await Promise.all(['page.js', 'page.css'].map(name => readFile(resolve(fixture, name))));
const sha = data => createHash('sha256').update(data).digest('hex');
const sources = [
  'platforms/tests/browser-quest-salon-presence.mjs', 'platforms/tests/bundle-quest-member-composed.mjs',
  'platforms/tests/quest-xr-browser-double.mjs', 'verification/web/tests/support/quest-member-app.mjs',
  'verification/web/tests/support/offline-app.mjs', 'verification/web/tests/support/circle-live-db.mjs',
  'app/api/circles/[circleId]/salon-presence/route.ts', 'lib/circles/moderation-server.ts', 'lib/http/routeError.ts',
  'app/api/circles/[circleId]/route.ts', 'lib/circles/membership-server.ts', 'lib/circles/membership.ts',
  'app/api/circles/[circleId]/discussion/route.ts', 'app/api/circles/[circleId]/discussion/preview/route.ts',
  'lib/circles/thread-server.ts', 'lib/circles/thread.ts',
  'docs/sql/circle-salon-presence-apply.sql', 'docs/sql/circle-salon-presence-rollback.sql',
  'app/api/great-books/passage/route.ts', 'lib/books/passage-source.ts',
  'content/great-books/apology/passages.json', 'content/great-books/apology/reader.html',
  'content/great-books/apology/manifest.json', 'platforms/shared/circle-reading.ts', 'platforms/shared/reading-metadata.json',
];
const hashFile = async name => sha(await readFile(resolve(root, name)));
for (const name of sources) sourceHashes[name] = await hashFile(name);
const verifyHashes = async () => {
  for (const [name, hash] of Object.entries(sourceHashes)) assert.equal(await hashFile(name), hash, name);
};
await verifyHashes();
const { chromium } = createRequire(resolve(process.env.SOE_PLAYWRIGHT_PACKAGE, 'package.json'))('playwright');
const results = [], errors = [], browserRequests = [], cleanup = { browser: false, database: false };
const receipt = { status: 'RUNNING', results, errors, cleanup, browserRequests, sourceHashes,
  bundleSHA256: sha(bundle), cssSHA256: sha(css), startedAt: new Date().toISOString(), node: process.version, bunVersion };
const pass = name => { results.push(name); console.log('PASS: ' + name); };
const gates = new Set();
const activeRoutes = new Set();
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function bounded(promise, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(label + ' timed out')), 8_000); })]); }
  finally { clearTimeout(timer); }
}
let db, browser, failure;

await writeFile(evidence, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
try {
  process.chdir(resolve(root, 'verification/web'));
  const { questMemberApp, QUEST_ORIGIN: origin, QUEST_TEST_MEETING: meetingUrl, TOKENS } = await import('../../verification/web/tests/support/quest-member-app.mjs');
  const f = db = await questMemberApp({ sharedSalon: true, writing: true, meeting: true, reading: true });
  const endpoint = '/api/circles/' + f.circleId + '/salon-presence';
  const headers = actor => ({ origin, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json',
    ...(actor ? { authorization: 'Bearer ' + TOKENS[actor] } : {}) });
  const send = (actor, data, extra = {}) => f.dispatch(endpoint, { ...headers(actor), ...extra }, undefined, { body: JSON.stringify(data) });
  const probe = { action: 'reserve', leaseId: randomUUID() };
  assert.equal((await send('author', probe)).status, 503);
  assert.deepEqual(f.calls, []);
  f.enableSalon(true);
  assert.equal((await send(null, probe)).status, 401);
  assert.equal((await send('author', probe, { origin: 'https://cross-origin.test' })).status, 403);
  assert.equal((await send(null, probe, { origin: 'https://public-salon.test', host: 'public-salon.test' })).status, 401);
  assert.equal((await send('author', probe, { origin: 'https://public-salon.test', host: 'public-salon.test', 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await send('author', probe, { origin: 'https://public-salon.test', host: 'different.test' })).status, 403);
  assert.equal((await send('author', { ...probe, actor: f.reviewerId })).status, 400);
  assert.equal((await send('author', { ...probe, body: 'a'.repeat(50_000) })).status, 413);
  assert.deepEqual(f.calls, []);
  assert.equal((await send('outsider', probe)).status, 404);
  for (const role of ['anon', 'authenticated']) {
    await assert.rejects(asRole(f.db, role, tx => tx.query('SELECT * FROM circle_salon_presence')), { code: '42501' });
    await assert.rejects(asRole(f.db, role, tx => tx.query("SELECT soe_circle_salon_presence($1,$2,$3,'reserve')",
      [f.authorId, f.circleId, probe.leaseId])), { code: '42501' });
  }
  pass('Disabled, unsigned, forged, oversized and nonmember requests fail closed, and browser roles cannot call or read the SQL store');

  browser = await chromium.launch({ executablePath: process.env.SOE_BROWSER_EXECUTABLE, headless: true, timeout: 15_000,
    env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' },
    args: ['--disable-background-networking', '--disable-component-update', '--no-first-run',
      '--host-resolver-rules=MAP * ~NOTFOUND', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  receipt.chromium = browser.version();
  let holdReserve = null, holdDetail = null, holdPassage = null, corruptPassage = false, meetingNavigations = 0;
  async function client(actor, headset = false, { circleId = f.circleId, salon = true } = {}) {
    const context = await browser.newContext({ viewport: { width: 375, height: 844 }, serviceWorkers: 'block' });
    const readingCircle = circleId !== f.circleId, circlePath = '/api/circles/' + circleId;
    if (readingCircle) await context.addCookies([{ name: 'quest_fixture_cookie', value: 'test-only', url: origin }]);
    await context.addInitScript(installQuestXrDouble);
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await page.clock.install();
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', async route => {
      const task = (async () => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== origin) {
          assert.equal(url.href, meetingUrl);
          assert.equal(request.isNavigationRequest(), true);
          const sent = await request.allHeaders();
          for (const field of ['referer', 'authorization', 'cookie']) assert.equal(sent[field], undefined);
          meetingNavigations++;
          return route.fulfill({ contentType: 'text/html', body: '<title>Synthetic live meeting</title><h1>Synthetic live meeting</h1>' });
        }
        assert.equal(url.origin, origin);
        if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body:
          `<!doctype html><html lang="en" data-circle="${circleId}" ${salon ? 'data-shared-salon' : ''}><head><link rel="stylesheet" href="/page.css"></head><body><div id="root"></div><script type="module" src="/page.mjs"></script></body></html>` });
        if (url.pathname === '/page.mjs') return route.fulfill({ contentType: 'text/javascript', body: bundle });
        if (url.pathname === '/page.css') return route.fulfill({ contentType: 'text/css', body: css });
        const actual = await request.allHeaders();
        const account = { actor, provider: 'supabase' };
        const memberCheck = url.pathname === '/api/auth/member';
        const detailRead = url.pathname === circlePath;
        const presence = url.pathname === circlePath + '/salon-presence';
        const discussion = url.pathname === circlePath + '/discussion';
        const preview = url.pathname === circlePath + '/discussion/preview';
        const passage = url.pathname === '/api/great-books/passage';
        const method = request.method();
        if (passage) {
          assert.equal(readingCircle, true);
          assert.deepEqual([...url.searchParams.keys()], ['book', 'edition', 'block']);
          assert.equal(url.searchParams.get('book'), 'apology');
        } else assert.equal(url.search, '');
        assert.ok(method === 'GET' && (memberCheck || detailRead || discussion || passage) ||
          method === 'POST' && (presence || discussion || preview), method + ' ' + url.pathname);
        assert.equal(actual.authorization, memberCheck || passage ? undefined : 'Bearer ' + TOKENS[actor]);
        if (discussion || preview || passage || detailRead) {
          for (const field of ['referer', 'apikey']) assert.equal(actual[field], undefined, field);
        }
        if (passage) {
          assert.equal(actual.cookie, undefined);
          assert.equal(actual['x-soe-auth-intent'], undefined);
        } else if (readingCircle && detailRead) {
          assert.match(actual.cookie ?? '', /quest_fixture_cookie=test-only/);
        }
        const body = method === 'POST' ? request.postData() : undefined;
        const input = presence ? JSON.parse(body) : null;
        if (input) assert.deepEqual(Object.keys(input).sort(), ['action', 'leaseId']);
        const response = await f.dispatch(url.pathname + url.search, actual, undefined, { body, account });
        assert.match(response.headers.get('cache-control'), /private.*no-store/);
        let bytes = await response.text();
        const value = JSON.parse(bytes);
        if (input && response.ok) assert.deepEqual(Object.keys(value).sort(), input.action === 'sync' ? ['count', 'state'] : ['state']);
        const action = passage ? 'passage' : detailRead ? (readingCircle ? 'reading-detail' : 'meeting') : preview ? 'preview' :
          discussion ? (method === 'GET' ? 'archive' : 'post') : input?.action ?? 'account';
        browserRequests.push({ actor, action, status: response.status, count: value.count ?? null,
          ...(passage ? { block: Number(url.searchParams.get('block')) } : {}) });
        if (input?.action === 'reserve' && holdReserve) {
          const gate = holdReserve;
          holdReserve = null;
          gate.leaseId = input.leaseId;
          gate.reached.resolve();
          await gate.release.promise;
        }
        if (detailRead && holdDetail) {
          const gate = holdDetail;
          holdDetail = null;
          assert.equal(value.online_url, meetingUrl);
          gate.reached.resolve();
          await gate.release.promise;
        }
        if (passage && corruptPassage) {
          corruptPassage = false;
          bytes = JSON.stringify({ ...value, reference: { ...value.reference, blockIndex: value.reference.blockIndex + 1 } });
        }
        if (passage && holdPassage) {
          const gate = holdPassage;
          holdPassage = null;
          gate.reached.resolve();
          await gate.release.promise;
        }
        try { await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: bytes }); }
        catch (error) { if (!/aborted|cancelled|Target.*closed|route.*handled/i.test(String(error))) throw error; }
      })();
      activeRoutes.add(task);
      try { await task; }
      catch (error) { errors.push(error.stack ?? String(error)); await route.abort().catch(() => {}); }
      finally { activeRoutes.delete(task); }
    });
    await page.goto(origin);
    await page.getByRole('button', { name: 'Connect signed-in account', exact: true }).waitFor();
    await page.evaluate(({ actor, headset }) => {
      window.questComposedQa.actor(actor);
      if (headset) window.questXrQa.enable();
    }, { actor, headset });
    await page.getByRole('button', { name: 'Connect signed-in account', exact: true }).click();
    return page;
  }
  const regular = await client('author');
  const xr = await client('outsider', true);
  const trigger = () => xr.evaluate(() => window.questXrQa.select());
  const panel = text => xr.waitForFunction(value => window.questXrQa.panel().replace(/\s+/g, ' ').includes(value), text);
  const status = async text => {
    try { await regular.waitForFunction(value => document.getElementById('quest-salon-status').textContent.includes(value), text); }
    catch (error) { throw Error('Expected browser salon status "' + text + '". Saw "' + await regular.locator('#quest-salon-status').textContent() + '".', { cause: error }); }
  };
  const poll = page => page.clock.fastForward(10_500);
  const heartbeat = async (page = regular) => {
    const [response] = await Promise.all([page.waitForResponse(response => new URL(response.url()).pathname === endpoint
      && response.request().postDataJSON()?.action === 'sync'), poll(page)]);
    return response;
  };
  const press = label => xr.evaluate(value => window.questXrQa.press(value), label);
  const openXR = async () => {
    await xr.locator('#quest-salon-headset').click();
    await panel('Press the controller trigger to check your signed-in account.');
  };
  const verifyXR = async () => {
    await trigger();
    await panel('Press the trigger to join the shared salon count.');
  };
  const seats = () => f.db.query('SELECT count(*)::int AS n FROM circle_salon_presence').then(x => x.rows[0].n);
  assert.equal(browserRequests.length, 0);
  await openXR();
  assert.equal(browserRequests.length, 0);
  await verifyXR();
  assert.deepEqual(browserRequests.map(x => x.action), ['account']);
  await trigger();
  await panel('available to current members');
  assert.equal(browserRequests.at(-1).status, 404);
  assert.equal(await seats(), 0);
  pass('Connecting and entering WebXR make no private request, and an account check alone does not register a seat');

  await f.db.query('INSERT INTO book_cohort_members(cohort_id,member_id) VALUES($1,$2)', [f.circleId, f.reviewerId]);
  await regular.locator('#member-session-check').click();
  await regular.locator('#quest-salon-join').click();
  await status('You are the only member checked in.');
  const own = (await f.db.query('SELECT lease_id FROM circle_salon_presence WHERE member_id=$1', [f.authorId])).rows[0].lease_id;
  assert.equal((await send('author', probe)).status, 409);
  assert.equal((await send('outsider', { action: 'sync', leaseId: own })).status, 410);
  assert.equal((await send('outsider', { action: 'leave', leaseId: own })).status, 200);
  assert.equal(await seats(), 1);
  await trigger();
  await panel('2 members checked in, including you.');
  await heartbeat();
  await status('2 members checked in, including you.');
  const headsetLease = (await f.db.query('SELECT lease_id FROM circle_salon_presence WHERE member_id=$1', [f.reviewerId])).rows[0].lease_id;
  pass('An independent regular browser and simulated headset see the same two seats, with one seat per member and no cross-member control');

  assert.equal(browserRequests.some(entry => entry.action === 'archive'), false);
  const regularArchive = regular.locator('#circle-archive-messages');
  await regular.locator('#circle-archive-open').click();
  await regularArchive.getByText(/Independent visible reply remains readable/).waitFor();
  const beforeDiscussion = await xr.evaluate(() => window.questXrQa.stats().requests);
  const accountChecks = () => browserRequests.filter(entry => entry.actor === 'outsider' && entry.action === 'account').length;
  const archiveReads = actor => browserRequests.filter(entry => entry.actor === actor && entry.action === 'archive').length;
  const beforeAccountChecks = accountChecks();
  const receiptsBefore = await f.receiptCount();
  await panel('Read Circle discussion');
  await press('Read Circle discussion');
  await panel('Independent visible reply remains readable.');
  assert.ok(browserRequests.some(entry => entry.actor === 'outsider' && entry.action === 'archive' && entry.status === 200));
  await press('Write a post');
  await panel('Choose letters');
  await press('o');
  await panel('1 of 180');
  await press('k');
  await panel('2 of 180');
  const headsetDraftReads = archiveReads('outsider');
  assert.equal((await heartbeat(xr)).status(), 200);
  await panel('2 of 180');
  assert.equal(archiveReads('outsider'), headsetDraftReads);
  await press('Review');
  await panel('Review your post');
  assert.equal(await f.receiptCount(), receiptsBefore);
  await press('Post');
  await panel('Post confirmed');
  assert.equal(await f.receiptCount(), receiptsBefore + 1);
  await heartbeat();
  await regularArchive.getByText('ok', { exact: true }).waitFor();
  await press('Read recent discussion');
  await panel('Live discussion 1 of');
  const browserPost = 'Browser answer during the shared salon.';
  await regular.locator('#circle-thread-new').click();
  const browserDraft = regular.locator('#circle-thread-draft');
  await browserDraft.fill(browserPost);
  const browserDraftReads = archiveReads('author');
  await heartbeat();
  assert.equal(archiveReads('author'), browserDraftReads);
  assert.equal(await browserDraft.inputValue(), browserPost);
  await regular.locator('#circle-thread-review').click();
  await regular.locator('#circle-thread-preview-content').getByText(browserPost, { exact: true }).waitFor();
  await regular.locator('#circle-thread-confirm').check();
  await regular.locator('#circle-thread-post').click();
  await regular.locator('#circle-thread-saved').waitFor();
  assert.equal(await f.receiptCount(), receiptsBefore + 2);
  await heartbeat(xr);
  await panel(browserPost);
  pass('The latest discussion follows posts in both directions while members keep their drafts through check-ins');

  await press('Next preview');
  await panel('Recent discussion 2 of');
  const headsetOlderReads = archiveReads('outsider');
  await heartbeat(xr);
  await panel('Recent discussion 2 of');
  assert.equal(archiveReads('outsider'), headsetOlderReads);
  await press('Back to salon');
  await panel('2 members checked in, including you.');
  assert.equal(await xr.evaluate(() => window.questXrQa.stats().requests), beforeDiscussion);
  assert.ok(accountChecks() > beforeAccountChecks, 'Private requests recheck the same selected account');
  assert.equal(await xr.evaluate(() => window.questXrQa.panel().split('\n').includes('ok')), false);
  assert.deepEqual((await f.db.query('SELECT lease_id FROM circle_salon_presence WHERE member_id=$1',
    [f.reviewerId])).rows, [{ lease_id: headsetLease }]);
  assert.equal(await seats(), 2);
  pass('Reviewing older headset posts pauses discussion updates and returning to the salon retains the same seat');

  await press('Read selection');
  await panel('no current selection from a supported edition');
  assert.equal(browserRequests.some(entry => entry.action === 'passage'), false);
  await press('Back to salon');
  await panel('2 members checked in, including you.');
  pass('A starter week without a pinned edition offers the regular Circle and keeps the shared seat');

  await xr.evaluate(() => window.questXrQa.miss());
  await panel('2 members checked in, including you.');
  assert.equal(await seats(), 2);
  await press('Leave salon');
  await panel('You left the shared salon.');
  await heartbeat();
  await status('You are the only member checked in.');
  assert.equal(await seats(), 1);
  assert.equal((await send('outsider', { action: 'sync', leaseId: headsetLease })).status, 410);
  pass('An explicit headset leave removes its seat and the other browser observes the smaller count');

  await trigger();
  await panel('Read Circle discussion');
  await press('Read Circle discussion');
  await panel('Write a post');
  await press('Write a post');
  await panel('Choose letters');
  await press('z');
  await panel('1 of 180');
  await f.db.query('DELETE FROM book_cohort_members WHERE cohort_id=$1 AND member_id=$2', [f.circleId, f.reviewerId]);
  assert.equal((await heartbeat(xr)).status(), 404);
  await xr.waitForFunction(() => window.questXrQa.panel() === '' && window.questXrQa.stats().pendingFrames === 0);
  await xr.getByText('Your shared salon check-in ended. Open the room again to check access.', { exact: true }).waitFor();
  assert.equal(await f.receiptCount(), receiptsBefore + 2);
  pass('Removing the headset member closes the shared discussion on the next heartbeat and clears its private draft');
  await f.db.query('INSERT INTO book_cohort_members(cohort_id,member_id) VALUES($1,$2)', [f.circleId, f.reviewerId]);
  await openXR();
  await verifyXR();

  const gate = { reached: deferred(), release: deferred() };
  gates.add(gate.release);
  holdReserve = gate;
  await trigger();
  await panel('Checking current Circle membership');
  await bounded(gate.reached.promise, 'Held reservation');
  const headsetRequests = () => browserRequests.filter(request => request.actor === 'outsider').length;
  const beforeExit = headsetRequests();
  await xr.evaluate(() => window.questXrQa.visibility('visible-blurred'));
  await xr.waitForFunction(() => window.questXrQa.panel() === '' && window.questXrQa.stats().pendingFrames === 0);
  gate.release.resolve();
  await bounded(Promise.allSettled([...activeRoutes]), 'Retired requests');
  gates.delete(gate.release);
  await poll(xr);
  assert.equal(headsetRequests(), beforeExit);
  const abandoned = (await f.db.query('SELECT active FROM circle_salon_presence WHERE lease_id=$1', [gate.leaseId])).rows;
  assert.deepEqual(abandoned, [{ active: false }]);
  await heartbeat();
  await status('You are the only member checked in.');
  pass('Headset focus loss clears the screen and retires a late reservation without activating it');

  await f.db.query("UPDATE circle_salon_presence SET expires_at=clock_timestamp()-interval '1 second' WHERE lease_id=$1", [gate.leaseId]);
  await openXR();
  await verifyXR();
  await trigger();
  await panel('2 members checked in, including you.');
  await heartbeat();
  await status('2 members checked in, including you.');
  const beforeSwitch = headsetRequests();
  await xr.evaluate(() => window.questComposedQa.providerChanged());
  await xr.waitForFunction(() => window.questXrQa.panel() === '' && window.questXrQa.stats().pendingFrames === 0);
  await poll(xr);
  assert.equal(headsetRequests(), beforeSwitch);
  await f.db.query("UPDATE circle_salon_presence SET expires_at=clock_timestamp()-interval '1 second' WHERE member_id=$1", [f.reviewerId]);
  await heartbeat();
  await status('You are the only member checked in.');
  pass('Account changes clear the headset and stop polling, and an expired active seat is excluded from the live count');

  await regular.locator('#circle-archive-open').click();
  await regularArchive.getByText(browserPost, { exact: true }).waitFor();
  await f.db.query('DELETE FROM book_cohort_members WHERE cohort_id=$1 AND member_id=$2', [f.circleId, f.authorId]);
  assert.equal((await f.db.query('SELECT 1 FROM circle_salon_presence WHERE member_id=$1', [f.authorId])).rows.length, 0);
  await heartbeat();
  await status('available to current members');
  await regularArchive.getByText(browserPost, { exact: true }).waitFor({ state: 'detached' });
  assert.equal((await send('author', { action: 'sync', leaseId: own })).status, 404);
  pass('Membership removal deletes the browser seat, clears its open private archive and refuses a fresh update');

  const meetingStatus = 'The live meeting is unavailable for your current Circle access.';
  const openMeeting = page => page.getByRole('button', { name: 'Open live meeting', exact: true });
  await regular.locator('#member-session-check').click();
  await openMeeting(regular).click();
  await regular.getByText(meetingStatus, { exact: true }).waitFor();
  assert.equal(meetingNavigations, 0);
  pass('A fresh membership read refuses a live meeting after membership removal');

  const meetingPage = await client('outsider', true);
  assert.equal(await openMeeting(meetingPage).isDisabled(), true);
  assert.equal((await meetingPage.content()).includes(meetingUrl), false);
  const meetingPanel = text => meetingPage.waitForFunction(value => window.questXrQa.panel().replace(/\s+/g, ' ').includes(value), text);
  const meetingTrigger = () => meetingPage.evaluate(() => window.questXrQa.select());
  await meetingPage.locator('#quest-salon-headset').click();
  await meetingPanel('Press the controller trigger to check your signed-in account.');
  await meetingTrigger();
  await meetingPanel('Press the trigger to join the shared salon count.');
  await meetingTrigger();
  await meetingPanel('Meeting in browser');
  const checked = browserRequests.filter(request => request.action === 'meeting').length;
  await meetingPage.evaluate(() => window.questXrQa.press('Meeting in browser'));
  await meetingPage.waitForFunction(() => window.questXrQa.stats().ends === 1 && window.questXrQa.panel() === '');
  assert.equal(await openMeeting(meetingPage).isDisabled(), true);
  assert.equal(browserRequests.filter(request => request.action === 'meeting').length, checked);
  assert.equal(await seats(), 0);
  pass('The pointed headset handoff releases its seat and returns to browser controls requiring a fresh account check');

  await meetingPage.locator('#member-session-check').click();
  const detailGate = { reached: deferred(), release: deferred() };
  gates.add(detailGate.release);
  holdDetail = detailGate;
  await openMeeting(meetingPage).click();
  await bounded(detailGate.reached.promise, 'Authorized detail response');
  await meetingPage.evaluate(() => window.questXrQa.focus(false, false));
  detailGate.release.resolve();
  await bounded(Promise.allSettled([...activeRoutes]), 'Retired meeting response');
  gates.delete(detailGate.release);
  await openMeeting(meetingPage).waitFor();
  await meetingPage.waitForFunction(() => document.getElementById('quest-meeting-status').textContent.includes('Check your member session'));
  assert.equal(await openMeeting(meetingPage).isDisabled(), true);
  assert.equal(meetingNavigations, 0);
  await meetingPage.evaluate(() => window.questXrQa.focus(false));
  await meetingPage.evaluate(() => window.questXrQa.focus(true));
  await meetingPage.locator('#member-session-check').click();
  await openMeeting(meetingPage).click();
  await meetingPage.getByRole('heading', { name: 'Synthetic live meeting', exact: true }).waitFor();
  assert.equal(meetingNavigations, 1);
  await meetingPage.goBack();
  const reconnect = meetingPage.getByRole('button', { name: 'Connect signed-in account', exact: true });
  await reconnect.waitFor();
  assert.equal(await openMeeting(meetingPage).isDisabled(), true);
  await reconnect.click();
  await meetingPage.getByText('Account connection opened. Check the member-session and Circle-access messages below.', { exact: true }).waitFor();
  await meetingPage.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await reconnect.waitFor();
  pass('Focus loss retires a held link. A fresh check opens the host URL without credentials or referrer and Back requires reconnection');

  const source = JSON.parse(await readFile(resolve(root, 'content/great-books/apology/passages.json')));
  const program = { version: 1, bookId: source.bookId, editionId: source.editionId,
    sessions: [{ from: 13, to: 15 }, { from: 16, to: 17 }] };
  const { circleId: readingCircleId } = await rpc(f.db, 'soe_circle_create', [f.authorId, randomUUID(), await creationInput(f.db, {
    title: 'A synthetic Apology salon', format: 'online', venueType: 'online', venueName: null, city: null, region: null,
    onlineUrl: meetingUrl, readingProgram: program,
  })]);
  await participate(f.db, 'join', { actor: f.reviewerId, circle: readingCircleId });
  const readingPage = await client('outsider', true, { circleId: readingCircleId });
  const readingPress = (page, label) => page.evaluate(value => window.questXrQa.press(value), label);
  const readingPanel = (page, text) => page.waitForFunction(value => window.questXrQa.panel().replace(/\s+/g, ' ').includes(value), text);
  const readRequests = () => browserRequests.filter(value => value.action === 'reading-detail' || value.action === 'passage');
  const requestedBlocks = () => readRequests().filter(value => value.action === 'passage').map(value => value.block);
  const readingTrigger = page => page.evaluate(() => window.questXrQa.select());
  await readingPage.locator('#quest-salon-headset').click();
  await readingPanel(readingPage, 'check your signed-in account');
  await readingTrigger(readingPage);
  await readingPanel(readingPage, 'join the shared salon count');
  await readingTrigger(readingPage);
  await readingPanel(readingPage, 'Read selection');
  assert.deepEqual(readRequests(), []);
  const seat = () => f.db.query('SELECT lease_id FROM circle_salon_presence WHERE cohort_id=$1 AND member_id=$2', [readingCircleId, f.reviewerId])
    .then(value => value.rows[0]?.lease_id);
  const readingSeat = await seat();
  assert.ok(readingSeat);
  await readingPress(readingPage, 'Read selection');
  await readingPanel(readingPage, 'source block contains a table');
  await readingPanel(readingPage, 'Block 1 of 3');
  assert.deepEqual(readRequests().map(value => [value.action, value.status]), [['reading-detail', 200], ['passage', 200]]);
  assert.deepEqual(requestedBlocks(), [13]);
  await readingPress(readingPage, 'Next block');
  await readingPanel(readingPage, 'INTRODUCTION.');
  await readingPress(readingPage, 'Source info');
  await readingPanel(readingPage, 'Benjamin Jowett');
  await readingPanel(readingPage, 'Rights elsewhere are unassessed.');
  await readingPress(readingPage, 'Back to text');
  await readingPanel(readingPage, 'INTRODUCTION.');
  await readingPress(readingPage, 'Next block');
  await readingPanel(readingPage, 'Block 3 of 3');
  await readingPanel(readingPage, 'In what relation the “Apology” of Plato stands');
  const panelImage = await readingPage.evaluate(() => window.questXrQa.image());
  assert.match(panelImage, /^data:image\/png;base64,/);
  const screenshot = 'platforms/evidence/quest-reading-' + run + '.png';
  const panelBytes = Buffer.from(panelImage.split(',')[1], 'base64');
  await writeFile(resolve(root, screenshot), panelBytes, { flag: 'wx' });
  receipt.readingPanel = { path: screenshot, sha256: sha(panelBytes) };
  const paragraph = [];
  for (let index = 0; index < 30; index++) {
    const frame = await readingPage.evaluate(() => ({ lines: window.questXrQa.panel().split('\n'), labels: window.questXrQa.labels() }));
    const end = frame.lines.findIndex((line, index) => index > 1 && frame.labels.includes(line));
    assert.ok(end > 2);
    paragraph.push(...frame.lines.slice(2, end));
    assert.equal(frame.labels.includes('Next block'), false);
    if (!frame.labels.includes('Next page')) break;
    await readingPress(readingPage, 'Next page');
    await readingPanel(readingPage, `Page ${index + 2} of`);
  }
  assert.equal(paragraph.join('').replace(/\s+/g, ' ').trim(), source.blocks[15].text.replace(/\s+/g, ' ').trim());
  assert.deepEqual(requestedBlocks(), [13, 14, 15]);
  pass('The headset opens the exact current assignment without credentials on passage requests, shows a table in place, and pages through all text with edition credits');

  const readingHeartbeat = () => Promise.all([readingPage.waitForResponse(response => new URL(response.url()).pathname
    === '/api/circles/' + readingCircleId + '/salon-presence' && response.request().postDataJSON()?.action === 'sync'), poll(readingPage)]);
  assert.equal((await readingHeartbeat())[0].status(), 200);
  assert.equal(await seat(), readingSeat);
  await readingPress(readingPage, 'Back to salon');
  await readingPanel(readingPage, 'only member checked in');
  assert.equal(await seat(), readingSeat);
  await readingPress(readingPage, 'Read selection');
  await readingPanel(readingPage, 'Block 1 of 3');
  await f.db.query('DELETE FROM book_cohort_members WHERE cohort_id=$1 AND member_id=$2', [readingCircleId, f.reviewerId]);
  assert.equal((await readingHeartbeat())[0].status(), 404);
  await readingPage.waitForFunction(() => window.questXrQa.panel() === '' && window.questXrQa.stats().pendingFrames === 0);
  pass('Shared check-in renews while reading and survives Back. Membership removal clears the headset reading and seat');

  const standalone = await client('author', true, { circleId: readingCircleId, salon: false });
  await standalone.locator('#quest-immersive-enter').click();
  await readingPanel(standalone, 'check your signed-in account');
  await readingTrigger(standalone);
  await readingPanel(standalone, 'load recent discussion');
  await readingTrigger(standalone);
  await readingPanel(standalone, 'Read selection');
  corruptPassage = true;
  await readingPress(standalone, 'Read selection');
  await readingPanel(standalone, 'Source block unavailable');
  await readingPress(standalone, 'Retry block');
  await readingPanel(standalone, 'Block 1 of 3');
  assert.deepEqual(requestedBlocks().slice(-2), [13, 13]);
  await f.db.query("UPDATE book_cohorts SET start_date=start_date-interval '7 days' WHERE id=$1", [readingCircleId]);
  const beforeChangedAssignment = requestedBlocks().length;
  await readingPress(standalone, 'Next block');
  await readingPanel(standalone, 'The selection changed');
  assert.equal(requestedBlocks().length, beforeChangedAssignment);
  await readingPress(standalone, 'Back to discussion');
  await readingPanel(standalone, 'Read selection');
  pass('Standalone reading refuses mismatched source coordinates, retries the same block, and asks the member to reopen a changed assignment');

  const passageGate = { reached: deferred(), release: deferred() };
  gates.add(passageGate.release);
  holdPassage = passageGate;
  await readingPress(standalone, 'Read selection');
  await bounded(passageGate.reached.promise, 'Held verified source');
  assert.equal(requestedBlocks().at(-1), 16);
  await standalone.evaluate(() => window.questXrQa.visibility('visible-blurred'));
  await standalone.waitForFunction(() => window.questXrQa.panel() === '' && window.questXrQa.stats().pendingFrames === 0);
  passageGate.release.resolve();
  await bounded(Promise.allSettled([...activeRoutes]), 'Retired passage response');
  gates.delete(passageGate.release);
  assert.equal(await standalone.evaluate(() => window.questXrQa.panel()), '');
  pass('A verified source response released after headset focus loss cannot repopulate the cleared panel');

  await f.db.query('UPDATE book_cohorts SET circle_hidden=true WHERE id=$1', [f.circleId]);
  assert.equal((await send('outsider', probe)).status, 404);
  await f.db.query('UPDATE book_cohorts SET circle_hidden=false, status=\'completed\' WHERE id=$1', [f.circleId]);
  assert.equal((await send('outsider', probe)).status, 404);
  await meetingPage.evaluate(() => window.questComposedQa.actor('outsider'));
  await reconnect.click();
  await meetingPage.getByText('Account connection opened. Check the member-session and Circle-access messages below.', { exact: true }).waitFor();
  await meetingPage.locator('#member-session-check').click();
  await openMeeting(meetingPage).click();
  await meetingPage.getByText(meetingStatus, { exact: true }).waitFor();
  assert.equal(meetingNavigations, 1);
  const membersBefore = (await f.db.query('SELECT count(*)::int AS n FROM book_cohort_members')).rows;
  await runSql(f.db, 'docs/sql/circle-salon-presence-rollback.sql');
  assert.deepEqual((await f.db.query('SELECT count(*)::int AS n FROM book_cohort_members')).rows, membersBefore);
  assert.equal((await send('outsider', probe)).status, 503);
  pass('Hidden and completed Circles refuse check-in, a completed Circle refuses meeting handoff, and rollback preserves membership');
  await verifyHashes();
} catch (error) {
  failure = error;
} finally {
  for (const gate of gates) gate.resolve();
  try { if (browser) { await bounded(browser.close(), 'Browser cleanup'); cleanup.browser = true; } } catch (error) { failure ??= error; }
  try { await bounded(Promise.allSettled([...activeRoutes]), 'Request cleanup'); if (db) { await bounded(db.close(), 'Database cleanup'); cleanup.database = true; } }
  catch (error) { failure ??= error; }
  if (errors.length) failure ??= Error(errors.join('\n'));
  Object.assign(receipt, { status: failure ? 'FAIL' : 'PASS', failure: failure?.stack, finishedAt: new Date().toISOString() });
  await writeFile(evidence, JSON.stringify(receipt, null, 2) + '\n');
}
if (failure) throw failure;
console.log('PASS shared salon composition. Owned browser and database closed.');
