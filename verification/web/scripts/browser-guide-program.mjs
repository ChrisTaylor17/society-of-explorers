import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [prefix, run] = process.argv.slice(2);
assert(/^built-shell-guide-program-browser-[a-z0-9-]+-$/.test(prefix ?? '') && /^guide-program-browser-[0-9]+$/.test(run ?? ''));
assert(process.execArgv.some(v => v.endsWith('/deny-build-network.cjs')));
const root = fileURLToPath(new URL('../../../', import.meta.url));
const ready = JSON.parse(readFileSync(resolve(root, 'verification/web/evidence', prefix + 'server-ready.json')));
assert.equal(ready.status, 'READY'); const origin = ready.origin; assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
assert.equal(readFileSync(resolve(root, '.next/BUILD_ID'), 'utf8').trim(), ready.buildId);
const out = resolve(root, 'verification/web/evidence', run); mkdirSync(out, { recursive: true });
const require = createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222', S = '33333333-3333-4333-8333-333333333333';
const counts = { sessions_attended: 2, sessions_led: 1, is_guide_candidate: false };
const body = owner => ({ salon: { id: S, title: 'Fictional private program ' + owner, status: 'active' },
  members: [{ id: 'salon-member-1', role: 'member', ...counts, members: { display_name: 'Fictional private member ' + owner } }],
  sessions: [{ id: 'salon-session-1', session_date: '2026-11-09', session_number: 1, status: 'scheduled', track: 'blockchain', topic: 'Fictional private topic ' + owner }],
  stats: { current_week: 1 }, guide: { display_name: 'Fictional guide ' + owner, guide_level: 1 }, myMembership: { ...counts } });
const empty = { salon: null, members: [], sessions: [], stats: null, guide: null, myMembership: null };
let selected = 'A', mode = 'program', joinMode = 'success', release = null, held = false;
const requests = [], external = [], errors = [], stories = [], screenshots = [];
let browser, page, failure = null, closed = false;
try {
  browser = await require('playwright').chromium.launch({ headless: true,
    executablePath: '/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' } });
  const context = await browser.newContext({ viewport: { width: 390, height: 950 }, serviceWorkers: 'block' });
  // Presence admits the actual document, never the API. All account and program
  // replies below are fictional transport fixtures, not provider acceptance.
  await context.addCookies([{ name: 'sb-synthetic-auth-token', value: 'NONISSUED_DOCUMENT_PRESENCE_FIXTURE', url: origin, httpOnly: true, sameSite: 'Lax' }, { name: 'soe_auth_intent', value: S, url: origin, sameSite: 'Lax' }]);
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== origin) { external.push(url.origin + url.pathname); return route.abort(); }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const entry = { path: url.pathname, method: req.method(), selected, mode, owner: req.headers()['x-soe-expected-member'] ?? null, bearer: !!req.headers().authorization };
    requests.push(entry);
    const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (url.pathname === '/api/events' && req.method() === 'POST') {
      assert.deepEqual(req.postDataJSON(), { event: 'checkout_welcome_view', props: { path: '/salon' } }); return route.fulfill({ status: 204 });
    }
    if (url.pathname === '/api/auth/member' && req.method() === 'GET') {
      if (selected === null) return json({ session: 'signed_out', browserSignedOut: true }, 401);
      const id = selected === 'A' ? A : B;
      return json({ member: { id, display_name: 'Fictional account ' + selected, supabase_auth_id: null }, auth: { provider: 'wallet', subject: id } });
    }
    if (url.pathname === '/api/salons' && req.method() === 'GET') return json({ salons: [{ id: S, title: 'Fictional available listing', description: null,
      status: 'recruiting', max_members: 7, member_count: 1, topic_rotation: ['blockchain'], guide_name: 'Fictional host' }] });
    if (url.pathname === '/api/salons/' + S && req.method() === 'POST') {
      assert.equal(entry.owner, selected === 'A' ? A : B); assert.equal(entry.bearer, false); assert.deepEqual(req.postDataJSON(), { action: 'join' }); assert.equal(req.headers()['x-soe-auth-intent'], S);
      if (joinMode === 'failure') return json({ error: 'PRIVATE_BACKEND_CANARY' }, 503);
      mode = 'program'; return json({ success: true });
    }
    if (url.pathname === '/api/salons/my-salon' && req.method() === 'GET') {
      assert.equal(entry.owner, selected === 'A' ? A : B); assert.equal(entry.bearer, false);
      assert.equal(req.headers()['x-soe-auth-intent'], S); const captured = body(selected);
      if (mode === 'hold') { held = true; await new Promise(r => { release = r; }); return json(captured).catch(() => {}); }
      if (mode === 'denied') return json(captured, 403);
      return json(mode === 'empty' ? empty : captured);
    }
    errors.push('Unexpected API ' + req.method() + ' ' + url.pathname); return route.abort();
  });
  page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', e => errors.push(String(e)));
  const status = page.getByRole('region', { name: 'Your program access', exact: true });
  const check = () => status.getByRole('button', { name: 'Check current access', exact: true });
  const notify = () => page.evaluate(() => window.dispatchEvent(new Event('soe:auth-provider-changed')));
  const title = owner => page.getByRole('heading', { name: 'Fictional private program ' + owner, exact: true });
  const missing = async () => assert.doesNotMatch(await page.locator('body').innerText(), /Fictional private (program|member|topic)/);
  const posts = () => requests.filter(r => r.method === 'POST' && r.path === '/api/salons/' + S).length;

  assert.equal((await page.goto(origin + '/salon')).status(), 200); await title('A').waitFor();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 950 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await page.setViewportSize({ width: 390, height: 950 });
  await page.screenshot({ path: resolve(out, 'private-program-phone.png'), fullPage: true, animations: 'disabled' }); screenshots.push('private-program-phone.png');
  stories.push('Compiled page displays the fictional wallet-owned program, roster, calendar and progress with no bearer token and fits four widths.');

  selected = null; await notify(); await status.getByText('Private program details cleared. Check current access to continue.', { exact: true }).waitFor(); await missing();
  await check().click(); await status.getByRole('link', { name: 'Sign in to your program' }).waitFor();
  assert.equal(await status.getByRole('link').getAttribute('href'), '/login?next=%2Fsalon'); await missing();
  stories.push('Same-tab sign-out notification clears all private fields; a real 401 fixture offers the sign-in return path and cannot enable joining.');

  selected = 'B'; await check().click(); await title('B').waitFor();
  const sibling = await context.newPage(); await sibling.goto(origin + '/salons/pilot');
  await page.bringToFront(); await check().click(); await title('B').waitFor();
  await sibling.evaluate(() => localStorage.setItem('soe.auth.provider.changed', 'synthetic-cross-tab-change'));
  await status.getByText('Private program details cleared. Check current access to continue.', { exact: true }).waitFor(); await missing();
  await sibling.close(); await page.bringToFront();
  stories.push('Another tab sends the existing account-change storage event and the program page clears its private view.');

  selected = 'A'; mode = 'hold'; held = false; await check().click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Your program access"]')?.textContent?.includes('Checking your current program access'));
  for (let i = 0; i < 50 && !held; i++) await new Promise(r => setTimeout(r, 10)); assert(held);
  await notify(); selected = 'B'; mode = 'program'; await check().click(); await title('B').waitFor();
  release(); release = null; await page.waitForTimeout(50); assert(await title('B').isVisible()); assert.equal(await title('A').count(), 0);
  stories.push('A delayed old-account read cannot overwrite a newly checked account after retirement.');

  await page.evaluate(() => window.dispatchEvent(new Event('offline'))); await missing(); assert(await check().isDisabled());
  await page.evaluate(() => window.dispatchEvent(new Event('online'))); assert(await check().isEnabled()); await missing();
  await check().click(); await title('B').waitFor();
  stories.push('Offline lifecycle notification hides private state; becoming active alone does not restore it without a fresh check.');

  mode = 'denied'; await check().click(); await status.getByText('Your program access could not be checked. Try again or sign in.', { exact: true }).waitFor(); await missing();
  assert(await page.getByRole('button', { name: 'JOIN', exact: true }).isDisabled());
  stories.push('A denied private response containing realistic-looking data displays neither the data nor false membership availability.');

  mode = 'empty'; await check().click(); await status.getByText('No active guide program is recorded for this account.', { exact: true }).waitFor();
  joinMode = 'failure'; await page.getByRole('button', { name: 'JOIN', exact: true }).click();
  await status.getByText('The join could not be confirmed and may still complete. Check current access; this page will not send it again.', { exact: true }).waitFor();
  const count = posts(); await check().click(); await status.getByText('The earlier join is still unconfirmed. Check current access before taking another action.', { exact: true }).waitFor();
  assert(await page.getByRole('button', { name: 'JOIN', exact: true }).isDisabled()); assert.equal(posts(), count);
  assert(!(await page.locator('body').innerText()).includes('PRIVATE_BACKEND_CANARY'));
  stories.push('An uncertain join shows a useful message, suppresses backend text, and does not send a second write after an empty refresh.');

  mode = 'empty'; joinMode = 'success'; await page.reload(); await status.getByText('No active guide program is recorded for this account.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'JOIN', exact: true }).click(); await title('B').waitFor(); assert.equal(posts(), count + 1);
  stories.push('An explicit synthetic successful join is followed by a new owner-bound program read, including personal progress.');

  mode = 'hold'; held = false; await check().click();
  for (let i = 0; i < 50 && !held; i++) await new Promise(r => setTimeout(r, 10)); assert(held);
  await page.getByRole('link', { name: 'Read the four-week fellowship plan', exact: true }).click();
  await page.waitForURL(origin + '/salons/pilot'); release(); release = null;
  await page.getByRole('heading', { name: /Four weeks.*one small circle/i }).waitFor(); await missing();
  stories.push('Navigation to the separate four-week pilot disposes the private program operation without rendering its delayed reply.');
  assert.deepEqual(external, []); assert.deepEqual(errors, []);
} catch (error) { failure = String(error?.stack ?? error); }
finally {
  if (release) release();
  if (failure && page) await page.screenshot({ path: resolve(out, 'failure.png'), fullPage: true }).catch(() => {});
  if (browser) { await browser.close(); closed = true; }
  const sourceHashes = Object.fromEntries(['app/salon/page.tsx', 'lib/salons/browser-program.ts', 'lib/salons/useGuideProgram.ts', 'lib/circles/browser-access.ts'].map(p => [p, createHash('sha256').update(readFileSync(resolve(root, p))).digest('hex')]));
  const result = { status: failure ? 'FAIL' : 'PASS', failure, stories, screenshots, requests, external, errors, browserClosed: closed, buildId: ready.buildId,
    sourceHashes, scope: 'Actual compiled Next page and lifecycle code, fictional cookie-only API account/program replies, intercepted join/analytics. No issued provider session, hosted write, device or production acceptance.' };
  writeFileSync(resolve(out, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ status: result.status, stories: stories.length, failure, browserClosed: closed, result: resolve(out, 'result.json') }));
}
process.exitCode = failure ? 1 : 0;
