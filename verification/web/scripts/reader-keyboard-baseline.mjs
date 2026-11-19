import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

// Actual built Next server only. The independently owned server receipt binds
// its startup network guard and build; this runner never replaces app routes.
const ROOT = process.cwd();
const ORIGIN = process.env.SOE_PUBLIC_READER_ORIGIN;
const SERVER_RECEIPT = process.env.SOE_PUBLIC_READER_SERVER_RECEIPT;
const RUN = process.env.SOE_READER_PROOF_RUN;
assert(ORIGIN && /^http:\/\/127\.0\.0\.1:[0-9]+$/.test(ORIGIN), 'Exact loopback server origin required');
assert(SERVER_RECEIPT && RUN && /^reader-keyboard-baseline-[a-z0-9-]+$/.test(RUN), 'Server receipt and fresh evidence name required');
assert(process.execArgv.some(v => v.endsWith('/deny-build-network.cjs')), 'Runner startup network denial required');
const EVIDENCE = path.join(ROOT, 'verification/web/evidence'), output = path.join(EVIDENCE, RUN + '.json');
assert(!fs.existsSync(output), 'Baseline evidence is immutable; choose a new run name');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function resident(name) {
  const absolute = path.resolve(ROOT, name), s = fs.lstatSync(absolute);
  assert(s.isFile() && !s.isSymbolicLink() && (!s.size || s.blocks), 'Unavailable resident leaf: ' + name);
  return absolute;
}
const read = name => fs.readFileSync(resident(name));
const sources = [
  'verification/web/scripts/reader-keyboard-baseline.mjs', 'verification/web/scripts/deny-build-network.cjs',
  'app/great-books/page.tsx', 'app/great-books/[bookId]/page.tsx', 'app/great-books/LibraryBrowser.tsx',
  'app/great-books/BookReader.tsx', 'app/great-books/ReadingNav.tsx', 'app/great-books/ReaderTools.tsx',
  'app/great-books/SavedReadingTools.tsx', 'app/great-books/ReadingCommunity.tsx', 'app/great-books/PassageTools.tsx',
  'app/great-books/EditionCredits.tsx', 'app/great-books/reading.module.css',
  'app/api/great-books/edition/[bookId]/reader/route.ts', 'lib/books/source-reader-server.ts',
  'lib/books/source-reader.ts', 'lib/books/source-reader-catalog.json',
  'content/great-books/hamlet/reader.html', 'content/great-books/hamlet/native-reader.html',
  '.next/BUILD_ID', '.next/build-manifest.json', SERVER_RECEIPT,
  'verification/web/evidence/built-shell-final-next-build.json',
  'verification/web/evidence/built-shell-final-build-source-sha256.json',
  'verification/web/scripts/built-shell-network-guard.cjs',
];
const hashes = Object.fromEntries(sources.map(n => [n, sha(read(n))]));
const serverReceipt = JSON.parse(read(SERVER_RECEIPT));
assert.equal(serverReceipt.status, 'READY'); assert.equal(serverReceipt.origin, ORIGIN);
assert.equal(serverReceipt.buildId, read('.next/BUILD_ID').toString().trim());
for (const name of sources) {
  const expected = serverReceipt.sourceHashes?.[name] ?? serverReceipt.inputHashes?.[name] ?? serverReceipt.builtHashes?.[name];
  if (expected) assert.equal(hashes[name], expected, 'Built-server input binding: ' + name);
}
const catalog = JSON.parse(read('lib/books/source-reader-catalog.json'));
const hamlet = catalog.editions.find(e => e.bookId === 'hamlet');
const record = {
  status: 'RUNNING', startedAt: new Date().toISOString(), origin: ORIGIN,
  scope: 'Actual cached production Next server, public library to complete Hamlet source reader. Keyboard actions use Chromium input; DOM is inspected for focus, labels, geometry and source fidelity. No route substitution, AI or private actions, provider setup, downloads, canonical edition edits, screen-reader or device acceptance. Desktop browser zoom is claimed only if keyboard zoom measurably changes layout metrics; any fallback is labeled explicitly.',
  serverReceipt: { path: SERVER_RECEIPT, sha256: hashes[SERVER_RECEIPT] },
  sourceHashes: hashes, runtime: {}, stories: [], keyboard: [], requests: [], responses: [], blocked: [],
  pageErrors: [], consoleErrors: [], screenshots: [], observations: {}, cleanup: { browser: 'pending', server: 'owned by native_moderation' },
};
function write() { fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n'); }
write();
let browser, page;
const pending = new Set();
function tracked(promise) { pending.add(promise); promise.finally(() => pending.delete(promise)); }
async function snapshot() {
  return page.evaluate(() => {
    const short = e => {
      const r = e.getBoundingClientRect(), c = getComputedStyle(e);
      return { tag: e.tagName, id: e.id, name: e.getAttribute('aria-label') || Array.from(e.labels || []).map(l => l.textContent.trim()).join(' ') || e.textContent.trim().replace(/\s+/g, ' ').slice(0, 180),
        href: e.getAttribute('href'), type: e.getAttribute('type'), focusVisible: e.matches(':focus-visible'),
        outline: { style: c.outlineStyle, width: c.outlineWidth, color: c.outlineColor },
        rect: { x: r.x, y: r.y, width: r.width, height: r.height }, scrollY };
    };
    const outer = document.activeElement, inner = outer?.tagName === 'IFRAME' ? outer.contentDocument?.activeElement : null;
    return { outer: short(outer), inner: inner ? short(inner) : null, hash: location.hash };
  });
}
async function key(key, note = '') {
  await page.keyboard.press(key);
  const focus = await snapshot(); record.keyboard.push({ key, note, focus }); return focus;
}
async function tabTo(predicate, limit = 100, reverse = false) {
  for (let i = 0; i < limit; i++) {
    const focus = await key(reverse ? 'Shift+Tab' : 'Tab');
    if (predicate(focus)) return focus;
  }
  throw new Error('Keyboard target not reached within ' + limit + ' tabs');
}
const outerName = name => f => f.outer.name === name;
const outerId = id => f => f.outer.id === id;
async function story(name, fn) {
  try { const evidence = await fn(); record.stories.push({ name, status: 'PASS', evidence: evidence ?? null }); }
  catch (error) { record.stories.push({ name, status: 'FINDING', error: error.stack || String(error), focus: page ? await snapshot().catch(() => null) : null }); }
  console.log(record.stories.at(-1).status + ': ' + name); write();
}
async function screenshot(name) {
  const filename = RUN + '-' + name + '.png', absolute = path.join(EVIDENCE, filename);
  assert(!fs.existsSync(absolute)); await page.screenshot({ path: absolute, fullPage: true });
  record.screenshots.push({ path: 'verification/web/evidence/' + filename, sha256: sha(read(absolute)) });
}
async function reader() {
  await page.goto(ORIGIN + '/great-books/hamlet', { waitUntil: 'networkidle' });
  await page.locator('iframe[data-reading-frame][aria-busy="false"]').waitFor();
  await page.getByLabel('Go to a heading', { exact: true }).waitFor();
}
async function dimensions() {
  return page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio,
    visualScale: visualViewport.scale, visualWidth: visualViewport.width,
    scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth,
    bodyFontSize: getComputedStyle(document.body).fontSize }));
}
try {
  const require = createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');
  const playwright = resident(require.resolve('playwright'));
  const executablePath = resident('/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
  record.runtime = { node: process.version, playwright: { path: playwright, sha256: sha(read(playwright)) }, chromium: { path: executablePath, sha256: sha(read(executablePath)) } };
  browser = await require('playwright').chromium.launch({ headless: true, executablePath, timeout: 20000,
    env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' },
    args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'] });
  record.runtime.chromium.version = browser.version();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', acceptDownloads: false });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), headers = await request.allHeaders();
    if (url.origin !== ORIGIN || request.method() !== 'GET' || headers.authorization || headers.cookie) {
      record.blocked.push({ url: url.href, method: request.method(), reason: 'Only anonymous GET to exact owned loopback origin allowed' }); await route.abort(); return;
    }
    record.requests.push({ path: url.pathname + url.search, type: request.resourceType(), method: request.method() });
    await route.continue();
  });
  page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', error => record.pageErrors.push(error.stack || String(error)));
  page.on('console', message => { if (message.type() === 'error') record.consoleErrors.push(message.text()); });
  page.on('response', response => tracked((async () => {
    const url = new URL(response.url());
    if (url.origin !== ORIGIN) return;
    try { const body = await response.body(); record.responses.push({ path: url.pathname + url.search, status: response.status(), bytes: body.length, sha256: sha(body), contentType: response.headers()['content-type'] ?? null }); }
    catch (error) { record.responses.push({ path: url.pathname + url.search, status: response.status(), bodyUnavailable: String(error) }); }
  })()));
  await story('Library skip link moves keyboard navigation past the reading navigation', async () => {
    await page.goto(ORIGIN + '/great-books', { waitUntil: 'networkidle' });
    assert.equal(await page.locator('article').count(), 8);
    const focus = await tabTo(outerName('Skip to reading content'));
    assert(focus.outer.focusVisible && focus.outer.outline.style !== 'none');
    const activated = await key('Enter', 'Activate main-content skip link');
    const next = await key('Tab');
    assert.equal(next.outer.name, 'Find a reading Circle');
    return { activated, next };
  });
  await story('Keyboard filtering and title activation open the complete Hamlet edition', async () => {
    await tabTo(outerId('library-search'));
    await page.keyboard.type('Hamlet');
    await page.waitForFunction(() => document.querySelectorAll('article').length === 1);
    await key('Tab'); assert.equal((await snapshot()).outer.id, 'library-author');
    await key('Shift+Tab'); assert.equal((await snapshot()).outer.id, 'library-search');
    await key('Escape', 'Native search escape behavior; no submit or navigation requested');
    // Chromium may clear a search field with Escape; keep the filtered target explicit.
    if (await page.locator('#library-search').inputValue() !== 'Hamlet') await page.keyboard.type('Hamlet');
    await tabTo(outerName('Hamlet'));
    await key('Enter', 'Open title using keyboard');
    await page.waitForURL(ORIGIN + '/great-books/hamlet');
    await page.locator('iframe[data-reading-frame][aria-busy="false"]').waitFor();
    const source = await page.locator('iframe').evaluate(f => ({ title: f.title, src: f.getAttribute('src'), blocks: f.contentDocument.querySelectorAll('[data-reading-index]').length }));
    assert.equal(source.title, 'Hamlet — complete source edition'); assert.equal(source.blocks, hamlet.blockCount);
    assert(source.src.includes(hamlet.editionId)); return source;
  });
  await story('Frame bypass focuses optional tools and reverse navigation returns toward the source', async () => {
    await reader();
    await tabTo(outerName('Skip the book to saved place and optional tools'));
    await key('Enter'); assert.equal((await snapshot()).outer.id, 'reading-tools');
    const reverse = await key('Shift+Tab'); assert.equal(reverse.outer.name, 'Use current block as a source link');
    const next = await key('Tab'); assert.equal(next.outer.name, 'Load my saved place');
    return { reverse, next };
  });
  await story('Complete source frame can be entered and exited in both keyboard directions', async () => {
    await reader(); await tabTo(outerName('Skip the book to saved place and optional tools'));
    const entered = await key('Tab'); assert.equal(entered.outer.tag, 'IFRAME'); assert(entered.inner);
    const reverse = await key('Shift+Tab'); assert.equal(reverse.outer.name, 'Skip the book to saved place and optional tools');
    await key('Tab');
    const candidates = await page.locator('iframe').evaluate(f => f.contentDocument.querySelectorAll('a[href],button,input,select,textarea,[tabindex="0"]').length);
    let exit = null, tabs = 0;
    for (; tabs < candidates + 4; tabs++) { const f = await key('Tab'); if (f.outer.tag !== 'IFRAME') { exit = f; break; } }
    assert(exit, 'Frame forward traversal did not exit'); assert.equal(exit.outer.name, 'Capture selected passage');
    return { entered, reverse, sourceFocusableCandidates: candidates, forwardTabsToExit: tabs + 1, exit };
  });
  await story('Keyboard heading choice moves focus into the selected complete-source heading', async () => {
    await reader(); await tabTo(outerId('reading-contents'));
    const options = await page.locator('#reading-contents').evaluate(e => Array.from(e.options).map(o => ({ label: o.label, value: o.value, sourceTargetPresent: Boolean(document.querySelector('iframe').contentDocument.getElementById(o.value)) })));
    // Actual native-select type-ahead emits input/change in this cached macOS
    // headless Chromium. Popup arrow/Enter automation is separately recorded
    // in reader-heading-probe-01/02; it emits no selection event here.
    await key('t', 'Native closed-select type-ahead chooses The Project Gutenberg heading');
    const after = await snapshot(); assert.equal(after.outer.tag, 'IFRAME');
    assert(after.inner?.id && after.inner.tag.startsWith('H'), 'Chosen heading receives source focus');
    assert.equal(await page.locator('#reading-contents').inputValue(), '');
    return { options, firstHeading: options[1], after, method: 'Keyboard type-ahead; native popup arrow/Enter selection remains an automation limitation' };
  });
  await story('Keyboard text-size controls change actual source text without requesting AI or a private account', async () => {
    await reader(); await tabTo(outerName('Increase book text size'));
    const before = await page.locator('iframe').evaluate(f => getComputedStyle(f.contentDocument.body).fontSize);
    await key('Enter');
    await page.getByText('Book text: 22 pixels', { exact: true }).waitFor();
    const after = await page.locator('iframe').evaluate(f => getComputedStyle(f.contentDocument.body).fontSize);
    assert.notEqual(after, before); return { before, after };
  });
  await story('Optional tools are keyboard-operable with associated names and no implicit generation', async () => {
    await reader(); await tabTo(outerName('Skip the book to saved place and optional tools')); await key('Enter');
    await tabTo(outerName('Optional AI reading tools'));
    await key('Enter'); assert.equal(await page.locator('details').getAttribute('open'), '');
    const openedFocus = await snapshot();
    await key('Escape', 'Native disclosure remains open; Escape does not trap focus');
    assert.equal((await snapshot()).outer.tag, 'SUMMARY');
    const next = await key('Tab'); assert.equal(next.outer.name, 'Use selected passage');
    await key('Shift+Tab'); await key('Space'); assert.equal(await page.locator('details').getAttribute('open'), null);
    const labels = await page.locator('#reading-tools').evaluate(root => Array.from(root.querySelectorAll('input,select,textarea')).map(e => ({ tag: e.tagName, id: e.id, type: e.type, disabled: e.disabled, name: e.getAttribute('aria-label') || Array.from(e.labels || []).map(l => l.textContent.trim()).join(' ') })));
    assert(labels.every(e => e.name)); return { openedFocus, next, labels };
  });
  await story('Library and complete reader reflow at 320 CSS pixels with visible keyboard focus', async () => {
    await page.setViewportSize({ width: 320, height: 850 });
    await page.goto(ORIGIN + '/great-books', { waitUntil: 'networkidle' });
    const library = await dimensions(); assert(library.scrollWidth <= library.clientWidth + 1);
    await tabTo(outerId('library-search')); await page.keyboard.type('Hamlet');
    await page.waitForFunction(() => document.querySelectorAll('article').length === 1);
    await screenshot('library-320');
    await reader();
    const wrapper = await dimensions(); assert(wrapper.scrollWidth <= wrapper.clientWidth + 1);
    await tabTo(outerName('Increase book text size')); const focus = await snapshot();
    assert(focus.outer.focusVisible && focus.outer.outline.style !== 'none');
    assert(focus.outer.rect.x >= 0 && focus.outer.rect.x + focus.outer.rect.width <= wrapper.width + 1);
    const frame = await page.locator('iframe').evaluate(f => ({ width: f.clientWidth, sourceScrollWidth: f.contentDocument.documentElement.scrollWidth, sourceClientWidth: f.contentDocument.documentElement.clientWidth }));
    assert(frame.sourceScrollWidth <= frame.sourceClientWidth + 1, 'Source horizontal overflow at 320px wrapper');
    await screenshot('reader-320'); return { library, wrapper, frame, focus };
  });
  await story('Desktop zoom is measured explicitly rather than inferred from pixel density', async () => {
    await page.setViewportSize({ width: 1280, height: 900 }); await reader();
    const before = await dimensions();
    await key('Meta+Equal'); await key('Meta+Equal'); await key('Meta+Equal'); await key('Meta+Equal');
    const after = await dimensions();
    record.observations.zoom = { before, after, method: 'Four Chromium macOS Command+Equals keyboard shortcuts', verified200Percent: Math.abs(after.dpr / before.dpr - 2) < 0.01 && Math.abs(after.width / before.width - 0.5) < 0.01 };
    if (!record.observations.zoom.verified200Percent) {
      record.observations.zoom.limit = 'Headless browser keyboard shortcuts did not establish actual 200% desktop zoom. 320 CSS-pixel reflow and explicit reader font-size controls are separate observations, not desktop-zoom acceptance.';
    }
    await screenshot('desktop-zoom-attempt'); return record.observations.zoom;
  });
  await Promise.allSettled([...pending]);
  await story('Real source bytes, build inputs and anonymous request boundary remain pinned', async () => {
    const complete = record.responses.filter(r => r.path.startsWith('/api/great-books/edition/hamlet?'));
    assert(complete.length > 0);
    const sourceBytes = read('content/great-books/hamlet/reader.html');
    assert.equal(sha(sourceBytes), hamlet.sourceDocumentSha256);
    assert(complete.every(r => r.status === 200 && r.sha256 === hamlet.sourceDocumentSha256 && r.bytes === sourceBytes.length));
    assert.equal(record.blocked.length, 0, 'Unexpected attempted request');
    assert.equal(record.pageErrors.length, 0);
    const privateRequests = record.requests.filter(r => r.path.startsWith('/api/') && !r.path.startsWith('/api/great-books/text/hamlet') && !r.path.startsWith('/api/great-books/edition/hamlet?'));
    assert.deepEqual(privateRequests, []);
    for (const [name, hash] of Object.entries(hashes)) assert.equal(sha(read(name)), hash, 'Source changed during baseline: ' + name);
    return { completeSourceResponses: complete.length, sourceBytes: sourceBytes.length, sourceSha256: hamlet.sourceDocumentSha256, privateRequests: 0, providerRequests: 0 };
  });
  record.status = record.stories.some(s => s.status !== 'PASS') ? 'FINDINGS' : 'PASS_WITH_LIMITS';
} catch (error) { record.status = 'ERROR'; record.failure = error.stack || String(error); process.exitCode = 1; }
finally {
  if (browser) { await browser.close(); record.cleanup.browser = 'closed'; }
  await Promise.allSettled([...pending]); record.completedAt = new Date().toISOString(); write();
  console.log(JSON.stringify({ status: record.status, stories: record.stories.length, findings: record.stories.filter(s => s.status !== 'PASS').map(s => s.name), output }));
}
