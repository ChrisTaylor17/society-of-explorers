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
const app = await questMemberApp({ realAuthority: true });
const intent = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const newerIntent = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const headersFor = id =>
  `soe_auth_intent=${id}; soe_auth_provider=supabase; soe_auth_selection_v1=v1.${id}.supabase.${SUBJECTS.author}`;
const endpoint = `/api/circles/${app.circleId}/discussion`;
const reads = [], routeErrors = [];
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
  await select(intent);
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
        contentType: 'text/html', body: `<!doctype html><html lang="en" data-circle="${app.circleId}"><div id="root"></div><script type="module" src="/page.mjs"></script>`,
      });
      if (url.pathname === '/page.mjs') return await route.fulfill({ contentType: 'text/javascript', body: bundle });
      const headers = await request.allHeaders();
      assert.equal(request.method(), 'GET');
      assert.equal(headers.referer, undefined);
      const path = url.pathname + url.search;
      const response = await app.dispatch(path, headers);
      if (url.pathname === '/api/auth/member') {
        assert.equal(headers.authorization, undefined);
        if (afterProof) {
          assert.equal(response.status, 200);
          const change = afterProof;
          afterProof = undefined;
          await change();
        }
      } else {
        assert.equal(url.pathname, endpoint);
        reads.push({ status: response.status, browserIntent: headers['x-soe-auth-intent'] ?? null,
          includedMarker: headers.cookie?.includes('soe_auth_provider=signed_out') ?? false });
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
  await connect();
  // Replace only the HttpOnly marker after the valid proof. No browser event
  // can give the old view advance notice of the server's refusal.
  afterProof = signOut;
  const openArchive = () => page.locator('#circle-archive-open').click();
  assert.equal(await requestArchive(openArchive), 401, 'A sign-out after proof must refuse the Quest archive request');
  assert.deepEqual(reads.at(-1), { status: 401, browserIntent: intent, includedMarker: true });
  assert.equal(app.calls.length, 0);
  assert.equal(await page.locator('#circle-archive-messages article').count(), 0);

  await select(newerIntent);
  await page.evaluate(() => window.questComposedQa.providerChanged());
  await connect();
  assert.equal(await requestArchive(openArchive), 200);
  await page.waitForFunction(() => document.getElementById('circle-archive-status').textContent.includes('Current archive page loaded'));
  assert.deepEqual(reads.at(-1), { status: 200, browserIntent: newerIntent, includedMarker: false });
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
  assert.deepEqual(reads.at(-1), { status: 401, browserIntent: newerIntent, includedMarker: true });
  assert.equal(app.calls.length, sqlBeforeImmersiveRace);
  const renderer = await page.evaluate(() => window.questXrQa.stats());
  assert(renderer.draws > 0);
  assert.deepEqual(renderer.errors, []);

  const requests = { authorization: 'Bearer ' + TOKENS.author };
  for (const state of [{}, { cookie: headersFor(newerIntent) }]) {
    const response = await app.dispatch(endpoint, { ...requests, ...state, 'x-soe-auth-intent': intent });
    assert.equal(response.status, 401);
  }
  assert.equal((await app.dispatch(endpoint, requests)).status, 200, 'Cookie-free native bearer still works');
  assert.deepEqual(routeErrors, []);
  console.log(JSON.stringify({ status: 'PASS', reads, rotationBeforeDispatchRefused: true, staleIntentAndMissingCookiesRefused: true,
    nativeBearerAccepted: true, immersiveWebGl: true,
    scope: 'Actual Quest UI, request cookies, canonical member resolver, discussion handler and disposable SQL. Identity provider and headset input use synthetic fixtures.' }));
} finally {
  try { await browser?.close(); }
  finally { await app.close(); }
}
