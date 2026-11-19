// Composed browser → actual owner API → actual member-profile SQL → fresh
// owner readback → actual public loader. Identity is an explicit local double.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createMemberProfileFixture, profileRequest } from './support/member-profile-http-fixture.mjs';
import { A, B } from './support/member-profile-fixture.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url)), evidence = path.join(root, 'verification/web/evidence');
const fixtureDir = path.join(evidence, 'profile-editor-fixture'), origin = 'https://profile-composed.test';
const manifest = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'source-manifest.json'), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceFiles = [...Object.keys(manifest.sourceHashes), 'app/api/members/profile/route.ts', 'app/api/auth/member/route.ts',
  'lib/explorer/publicProfile.ts', 'app/api/explorer/[id]/route.ts', 'docs/sql/member-profile-preflight.sql',
  'docs/sql/member-profile-apply.sql', 'docs/sql/member-profile-rollback.sql', 'verification/web/tests/support/member-profile-http-fixture.mjs'];
const sourceHashes = () => Object.fromEntries(sourceFiles.map(name => [name, hash(fs.readFileSync(path.join(root, name)))]));
const beforeHashes = sourceHashes();
for (const [name, expected] of Object.entries(manifest.sourceHashes)) assert.equal(beforeHashes[name], expected, 'Existing exact-source browser bundle is stale: ' + name);
const cssName = fs.readdirSync(fixtureDir).find(name => name.endsWith('.css')); assert.ok(cssName);
const cleanup = [], f = await createMemberProfileFixture({ after: callback => cleanup.push(callback) });

// The owner route was already loaded against the security owner's unchanged
// HTTP/SQL fixture. This additional transport only supports the canonical public
// loader's current explicit ID + publication predicates, on that same database.
let publicReads = 0;
f.app.setMock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => ({ from(table) {
  assert.equal(table, 'members'); let columns, memberId, publication;
  return {
    select(value) { columns = value; assert.equal(value, 'id,display_name,bio,discipline,skills,project_description,seeking,philosophy,profile_visibility'); return this; },
    eq(column, value) { if (column === 'id') memberId = value; else { assert.equal(column, 'profile_visibility'); publication = value; } return this; },
    async maybeSingle() {
      assert.equal(publication, 'public'); publicReads++;
      try {
        await f.db.exec('SET ROLE service_role');
        const rows = (await f.db.query('SELECT ' + columns + ' FROM members WHERE id=$1 AND profile_visibility=$2', [memberId, publication])).rows;
        return rows.length <= 1 ? { data: rows[0] ?? null, error: null } : { data: null, error: { code: 'FIXTURE_CARDINALITY' } };
      } catch { return { data: null, error: { code: 'FIXTURE_UNAVAILABLE' } }; }
      finally { await f.db.exec('RESET ROLE'); }
    },
  };
} }) }));
const publicRoute = f.app.load('app/api/explorer/[id]/route.ts');
const memberRoute = f.app.load('app/api/auth/member/route.ts');
const require = createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json'), { chromium } = require('playwright');
const requests = [], stories = [], errors = [], unexpected = [];
let selected = A, holdConfirmation = false, postCommitted = false, confirmationHeld = false, releaseConfirmation;
const browser = await chromium.launch({ headless: true,
  executablePath: '/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' }, args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'] });

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage();
  page.setDefaultTimeout(10_000); page.on('pageerror', error => errors.push(error.message));
  async function fulfill(route, response) {
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  }
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { unexpected.push(url.origin + url.pathname); await route.abort(); return; }
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/page.css"></head><body><div id="root"></div><script type="module" src="/page.mjs"></script></body></html>' });
    if (url.pathname === '/page.mjs') return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(fixtureDir, 'page.js')) });
    if (url.pathname === '/page.css') return route.fulfill({ contentType: 'text/css', body: fs.readFileSync(path.join(fixtureDir, cssName)) });
    assert.equal(request.headers().authorization, undefined, 'synthetic selected wallet path must use no SDK bearer');
    const req = profileRequest(null, { method: request.method(), raw: request.postData() ?? undefined, url: request.url(), headers: request.headers() });
    let response;
    if (url.pathname === '/api/auth/member') response = await memberRoute.GET(req);
    else if (url.pathname === '/api/members/profile') {
      assert.equal(request.headers().referer, undefined);
      response = request.method() === 'POST' ? await f.route.POST(req) : await f.route.GET(req);
      if (request.method() === 'POST' && response.status === 200) postCommitted = true;
      if (request.method() === 'GET' && postCommitted && holdConfirmation) {
        holdConfirmation = false; confirmationHeld = true;
        await new Promise(resolve => { releaseConfirmation = resolve; }); confirmationHeld = false;
      }
    } else {
      const match = /^\/api\/explorer\/([a-f0-9-]+)$/.exec(url.pathname);
      if (!match) { unexpected.push(url.pathname); await route.abort(); return; }
      response = await publicRoute.GET(req, { params: Promise.resolve({ id: match[1] }) });
    }
    requests.push({ path: url.pathname, method: request.method(), status: response.status, selected: selected === A ? 'A' : 'B' });
    await fulfill(route, response);
  });
  const publicRead = () => page.evaluate(async id => { const response = await fetch('/api/explorer/' + id, { cache: 'no-store' }); return { status: response.status, body: await response.json() }; }, A);
  const confirm = text => page.getByRole('status').filter({ hasText: text }).waitFor();
  await page.goto(origin); await page.getByRole('heading', { name: 'Your profile', exact: true }).waitFor();
  assert.equal(requests.length, 0); assert.equal(f.calls.length, 0);
  assert.equal((await publicRead()).status, 404);
  await page.getByRole('button', { name: 'Load your profile', exact: true }).click();
  await page.getByLabel('Display name', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Who can see these profile fields?').inputValue(), 'private');
  assert.equal(await page.getByLabel('Display name', { exact: true }).inputValue(), 'Existing A');
  assert.equal((await f.db.query('SELECT profile_visibility,profile_revision FROM members WHERE id=$1', [A])).rows[0].profile_visibility, 'private');
  stories.push('actual page starts with no auth/profile request; explicit load crosses the actual owner GET into applied local SQL and existing A remains private');

  await page.getByLabel('Display name', { exact: true }).fill('Authored composed reader');
  await page.getByLabel('About you', { exact: true }).fill('PUBLIC_AUTHORED_COMPOSED_BIO');
  await page.getByLabel('Skills, separated by commas').fill('Reading, Reasoning');
  await page.getByLabel('Who can see these profile fields?').selectOption('public');
  holdConfirmation = true;
  await page.getByRole('button', { name: 'Save and publish profile', exact: true }).click();
  for (let count = 0; count < 1000 && !confirmationHeld; count++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(confirmationHeld, true);
  assert.doesNotMatch(await page.getByRole('status').innerText(), /Saved and confirmed/);
  const published = await publicRead(); assert.equal(published.status, 200);
  assert.deepEqual(Object.keys(published.body), ['profile']);
  assert.deepEqual(Object.keys(published.body.profile).sort(), ['id', 'display_name', 'bio', 'discipline', 'skills', 'project_description', 'seeking', 'philosophy'].sort());
  assert.equal(published.body.profile.display_name, 'Authored composed reader'); assert.equal(published.body.profile.bio, 'PUBLIC_AUTHORED_COMPOSED_BIO');
  assert.doesNotMatch(JSON.stringify(published), /PRIVATE_SYNTHETIC_EMAIL|protected-tier|profile_revision|profile_visibility|supabase_auth_id|exp_tokens|"email"|"tier"/);
  releaseConfirmation(); await confirm('Saved and confirmed: your profile is published.');
  assert.equal(f.calls.filter(call => call.kind === 'write').length, 1);
  const writeIndex = f.calls.findIndex(call => call.kind === 'write'); assert.ok(f.calls.slice(writeIndex + 1).some(call => call.kind === 'read'));
  await page.getByRole('button', { name: 'Reload profile', exact: true }).click(); await confirm('Your saved profile is published.');
  assert.equal(await page.getByLabel('Display name', { exact: true }).inputValue(), 'Authored composed reader');
  assert.equal((await f.db.query('SELECT profile_revision FROM members WHERE id=$1', [A])).rows[0].profile_revision, 1);
  stories.push('browser authored publish executes actual POST and SQL revision1; actual public loader exposes only authored fields; separate fresh owner GET is required before confirmed success and explicit reload retains the same state');

  await page.getByLabel('Who can see these profile fields?').selectOption('private');
  await page.getByRole('button', { name: 'Save private profile', exact: true }).click(); await confirm('Saved and confirmed: your profile is private.');
  const privateAgain = await publicRead(); assert.equal(privateAgain.status, 404); assert.deepEqual(privateAgain.body, { error: 'Public profile unavailable.' });
  const privateRow = (await f.db.query('SELECT profile_visibility,profile_revision FROM members WHERE id=$1', [A])).rows[0];
  assert.equal(privateRow.profile_visibility, 'private'); assert.equal(privateRow.profile_revision, 2);
  stories.push('actual unpublish POST and confirmation advance revision2; the same actual public API/loader immediately returns generic unavailable');

  await page.getByLabel('About you', { exact: true }).fill('STALE_A_DRAFT_MUST_NOT_REACH_B');
  const beforeB = (await f.db.query('SELECT * FROM members WHERE id=$1', [B])).rows;
  // Deliberately omit the retirement event to exercise the server's final
  // expected-owner guard after selection changes while an A draft still exists.
  selected = B; f.setActor(B);
  await page.getByRole('button', { name: 'Save private profile', exact: true }).click();
  await confirm('Your profile or sign-in changed. Load the latest profile before editing again.');
  assert.equal(await page.getByLabel('About you', { exact: true }).isDisabled(), true);
  assert.equal(f.calls.filter(call => call.kind === 'write').length, 2, 'stale owner denial occurs before any SQL mutation');
  assert.deepEqual((await f.db.query('SELECT * FROM members WHERE id=$1', [B])).rows, beforeB);
  assert.ok(requests.some(request => request.path === '/api/members/profile' && request.method === 'POST' && request.status === 409 && request.selected === 'B'));
  await page.getByRole('button', { name: 'Reload profile', exact: true }).click(); await confirm('Your saved profile is private.');
  assert.equal(await page.getByLabel('Display name', { exact: true }).inputValue(), 'Existing B');
  assert.doesNotMatch(await page.locator('body').innerText(), /STALE_A_DRAFT_MUST_NOT_REACH_B|PUBLIC_AUTHORED_COMPOSED_BIO/);
  assert.equal(await page.evaluate(() => window.profileQa.sdkCalls), 0);
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  stories.push('stale A draft under selected B gets actual API409 before SQL even without the UI retirement event; B is byte-for-byte unchanged, and manual reload reveals only B');

  const afterHashes = sourceHashes();
  for (const [name, before] of Object.entries(beforeHashes)) if (name !== 'docs/sql/member-profile-rollback.sql') assert.equal(afterHashes[name], before, 'Composed proof source changed: ' + name);
  const report = { status: 'PASS', stories, requests, ownerSqlReads: f.calls.filter(call => call.kind === 'read').length,
    ownerSqlWrites: f.calls.filter(call => call.kind === 'write').length, publicSqlReads: publicReads, sdkProviderCalls: 0, errors, unexpected,
    sourceHashesBefore: beforeHashes, sourceHashesAfter: afterHashes,
    scope: 'Actual canonical profile page/editor/CSS/DTO/auth-selection helpers, owner GET/POST handlers, public API/loader and member-profile apply SQL on PGlite service role. Existing NextLink/SDK adapters and explicit synthetic wallet identity verification; HTTPS transport fully intercepted. Public loader uses an additional narrow SQL transport on the same DB. No issued credentials, production provider/PostgREST server, remote schema mutation or deployment acceptance.' };
  fs.writeFileSync(path.join(evidence, 'profile-composed-browser.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report, null, 2));
  await context.close();
} finally {
  if (confirmationHeld && releaseConfirmation) releaseConfirmation();
  await browser.close(); for (const callback of cleanup.reverse()) await callback();
}
