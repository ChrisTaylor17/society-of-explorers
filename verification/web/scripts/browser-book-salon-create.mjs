import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { participationApp, IDS } from '../tests/support/participation-app.mjs';

const [prefix, run, ...rest] = process.argv.slice(2);
assert(!rest.length && /^built-shell-book-salon-[a-z0-9-]+-$/.test(prefix ?? '') && /^book-salon-browser-[0-9]+$/.test(run ?? ''));
assert(process.execArgv.some(v => v.endsWith('/deny-build-network.cjs')));
const hash = x => createHash('sha256').update(x).digest('hex');
const root = fileURLToPath(new URL('../../../', import.meta.url));
const ready = JSON.parse(readFileSync(resolve(root, 'verification/web/evidence', prefix + 'server-ready.json')));
assert.equal(ready.status, 'READY'); const origin = ready.origin; assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
const output = resolve(root, 'verification/web/evidence', run); mkdirSync(output, { recursive: true });
const require = createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');
const f = await participationApp();
await f.db.exec('ALTER TABLE members ADD COLUMN supabase_auth_id uuid, ADD COLUMN wallet_address text;');
for (const name of ['account-deletion-requests-apply.sql', 'account-erasure-access-apply.sql', 'circle-admission-apply.sql', 'book-salon-creation-apply.sql']) {
  await f.db.exec(readFileSync(resolve(root, 'docs/sql', name), 'utf8'));
}
const stories = [], external = [], errors = [], requests = [], screenshots = [];
let browser, failure = null, mode = 'normal', release = null, onHeld = null;
const count = async () => (await f.db.query('SELECT count(*)::int n FROM soe_book_salons_private.creation_receipts')).rows[0].n;
try {
  browser = await require('playwright').chromium.launch({ headless: true,
    executablePath: '/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' } });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    try {
      const req = route.request(), url = new URL(req.url());
      if (url.origin !== origin) { external.push(url.origin + url.pathname); return route.abort(); }
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (url.pathname === '/api/auth/member') return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ member: { id: IDS.host, display_name: 'Fictional Host' }, auth: { provider: 'wallet', subject: IDS.host } }) });
      assert.equal(url.pathname, '/api/book-salons');
      if (req.method() === 'GET') {
        // Explicit synthetic listing adapter. Creation below runs the actual HTTP
        // handler and actual SQL; this fixture does not verify the public GET route.
        const cohorts = (await f.db.query(`SELECT c.id,c.book_id,c.title,c.description,c.max_members,c.start_date,c.thinker_id,c.status,
          (SELECT count(*)::int FROM book_cohort_members m WHERE m.cohort_id=c.id) AS member_count
          FROM book_cohorts c JOIN soe_book_salons_private.creation_receipts r ON r.cohort_id=c.id ORDER BY c.created_at`)).rows;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ cohorts: cohorts.map(row => ({ ...row, start_date: row.start_date ? new Date(row.start_date).toISOString().slice(0, 10) : null })), page: { offset: 0, limit: 50, total: cohorts.length, nextOffset: null } }) });
      }
      assert.equal(req.method(), 'POST'); const body = req.postDataJSON(); requests.push(body);
      if (mode === 'hold') await new Promise(resolve => { release = resolve; onHeld?.(); });
      if (mode === 'malformed') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"cohort":{"id":"unconfirmed"}}' });
      const response = await f.dispatch('/api/book-salons', 'POST', body);
      if (mode === 'lost') { assert.equal(response.status, 200); return route.abort('failed'); }
      if (mode === 'timeout') {
        assert.equal(response.status, 200);
        await new Promise(resolve => { release = resolve; onHeld?.(); });
        // The page has already aborted this intentionally withheld response.
        await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() }).catch(() => {});
        return;
      }
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
    } catch (error) { errors.push(String(error)); await route.abort().catch(() => {}); }
  });
  const page = await context.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(String(error)));
  assert.equal((await page.goto(origin + '/book-salons')).status(), 200);
  const dialog = page.getByRole('dialog', { name: 'Start a new book salon' });
  const open = async title => {
    await page.getByRole('button', { name: 'START A NEW SALON', exact: true }).click();
    await dialog.getByLabel('Book', { exact: true }).selectOption('apology');
    await dialog.getByLabel('Salon name').fill(title);
  };
  const submit = () => dialog.getByRole('button', { name: 'CREATE SALON', exact: true }).click();
  const visibleError = async () => { await dialog.getByRole('alert').waitFor(); assert.equal(await dialog.isVisible(), true); };
  const fitsDialog = async () => {
    const bounds = await dialog.boundingBox(); assert(bounds.x >= 0 && bounds.x + bounds.width <= (await page.viewportSize()).width);
    assert(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  };

  await open('Synthetic failed creation');
  await f.db.exec(`CREATE FUNCTION public.salon_browser_deny() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Synthetic failure'; END $$;
    CREATE TRIGGER salon_browser_deny BEFORE INSERT ON book_cohort_members FOR EACH ROW EXECUTE FUNCTION public.salon_browser_deny();`);
  await submit(); await visibleError(); assert.equal(await count(), 0);
  assert.equal(await dialog.getByLabel('Salon name').inputValue(), 'Synthetic failed creation'); await fitsDialog();
  await page.setViewportSize({ width: 320, height: 760 }); await fitsDialog();
  const shot = resolve(output, 'creation-error-phone.png'); await page.screenshot({ path: shot });
  screenshots.push({ path: shot, sha256: hash(readFileSync(shot)) });
  await f.db.exec('DROP TRIGGER salon_browser_deny ON book_cohort_members;');
  await submit(); await dialog.waitFor({ state: 'hidden' }); assert.equal(await count(), 1);
  assert.equal(requests[0].requestId, requests[1].requestId);
  await page.getByText('1/8 members', { exact: true }).waitFor();
  stories.push('A denied membership save keeps the actual phone form and entries, shows an error, and writes no partial salon; retry succeeds with one creator membership. Dialog fits 390 and 320 pixels.');

  mode = 'lost'; await open('Synthetic lost reply'); await submit(); await visibleError(); assert.equal(await count(), 2);
  const lostKey = requests.at(-1).requestId; mode = 'normal'; await submit(); await dialog.waitFor({ state: 'hidden' });
  assert.equal(requests.at(-1).requestId, lostKey); assert.equal(await count(), 2);
  stories.push('After SQL commits but the response is dropped, an unchanged retry confirms the existing salon without creating another.');

  mode = 'timeout'; await open('Synthetic stalled reply');
  const stalled = new Promise(resolve => { onHeld = resolve; }); await submit(); await stalled;
  await dialog.getByRole('alert').waitFor({ timeout: 20000 }); assert.equal(await count(), 3);
  assert.equal(await dialog.getByRole('button', { name: 'CREATE SALON', exact: true }).isEnabled(), true);
  const timeoutKey = requests.at(-1).requestId; mode = 'normal'; release(); release = null;
  await submit(); await dialog.waitFor({ state: 'hidden' }); assert.equal(await count(), 3);
  assert.equal(requests.at(-1).requestId, timeoutKey);
  stories.push('A response that never arrives reaches the bounded timeout, restores the form controls and permits confirmation of the same committed request.');

  mode = 'hold'; await open('Synthetic double click'); const before = requests.length;
  const held = new Promise(resolve => { onHeld = resolve; });
  await submit(); await held;
  assert.equal(await dialog.getByLabel('Book', { exact: true }).isDisabled(), true);
  assert.equal(await dialog.getByRole('button', { name: 'CANCEL' }).isDisabled(), true);
  await dialog.getByRole('button', { name: 'CREATING...' }).dispatchEvent('click');
  assert.equal(requests.length, before + 1); assert(release); mode = 'normal'; release(); release = null;
  await dialog.waitFor({ state: 'hidden' }); assert.equal(await count(), 4);
  stories.push('While saving, duplicate clicks do not send another request and the fields and cancel action remain disabled.');

  await open('Synthetic changed account'); f.setActor(IDS.reader); await submit(); await visibleError();
  assert.match(await dialog.getByRole('alert').innerText(), /account changed/i); assert.equal(await count(), 4); f.setActor(IDS.host);
  stories.push('An account change between the displayed form and verified server identity is refused without creating a salon.');

  mode = 'malformed'; await dialog.getByLabel('Salon name').fill('Synthetic unconfirmed receipt'); await submit(); await visibleError();
  assert.match(await dialog.getByRole('alert').innerText(), /Could not confirm/); assert.equal(await count(), 4);
  stories.push('An HTTP 200 without the matching request, creator and membership confirmation cannot close the form as a success.');
  assert.deepEqual(external, []); assert.deepEqual(errors, []); await context.close();
} catch (error) { failure = String(error.stack || error); }
finally { if (release) release(); if (browser) await browser.close(); await f.close(); }
const report = { status: failure ? 'FAIL' : 'PASS', failure, stories, screenshots, external, errors,
  sourceHashes: ready.sourceHashes, testSha256: hash(readFileSync(new URL(import.meta.url))),
  sqlSha256: hash(readFileSync(resolve(root, 'docs/sql/book-salon-creation-apply.sql'))), requests,
  cleanup: { browserClosed: true, disposableDatabaseClosed: true },
  scope: 'Actual compiled Next page and creation HTTP handler composed with candidate SQL on disposable PGlite. Server identity, listing transport and dropped/malformed replies are explicit synthetic adapters. No hosted PostgREST, real provider, physical phone, independent concurrent database sessions, private member or paid service.' };
writeFileSync(resolve(output, 'browser.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: report.status, stories: stories.length, external: external.length, errors: errors.length, failure }));
if (failure) process.exitCode = 1;
