import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const root = path.resolve('.'), port = 3199, origin = `http://127.0.0.1:${port}`, require = createRequire(import.meta.url);
const hash = bytes => createHash('sha256').update(bytes).digest('hex'), pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const evidence = { status: 'RUNNING', stage: 'setup', startedAt: new Date().toISOString(), boundary: 'Built Next UI with actual TypeScript public GET handler and disposable SQL; discovery PostgREST transport is synthetic and intercepted discovery calls do not execute inside the built Next server. The signed-out profile story separately uses the actual built Next cookie/token-free auth/member and owner-profile GET handlers. No authenticated account, real Circle, provider transport or production system is used.', command: 'node --require ./scripts/deny-build-network.cjs scripts/browser-discovery-qa.mjs with existing explicit Playwright/Chromium paths in a clean environment', checks: [], requests: [], pages: [], profileRequests: [], profileExpectedConsoleErrors: [], externalRequestsBlocked: [], pageErrors: [], routeErrors: [], consoleErrors: [], cleanupErrors: [], retiredResponses: [] };
let server, serverError, browser, system, failed, holdNextPage = false, heldPage = null, allowSignedOutProfileGets = false, ownedBrowserPid;
function progress() {
  evidence.progressAt = new Date().toISOString();
  fs.mkdirSync('evidence', { recursive: true });
  fs.writeFileSync('evidence/browser-discovery-progress.tmp', JSON.stringify(evidence, null, 2) + '\n');
  fs.renameSync('evidence/browser-discovery-progress.tmp', 'evidence/browser-discovery-progress.json');
}
const check = text => { evidence.checks.push(text); progress(); };
async function bounded(label, work, milliseconds = 5000) {
  let timer;
  try { return await Promise.race([Promise.resolve().then(work), new Promise((_, reject) => { timer = setTimeout(() => reject(Error(label + ' exceeded bounded deadline')), milliseconds); })]); }
  finally { clearTimeout(timer); }
}
function ownedChrome() {
  const prefix = process.env.SOE_BROWSER_EXECUTABLE + ' ';
  return execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' }).split('\n').map(line => line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/)).filter(match => match && Number(match[2]) === process.pid && match[3].startsWith(prefix)).map(match => Number(match[1]));
}
function signalOwnedChrome(signal) {
  if (!ownedBrowserPid || !ownedChrome().includes(ownedBrowserPid)) return;
  const group = Number(execFileSync('/bin/ps', ['-p', String(ownedBrowserPid), '-o', 'pgid='], { encoding: 'utf8' }).trim());
  // Only a verified direct child with this exact cached executable may be
  // signalled; use its own process group only when it is the group leader.
  process.kill(group === ownedBrowserPid ? -ownedBrowserPid : ownedBrowserPid, signal);
  (evidence.ownedBrowserSignals ??= []).push({ pid: ownedBrowserPid, signal });
}
async function portOpen() { return new Promise(resolve => { const socket = net.createConnection({ host: '127.0.0.1', port }); socket.once('connect', () => { socket.destroy(); resolve(true); }); socket.once('error', () => resolve(false)); }); }
async function keyboard(page, control) { await control.focus(); assert.equal(await control.evaluate(element => element === document.activeElement), true); await page.keyboard.press('Enter'); }
async function rendered(page, data) {
  const ids = data.circles.map(circle => circle.id);
  await page.waitForFunction(ids => document.querySelector('h3')?.textContent === 'Current results page' && JSON.stringify([...document.querySelectorAll('[data-circle-id]')].map(element => element.dataset.circleId)) === JSON.stringify(ids), ids);
  assert.equal(await page.getByRole('button', { name: 'Next page of results', exact: true }).count(), data.page.nextCursor ? 1 : 0);
  assert.doesNotMatch(await page.textContent('main'), /first 200|active listings by start date|PRIVATE_MEETING|SYNTHETIC_PRIVATE_LINK/);
}
async function change(page, action, status = 200) {
  const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/circles'); await action();
  const response = await responsePromise; assert.equal(response.status(), status); const data = await response.json();
  if (status === 200) { assert.equal(data.ready, true); await rendered(page, data); }
  return data;
}
async function open(page, query = '') { return change(page, () => page.goto(`${origin}/circles${query ? `?${query}` : ''}`)); }
async function search(page, values) {
  for (const [id, value] of Object.entries(values)) { const element = page.locator('#' + id); if (id === 'circle-sort' || id === 'circle-book' || id === 'circle-format') await element.selectOption(value); else await element.fill(value); }
  return change(page, () => keyboard(page, page.getByRole('button', { name: 'Search', exact: true })));
}
async function layout(page, file) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '320px overflow');
  const short = await page.locator('main button,main a,main select,main input,main summary,header nav a').evaluateAll(elements => elements.filter(element => { const r = element.getBoundingClientRect(); return r.width && r.height && element.type !== 'checkbox'; }).map(element => ({ text: element.textContent || element.getAttribute('aria-label'), height: element.getBoundingClientRect().height })).filter(item => item.height < 43.9));
  assert.deepEqual(short, [], 'visible controls need 44px targets'); await page.screenshot({ path: `evidence/${file}`, fullPage: true });
}
function startLink(page) { return page.getByRole('link', { name: 'Start a circle', exact: true }); }

try {
  assert.ok([...process.execArgv, process.env.NODE_OPTIONS || ''].join(' ').includes('deny-build-network.cjs'));
  assert.equal(await portOpen(), false, 'Owned QA port is not free'); fs.mkdirSync('evidence', { recursive: true });
  evidence.buildId = fs.readFileSync('../../.next/BUILD_ID', 'utf8').trim(); evidence.runnerSha256 = hash(fs.readFileSync('scripts/browser-discovery-qa.mjs'));
  evidence.sourceSha256 = Object.fromEntries(['../../app/circles/CirclesBrowser.tsx', '../../app/circles/page.tsx', '../../lib/circles/discovery-page.ts', '../../app/quest/[circleId]/QuestCircle.tsx', '../../platforms/quest/circle-host.mjs', '../../app/account/profile/page.tsx', '../../app/account/profile/ProfileEditor.tsx', '../../app/account/profile/profile.module.css', '../../app/api/auth/member/route.ts', '../../app/api/members/profile/route.ts', '../../lib/members/profile.ts'].map(file => [file, hash(fs.readFileSync(file))]));
  system = await (await import('../tests/support/discovery-app.mjs')).discoveryApp(); await system.excludeOriginalCircles();
  const ended = await system.seedCircles(205, { ended: true, title: 'Discovery ended archive' });
  const matching = await system.seedCircles(31, { title: 'Álpha Discovery', sameTitle: true, description: 'Literal 100% [wisdom] and welcoming readers.', format: 'hybrid' });
  const [late] = await system.seedCircles(1, { title: 'Far Future Needle', city: 'Boston', region: 'MA' });
  await system.db.query("UPDATE book_cohorts SET start_date=(CURRENT_DATE+180)::timestamp AT TIME ZONE 'UTC',circle_weekday=extract(dow FROM CURRENT_DATE+180)::smallint WHERE id=$1", [late]);
  const [current] = await system.seedCircles(1, { title: 'Current Together', city: 'Boston' });
  await system.db.query("UPDATE book_cohorts SET start_date=(CURRENT_DATE-7)::timestamp AT TIME ZONE 'UTC',circle_weekday=extract(dow FROM CURRENT_DATE-7)::smallint WHERE id=$1", [current]);
  const pins = JSON.parse(fs.readFileSync('../../lib/circles/reading-program-editions.json')), hamlet = pins.find(pin => pin.bookId === 'hamlet');
  const [bookCircle] = await system.seedCircles(1, { title: 'Pinned Hamlet Readers', readingProgram: { version: 1, bookId: 'hamlet', editionId: hamlet.editionId, sessions: [{ from: 35, to: 45 }] } });
  evidence.fixture = { endedRows: ended.length, equalTitleDateMatches: matching.length, eligibleRows: 34, lateFutureCircle: late, currentCircle: current, bookCircle };
  const env = Object.fromEntries(['PATH', 'HOME', 'USER', 'SHELL', 'TMPDIR', 'LANG', 'LC_ALL'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  Object.assign(env, { NEXT_TELEMETRY_DISABLED: '1', NODE_OPTIONS: '--require ' + path.join(root, 'scripts/deny-build-network.cjs'), NEXT_PUBLIC_SUPABASE_URL: 'https://offline.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'OFFLINE_PUBLIC_BUILD_PLACEHOLDER_NOT_A_CREDENTIAL' });
  const log = fs.openSync('evidence/browser-discovery-server.log', 'w'); server = spawn('node', ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: path.resolve(root, '../..'), env, detached: true, stdio: ['ignore', log, log] }); fs.closeSync(log); server.once('error', error => { serverError = error; });
  for (let index = 0; index < 100; index++) { if (await portOpen()) break; if (serverError || server.exitCode !== null || index === 99) throw serverError || Error('Owned Next server did not start'); await pause(100); }
  const { chromium } = require(process.env.SOE_PLAYWRIGHT_PACKAGE); browser = await chromium.launch({ headless: true, executablePath: process.env.SOE_BROWSER_EXECUTABLE }); evidence.chromiumVersion = browser.version();
  const chromePids = ownedChrome(); assert.equal(chromePids.length, 1, 'Expected exactly one owned Chromium child'); ownedBrowserPid = chromePids[0]; evidence.ownedBrowserPid = ownedBrowserPid;
  const context = await browser.newContext({ viewport: { width: 320, height: 900 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' }), page = await context.newPage(); page.setDefaultTimeout(20_000);
  page.on('pageerror', error => evidence.pageErrors.push(String(error))); page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text(), location = message.location().url;
    if ([`${origin}/api/auth/member`, `${origin}/api/members/profile`].includes(location) && text.includes('status of 401 (')) evidence.profileExpectedConsoleErrors.push({ location, text });
    else if (evidence.artworkExpectedPaths?.some(pathname => location === origin + pathname) && text.includes('status of 404 (')) (evidence.artworkExpectedConsoleErrors ??= []).push({ location, text });
    else evidence.consoleErrors.push(text);
  });
  await context.route('**/*', async route => {
    let retired = false;
    try {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) { evidence.externalRequestsBlocked.push(url.origin + url.pathname); return route.abort(); }
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (url.pathname === '/api/auth/member' || url.pathname === '/api/members/profile') {
        assert.equal(allowSignedOutProfileGets, true, 'Profile API must wait for explicit Load');
        assert.equal(request.method(), 'GET'); assert.equal(request.headers().authorization, undefined); assert.equal(request.headers().cookie, undefined);
        evidence.profileRequests.push({ path: url.pathname, method: request.method(), credentialFree: true, boundary: 'actual built Next signed-out GET; startup-denied provider transport' });
        return route.continue();
      }
      assert.equal(url.pathname, '/api/circles'); assert.equal(request.method(), 'GET'); assert.equal(request.headers().authorization, undefined); assert.equal(request.headers().cookie, undefined);
      evidence.requests.push({ method: request.method(), query: url.search });
      const response = await system.dispatch(url.pathname + url.search), body = await response.text();
      if (response.ok) { const value = JSON.parse(body); evidence.pages.push({ query: url.search, ids: value.circles?.map(circle => circle.id), page: value.page }); }
      if (holdNextPage) { holdNextPage = false; retired = true; await new Promise(resolve => { heldPage = { release: resolve }; }); }
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body });
    } catch (error) { if (retired) evidence.retiredResponses.push(String(error)); else evidence.routeErrors.push(String(error.stack || error)); try { await route.abort('failed'); } catch {} }
  });

  evidence.stage = 'global next-date pagination';
  let data = await open(page), seen = [];
  assert.equal(data.circles.length, 25); assert.match(await page.getByRole('status').textContent(), /25 Circles returned on this page/);
  for (let count = 0; count < 10; count++) { seen.push(...data.circles.map(circle => circle.id)); if (!data.page.nextCursor) break; data = await change(page, () => keyboard(page, page.getByRole('button', { name: 'Next page of results', exact: true }))); assert.ok(new URL(page.url()).searchParams.has('cursor')); }
  assert.equal(seen.length, 34); assert.equal(new Set(seen).size, 34); assert.ok(seen.includes(late)); assert.ok(seen.includes(current)); assert.equal(seen.some(id => ended.includes(id)), false);
  await change(page, () => keyboard(page, page.getByRole('button', { name: 'First page of results', exact: true }))); assert.equal(new URL(page.url()).searchParams.has('cursor'), false);
  await layout(page, 'discovery-first-page-320.png'); check('Complete eligible search traverses34 current/upcoming Circles beyond205 ended inventory rows, with25-row pages, explicit next/first controls and no total-count claim');

  evidence.stage = 'literal accent matching and tied title order';
  data = await open(page, 'q=Discovery&city=QUEBEC+montreal&format=online&sort=title&limit=7'); seen = [];
  for (let count = 0; count < 10; count++) { seen.push(...data.circles.map(circle => circle.id)); if (!data.page.nextCursor) break; data = await change(page, () => keyboard(page, page.getByRole('button', { name: 'Next page of results', exact: true }))); }
  assert.deepEqual(seen, [...matching].sort());
  data = await search(page, { 'circle-keywords': '100% [wisdom] Discovery' }); assert.equal(data.circles.length, 7); assert.equal(new URL(page.url()).searchParams.has('cursor'), false);
  data = await search(page, { 'circle-keywords': '.*' }); assert.equal(data.circles.length, 0); assert.equal(await page.getByRole('button', { name: 'Next page of results', exact: true }).count(), 0);
  data = await open(page, 'q=Needle'); assert.deepEqual(data.circles.map(circle => circle.id), [late]); await page.getByText('Upcoming Circle · first meeting', { exact: false }).waitFor();
  data = await open(page, 'q=Current+Together'); assert.deepEqual(data.circles.map(circle => circle.id), [current]); await page.getByText('Reading together now · next meeting', { exact: false }).waitFor();
  check('Actual SQL preserves accent-folded AND terms, literal punctuation and regex characters, hybrid filters and UUID tie order across title pages; a far-future match is discoverable and lifecycle wording distinguishes upcoming/current');

  evidence.stage = 'public URL reload and history';
  const first = await open(page, 'q=Discovery&sort=title'); data = await change(page, () => keyboard(page, page.getByRole('button', { name: 'Next page of results', exact: true }))); const secondHref = page.url(), secondIds = data.circles.map(circle => circle.id);
  data = await change(page, () => page.reload()); assert.deepEqual(data.circles.map(circle => circle.id), secondIds);
  data = await change(page, () => page.goBack()); assert.deepEqual(data.circles.map(circle => circle.id), first.circles.map(circle => circle.id)); assert.equal(new URL(page.url()).searchParams.has('cursor'), false);
  data = await change(page, () => page.goForward()); assert.equal(page.url(), secondHref); assert.deepEqual(data.circles.map(circle => circle.id), secondIds);
  assert.equal(new URL(await page.getByRole('link', { name: 'Link to this results page', exact: true }).getAttribute('href'), origin).href, secondHref);
  check('Opaque public cursors survive actual reload and Back/Forward, restore the exact result page, and match the shareable link');

  evidence.stage = 'verified reading context and primary start action';
  const contextQuery = new URLSearchParams({ book: 'hamlet', edition: hamlet.editionId, from: '12', to: '22' }); data = await open(page, String(contextQuery)); assert.deepEqual(data.circles.map(circle => circle.id), [bookCircle]);
  let start = new URL(await startLink(page).getAttribute('href'), origin); assert.equal(start.searchParams.get('from'), '12'); assert.equal(start.searchParams.get('to'), '22'); assert.equal(start.searchParams.get('edition'), hamlet.editionId);
  await change(page, () => keyboard(page, page.getByRole('button', { name: 'Clear search', exact: true }))); assert.equal(await startLink(page).getAttribute('href'), '/circles/start');
  await search(page, { 'circle-book': 'apology' }); start = new URL(await startLink(page).getAttribute('href'), origin); assert.equal(start.searchParams.get('book'), 'apology'); assert.equal(start.searchParams.get('from'), '0'); assert.equal(start.searchParams.has('cursor'), false);
  await change(page, () => page.goBack()); assert.equal(await startLink(page).getAttribute('href'), '/circles/start'); await change(page, () => page.goBack()); start = new URL(await startLink(page).getAttribute('href'), origin); assert.equal(start.searchParams.get('from'), '12'); assert.equal(start.searchParams.get('to'), '22');
  const priorReads = evidence.requests.length; await page.goto(`${origin}/circles?${contextQuery}&book=hamlet`); await page.getByText('This search link or its book', { exact: false }).waitFor(); assert.equal(evidence.requests.length, priorReads); assert.equal(await page.getByRole('link', { name: 'Choose a new reading plan', exact: true }).getAttribute('href'), '/circles/start');
  await layout(page, 'discovery-reading-context-320.png'); check('Exact edition/range hints remain public hints and survive the top Start action; Clear/search/Back update that primary action, and duplicate reading context never issues an unfiltered request');

  evidence.stage = 'retiring a late page';
  await open(page, 'q=Discovery'); holdNextPage = true; await keyboard(page, page.getByRole('button', { name: 'Next page of results', exact: true }));
  for (let count = 0; count < 100 && !heldPage; count++) await pause(10); assert.ok(heldPage); assert.equal(await page.locator('[data-circle-id]').count(), 0);
  data = await search(page, { 'circle-keywords': 'Needle' }); assert.deepEqual(data.circles.map(circle => circle.id), [late]); const held = heldPage; heldPage = null; held.release(); await pause(150); assert.deepEqual(await page.locator('[data-circle-id]').evaluateAll(elements => elements.map(element => element.dataset.circleId)), [late]); assert.equal(new URL(page.url()).searchParams.has('cursor'), false);
  check('Applying new filters while a real old page response is held clears old rows immediately, resets its cursor and fences the released late page');

  evidence.stage = 'unavailable and calendar restart';
  system.transformRpc(() => ({ data: null, error: { code: 'FIXTURE_UNAVAILABLE', message: 'PRIVATE_SYNTHETIC_DATABASE_DETAIL' } }));
  await change(page, () => keyboard(page, page.getByRole('button', { name: 'First page of results', exact: true })), 503); await page.getByText('Circles could not be loaded.', { exact: false }).waitFor(); assert.equal(await page.locator('[data-circle-id]').count(), 0); assert.doesNotMatch(await page.textContent('main'), /PRIVATE_SYNTHETIC_DATABASE_DETAIL|No matches were returned/); system.transformRpc(null);
  data = await change(page, () => keyboard(page, page.getByRole('button', { name: 'Try again', exact: true }))); assert.deepEqual(data.circles.map(circle => circle.id), [late]);
  data = await open(page, 'q=Discovery'); const expired = JSON.parse(Buffer.from(data.page.nextCursor, 'base64url').toString('utf8')); expired.calendarKey = '0'.repeat(64);
  const stale = new URLSearchParams({ q: 'Discovery', cursor: Buffer.from(JSON.stringify(expired)).toString('base64url') });
  await change(page, () => page.goto(`${origin}/circles?${stale}`), 409); await page.getByRole('button', { name: 'Restart current search', exact: true }).waitFor(); assert.equal(await page.locator('[data-circle-id]').count(), 0); assert.doesNotMatch(await page.textContent('main'), /No matches were returned/);
  await change(page, () => keyboard(page, page.getByRole('button', { name: 'Restart current search', exact: true }))); assert.equal(new URL(page.url()).searchParams.get('q'), 'Discovery'); assert.equal(new URL(page.url()).searchParams.has('cursor'), false);
  assert.equal(await page.getByRole('heading', { name: 'Current results page', exact: true }).evaluate(element => element === document.activeElement), true); await page.keyboard.press('Tab'); assert.equal(await page.getByRole('button', { name: 'First page of results', exact: true }).evaluate(element => element === document.activeElement), true); await layout(page, 'discovery-restarted-320.png');
  check('A synthetic RPC failure produces actual generic503 and retry without false emptiness; a structurally valid stale calendar key reaches actual SQL409, offers explicit restart retaining filters, and returns keyboard focus to results');

  evidence.stage = 'canonical Quest Browser entry';
  const publicRequestsBeforeQuest = evidence.requests.length;
  await page.goto(`${origin}/quest`);
  await page.getByRole('heading', { name: 'Your Circle in Quest Browser', exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Find a Circle', exact: true }).getAttribute('href'), '/circles');
  await page.goto(`${origin}/quest/${matching[0]}`);
  await page.getByRole('heading', { name: 'Quest Browser Circle', exact: true }).waitFor();
  assert.equal(await page.locator('#circle-draft').isDisabled(), true);
  assert.equal(await page.locator('#member-session-check').isDisabled(), true);
  assert.equal(await page.locator('#circle-refresh').isDisabled(), true);
  assert.equal(await page.locator('#circle-archive-open').isDisabled(), true);
  assert.equal(await page.locator('#circle-close').isDisabled(), true);
  assert.equal(await page.locator('#circle-messages').textContent(), '');
  assert.equal(await page.locator('#circle-archive').isVisible(), false);
  await keyboard(page, page.getByRole('button', { name: 'Connect signed-in account', exact: true }));
  await page.getByText('This view needs a secure connection.', { exact: false }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Disconnect Circle view', exact: true }).isDisabled(), true);
  assert.equal(evidence.requests.length, publicRequestsBeforeQuest, 'Quest entry must not provision or read private APIs before connecting');
  assert.equal(await page.getByRole('link', { name: 'Regular Circle view and safety controls', exact: true }).getAttribute('href'), `/circles/${matching[0]}`);
  assert.equal(await page.getByRole('link', { name: 'Full discussion archive', exact: true }).getAttribute('href'), `/circles/${matching[0]}/discussion`);
  assert.equal(new URL(await page.getByRole('link', { name: 'Sign in to your account', exact: true }).getAttribute('href'), origin).searchParams.get('next'), `/quest/${matching[0]}`);
  await layout(page, 'canonical-quest-entry-320.png');
  check('Canonical Quest Browser routes expose the actual member view, accessible 320px controls and same-Circle fallback links; HTTP fails closed, no private API/provider call occurs, and no synthetic member or immersive claim is introduced. Configured HTTPS/provider acceptance remains a separate gate');

  evidence.stage = 'canonical reviewed clips';
  const clipReads = [], observeClip = request => { const url = new URL(request.url()); if (url.pathname.startsWith('/clips/media/') || url.pathname.startsWith('/clips/captions/')) clipReads.push({ path: url.pathname, cookie: request.headers().cookie ?? null, referer: request.headers().referer ?? null }); };
  page.on('request', observeClip);
  await context.addCookies([{ name: 'SOE_SYNTHETIC_PRIVACY_CHECK', value: 'LOCAL_FIXTURE_ONLY', url: origin }]);
  await page.goto(`${origin}/clips`); await page.getByRole('heading', { name: 'Clips & passages', exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Read in context', exact: true }).count(), 3);
  assert.equal(await page.locator('video,audio').count(), 0); assert.deepEqual(clipReads, []);
  await keyboard(page, page.getByRole('button', { name: 'Load video and captions', exact: true }));
  await page.getByText('Files verified. Use the player controls to start;', { exact: false }).waitFor();
  assert.equal(clipReads.length, 2); assert.ok(clipReads.every(read => read.cookie === null && read.referer === null));
  const video = page.locator('video'); assert.equal(await video.evaluate(element => element.paused && !element.autoplay), true);
  const decoded = await video.evaluate(async element => { await element.play(); await new Promise(resolve => setTimeout(resolve, 100)); element.pause(); return { width: element.videoWidth, height: element.videoHeight, duration: element.duration, source: element.currentSrc }; });
  assert.equal(decoded.width, 720); assert.equal(decoded.height, 404); assert.ok(decoded.duration > 23 && decoded.duration < 25); assert.match(decoded.source, /^blob:/);
  await page.waitForFunction(() => document.querySelector('video')?.textTracks[0]?.cues?.length === 6);
  assert.equal(await video.evaluate(element => element.textTracks[0].mode), 'showing');
  await video.evaluate(async element => { const seeked = new Promise(resolve => element.addEventListener('seeked', resolve, { once: true })); element.currentTime = 12.2; await seeked; });
  evidence.decodedClipFrames = [];
  for (let index = 0; index < 6; index++) {
    const frame = await video.evaluate(async (element, seconds) => { const seeked = new Promise(resolve => element.addEventListener('seeked', resolve, { once: true })); element.currentTime = seconds; await seeked; await new Promise(resolve => setTimeout(resolve, 100)); const canvas = document.createElement('canvas'); canvas.width = element.videoWidth; canvas.height = element.videoHeight; canvas.getContext('2d').drawImage(element, 0, 0); return canvas.toDataURL('image/png'); }, index * 4 + 2);
    const bytes = Buffer.from(frame.split(',')[1], 'base64'), file = `evidence/circle-intro-decoded-frame-${index + 1}.png`; fs.writeFileSync(file, bytes); evidence.decodedClipFrames.push({ second: index * 4 + 2, file, sha256: hash(bytes) });
  }
  await layout(page, 'canonical-clips-playback-320.png');
  await keyboard(page, page.getByRole('button', { name: 'Unload clip', exact: true })); assert.equal(await page.locator('video,audio').count(), 0);
  await page.getByText('No media has been loaded.', { exact: false }).waitFor(); page.off('request', observeClip);
  check('Actual built Next clip catalog and media/caption gateways expose three source-linked passages plus the original SoE MP4; explicit Load sends no account cookie/referrer, hashes verify, H264 decodes at720x404 with six caption cues and no autoplay, and Unload removes the player at320px');

  evidence.stage = 'canonical profile initial page and explicit signed-out load';
  await context.clearCookies();
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto(`${origin}/account/profile`);
  await page.getByRole('heading', { name: 'Your profile', exact: true }).waitFor();
  await page.getByRole('status').filter({ hasText: 'Load your profile to edit it.' }).waitFor();
  await page.waitForLoadState('networkidle');
  assert.equal(evidence.profileRequests.length, 0, 'Initial profile page must not read auth/private APIs');
  assert.equal(await page.getByLabel('Display name', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('region', { name: 'Public profile preview' }).count(), 0);
  const profileLoad = page.getByRole('button', { name: 'Load your profile', exact: true });
  await profileLoad.focus(); assert.equal(await profileLoad.evaluate(element => element === document.activeElement), true);
  await layout(page, 'profile-initial-320.png');
  evidence.profileInitial = { initialAuthOrPrivateRequests: 0, viewportWidth: 320, screenshot: 'evidence/profile-initial-320.png', screenshotSHA256: hash(fs.readFileSync('evidence/profile-initial-320.png')) }; progress();
  allowSignedOutProfileGets = true;
  const authorityResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/member', { timeout: 5000 });
  const ownerResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/members/profile', { timeout: 5000 });
  await keyboard(page, profileLoad);
  const [authority, owner] = await Promise.all([authorityResponse, ownerResponse]);
  assert.equal(authority.status(), 401); assert.equal(owner.status(), 401);
  evidence.profileResponse = { authorityStatus: authority.status(), ownerStatus: owner.status(), ownerErrorBodyRead: false, reason: 'Product UI checks non-OK owner status and deliberately does not consume its error JSON body.' }; progress();
  assert.equal((await bounded('Auth authority JSON body', () => authority.json())).session, 'signed_out');
  assert.match(owner.headers()['cache-control'], /no-store/);
  await page.getByRole('status').filter({ hasText: 'Sign in to load your profile.' }).waitFor();
  allowSignedOutProfileGets = false;
  assert.deepEqual(evidence.profileRequests.map(request => request.path), ['/api/auth/member', '/api/members/profile']);
  assert.equal(await page.getByLabel('Display name', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: /^Save / }).count(), 0);
  await layout(page, 'profile-signed-out-320.png');
  check('Actual built Next profile page uses canonical 320px CSS and 44px keyboard controls, with no auth/private/provider transport on initial render; explicit Load alone reaches actual cookie/token-free auth/member and owner-profile GET401 routes, shows generic sign-in state, and exposes no editable fields or false saved state');

  evidence.stage = 'nonpublic artwork and first-party share card'; progress();
  const artwork = JSON.parse(fs.readFileSync('../../archive/unverified-hero-images/manifest.json'));
  evidence.artworkRequests = [];
  evidence.artworkExpectedPaths = artwork.assets.flatMap(asset => ['/' + asset.originalPublicPath.replace(/^public\//, ''), '/' + asset.archivePath]);
  for (const asset of artwork.assets) {
    assert.equal(asset.publishable, false);
    for (const pathname of ['/' + asset.originalPublicPath.replace(/^public\//, ''), '/' + asset.archivePath]) {
      const status = await bounded('Nonpublic artwork request', () => page.evaluate(async pathname => {
        const response = await fetch(pathname, { credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error' });
        await response.body?.cancel(); return response.status;
      }, pathname));
      assert.equal(status, 404, pathname);
      evidence.artworkRequests.push({ pathname, status, credentials: 'none' });
    }
  }
  const share = await bounded('First-party share card response', () => page.evaluate(async () => {
    const response = await fetch('/opengraph-image', { credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error' });
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { status: response.status, type: response.headers.get('content-type'), bytes: bytes.length,
      signature: [...bytes.slice(0, 8)].map(x => x.toString(16).padStart(2, '0')).join(''),
      sha256: [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('') };
  }));
  assert.equal(share.status, 200); assert.match(share.type, /^image\/png/);
  assert.ok(share.bytes < 2_000_000); assert.equal(share.signature, '89504e470d0a1a0a');
  evidence.firstPartyShareCard = { pathname: '/opengraph-image', ...share };
  check('All12 retained hero images are404 at both former public and archive URLs on the actual built server; the existing first-party text/gradient share card returns a valid bounded PNG without provider transport');

  assert.deepEqual(evidence.externalRequestsBlocked, []); assert.deepEqual(evidence.pageErrors, []); assert.deepEqual(evidence.routeErrors, []); assert.deepEqual(evidence.consoleErrors.filter(text => !text.includes('net::ERR_FAILED') && ![409, 503].some(status => text.includes(`status of ${status} (`))), []);
  evidence.status = 'PASS'; evidence.stage = 'complete';
} catch (error) { failed = error; evidence.status = 'FAIL'; evidence.error = String(error.stack || error); progress(); }
finally {
  heldPage?.release();
  evidence.cleanupStage = 'browser'; progress();
  if (browser) try { await bounded('Owned browser close', () => browser.close()); } catch (error) {
    evidence.cleanupErrors.push(String(error));
    try { signalOwnedChrome('SIGTERM'); for (let count = 0; count < 20 && ownedChrome().includes(ownedBrowserPid); count++) await pause(50); if (ownedChrome().includes(ownedBrowserPid)) signalOwnedChrome('SIGKILL'); } catch (cleanupError) { evidence.cleanupErrors.push(String(cleanupError)); }
  }
  evidence.cleanupStage = 'database'; progress();
  if (system) try { await bounded('Owned disposable database close', () => system.close()); } catch (error) { evidence.cleanupErrors.push(String(error)); }
  evidence.cleanupStage = 'server'; progress();
  if (server?.pid) { try { process.kill(-server.pid, 'SIGTERM'); } catch {} for (let count = 0; count < 50 && await portOpen(); count++) await pause(100); evidence.ownedServerStopped = !(await portOpen()); if (!evidence.ownedServerStopped) evidence.cleanupErrors.push('Owned server did not stop'); }
  if (evidence.cleanupErrors.length) { failed ??= Error(evidence.cleanupErrors.join('; ')); evidence.status = 'FAIL'; }
  evidence.cleanupStage = 'complete';
  evidence.finishedAt = new Date().toISOString(); fs.mkdirSync('evidence', { recursive: true }); fs.writeFileSync('evidence/browser-discovery-qa.json', JSON.stringify(evidence, null, 2) + '\n');
  if (failed) { process.stderr.write(String(failed.stack || failed) + '\n'); process.exitCode = 1; } else process.stdout.write(JSON.stringify({ status: evidence.status, checks: evidence.checks.length, ownedServerStopped: evidence.ownedServerStopped }) + '\n');
}
