import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { A, LIVE, LINK, liveRoomFixture } from '../tests/support/live-room-fixture.mjs';

const [mode, run, ...extra] = process.argv.slice(2);
const component = mode === '--component';
assert(extra.length === 0 && (component ? /^[0-9]+$/.test(run ?? '') :
  !run && /^built-shell-live-room-[0-9]+-$/.test(mode ?? '')));
const prefix = component ? 'live-room-component-' + run + '-' : mode;
assert(process.execArgv.some(arg => arg.endsWith('/deny-build-network.cjs')));
const ready = component ? { status: 'READY', origin: 'http://127.0.0.1:53667' } :
  JSON.parse(readFileSync('evidence/' + prefix + 'server-ready.json'));
assert.equal(ready.status, 'READY');
assert.match(ready.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
const origin = ready.origin;

function resident(path) {
  const info = lstatSync(path);
  assert(info.isFile() && info.blocks && info.size, path);
  return path;
}
const require = createRequire(resident('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json'));
const chrome = resident('/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');

async function bundleComponent() {
  const esbuild = createRequire(resident('/Users/christaylor/.npm/_npx/31de7e742bdabf00/node_modules/esbuild/package.json'))('esbuild');
  const shims = new Map([
    ['next/link', 'export default function Link(props){return <a {...props}/>;}'],
    ['next/navigation', 'export function useRouter(){return {push: path => location.assign(path), refresh: () => location.reload()};}'],
    ['@/lib/supabase/client', 'export function createClient(){return {auth:{getUser:async()=>({data:{user:null},error:null})}};}'],
  ]);
  const result = await esbuild.build({
    stdin: {
      contents: 'import {createRoot} from "react-dom/client"; import LivePage from "./app/live/page"; createRoot(document.getElementById("root")).render(<LivePage/>);',
      resolveDir: fileURLToPath(new URL('../../../', import.meta.url)), loader: 'tsx',
    },
    bundle: true, jsx: 'automatic', platform: 'browser', write: false,
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'explicit-live-room-fixtures', setup(build) {
      build.onResolve({ filter: /^(next\/link|next\/navigation|@\/lib\/supabase\/client)$/ },
        args => ({ path: args.path, namespace: 'live-room-fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'live-room-fixture' }, args => ({
        contents: shims.get(args.path), loader: 'tsx', resolveDir: fileURLToPath(new URL('../../../', import.meta.url)),
      }));
    } }],
  });
  assert.equal(result.outputFiles.length, 1);
  return result.outputFiles[0].text;
}

const bundle = component ? await bundleComponent() : null;
const fixture = await liveRoomFixture();
const stories = [], errors = [], providerRequests = [], applicationRequests = [];
let actor = null, hold = null, browser;
let failure;
try {
  browser = await require('playwright').chromium.launch({
    headless: true, executablePath: chrome, timeout: 12000,
    env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' },
    args: ['--disable-background-networking', '--disable-component-update', '--no-first-run',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'],
  });
  const context = await browser.newContext({
    viewport: { width: 320, height: 840 }, serviceWorkers: 'block', acceptDownloads: false,
  });
  await context.route('**/*', async route => {
    const req = route.request();
    const url = new URL(req.url());
    let retired = false;
    try {
      if (url.href === LINK) {
        const headers = await req.allHeaders();
        providerRequests.push({
          method: req.method(), referer: headers.referer ?? null,
          cookie: headers.cookie ?? null, authorization: headers.authorization ?? null,
        });
        return await route.fulfill({ status: 200, contentType: 'text/html', body: '<p>Offline meeting fixture</p>' });
      }
      if (url.origin !== origin) throw Error('Blocked unexpected browser origin ' + url.origin);
      if (component && url.pathname === '/live') {
        return await route.fulfill({
          contentType: 'text/html',
          body: '<meta name="viewport" content="width=device-width"><style>body{margin:0}</style><div id="root"></div><script src="/fixture.js"></script>',
        });
      }
      if (component && url.pathname === '/login') {
        return await route.fulfill({ contentType: 'text/html', body: '<title>Local sign-in destination</title>' });
      }
      if (component && url.pathname === '/fixture.js') {
        return await route.fulfill({ contentType: 'application/javascript', body: bundle });
      }
      if (url.pathname === '/api/auth/member') {
        if (!actor) return await route.fulfill({ status: 401, json: { session: 'signed_out' } });
        return await route.fulfill({ json: { member: { id: actor, display_name: 'Fixture member' }, auth: { provider: 'wallet', subject: actor } } });
      }
      if (url.pathname === '/api/live') {
        const headers = await req.allHeaders();
        assert.equal(headers.authorization, undefined);
        assert.equal(headers.cookie, undefined);
        const response = await fixture.list.GET();
        applicationRequests.push({ method: req.method(), path: url.pathname, status: response.status });
        return await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
      }
      if (url.pathname === '/api/live/' + LIVE) {
        const headers = new Headers(await req.allHeaders());
        if (actor) headers.set('x-fixture-actor', actor);
        assert.deepEqual(req.postDataJSON(), { action: 'join' });
        const response = await fixture.action.POST(new Request(req.url(), {
          method: req.method(), headers, body: req.postDataBuffer(),
        }), { params: Promise.resolve({ sessionId: LIVE }) });
        applicationRequests.push({ method: req.method(), path: url.pathname, status: response.status });
        if (hold) {
          retired = true;
          hold.reached.resolve(response.status);
          await hold.release.promise;
        }
        return await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
      }
      return await route.continue();
    } catch (error) {
      if (!retired) errors.push(String(error));
      try { await route.abort(); } catch {}
    }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', error => errors.push(String(error)));
  const join = page.getByRole('button', { name: 'Join session' });
  const frame = page.locator('iframe[title="Society of Explorers Live Council"]');

  assert.equal((await page.goto(origin + '/live')).status(), 200);
  await join.waitFor();
  await page.getByText('Previous Live Council', { exact: true }).waitFor();
  assert.doesNotMatch(await page.locator('body').innerText(), /PRIVATE_|Other community room/);
  assert.equal(await frame.count(), 0);
  assert.equal(providerRequests.length, 0);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  stories.push('The mobile schedule displayed the past event without summaries, links or a meeting frame.');

  await join.press('Enter');
  await page.waitForURL(origin + '/login?next=%2Flive');
  assert.equal(providerRequests.length, 0);
  assert.equal(applicationRequests.at(-1).status, 401);
  stories.push('A signed-out keyboard join received a refusal and opened sign-in with the Live Council return path.');

  actor = A;
  await context.addCookies([{ name: 'soe_auth_intent', value: 'a0000000-0000-4000-8000-000000000001', url: origin }]);
  await page.goto(origin + '/live');
  await join.waitFor();
  assert.equal(await frame.count(), 0);
  await join.press('Enter');
  await page.frameLocator('iframe[title="Society of Explorers Live Council"]').getByText('Offline meeting fixture').waitFor();
  assert.equal(await frame.getAttribute('src'), LINK);
  assert.deepEqual(providerRequests, [{ method: 'GET', referer: null, cookie: null, authorization: null }]);
  const joined = await fixture.db.query('SELECT member_id FROM room_participants WHERE room_id=$1', [LIVE]);
  assert.deepEqual(joined.rows.map(row => row.member_id), [A]);
  stories.push('A verified member’s keyboard join reached the SQL attendance write and loaded the intercepted meeting without app credentials or referrer.');

  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await frame.waitFor({ state: 'detached' });
  await join.waitFor();
  stories.push('A restored browser page removed the prior meeting and required another deliberate join.');

  const reached = Promise.withResolvers(), release = Promise.withResolvers();
  hold = { reached, release };
  await join.click();
  let timer;
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Held join did not reach the handler')), 8000); });
  try {
    assert.equal(await Promise.race([reached.promise, deadline]), 200);
    await page.evaluate(() => window.dispatchEvent(new Event('soe:auth-provider-changed')));
    actor = null;
    release.resolve();
    await join.waitFor();
    assert.equal(await frame.count(), 0);
    assert.equal(providerRequests.length, 1);
    stories.push('A delayed join response did not reopen the meeting after an account change.');
  } finally {
    clearTimeout(timer);
    release.resolve();
    hold = null;
  }
  assert.equal(errors.length, 0, errors.join('\n'));
} catch (error) {
  failure = String(error.stack ?? error);
} finally {
  try { await browser?.close(); } finally { await fixture.db.close(); }
  const result = {
    status: failure ? 'FAIL' : 'PASS', stories, errors, providerRequests, applicationRequests, failure,
    scope: (component ? 'Chromium component bundle with Next and SDK adapters' : 'Built Chromium page')
      + ', actual route source and Supabase SDK with disposable PostgreSQL transport and synthetic account state. External meeting intercepted locally.',
    bundleSha256: bundle && createHash('sha256').update(bundle).digest('hex'),
  };
  writeFileSync('evidence/' + prefix + 'browser.json', JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ status: result.status, stories: stories.length, errors, failure }));
  if (failure) process.exitCode = 1;
}
