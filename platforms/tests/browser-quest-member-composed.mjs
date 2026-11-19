// Actual Quest component -> actual member/discussion handlers -> strict SQL.
// Synthetic identity/SDK verification and local HTTPS fulfillment only.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { installQuestXrDouble } from './quest-xr-browser-double.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)), WEB = path.join(ROOT, 'verification/web');
const [run, ...extra] = process.argv.slice(2);
assert(!extra.length && (!run || /^immersive-[a-z0-9-]{1,24}$/.test(run)), 'Use a fresh immersive evidence run name');
const evidence = path.join(ROOT, 'platforms/evidence/quest-member-composed' + (run ? '-' + run : ''));
const output = evidence + '.json';
const fixture = 'platforms/evidence/quest-member-composed-fixture' + (run ? '-' + run : '');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function read(name) { const file = path.isAbsolute(name) ? name : path.join(ROOT, name), stat = fs.statSync(file); assert.ok(stat.blocks, 'Refuse offloaded file: ' + name); return fs.readFileSync(file); }
async function bounded(work, ms = 5000, label = 'Owned operation') { let timer; try { return await Promise.race([Promise.resolve().then(work), new Promise((_, reject) => { timer = setTimeout(() => reject(Error(label + ' timed out')), ms); })]); } finally { clearTimeout(timer); } }
const gate = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const stories = [], api = [], pageErrors = [], consoleErrors = [], unexpected = [], routeErrors = [], retiredRoutes = [];
const cleanup = { browser: 'pending', database: 'pending' }, pending = new Set(), controllers = new Map(), releases = new Set();
const startedAt = new Date().toISOString(), executablePath = process.env.SOE_BROWSER_EXECUTABLE;
const priorReceipt = fs.existsSync(output) ? (() => { const bytes = read(output); return { sha256: sha(bytes), receipt: JSON.parse(bytes) }; })() : null;
let browser, ownedBrowserPid, f, failure = null, bundle, css, sourceHashes = {}, sqlHashes = {}, limits = {}, runtime = {}, latest = null;
let holdNext = false, held = null;
let holdPreview = false, dropPost = false, latestPreview, latestReceipt;
const report = status => ({ version: 1, status, startedAt, finishedAt: new Date().toISOString(), stories, api, pageErrors, consoleErrors, unexpected, routeErrors, retiredRoutes,
  cleanup, runtime, sourceHashes, sqlHashes, bundleSHA256: bundle ? sha(bundle) : null, cssSHA256: css ? sha(css) : null, limits, failure, priorReceipt,
  scope: 'Actual QuestCircle, auth bridge, host, handlers and strict SQL over intercepted HTTPS. Synthetic identity, credentials, delivery and device input. ' +
    (run ? 'The headset event/frame double drives real Chromium canvas text, shaders, texture uploads and draw calls. Physical headset, provider and hosted acceptance remain open.' : 'Regular browser view only.') });
const write = status => { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report(status), null, 2) + '\n'); };
const pass = name => { stories.push(name); write('RUNNING'); console.log('PASS ' + stories.length + ': ' + name); };
function cleanErrors() { assert.deepEqual(pageErrors, []); assert.deepEqual(consoleErrors, []); assert.deepEqual(unexpected, []); assert.deepEqual(routeErrors, []); }
function ownedChrome() { return execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' }).split('\n').map(line => line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/)).filter(m => m && Number(m[2]) === process.pid && m[3].startsWith(executablePath + ' ')).map(m => Number(m[1])); }
function signalOwnedChrome(signal) { if (!ownedBrowserPid || !ownedChrome().includes(ownedBrowserPid)) return; const group = Number(execFileSync('/bin/ps', ['-p', String(ownedBrowserPid), '-o', 'pgid='], { encoding: 'utf8' }).trim()); process.kill(group === ownedBrowserPid ? -ownedBrowserPid : ownedBrowserPid, signal); }
write('RUNNING');
try {
  process.chdir(WEB);
  assert.ok(process.execArgv.some(value => value.endsWith('/deny-build-network.cjs')), 'Startup deny guard required');
  assert.ok(process.env.SOE_PLAYWRIGHT_PACKAGE && executablePath, 'Explicit cached runtimes required');
  read(executablePath); read(path.join(process.env.SOE_PLAYWRIGHT_PACKAGE, 'package.json'));
  const require = createRequire(path.join(process.env.SOE_PLAYWRIGHT_PACKAGE, 'package.json'));
  const manifest = JSON.parse(read(fixture + '/source-manifest.json'));
  sourceHashes = { ...manifest.sourceHashes };
  const files = ['platforms/tests/bundle-quest-member-composed.mjs', 'platforms/tests/browser-quest-member-composed.mjs', 'platforms/tests/quest-xr-browser-double.mjs',
    'verification/web/tests/support/quest-member-app.mjs', 'verification/web/tests/support/offline-app.mjs', 'tests/security/fakes.ts',
    'app/api/auth/member/route.ts', 'lib/auth/memberDto.ts', 'lib/auth/provider.ts', 'lib/http/routeError.ts',
    'app/api/circles/[circleId]/discussion/route.ts', 'app/api/circles/[circleId]/discussion/preview/route.ts', 'lib/circles/thread-server.ts', 'lib/circles/thread.ts', 'lib/circles/moderation-server.ts',
    'lib/rateLimit.ts'];
  for (const file of files) sourceHashes[file] = sha(read(file));
  for (const [file, digest] of Object.entries(sourceHashes)) assert.equal(sha(read(file)), digest, 'Changed bundle source: ' + file);
  bundle = read(fixture + '/page.js'); css = read(fixture + '/page.css');
  const fixtureApp = await import('../../verification/web/tests/support/quest-member-app.mjs');
  for (const [file, digest] of Object.entries(await fixtureApp.questMemberAppHashes())) (file.endsWith('.sql') ? sqlHashes : sourceHashes)[file] = digest;
  limits = fixtureApp.COVERAGE_FIXTURE_LIMITS; f = await fixtureApp.questMemberApp({ writing: Boolean(run) });
  const origin = fixtureApp.QUEST_ORIGIN;
  browser = await require('playwright').chromium.launch({ headless: true, timeout: 15000, executablePath,
    env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' }, args: ['--disable-background-networking', '--disable-component-update', '--no-first-run',
      '--host-resolver-rules=MAP * ~NOTFOUND', ...(run ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [])] });
  const pids = ownedChrome(); assert.equal(pids.length, 1); ownedBrowserPid = pids[0];
  runtime = { node: process.version, chromium: browser.version(), bun: manifest.bunVersion, startupDeny: true, cleanEnvironment: true, ownedBrowserPid };
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } }), page = await context.newPage(); page.setDefaultTimeout(7000);
  if (run) await context.addInitScript(installQuestXrDouble);
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('Failed to load resource:')) consoleErrors.push(message.text()); });
  page.on('requestfailed', request => controllers.get(request)?.abort());
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()); let controller;
    try {
      if (url.origin !== origin) { unexpected.push(url.origin + url.pathname); return await route.abort(); }
      if (url.pathname === '/') return await route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="en" data-circle="${f.circleId}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/page.css"></head><body style="margin:0;background:#101d1a"><div id="root"></div><script type="module" src="/page.mjs"></script></body></html>` });
      if (url.pathname === '/page.mjs') return await route.fulfill({ contentType: 'text/javascript', body: bundle });
      if (url.pathname === '/page.css') return await route.fulfill({ contentType: 'text/css', body: css });
      const method = request.method(), endpoint = `/api/circles/${f.circleId}/discussion`;
      const isPost = method === 'POST' && url.pathname === endpoint, isPreview = method === 'POST' && url.pathname === endpoint + '/preview';
      assert.ok(method === 'GET' || run && (isPost || isPreview));
      const headers = await request.allHeaders();
      assert.match(headers.cookie ?? '', /^soe_auth_intent=[0-9a-f-]{36}$/);
      assert.equal(headers['x-soe-auth-intent'], headers.cookie.slice('soe_auth_intent='.length));
      assert.equal(headers.referer, undefined);
      if (url.pathname === '/api/auth/member') { assert.equal(method, 'GET'); assert.equal(headers.authorization, undefined); }
      else { assert.ok(url.pathname === endpoint || isPreview); assert.ok(Object.values(fixtureApp.TOKENS).some(value => headers.authorization === 'Bearer ' + value)); }
      if (method === 'POST') assert.equal(headers.origin, origin);
      controller = new AbortController(); controllers.set(request, controller);
      const entry = { method, path: url.pathname, queryKeys: [...url.searchParams.keys()].sort(), status: null, delivered: false, kind: null, itemCount: null }; api.push(entry);
      const work = (async () => {
        const response = await f.dispatch(url.pathname + url.search, headers, controller.signal, { body: request.postData() ?? undefined });
        assert.match(response.headers.get('cache-control'), /private.*no-store/); entry.status = response.status;
        const bytes = await response.text(), value = JSON.parse(bytes); entry.kind = value.kind ?? 'member'; entry.itemCount = value.items?.length ?? null;
        if (value.items) {
          latest = value;
          assert.doesNotMatch(bytes, /WITHDRAWN_REPLY_TEXT_MUST_NOT_LEAVE_SQL|Synthetic disagreement|contentHash|reporter|email|supabase_auth_id/);
          for (const item of [...value.items, ...(value.root ? [value.root, value.focus] : [])]) {
            assert.deepEqual(Object.keys(item).sort(), ['id', 'member_name', 'content', 'created_at', 'is_mine', 'visibility', 'parentMessageId', 'rootMessageId', 'publicProfileId'].sort());
            assert.equal(item.publicProfileId, null);
            if (['hidden', 'withdrawn'].includes(item.visibility)) assert.equal(item.content, null);
          }
        }
        if (isPreview && response.status === 200) latestPreview = value;
        if (isPost && response.status === 200) latestReceipt = value;
        if (isPost && dropPost) {
          dropPost = false; entry.droppedAfterHandler = true;
          await route.abort('failed'); return;
        }
        if (holdNext && value.items) { holdNext = false; held = gate(); releases.add(held.resolve); await held.promise; releases.delete(held.resolve); }
        if (holdPreview && isPreview) { holdPreview = false; held = gate(); releases.add(held.resolve); await held.promise; releases.delete(held.resolve); }
        await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: bytes }); entry.delivered = true;
      })();
      pending.add(work); try { await work; } finally { pending.delete(work); controllers.delete(request); }
    } catch (error) {
      if (controller?.signal.aborted || /aborted|cancelled|Target.*closed|route.*handled/i.test(String(error))) retiredRoutes.push({ path: url.pathname, reason: 'Browser request retired' });
      else routeErrors.push(error.stack || String(error));
      try { await route.abort(); } catch {} controllers.delete(request);
    }
  });
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const count = () => page.evaluate(() => window.questComposedQa.counts());
  const privateCalls = () => f.calls.length;
  const connect = async () => { await page.getByRole('button', { name: 'Connect signed-in account', exact: true }).click(); await page.waitForFunction(() => !document.getElementById('member-session-check').disabled); };
  const check = async () => { await page.locator('#member-session-check').click(); };
  const ready = () => page.waitForFunction(() => !document.getElementById('circle-archive-open').disabled);
  async function reset(actor = 'author', provider = 'supabase', sdkActor = actor) {
    await page.evaluate(() => window.questComposedQa.providerChanged()); f.select(actor, provider);
    await page.evaluate(value => window.questComposedQa.actor(value), sdkActor); await settle();
    await connect(); await check();
  }
  await page.goto(origin); await page.bringToFront(); await page.getByRole('button', { name: 'Connect signed-in account', exact: true }).waitFor(); await settle();
  assert.deepEqual(await count(), { factories: 0, calls: 0, subscriptions: 0 }); assert.equal(api.length, 0); assert.equal(privateCalls(), 0);
  await connect(); assert.deepEqual(await count(), { factories: 1, calls: 0, subscriptions: 0 }); assert.equal(api.length, 0);
  await check(); await ready(); assert.equal(api.length, 1); assert.equal(api[0].path, '/api/auth/member'); assert.equal(privateCalls(), 0);
  pass('mount and Connect perform no provider method/private request; manual Check executes the actual cookie-only member handler without a Circle RPC');

  const sdkCalls = (await count()).calls;
  await reset('author', 'wallet', 'outsider'); await ready();
  assert.equal((await count()).calls, sdkCalls);
  assert.equal(privateCalls(), 0);
  pass('wallet member metadata connects without using a retained SDK identity or reading the Circle');
  await reset('outsider', 'supabase', 'author');
  await page.waitForFunction(() => document.getElementById('member-session-status').textContent.includes('Could not confirm'));
  assert.equal(await page.locator('#circle-archive-open').isDisabled(), true); assert.equal(privateCalls(), 0);
  pass('a verified browser member and a different retained SDK subject stop before any private RPC');

  await reset('outsider'); await ready(); await page.locator('#circle-archive-open').click();
  await bounded(async () => { while (!api.some(entry => entry.status === 403)) await new Promise(resolve => setImmediate(resolve)); }); await settle();
  assert.equal(f.calls.at(-1).status, 'PT403'); assert.equal(await page.locator('#circle-archive-messages article').count(), 0);
  pass('a matching verified synthetic subject with a reviewer grant but no membership is denied by actual service-role discussion SQL');

  await reset(); await ready(); await page.locator('#circle-archive-open').click();
  const seen = []; let pages = 0;
  for (;;) {
    await page.waitForFunction(() => document.getElementById('circle-archive-status').textContent.includes('Current archive page loaded'));
    assert.equal(latest.kind, 'archive'); assert.equal(await page.locator('#circle-archive-messages article').count(), latest.items.length);
    assert.equal(await page.locator('#circle-read-status').textContent(), '', 'Flat conversation retirement status must not contradict a loaded archive');
    seen.push(...latest.items.map(item => item.id)); pages++;
    if (!latest.nextCursor) break;
    assert.equal(latest.items.length, 25); await page.locator('#circle-archive-next').click();
  }
  assert.equal(pages, 5); assert.deepEqual(seen, f.expectedArchiveIds); assert.equal(new Set(seen).size, 108);
  pass('actual archive handler/parser and SQL keyset traverse all 108 tied/synthetic contributions across five bounded pages without the legacy 100 cutoff');

  await page.locator('#circle-archive-open').click(); await page.waitForFunction(() => document.getElementById('circle-archive-status').textContent.includes('Current archive page loaded'));
  const rootCard = page.locator('#circle-archive-messages article').filter({ hasText: 'This contribution is restricted by moderation.' });
  await rootCard.getByRole('button', { name: 'Open thread', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('circle-archive-status').textContent.includes('Current thread loaded'));
  assert.equal(latest.kind, 'thread'); assert.equal(latest.root.id, f.root); assert.equal(latest.root.visibility, 'hidden'); assert.equal(latest.root.content, null);
  assert.equal(await page.locator('#circle-read-status').textContent(), '', 'Thread status owns the open archive view');
  assert.equal(latest.items.find(item => item.id === f.replies[1]).visibility, 'withdrawn');
  await page.getByText('Independent visible reply remains readable.', { exact: false }).waitFor();
  await page.getByText('This contribution was withdrawn.', { exact: true }).waitFor();
  assert.doesNotMatch(await page.locator('body').innerText(), /WITHDRAWN_REPLY_TEXT_MUST_NOT_LEAVE_SQL|Synthetic disagreement/);
  assert.equal(await page.locator('#circle-archive-messages article').count(), 3);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  for (const button of await page.locator('#circle-archive-messages button').all()) assert.ok((await button.boundingBox()).height >= 44);
  await page.screenshot({ path: evidence + '-320.png', fullPage: true });
  pass('actual author withdrawal and human restriction render thread tombstones while an independent visible reply remains readable; 320px layout and thread controls hold');

  const beforeAccountChange = api.length;
  const cleared = await page.evaluate(() => { window.questComposedQa.providerChanged(); return document.getElementById('circle-archive-messages').textContent === '' && document.getElementById('circle-draft').value === ''; });
  assert.equal(cleared, true); await settle(); assert.equal(api.length, beforeAccountChange); assert.equal((await count()).subscriptions, 0);
  pass('the actual shared provider-selection event synchronously clears private thread DOM and subscription without automatically checking or fetching');

  for (const event of ['provider', 'SIGNED_OUT']) {
    await reset(); await ready(); holdNext = true; held = null;
    await page.locator('#circle-archive-open').click({ noWaitAfter: true });
    await bounded(async () => { while (!held) await new Promise(resolve => setImmediate(resolve)); });
    const beforeRetirement = api.length;
    if (event === 'provider') await page.evaluate(() => window.questComposedQa.providerChanged());
    else await page.evaluate(() => window.questComposedQa.emit('SIGNED_OUT'));
    assert.equal(await page.locator('#circle-archive-messages').innerText(), '');
    held.resolve(); await bounded(() => Promise.allSettled([...pending])); await settle();
    assert.equal(api.length, beforeRetirement); assert.equal(await page.locator('#circle-archive-messages article').count(), 0);
    assert.doesNotMatch(await page.locator('body').innerText(), /Synthetic archived contribution|Independent visible reply/);
  }
  pass('held responses already produced by real SQL cannot restore archive data or trigger automatic requests after provider-change or SDK logout retirement');

  if (run) {
    const enter = page.locator('#quest-immersive-enter'), exit = page.locator('#quest-immersive-exit');
    const device = () => page.evaluate(() => window.questXrQa.stats());
    const trigger = () => page.evaluate(() => window.questXrQa.select());
    const see = text => page.waitForFunction(value => window.questXrQa.panel().replace(/\s+/g, ' ').includes(value), text);
    const labels = () => page.evaluate(() => window.questXrQa.labels());
    async function capturePanel(name) {
      const data = await page.evaluate(() => window.questXrQa.image());
      assert.match(data, /^data:image\/png;base64,/);
      fs.writeFileSync(evidence + '-' + name + '.png', Buffer.from(data.split(',')[1], 'base64'), { flag: 'wx' });
    }
    async function press(label, backwards = false) {
      await page.waitForFunction(value => window.questXrQa.labels().includes(value), label);
      await page.evaluate(([value, reversed]) => window.questXrQa.press(value, reversed), [label, backwards]);
      await settle();
    }
    const posts = () => api.filter(entry => entry.method === 'POST' && entry.path.endsWith('/discussion'));
    assert.equal(await enter.isDisabled(), true);
    assert.equal((await device()).requests, 0);
    pass('the unsupported headset state preserves the verified browser archive and never requests device permission');

    async function rebind(actor = 'author', provider = 'supabase', sdkActor = actor) {
      f.select(actor, provider);
      await page.evaluate(value => {
        window.questXrQa.enable();
        window.questComposedQa.providerChanged();
        window.questComposedQa.actor(value);
      }, sdkActor);
      await connect();
      await page.waitForFunction(() => !document.getElementById('quest-immersive-enter').disabled);
    }
    async function openRoom() {
      const before = api.length, sdk = await count();
      await enter.click();
      await see('Press the controller trigger to check your signed-in account.');
      assert.equal(api.length, before);
      assert.deepEqual(await count(), sdk);
      assert.equal((await device()).activations.at(-1), true);
      assert.equal(await page.locator('#member-session-check').isDisabled(), true);
    }
    async function checkInRoom() {
      const before = api.length, queries = privateCalls();
      await trigger();
      await see('Press the trigger to check Circle access and load recent discussion.');
      assert.deepEqual(api.slice(before).map(item => item.path), ['/api/auth/member']);
      assert.equal(privateCalls(), queries);
    }
    await rebind(); await check(); await ready();
    await page.locator('#circle-archive-open').click();
    await page.waitForFunction(() => document.getElementById('circle-archive-messages').children.length > 0);
    await openRoom();
    assert.equal(await page.locator('#circle-archive-messages').innerText(), '');
    await page.evaluate(() => window.questXrQa.focus(false));
    await checkInRoom();
    const readBefore = privateCalls();
    await trigger();
    await see('Independent visible reply remains readable.');
    assert.equal(privateCalls(), readBefore + 1);
    assert.equal(await page.locator('#circle-archive-messages').innerText(), '');
    assert.doesNotMatch(await page.evaluate(() => window.questXrQa.panel()), /\/circles\/|In reply to message:/);
    await capturePanel('panel');
    assert.ok((await device()).draws > 0);
    assert.deepEqual((await device()).errors, []);
    pass('trusted Enter clears the regular archive. Two controller actions verify the account and read authorized discussion into actual WebGL while the regular window is blurred');

    const beforeAdvance = api.length;
    await trigger();
    await see('Recent discussion 2 of 5');
    const words = await page.evaluate(() => window.questXrQa.panel());
    assert.doesNotMatch(words, /WITHDRAWN_REPLY_TEXT_MUST_NOT_LEAVE_SQL|Synthetic disagreement/);
    assert.equal(api.length, beforeAdvance);
    const beforeHide = await device();
    await page.evaluate(() => window.questXrQa.visibility('visible-blurred'));
    assert.equal(await page.evaluate(() => window.questXrQa.panel()), '');
    assert.equal((await device()).ends, beforeHide.ends + 1);
    assert.equal((await device()).releases, beforeHide.releases + 1);
    assert.equal((await device()).pendingFrames, 0);
    await page.evaluate(() => { window.questXrQa.focus(true); window.questXrQa.select(); }); await settle();
    assert.equal(api.length, beforeAdvance);
    assert.equal(await page.locator('#circle-archive-open').isDisabled(), true);
    pass('the controller pages through the bounded preview locally. Headset system focus loss blanks the texture, releases it and requires new access');

    await rebind('outsider'); await openRoom(); await checkInRoom();
    await trigger(); await see('Current Circle discussion is unavailable.');
    assert.equal(f.calls.at(-1).status, 'PT403');
    assert.doesNotMatch(await page.evaluate(() => window.questXrQa.panel()), /Synthetic archived contribution|Independent visible reply/);
    assert.deepEqual(await labels(), []);
    await exit.click(); await page.waitForFunction(() => !document.getElementById('quest-immersive-enter').disabled);
    pass('an otherwise verified nonmember gets actual SQL denial and no private headset content');

    await rebind('outsider', 'supabase', 'author'); await openRoom();
    const beforeMismatch = privateCalls();
    await trigger(); await see('Sign in through the regular browser if needed.');
    assert.equal(privateCalls(), beforeMismatch);
    await exit.click();
    pass('a selected member that differs from the retained SDK subject prevents a Circle read');

    await rebind(); await openRoom(); await checkInRoom();
    holdNext = true; held = null;
    await trigger(); await bounded(async () => { while (!held) await new Promise(resolve => setImmediate(resolve)); });
    const beforeExit = await device(), beforeRetire = api.length;
    await page.evaluate(() => window.questComposedQa.providerChanged());
    assert.equal(await page.evaluate(() => window.questXrQa.panel()), '');
    held.resolve(); await bounded(() => Promise.allSettled([...pending])); await settle();
    assert.equal(api.length, beforeRetire);
    assert.equal((await device()).ends, beforeExit.ends + 1);
    assert.equal((await count()).subscriptions, 0);
    assert.equal(await page.evaluate(() => window.questXrQa.panel()), '');
    pass('account selection retirement ends the device session and fences a held actual SQL reply');

    await rebind();
    const beforeLate = await device(), beforeLateApi = api.length;
    await page.evaluate(() => window.questXrQa.hold());
    await enter.click(); await page.waitForFunction(() => window.questXrQa.stats().held);
    await exit.click();
    await page.evaluate(() => window.questXrQa.release());
    await page.waitForFunction(ends => window.questXrQa.stats().ends === ends, beforeLate.ends + 1);
    assert.equal((await device()).draws, beforeLate.draws);
    assert.equal(api.length, beforeLateApi);
    pass('cancelled permission closes a late device grant without allocating a display or checking a member session');

    await openRoom(); await checkInRoom(); await trigger(); await see('Independent visible reply remains readable.');
    const beforeOffline = api.length;
    await page.evaluate(() => window.questXrQa.online(false));
    assert.equal(await page.evaluate(() => window.questXrQa.panel()), '');
    await page.evaluate(() => window.questXrQa.online(true)); await settle();
    assert.equal(api.length, beforeOffline);
    await openRoom();
    await page.evaluate(() => window.questXrQa.contextLost());
    await page.waitForFunction(() => !document.getElementById('quest-immersive-enter').disabled);
    assert.equal(await page.evaluate(() => window.questXrQa.panel()), '');
    assert.equal(api.length, beforeOffline);
    pass('offline and graphics loss both retire the headset; recovery performs no automatic account check or read');

    await openRoom(); await checkInRoom(); await trigger(); await see('Independent visible reply remains readable.');
    const beforeWrite = await f.receiptCount();
    await press('Write a post'); await see('Write a Circle post');
    await press('Review'); await see('Choose letters'); // Empty draft has no review action.
    await press('Caps'); await press('H'); await press('Caps on'); await press('i');
    await press('Space'); await press('Symbols'); await press('!'); await press('Delete'); await press('?');
    await capturePanel('keyboard');
    assert.equal(posts().length, 0);
    await press('Review'); await see('Review your post');
    assert.equal(latestPreview.content, 'Hi ?'); await see(latestPreview.content);
    assert.equal(await f.receiptCount(), beforeWrite);
    await page.evaluate(() => window.questXrQa.repeat()); await settle();
    assert.match(await page.evaluate(() => window.questXrQa.panel()), /Review your post/, 'Repeat trigger at the Review position must stay in review');
    await press('Post', true);
    await page.evaluate(() => { window.questXrQa.miss(); window.questXrQa.select(); }); await settle();
    assert.equal(posts().length, 0, 'Repeated Review and invalid poses must never confirm a post');
    await press('Edit'); await see('Write a Circle post');
    await press('Delete'); await press('!'); await press('Review'); await see('Review your post');
    assert.equal(latestPreview.content, 'Hi !');
    const newPost = latestPreview;
    await press('Post'); await see('Post confirmed');
    assert.equal(posts().length, 1); assert.equal(await f.receiptCount(), beforeWrite + 1);
    assert.equal(latestReceipt.requestId, newPost.requestId); assert.equal(latestReceipt.message.content, newPost.content);
    const parent = latestReceipt.message.id;
    pass('the real room keyboard edits a short draft and shows the canonical preview; only a correctly pointed explicit Post saves one new contribution');

    await press('Read recent discussion'); await see('Hi !');
    await press('Reply'); await see('Reply to ');
    await press('o'); await press('k'); await press('Review'); await see('Review reply to ');
    assert.equal(latestPreview.parentMessageId, parent); assert.equal(latestPreview.comment, 'ok');
    const exact = latestPreview;
    const panelText = await page.evaluate(() => window.questXrQa.panel());
    assert.ok(panelText.includes(exact.content.split('\n').map(line => line.match(/.{1,48}/gu)?.join('\n') ?? '').join('\n')));
    await capturePanel('review');
    dropPost = true;
    await press('Post'); await see('Delivery unconfirmed');
    const reply = latestReceipt.message.id;
    assert.equal(latestReceipt.message.parentMessageId, parent); assert.equal(latestReceipt.message.content, exact.content);
    assert.equal(await f.receiptCount(), beforeWrite + 2);
    const afterLost = api.length;
    await press('Check delivery'); await see('Post confirmed');
    assert.equal(posts().length, 2);
    assert.ok(api.slice(afterLost).some(entry => entry.method === 'GET' && entry.queryKeys.includes('requestId') && entry.status === 200));
    assert.equal(await f.receiptCount(), beforeWrite + 2);
    await exit.click(); await check(); await ready(); await page.locator('#circle-archive-open').click();
    await page.locator(`#circle-archive-messages [data-message-id="${reply}"]`).waitFor();
    assert.equal(latest.items.find(item => item.id === reply).parentMessageId, parent);
    assert.equal(latest.items.find(item => item.id === reply).content, exact.content);
    pass('a headset reply survives a lost response; manual lookup proves the same saved request and a fresh regular-browser archive shows the canonical reply');

    await openRoom(); await checkInRoom(); await trigger(); await see('ok');
    await press('Write a post'); await press('x');
    holdPreview = true; held = null; await press('Review');
    await bounded(async () => { while (!held) await new Promise(resolve => setImmediate(resolve)); });
    await page.evaluate(() => window.questComposedQa.providerChanged());
    assert.equal(await page.evaluate(() => window.questXrQa.panel()), '');
    held.resolve(); await bounded(() => Promise.allSettled([...pending])); await settle();
    assert.equal(posts().length, 2);
    assert.equal(await page.evaluate(() => window.questXrQa.panel()), '');
    pass('changing accounts during a held exact preview closes the headset and clears the draft; the late response cannot render a Post action');

    await rebind(); await openRoom(); await checkInRoom(); await trigger(); await see('ok');
    await press('Write a post'); await press('x'); await press('Review'); await see('Review your post');
    await f.leave();
    await press('Post'); await see('Check the discussion');
    assert.deepEqual(await labels(), ['Read recent discussion']);
    assert.equal(posts().at(-1).status, 403);
    assert.equal(await f.receiptCount(), beforeWrite + 2);
    await page.evaluate(() => window.questXrQa.visibility('hidden'));
    assert.equal(await page.evaluate(() => window.questXrQa.panel()), '');
    assert.match(await page.locator('#quest-immersive-status').textContent(), /An interrupted post may have been saved/);
    pass('SQL rechecks membership at Post; removal after review blocks the write and headset loss clears the panel with a delivery notice');
  }

  const beforeUnmount = api.length; await page.evaluate(() => window.questComposedQa.unmount()); await settle();
  assert.equal((await count()).subscriptions, 0); assert.equal(await page.locator('[data-quest-member-view]').count(), 0); assert.equal(api.length, beforeUnmount);
  if (run) {
    const final = await page.evaluate(() => ({ ...window.questXrQa.stats(), text: window.questXrQa.panel() }));
    assert.equal(final.pendingFrames, 0); assert.equal(final.text, '');
    assert.equal(final.requests, final.ends); assert.ok(final.activations.every(Boolean)); assert.deepEqual(final.errors, []);
    runtime.syntheticXR = { sessions: final.requests, ended: final.ends, framesDrawn: final.draws, textureUploads: final.uploads, releasedTextures: final.releases };
  }
  pass('unmount disposes the actual DOM host and SDK observation with no late private request');
  cleanErrors();
  for (const [file, digest] of Object.entries({ ...sourceHashes, ...sqlHashes })) assert.equal(sha(read(file)), digest, 'Source changed during composition: ' + file);
} catch (error) { failure = error.stack || String(error); }
finally {
  write(failure ? 'FAIL' : 'CLEANING_UP');
  for (const controller of controllers.values()) controller.abort(); for (const release of releases) release();
  try { await bounded(() => Promise.allSettled([...pending]), 5000, 'Owned route cleanup'); } catch (error) { failure ??= error.stack || String(error); }
  try { if (browser) await bounded(() => browser.close(), 5000, 'Owned browser cleanup'); cleanup.browser = browser ? 'closed' : 'not-created'; }
  catch (error) { cleanup.browser = 'failed'; failure ??= error.stack || String(error); try { signalOwnedChrome('SIGTERM'); if (ownedChrome().includes(ownedBrowserPid)) signalOwnedChrome('SIGKILL'); } catch {} }
  try { if (f) await bounded(() => f.close(), 5000, 'Owned DB cleanup'); cleanup.database = f ? 'closed' : 'not-created'; } catch (error) { cleanup.database = 'failed'; failure ??= error.stack || String(error); }
  try { cleanErrors(); } catch (error) { failure ??= error.stack || String(error); }
  write(failure ? 'FAIL' : 'PASS');
}
if (failure) throw Error(failure);
console.log('PASS Quest composed Chromium: ' + stories.length + ' stories, ' + api.length + ' actual handler requests; owned browser/database closed.');
