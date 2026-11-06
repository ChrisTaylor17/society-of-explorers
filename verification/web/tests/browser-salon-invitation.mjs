import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { createPublicProfileApp, ORIGIN, TOKENS } from './support/public-profile-app.mjs';

const root = resolve('../..'), file = name => resolve(root, name);
const prefix = 'verification/web/evidence/built-shell-salon-invite-browser-';
const readyFile = file(prefix + 'server-ready.json');
const info = lstatSync(readyFile);
assert(info.isFile() && !info.isSymbolicLink() && info.blocks);
const readyBytes = readFileSync(readyFile), ready = JSON.parse(readyBytes);
assert.equal(ready.status, 'READY');
assert.match(ready.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
assert(process.execArgv.some(value => value.endsWith('/deny-build-network.cjs')));
const { chromium } = createRequire(process.env.SOE_PLAYWRIGHT_PACKAGE + '/package.json')('playwright');
const exec = promisify(execFile);
const guard = file('verification/web/scripts/built-shell-network-guard.cjs');
const report = { status: 'RUNNING', buildId: ready.buildId,
  readySha256: createHash('sha256').update(readyBytes).digest('hex'), stories: [], listings: [], refusedOrigins: [], faults: [] };
let app, browser;

async function fetchShell(request, url) {
  assert.equal(request.method(), 'GET');
  const forwarded = new Set(['accept', 'rsc', 'next-router-prefetch', 'next-router-state-tree', 'next-url', 'next-router-segment-prefetch']);
  const headers = Object.fromEntries(Object.entries(request.headers()).filter(([name]) => forwarded.has(name)));
  const { stdout } = await exec(process.execPath, ['--require', guard, '-e', `
    (async () => {
      const gate = globalThis.__soeBuiltShellGuard;
      const url = new URL(process.argv[1], gate.origin);
      if (url.origin !== gate.origin) throw Error('Invalid fixture shell address');
      const response = await fetch(url, { headers: JSON.parse(process.argv[2]), redirect: 'manual' });
      const headers = Object.fromEntries(response.headers);
      for (const key of ['content-encoding','content-length','transfer-encoding','connection','set-cookie']) delete headers[key];
      const body = Buffer.from(await response.arrayBuffer());
      if (gate.denied.length || body.length > 8000000) throw Error('Shell response refused');
      process.stdout.write(JSON.stringify({ status: response.status, headers, body: body.toString('base64') }));
    })().catch(error => { console.error(error.message); process.exitCode = 1; });`, url.pathname + url.search, JSON.stringify(headers)],
  { env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor', SOE_BUILT_SHELL_PORT: new URL(ready.origin).port },
    timeout: 7000, maxBuffer: 12000000 });
  const output = JSON.parse(stdout);
  return { ...output, body: Buffer.from(output.body, 'base64') };
}

async function open({ headset = false, share = true, origin = ORIGIN } = {}) {
  const context = await browser.newContext({ viewport: { width: 320, height: 850 }, serviceWorkers: 'block', hasTouch: true,
    ...(headset ? { userAgent: 'Mozilla/5.0 (Linux; Android 14; Quest 3) AppleWebKit/537.36 Chrome/135.0.0.0 Mobile Safari/537.36 OculusBrowser/39.0' } : {}) });
  await context.addInitScript(useShare => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: useShare ? async value => { window.sharedInvite = value; } : undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { async writeText(value) { window.copiedInvite = value; } } });
  }, share);
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    try {
      if (url.origin !== origin) { report.refusedOrigins.push(url.origin); await route.abort(); return; }
      if (!url.pathname.startsWith('/api/')) {
        if (origin === ready.origin) await route.continue();
        else await route.fulfill(await fetchShell(request, url));
        return;
      }
      assert(/^\/api\/circles\/[0-9a-f-]{36}$/.test(url.pathname));
      assert.equal(url.search, '?view=listing');
      assert.equal(request.method(), 'GET');
      const headers = await request.allHeaders();
      for (const name of ['authorization', 'cookie', 'apikey']) assert.equal(headers[name], undefined);
      const response = await app.dispatch(url.pathname + url.search, { headers });
      const body = await response.text();
      report.listings.push({ id: url.pathname.split('/').at(-1), status: response.status, fields: Object.keys(JSON.parse(body)).sort() });
      await route.fulfill({ status: response.status, body, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    } catch (error) { report.faults.push(String(error)); try { await route.abort(); } catch {} }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => report.faults.push(String(error)));
  return { page, close: () => context.close() };
}

try {
  app = await createPublicProfileApp();
  const member = app.actors.other, title = 'Philemon public invitation', hiddenTitle = 'Hidden salon fixture';
  const privateMeeting = 'https://meeting.example.test/salon-invitation-fixture';
  async function create(title) {
    const body = await app.createBody({ expectedMemberId: member, title, description: 'Read Philemon together.', format: 'online',
      city: null, venueName: null, venueType: 'online', onlineUrl: privateMeeting });
    const response = await app.dispatch('/api/circles', { method: 'POST', body, headers: {
      Authorization: 'Bearer ' + TOKENS.other, Origin: ORIGIN, 'x-soe-expected-member': member,
    } });
    assert.equal(response.status, 200);
    return (await response.json()).circleId;
  }
  const circle = await create(title), hidden = await create(hiddenTitle);
  await app.db.query('UPDATE public.book_cohorts SET circle_hidden=true WHERE id=$1', [hidden]);
  const detail = `${ORIGIN}/circles/${circle}`, invite = `${ORIGIN}/circles/invite/${circle}`;
  browser = await chromium.launch({ executablePath: process.env.SOE_CHROMIUM_EXECUTABLE, headless: true, timeout: 15000,
    env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' },
    args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'] });
  const button = page => page.getByRole('button', { name: 'Share salon invitation', exact: true });
  const regular = await open();
  await regular.page.goto(detail + '?from=online&reel=which-height');
  await button(regular.page).click();
  assert.deepEqual(await regular.page.evaluate(() => window.sharedInvite), { title, url: invite });
  assert(!(await regular.page.locator('body').innerText()).includes(privateMeeting));
  assert(await regular.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await regular.page.screenshot({ path: file(prefix + 'salon-invitation-320.png') });
  await regular.close();
  report.stories.push('The compiled phone-width web page shares only the reviewed public salon invitation, without Reel context or the meeting address.');

  const browserInvite = `${ready.origin}/circles/invite/${circle}`;
  const quest = await open({ headset: true, share: false, origin: ready.origin });
  const response = await quest.page.goto(browserInvite);
  assert.equal(response.status(), 200);
  const redirect = await response.request().redirectedFrom().response();
  assert.equal(redirect.status(), 307);
  assert.equal(redirect.headers().location, '/circles/' + circle);
  assert.equal(quest.page.url(), `${ready.origin}/circles/${circle}`);
  await quest.page.getByRole('heading', { name: title, exact: true }).waitFor();
  await button(quest.page).click();
  assert.equal(await quest.page.evaluate(() => window.copiedInvite), browserInvite);
  await quest.page.getByText('Salon invitation copied.', { exact: true }).waitFor();
  const signIn = quest.page.getByRole('main').getByRole('link', { name: 'Sign in', exact: true });
  assert.equal(new URL(await signIn.getAttribute('href'), ORIGIN).searchParams.get('next'), '/circles/' + circle);
  assert.equal(await quest.page.getByRole('button', { name: 'Join this Circle', exact: true }).count(), 0);
  await quest.close();
  report.stories.push('A Quest Browser user agent follows the compiled invite to the exact public salon, copies the link and retains the salon as the sign-in destination.');

  const unavailable = await open({ origin: ready.origin });
  await unavailable.page.goto(`${ready.origin}/circles/invite/${hidden}`);
  await unavailable.page.getByText('The public Circle preview is unavailable.', { exact: true }).waitFor();
  assert.equal(await button(unavailable.page).count(), 0);
  assert(!(await unavailable.page.locator('body').innerText()).includes(hiddenTitle));
  const invalid = await unavailable.page.goto(`${ready.origin}/circles/invite/not-a-circle?next=https://wrong.test/`);
  assert.equal(invalid.status(), 404);
  await unavailable.close();
  report.stories.push('A hidden salon gives no public title or share action. A malformed invitation returns a local 404.');
  assert(report.listings.some(item => item.id === hidden && item.status !== 200));
  const fields = ['description', 'format_label', 'host_name', 'id', 'meeting_label', 'next_meeting', 'title'];
  for (const item of report.listings.filter(item => item.id === circle)) assert.deepEqual(item.fields, fields);
  assert.deepEqual(report.faults, []);
  assert.deepEqual(report.refusedOrigins, []);
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL';
  report.failure = String(error.stack ?? error);
  throw error;
} finally {
  await browser?.close();
  await app?.close();
  report.cleanup = 'browser and disposable database closed';
  writeFileSync(file(prefix + 'stories.json'), JSON.stringify(report, null, 2) + '\n');
}
