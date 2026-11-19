// Actual React product page/editor/parser/circleHeaders/auth-selection helpers.
// HTTP DTOs and SDK are controlled synthetic doubles; no actual API/DB/provider
// acceptance is claimed by this component-level browser proof.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const origin = 'https://profile-fixture.test';
const dir = path.join(root, 'verification/web/evidence/profile-editor-fixture');
const bundle = fs.readFileSync(path.join(dir, 'page.js'));
const cssName = fs.readdirSync(dir).find(name => name.endsWith('.css'));
assert.ok(cssName, 'actual canonical CSS must be present');
const css = fs.readFileSync(path.join(dir, cssName));
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'source-manifest.json'), 'utf8'));
const html = '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/page.css"></head><body><div id="root"></div><script type="module" src="/page.mjs"></script></body></html>';
const ids = { A: '11111111-1111-4111-8111-111111111111', B: '22222222-2222-4222-8222-222222222222' };
const subjects = { A: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };
const initial = account => ({ memberId: ids[account], revision: 1, visibility: 'private', profile: {
  displayName: `PRIVATE_SYNTHETIC_${account}`, bio: `PRIVATE_${account}_BIO`, discipline: '', skills: ['Reading'], projectDescription: '', seeking: '', philosophy: '',
} });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const assertSourcesCurrent = () => {
  for (const [name, expected] of Object.entries(manifest.sourceHashes)) assert.equal(hash(fs.readFileSync(path.join(root, name))), expected, 'Fixture source changed; re-bundle: ' + name);
};
assertSourcesCurrent();
const stories = [], errors = [], unexpected = [], requests = [];
const browser = await chromium.launch({ headless: true,
  executablePath: '/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' },
  args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'],
});

try {
  async function fixture({ width = 390, clock = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    if (clock) { assert.equal(typeof page.clock?.fastForward, 'function'); await page.clock.install(); }
    page.on('pageerror', error => errors.push(error.message));
    const state = { active: 'A', records: { A: initial('A'), B: initial('B') }, reads: 0, authReads: 0, posts: [],
      holdGet: false, holdPost: false, held: null, release: null, response: 'normal', confirm: 'normal', signedOut: false };
    const json = async (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'Cache-Control': 'private, no-store' }, body: JSON.stringify(body) });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) { unexpected.push(request.url()); await route.abort(); return; }
      if (url.pathname === '/') { await route.fulfill({ contentType: 'text/html', body: html }); return; }
      if (url.pathname === '/page.mjs') { await route.fulfill({ contentType: 'text/javascript', body: bundle }); return; }
      if (url.pathname === '/page.css') { await route.fulfill({ contentType: 'text/css', body: css }); return; }
      if (url.pathname === '/api/auth/member') {
        state.authReads++;
        assert.equal(request.headers().authorization, undefined, 'auth selection proof must be cookie-only');
        if (state.signedOut) { await json(route, { session: 'signed_out' }, 401); return; }
        await json(route, { member: { id: ids[state.active], display_name: `PRIVATE_SYNTHETIC_${state.active}`, tier: 'free', exp_tokens: 0, coherence_data: null }, auth: { provider: 'supabase', subject: subjects[state.active] } });
        return;
      }
      if (url.pathname !== '/api/members/profile') { unexpected.push(request.url()); await route.abort(); return; }
      const account = state.active;
      assert.equal(request.headers().authorization, state.signedOut ? undefined : `Bearer NONISSUED_PROFILE_${account}`);
      assert.equal(request.headers().referer, undefined, 'private profile requests must omit referrer');
      requests.push({ method: request.method(), account, authorizationIsNonissuedFixture: !state.signedOut, referrerOmitted: request.headers().referer === undefined });
      if (state.signedOut) { await json(route, { error: 'Unauthorized' }, 401); return; }
      if (request.method() === 'GET') {
        state.reads++;
        const snapshot = structuredClone(state.confirm === 'wrong-owner' ? state.records.B : state.records[account]);
        const reply = state.confirm;
        if (state.holdGet) {
          state.holdGet = false; state.held = 'GET';
          await new Promise(resolve => { state.release = resolve; }); state.held = null;
        }
        if (reply === 'malformed') { await json(route, { ...snapshot, privateLedger: 'FORBIDDEN_EXTRA' }); return; }
        if (reply === 'unavailable') { await json(route, { error: 'Unavailable' }, 503); return; }
        if (reply === 'wrong-revision') snapshot.revision++;
        await json(route, snapshot); return;
      }
      assert.equal(request.method(), 'POST');
      assert.match(request.headers()['content-type'], /application\/json/);
      const body = JSON.parse(request.postData());
      state.posts.push(structuredClone(body));
      assert.deepEqual(Object.keys(body).sort(), ['expectedMemberId', 'expectedRevision', 'patch']);
      assert.equal(body.expectedMemberId, ids[account]);
      assert.equal(body.expectedRevision, state.records[account].revision);
      assert.deepEqual(Object.keys(body.patch).sort(), ['bio', 'discipline', 'displayName', 'philosophy', 'projectDescription', 'seeking', 'skills', 'visibility']);
      const mode = state.response;
      let result;
      if (mode === 'conflict') result = { error: 'Conflict' };
      else {
        const { visibility, ...profile } = body.patch;
        result = { memberId: ids[account], revision: state.records[account].revision + 1, visibility, profile };
        state.records[account] = structuredClone(result);
      }
      if (state.holdPost) {
        state.holdPost = false; state.held = 'POST';
        await new Promise(resolve => { state.release = resolve; }); state.held = null;
      }
      if (mode === 'unknown') { state.response = 'normal'; await route.fulfill({ status: 200, contentType: 'application/json', body: 'synthetic interrupted receipt' }); return; }
      await json(route, result, mode === 'conflict' ? 409 : 200);
    });
    await page.goto(origin);
    await page.getByRole('heading', { name: 'Your profile', exact: true }).waitFor();
    const waitHeld = async method => {
      for (let i = 0; i < 200 && state.held !== method; i++) await new Promise(resolve => setTimeout(resolve, 5));
      assert.equal(state.held, method);
    };
    const change = async account => { state.active = account; await page.evaluate(value => window.profileQa.change(value), account); };
    const load = async account => {
      await page.getByRole('button', { name: /^(Load your profile|Reload profile)$/ }).click();
      await page.getByLabel('Display name', { exact: true }).waitFor();
      assert.equal(await page.getByLabel('Display name', { exact: true }).inputValue(), state.records[account || state.active].profile.displayName);
    };
    return { page, context, state, load, change, waitHeld, release: () => { assert.ok(state.release); state.release(); state.release = null; } };
  }

  const basic = await fixture({ width: 320 });
  assert.equal(basic.state.reads, 0); assert.equal(basic.state.posts.length, 0);
  const loadButton = basic.page.getByRole('button', { name: 'Load your profile', exact: true });
  await loadButton.focus(); await basic.page.keyboard.press('Enter');
  await basic.page.getByLabel('Display name', { exact: true }).waitFor();
  assert.equal(await basic.page.getByLabel('Who can see these profile fields?').inputValue(), 'private');
  assert.equal(await basic.page.getByRole('region', { name: 'Public profile preview' }).count(), 0);
  await basic.page.getByLabel('Display name', { exact: true }).fill('  Authored Reader  ');
  await basic.page.getByLabel('About you', { exact: true }).fill('PUBLIC_AUTHORED_BIO');
  await basic.page.getByLabel('Skills, separated by commas').fill('Reading,  Reasoning');
  await basic.page.getByLabel('Who can see these profile fields?').selectOption('public');
  await basic.page.getByRole('region', { name: 'Public profile preview' }).getByRole('heading', { name: 'Authored Reader', exact: true }).waitFor();
  assert.match(await basic.page.getByRole('region', { name: 'Public profile preview' }).innerText(), /PUBLIC_AUTHORED_BIO/);
  assert.equal(basic.state.posts.length, 0, 'editing or public preview cannot write');
  basic.state.holdPost = true; basic.state.holdGet = true;
  const publish = basic.page.getByRole('button', { name: 'Save and publish profile', exact: true });
  const buttonBox = await publish.boundingBox(); assert.ok(buttonBox.height >= 44);
  for (const control of await basic.page.locator('button, input, textarea, select, a').all()) {
    if (await control.isVisible()) assert.ok((await control.boundingBox()).height >= 44, 'actual visible control must have a 44px target');
  }
  await publish.focus(); await basic.page.keyboard.press('Enter'); await basic.waitHeld('POST');
  assert.equal(await basic.page.getByLabel('Display name', { exact: true }).isDisabled(), true);
  assert.doesNotMatch(await basic.page.getByRole('status').innerText(), /Saved and confirmed/);
  basic.release(); await basic.waitHeld('GET');
  assert.doesNotMatch(await basic.page.getByRole('status').innerText(), /Saved and confirmed/, 'POST receipt alone cannot mean saved');
  basic.release(); await basic.page.getByRole('status').filter({ hasText: 'Saved and confirmed: your profile is published.' }).waitFor();
  assert.equal(basic.state.posts.length, 1); assert.equal(basic.state.posts[0].patch.displayName, 'Authored Reader');
  await basic.page.getByRole('link', { name: 'View your published profile', exact: true }).waitFor();
  assert.equal(await basic.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const name = basic.page.getByLabel('Display name', { exact: true });
  await name.focus(); assert.equal(await name.evaluate(el => el === document.activeElement), true);
  await basic.page.keyboard.press('Tab'); assert.equal(await basic.page.getByLabel('About you', { exact: true }).evaluate(el => el === document.activeElement), true);
  await basic.page.screenshot({ path: path.join(root, 'verification/web/evidence/profile-editor-mobile.png'), fullPage: true });
  stories.push('actual 320px page, canonical CSS and keyboard controls: explicit load, default private, authored-only public draft preview, one owner/revision-bound POST and separate fresh GET before confirmed publication');
  await basic.context.close();

  const unknown = await fixture(); await unknown.load();
  await unknown.page.getByLabel('Display name', { exact: true }).fill('COMMITTED_WITH_LOST_RECEIPT');
  unknown.state.response = 'unknown';
  await unknown.page.getByRole('button', { name: 'Save private profile', exact: true }).click();
  await unknown.page.getByRole('status').filter({ hasText: 'Save outcome unknown.' }).waitFor();
  assert.equal(await unknown.page.getByLabel('Display name', { exact: true }).isDisabled(), true);
  assert.equal(unknown.state.reads, 1); assert.equal(unknown.state.posts.length, 1);
  await unknown.page.getByRole('button', { name: 'Reload profile', exact: true }).click();
  await unknown.page.getByRole('status').filter({ hasText: 'Your saved profile is private.' }).waitFor();
  assert.equal(await unknown.page.getByLabel('Display name', { exact: true }).inputValue(), 'COMMITTED_WITH_LOST_RECEIPT');
  assert.equal(unknown.state.posts.length, 1, 'manual reload reads without resubmission');
  stories.push('a committed save with a lost acknowledgement stays unknown and disables editing; explicit reload reveals retained state without repeating the POST');
  await unknown.context.close();

  const conflict = await fixture(); await conflict.load(); conflict.state.response = 'conflict';
  await conflict.page.getByRole('button', { name: 'Save private profile', exact: true }).click();
  await conflict.page.getByRole('status').filter({ hasText: 'Load the latest profile before editing again.' }).waitFor();
  assert.equal(await conflict.page.getByLabel('Display name', { exact: true }).isDisabled(), true);
  assert.equal(conflict.state.reads, 1); assert.equal(conflict.state.posts.length, 1);
  await conflict.load(); assert.equal(conflict.state.posts.length, 1);
  stories.push('409 conflict disables fields until explicit latest-profile reload; no automatic fetch or duplicate write');
  await conflict.context.close();

  const loadDeadline = await fixture({ clock: true }); loadDeadline.state.holdGet = true;
  await loadDeadline.page.getByRole('button', { name: 'Load your profile', exact: true }).click(); await loadDeadline.waitHeld('GET');
  await loadDeadline.page.clock.fastForward(15_001);
  await loadDeadline.page.getByRole('status').filter({ hasText: 'Profile settings are unavailable.' }).waitFor();
  assert.equal(await loadDeadline.page.getByRole('button', { name: 'Load your profile', exact: true }).isDisabled(), false);
  assert.equal(await loadDeadline.page.getByLabel('Display name', { exact: true }).count(), 0);
  assert.equal(loadDeadline.state.reads, 1);
  loadDeadline.release(); await loadDeadline.page.clock.runFor(50);
  assert.equal(await loadDeadline.page.getByLabel('Display name', { exact: true }).count(), 0);
  await loadDeadline.load(); await loadDeadline.context.close();
  const saveDeadline = await fixture({ clock: true }); await saveDeadline.load(); saveDeadline.state.holdPost = true;
  await saveDeadline.page.getByLabel('Display name', { exact: true }).fill('COMMITTED_BEFORE_DEADLINE');
  await saveDeadline.page.getByRole('button', { name: 'Save private profile', exact: true }).click(); await saveDeadline.waitHeld('POST');
  await saveDeadline.page.clock.fastForward(15_001);
  await saveDeadline.page.getByRole('status').filter({ hasText: 'Save outcome unknown.' }).waitFor();
  assert.equal(await saveDeadline.page.getByLabel('Display name', { exact: true }).isDisabled(), true);
  assert.equal(saveDeadline.state.reads, 1); assert.equal(saveDeadline.state.posts.length, 1);
  saveDeadline.release(); await saveDeadline.page.clock.runFor(50);
  assert.doesNotMatch(await saveDeadline.page.getByRole('status').innerText(), /Saved and confirmed/);
  await saveDeadline.load(); assert.equal(saveDeadline.state.posts.length, 1);
  assert.equal(await saveDeadline.page.getByLabel('Display name', { exact: true }).inputValue(), 'COMMITTED_BEFORE_DEADLINE');
  await saveDeadline.context.close();
  stories.push('accelerated Playwright clock crosses the real 15-second operation deadline without a real 15-second sleep: held GET becomes retryable, sent POST remains unknown/disabled until manual reload, and late replies cannot claim success or resubmit');

  const staleLoad = await fixture(); staleLoad.state.holdGet = true;
  await staleLoad.page.getByRole('button', { name: 'Load your profile', exact: true }).click(); await staleLoad.waitHeld('GET');
  await staleLoad.change('B');
  await staleLoad.page.getByRole('status').filter({ hasText: 'Sign-in changed. Load your profile again.' }).waitFor();
  assert.equal(await staleLoad.page.getByLabel('Display name', { exact: true }).count(), 0);
  staleLoad.release(); await staleLoad.load('B');
  assert.doesNotMatch(await staleLoad.page.locator('body').innerText(), /PRIVATE_SYNTHETIC_A|PRIVATE_A_BIO/);
  stories.push('auth selection retirement aborts a held account-A load; its late response cannot populate account-B fields');
  await staleLoad.context.close();

  const staleSave = await fixture(); await staleSave.load();
  await staleSave.page.getByLabel('About you', { exact: true }).fill('UNSAVED_PRIVATE_A_DRAFT');
  await staleSave.page.getByLabel('Who can see these profile fields?').selectOption('public');
  await staleSave.page.getByRole('region', { name: 'Public profile preview' }).getByText('UNSAVED_PRIVATE_A_DRAFT', { exact: true }).waitFor();
  staleSave.state.holdPost = true;
  await staleSave.page.getByRole('button', { name: 'Save and publish profile', exact: true }).click(); await staleSave.waitHeld('POST');
  await staleSave.change('B');
  await staleSave.page.getByRole('status').filter({ hasText: 'Sign-in changed. Load your profile again.' }).waitFor();
  assert.equal(await staleSave.page.getByLabel('About you', { exact: true }).count(), 0);
  assert.equal(await staleSave.page.getByRole('region', { name: 'Public profile preview' }).count(), 0);
  assert.doesNotMatch(await staleSave.page.locator('body').innerText(), /UNSAVED_PRIVATE_A_DRAFT|PRIVATE_SYNTHETIC_A/);
  staleSave.release(); await staleSave.load('B');
  assert.equal(await staleSave.page.getByLabel('About you', { exact: true }).inputValue(), 'PRIVATE_B_BIO');
  assert.equal(staleSave.state.records.B.revision, 1);
  stories.push('auth selection retirement immediately removes an account-A draft and public preview during a held save; late acknowledgement cannot claim success or overwrite B');
  await staleSave.context.close();

  const bodyRetirement = await fixture(); await bodyRetirement.load();
  await bodyRetirement.page.evaluate(() => { window.profileQa.holdPostBody = true; });
  await bodyRetirement.page.getByLabel('About you', { exact: true }).fill('RETIRED_WHILE_PARSING_PRIVATE_A_BODY');
  await bodyRetirement.page.getByRole('button', { name: 'Save private profile', exact: true }).click();
  await bodyRetirement.page.waitForFunction(() => window.profileQa.bodyHeld);
  const authReadsBeforeRetirement = bodyRetirement.state.authReads;
  await bodyRetirement.change('B');
  await bodyRetirement.page.getByRole('status').filter({ hasText: 'Sign-in changed. Load your profile again.' }).waitFor();
  assert.equal(await bodyRetirement.page.getByLabel('About you', { exact: true }).count(), 0);
  await bodyRetirement.page.evaluate(() => { window.profileQa.releasePostBody(); });
  await bodyRetirement.page.waitForFunction(() => !window.profileQa.bodyHeld);
  await bodyRetirement.page.waitForTimeout(50);
  assert.equal(bodyRetirement.state.authReads, authReadsBeforeRetirement, 'retired JSON must not begin selected-authority lookup for B');
  assert.equal(bodyRetirement.state.reads, 1, 'retired JSON must not begin profile readback');
  assert.doesNotMatch(await bodyRetirement.page.locator('body').innerText(), /RETIRED_WHILE_PARSING_PRIVATE_A_BODY|Saved and confirmed/);
  await bodyRetirement.load('B'); assert.equal(bodyRetirement.state.records.B.revision, 1);
  await bodyRetirement.context.close();
  stories.push('explicit non-abortable local POST JSON stream retires after headers but before parse completion; releasing A bytes after B selection cannot start a B authority lookup/readback, show A fields or report saved');

  const tabs = await fixture(); await tabs.load();
  const secondTab = await tabs.context.newPage();
  secondTab.on('pageerror', error => errors.push(error.message));
  await secondTab.goto(origin);
  await secondTab.getByRole('button', { name: 'Load your profile', exact: true }).click();
  await secondTab.getByLabel('About you', { exact: true }).fill('SECOND_TAB_PRIVATE_A_DRAFT');
  await tabs.change('B');
  for (const page of [tabs.page, secondTab]) {
    await page.getByRole('status').filter({ hasText: 'Sign-in changed. Load your profile again.' }).waitFor();
    assert.equal(await page.getByLabel('About you', { exact: true }).count(), 0);
    assert.doesNotMatch(await page.locator('body').innerText(), /SECOND_TAB_PRIVATE_A_DRAFT|PRIVATE_SYNTHETIC_A/);
  }
  assert.equal(tabs.state.posts.length, 0);
  stories.push('real credential-free same-origin selection notification retires both mounted profile tabs and clears an unsubmitted second-tab draft');
  await tabs.context.close();

  for (const mode of ['wrong-owner', 'wrong-revision', 'unavailable']) {
    const check = await fixture(); await check.load(); check.state.confirm = mode;
    await check.page.getByRole('button', { name: 'Save private profile', exact: true }).click();
    const expected = mode === 'wrong-owner' ? 'Sign-in changed. Load your profile again.' : mode === 'wrong-revision' ? 'Your profile changed during confirmation.' : 'Save outcome unknown.';
    await check.page.getByRole('status').filter({ hasText: expected }).waitFor();
    assert.doesNotMatch(await check.page.getByRole('status').innerText(), /Saved and confirmed/);
    if (mode === 'wrong-owner') assert.equal(await check.page.getByLabel('Display name', { exact: true }).count(), 0);
    else assert.equal(await check.page.getByLabel('Display name', { exact: true }).isDisabled(), true);
    assert.equal(check.state.posts.length, 1);
    await check.context.close();
  }
  stories.push('fresh readback with a different owner, revision drift or outage never reports saved; changed-owner response retires the old private fields');

  const malformed = await fixture(); malformed.state.confirm = 'malformed';
  await malformed.page.getByRole('button', { name: 'Load your profile', exact: true }).click();
  await malformed.page.getByRole('status').filter({ hasText: 'Profile settings are unavailable.' }).waitFor();
  assert.equal(await malformed.page.getByLabel('Display name', { exact: true }).count(), 0);
  assert.doesNotMatch(await malformed.page.locator('body').innerText(), /FORBIDDEN_EXTRA/);
  malformed.state.confirm = 'normal'; await malformed.load();
  await malformed.page.getByLabel('Skills, separated by commas').fill(Array.from({ length: 41 }, (_, i) => `Skill${i}`).join(','));
  await malformed.page.getByRole('button', { name: 'Save private profile', exact: true }).click();
  await malformed.page.getByRole('status').filter({ hasText: 'Enter a display name and up to 40 skills' }).waitFor();
  assert.equal(malformed.state.posts.length, 0);
  stories.push('strict actual DTO parser rejects extra private fields; invalid authored skill count gives feedback without submitting');
  await malformed.context.close();

  const signedOut = await fixture(); signedOut.state.signedOut = true;
  await signedOut.page.getByRole('button', { name: 'Load your profile', exact: true }).click();
  await signedOut.page.getByRole('status').filter({ hasText: 'Sign in to load your profile.' }).waitFor();
  assert.equal(await signedOut.page.evaluate(() => window.profileQa.sdkCalls), 0);
  assert.equal(await signedOut.page.getByLabel('Display name', { exact: true }).count(), 0);
  stories.push('signed-out authority produces no profile fields and no SDK credential lookup');
  await signedOut.context.close();

  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  assertSourcesCurrent();
  const report = { status: 'PASS', stories, unexpected, errors, interceptedProfileRequests: requests.length,
    providerCalls: 0, bundleSHA256: hash(bundle), cssSHA256: hash(css),
    sourceHashes: manifest.sourceHashes, bunVersion: manifest.bunVersion, cssProcessing: manifest.cssProcessing,
    deadlineProof: { acceleratedBrowserClock: 'Playwright clock.fastForward', artificialMilliseconds: 15_001, real15SecondSleep: false },
    scope: 'Actual React profile page/editor/strict DTO parser/circleHeaders/verified-selection helper and canonical CSS. Explicit local SDK, controlled HTTP DTO and one non-abortable POST-body stream double; every HTTPS request intercepted. No actual profile API/SQL/provider, issued credential, deployment or saved production data proof.' };
  fs.writeFileSync(path.join(root, 'verification/web/evidence/profile-editor-browser.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
