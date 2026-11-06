import assert from 'node:assert/strict';
import { lstatSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { installQuestXrDouble } from './quest-xr-browser-double.mjs';
import { questMemberApp, QUEST_ORIGIN, SUBJECTS, TOKENS } from '../../verification/web/tests/support/quest-member-app.mjs';

assert(process.execArgv.some(arg => arg.endsWith('/deny-build-network.cjs')));
const [suffix] = process.argv.slice(2);
assert(/^immersive-[a-z0-9-]+$/.test(suffix ?? ''));
const bundlePath = resolve('../../platforms/evidence/quest-member-composed-fixture-' + suffix, 'page.js');
assert(lstatSync(bundlePath).blocks && lstatSync(process.env.SOE_BROWSER_EXECUTABLE).blocks);
const bundle = readFileSync(bundlePath);
const require = createRequire(resolve(process.env.SOE_PLAYWRIGHT_PACKAGE, 'package.json'));
const app = await questMemberApp({ realAuthority: true, writing: true });
const intent = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const newerIntent = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const headersFor = id =>
  `soe_auth_intent=${id}; soe_auth_provider=supabase; soe_auth_selection_v1=v1.${id}.supabase.${SUBJECTS.author}`;
const endpoint = `/api/circles/${app.circleId}/discussion`;
const reads = [], writes = [], routeErrors = [];
let browser;
try {
  browser = await require('playwright').chromium.launch({
    headless: true, executablePath: process.env.SOE_BROWSER_EXECUTABLE, timeout: 15000,
    env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' },
    args: ['--disable-background-networking', '--disable-component-update', '--no-first-run',
      '--host-resolver-rules=MAP * ~NOTFOUND', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.addInitScript(installQuestXrDouble);
  const cookie = (name, value, httpOnly) => ({ url: QUEST_ORIGIN, name, value, httpOnly, secure: true, sameSite: 'Lax' });
  const select = id => context.addCookies([
    cookie('soe_auth_intent', id, false), cookie('soe_auth_provider', 'supabase', true),
    cookie('soe_auth_selection_v1', `v1.${id}.supabase.${SUBJECTS.author}`, true),
  ]);
  const wallet = await app.walletSelection('author'), otherWallet = await app.walletSelection('outsider');
  const selectWallet = (id, account) => context.addCookies([
    cookie('soe_auth_intent', id, false), cookie('soe_auth_provider', 'wallet', true),
    cookie('soe_auth_selection_v1', `v1.${id}.wallet.${account.id}`, true),
    cookie('soe_wallet_id', account.value, true),
  ]);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', error => routeErrors.push(error.message));
  let afterProof;
  const signOut = () => context.addCookies([cookie('soe_auth_provider', 'signed_out', true)]);
  await context.route('**/*', async route => {
    try {
      const request = route.request(), url = new URL(request.url());
      assert.equal(url.origin, QUEST_ORIGIN);
      if (url.pathname === '/') return await route.fulfill({
        contentType: 'text/html', body: `<!doctype html><html lang="en" data-real-authority data-circle="${app.circleId}"><div id="root"></div><script type="module" src="/page.mjs"></script>`,
      });
      if (url.pathname === '/page.mjs') return await route.fulfill({ contentType: 'text/javascript', body: bundle });
      const headers = await request.allHeaders();
      assert.equal(headers.referer, undefined);
      assert.match(headers['x-soe-auth-intent'] ?? '', /^[0-9a-f-]{36}$/);
      const method = request.method();
      assert.ok(method === 'GET' || method === 'POST' && [endpoint, endpoint + '/preview'].includes(url.pathname));
      const path = url.pathname + url.search;
      const response = await app.dispatch(path, headers, undefined, { body: request.postData() ?? undefined });
      if (url.pathname === '/api/auth/member') {
        assert.equal(headers.authorization, undefined);
        if (afterProof) {
          assert.equal(response.status, 200);
          const change = afterProof;
          afterProof = undefined;
          await change();
        }
      } else {
        assert.ok([endpoint, endpoint + '/preview'].includes(url.pathname));
        assert.equal(headers['x-soe-expected-member'], app.authorId);
        const isWallet = headers.cookie?.includes('soe_auth_provider=wallet') ?? false;
        assert.equal(headers.authorization, isWallet ? undefined : 'Bearer ' + TOKENS.author);
        const observations = method === 'POST' ? writes : reads;
        observations.push({ status: response.status, browserIntent: headers['x-soe-auth-intent'],
          includedMarker: headers.cookie?.includes('soe_auth_provider=signed_out') ?? false, isWallet });
      }
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
    } catch (error) {
      routeErrors.push(error.message);
      await route.abort().catch(() => {});
    }
  });
  async function connect() {
    await page.getByRole('button', { name: 'Connect signed-in account' }).click();
    await page.locator('#member-session-check').click();
    await page.waitForFunction(() => !document.getElementById('circle-archive-open').disabled);
  }
  async function requestArchive(action) {
    const response = page.waitForResponse(value => new URL(value.url()).pathname === endpoint);
    await action();
    return (await response).status();
  }
  await page.goto(QUEST_ORIGIN);
  await page.bringToFront();
  await page.getByRole('button', { name: 'Connect signed-in account' }).click();
  await page.getByText('Sign in to your account, then connect this Quest view.').waitFor();
  assert.deepEqual(await page.evaluate(() => window.questComposedQa.counts()), { factories: 0, calls: 0, subscriptions: 0 });
  await select(intent);
  await connect();
  // Replace only the HttpOnly marker after the valid proof. No browser event
  // can give the old view advance notice of the server's refusal.
  afterProof = signOut;
  const openArchive = () => page.locator('#circle-archive-open').click();
  assert.equal(await requestArchive(openArchive), 401, 'A sign-out after proof must refuse the Quest archive request');
  assert.deepEqual(reads.at(-1), { status: 401, browserIntent: intent, includedMarker: true, isWallet: false });
  assert.equal(app.calls.length, 0);
  assert.equal(await page.locator('#circle-archive-messages article').count(), 0);

  await select(newerIntent);
  await page.evaluate(() => window.questComposedQa.providerChanged());
  await connect();
  assert.equal(await requestArchive(openArchive), 200);
  await page.waitForFunction(() => document.getElementById('circle-archive-status').textContent.includes('Current archive page loaded'));
  assert.deepEqual(reads.at(-1), { status: 200, browserIntent: newerIntent, includedMarker: false, isWallet: false });
  assert.equal(await page.locator('#circle-archive-messages article').count(), 25);

  const readsBeforeRotation = reads.length;
  afterProof = () => select(intent);
  await openArchive();
  await page.waitForFunction(() => document.getElementById('member-session-status').textContent.includes('Session access could not be confirmed'));
  assert.equal(reads.length, readsBeforeRotation);
  assert.equal(await page.locator('#circle-archive-messages article').count(), 0);

  const seePanel = text => page.waitForFunction(value => window.questXrQa.panel().replace(/\s+/g, ' ').includes(value), text);
  const trigger = () => page.evaluate(() => window.questXrQa.select());
  await select(newerIntent);
  await page.evaluate(() => {
    window.questXrQa.enable();
    window.questComposedQa.providerChanged();
  });
  await connect();
  await page.locator('#quest-immersive-enter').click();
  await seePanel('Press the controller trigger to check your signed-in account.');
  await trigger();
  await seePanel('Press the trigger to check Circle access and load recent discussion.');
  const sqlBeforeImmersiveRace = app.calls.length;
  afterProof = signOut;
  assert.equal(await requestArchive(trigger), 401, 'A sign-out after proof must refuse the immersive archive request');
  await seePanel('Current Circle discussion is unavailable.');
  assert.deepEqual(reads.at(-1), { status: 401, browserIntent: newerIntent, includedMarker: true, isWallet: false });
  assert.equal(app.calls.length, sqlBeforeImmersiveRace);
  const renderer = await page.evaluate(() => window.questXrQa.stats());
  assert(renderer.draws > 0);
  assert.deepEqual(renderer.errors, []);

  await page.locator('#quest-immersive-exit').click();
  await selectWallet(newerIntent, wallet);
  await page.evaluate(() => window.questComposedQa.providerChanged());
  const sdkBeforeWallet = await page.evaluate(() => window.questComposedQa.counts().calls);
  await connect();
  assert.equal(await requestArchive(openArchive), 200);
  await page.waitForFunction(() => document.getElementById('circle-archive-messages').children.length === 25);
  assert.deepEqual(reads.at(-1), { status: 200, browserIntent: newerIntent, includedMarker: false, isWallet: true });
  const reply = 'Synthetic wallet reply after reading.';
  const receipts = await app.receiptCount();
  await page.getByRole('button', { name: 'Reply to this message' }).first().click();
  await page.locator('#circle-thread-draft').fill(reply);
  await page.locator('#circle-thread-review').click();
  await page.locator('#circle-thread-preview-content').getByText(reply).waitFor();
  await page.locator('#circle-thread-confirm').check();
  await page.locator('#circle-thread-post').click();
  await page.waitForFunction(() => document.getElementById('circle-thread-status').textContent.includes('Posting confirmed'));
  assert.equal(await app.receiptCount(), receipts + 1);
  assert.equal(writes.length, 2);
  assert.ok(writes.every(observation => observation.status === 200 && observation.isWallet));

  const sqlBeforeWalletSwitch = app.calls.length;
  afterProof = () => selectWallet(newerIntent, otherWallet);
  assert.equal(await requestArchive(openArchive), 401, 'A different HttpOnly wallet under the same intent cannot use the old view');
  assert.deepEqual(reads.at(-1), { status: 401, browserIntent: newerIntent, includedMarker: false, isWallet: true });
  assert.equal(app.calls.length, sqlBeforeWalletSwitch);
  assert.equal(await page.locator('#circle-archive-messages article').count(), 0);

  await selectWallet(newerIntent, wallet);
  await page.evaluate(() => window.questComposedQa.providerChanged());
  await connect();
  await page.locator('#quest-immersive-enter').click();
  await seePanel('Press the controller trigger to check your signed-in account.');
  await trigger();
  await seePanel('Press the trigger to check Circle access and load recent discussion.');
  assert.equal(await requestArchive(trigger), 200);
  await seePanel(reply);
  assert.deepEqual(reads.at(-1), { status: 200, browserIntent: newerIntent, includedMarker: false, isWallet: true });
  assert.equal(await page.evaluate(() => window.questComposedQa.counts().calls), sdkBeforeWallet);

  const walletCookie = ['soe_auth_intent=' + newerIntent, 'soe_auth_provider=wallet',
    `soe_auth_selection_v1=v1.${newerIntent}.wallet.${wallet.id}`, 'soe_wallet_id=' + wallet.value].join('; ');
  const beforeDenied = app.calls.length;
  assert.equal((await app.dispatch(endpoint, { cookie: walletCookie, 'x-soe-auth-intent': newerIntent })).status, 401);
  assert.equal((await app.dispatch(endpoint, { cookie: walletCookie, 'x-soe-auth-intent': intent, 'x-soe-expected-member': wallet.id })).status, 401);
  assert.equal(app.calls.length, beforeDenied);

  const requests = { authorization: 'Bearer ' + TOKENS.author };
  for (const state of [{}, { cookie: headersFor(newerIntent) }]) {
    const response = await app.dispatch(endpoint, { ...requests, ...state, 'x-soe-auth-intent': intent });
    assert.equal(response.status, 401);
  }
  assert.equal((await app.dispatch(endpoint, requests)).status, 200, 'Cookie-free native bearer still works');
  assert.deepEqual(routeErrors, []);
  console.log(JSON.stringify({ status: 'PASS', reads, writes, rotationBeforeDispatchRefused: true, staleIntentAndMissingCookiesRefused: true,
    nativeBearerAccepted: true, immersiveWebGl: true, walletSwitchBeforeSqlRefused: true, walletSdkCalls: 0,
    scope: 'Actual Quest UI, request cookies, canonical member resolver, discussion handler and disposable SQL. Identity provider and headset input use synthetic fixtures.' }));
} finally {
  try { await browser?.close(); }
  finally { await app.close(); }
}
