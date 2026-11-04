// Actual product dashboard/PublicNav/AccountSignOut React UI plus actual logout
// and readback handlers. SDK and initial private data are explicit local doubles.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { offlineApp } from './support/offline-app.mjs';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const origin = 'https://signout-fixture.test', subject = '11111111-1111-4111-8111-111111111111';
const member = { id: '22222222-2222-4222-8222-222222222222', supabase_auth_id: subject, display_name: 'PRIVATE_SYNTHETIC_READER', tier: 'free', exp_tokens: 0, coherence_data: null };
const initial = { member, auth: { provider: 'supabase', subject } };
const bundle = fs.readFileSync(path.join(root, 'verification/web/evidence/account-signout-fixture/page.mjs'));
const html = '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/page.mjs"></script></html>';
const app = offlineApp();
let providerCalls = 0;
app.setMock('@/lib/supabase/server', () => ({ createClient: async () => { providerCalls++; throw Error('No provider request permitted'); } }));
const serverRequest = request => {
  const headers = request.headers(), jar = new Map((headers.cookie || '').split(';').filter(Boolean).map(entry => { const i = entry.indexOf('='); return [entry.slice(0, i).trim(), entry.slice(i + 1)]; }));
  const req = new Request(request.url(), { method: request.method(), headers, ...(request.method() === 'POST' ? { body: request.postData() } : {}) });
  req.cookies = { get: name => jar.has(name) ? { value: jar.get(name) } : undefined };
  return req;
};
const browser = await chromium.launch({ headless: true,
  executablePath: '/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' }, args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'] });
const stories = [], errors = [], unexpected = [], requestIds = [];
try {
  async function fixture({ width = 390, dropReceipt = false, blockedCookies = false, cleanupFails = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    await context.addCookies([{ name: 'soe_wallet_id', value: 'SYNTHETIC_SIGNED_WALLET', url: origin, httpOnly: true }, { name: 'sb-fixture-auth-token.0', value: 'NONISSUED_CACHED_FIXTURE', url: origin }, { name: 'unrelated', value: 'keep', url: origin }]);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    let held = null, release = null;
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) { unexpected.push(request.url()); await route.abort(); return; }
      if (url.pathname === '/') { await route.fulfill({ status: 200, contentType: 'text/html', body: html }); return; }
      if (url.pathname === '/page.mjs') { await route.fulfill({ status: 200, contentType: 'text/javascript', body: bundle }); return; }
      if (url.pathname === '/api/auth/logout') {
        requestIds.push(JSON.parse(request.postData()).requestId);
        held = request;
        await new Promise(resolve => { release = resolve; });
        const response = await app.load('app/api/auth/logout/route.ts').POST(serverRequest(request));
        assert.equal(response.status, 200);
        const headers = { ...Object.fromEntries(response.headers), 'Content-Type': 'application/json' };
        if (!blockedCookies) headers['Set-Cookie'] = [...response.cookies.jar].map(([name, { value, opts }]) => `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${opts.maxAge}`).join('\n');
        await route.fulfill({ status: 200, headers, body: dropReceipt ? 'synthetic interrupted receipt' : JSON.stringify(await response.json()) });
        dropReceipt = false;
        return;
      }
      if (url.pathname === '/api/auth/member') {
        assert.equal(request.headers().authorization, undefined);
        if (request.headers().cookie?.includes('soe_auth_provider=signed_out')) {
          const response = await app.load('app/api/auth/member/route.ts').GET(serverRequest(request));
          await route.fulfill({ status: response.status, contentType: 'application/json', headers: Object.fromEntries(response.headers), body: JSON.stringify(await response.json()) });
        } else await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(initial) });
        return;
      }
      if (url.pathname === '/api/dashboard/briefing') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ profile: null, triggers: [], sessionCount: 0, lastSessionAt: null, latestVerdict: null, memberName: member.display_name, events: [], scans: [], stampSpaces: [], showWelcome: false }) }); return;
      }
      if (url.pathname === '/api/feed') { await route.fulfill({ status: 200, contentType: 'application/json', body: '{"events":[]}' }); return; }
      unexpected.push(request.url()); await route.abort();
    });
    await page.goto(origin);
    await page.getByRole('heading', { name: `Welcome back, ${member.display_name}`, exact: true }).waitFor();
    await page.evaluate(value => { window.signoutQa.cleanupFails = value; }, cleanupFails);
    return { page, context, waitHeld: async () => { for (let i = 0; i < 200 && !held; i++) await new Promise(resolve => setTimeout(resolve, 5)); assert.ok(held); }, release: () => { held = null; release(); } };
  }
  const first = await fixture({ dropReceipt: true, cleanupFails: true });
  const otherTab = await first.context.newPage();
  otherTab.on('pageerror', error => errors.push(error.message));
  await otherTab.goto(origin);
  await otherTab.getByRole('heading', { name: `Welcome back, ${member.display_name}`, exact: true }).waitFor();
  const control = first.page.getByRole('button', { name: 'Sign out of this browser', exact: true });
  await control.focus(); await first.page.keyboard.press('Enter'); await first.waitHeld();
  await first.page.getByRole('heading', { name: 'Account context cleared', exact: true }).waitFor();
  await otherTab.getByRole('heading', { name: 'Account context cleared', exact: true }).waitFor();
  assert.doesNotMatch(await otherTab.locator('body').innerText(), /PRIVATE_SYNTHETIC_READER/);
  assert.doesNotMatch(await first.page.locator('body').innerText(), /PRIVATE_SYNTHETIC_READER/);
  assert.doesNotMatch(await first.page.locator('body').innerText(), /Signed out of this browser\./);
  assert.deepEqual(await first.page.evaluate(() => [localStorage.getItem('soe_wallet_id'), localStorage.getItem('sb-fixture-auth-token'), sessionStorage.getItem('sb-access-token'), localStorage.getItem('unrelated-draft'), sessionStorage.getItem('unrelated-session')]), [null, null, null, 'PRESERVE_ME', 'PRESERVE_ME']);
  stories.push('keyboard sign-out immediately removes actual private dashboard and auth caches while preserving unrelated drafts before server receipt');
  stories.push('same-origin second tab retires its actual private dashboard from the credential-free selection notification before server receipt');
  first.release(); await first.page.getByRole('button', { name: 'Retry browser sign-out', exact: true }).waitFor();
  assert.doesNotMatch(await first.page.locator('body').innerText(), /Signed out of this browser\./);
  await first.page.getByRole('button', { name: 'Retry browser sign-out', exact: true }).click(); await first.waitHeld(); first.release();
  await first.page.getByRole('status').filter({ hasText: 'Signed out of this browser.' }).waitFor();
  assert.equal(requestIds[0], requestIds[1]);
  await first.page.getByText('Provider cleanup could not be confirmed. This browser remains blocked from private access.', { exact: true }).waitFor();
  assert.equal(await first.page.evaluate(() => window.signoutQa.cleanupCalls()), 1);
  const cookies = await first.context.cookies(origin);
  assert.equal(cookies.find(cookie => cookie.name === 'soe_auth_provider')?.value, 'signed_out');
  assert.equal(cookies.find(cookie => cookie.name === 'soe_auth_provider')?.httpOnly, true);
  assert.equal(cookies.some(cookie => cookie.name === 'soe_wallet_id' || cookie.name === 'sb-fixture-auth-token.0'), false);
  assert.equal(cookies.find(cookie => cookie.name === 'unrelated')?.value, 'keep');
  stories.push('lost actual server receipt keeps unknown UI; same request ID retry succeeds only after browser accepted httpOnly marker and actual readback; SDK failure remains separate');
  await first.context.close();
  const blocked = await fixture({ blockedCookies: true });
  await blocked.page.getByRole('button', { name: 'Sign out of this browser', exact: true }).click(); await blocked.waitHeld(); blocked.release();
  await blocked.page.getByRole('button', { name: 'Retry browser sign-out', exact: true }).waitFor();
  assert.doesNotMatch(await blocked.page.locator('body').innerText(), /Signed out of this browser\./);
  assert.equal(await blocked.page.evaluate(() => window.signoutQa.cleanupCalls()), 0);
  stories.push('a valid receipt with blocked cookie persistence cannot produce success or invoke SDK cleanup');
  await blocked.context.close();
  const desktop = await fixture({ width: 1440 });
  await desktop.page.locator('nav').getByRole('button', { name: 'Sign out of this browser', exact: true }).click(); await desktop.waitHeld(); desktop.release();
  await desktop.page.locator('nav').getByRole('status').filter({ hasText: 'Signed out of this browser.' }).waitFor();
  stories.push('actual desktop account navigation preserves the active sign-out control across dashboard retirement');
  await desktop.context.close();
  const mobile = await fixture({ width: 320 });
  await mobile.page.locator('nav button.show-mobile').click();
  const mobileControl = mobile.page.getByRole('button', { name: 'Sign out of this browser', exact: true }).filter({ visible: true }).first();
  const box = await mobileControl.boundingBox(); assert.ok(box.height >= 44);
  await mobileControl.click(); await mobile.waitHeld(); mobile.release();
  await mobile.page.getByRole('status').filter({ hasText: 'Signed out of this browser.' }).waitFor();
  await mobile.page.screenshot({ path: path.join(root, 'verification/web/evidence/account-signout-mobile.png'), fullPage: true });
  stories.push('actual 320px mobile account menu exposes a 44px sign-out control and completes verified browser logout');
  await mobile.context.close();
  assert.equal(providerCalls, 0); assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
  const report = { status: 'PASS', stories, requestIds, providerCalls, unexpected, errors, bundleSHA256: createHash('sha256').update(bundle).digest('hex'), scope: 'Actual product dashboard/PublicNav/AccountSignOut React, browser helper, logout and member readback handlers. Local SDK/initial data/Next navigation doubles; HTTPS routes fully intercepted; no provider, issued credential or remote revocation proof.' };
  fs.writeFileSync(path.join(root, 'verification/web/evidence/account-signout-browser.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
