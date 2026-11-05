import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const ROOT = process.cwd(), ORIGIN = process.env.SOE_BUILT_SHELL_ORIGIN;
const RUN = process.env.SOE_PRIVACY_RUN;
assert(/^http:\/\/127\.0\.0\.1:[0-9]+$/.test(ORIGIN ?? ''));
assert(/^built-review-privacy-[a-z0-9-]+$/.test(RUN ?? ''));
assert(process.execArgv.some(v => v.endsWith('/deny-build-network.cjs')));
const PREFIX = 'verification/web/evidence/' + RUN, OUT = path.join(ROOT, PREFIX + '.json');
assert(!fs.existsSync(OUT), 'Preserve baseline receipts');
const sha = value => createHash('sha256').update(value).digest('hex');
function read(name) {
  const p = path.resolve(ROOT, name), s = fs.lstatSync(p);
  assert(s.isFile() && !s.isSymbolicLink() && (!s.size || s.blocks), 'Unavailable resident leaf: ' + name);
  return fs.readFileSync(p);
}
const readyPath = process.env.SOE_BUILT_SHELL_RECEIPT ?? 'verification/web/evidence/built-shell-server-ready.json';
assert(/^verification\/web\/evidence\/[a-z0-9-]+\.json$/.test(readyPath));
const ready = JSON.parse(read(readyPath));
assert.equal(ready.origin, ORIGIN); assert.equal(ready.status, 'READY');
const result = {
  status: 'RUNNING', startedAt: new Date().toISOString(), origin: ORIGIN,
  scope: 'Actual production Next shell, router, client components and registered service worker in cached Chromium. Private reviewer API calls run current handlers and disposable SQL with explicit synthetic actor/PostgREST doubles; the member credential probe is a signed-out double. Storage checks sample CacheStorage, localStorage and sessionStorage for an exact synthetic sentinel and CacheStorage for private API URLs. They do not inspect IndexedDB, cookies, transient/transformed writes or browser disk erasure. This proves observed browser retirement/cache behavior under that identity seam, not real sign-in, logout, deployed RLS, screen readers or physical devices. No provider calls or account writes are authorized.',
  sourceHashes: {}, runtimeHashes: {}, evidenceHashes: {}, stories: [], findings: [], errors: [], http: [], blocked: [], caches: [], lifecycle: [], screenshots: [],
  cleanup: { browser: 'pending', database: 'pending', server: 'shared owner' },
};
const save = () => fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n');
const pending = new Set(); let browser, context, page, f, heldReply, holdDetail = false;
const sentinel = 'SYNTHETIC_PRIVATE_BROWSER_NOTE_' + randomUUID();
const privateCount = () => result.http.filter(r => r.path.startsWith('/api/admin/circles/reports')).length;
const button = name => page.getByRole('button', { name, exact: true });
const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function bounded(work, ms = 10000) {
  let timer;
  try { return await Promise.race([work(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Owned cleanup timed out')), ms); })]); }
  finally { clearTimeout(timer); }
}
async function idle() { await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Load assigned Circles' && !b.disabled)); await settle(); }
async function clear() { await settle(); assert.equal(await page.getByText(sentinel, { exact: true }).count(), 0); assert.equal(await page.getByRole('region', { name: 'Current Circle review', exact: true }).count(), 0); }
async function open() {
  await page.bringToFront(); await idle(); await button('Load assigned Circles').click(); await idle();
  await button('Review ' + f.circleTitle).click(); await page.getByText(sentinel, { exact: true }).waitFor(); await idle();
}
async function fresh() { await page.goto(ORIGIN + '/moderation/circles'); await page.bringToFront(); await idle(); }
async function story(name, run) {
  try { const evidence = await run(); result.stories.push({ name, status: 'PASS', evidence: evidence ?? null }); }
  catch (error) { const finding = { name, error: error.stack || String(error) }; result.findings.push(finding); result.stories.push({ name, status: 'FINDING', error: finding.error }); }
  save(); console.log(result.stories.at(-1).status + ': ' + name);
}
async function cacheSnapshot(label) {
  const value = await page.evaluate(async sentinel => {
    const hash = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
    const cachesFound = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name), entries = [];
      for (const request of await cache.keys()) {
        const response = await cache.match(request), bytes = await response.arrayBuffer();
        entries.push({ path: new URL(request.url).pathname, search: new URL(request.url).search, status: response.status, cacheControl: response.headers.get('cache-control'), bytes: bytes.byteLength, sha256: await hash(bytes), containsPrivateSentinel: new TextDecoder().decode(bytes).includes(sentinel) });
      }
      cachesFound.push({ name, entries });
    }
    const storage = [localStorage, sessionStorage].map((store, i) => ({ kind: i ? 'session' : 'local', entries: Object.keys(store).map(key => ({ key, containsPrivateSentinel: (store.getItem(key) ?? '').includes(sentinel) })) }));
    return { controlled: Boolean(navigator.serviceWorker.controller), script: navigator.serviceWorker.controller?.scriptURL, caches: cachesFound, storage };
  }, sentinel);
  result.caches.push({ label, ...value }); save();
  assert.equal(value.controlled, true); assert.equal(value.script, ORIGIN + '/sw.js');
  assert(value.caches.some(c => c.name === 'soe-v3' && c.entries.some(e => e.path === '/manifest.json')), 'Real installed cache required');
  for (const c of value.caches) for (const e of c.entries) { assert(!e.path.startsWith('/api/'), 'Private API must not enter CacheStorage'); assert.equal(e.containsPrivateSentinel, false); }
  for (const storage of value.storage) for (const e of storage.entries) assert.equal(e.containsPrivateSentinel, false);
  return value.caches.map(c => ({ name: c.name, entries: c.entries.length }));
}
save();
try {
  for (const name of ['verification/web/tests/browser-built-review-privacy.mjs', 'verification/web/scripts/deny-build-network.cjs', readyPath,
    'public/sw.js', 'app/components/ServiceWorkerRegistration.tsx', 'app/layout.tsx', 'app/moderation/circles/page.tsx', 'app/moderation/circles/CircleReviews.tsx',
    'lib/circles/useReviewAccess.ts', 'lib/circles/browser-access.ts', 'lib/circles/client.ts', 'lib/auth/getSession.ts', 'lib/auth/providerSelection.ts',
    'verification/web/tests/support/native-circle-reviewer-app.mjs']) {
    result.sourceHashes[name] = sha(read(name));
    if (ready.sourceHashes[name]) assert.equal(result.sourceHashes[name], ready.sourceHashes[name]);
  }
  process.chdir(path.join(ROOT, 'verification/web'));
  const fixture = await import('./support/native-circle-reviewer-app.mjs');
  Object.assign(result.sourceHashes, await fixture.nativeCircleReviewerSourceHashes());
  f = await fixture.nativeCircleReviewerApp({ reportCount: 1 });
  await f.db.query('UPDATE circle_reports SET note=$2 WHERE cohort_id=$1', [f.circleId, sentinel]);
  const pw = '/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/';
  const executablePath = '/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
  const require = createRequire(pw + 'playwright/package.json');
  const sqlRuntime = '/Users/christaylor/.cache/soe-passages-test-runtime/pglite-0.4.1/';
  for (const name of [process.execPath, executablePath, 'node_modules/typescript/package.json', 'node_modules/typescript/lib/typescript.js',
    ...['package.json', 'dist/index.js', 'dist/chunk-QDPEV33M.js', 'dist/chunk-QY3QWFKW.js', 'dist/pglite.wasm', 'dist/pglite.data', 'dist/pglite.js'].map(n => sqlRuntime + n),
    ...['playwright/package.json', 'playwright/index.js', 'playwright-core/package.json', 'playwright-core/index.js', 'playwright-core/browsers.json', 'playwright-core/lib/bootstrap.js', 'playwright-core/lib/coreBundle.js', 'playwright-core/lib/utilsBundle.js'].map(n => pw + n)]) result.runtimeHashes[name] = sha(read(name));
  browser = await require('playwright').chromium.launch({ headless: true, executablePath, ignoreDefaultArgs: ['--disable-back-forward-cache'], env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' }, args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'] });
  result.chromiumVersion = browser.version();
  context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'allow', acceptDownloads: false });
  await context.addInitScript(sentinel => {
    window.__soePrivacyDocumentId = crypto.randomUUID();
    window.__soePrivacyLifecycle = [];
    for (const name of ['pageshow', 'pagehide']) addEventListener(name, event => {
      window.__soePrivacyLifecycle.push({ type: name, persisted: event.persisted, documentId: window.__soePrivacyDocumentId, path: location.pathname, containsPrivateSentinel: Boolean(document.body?.textContent?.includes(sentinel)) });
    });
  }, sentinel);
  await context.route('**/*', route => {
    const work = (async () => {
      const req = route.request(), url = new URL(req.url());
      try {
        if (url.origin !== ORIGIN) { result.blocked.push({ origin: url.origin, path: url.pathname }); return await route.abort(); }
        if (!url.pathname.startsWith('/api/')) return await route.continue();
        const entry = { path: url.pathname, method: req.method(), status: null }; result.http.push(entry);
        assert.equal(req.method(), 'GET', 'No account or review writes authorized in privacy baseline');
        if (url.pathname === '/api/auth/member') {
          entry.status = 401; entry.seam = 'explicit signed-out member probe';
          return await route.fulfill({ status: 401, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' }, body: '{"session":"signed_out"}' });
        }
        assert(url.pathname.startsWith('/api/admin/circles/reports'), 'Unexpected API route');
        const response = await f.dispatch(url.pathname + url.search), bytes = await response.text();
        entry.status = response.status; entry.cacheControl = response.headers.get('cache-control'); entry.bodySha256 = sha(bytes); entry.containsPrivateSentinel = bytes.includes(sentinel);
        assert.match(entry.cacheControl, /private.*no-store/);
        if (holdDetail && url.pathname === '/api/admin/circles/reports/' + f.circleId) {
          holdDetail = false;
          await new Promise(resolve => { heldReply = resolve; });
        }
        await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: bytes });
      } catch (error) {
        // An intentionally retired fetch may close its route before delayed delivery.
        if (!/Target.*closed|Request.*cancel|Invalid InterceptionId|Invalid parameters|already handled/.test(String(error))) result.errors.push(error.stack || String(error));
        await route.abort().catch(() => {});
      }
    })();
    pending.add(work); work.finally(() => pending.delete(work)); return work;
  });
  page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => result.errors.push(String(error)));
  const cdp = await context.newCDPSession(page); await cdp.send('Page.enable');
  cdp.on('Page.backForwardCacheNotUsed', event => result.lifecycle.push({ kind: 'backForwardCacheNotUsed', ...event }));
  await fresh();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), { timeout: 20000 });
  await story('Actual service worker controls the public shell without automatic private review requests', async () => {
    assert.equal(privateCount(), 0); await clear(); return cacheSnapshot('initial');
  });
  await story('Manual current-handler review loads a synthetic private note absent from sampled CacheStorage and key-value storage snapshots', async () => {
    await open(); assert(result.http.some(r => r.containsPrivateSentinel)); return cacheSnapshot('private-detail-loaded');
  });
  await story('Next router navigation away and back clears private detail and makes no automatic review request', async () => {
    await open(); const count = privateCount(), doc = await page.evaluate(() => window.__soePrivacyDocumentId);
    await page.getByRole('link', { name: 'Community norms', exact: true }).click(); await page.waitForURL(ORIGIN + '/circles/norms'); await settle();
    assert.equal(await page.evaluate(() => window.__soePrivacyDocumentId), doc, 'Must exercise client router');
    await page.goBack(); await page.waitForURL(ORIGIN + '/moderation/circles'); await idle(); await clear();
    assert.equal(privateCount(), count); return { sameDocumentRouter: true, privateRequestsAdded: 0 };
  });
  await story('Full-document navigation and browser back do not restore private detail', async () => {
    await open(); const count = privateCount(), before = await page.evaluate(() => window.__soePrivacyDocumentId);
    await page.goto(ORIGIN + '/circles/norms'); await settle();
    assert.notEqual(await page.evaluate(() => window.__soePrivacyDocumentId), before);
    // BFCache restoration may deliver pageshow without a fresh load event.
    try { await page.goBack({ waitUntil: 'commit', timeout: 6000 }); }
    catch (error) {
      const restored = await page.evaluate(() => ({ path: location.pathname, events: window.__soePrivacyLifecycle }));
      assert(error.name === 'TimeoutError' && restored.path === '/moderation/circles' && restored.events.some(e => e.type === 'pageshow' && e.persisted), 'Back navigation failed without observed BFCache restoration');
      result.lifecycle.push({ kind: 'automationNavigationWaitTimedOutAfterObservedRestore', ...restored });
    }
    await page.waitForURL(ORIGIN + '/moderation/circles', { waitUntil: 'commit' });
    const lifecycle = await page.evaluate(() => window.__soePrivacyLifecycle); result.lifecycle.push(...lifecycle);
    await page.bringToFront(); await settle(); await clear(); assert.equal(privateCount(), count);
    assert(!lifecycle.some(e => e.type === 'pageshow' && e.persisted && e.containsPrivateSentinel), 'Private text was present when a BFCache document returned');
    return { privateRequestsAdded: 0, backForwardCacheRestored: lifecycle.some(e => e.type === 'pageshow' && e.persisted), lifecycle };
  });
  await story('Reload starts with a blank private review and requires a fresh manual read', async () => {
    await fresh(); await open(); const count = privateCount(); await page.reload(); await idle(); await clear(); assert.equal(privateCount(), count);
    await open(); return cacheSnapshot('after-reload-manual-load');
  });
  await story('Offline return clears private detail and coming online never reloads it automatically', async () => {
    await fresh(); await open(); const count = privateCount();
    await context.setOffline(true); await page.waitForFunction(() => navigator.onLine === false); await clear();
    await context.setOffline(false); await page.waitForFunction(() => navigator.onLine === true); await idle(); await clear(); assert.equal(privateCount(), count);
    return { privateRequestsAdded: 0 };
  });
  await story('Actual provider-change notification retires content; a subsequent manual read rechecks the synthetic actor', async () => {
    await fresh(); await open(); const count = privateCount(); f.setActor(null);
    await page.evaluate(() => window.dispatchEvent(new Event('soe:auth-provider-changed'))); await clear(); assert.equal(privateCount(), count);
    await button('Load assigned Circles').click(); await idle(); await clear(); assert.equal(result.http.at(-1).status, 401);
    f.setActor(f.authorId); return { actualLogoutAcceptance: false, notification: 'soe:auth-provider-changed', unauthorizedManualStatus: 401 };
  });
  await story('A delayed private reply cannot repopulate the page after browser lifecycle retirement', async () => {
    f.setActor(f.authorId); await fresh(); await button('Load assigned Circles').click(); await idle(); holdDetail = true;
    await button('Review ' + f.circleTitle).click();
    for (let i = 0; i < 100 && !heldReply; i++) await new Promise(resolve => setTimeout(resolve, 20));
    assert(heldReply, 'Actual current-handler detail response is held');
    const other = await context.newPage(); await other.goto(ORIGIN + '/circles/norms'); await other.bringToFront();
    // Headless focus delivery differs by browser; dispatching an event is explicitly recorded when needed.
    const hidden = await page.evaluate(() => document.visibilityState !== 'visible' || !document.hasFocus());
    if (!hidden) await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    heldReply(); heldReply = null; await settle(); await page.bringToFront();
    if (!hidden) await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await clear(); await other.close(); return { realBackgroundObserved: hidden, explicitLifecycleFallbackUsed: !hidden };
  });
  await story('Final storage inspection and read-only fixture state remain private', async () => {
    await fresh(); await open(); const caches = await cacheSnapshot('final'); assert.equal(f.providerCalls.length, 0);
    const counts = await f.counts(); assert.equal(counts.decisions, 0); assert.equal(counts.open, 1);
    const shot = PREFIX + '-private-review-320.png'; await page.setViewportSize({ width: 320, height: 850 }); await page.screenshot({ path: path.join(ROOT, shot), fullPage: true }); result.screenshots.push(shot); result.evidenceHashes[shot] = sha(read(shot));
    return { caches, providerCalls: 0, counts };
  });
  result.status = result.errors.length ? 'ERROR' : result.findings.length ? 'FINDINGS' : 'PASS_WITH_LIMITS';
} catch (error) { result.status = 'ERROR'; result.failure = error.stack || String(error); }
finally {
  heldReply?.();
  try { await bounded(() => Promise.allSettled([...pending])); }
  catch (error) { result.status = 'ERROR'; result.errors.push('Pending routes: ' + String(error)); }
  if (browser) {
    try { await bounded(() => browser.close()); result.cleanup.browser = 'closed'; }
    catch (error) { result.status = 'ERROR'; result.cleanup.browser = 'failed_or_timed_out'; result.errors.push('Browser cleanup: ' + String(error)); }
  }
  if (f) {
    try { await bounded(() => f.close()); result.cleanup.database = 'closed'; }
    catch (error) { result.status = 'ERROR'; result.cleanup.database = 'failed_or_timed_out'; result.errors.push('Database cleanup: ' + String(error)); }
  }
  try {
    for (const [name, hash] of Object.entries({ ...result.sourceHashes, ...result.runtimeHashes, ...result.evidenceHashes })) {
      if (sha(read(name)) !== hash) { result.status = 'ERROR'; result.errors.push('Changed input: ' + name); }
    }
  } catch (error) { result.status = 'ERROR'; result.errors.push('Final input verification: ' + String(error)); }
  result.completedAt = new Date().toISOString(); save();
}
console.log(JSON.stringify({ status: result.status, stories: result.stories.length, findings: result.findings, errors: result.errors, failure: result.failure, cleanup: result.cleanup }));
process.exitCode = result.status === 'ERROR' ? 1 : 0;
