import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const ROOT = process.cwd(), base = process.env.SOE_A11Y_BASE_URL, PREFIX = process.env.SOE_A11Y_EVIDENCE_PREFIX ?? 'verification/web/evidence/circle-accessibility-baseline';
assert(/^verification\/web\/evidence\/circle-accessibility-baseline(?:-[a-z0-9-]+)?$/.test(PREFIX), 'Use a bounded new evidence prefix');
assert(base && /^http:\/\/127\.0\.0\.1:[0-9]+$/.test(base), 'Use the owned built Next server URL');
assert(process.execArgv.some(v => v.endsWith('/deny-build-network.cjs')), 'Startup network denial required');
const buildReceipt = process.env.SOE_A11Y_BUILD_RECEIPT ?? 'verification/web/evidence/circle-reviewer-parity-next-build.json';
const buildSources = process.env.SOE_A11Y_BUILD_SOURCES ?? 'verification/web/evidence/circle-reviewer-parity-build-source-sha256.json';
const serverReceipt = process.env.SOE_A11Y_SERVER_RECEIPT ?? 'verification/web/evidence/built-shell-server-ready.json';
for (const name of [buildReceipt, buildSources, serverReceipt]) assert(/^verification\/web\/evidence\/[a-z0-9-]+\.json$/.test(name), 'Use a known current build evidence leaf');
const circleId = 'a1111111-1111-4111-8111-111111111111', memberId = 'b2222222-2222-4222-8222-222222222222';
const stamp = '2026-11-05T12:00:00Z', circleTitle = 'Synthetic keyboard reading Circle';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function read(name) { const p = path.isAbsolute(name) ? name : path.join(ROOT, name), s = fs.lstatSync(p); assert(s.isFile() && !s.isSymbolicLink() && (!s.size || s.blocks), 'Unavailable exact input: ' + name); return fs.readFileSync(p); }
const result = { status: 'RUNNING', startedAt: new Date().toISOString(), base, observations: [], findings: [], requests: [], externalRequestsBlocked: [], errors: [], screenshots: [], sourceHashes: {}, runtimeHashes: {}, cleanup: { browser: 'pending' },
  scope: 'Current built Next router, shell and production components; cached Chromium. Public discovery and private Circle/member/discussion HTTP replies are explicit synthetic projections validated by current parsers. The member reply uses the supported wallet-cookie provider branch at the HTTP seam; no cookie, wallet, key or verified real session is created. No real identity, account, email delivery, provider, key, SQL authorization, device or screen-reader acceptance is claimed. CSS zoom is used as a bounded 200% content-scale stress, separately from the actual 320px viewport.' };
const output = suffix => path.join(ROOT, PREFIX + suffix);
const write = () => fs.writeFileSync(output('.json'), JSON.stringify(result, null, 2) + '\n');
assert(!fs.existsSync(output('.json')), 'Preserve prior baseline evidence');
const observe = (name, evidence) => { result.observations.push({ name, evidence }); write(); console.log('OBSERVED ' + name); };
const focusRegressions = observations => {
  const evidence = name => observations.find(value => value.name === name)?.evidence;
  const cancel = evidence('Participation cancel focus'), failure = evidence('Discussion failed preview focus and live outcome')?.focus;
  const mode = evidence('Sign-in to account-creation mode focus'), menu = evidence('Public mobile menu label, expanded state and Escape');
  return [
    { name: 'Cancel restores its participation trigger', pass: cancel?.tag === 'BUTTON' && cancel?.text === 'Join this Circle' },
    { name: 'Failed preview focuses its live outcome', pass: failure?.role === 'status' && failure?.text.includes('exact preview could not be verified') },
    { name: 'Account-mode switch focuses its new heading', pass: mode?.tag === 'H1' && mode?.id === 'login-title' && mode?.text === 'Create an account' },
    { name: 'Mobile menu has a meaningful name and disclosure state', pass: Boolean(menu?.before.ariaLabel?.trim()) && menu?.before.expanded === 'false' && Boolean(menu?.before.controls) },
    { name: 'Escape closes the mobile menu', pass: menu?.afterEscapeExpanded === 'false' && menu?.afterEscapeText?.trim() !== '×' },
    { name: 'Open mobile menu keeps keyboard focus out of covered form', pass: Boolean(menu?.tabTrace?.length) && !menu.tabTrace.some(item => item.id === 'login-email' || item.text === 'Continue with Google' || item.text === 'Connect wallet') },
  ];
};
const finding = (id, title, evidence) => { result.findings.push({ id, title, evidence }); write(); };
let browser, context, page, discoveryFail = false, detailFail = false, previewFail = false;

try {
  for (const name of ['verification/web/tests/browser-circle-accessibility-baseline.mjs', 'verification/web/scripts/deny-build-network.cjs',
    'app/circles/page.tsx', 'app/circles/CirclesBrowser.tsx', 'app/circles/[circleId]/page.tsx', 'app/circles/[circleId]/CircleDetail.tsx',
    'app/circles/[circleId]/discussion/page.tsx', 'app/circles/[circleId]/discussion/DiscussionBrowser.tsx', 'app/circles/messages/CircleSafetyNav.tsx',
    'app/login/page.tsx', 'app/auth/recovery/Recovery.tsx', 'components/PublicNav.tsx', 'lib/circles/discovery-page.ts', 'lib/circles/membership.ts',
    'lib/circles/thread.ts', 'lib/auth/getSession.ts', 'lib/getAuthenticatedMember.ts', 'lib/auth/memberDto.ts', 'lib/circles/client.ts', 'lib/circles/useCircleParticipation.ts', 'lib/circles/useReviewAccess.ts', 'platforms/tests/load-source.mjs', '.next/BUILD_ID',
    buildReceipt, buildSources, serverReceipt]) result.sourceHashes[name] = sha(read(name));
  const build = JSON.parse(read(buildSources));
  for (const [name, digest] of Object.entries(result.sourceHashes)) if (Object.hasOwn(build, name)) assert.equal(digest, build[name], 'Source changed since current build: ' + name);
  const { sourceLoader } = await import('../../../platforms/tests/load-source.mjs');
  const load = sourceLoader(), { parseDiscoveryPage } = load('lib/circles/discovery-page.ts'), { parseCircleDetail } = load('lib/circles/membership.ts');
  const { parseDiscussionPage, parseDiscussionPreview } = load('lib/circles/thread.ts');
  const circle = { id: circleId, title: circleTitle, description: 'A fictional public-library reading discussion used only for keyboard verification.',
    format: 'in_person', format_label: 'In person', city: 'Boston', region: 'Massachusetts', venue_name: 'Synthetic public library', venue_label: 'Public library',
    meeting_label: 'Thursday at 19:00 UTC', weekday: 4, time: '19:00', timezone: 'UTC', start_date: '2026-11-12', first_meeting: '2026-11-12', next_meeting: '2026-11-12',
    week: 1, reading: { week: 1, title: 'Synthetic reading', slug: 'synthetic-reading', author: 'Synthetic author', selection: 'A short fictional excerpt.' }, reading_program: null,
    program_length: 12, member_count: 3, max_members: 8, spots_left: 5, status: 'forming', host_name: 'Synthetic Host', publicProfileId: null, going_next: null, hidden: false, phase: 'upcoming' };
  const discovery = { ready: true, circles: [circle], page: { limit: 25, nextCursor: null, asOf: stamp } };
  const detail = { ready: true, circle, revision: 4, viewer: { signed_in: true, is_member: false, is_host: false }, ended: false,
    capabilities: { canJoin: true, canLeave: false, canRsvp: false, canComplete: false, canReadConversation: false }, meetings: [{ date: '2026-11-12', going: 0, my_status: null }], online_url: null };
  const discussion = { kind: 'archive', circleId, items: [], nextCursor: null, limit: 25 };
  assert(parseDiscoveryPage(discovery)); assert(parseCircleDetail(detail, circleId)); assert(parseDiscussionPage(discussion, { circleId, kind: 'archive', limit: 25 }));
  const pw = '/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/', executablePath = '/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
  for (const name of [process.execPath, executablePath, ...['playwright/package.json', 'playwright/index.js', 'playwright-core/package.json', 'playwright-core/index.js', 'playwright-core/browsers.json', 'playwright-core/lib/bootstrap.js', 'playwright-core/lib/coreBundle.js', 'playwright-core/lib/utilsBundle.js'].map(n => pw + n), 'node_modules/typescript/package.json', 'node_modules/typescript/lib/typescript.js']) result.runtimeHashes[name] = sha(read(name));
  browser = await createRequire(pw + 'playwright/package.json')('playwright').chromium.launch({ executablePath, headless: true, env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' }, args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'] });
  context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', acceptDownloads: false });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base) { result.externalRequestsBlocked.push({ origin: url.origin, path: url.pathname }); await route.abort(); return; }
    if (!url.pathname.startsWith('/api/')) { await route.continue(); return; }
    let status = 200, body;
    if (url.pathname === '/api/circles') { status = discoveryFail ? 503 : 200; body = discoveryFail ? { error: 'Synthetic discovery outage' } : discovery; }
    else if (url.pathname === '/api/auth/member') body = { member: { id: memberId, display_name: 'Synthetic QA Explorer' }, auth: { provider: 'wallet', subject: memberId } };
    else if (url.pathname === `/api/circles/${circleId}`) { status = detailFail ? 503 : 200; body = detailFail ? { error: 'Synthetic detail outage' } : detail; }
    else if (url.pathname === `/api/circles/${circleId}/discussion` && request.method() === 'GET') body = discussion;
    else if (url.pathname === `/api/circles/${circleId}/discussion/preview` && request.method() === 'POST') {
      const input = request.postDataJSON(); assert.equal(input.parentMessageId, null);
      status = previewFail ? 503 : 200; body = previewFail ? { error: 'Synthetic preview outage' } : { ...input, circleId, parent: null, content: input.comment, contentHash: 'a'.repeat(64), reviewKey: 'b'.repeat(64), commentLimit: 2000 };
      if (!previewFail) assert(parseDiscussionPreview(body));
    } else { result.errors.push('Unexpected API request: ' + request.method() + ' ' + url.pathname); status = 503; body = { error: 'Unconfigured synthetic API' }; }
    result.requests.push({ method: request.method(), path: url.pathname, status, synthetic: true });
    await route.fulfill({ status, contentType: 'application/json', headers: { 'cache-control': 'private, no-store' }, body: JSON.stringify(body) });
  });
  page = await context.newPage(); page.setDefaultTimeout(8000); page.on('pageerror', error => result.errors.push(String(error)));
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const active = () => page.evaluate(() => { const e = document.activeElement, r = e?.getBoundingClientRect(), s = e ? getComputedStyle(e) : null; return { documentFocused: document.hasFocus(), nativeModalOpen: Boolean(document.querySelector('dialog:modal')), tag: e?.tagName, id: e?.id, text: (e?.innerText || e?.textContent || '').trim().slice(0, 180), label: e?.getAttribute('aria-label'), inModal: Boolean(e?.closest('dialog')?.matches(':modal')), role: e?.getAttribute('role'), outline: s ? { style: s.outlineStyle, width: s.outlineWidth, color: s.outlineColor } : null, rect: r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null }; });
  const enter = async locator => { await locator.waitFor(); const element = await locator.elementHandle(); await page.waitForFunction(e => Object.keys(e).some(key => key.startsWith('__reactProps$')), element); const navigates = await locator.evaluate(e => e.tagName === 'A'); await locator.focus(); await page.keyboard.press('Enter'); if (!navigates) await settle(); };
  const metrics = () => page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth, zoom: getComputedStyle(document.documentElement).zoom }));
  async function screenshot(name) { const leaf = PREFIX + '-' + name + '.png'; await page.screenshot({ path: path.join(ROOT, leaf), fullPage: true }); result.screenshots.push(leaf); }
  async function layoutCheck(name) {
    await page.setViewportSize({ width: 320, height: 850 }); await settle(); const narrow = await metrics(); await screenshot(name + '-320');
    await page.setViewportSize({ width: 1280, height: 900 }); await page.evaluate(() => { document.documentElement.style.zoom = '2'; }); await settle(); const scaled = await metrics();
    observe(name + ' narrow and 200% content-scale layout', { narrow, scaled });
    if (narrow.scrollWidth > narrow.width + 1 || scaled.scrollWidth > scaled.width + 1) finding(name + '-overflow', 'Horizontal page overflow during narrow or scaled layout', { narrow, scaled });
    await page.evaluate(() => { document.documentElement.style.zoom = ''; });
  }
  async function goto(url) { await page.goto(base + url); await page.bringToFront(); await settle(); }
  async function tabTrace(count = 10, key = 'Tab') { const trace = []; for (let i = 0; i < count; i++) { await page.keyboard.press(key); trace.push(await active()); } return trace; }

  await goto('/circles'); await page.getByRole('link', { name: 'View circle: ' + circleTitle }).waitFor();
  const initialTrace = await tabTrace(12); observe('Built discovery shell keyboard order', initialTrace);
  await page.getByLabel('Reading, topic or circle name').focus(); await page.keyboard.type('friendship'); await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: 'Current results page' }).waitFor(); await settle();
  observe('Discovery search keyboard submission and results focus', { focus: await active(), url: new URL(page.url()).pathname + new URL(page.url()).search, status: await page.getByRole('status').allTextContents() });
  discoveryFail = true; await enter(page.getByRole('button', { name: 'Search', exact: true })); await page.getByRole('button', { name: 'Try again', exact: true }).waitFor();
  observe('Discovery error outcome', { focus: await active(), status: await page.getByRole('status').allTextContents() });
  discoveryFail = false; await enter(page.getByRole('button', { name: 'Try again', exact: true })); await page.getByRole('heading', { name: 'Current results page' }).waitFor(); await settle();
  observe('Discovery retry focus', await active());
  await page.keyboard.press('Shift+Tab'); observe('Discovery reverse keyboard step', await active());
  await page.setViewportSize({ width: 320, height: 850 }); await settle(); observe('Discovery 320px reflow', await metrics()); await screenshot('discovery-320');
  await page.setViewportSize({ width: 1280, height: 900 }); await page.evaluate(() => { document.documentElement.style.zoom = '2'; }); await settle(); observe('Discovery 200% CSS content scale', await metrics()); await screenshot('discovery-200percent');
  await page.evaluate(() => { document.documentElement.style.zoom = ''; });

  await enter(page.getByRole('link', { name: 'View circle: ' + circleTitle })); await page.getByRole('button', { name: 'Load current Circle access', exact: true }).waitFor();
  await enter(page.getByRole('button', { name: 'Load current Circle access', exact: true })); await page.getByRole('button', { name: 'Join this Circle', exact: true }).waitFor();
  await layoutCheck('circle-detail');
  await enter(page.getByRole('button', { name: 'Join this Circle', exact: true })); await page.getByRole('heading', { name: 'Review participation change' }).waitFor();
  observe('Participation review heading and checkbox keyboard path', { focus: await active(), tab: await tabTrace(1), label: await page.getByRole('checkbox').getAttribute('aria-label') });
  await enter(page.getByRole('button', { name: 'Cancel participation change', exact: true }));
  const afterCancel = await active(); observe('Participation cancel focus', afterCancel);
  if (afterCancel.tag === 'BODY') finding('participation-cancel-focus', 'Cancelling participation review loses keyboard focus to the document body', afterCancel);
  detailFail = true; await enter(page.getByRole('button', { name: 'Load current Circle access', exact: true })); await page.waitForFunction(() => !document.querySelector('[aria-label="Confirm participation change"]'));
  await settle(); observe('Circle detail error outcome', { focus: await active(), status: await page.getByRole('status').allTextContents() }); detailFail = false;

  await goto(`/circles/${circleId}/discussion`); await enter(page.getByRole('button', { name: 'Load current discussion archive', exact: true })); await page.getByRole('heading', { name: 'Discussion archive', exact: true }).waitFor();
  observe('Discussion archive focus', await active());
  await enter(page.getByRole('button', { name: 'Write a new Circle message', exact: true })); await page.getByRole('heading', { name: 'Write a new message', exact: true }).waitFor();
  await page.keyboard.press('Tab'); await page.keyboard.type('Synthetic keyboard preview only. This is not a real post.');
  await enter(page.getByRole('button', { name: 'Prepare discussion preview', exact: true })); await page.getByRole('heading', { name: 'Review the complete discussion message' }).waitFor();
  await layoutCheck('discussion-preview');
  observe('Discussion preview focus and confirmation access', { focus: await active(), tab: await tabTrace(1), postDisabled: await page.getByRole('button', { name: 'Post reviewed discussion message' }).isDisabled() });
  await enter(page.getByRole('button', { name: 'Edit this draft before posting', exact: true })); observe('Discussion return to draft focus', await active());
  previewFail = true; await enter(page.getByRole('button', { name: 'Prepare discussion preview', exact: true })); await page.waitForFunction(() => document.body.textContent.includes('exact preview could not be verified'));
  const failedPreview = await active(); observe('Discussion failed preview focus and live outcome', { focus: failedPreview, status: await page.getByRole('status').allTextContents() });
  if (failedPreview.tag === 'BODY') finding('discussion-preview-error-focus', 'A failed discussion preview removes the focused control and leaves focus on the document body', failedPreview);
  assert(!result.requests.some(r => r.path === `/api/circles/${circleId}/discussion` && r.method === 'POST'), 'No real or synthetic discussion post was requested');

  await goto('/login'); await page.getByLabel('Email', { exact: true }).waitFor(); await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
  await enter(page.getByRole('button', { name: 'Sign in', exact: true })); observe('Empty sign-in validation and live outcome', { focus: await active(), status: await page.getByRole('status').allTextContents(), emailLabelCount: await page.getByLabel('Email', { exact: true }).count(), passwordLabelCount: await page.getByLabel('Password', { exact: true }).count() });
  await enter(page.getByRole('button', { name: 'Create account', exact: true })); await page.getByRole('heading', { name: 'Create an account', exact: true }).waitFor();
  const afterMode = await active(); observe('Sign-in to account-creation mode focus', afterMode);
  if (afterMode.tag === 'BODY') finding('login-mode-focus', 'Switching account mode removes the focused button without placing focus in the new form', afterMode);
  await enter(page.getByRole('button', { name: 'Sign in instead', exact: true }));
  await page.setViewportSize({ width: 320, height: 850 }); await settle(); observe('Login 320px reflow', await metrics());
  const menu = page.locator('button.show-mobile'); await menu.focus(); const menuBefore = { text: await menu.textContent(), ariaLabel: await menu.getAttribute('aria-label'), expanded: await menu.getAttribute('aria-expanded'), controls: await menu.getAttribute('aria-controls') };
  await page.keyboard.press('Enter'); await settle();
  const fixed = process.env.SOE_A11Y_EXPECT_FIXED === '1';
  if (fixed) {
    assert.equal(await menu.getAttribute('aria-label'), 'Open navigation');
    assert.equal(await menu.getAttribute('aria-expanded'), 'true');
    assert(await page.getByRole('dialog', { name: 'Site navigation' }).evaluate(e => e.matches(':modal')));
    assert.equal((await active()).label, 'Close navigation');
  }
  const menuTrace = await tabTrace(14), reverseMenuTrace = await tabTrace(14, 'Shift+Tab');
  observe('Mobile dialog keyboard trace diagnostic', { forward: menuTrace, reverse: reverseMenuTrace });
  if (fixed) {
    assert([...menuTrace, ...reverseMenuTrace].every(item => item.nativeModalOpen && (item.inModal || item.tag === 'BODY' && !item.documentFocused)), 'Document focus stays inside the modal; browser-chrome excursions cannot focus covered controls');
    if (!(await active()).documentFocused) await page.keyboard.press('Tab');
    assert((await active()).inModal, 'Tab returns from browser chrome into the open dialog');
    observe('Native modal browser-chrome excursions and keyboard re-entry', { excursions: [...menuTrace, ...reverseMenuTrace].filter(item => !item.documentFocused).length, reentry: await active() });
  }
  await screenshot('login-menu-320'); await page.keyboard.press('Escape'); await settle();
  const menuAfterEscape = await menu.textContent(); observe('Public mobile menu label, expanded state and Escape', { before: menuBefore, afterEscapeText: menuAfterEscape, afterEscapeExpanded: await menu.getAttribute('aria-expanded'), focus: await active(), tabTrace: menuTrace, reverseTabTrace: reverseMenuTrace });
  if (!menuBefore.ariaLabel || menuBefore.expanded === null) finding('mobile-menu-semantics', 'Public mobile menu uses only a glyph label and omits its expanded state and controlled region', menuBefore);
  if (menuAfterEscape?.trim() === '×') finding('mobile-menu-escape', 'Escape does not close the full-screen public navigation overlay', { afterEscapeText: menuAfterEscape });
  if (menuTrace.some(item => item.id === 'login-email' || item.text === 'Continue with Google')) finding('mobile-menu-background-focus', 'Tab moves from the open full-screen menu into covered sign-in controls', menuTrace);
  if (await menu.getAttribute('aria-expanded') === 'true' || (await menu.textContent())?.trim() === '×') { await menu.focus(); await page.keyboard.press('Enter'); await settle(); }
  if (fixed) {
    assert.equal((await active()).label, 'Open navigation', 'Escape returns focus to the opener');
    await enter(menu); await enter(page.getByRole('button', { name: 'Close navigation', exact: true }));
    assert.equal(await menu.getAttribute('aria-expanded'), 'false');
    assert.equal((await active()).label, 'Open navigation', 'Close returns focus to the opener');
    await page.setViewportSize({ width: 320, height: 300 }); await enter(menu);
    const dialog = page.getByRole('dialog', { name: 'Site navigation' });
    await dialog.getByRole('link').last().focus();
    const shortLayout = await dialog.evaluate(e => ({ scrollHeight: e.scrollHeight, clientHeight: e.clientHeight, width: e.getBoundingClientRect().width, activeRect: (() => { const r = document.activeElement.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; })(), viewportHeight: innerHeight }));
    assert(shortLayout.width <= 320 && shortLayout.activeRect.top >= 0 && shortLayout.activeRect.bottom <= shortLayout.viewportHeight, 'The final menu link remains reachable in a short viewport');
    await screenshot('login-menu-short');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForFunction(() => !document.querySelector('dialog[open]') && document.querySelector('button.show-mobile')?.getAttribute('aria-expanded') === 'false');
    assert.equal(await menu.getAttribute('aria-expanded'), 'false');
    const desktopFocus = await active();
    assert.equal(desktopFocus.tag, 'A'); assert.equal(desktopFocus.text, 'SOCIETY OF EXPLORERS');
    assert(await page.getByRole('navigation', { name: 'Primary navigation', exact: true }).getByRole('link', { name: 'SOCIETY OF EXPLORERS', exact: true }).evaluate(e => e === document.activeElement && e.getAttribute('href') === '/' && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0), 'Desktop resize returns focus to the visible primary brand link');
    observe('Mobile dialog keyboard containment, return focus, short viewport and desktop close', { forward: menuTrace, reverse: reverseMenuTrace, shortLayout, closedOnDesktop: true, desktopFocus });
    await page.setViewportSize({ width: 320, height: 850 });
  }
  await enter(page.getByRole('link', { name: 'Forgot your password?', exact: true })); await page.getByRole('heading', { name: 'Recover your password', exact: true }).waitFor();
  observe('Recovery entry reached by keyboard', { focus: await active(), labels: await page.getByLabel('Email', { exact: true }).count(), status: await page.getByRole('status').allTextContents(), reflow: await metrics() });
  await enter(page.getByRole('button', { name: 'Send recovery email', exact: true }));
  observe('Empty recovery form native validation', { focus: await active(), invalid: await page.getByLabel('Email', { exact: true }).evaluate(e => ({ valid: e.validity.valid, message: e.validationMessage })), syntheticRequests: result.requests.length });
  await layoutCheck('recovery');
  result.regressions = focusRegressions(result.observations);
  if (process.env.SOE_A11Y_EXPECT_FIXED === '1') {
    const baselinePath = 'verification/web/evidence/circle-accessibility-baseline-final.json', bytes = read(baselinePath);
    result.baselineWitness = { path: baselinePath, sha256: sha(bytes), regressions: focusRegressions(JSON.parse(bytes).observations) };
    assert.equal(result.baselineWitness.regressions.filter(value => !value.pass).length, 6, 'Every focused regression must reject the preserved built baseline');
    assert(result.regressions.every(value => value.pass), 'A reproduced focus regression remains: ' + result.regressions.filter(value => !value.pass).map(value => value.name).join('; '));
    assert.equal(result.findings.length, 0, 'A current accessibility finding remains');
  }
  for (const [name, digest] of Object.entries({ ...result.sourceHashes, ...result.runtimeHashes })) assert.equal(sha(read(name)), digest, 'Input changed during baseline: ' + name);
  result.status = 'BASELINE_COMPLETE';
} catch (error) { result.status = 'HARNESS_FAILED'; result.failure = String(error.stack || error); if (page) result.failurePage = await page.evaluate(() => ({ url: location.pathname, body: document.body.innerText?.slice(0, 12000), activeTag: document.activeElement?.tagName, activeText: document.activeElement?.textContent?.slice(0, 200) })).catch(() => null); process.exitCode = 1; }
finally { try { await context?.close(); await browser?.close(); result.cleanup.browser = 'closed'; } catch (error) { result.errors.push(String(error)); result.cleanup.browser = 'failed'; process.exitCode = 1; } result.finishedAt = new Date().toISOString(); write(); }
console.log(JSON.stringify({ status: result.status, observations: result.observations.length, findings: result.findings.length, errors: result.errors, evidence: PREFIX + '.json', failure: result.failure }));
