// Actual React LegacySalon/auth/rendering code. Every HTTPS request is intercepted;
// DTOs, SDK, NextLink and route params are local synthetic fixtures, not API/DB proof.
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
const origin = 'https://salon-fixture.test';
const cohortId = '33333333-3333-4333-8333-333333333333';
const endpoint = `/api/book-salons/${cohortId}`;
const dir = path.join(root, 'verification/web/evidence/legacy-salon-fixture');
const bundle = fs.readFileSync(path.join(dir, 'page.js'));
const css = fs.readFileSync(path.join(dir, fs.readdirSync(dir).find(name => name.endsWith('.css'))));
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'source-manifest.json'), 'utf8'));
const html = '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/page.css"><style>body{margin:0}</style></head><body><div id="root"></div><script type="module" src="/page.mjs"></script></body></html>';
const ids = { A: '11111111-1111-4111-8111-111111111111', B: '22222222-2222-4222-8222-222222222222' };
const subjects = { A: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const assertSources = () => { for (const [name, expected] of Object.entries(manifest.sourceHashes)) assert.equal(hash(fs.readFileSync(path.join(root, name))), expected, `Re-bundle changed source: ${name}`); };
assertSources();
const stories = [], unexpected = [], errors = [], routeErrors = [], requests = [], cleanupErrors = [];
let failure = null, ownedBrowserPID = null;
const reportPath = path.join(root, 'verification/web/evidence/legacy-salon-browser.json');
const report = () => ({ status: failure ? 'FAIL' : 'RUNNING', failure, stories, unexpected, errors, routeErrors, cleanupErrors,
  requests, sourceHashes: manifest.sourceHashes, bundleSHA256: hash(bundle), cssSHA256: hash(css), ownedBrowserPID,
  scope: manifest.scope, cssProcessing: manifest.cssProcessing, providerCalls: 0 });
const checkpoint = story => { stories.push(story); fs.writeFileSync(reportPath, JSON.stringify(report(), null, 2) + '\n'); console.log(`PASS ${stories.length}: ${story}`); };
const within = async (work, label, ms = 5000) => { let timer; try { return await Promise.race([work(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms); })]); } finally { clearTimeout(timer); } };
const browser = await chromium.launch({ headless: true, executablePath,
  env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' }, args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'] });
for (const line of execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' }).split('\n')) {
  const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
  if (match && Number(match[2]) === process.pid && match[3].startsWith(executablePath + ' ')) ownedBrowserPID = Number(match[1]);
}

try {
  async function fixture({ width = 390, clock = false, signedOut = false, wallet = false, getMode = 'normal', holdInitial = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    const page = await context.newPage(); page.setDefaultTimeout(5000);
    if (clock) await page.clock.install();
    page.on('pageerror', error => errors.push(error.message));
    const state = { account: 'A', signedOut, wallet, getMode, reads: 0, authReads: 0, posts: [], messages: [
      { id: 'historical', member_name: null, content: 'Inherited public thought.', content_available: true, created_at: null, is_mine: true },
      { id: 'unavailable', member_name: 'Published Reader', content: 'FORBIDDEN_UNAVAILABLE_RAW_TEXT', content_available: false, created_at: null, is_mine: false },
    ], membershipCount: 7, members: [{ id: 'published-membership', members: { display_name: 'Published Reader' } }],
      truncated: false, rosterTruncated: false, holdGet: holdInitial, holdPost: false, held: null, release: null,
      postMode: 'normal', readback: 'normal' };
    const dto = () => ({ cohort: { id: cohortId, book_id: 'republic', title: 'Synthetic public book salon', description: 'Public reading discussion.', status: 'active', created_at: null },
      members: structuredClone(state.members), membership_count: state.membershipCount, roster: { limit: 50, truncated: state.rosterTruncated },
      messages: structuredClone(state.messages), history: { limit: 100, truncated: state.truncated, window: 'latest' } });
    const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'Cache-Control': 'private, no-store' }, body: JSON.stringify(body) });
    await context.route('**/*', async route => {
      try {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== origin) { unexpected.push(request.url()); await route.abort(); return; }
        if (url.pathname === '/') { await route.fulfill({ contentType: 'text/html', body: html }); return; }
        if (url.pathname === '/page.mjs') { await route.fulfill({ contentType: 'text/javascript', body: bundle }); return; }
        if (url.pathname === '/page.css') { await route.fulfill({ contentType: 'text/css', body: css }); return; }
        if (url.pathname === '/api/auth/member') {
          state.authReads++; assert.equal(request.headers().authorization, undefined, 'posting selection must be cookie-only');
          if (state.signedOut) { await json(route, { session: 'signed_out', error: 'Unauthorized' }, 401); return; }
          await json(route, { member: { id: ids[state.account], display_name: `PRIVATE_PROFILE_${state.account}`, email: 'PRIVATE_EMAIL_SHOULD_NOT_RENDER' }, auth: { provider: state.wallet ? 'wallet' : 'supabase', subject: state.wallet ? 'synthetic-wallet-subject' : subjects[state.account] } });
          return;
        }
        if (url.pathname !== endpoint) { unexpected.push(request.url()); await route.abort(); return; }
        assert.equal(request.headers().referer, undefined, 'salon requests omit referrer');
        requests.push({ method: request.method(), account: state.account, selectedActorBound: request.method() === 'POST',
          bearerIsNonissuedFixture: request.headers().authorization?.startsWith('Bearer NONISSUED_SALON_') || false, referrerOmitted: true });
        if (request.method() === 'GET') {
          state.reads++; assert.equal(request.headers().authorization, undefined, 'public history needs no SDK bearer');
          const value = dto(), mode = state.getMode;
          if (state.posts.length && state.readback === 'missing') value.messages = value.messages.filter(message => !message.id.startsWith('posted-'));
          if (state.posts.length && state.readback === 'wrong-content') value.messages.at(-1).content = 'Different public content';
          if (mode === 'malformed') value.membership_count = -1;
          if (mode === 'circle') value.cohort.book_id = 'soe-circles-path';
          if (mode === 'nullable') value.cohort.title = null;
          if (mode === 'long-book-id') value.cohort.book_id = 'b'.repeat(150);
          if (state.holdGet) { state.holdGet = false; state.held = 'GET'; await new Promise(resolve => { state.release = resolve; }); state.held = null; }
          if (mode === 'unavailable' || (state.posts.length && state.readback === 'unavailable')) { await json(route, { error: 'Unavailable' }, 503); return; }
          await json(route, value); return;
        }
        assert.equal(request.method(), 'POST');
        const body = JSON.parse(request.postData()); state.posts.push(body);
        assert.deepEqual(Object.keys(body).sort(), ['content', 'expectedMemberId']);
        assert.equal(body.expectedMemberId, ids.A, 'fixture drafts were explicitly prepared under A');
        assert.equal(request.headers().authorization, state.wallet ? undefined : 'Bearer NONISSUED_SALON_A');
        if (state.postMode === 'conflict') state.account = 'B';
        if (state.postMode === 'conflict') { await json(route, { error: 'Changed actor', outcome: 'not_attempted' }, 409); return; }
        if (state.postMode === 'refused') { await json(route, { error: 'Not a member', outcome: 'not_attempted' }, 403); return; }
        const message = { id: `posted-${state.posts.length}`, member_name: 'Authored Public Name', content: body.content, content_available: true,
          created_at: '2026-11-04T16:00:00.000Z', is_mine: true };
        state.messages.push(structuredClone(message));
        if (state.holdPost) { state.holdPost = false; state.held = 'POST'; await new Promise(resolve => { state.release = resolve; }); state.held = null; }
        if (state.postMode === 'unknown') { await route.fulfill({ status: 200, contentType: 'application/json', body: 'interrupted synthetic receipt' }); return; }
        await json(route, { outcome: 'confirmed', cohortId, message });
      } catch (error) { routeErrors.push(error.stack || String(error)); try { await route.abort(); } catch {} }
    });
    await page.goto(origin);
    const waitHeld = async method => { for (let i = 0; i < 200 && state.held !== method; i++) await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(state.held, method); };
    if (!holdInitial) await page.getByRole('status').filter({ hasText: getMode === 'unavailable' || getMode === 'malformed' || getMode === 'circle' ? 'Discussion unavailable.' : 'Public discussion loaded.' }).waitFor();
    const prepare = async () => { await page.getByRole('button', { name: 'Prepare to post', exact: true }).click(); await page.getByLabel('Your public message', { exact: true }).waitFor(); };
    const change = async (account, notify = true) => { state.account = account; await page.evaluate(({ account, notify }) => { if (notify) window.salonQa.change(account); else window.salonQa.selected = account; }, { account, notify }); };
    const release = () => { assert.ok(state.release); state.release(); state.release = null; };
    const close = async () => { if (state.release) release(); await within(() => context.close(), 'context close'); };
    return { context, page, state, prepare, change, release, close, waitHeld };
  }

  const basic = await fixture({ width: 320 });
  assert.equal(basic.state.authReads, 0); assert.equal(await basic.page.evaluate(() => window.salonQa.sdkCalls), 0);
  assert.equal(await basic.page.getByLabel('Your public message', { exact: true }).count(), 0);
  const initialText = await basic.page.locator('main').innerText();
  assert.match(initialText, /7 total members/); assert.match(initialText, /Published profiles \(1\)/);
  assert.match(initialText, /Unattributed message/); assert.match(initialText, /Date unavailable/); assert.match(initialText, /\[Message unavailable\.\]/);
  assert.doesNotMatch(initialText, /FORBIDDEN_UNAVAILABLE_RAW_TEXT|PRIVATE_PROFILE_|PRIVATE_EMAIL_|\(you\)/);
  const prepareButton = basic.page.getByRole('button', { name: 'Prepare to post', exact: true }); await prepareButton.focus(); await basic.page.keyboard.press('Enter');
  const draft = basic.page.getByLabel('Your public message', { exact: true }); await draft.waitFor();
  assert.equal(basic.state.authReads, 1); assert.equal(await basic.page.evaluate(() => window.salonQa.sdkCalls), 0);
  await draft.fill('A public thought with **safe markdown**.'); await draft.focus(); await basic.page.keyboard.press('Tab');
  assert.equal(await basic.page.getByRole('button', { name: 'Post public message', exact: true }).evaluate(element => element === document.activeElement), true);
  assert.equal(await basic.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  for (const control of await basic.page.locator('main button,main a,main textarea').all()) { const bounds = await control.boundingBox(); assert.ok(bounds && bounds.height >= 44, '44px control'); }
  await basic.page.screenshot({ path: path.join(root, 'verification/web/evidence/legacy-salon-mobile.png'), fullPage: true });
  basic.state.holdPost = true; basic.state.holdGet = true; await basic.page.keyboard.press('Enter'); await basic.waitHeld('POST');
  assert.doesNotMatch(await basic.page.getByRole('region', { name: 'Public message history' }).innerText(), /A public thought/);
  basic.release(); await basic.waitHeld('GET'); assert.doesNotMatch(await basic.page.getByRole('status').innerText(), /Posted and confirmed/);
  basic.release(); await basic.page.getByRole('status').filter({ hasText: 'Posted and confirmed in public history.' }).waitFor();
  assert.equal(await draft.inputValue(), ''); assert.equal(basic.state.posts.length, 1);
  checkpoint('320px/44px/keyboard, public initial read without auth/SDK, explicit actor preparation, published roster separate from total7, unattributed/date-unavailable legacy rows, no optimistic message and separate fresh GET before confirmation');
  await basic.close();

  const unknown = await fixture(); await unknown.prepare(); await unknown.page.getByLabel('Your public message', { exact: true }).fill('COMMITTED_WITH_LOST_ACK'); unknown.state.postMode = 'unknown';
  await unknown.page.getByRole('button', { name: 'Post public message', exact: true }).click(); await unknown.page.getByRole('status').filter({ hasText: 'Send outcome unknown.' }).waitFor();
  assert.equal(await unknown.page.getByLabel('Your public message', { exact: true }).isDisabled(), true); assert.equal(unknown.state.reads, 1); assert.equal(unknown.state.posts.length, 1);
  await unknown.page.getByRole('button', { name: 'Reload discussion', exact: true }).click(); await unknown.page.getByRole('status').filter({ hasText: 'Public discussion loaded.' }).waitFor();
  assert.match(await unknown.page.getByRole('region', { name: 'Public message history' }).innerText(), /COMMITTED_WITH_LOST_ACK/); assert.equal(unknown.state.posts.length, 1);
  checkpoint('lost acknowledgement stays unknown and disables submission; manual GET reload reveals the committed public message without retrying POST'); await unknown.close();

  for (const mode of ['refused', 'conflict']) {
    const item = await fixture(); await item.prepare(); await item.page.getByLabel('Your public message', { exact: true }).fill('REFUSED_DRAFT'); item.state.postMode = mode;
    await item.page.getByRole('button', { name: 'Post public message', exact: true }).click(); await item.page.getByRole('status').filter({ hasText: 'Message was not sent.' }).waitFor();
    assert.equal(item.state.reads, 1); assert.equal(item.state.posts.length, 1); assert.doesNotMatch(await item.page.getByRole('region', { name: 'Public message history' }).innerText(), /REFUSED_DRAFT/);
    if (mode === 'conflict') assert.equal(await item.page.getByLabel('Your public message', { exact: true }).count(), 0);
    else assert.equal(await item.page.getByLabel('Your public message', { exact: true }).isDisabled(), true);
    await item.close();
  }
  checkpoint('explicit not_attempted membership refusal and server actor409 do not confirm or retry; actor conflict clears the bound draft');

  const missed = await fixture(); await missed.prepare(); await missed.page.getByLabel('Your public message', { exact: true }).fill('A_DRAFT_MUST_NOT_BECOME_B'); await missed.change('B', false);
  await missed.page.getByRole('button', { name: 'Post public message', exact: true }).click(); await missed.page.getByRole('status').filter({ hasText: 'Message was not sent. Sign-in changed.' }).waitFor();
  assert.equal(missed.state.posts.length, 0); assert.equal(await missed.page.evaluate(() => window.salonQa.sdkCalls), 0); assert.doesNotMatch(await missed.page.locator('body').innerText(), /A_DRAFT_MUST_NOT_BECOME_B/);
  checkpoint('missed auth notification still compares the prepared actor before any token lookup, discards A draft and sends zero POSTs under B'); await missed.close();

  const changed = await fixture(); await changed.prepare(); await changed.page.getByLabel('Your public message', { exact: true }).fill('PRIVATE_UNSENT_A'); const authReads = changed.state.authReads;
  await changed.change('B'); await changed.page.getByRole('status').filter({ hasText: 'Sign-in changed. Reload the discussion' }).waitFor();
  assert.equal(await changed.page.getByLabel('Your public message', { exact: true }).count(), 0); assert.equal(await changed.page.getByRole('button', { name: 'Prepare to post', exact: true }).isDisabled(), true);
  assert.equal(changed.state.authReads, authReads); assert.equal(changed.state.reads, 1); assert.doesNotMatch(await changed.page.locator('body').innerText(), /PRIVATE_UNSENT_A|\(you\)/);
  checkpoint('same-tab provider notification immediately retires unsent draft and personal ownership context, with manual reload required and no automatic identity lookup'); await changed.close();

  const heldToken = await fixture(); await heldToken.prepare(); await heldToken.page.getByLabel('Your public message', { exact: true }).fill('HELD_TOKEN_A');
  await heldToken.page.evaluate(() => { window.salonQa.holdToken = true; }); await heldToken.page.getByRole('button', { name: 'Post public message', exact: true }).click();
  await heldToken.page.waitForFunction(() => window.salonQa.tokenHeld); await heldToken.change('B'); await heldToken.page.evaluate(() => window.salonQa.releaseToken());
  await heldToken.page.getByRole('status').filter({ hasText: 'Sign-in changed. Reload the discussion' }).waitFor(); assert.equal(heldToken.state.posts.length, 0);
  checkpoint('provider change during held SDK token lookup retires the draft and sends no POST'); await heldToken.close();

  const heldPost = await fixture(); await heldPost.prepare(); await heldPost.page.getByLabel('Your public message', { exact: true }).fill('HELD_POST_A'); heldPost.state.holdPost = true;
  await heldPost.page.getByRole('button', { name: 'Post public message', exact: true }).click(); await heldPost.waitHeld('POST'); await heldPost.change('B'); heldPost.release();
  await heldPost.page.getByRole('status').filter({ hasText: 'Sign-in changed. Reload the discussion' }).waitFor(); assert.equal(heldPost.state.posts.length, 1); assert.equal(heldPost.state.reads, 1);
  assert.equal(await heldPost.page.getByLabel('Your public message', { exact: true }).count(), 0);
  checkpoint('late POST receipt after A-to-B retirement does not restore the draft, fetch B history or confirm the old send'); await heldPost.close();

  const heldBody = await fixture(); await heldBody.prepare(); await heldBody.page.getByLabel('Your public message', { exact: true }).fill('HELD_JSON_A');
  await heldBody.page.evaluate(() => { window.salonQa.holdPostBody = true; }); await heldBody.page.getByRole('button', { name: 'Post public message', exact: true }).click();
  await heldBody.page.waitForFunction(() => window.salonQa.bodyHeld); const beforeReads = heldBody.state.authReads;
  await heldBody.change('B'); await heldBody.page.evaluate(() => window.salonQa.releasePostBody()); await heldBody.page.waitForFunction(() => !window.salonQa.bodyHeld);
  await heldBody.page.getByRole('status').filter({ hasText: 'Sign-in changed. Reload the discussion' }).waitFor();
  assert.equal(heldBody.state.authReads, beforeReads); assert.equal(heldBody.state.reads, 1);
  checkpoint('non-abortable response JSON released after retirement is fenced before any new authority lookup or readback'); await heldBody.close();

  const deadline = await fixture({ clock: true, holdInitial: true }); await deadline.waitHeld('GET'); await deadline.page.clock.fastForward(15_001);
  await deadline.page.getByRole('status').filter({ hasText: 'Discussion unavailable.' }).waitFor(); deadline.release();
  await deadline.page.getByRole('button', { name: 'Reload discussion', exact: true }).click(); await deadline.page.getByRole('status').filter({ hasText: 'Public discussion loaded.' }).waitFor();
  await deadline.prepare(); await deadline.page.getByLabel('Your public message', { exact: true }).fill('DEADLINE_SENT_MESSAGE'); deadline.state.holdPost = true;
  await deadline.page.getByRole('button', { name: 'Post public message', exact: true }).click(); await deadline.waitHeld('POST'); await deadline.page.clock.fastForward(15_001);
  await deadline.page.getByRole('status').filter({ hasText: 'Send outcome unknown.' }).waitFor(); assert.equal(deadline.state.posts.length, 1); assert.equal(await deadline.page.getByLabel('Your public message', { exact: true }).isDisabled(), true);
  deadline.release(); checkpoint('accelerated 15-second total GET and sent-POST deadlines recover to reload/unknown states without real sleeps or automatic resubmission'); await deadline.close();

  for (const mode of ['missing', 'wrong-content', 'unavailable']) {
    const item = await fixture(); await item.prepare(); await item.page.getByLabel('Your public message', { exact: true }).fill('READBACK_MUST_MATCH'); item.state.readback = mode;
    await item.page.getByRole('button', { name: 'Post public message', exact: true }).click(); await item.page.getByRole('status').filter({ hasText: 'Send outcome unknown.' }).waitFor();
    assert.equal(item.state.posts.length, 1); assert.doesNotMatch(await item.page.getByRole('status').innerText(), /Posted and confirmed/); await item.close();
  }
  checkpoint('fresh readback lacking receipt ID, containing different content or failing503 never confirms and never retries');

  for (const getMode of ['unavailable', 'malformed', 'circle']) {
    const item = await fixture({ getMode }); assert.equal(await item.page.getByLabel('Your public message', { exact: true }).count(), 0);
    assert.doesNotMatch(await item.page.locator('main').innerText(), /Salon not found|Synthetic public book salon/); await item.close();
  }
  const nullable = await fixture({ getMode: 'nullable' }); await nullable.page.getByRole('heading', { name: 'Book salon', exact: true }).waitFor(); await nullable.close();
  checkpoint('503, malformed total count and accidentally supplied Circle DTO fail generically; nullable ordinary title/time display honest fallbacks');

  const longBook = await fixture({ getMode: 'long-book-id' });
  await longBook.page.getByRole('heading', { name: 'Synthetic public book salon', exact: true }).waitFor();
  assert.match(await longBook.page.getByRole('region', { name: 'Public message history' }).innerText(), /Inherited public thought/);
  assert.equal(await longBook.page.getByRole('button', { name: 'Prepare to post', exact: true }).isEnabled(), true);
  checkpoint('a 150-character ordinary book ID within the API/SQL 200-character contract renders public history and permits explicit preparation'); await longBook.close();

  const signedOut = await fixture({ signedOut: true }); await signedOut.page.getByRole('button', { name: 'Prepare to post', exact: true }).click();
  await signedOut.page.getByRole('status').filter({ hasText: 'Sign in, then prepare to post.' }).waitFor(); assert.equal(await signedOut.page.evaluate(() => window.salonQa.sdkCalls), 0);
  assert.equal(await signedOut.page.getByLabel('Your public message', { exact: true }).count(), 0); assert.match(await signedOut.page.getByRole('region', { name: 'Public message history' }).innerText(), /Inherited public thought/);
  checkpoint('signed-out preparation keeps public history readable, gives sign-in guidance and performs zero SDK calls'); await signedOut.close();

  const wallet = await fixture({ wallet: true }); await wallet.prepare(); await wallet.page.getByLabel('Your public message', { exact: true }).fill('COOKIE_ONLY_WALLET');
  await wallet.page.getByRole('button', { name: 'Post public message', exact: true }).click(); await wallet.page.getByRole('status').filter({ hasText: 'Posted and confirmed in public history.' }).waitFor();
  assert.equal(await wallet.page.evaluate(() => window.salonQa.sdkCalls), 0); checkpoint('wallet fixture uses cookie authority without SDK bearer and still requires exact confirmed readback'); await wallet.close();

  const truncated = await fixture(); truncated.state.membershipCount = 77; truncated.state.members = Array.from({ length: 50 }, (_, index) => ({ id: `published-${index}`, members: { display_name: `Published ${index}` } }));
  truncated.state.messages = Array.from({ length: 100 }, (_, index) => ({ id: `window-${index}`, member_name: null, content: `Public bounded history ${index}`, content_available: true, created_at: null, is_mine: false }));
  truncated.state.truncated = true; truncated.state.rosterTruncated = true; await truncated.page.getByRole('button', { name: 'Reload discussion', exact: true }).click(); await truncated.page.getByRole('status').filter({ hasText: 'Public discussion loaded.' }).waitFor();
  const boundedText = await truncated.page.locator('main').innerText(); assert.match(boundedText, /77 total members/); assert.match(boundedText, /Published profiles \(50\)/);
  assert.match(boundedText, /At most 50 published profiles/); assert.match(boundedText, /Latest 100 messages. Earlier history is not shown./);
  checkpoint('bounded latest100 history and capped50 public-profile roster expose honest truncation labels while retaining independent total77'); await truncated.close();

  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []); assert.deepEqual(routeErrors, []); assertSources();
} catch (error) { failure = error.stack || String(error); process.exitCode = 1; }
finally {
  fs.writeFileSync(reportPath, JSON.stringify(report(), null, 2) + '\n');
  try { await within(() => browser.close(), 'owned browser close'); }
  catch (error) {
    cleanupErrors.push(error.message); process.exitCode = 1;
    if (ownedBrowserPID) { try { process.kill(ownedBrowserPID, 'SIGTERM'); } catch {} }
  }
  const final = { ...report(), status: failure || cleanupErrors.length ? 'FAIL' : 'PASS', finishedAt: new Date().toISOString(),
    deadlineProof: 'Playwright clock.fastForward(15001), no real15-second sleeps', explicitHTTPAndSDKFixtures: true };
  fs.writeFileSync(reportPath, JSON.stringify(final, null, 2) + '\n'); console.log(JSON.stringify(final));
}
