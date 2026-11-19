import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

// Run with the process-wide deny preload. Built Next serves its actual local
// pages/documents; API interception invokes actual TypeScript route handlers and
// disposable SQL. Canonical identity is synthetic, not a real browser sign-in.
const root = path.resolve('.');
const port = 3197;
const origin = `http://127.0.0.1:${port}`;
const require = createRequire(import.meta.url);
const evidence = {
  status: 'RUNNING',
  boundary: 'Offline built browser UI, actual local edition bytes and actual TypeScript route modules with disposable PostgreSQL-compatible SQL; only canonical identity and PostgREST transport are fixtures. No real account, provider, production message or deployment is used.',
  apiBoundary: 'Metadata and iframe editions are served by built Next. Browser passage/private API interception invokes the actual source route handlers in the existing offline loader, then real disposable SQL; those intercepted APIs are not claimed to execute inside the Next server.',
  viewport: { width: 320, height: 900, mobileEmulation: true, touchEmulation: true },
  selection: 'A DOM Range is selected in the actual sandboxed edition iframe. Physical touch selection and native device acceptance are not established.',
  checks: [], requests: [], postAttempts: [], publicVerifications: [], signInReturns: [], externalRequestsBlocked: [], pageErrors: [], consoleErrors: [], routeErrors: [], cleanupErrors: [],
};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = value => evidence.checks.push(value);
let server, browser, system, failed, IDS;
let loseNextPost = false;
let refuseNextLookup = false;
let refuseNextRetry = false;
async function portOpen() {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}
async function countPosts() {
  return Number((await system.db.query('SELECT count(*)::int n FROM circle_passage_post_receipts')).rows[0].n);
}
async function layout(page, name, selector = 'main') {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '320px page overflow');
  assert.equal(await page.locator('main h1').count(), 1, 'one main page heading');
  const undersized = await page.locator(selector).locator('button, a, select, textarea, input:not([type="checkbox"])').evaluateAll(elements => elements
    .filter(element => { const rect = element.getBoundingClientRect(); return rect.width && rect.height; })
    .map(element => ({ height: element.getBoundingClientRect().height, text: element.textContent || element.getAttribute('aria-label') || element.id }))
    .filter(element => element.height < 43.9));
  assert.deepEqual(undersized, [], 'new passage controls need 44px targets');
  await page.screenshot({ path: `evidence/${name}`, fullPage: true });
}
async function keyboardActivate(page, control) {
  await control.focus();
  assert.equal(await control.evaluate(element => element === document.activeElement), true);
  await page.keyboard.press('Enter');
}
async function compose(page, url, comment, navigate = true) {
  if (navigate) await page.goto(origin + url);
  else await page.getByRole('button', { name: 'Verify source', exact: true }).waitFor();
  await keyboardActivate(page, page.getByRole('button', { name: 'Verify source', exact: true }));
  await page.getByRole('heading', { name: '2. Choose your Circle', exact: true }).waitFor();
  await page.getByLabel('Circle ID', { exact: true }).fill(IDS.circle);
  await keyboardActivate(page, page.getByRole('button', { name: 'Check current Circle access', exact: true }));
  await page.getByRole('textbox', { name: 'Your comment', exact: true }).fill(comment);
  const signIn = new URL(await page.getByRole('link', { name: 'Sign in or create an account', exact: true }).getAttribute('href'), origin);
  const next = new URL(signIn.searchParams.get('next'), origin);
  const expectedSource = new URL(url, origin).searchParams;
  assert.equal(next.origin, origin); assert.equal(next.pathname, '/circles/passages');
  assert.equal(next.searchParams.get('circle'), IDS.circle);
  for (const key of ['book', 'edition', 'block', 'start', 'end']) assert.equal(next.searchParams.get(key), expectedSource.get(key));
  const publicKeys = new Set(['circle', 'book', 'edition', 'block', 'start', 'end']);
  assert.ok([...next.searchParams.keys()].every(key => publicKeys.has(key) && next.searchParams.getAll(key).length === 1));
  assert.equal(signIn.href.includes(comment), false);
  evidence.signInReturns.push({ path: next.pathname, parameters: Object.fromEntries(next.searchParams) });
  const preparedBefore = await countPosts();
  await keyboardActivate(page, page.getByRole('button', { name: 'Prepare server preview', exact: true }));
  const heading = page.getByRole('heading', { name: '4. Review the complete message', exact: true });
  await heading.waitFor();
  assert.equal(await heading.evaluate(element => element === document.activeElement), true, 'review heading receives focus');
  assert.equal(await countPosts(), preparedBefore, 'preview must not save a post');
  assert.equal(await page.getByRole('button', { name: 'Post reviewed message', exact: true }).isDisabled(), true);
  await layout(page, 'passage-preview-320.png');
  // Focus moves from the review heading to its checkbox and deliberate action.
  await page.keyboard.press('Tab');
  assert.equal(await page.getByRole('checkbox').evaluate(element => element === document.activeElement), true);
  await page.keyboard.press('Space');
  await page.keyboard.press('Tab');
  assert.equal(await page.getByRole('button', { name: 'Post reviewed message', exact: true }).evaluate(element => element === document.activeElement), true);
}
async function confirmPost(page) {
  await page.keyboard.press('Enter');
}
async function readCircle(page) {
  await page.getByRole('button', { name: 'Load current Circle access', exact: true }).waitFor();
  await keyboardActivate(page, page.getByRole('button', { name: 'Load current Circle access', exact: true }));
  await page.getByRole('button', { name: 'Read circle conversation', exact: true }).waitFor();
  await keyboardActivate(page, page.getByRole('button', { name: 'Read circle conversation', exact: true }));
  await page.getByRole('button', { name: 'Refresh conversation', exact: true }).waitFor();
}

try {
  assert.ok(fs.existsSync('../../.next/BUILD_ID'), 'Build the frozen candidate before browser QA');
  evidence.buildId = fs.readFileSync('../../.next/BUILD_ID', 'utf8').trim();
  assert.equal(await portOpen(), false, 'The browser QA port is already owned');
  fs.mkdirSync('evidence', { recursive: true });
  // Load the disposable SQL runtime inside the failure/cleanup boundary. A
  // missing or evicted local package must not look like a product failure.
  const fixture = await import('../tests/support/passage-post-app.mjs');
  IDS = fixture.IDS;
  system = await fixture.passagePostApp();
  system.setActor(IDS.reader);
  const { chromium } = require(process.env.SOE_PLAYWRIGHT_PACKAGE);
  const env = Object.fromEntries(['PATH', 'HOME', 'USER', 'SHELL', 'TMPDIR', 'LANG', 'LC_ALL'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  Object.assign(env, {
    NEXT_TELEMETRY_DISABLED: '1',
    NODE_OPTIONS: '--require ' + path.join(root, 'scripts/deny-build-network.cjs'),
    NEXT_PUBLIC_SUPABASE_URL: 'https://offline.invalid',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'OFFLINE_PUBLIC_BUILD_PLACEHOLDER_NOT_A_CREDENTIAL',
  });
  const log = fs.openSync('evidence/browser-passage-server.log', 'w');
  server = spawn('node', ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: path.resolve(root, '../..'), env, stdio: ['ignore', log, log], detached: true,
  });
  fs.closeSync(log);
  evidence.serverPid = server.pid;
  for (let index = 0; index < 100; index++) {
    if (await portOpen()) break;
    if (server.exitCode !== null || index === 99) throw Error('Owned built server did not start');
    await pause(100);
  }
  const publicRoute = system.app.load('app/api/great-books/passage/route.ts');
  browser = await chromium.launch({ headless: true, executablePath: process.env.SOE_BROWSER_EXECUTABLE });
  const context = await browser.newContext({ viewport: { width: 320, height: 900 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  page.on('pageerror', error => evidence.pageErrors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') evidence.consoleErrors.push(message.text()); });
  await context.route('**/*', async route => {
    try {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) {
      evidence.externalRequestsBlocked.push({ origin: url.origin, path: url.pathname });
      return route.abort();
    }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (/^\/api\/great-books\/(?:text|edition)\//.test(url.pathname)) return route.continue();
    const method = request.method();
    const body = request.postData() ? request.postDataJSON() : undefined;
    evidence.requests.push({ path: url.pathname, query: url.search, method });
    let response;
    if (url.pathname === '/api/great-books/passage') {
      assert.equal(method, 'GET');
      assert.equal(request.headers().authorization, undefined, 'public source verification has no bearer');
      response = await publicRoute.GET(system.request(undefined, url.pathname + url.search));
      const copy = response.clone();
      evidence.publicVerifications.push({ query: url.search, status: response.status, source: response.ok ? (await copy.json()).reference : null });
    } else {
      assert.ok(/^\/api\/(?:circles|book-salons)\//.test(url.pathname), 'unexpected application API: ' + url.pathname);
      const actualOrigin = request.headers().origin;
      assert.ok(!actualOrigin || actualOrigin === origin, 'the browser mutation came from this owned origin');
      if (/\/passages$/.test(url.pathname) && method === 'POST' && refuseNextRetry) {
        refuseNextRetry = false;
        evidence.postAttempts.push({ path: url.pathname, body, responseStatus: 429, dispatched: false });
        return route.fulfill({ status: 429, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store', 'retry-after': '1' },
          body: JSON.stringify({ error: 'Synthetic current-attempt rate refusal.', outcome: 'not_attempted' }) });
      }
      // The in-process Request fixture has its own fixed origin. This is only
      // transport adaptation; independent HTTP tests cover real origin refusal.
      response = await system.dispatch(url.pathname + url.search, method, body,
        { ...request.headers(), origin: 'https://offline.invalid', 'sec-fetch-site': 'same-origin' });
      if (/\/passages$/.test(url.pathname) && method === 'POST') {
        evidence.postAttempts.push({ path: url.pathname, body, responseStatus: response.status, dispatched: true });
        if (loseNextPost) { loseNextPost = false; await response.text(); return route.abort('failed'); }
      }
      if (/\/passages$/.test(url.pathname) && method === 'GET' && url.searchParams.has('requestId') && refuseNextLookup) {
        refuseNextLookup = false;
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic lost receipt read.', outcome: 'not_attempted' }) });
      }
    }
      return await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
    } catch (error) {
      evidence.routeErrors.push(String(error.stack || error));
      try { await route.abort('failed'); } catch { /* Preserve the original route error. */ }
    }
  });

  await page.goto(origin + '/great-books/apology');
  await page.getByRole('button', { name: 'Capture selected passage', exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('section[aria-label="Discuss a source passage"] button')?.disabled);
  const rawSelection = await page.locator('iframe[data-reading-frame]').evaluate(frame => {
    const document = frame.contentDocument;
    const block = document.querySelector('[data-reading-index="30"]');
    block.scrollIntoView({ block: 'start' });
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let text;
    while ((text = walker.nextNode()) && !text.nodeValue.trim()) { /* first substantive text node */ }
    if (!text || text.nodeValue.length < 90) throw Error('The pinned source selection fixture changed');
    const range = document.createRange();
    range.setStart(text, 0); range.setEnd(text, 80);
    const selection = document.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    return selection.toString().replace(/\s+/gu, ' ').trim();
  });
  assert.ok(rawSelection.length > 20);
  await keyboardActivate(page, page.getByRole('button', { name: 'Capture selected passage', exact: true }));
  const continueLink = page.getByRole('link', { name: 'Verify selected passage and write a comment', exact: true });
  await continueLink.waitFor();
  const composeUrl = await continueLink.getAttribute('href');
  assert.ok(composeUrl.startsWith('/circles/passages?'));
  const locator = new URL(composeUrl, origin).searchParams;
  assert.equal(locator.get('book'), 'apology'); assert.equal(locator.get('block'), '30');
  assert.equal(locator.has('comment'), false); assert.equal(locator.has('quote'), false);
  assert.equal(evidence.postAttempts.length, 0);
  await layout(page, 'passage-reader-capture-320.png', 'section[aria-label="Discuss a source passage"]');
  await continueLink.tap();
  await page.waitForURL(url => url.pathname === '/circles/passages');
  check('Actual iframe DOM selection is captured, checked against the public pinned edition and transferred as public coordinates only; selecting and verification save no post');

  const comment = 'Synthetic browser passage discussion: why is this decision presented this way?';
  await compose(page, composeUrl, comment, false);
  const previewText = await page.locator('section[aria-label="Review complete message"]').textContent();
  assert.ok(previewText.includes(rawSelection));
  assert.equal(await countPosts(), 0);
  await confirmPost(page);
  await page.getByRole('heading', { name: 'Posting confirmed', exact: true }).waitFor();
  assert.equal(await countPosts(), 1);
  assert.equal(evidence.postAttempts.length, 1);
  const firstRequest = evidence.postAttempts[0].body;
  const persisted = (await system.db.query('SELECT m.id,m.content FROM circle_passage_post_receipts r JOIN seminar_messages m ON m.id=r.message_id WHERE r.request_id=$1', [firstRequest.requestId])).rows[0];
  assert.ok(persisted.content.includes(comment)); assert.ok(persisted.content.includes(rawSelection));
  await layout(page, 'passage-confirmed-320.png');
  check('Keyboard source/access review, focused preview heading, explicit checkbox and deliberate post save exactly one full immutable body with quotation, credits and exact-edition link');
  check('Sign-in return retains the exact public book/edition/block/excerpt and Circle identity, with no comment, request UUID or review key');

  await page.getByRole('link', { name: 'Open Circle conversation', exact: true }).click();
  await readCircle(page);
  let article = page.locator('article').filter({ hasText: comment });
  await article.getByRole('button', { name: 'Verify message source', exact: true }).waitFor();
  await keyboardActivate(page, article.getByRole('button', { name: 'Verify message source', exact: true }));
  await article.getByText('Source footer verified against this exact edition.', { exact: false }).waitFor();
  await page.reload();
  assert.equal((await page.textContent('main')).includes(comment), false, 'reload does not restore private conversation automatically');
  await readCircle(page);
  article = page.locator('article').filter({ hasText: comment });
  await article.waitFor();
  await keyboardActivate(page, article.getByRole('button', { name: 'Check message actions', exact: true }));
  await article.getByRole('button', { name: 'Withdraw my message', exact: true }).waitFor();
  assert.equal(await article.getByRole('button', { name: 'Withdraw my message', exact: true }).isDisabled(), true);
  await article.getByRole('checkbox').check();
  await keyboardActivate(page, article.getByRole('button', { name: 'Withdraw my message', exact: true }));
  const withdrawn = page.locator('article').filter({ hasText: 'Withdrawal confirmed. The message is removed from member views.' });
  await withdrawn.waitFor();
  assert.equal((await withdrawn.textContent()).includes(rawSelection), false);
  assert.equal(await withdrawn.getByRole('button', { name: 'Verify message source', exact: true }).count(), 0);
  assert.equal(await withdrawn.locator('a[href*="passageBlock="]').count(), 0);
  const receipt = await system.dispatch(`/api/circles/${IDS.circle}/passages?requestId=${firstRequest.requestId}`);
  const current = (await receipt.json()).receipt;
  assert.equal(current.message.visibility, 'withdrawn'); assert.equal(current.message.content, null);
  assert.equal((await system.db.query('SELECT content FROM seminar_messages WHERE id=$1', [persisted.id])).rows[0].content, persisted.content);
  await page.screenshot({ path: 'evidence/passage-withdrawn-320.png', fullPage: true });
  check('After a real page reload, an explicit current read shows the durable post and verifies its footer; withdrawal clears quote and locator together while restricted SQL evidence remains retained');

  loseNextPost = true;
  await compose(page, composeUrl, 'Synthetic uncertain reply: recover this exact saved passage once.');
  await confirmPost(page);
  await page.getByRole('heading', { name: 'Posting result unconfirmed', exact: true }).waitFor();
  await page.getByText('The posting reply was lost.', { exact: false }).waitFor();
  assert.equal(await countPosts(), 2);
  const afterLost = evidence.postAttempts.length;
  await pause(300); assert.equal(evidence.postAttempts.length, afterLost, 'no automatic retry');
  refuseNextLookup = true;
  await keyboardActivate(page, page.getByRole('button', { name: 'Check posting receipt', exact: true }));
  await page.getByText('The current receipt could not be confirmed.', { exact: false }).waitFor();
  refuseNextRetry = true;
  const refusalResponse = page.waitForResponse(response => response.url() === origin + `/api/circles/${IDS.circle}/passages` && response.status() === 429);
  await keyboardActivate(page, page.getByRole('button', { name: 'Retry exact reviewed post', exact: true }));
  await refusalResponse;
  await page.getByText('The current attempt was refused before saving. An earlier attempt may still have been saved.', { exact: false }).waitFor();
  await page.getByRole('heading', { name: 'Posting result unconfirmed', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Check posting receipt', exact: true }).count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Retry exact reviewed post', exact: true }).count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Retry exact reviewed post', exact: true }).isEnabled(), true);
  assert.equal(await countPosts(), 2, 'refusing a later attempt cannot erase the original committed operation');
  const afterRefusal = evidence.postAttempts.length;
  await pause(1100); assert.equal(evidence.postAttempts.length, afterRefusal, 'a rate refusal must not trigger an automatic resend');
  await layout(page, 'passage-refused-retry-320.png');
  await keyboardActivate(page, page.getByRole('button', { name: 'Retry exact reviewed post', exact: true }));
  await page.getByRole('heading', { name: 'Posting confirmed', exact: true }).waitFor();
  assert.equal(await countPosts(), 2);
  assert.deepEqual(evidence.postAttempts.at(-1).body, evidence.postAttempts.at(-2).body);
  assert.deepEqual(evidence.postAttempts.at(-1).body, evidence.postAttempts.at(-3).body);
  assert.deepEqual(evidence.postAttempts.slice(-3).map(attempt => [attempt.responseStatus, attempt.dispatched]), [[200, true], [429, false], [200, true]]);
  check('A committed lost reply and failed read-only lookup retain the exact payload; a later retry refused429 before SQL dispatch keeps receipt/retry controls and does not disprove the earlier save; another deliberate exact retry returns one existing message');

  loseNextPost = true;
  await compose(page, composeUrl, 'Synthetic receipt-only recovery after a committed reply is lost.');
  await confirmPost(page);
  await page.getByRole('heading', { name: 'Posting result unconfirmed', exact: true }).waitFor();
  await page.getByText('The posting reply was lost.', { exact: false }).waitFor();
  const attemptsBeforeLookup = evidence.postAttempts.length;
  await keyboardActivate(page, page.getByRole('button', { name: 'Check posting receipt', exact: true }));
  await page.getByRole('heading', { name: 'Posting confirmed', exact: true }).waitFor();
  assert.equal(evidence.postAttempts.length, attemptsBeforeLookup); assert.equal(await countPosts(), 3);
  await layout(page, 'passage-recovered-320.png');
  check('An explicit own receipt read recovers another committed reply without sending any write');

  await compose(page, composeUrl, 'Synthetic private review that must retire before posting.');
  const beforeRetire = evidence.requests.length;
  const beforeRetirePosts = evidence.postAttempts.length;
  await page.evaluate(() => dispatchEvent(new Event('blur')));
  await page.getByText('Private Circle details, comment and review cleared.', { exact: false }).waitFor();
  assert.equal(await page.getByRole('heading', { name: '4. Review the complete message', exact: true }).count(), 0);
  assert.equal(await page.getByRole('textbox', { name: 'Your comment', exact: true }).count(), 0);
  await page.evaluate(() => dispatchEvent(new Event('focus')));
  await pause(150);
  assert.equal(evidence.requests.length, beforeRetire); assert.equal(evidence.postAttempts.length, beforeRetirePosts);
  check('Browser lifetime retirement clears private comment/review/confirmation; focus sends no read, post or retry (native OS departure is not assessed)');

  assert.deepEqual(evidence.externalRequestsBlocked, []);
  assert.deepEqual(evidence.pageErrors, []);
  assert.deepEqual(evidence.routeErrors, []);
  assert.deepEqual(evidence.consoleErrors.filter(value => !value.includes('net::ERR_FAILED') && !value.includes('503 (Service Unavailable)') && !value.includes('429 (Too Many Requests)')), []);
  assert.equal(evidence.postAttempts.length, 5);
  assert.equal(evidence.postAttempts.filter(attempt => !attempt.dispatched).length, 1);
  evidence.actualPostDispatches = system.calls.filter(call => call.rpc === 'soe_circle_passage_post').length;
  assert.equal(evidence.actualPostDispatches, 4);
  evidence.durablePosts = await countPosts();
  assert.equal(evidence.durablePosts, 3);
  evidence.status = 'PASS';
} catch (error) {
  failed = error;
  evidence.status = 'FAIL';
  evidence.error = String(error.stack || error);
} finally {
  if (browser) {
    try { await browser.close(); } catch (error) { evidence.cleanupErrors.push(String(error)); }
  }
  if (system) {
    try { await system.close(); } catch (error) { evidence.cleanupErrors.push(String(error)); }
  }
  if (server?.pid) {
    try { process.kill(-server.pid, 'SIGTERM'); } catch { /* It may already have exited. */ }
    for (let index = 0; index < 50 && await portOpen(); index++) await pause(100);
    evidence.ownedServerStopped = !(await portOpen());
    if (!evidence.ownedServerStopped) evidence.cleanupErrors.push('Owned browser QA server did not stop');
  }
  if (evidence.cleanupErrors.length) {
    failed ??= Error(evidence.cleanupErrors.join('; '));
    evidence.status = 'FAIL';
  }
  fs.mkdirSync('evidence', { recursive: true });
  fs.writeFileSync('evidence/browser-passage-qa.json', JSON.stringify(evidence, null, 2) + '\n');
  if (failed) { process.stderr.write(String(failed.stack || failed) + '\n'); process.exitCode = 1; }
  else process.stdout.write(JSON.stringify({ status: evidence.status, checks: evidence.checks.length, ownedServerStopped: evidence.ownedServerStopped }) + '\n');
}
