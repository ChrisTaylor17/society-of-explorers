import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createCircleMemberBlocksApp } from './support/circle-member-blocks-app.mjs';

assert(process.execArgv.some(value => value.endsWith('/deny-build-network.cjs')));
const root = resolve('../..');
const evidence = resolve(root, 'verification/web/evidence');
const read = file => {
  const info = lstatSync(file);
  assert(info.isFile() && info.blocks && !info.isSymbolicLink(), file);
  return readFileSync(file);
};
const hash = value => createHash('sha256').update(value).digest('hex');
const manifest = read(resolve(evidence, 'native-member-blocks-fixture/source-manifest.json'));
const bundle = read(resolve(evidence, 'native-member-blocks-fixture/page.js'));
assert.equal(hash(bundle), JSON.parse(manifest).bundleSha256);
const { chromium } = createRequire(process.env.SOE_PLAYWRIGHT_PACKAGE + '/package.json')('playwright');
const report = { status: 'RUNNING', fixtureSha256: hash(manifest), stories: [], calls: [], faults: [], cleanup: {} };
let app, browser;
const blockPath = '/api/members/blocks';
const button = (page, name) => page.getByRole('button', { name, exact: true });

async function applyBlock() {
  const headers = { Authorization: 'Bearer ' + app.ACCESS.author, origin: app.ORIGIN };
  const state = await app.dispatch(app.statePath, { headers });
  assert.equal(state.status, 200);
  const value = await state.json();
  const saved = await app.dispatch(app.statePath, { method: 'POST', headers, body: {
    action: 'block', expectedMemberId: app.viewerId, expectedBlockRevision: value.blockReview.revision,
    expectedRevision: value.revision, contentHash: value.contentHash, requestId: randomUUID(),
  } });
  assert.equal(saved.status, 200);
}

try {
  app = await createCircleMemberBlocksApp();
  browser = await chromium.launch({ executablePath: process.env.SOE_CHROMIUM_EXECUTABLE, timeout: 15000,
    args: ['--disable-background-networking','--disable-component-update','--no-first-run','--host-resolver-rules=MAP * ~NOTFOUND'] });
  for (const platform of ['ios', 'android']) {
    await applyBlock();
    const context = await browser.newContext({ viewport: { width: 390, height: 850 }, serviceWorkers: 'block' });
    let holdNext = false, held, release;
    await context.route('**/*', async route => {
      try {
        const request = route.request(), url = new URL(request.url());
        assert.equal(url.origin, app.ORIGIN);
        if (url.pathname === '/') {
          await route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module" src="/native.js"></script>' });
          return;
        }
        if (url.pathname === '/native.js') { await route.fulfill({ contentType: 'application/javascript', body: bundle }); return; }
        assert(['/api/auth/member', blockPath].includes(url.pathname), url.pathname);
        const response = await app.dispatch(url.pathname + url.search, { method: request.method(),
          headers: await request.allHeaders(), body: request.postData() ?? undefined });
        report.calls.push({ platform, path: url.pathname, method: request.method(), status: response.status });
        if (holdNext && url.pathname === blockPath && request.method() === 'GET') {
          holdNext = false;
          await new Promise(resolve => { release = resolve; held = true; });
        }
        await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
      } catch (error) {
        report.faults.push(String(error));
        await route.abort().catch(() => {});
      }
    });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    page.on('pageerror', error => report.faults.push(String(error)));
    await page.goto(app.ORIGIN);
    await page.waitForFunction(() => Boolean(window.nativeQa));
    await page.evaluate(config => window.nativeQa.mount(config), {
      platform, origin: app.ORIGIN, token: app.ACCESS.author, subject: app.SUBJECTS.author,
    });
    const load = button(page, 'Load blocked members');
    const review = page.getByRole('button', { name: /^Review unblock for / });
    async function enter() {
      const check = button(page, 'Check my member account');
      await check.waitFor();
      if (await check.isDisabled()) await button(page, 'Check existing sign-in').click();
      await check.click();
      await button(page, 'Blocked members').click();
      await load.waitFor();
      assert.equal(await review.count(), 0);
    }
    await enter();
    assert.equal(report.calls.filter(call => call.platform === platform && call.path === blockPath).length, 0);
    await load.click();
    await review.waitFor();
    holdNext = true;
    await load.click();
    for (let attempt = 0; !held && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 20));
    assert(held);
    await page.evaluate(() => window.nativeQa.activity('background'));
    await page.getByText('Your member account', { exact: true }).waitFor();
    release();
    await page.evaluate(() => window.nativeQa.activity('active'));
    await enter();
    assert.equal(await review.count(), 0);
    await load.click();
    await review.click();
    assert(await app.ownedBlock());
    await page.screenshot({ path: resolve(evidence, 'native-member-blocks-' + platform + '-review.png') });
    await button(page, 'Unblock this member').click();
    await page.getByText('Unblocked. Load your current list to continue.', { exact: true }).waitFor();
    await load.click();
    await page.getByText('There are no blocks on this page.', { exact: true }).waitFor();
    assert.equal(await app.ownedBlock(), null);
    report.stories.push(platform + ' browser simulation used the phone member menu, retired a held read on backgrounding, and removed the reviewed block through the canonical endpoint.');
    await context.close();
  }
  assert.deepEqual(report.faults, []);
  report.status = 'PASS';
} finally {
  try { await browser?.close(); report.cleanup.browser = true; }
  finally {
    await app?.close();
    report.cleanup.database = true;
    writeFileSync(resolve(evidence, 'native-member-blocks-browser.json'), JSON.stringify(report, null, 2) + '\n');
  }
}
console.log(JSON.stringify({ status: report.status, stories: report.stories.length, requests: report.calls.length }));
