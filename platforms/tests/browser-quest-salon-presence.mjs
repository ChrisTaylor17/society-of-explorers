// Two isolated browser contexts exercise the actual app, handler and disposable Circle schema.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { asRole, runSql } from '../../verification/web/tests/support/circle-live-db.mjs';
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
  'docs/sql/circle-salon-presence-apply.sql', 'docs/sql/circle-salon-presence-rollback.sql',
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
  const { questMemberApp, QUEST_ORIGIN: origin, TOKENS } = await import('../../verification/web/tests/support/quest-member-app.mjs');
  const f = db = await questMemberApp({ sharedSalon: true });
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
  let holdReserve = null;
  async function client(actor, headset = false) {
    const context = await browser.newContext({ viewport: { width: 375, height: 844 }, serviceWorkers: 'block' });
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
        assert.equal(url.origin, origin);
        if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body:
          `<!doctype html><html lang="en" data-circle="${f.circleId}" data-shared-salon><head><link rel="stylesheet" href="/page.css"></head><body><div id="root"></div><script type="module" src="/page.mjs"></script></body></html>` });
        if (url.pathname === '/page.mjs') return route.fulfill({ contentType: 'text/javascript', body: bundle });
        if (url.pathname === '/page.css') return route.fulfill({ contentType: 'text/css', body: css });
        const actual = await request.allHeaders();
        const account = { actor, provider: 'supabase' };
        const memberCheck = url.pathname === '/api/auth/member';
        assert.equal(url.search, '');
        assert.equal(memberCheck ? request.method() === 'GET' : url.pathname === endpoint && request.method() === 'POST', true);
        assert.equal(actual.authorization, memberCheck ? undefined : 'Bearer ' + TOKENS[actor]);
        const body = memberCheck ? undefined : request.postData();
        const input = memberCheck ? null : JSON.parse(body);
        if (input) assert.deepEqual(Object.keys(input).sort(), ['action', 'leaseId']);
        const response = await f.dispatch(url.pathname, actual, undefined, { body, account });
        assert.match(response.headers.get('cache-control'), /private.*no-store/);
        const bytes = await response.text(), value = JSON.parse(bytes);
        if (input && response.ok) assert.deepEqual(Object.keys(value).sort(), input.action === 'sync' ? ['count', 'state'] : ['state']);
        browserRequests.push({ actor, action: input?.action ?? 'account', status: response.status, count: value.count ?? null });
        if (input?.action === 'reserve' && holdReserve) {
          const gate = holdReserve;
          holdReserve = null;
          gate.leaseId = input.leaseId;
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
  const heartbeat = async () => {
    await Promise.all([regular.waitForResponse(response => new URL(response.url()).pathname === endpoint
      && response.request().postDataJSON()?.action === 'sync'), poll(regular)]);
  };
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

  await trigger();
  await panel('You left the shared salon.');
  await heartbeat();
  await status('You are the only member checked in.');
  assert.equal(await seats(), 1);
  assert.equal((await send('outsider', { action: 'sync', leaseId: headsetLease })).status, 410);
  pass('An explicit headset leave removes its seat and the other browser observes the smaller count');

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

  await f.db.query('DELETE FROM book_cohort_members WHERE cohort_id=$1 AND member_id=$2', [f.circleId, f.authorId]);
  assert.equal((await f.db.query('SELECT 1 FROM circle_salon_presence WHERE member_id=$1', [f.authorId])).rows.length, 0);
  await heartbeat();
  await status('available to current members');
  assert.equal((await send('author', { action: 'sync', leaseId: own })).status, 404);
  pass('Membership removal cascades to the owned seat and refuses a fresh update');

  await f.db.query('UPDATE book_cohorts SET circle_hidden=true WHERE id=$1', [f.circleId]);
  assert.equal((await send('outsider', probe)).status, 404);
  await f.db.query('UPDATE book_cohorts SET circle_hidden=false, status=\'completed\' WHERE id=$1', [f.circleId]);
  assert.equal((await send('outsider', probe)).status, 404);
  const membersBefore = (await f.db.query('SELECT count(*)::int AS n FROM book_cohort_members')).rows;
  await runSql(f.db, 'docs/sql/circle-salon-presence-rollback.sql');
  assert.deepEqual((await f.db.query('SELECT count(*)::int AS n FROM book_cohort_members')).rows, membersBefore);
  assert.equal((await send('outsider', probe)).status, 503);
  pass('Hidden and completed Circles refuse check-in, and the rollback preserves existing membership data');
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
