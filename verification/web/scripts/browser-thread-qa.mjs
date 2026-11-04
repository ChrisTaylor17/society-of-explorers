import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const root = path.resolve('.'), port = 3198, origin = `http://127.0.0.1:${port}`, require = createRequire(import.meta.url);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const evidence = { status: 'RUNNING', stage: 'initialization', startedAt: new Date().toISOString(), command: 'node --require ./scripts/deny-build-network.cjs scripts/browser-thread-qa.mjs (explicit installed Playwright and cached Chromium paths)', boundary: 'Built Next browser pages with actual TypeScript discussion/message handlers and disposable SQL. Canonical identity and PostgREST transport are synthetic fixtures; no real account, provider, production message or deployment is used.', apiBoundary: 'Private API interception invokes the actual route modules in the offline loader and real disposable SQL; these intercepted API calls are not claimed to execute inside the built Next server.', viewport: { width: 320, height: 900, mobileEmulation: true, touchEmulation: true }, navigation: 'Browser URLs contain only Circle/message IDs. Archive and descendant cursors stay in page memory; private comments, review data and request keys never enter browser navigation/storage.', checks: [], requests: [], postAttempts: [], pages: [], externalRequestsBlocked: [], pageErrors: [], routeErrors: [], consoleErrors: [], cleanupErrors: [], retiredResponses: [] };
let server, serverError, browser, system, IDS, requestId, failed, baseReceipts;
let loseNextPost = false, refuseNextRetry = false, refuseNextLookup = false, refuseNextMessageRead404 = false, holdNextPreview = false, heldPreview = null;
const check = text => evidence.checks.push(text);
async function portOpen() {
  return new Promise(resolve => { const socket = net.createConnection({ host: '127.0.0.1', port }); socket.once('connect', () => { socket.destroy(); resolve(true); }); socket.once('error', () => resolve(false)); });
}
async function receipts() { return Number((await system.db.query('SELECT count(*)::int n FROM circle_discussion_post_receipts')).rows[0].n); }
async function keyboard(page, control) { await control.focus(); assert.equal(await control.evaluate(element => element === document.activeElement), true); await page.keyboard.press('Enter'); }
async function layout(page, filename) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '320px horizontal overflow');
  assert.equal(await page.locator('main#main').count(), 1); assert.equal(await page.locator('main h1').count(), 1);
  const short = await page.locator('main button, main a, main textarea, header nav a').evaluateAll(elements => elements.filter(element => { const r = element.getBoundingClientRect(); return r.width && r.height; }).map(element => ({ height: element.getBoundingClientRect().height, text: element.textContent || element.getAttribute('aria-label') })).filter(element => element.height < 43.9));
  assert.deepEqual(short, [], 'visible new controls must have 44px targets');
  await page.screenshot({ path: `evidence/${filename}`, fullPage: true });
}
async function read(page, buttonName) {
  const responsePromise = page.waitForResponse(response => { const u = new URL(response.url()); return u.pathname === `/api/circles/${IDS.circle}/discussion` && response.request().method() === 'GET' && !u.searchParams.has('requestId'); });
  await keyboard(page, page.getByRole('button', { name: buttonName, exact: true }));
  const response = await responsePromise; assert.equal(response.status(), 200); const data = await response.json();
  const expected = data.kind === 'archive' ? data.items.map(message => message.id) : [data.root.id, ...(data.focus.id !== data.root.id ? [data.focus.id] : []), ...data.items.filter(message => message.id !== data.focus.id).map(message => message.id)];
  await page.waitForFunction(({ kind, expected }) => { const section = document.querySelector(`section[aria-label="${kind === 'archive' ? 'Discussion archive page' : 'Current discussion thread'}"]`); return section && JSON.stringify([...section.querySelectorAll('[data-discussion-message]')].map(element => element.dataset.discussionMessage)) === JSON.stringify(expected); }, { kind: data.kind, expected });
  return data;
}
async function open(page, messageId = null) {
  const before = evidence.requests.length;
  await page.goto(`${origin}/circles/${IDS.circle}/discussion${messageId ? `?message=${messageId}` : ''}`);
  await page.getByRole('button', { name: messageId ? 'Load current thread' : 'Load current discussion archive', exact: true }).waitFor();
  assert.equal(evidence.requests.length, before, 'page navigation performs no private automatic read');
  return read(page, messageId ? 'Load current thread' : 'Load current discussion archive');
}
async function draft(page, comment, parentId = null) {
  await open(page, parentId);
  if (parentId) {
    const section = page.locator('section[aria-label="Selected message"], section[aria-label="Thread root"]').filter({ has: page.locator(`[data-discussion-message="${parentId}"]`) });
    await keyboard(page, section.getByRole('button', { name: 'Reply to this message', exact: true }));
  } else await keyboard(page, page.getByRole('button', { name: 'Write a new Circle message', exact: true }));
  await page.getByRole('textbox', { name: 'Your discussion comment', exact: true }).fill(comment);
}
async function review(page) {
  const before = await receipts();
  await keyboard(page, page.getByRole('button', { name: 'Prepare discussion preview', exact: true }));
  const heading = page.getByRole('heading', { name: 'Review the complete discussion message', exact: true }); await heading.waitFor();
  assert.equal(await heading.evaluate(element => element === document.activeElement), true); assert.equal(await receipts(), before, 'preview saves no message');
  assert.equal(await page.getByRole('button', { name: 'Post reviewed discussion message', exact: true }).isDisabled(), true);
  const login = new URL(await page.getByRole('link', { name: 'Sign in or create an account', exact: true }).getAttribute('href'), origin);
  const next = new URL(login.searchParams.get('next'), origin); assert.equal(next.origin, origin); assert.equal(next.pathname, `/circles/${IDS.circle}/discussion`);
  assert.ok([...next.searchParams.keys()].every(key => key === 'message')); assert.doesNotMatch(next.href, /requestId|reviewKey|contentHash|comment=/);
  await page.keyboard.press('Tab'); assert.equal(await page.getByRole('checkbox').evaluate(element => element === document.activeElement), true);
  await page.keyboard.press('Space'); await page.keyboard.press('Tab'); assert.equal(await page.getByRole('button', { name: 'Post reviewed discussion message', exact: true }).evaluate(element => element === document.activeElement), true);
}
async function post(page) { await page.keyboard.press('Enter'); }
async function unconfirmed(page) {
  await page.getByRole('heading', { name: 'Discussion posting result unconfirmed', exact: true }).waitFor();
  // Pending UI is installed before dispatch. Wait for the finished attempt,
  // rather than mistaking its immediate heading for a completed SQL commit.
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(element => element.textContent === 'Retry exact reviewed discussion post' && !element.disabled));
}
async function savedMessage() {
  const attempt = evidence.postAttempts.filter(attempt => attempt.dispatched).at(-1);
  return (await system.db.query('SELECT m.id,m.content,l.parent_message_id,l.root_message_id FROM circle_discussion_post_receipts r JOIN seminar_messages m ON m.id=r.message_id LEFT JOIN circle_message_reply_links l ON l.message_id=m.id WHERE r.request_id=$1', [attempt.body.requestId])).rows[0];
}
async function withdraw(messageId) {
  const actor = (await system.db.query('SELECT member_id FROM seminar_messages WHERE id=$1', [messageId])).rows[0].member_id;
  system.setActor(actor);
  try {
    const response = await system.dispatch(`/api/circles/${IDS.circle}/messages/${messageId}`); assert.equal(response.status, 200); const state = await response.json();
    const result = await system.dispatch(`/api/circles/${IDS.circle}/messages/${messageId}`, 'POST', { requestId: requestId(), action: 'withdraw', expectedRevision: state.revision, contentHash: state.contentHash }); assert.equal(result.status, 200);
  } finally { system.setActor(IDS.reader); }
}

try {
  assert.ok([...process.execArgv, process.env.NODE_OPTIONS || ''].join(' ').includes('deny-build-network.cjs'), 'Use the process-wide network-deny preload');
  assert.ok(fs.existsSync('../../.next/BUILD_ID')); assert.equal(await portOpen(), false, 'QA port is already owned'); fs.mkdirSync('evidence', { recursive: true });
  evidence.buildId = fs.readFileSync('../../.next/BUILD_ID', 'utf8').trim(); evidence.composerSha256 = hash(fs.readFileSync('../../app/circles/[circleId]/discussion/DiscussionBrowser.tsx'));
  evidence.runnerSha256 = hash(fs.readFileSync('scripts/browser-thread-qa.mjs'));
  evidence.sourceSha256 = Object.fromEntries(['../../app/circles/[circleId]/discussion/DiscussionBrowser.tsx', '../../app/circles/[circleId]/discussion/page.tsx', '../../app/circles/[circleId]/discussion/discussion.module.css', '../../app/circles/[circleId]/CircleDetail.tsx', '../../app/circles/messages/MessageActions.tsx'].map(file => [file, hash(fs.readFileSync(file))]));
  evidence.stage = 'synthetic fixture setup';
  const fixture = await import('../tests/support/thread-app.mjs'); IDS = fixture.IDS; requestId = fixture.requestId; system = await fixture.threadApp(); system.setActor(IDS.reader);
  const archiveIds = await system.seedArchive(105);
  const firstNested = await system.seedReply(IDS.message, 'Synthetic nested parent that must not be copied into a child body.');
  const secondNested = await system.seedReply(firstNested.id, 'Synthetic child of a child.');
  const descendants = await system.seedThreadReplies(secondNested.id, 30), focus = descendants.at(-1);
  const unavailableId = 'f2000000-0000-4000-8000-000000000001';
  // Legacy fixture setup inserts an undated row directly. Existing message
  // bodies remain immutable under the actual evidence-retention trigger.
  await system.db.query("INSERT INTO seminar_messages(id,cohort_id,member_id,member_name,content,created_at) VALUES($1,$2,$3,'Synthetic undated author','PRIVATE_UNDISPLAYABLE_RAW_BODY',NULL)", [unavailableId, IDS.circle, IDS.author]);
  baseReceipts = await receipts(); evidence.setupReceipts = baseReceipts;
  const totalMessages = Number((await system.db.query('SELECT count(*)::int n FROM seminar_messages WHERE cohort_id=$1', [IDS.circle])).rows[0].n);
  const { chromium } = require(process.env.SOE_PLAYWRIGHT_PACKAGE);
  const env = Object.fromEntries(['PATH', 'HOME', 'USER', 'SHELL', 'TMPDIR', 'LANG', 'LC_ALL'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  Object.assign(env, { NEXT_TELEMETRY_DISABLED: '1', NODE_OPTIONS: '--require ' + path.join(root, 'scripts/deny-build-network.cjs'), NEXT_PUBLIC_SUPABASE_URL: 'https://offline.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'OFFLINE_PUBLIC_BUILD_PLACEHOLDER_NOT_A_CREDENTIAL' });
  const log = fs.openSync('evidence/browser-thread-server.log', 'w');
  server = spawn('node', ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: path.resolve(root, '../..'), env, stdio: ['ignore', log, log], detached: true }); fs.closeSync(log); server.once('error', error => { serverError = error; }); evidence.serverPid = server.pid;
  for (let index = 0; index < 100; index++) { if (await portOpen()) break; if (serverError || server.exitCode !== null || index === 99) throw serverError || Error('Owned built server did not start'); await pause(100); }
  browser = await chromium.launch({ headless: true, executablePath: process.env.SOE_BROWSER_EXECUTABLE }); evidence.chromiumVersion = await browser.version();
  const context = await browser.newContext({ viewport: { width: 320, height: 900 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' }), page = await context.newPage(); page.setDefaultTimeout(20_000);
  page.on('pageerror', error => evidence.pageErrors.push(String(error))); page.on('console', message => { if (message.type() === 'error') evidence.consoleErrors.push(message.text()); });
  await context.route('**/*', async route => {
    let expectedRetirement = false;
    try {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) { evidence.externalRequestsBlocked.push({ origin: url.origin, path: url.pathname }); return route.abort(); }
      if (!url.pathname.startsWith('/api/')) return route.continue();
      assert.ok(/^\/api\/(?:circles|book-salons)\//.test(url.pathname), 'Unexpected API: ' + url.pathname);
      const method = request.method(), body = request.postData() ? request.postDataJSON() : undefined;
      evidence.requests.push({ path: url.pathname, query: url.search, method });
      if (/\/messages\/[^/]+$/.test(url.pathname) && method === 'GET' && refuseNextMessageRead404) { refuseNextMessageRead404 = false; return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic current message unavailability before SQL dispatch.' }) }); }
      if (url.pathname.endsWith('/discussion') && method === 'POST' && refuseNextRetry) { refuseNextRetry = false; evidence.postAttempts.push({ path: url.pathname, body, responseStatus: 429, dispatched: false }); return route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic retry refusal before SQL dispatch.', outcome: 'not_attempted' }) }); }
      if (url.pathname.endsWith('/discussion') && method === 'GET' && url.searchParams.has('requestId') && refuseNextLookup) { refuseNextLookup = false; return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic receipt read failure.', outcome: 'not_attempted' }) }); }
      const response = await system.dispatch(url.pathname + url.search, method, body, { ...request.headers(), origin: 'https://offline.invalid', 'sec-fetch-site': 'same-origin' });
      if (url.pathname.endsWith('/discussion') && method === 'POST') { evidence.postAttempts.push({ path: url.pathname, body, responseStatus: response.status, dispatched: true }); if (loseNextPost) { loseNextPost = false; await response.text(); return route.abort('failed'); } }
      const text = await response.text();
      if (url.pathname.endsWith('/discussion') && method === 'GET' && response.ok && !url.searchParams.has('requestId')) { const data = JSON.parse(text); evidence.pages.push({ kind: data.kind, query: url.search, ids: data.items.map(message => message.id), nextCursor: data.nextCursor }); }
      if (url.pathname.endsWith('/discussion/preview') && holdNextPreview) { holdNextPreview = false; expectedRetirement = true; await new Promise(resolve => { heldPreview = { release: resolve }; }); }
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: text });
    } catch (error) { if (expectedRetirement) evidence.retiredResponses.push(String(error)); else evidence.routeErrors.push(String(error.stack || error)); try { await route.abort('failed'); } catch {} }
  });

  evidence.stage = 'archive pagination';
  let archive = await open(page), seen = [];
  for (let index = 0; index < 10; index++) {
    seen.push(...archive.items.map(message => message.id));
    assert.equal((await page.textContent('main')).includes('PRIVATE_UNDISPLAYABLE_RAW_BODY'), false);
    if (archive.items.some(message => message.id === unavailableId)) {
      const row = page.locator(`[data-discussion-message="${unavailableId}"]`); await row.getByText('Date unavailable', { exact: false }).waitFor(); assert.equal(await row.getByRole('button', { name: 'Reply to this message', exact: true }).count(), 0); assert.match(await row.textContent(), /legacy message could not be displayed/);
    }
    if (!archive.nextCursor) break;
    archive = await read(page, 'Older discussion messages');
  }
  assert.equal(new Set(seen).size, totalMessages); assert.equal(seen.length, totalMessages); assert.ok(seen.includes(IDS.message)); assert.ok(archiveIds.every(id => seen.includes(id)));
  await layout(page, 'discussion-archive-320.png');
  check('Actual archive pagination reaches every seeded message beyond the old 100-message window without duplicates, including 105 equal-time UUID ties and an explicit read-only undated legacy placeholder');

  evidence.stage = 'nested thread navigation';
  let thread = await open(page, focus.id); assert.equal(thread.root.id, IDS.message); assert.equal(thread.focus.id, focus.id); assert.equal(thread.focus.parentMessageId, secondNested.id); assert.equal(thread.items.some(message => message.id === focus.id), false, 'focus fixture is outside first reply page');
  assert.equal(new URL(await page.locator(`section[aria-label="Selected message"] a`).filter({ hasText: 'Open parent message' }).getAttribute('href'), origin).searchParams.get('message'), secondNested.id);
  const firstPage = thread.items.map(message => message.id); thread = await read(page, 'Next replies'); assert.equal(thread.items.some(message => firstPage.includes(message.id)), false);
  thread = await read(page, 'Replies after selected message'); assert.equal(thread.items.length, 0); thread = await read(page, 'First replies'); assert.deepEqual(thread.items.map(message => message.id), firstPage);
  await layout(page, 'discussion-nested-thread-320.png');
  check('An ID-only deep link resolves a real nested descendant outside the first page; root and selected context remain exact while first/next/after-selected reply pagination uses fresh access and in-memory cursors');

  evidence.stage = 'public sign-in return navigation';
  await draft(page, 'PRIVATE_LOGIN_RETURN_COMMENT', focus.id);
  const privateReadsBeforeLogin = evidence.requests.length;
  await keyboard(page, page.getByRole('link', { name: 'Sign in or create an account', exact: true }));
  await page.waitForURL(url => url.pathname === '/login');
  const loginUrl = new URL(page.url()), returnPath = loginUrl.searchParams.get('next');
  assert.deepEqual([...loginUrl.searchParams.keys()], ['next']);
  assert.equal(returnPath, `/circles/${IDS.circle}/discussion?message=${focus.id}`);
  const validatedReturn = new URL(returnPath, origin);
  assert.equal(validatedReturn.origin, origin); assert.equal(validatedReturn.pathname, `/circles/${IDS.circle}/discussion`);
  assert.deepEqual([...validatedReturn.searchParams.keys()], ['message']);
  assert.equal(validatedReturn.searchParams.get('message'), focus.id);
  assert.doesNotMatch(page.url(), /PRIVATE_LOGIN_RETURN_COMMENT|requestId|reviewKey|contentHash|comment=/);
  assert.equal(evidence.requests.length, privateReadsBeforeLogin, 'opening login makes no fixture auth/private API call');
  await page.goto(validatedReturn.href);
  await page.getByRole('button', { name: 'Load current thread', exact: true }).waitFor();
  assert.equal(evidence.requests.length, privateReadsBeforeLogin, 'returning performs no automatic private read');
  assert.equal(await page.getByRole('textbox', { name: 'Your discussion comment', exact: true }).count(), 0);
  const returnedThread = await read(page, 'Load current thread'); assert.equal(returnedThread.focus.id, focus.id);
  check('Actual built navigation opens login with only the validated Circle/message return locator, then returns to the same deep focus through an explicit load; no credentials are entered and synthetic fixture identity is unchanged');

  evidence.stage = 'reviewed nested reply';
  const comment = 'Synthetic browser reply to a deeply nested message.'; await draft(page, comment, focus.id); await review(page); await layout(page, 'discussion-review-320.png'); const beforeReply = await receipts(); await post(page); await page.getByRole('heading', { name: 'Discussion posting confirmed', exact: true }).waitFor(); assert.equal(await receipts(), beforeReply + 1);
  const saved = await savedMessage(); assert.equal(saved.parent_message_id, focus.id); assert.equal(saved.root_message_id, IDS.message); assert.equal(saved.content, `${comment}\n\nIn reply to message:\n/circles/${IDS.circle}/discussion?message=${focus.id}`); assert.equal(saved.content.includes(focus.content), false);
  check('Keyboard preview focus, checkbox and explicit posting save one child with immutable parent/root IDs and only human comment plus canonical parent link; parent words are not copied');

  evidence.stage = 'independent parent and child withdrawal';
  await withdraw(IDS.message); await open(page, saved.id);
  const rootCard = page.locator('section[aria-label="Thread root"]'); await rootCard.getByText('Message withdrawn by its author.', { exact: true }).waitFor(); assert.equal(await rootCard.getByRole('button', { name: 'Reply to this message', exact: true }).count(), 0); assert.ok((await page.locator('section[aria-label="Selected message"]').textContent()).includes(comment));
  const selected = page.locator(`section[aria-label="Selected message"] [data-discussion-message="${saved.id}"]`); await keyboard(page, selected.getByRole('button', { name: 'Check message actions', exact: true })); await selected.getByRole('checkbox').check();
  await keyboard(page, selected.getByRole('button', { name: 'Withdraw my message', exact: true })); await page.getByText('Discussion and draft cleared.', { exact: false }).waitFor(); assert.equal(await page.getByRole('button', { name: 'Reply to this message', exact: true }).count(), 0); assert.equal((await page.textContent('main')).includes(comment), false);
  await read(page, 'Load current thread'); const freshSelected = page.locator('section[aria-label="Selected message"]'); await freshSelected.getByText('Message withdrawn by its author.', { exact: true }).waitFor(); assert.equal(await freshSelected.getByRole('button', { name: 'Reply to this message', exact: true }).count(), 0); assert.equal((await system.db.query('SELECT content FROM seminar_messages WHERE id=$1', [saved.id])).rows[0].content, saved.content);
  await layout(page, 'discussion-withdrawn-320.png');
  check('Withdrawing the root leaves its child independently readable; withdrawing that child then clears the entire cached discussion/draft and removes Reply controls until a fresh tombstone read, while restricted stored evidence remains retained');

  evidence.stage = 'lost reply and refused retry';
  const unknownComment = 'Synthetic exact-request recovery after a committed lost reply.'; await draft(page, unknownComment, secondNested.id); await review(page); const beforeUnknown = await receipts(); loseNextPost = true; await post(page); await unconfirmed(page); assert.equal(await receipts(), beforeUnknown + 1); const firstUnknown = evidence.postAttempts.at(-1).body;
  const attemptsBeforeWait = evidence.postAttempts.length; await pause(200); assert.equal(evidence.postAttempts.length, attemptsBeforeWait);
  refuseNextLookup = true; await keyboard(page, page.getByRole('button', { name: 'Check discussion posting receipt', exact: true })); await page.getByText('The receipt could not be confirmed.', { exact: false }).waitFor();
  refuseNextRetry = true; await keyboard(page, page.getByRole('button', { name: 'Retry exact reviewed discussion post', exact: true })); await page.getByText('The current attempt was refused before saving.', { exact: false }).waitFor(); await page.getByRole('button', { name: 'Retry exact reviewed discussion post', exact: true }).waitFor(); assert.equal(await page.getByRole('button', { name: 'Retry exact reviewed discussion post', exact: true }).isEnabled(), true); assert.equal(await receipts(), beforeUnknown + 1);
  await keyboard(page, page.getByRole('button', { name: 'Retry exact reviewed discussion post', exact: true })); await page.getByRole('heading', { name: 'Discussion posting confirmed', exact: true }).waitFor(); assert.equal(await receipts(), beforeUnknown + 1); assert.deepEqual(evidence.postAttempts.at(-1).body, firstUnknown); assert.deepEqual(evidence.postAttempts.at(-2).body, firstUnknown);
  check('A committed lost reply, failed receipt read and later 429 refusal retain the same key/body; only deliberate exact retry occurs and it recovers one durable message without duplication');

  evidence.stage = 'read-only receipt recovery';
  await draft(page, 'Synthetic standalone message recovered by receipt only.'); await review(page); const beforeReceipt = await receipts(); loseNextPost = true; await post(page); await unconfirmed(page); const attemptsBeforeReceipt = evidence.postAttempts.length;
  await keyboard(page, page.getByRole('button', { name: 'Check discussion posting receipt', exact: true })); await page.getByRole('heading', { name: 'Discussion posting confirmed', exact: true }).waitFor(); assert.equal(evidence.postAttempts.length, attemptsBeforeReceipt); assert.equal(await receipts(), beforeReceipt + 1);
  await layout(page, 'discussion-recovered-320.png'); check('A standalone keyed post uses the same explicit review and can recover a committed lost reply through a read-only own receipt lookup');

  evidence.stage = 'activity and identity retirement';
  for (const kind of ['blur', 'storage']) {
    await draft(page, `PRIVATE_RETIRED_${kind}`, secondNested.id); holdNextPreview = true; const response = keyboard(page, page.getByRole('button', { name: 'Prepare discussion preview', exact: true })); await response;
    for (let index = 0; index < 100 && !heldPreview; index++) await pause(10); assert.ok(heldPreview, 'controlled late preview reached actual handler');
    await page.evaluate(kind => dispatchEvent(kind === 'storage' ? new StorageEvent('storage', { key: 'synthetic-account-change' }) : new Event('blur')), kind); await page.getByText('Private discussion, comment and review cleared.', { exact: false }).waitFor(); const gate = heldPreview; heldPreview = null; gate.release(); await pause(150);
    assert.equal(await page.getByRole('textbox', { name: 'Your discussion comment', exact: true }).count(), 0); assert.equal(await page.getByRole('heading', { name: 'Review the complete discussion message', exact: true }).count(), 0); assert.equal((await page.textContent('main')).includes(`PRIVATE_RETIRED_${kind}`), false);
    const count = evidence.requests.length; await page.evaluate(() => dispatchEvent(new Event('focus'))); await pause(100); assert.equal(evidence.requests.length, count);
  }
  check('Browser blur and a simulated cross-tab account-change signal clear private pages/drafts and reject delayed actual preview responses; returning focus performs no automatic read, post or retry');

  evidence.stage = 'changed parent preview refusal';
  await draft(page, 'PRIVATE_COMMENT_FOR_NOW_WITHDRAWN_PARENT', descendants[0].id);
  const receiptsBeforeRefusedPreview = await receipts(); await withdraw(descendants[0].id);
  const changedParent = page.waitForResponse(response => new URL(response.url()).pathname === `/api/circles/${IDS.circle}/discussion/preview`);
  await keyboard(page, page.getByRole('button', { name: 'Prepare discussion preview', exact: true })); assert.equal((await changedParent).status(), 409);
  await page.getByText('The parent changed or is no longer visible.', { exact: false }).waitFor();
  assert.equal(await page.locator('[data-discussion-message]').count(), 0); assert.equal(await page.getByRole('button', { name: 'Reply to this message', exact: true }).count(), 0);
  assert.equal(await page.getByRole('textbox', { name: 'Your discussion comment', exact: true }).count(), 0); assert.equal(await receipts(), receiptsBeforeRefusedPreview);
  check('A real parent withdrawal after drafting makes preview return409 without a receipt or message, and removes the stale page, target, comment and Reply controls before another review');

  evidence.stage = 'current access revocation';
  await draft(page, 'PRIVATE_DRAFT_TO_CLEAR_ON_CIRCLE_HOLD', archiveIds[1]);
  await system.db.query('UPDATE book_cohorts SET circle_hidden=true WHERE id=$1', [IDS.circle]);
  const denied = page.waitForResponse(response => new URL(response.url()).pathname === `/api/circles/${IDS.circle}/messages/${archiveIds[1]}` && response.request().method() === 'GET');
  await keyboard(page, page.locator(`[data-discussion-message="${archiveIds[1]}"]`).getByRole('button', { name: 'Check message actions', exact: true })); assert.equal((await denied).status(), 403);
  await page.getByText('This discussion or message is not available for this account.', { exact: false }).waitFor(); assert.equal(await page.locator('[data-discussion-message]').count(), 0); assert.equal(await page.getByRole('textbox', { name: 'Your discussion comment', exact: true }).count(), 0); assert.equal((await page.textContent('main')).includes('PRIVATE_DRAFT_TO_CLEAR_ON_CIRCLE_HOLD'), false);
  await system.db.query('UPDATE book_cohorts SET circle_hidden=false WHERE id=$1', [IDS.circle]);
  await draft(page, 'PRIVATE_DRAFT_TO_CLEAR_ON_MESSAGE_404', secondNested.id); refuseNextMessageRead404 = true;
  const missingMessage = page.waitForResponse(response => new URL(response.url()).pathname === `/api/circles/${IDS.circle}/messages/${secondNested.id}` && response.request().method() === 'GET');
  await keyboard(page, page.locator(`[data-discussion-message="${secondNested.id}"]`).getByRole('button', { name: 'Check message actions', exact: true })); assert.equal((await missingMessage).status(), 404);
  await page.getByText('This discussion or message is not available for this account.', { exact: false }).waitFor();
  assert.equal(await page.locator('[data-discussion-message]').count(), 0); assert.equal(await page.getByRole('textbox', { name: 'Your discussion comment', exact: true }).count(), 0);
  assert.equal((await page.textContent('main')).includes('PRIVATE_DRAFT_TO_CLEAR_ON_MESSAGE_404'), false);
  await draft(page, 'PRIVATE_DRAFT_TO_CLEAR_ON_ACCESS_LOSS', secondNested.id); system.setActor(null);
  const unauthorized = page.waitForResponse(response => new URL(response.url()).pathname === `/api/circles/${IDS.circle}/discussion` && response.request().method() === 'GET');
  await keyboard(page, page.getByRole('button', { name: 'Load current thread', exact: true })); assert.equal((await unauthorized).status(), 401);
  await page.getByText('Sign in, then load this discussion', { exact: false }).waitFor();
  assert.equal(await page.locator('[data-discussion-message]').count(), 0); assert.equal(await page.getByRole('textbox', { name: 'Your discussion comment', exact: true }).count(), 0);
  assert.equal((await page.textContent('main')).includes('PRIVATE_DRAFT_TO_CLEAR_ON_ACCESS_LOSS'), false); system.setActor(IDS.reader);
  check('An actual Circle hold returns403 for another author’s message; an explicitly synthetic pre-dispatch message404 and a canonical fixture identity-loss401 also clear cached rows and drafts. Existing author check/withdraw access during a Circle hold is preserved');

  evidence.stage = 'invalid navigation and entry links';
  const beforeInvalid = evidence.requests.length; await page.goto(`${origin}/circles/${IDS.circle}/discussion?message=${focus.id}&message=${focus.id}`); await page.getByText('This discussion link has invalid', { exact: false }).waitFor(); assert.equal(evidence.requests.length, beforeInvalid); await read(page, 'Open newest archive page');
  await page.goto(`${origin}/circles/${IDS.circle}`); await page.getByRole('button', { name: 'Load current Circle access', exact: true }).click(); await page.getByRole('link', { name: 'Open discussion archive and replies', exact: true }).waitFor(); assert.equal(await page.getByRole('link', { name: 'Open discussion archive and replies', exact: true }).getAttribute('href'), `/circles/${IDS.circle}/discussion`);
  check('Invalid duplicate navigation triggers no private automatic read and has explicit archive recovery; existing current-access Circle details link to the new archive without changing the portable conversation');

  evidence.actualPostDispatches = evidence.postAttempts.filter(attempt => attempt.dispatched).length; evidence.refusedBeforeDispatch = evidence.postAttempts.filter(attempt => !attempt.dispatched).length; evidence.durableBrowserPosts = await receipts() - baseReceipts;
  assert.deepEqual(evidence.externalRequestsBlocked, []); assert.deepEqual(evidence.pageErrors, []); assert.deepEqual(evidence.routeErrors, []);
  assert.deepEqual(evidence.consoleErrors.filter(text => !text.includes('net::ERR_FAILED') && ![401, 403, 404, 409, 429, 503].some(status => text.includes(`status of ${status} (`))), []);
  evidence.stage = 'complete'; evidence.status = 'PASS';
} catch (error) { failed = error; evidence.status = 'FAIL'; evidence.error = String(error.stack || error); }
finally {
  heldPreview?.release();
  if (browser) try { await browser.close(); } catch (error) { evidence.cleanupErrors.push(String(error)); }
  if (system) try { await system.close(); } catch (error) { evidence.cleanupErrors.push(String(error)); }
  if (server?.pid) { try { process.kill(-server.pid, 'SIGTERM'); } catch {} for (let i = 0; i < 50 && await portOpen(); i++) await pause(100); evidence.ownedServerStopped = !(await portOpen()); if (!evidence.ownedServerStopped) evidence.cleanupErrors.push('Owned server did not stop'); }
  if (evidence.cleanupErrors.length) { failed ??= Error(evidence.cleanupErrors.join('; ')); evidence.status = 'FAIL'; }
  evidence.finishedAt = new Date().toISOString();
  fs.mkdirSync('evidence', { recursive: true }); fs.writeFileSync('evidence/browser-thread-qa.json', JSON.stringify(evidence, null, 2) + '\n');
  if (failed) { process.stderr.write(String(failed.stack || failed) + '\n'); process.exitCode = 1; } else process.stdout.write(JSON.stringify({ status: evidence.status, checks: evidence.checks.length, ownedServerStopped: evidence.ownedServerStopped }) + '\n');
}
