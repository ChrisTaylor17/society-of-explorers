import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const [prefix, run, ...extra] = process.argv.slice(2);
assert(!extra.length && /^built-shell-(?:online-salon|new-species)(?:-[a-z0-9]+)*-$/.test(prefix ?? ''));
assert(/^online-salon-browser-\d+$/.test(run ?? ''));
assert(process.execArgv.some(arg => arg.endsWith('/deny-build-network.cjs')));
const root = process.cwd(), evidence = resolve(root, 'verification/web/evidence');
const output = resolve(evidence, run);
const sourceHashes = {}, stories = [], requests = [], errors = [], cleanup = {};
function read(path) {
  const file = resolve(root, path), info = lstatSync(file);
  assert(info.isFile() && info.size && info.blocks && !info.isSymbolicLink(), 'Unavailable source ' + path);
  const bytes = readFileSync(file);
  sourceHashes[path] = createHash('sha256').update(bytes).digest('hex');
  return bytes;
}
const ready = JSON.parse(read(`verification/web/evidence/${prefix}server-ready.json`));
read('verification/web/scripts/browser-online-salon.mjs');
assert.equal(ready.status, 'READY');
for (const path of ['app/HomePageClient.tsx', 'app/circles/CirclesBrowser.tsx', 'app/circles/[circleId]/CircleDetail.tsx', 'app/circles/messages/CircleSafetyNav.tsx',
  'app/circles/[circleId]/page.tsx', 'app/clips/ClipPlayer.tsx', 'app/clips/watch/[clipId]/page.tsx',
  'app/circles/[circleId]/discussion/page.tsx', 'app/circles/[circleId]/discussion/DiscussionBrowser.tsx', 'lib/clips/salon.ts',
  'app/great-books/scripture/philemon/page.tsx', 'app/login/page.tsx',
  'lib/circles/useCircleParticipation.ts', 'lib/circles/membership.ts', 'lib/circles/membership-server.ts']) {
  read(path);
  assert.equal(sourceHashes[path], ready.sourceHashes[path], path);
}
const origin = ready.origin;
assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
const memberFixture = ready.publicBuildConfig === 'nonissued member browser fixture';
const providerOrigin = memberFixture ? 'https://synthetic-member-provider.test' : 'https://offline.invalid';
const publicKey = memberFixture ? 'NONISSUED_MEMBER_BROWSER_FIXTURE' : 'OFFLINE_PUBLIC_BUILD_PLACEHOLDER_NOT_A_CREDENTIAL';
const email = 'synthetic-salon@example.invalid', password = 'SYNTHETIC_SALON_PASSWORD', refresh = 'NONISSUED_SALON_REFRESH';
const onlineHref = '/circles?format=online';
const newSpecies = prefix.startsWith('built-shell-new-species-');
const reelId = newSpecies ? 'new-species' : 'which-height';
const reelQuestion = newSpecies ? 'What would you compare before calling it a new species?'
  : 'How would you report both heights so a reader can tell what each number measures and where it was measured from?';
const reelQuery = '&reel=' + reelId;
const require = createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');
const executablePath = '/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
read(executablePath);
mkdirSync(output);
const startedAt = new Date().toISOString();
let browser, fixture, access, failure;
const redact = value => [email, password, refresh, access].filter(Boolean).reduce((text, token) => text.replaceAll(token, '[redacted]'), String(value));
const pass = story => { stories.push(story); console.log('PASS ' + story); };

try {
  process.chdir(resolve(root, 'verification/web'));
  read('verification/web/tests/support/public-profile-app.mjs');
  const { createPublicProfileApp, publicProfileAppHashes, SUBJECTS, ORIGIN } = await import('../tests/support/public-profile-app.mjs');
  fixture = await createPublicProfileApp({ lukeEdition: true });
  Object.assign(sourceHashes, await publicProfileAppHashes());
  const title = 'Philemon online salon', hybridTitle = 'Great Books hybrid salon';
  const meeting = 'https://fixture.invalid/private-meeting-do-not-expose';
  const createCircle = async (who, title, format) => {
    const expectedMemberId = fixture.actors[who];
    const body = await fixture.createBody({ expectedMemberId, title, description: 'Synthetic public description.', format,
      ...(format === 'online' ? { city: null, venueName: null, venueType: 'online' } : {}),
      onlineUrl: format === 'in_person' ? null : meeting });
    const response = await fixture.dispatch('/api/circles', { method: 'POST', body, headers: {
      authorization: 'Bearer ' + fixture.TOKENS[who], origin: ORIGIN, 'x-soe-expected-member': expectedMemberId,
    } });
    const result = await response.json();
    assert.equal(response.status, 200, result.error);
    return result.circleId;
  };
  const circleId = await createCircle('other', title, 'online');
  await createCircle('author', hybridTitle, 'hybrid');
  await createCircle('author', 'Local-only salon', 'in_person');
  const hidden = await createCircle('other', 'Hidden salon', 'online');
  await fixture.db.query('UPDATE book_cohorts SET circle_hidden=true WHERE id=$1', [hidden]);
  const member = fixture.actors.outsider, subject = SUBJECTS.outsider;
  const linked = await fixture.db.query('UPDATE members SET supabase_auth_id=$1 WHERE id=$2 RETURNING id', [subject, member]);
  assert.equal(linked.rows[0]?.id, member);
  const now = Math.floor(Date.now() / 1000), expires = now + 3600;
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  access = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: subject, exp: expires, amr: [{ method: 'password', timestamp: now }] })}.c3ludGhldGlj`;
  const user = { id: subject, aud: 'authenticated', role: 'authenticated' };
  let bearerProofs = 0;
  fixture.app.setMock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { async getUser(token) {
    bearerProofs++;
    if (token === fixture.TOKENS.other) return { data: { user: { id: SUBJECTS.other } }, error: null };
    assert.equal(token, access);
    return { data: { user }, error: null };
  } } }) }));
  const detailPath = `/circles/${circleId}?from=online` + reelQuery, apiPath = `/api/circles/${circleId}`;
  const listing = (id, headers) => fixture.dispatch(`/api/circles/${id}?view=listing`, { headers });
  const sqlStart = fixture.sql.length;
  const injected = await listing(circleId, { authorization: 'Bearer ' + access, cookie: 'soe_auth_provider=supabase', 'x-soe-expected-member': member });
  assert.equal(injected.status, 200);
  assert.match(injected.headers.get('cache-control'), /private.*no-store/);
  const projection = await injected.json();
  assert.deepEqual(Object.keys(projection).sort(), ['description', 'format_label', 'host_name', 'id', 'meeting_label', 'next_meeting', 'title']);
  assert.equal(projection.title, title);
  assert.equal(bearerProofs, 0);
  assert.deepEqual(fixture.sql.slice(sqlStart).map(call => [call.name, call.args.p_actor]), [['soe_circle_detail_profiles', null]]);
  assert.equal((await listing(hidden, { authorization: 'Bearer ' + access })).status, 404);
  assert.equal((await listing('bad-id')).status, 400);
  pass('The public API discards supplied authority and returns seven listing fields. Hidden and malformed targets are refused.');

  browser = await require('playwright').chromium.launch({ headless: true, executablePath, timeout: 15_000,
    env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' },
    args: ['--disable-background-networking', '--disable-component-update', '--no-first-run', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
  const context = await browser.newContext({ viewport: { width: 320, height: 900 }, serviceWorkers: 'block', acceptDownloads: false });
  let meetingNavigations = 0, holdDetail = null;
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    try {
      if (url.origin === origin && !url.pathname.startsWith('/api/')) return await route.continue();
      const headers = await request.allHeaders();
      if (url.href === meeting) {
        assert(request.isNavigationRequest() && method === 'GET');
        for (const name of ['referer', 'cookie', 'authorization']) assert(!headers[name], name);
        meetingNavigations++;
        return await route.fulfill({ status: 200, contentType: 'text/plain', body: 'Synthetic live meeting' });
      }
      let response;
      if (url.origin === providerOrigin) {
        assert(!headers.cookie);
        const cors = { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, x-supabase-api-version', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
        if (method === 'OPTIONS') return await route.fulfill({ status: 204, headers: cors });
        assert.equal(headers.apikey, publicKey);
        if (url.pathname === '/auth/v1/token' && url.search === '?grant_type=password' && method === 'POST') {
          assert(!headers.referer);
          const input = request.postDataJSON();
          assert(input.email === email && input.password === password, 'Exact synthetic password request');
          response = Response.json({ access_token: access, refresh_token: refresh, token_type: 'bearer', expires_at: expires, expires_in: 3600, user }, { headers: cors });
        } else {
          assert(url.pathname === '/auth/v1/user' && !url.search && method === 'GET' && headers.authorization === 'Bearer ' + access, 'Exact synthetic identity request');
          response = Response.json(user, { headers: cors });
        }
      } else {
        assert.equal(url.origin, origin, 'Unexpected destination');
        const publicRead = url.pathname === '/api/circles' || url.searchParams.get('view') === 'listing';
        if (publicRead) assert(!headers.cookie && !headers.authorization && !headers['x-soe-expected-member']);
        if (url.pathname === '/api/feed/pulse') {
          assert.equal(method, 'GET');
          response = Response.json({ todayQuestion: { question_text: 'How do we read together?', thinker_id: 'socrates', date: '2026-11-04' } });
        } else {
          assert(/^\/api\/(?:auth\/(?:member|provider)|circles(?:\/[a-f0-9-]+(?:\/(?:join|rsvp|leave|discussion(?:\/preview)?))?)?)$/.test(url.pathname), url.pathname);
          if (headers.origin) { assert.equal(headers.origin, origin); headers.origin = ORIGIN; }
          if (url.pathname === '/api/auth/provider') {
            const name = 'sb-' + new URL(providerOrigin).hostname.split('.')[0] + '-auth-token=';
            const cookie = (headers.cookie ?? '').split(/;\s*/u).find(part => part.startsWith(name));
            const stored = decodeURIComponent(cookie?.slice(name.length) ?? '');
            assert(stored.startsWith('base64-') && JSON.parse(Buffer.from(stored.slice(7), 'base64url')).access_token === access, 'Synthetic browser session reached selection');
            fixture.setCookieActor('outsider');
          }
          response = await fixture.dispatch(url.pathname + url.search, { method, headers, body: request.postData() ?? undefined });
        }
      }
      const currentDetail = url.origin === origin && url.pathname === apiPath && !url.search;
      requests.push({ path: url.pathname, query: url.search, method, status: response.status,
        ...(currentDetail ? { memberBound: headers['x-soe-expected-member'] === member } : {}) });
      if (currentDetail && holdDetail) {
        const held = holdDetail;
        holdDetail = null;
        held.entered();
        await held.release;
      }
      const delivery = Object.fromEntries(response.headers);
      if (response.cookies?.jar?.size) delivery['set-cookie'] = [...response.cookies.jar].map(([name, { value, opts }]) =>
        `${name}=${value}; Path=/; SameSite=Lax${opts?.httpOnly ? '; HttpOnly' : ''}`).join('\n');
      await route.fulfill({ status: response.status, headers: delivery, body: await response.text() });
    } catch (error) {
      if (!request.failure()?.errorText?.includes('ERR_ABORTED')) errors.push(redact(error.stack || error));
      await route.abort().catch(() => {});
    }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.on('pageerror', error => errors.push(redact(error.stack || error)));
  const button = name => page.getByRole('button', { name, exact: true });
  const link = name => page.getByRole('link', { name, exact: true });
  const meetingButton = button('Open the online meeting');
  const meetingUnavailable = page.getByText('The meeting is unavailable for your current Circle access.', { exact: true });
  const checkFreshDetail = since => {
    const read = requests.slice(since).filter(call => call.path === apiPath && !call.query);
    assert.deepEqual(read.map(call => [call.method, call.status, call.memberBound]), [['GET', 200, true]]);
  };
  const accountLink = name => page.locator('main').getByRole('link', { name, exact: true });
  const navSignIn = page.getByRole('navigation', { name: 'Circle safety navigation' }).getByRole('link', { name: 'Sign in', exact: true });
  const saved = () => page.getByText('Request confirmed. Current state is shown below; an earlier receipt does not override later changes.', { exact: true }).waitFor();
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  const go = async path => assert.equal((await page.goto(origin + path)).status(), 200);
  const browse = async (name, path, clipTitle, id) => {
    await go(path);
    const target = clipTitle
      ? page.getByLabel(clipTitle, { exact: true }).getByRole('link', { name, exact: true })
      : link(name);
    const destination = id ? onlineHref + '&reel=' + id : onlineHref;
    assert.equal(await target.getAttribute('href'), destination);
    await target.click();
    await page.waitForURL(origin + destination);
    await link(title).waitFor();
  };
  await go('/');
  await page.getByRole('heading', { name: 'Read together. Meet online.', level: 1 }).waitFor();
  await page.getByText('“How do we read together?”').waitFor();
  assert.equal(await fits(), true);
  await browse('FIND AN ONLINE CIRCLE', '/');
  await browse('Find an online reading Circle', '/great-books/scripture/philemon');
  for (const [id, title] of [
    ['night-sky-traffic', 'Who gets the night sky?'], ['telescope-first-tilt', 'What did the tilt prove?'],
    ['which-height', 'Which height are we measuring?'],
    ...(newSpecies ? [['new-species', 'Is it a new species?']] : []),
  ]) {
    await browse('Discuss in an online Circle', '/clips/watch/' + id, title, id);
    assert.equal(await page.getByRole('region', { name: 'Question from the Reel' }).getByRole('link').getAttribute('href'), '/clips/watch/' + id);
  }
  await link(hybridTitle).waitFor();
  assert.equal(await link('Local-only salon').count(), 0);
  assert.equal(await link('Hidden salon').count(), 0);
  await page.getByLabel('Reading, topic or circle name').fill('Philemon');
  await button('Search').click();
  await page.waitForURL(url => url.searchParams.get('q') === 'Philemon' && url.searchParams.get('reel') === reelId);
  await link(title).waitFor();
  await page.getByText(reelQuestion, { exact: true }).waitFor();
  assert(requests.filter(call => call.path === '/api/circles').every(call => !call.query.includes('reel=')));
  pass('The homepage and Philemon lead to online and hybrid search. Each Reel brings its own public question, and search preserves that choice outside the API request.');

  const prePreview = requests.length;
  await link(title).click();
  await page.waitForURL(origin + detailPath);
  const preview = page.getByRole('region', { name: 'Public Circle preview' });
  await preview.getByText('Synthetic public description.').waitFor();
  assert.match(await preview.innerText(), /Online.*hosted by.*Next meeting/s);
  assert.equal(await fits(), true);
  assert.equal(await meetingButton.count(), 0);
  assert.equal(await button('Join this Circle').count(), 0);
  assert.deepEqual(requests.slice(prePreview).map(({ path, query }) => path + query), [apiPath + '?view=listing']);
  for (const name of ['Sign in', 'Create a free account']) assert.equal(new URL(await accountLink(name).getAttribute('href'), origin).searchParams.get('next'), detailPath);
  assert.equal(await navSignIn.getAttribute('href'), await accountLink('Sign in').getAttribute('href'));
  await page.screenshot({ path: resolve(output, 'guest-320.png'), fullPage: true });
  pass('A guest sees the public preview at 320px with no account or meeting request. Sign-in and signup retain the Circle from the preview and navigation.');

  await navSignIn.click();
  await page.waitForURL(url => url.pathname === '/login' && url.searchParams.get('next') === detailPath);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await button('Sign in').click();
  await page.waitForURL(origin + detailPath);
  await preview.waitFor();
  assert.equal(await meetingButton.count(), 0);
  assert.equal(await link('Online Circles').getAttribute('href'), onlineHref + reelQuery);
  assert((await context.cookies()).some(cookie => cookie.name === 'soe_auth_selection_v1' && cookie.httpOnly));
  assert(requests.some(call => call.path === '/api/auth/provider' && call.status === 200));
  pass('The built password sign-in verifies synthetic identity and returns to the same Circle and online directory.');

  await button('Load current Circle access').click();
  await button('Join this Circle').click();
  await button('Confirm join').waitFor();
  assert.equal(await button('Confirm join').isDisabled(), true);
  assert.equal(await meetingButton.count(), 0);
  assert(!requests.some(call => call.method === 'POST' && call.path.endsWith('/join')));
  await page.getByRole('checkbox', { name: /I read the community norms/ }).check();
  await button('Confirm join').click();
  await saved();
  await meetingButton.waitFor();
  assert.equal(await link('Open in Quest Browser').getAttribute('href'), `/quest/${circleId}?reel=${reelId}`);
  assert.equal(await page.locator('a[href*="private-meeting-do-not-expose"]').count(), 0);
  assert.equal(await fits(), true);
  pass('A verified nonmember reviews the norms and confirms membership before the private meeting control appears.');

  const questPath = `/quest/${circleId}?reel=${reelId}`;
  await link('Open in Quest Browser').click();
  await page.waitForURL(origin + questPath);
  await page.getByRole('region', { name: 'Question from the Reel' }).getByText(reelQuestion, { exact: true }).waitFor();
  assert.equal(new URL(await link('Sign in to your account').getAttribute('href'), origin).searchParams.get('next'), questPath);
  await page.goBack();
  await page.waitForURL(origin + detailPath);
  await button('Load current Circle access').click();
  pass('The verified Circle opens Quest Browser with the same Reel question and a sign-in link back to it.');

  await link('Open discussion with the Reel question').click();
  await page.waitForURL(origin + `/circles/${circleId}/discussion?reel=${reelId}`);
  await page.getByText(reelQuestion, { exact: true }).waitFor();
  assert.equal(await button('Use Reel question in a draft').count(), 0);
  const discussionPath = apiPath + '/discussion';
  const posts = () => requests.filter(call => call.path === discussionPath && call.method === 'POST').length;
  const beforePost = posts();
  await button('Load current discussion archive').click();
  await button('Use Reel question in a draft').click();
  const draft = page.getByLabel('Your discussion comment');
  const expectedDraft = reelQuestion + '\n\n' + origin + '/clips/watch/' + reelId;
  assert.equal(await draft.inputValue(), expectedDraft);
  assert.equal(await fits(), true);
  await page.screenshot({ path: resolve(output, 'reel-draft-320.png'), fullPage: true });
  assert.equal(await button('Use Reel question in a draft').isDisabled(), true);
  const edited = 'My first thought is to name the reference point.\n\n' + expectedDraft;
  await draft.fill(edited);
  await button('Prepare discussion preview').click();
  await page.getByRole('region', { name: 'Review discussion message' }).getByText(edited, { exact: true }).waitFor();
  assert.equal(await button('Post reviewed discussion message').isDisabled(), true);
  assert.equal(posts(), beforePost);
  await page.getByRole('checkbox', { name: /I reviewed this exact message/ }).check();
  await button('Post reviewed discussion message').click();
  await page.getByText('Posting confirmed. Open the saved message to check its current thread.', { exact: true }).waitFor();
  assert.equal(posts(), beforePost + 1);
  assert.deepEqual((await fixture.db.query('SELECT content FROM seminar_messages WHERE cohort_id=$1 AND member_id=$2',
    [circleId, member])).rows, [{ content: edited }]);
  await link('Return to Circle details').click();
  await page.waitForURL(origin + detailPath);
  await button('Load current Circle access').click();
  await meetingButton.waitFor();
  pass('A current member opens the archive, edits the Reel question and public link, reviews the exact text, and saves one message only after confirmation.');

  let since = requests.length;
  await meetingButton.click();
  await page.waitForURL(meeting);
  await page.getByText('Synthetic live meeting', { exact: true }).waitFor();
  assert.equal(context.pages().length, 1);
  assert.equal(meetingNavigations, 1);
  checkFreshDetail(since);
  await page.goBack();
  await page.waitForURL(origin + detailPath);
  await button('Load current Circle access').waitFor();
  assert.equal(await meetingButton.count(), 0);
  await button('Load current Circle access').click();
  await meetingButton.waitFor();
  pass('The current member opens the fresh link in the same tab without app credentials or a referrer. Back needs a new access check.');

  let entered, release;
  const started = new Promise(resolve => { entered = resolve; });
  holdDetail = { entered, release: new Promise(resolve => { release = resolve; }) };
  let timer;
  try {
    await meetingButton.click();
    await Promise.race([started, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error('Meeting detail did not reach the hold point')), 10_000);
    })]);
    const cancelled = page.waitForEvent('requestfailed', {
      predicate: request => request.url() === origin + apiPath, timeout: 10_000,
    });
    await Promise.all([cancelled, page.evaluate(() => window.dispatchEvent(new Event('blur')))]);
    await page.getByText(/Private Circle details, conversation and action drafts cleared/).waitFor();
    assert.equal(await meetingButton.count(), 0);
  } finally {
    clearTimeout(timer);
    holdDetail = null;
    release();
  }
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await button('Load current Circle access').click();
  await meetingButton.waitFor();
  assert.equal(meetingNavigations, 1);
  pass('Losing focus during a held meeting check aborts the read and retires the opening action.');

  const removed = await fixture.db.query('DELETE FROM public.book_cohort_members WHERE cohort_id=$1 AND member_id=$2 RETURNING member_id', [circleId, member]);
  assert.equal(removed.rows[0]?.member_id, member);
  since = requests.length;
  await meetingButton.click();
  await meetingUnavailable.waitFor();
  checkFreshDetail(since);
  assert.equal(meetingNavigations, 1);
  assert.equal(await meetingButton.count(), 0);
  const joinAgain = async () => {
    await button('Join this Circle').click();
    await page.getByRole('checkbox', { name: /I read the community norms/ }).check();
    await button('Confirm join').click();
    await saved();
    await meetingButton.waitFor();
  };
  await joinAgain();
  pass('A member removed after loading Circle details cannot open the cached meeting. The current nonmember view is shown.');

  await page.getByRole('button', { name: /^Going on / }).first().click();
  await page.getByRole('checkbox', { name: /I reviewed this change/ }).check();
  await button('Confirm RSVP').click();
  await saved();
  assert.equal((await fixture.rsvpRow(circleId, projection.next_meeting, 'outsider')).status, 'going');
  await button('Leave this Circle').click();
  await page.getByRole('checkbox', { name: /I reviewed this change/ }).check();
  await button('Confirm leave').click();
  await saved();
  assert.equal(await fixture.rsvpRow(circleId, projection.next_meeting, 'outsider'), null);
  assert.equal(await meetingButton.count(), 0);
  pass('The reviewed RSVP is stored in SQL. Leaving removes it and takes the meeting control out of the view.');

  await joinAgain();
  const host = fixture.actors.other;
  const hostHeaders = { authorization: 'Bearer ' + fixture.TOKENS.other, origin: ORIGIN, 'x-soe-expected-member': host };
  const hostDetail = await fixture.dispatch(apiPath, { headers: hostHeaders });
  assert.equal(hostDetail.status, 200);
  const { revision } = await hostDetail.json();
  const completion = await fixture.dispatch(apiPath + '/complete', { method: 'POST', headers: hostHeaders,
    body: { expectedMemberId: host, expectedRevision: revision, requestId: crypto.randomUUID() } });
  assert.equal(completion.status, 200, (await completion.json()).error);
  since = requests.length;
  await meetingButton.click();
  await meetingUnavailable.waitFor();
  checkFreshDetail(since);
  assert.equal(meetingNavigations, 1);
  assert.equal(await meetingButton.count(), 0);
  await link('Open discussion with the Reel question').waitFor();
  const ended = await fixture.dispatch(apiPath, { headers: { authorization: 'Bearer ' + access, 'x-soe-expected-member': member } });
  assert.equal(ended.status, 200);
  const endedDetail = await ended.json();
  assert.equal(endedDetail.ended, true);
  assert.equal(endedDetail.online_url, null);
  assert.equal(endedDetail.capabilities.canReadConversation, true);
  pass('Host completion removes the private URL from the API and blocks cached meeting actions while preserving discussion.');

  await go(`/circles/${hidden}?from=online`);
  await page.getByText('The public Circle preview is unavailable.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Hidden salon' }).count(), 0);
  assert(requests.filter(call => call.path.endsWith('/feed/pulse')).length > 0);
  assert.deepEqual(errors, []);
  pass('A direct hidden Circle link discloses no listing, even after sign-in.');
  const duplicateAt = requests.length;
  await go(onlineHref + reelQuery + '&reel=night-sky-traffic');
  await page.getByText(/This search link or its book/).waitFor();
  assert.equal(await page.getByRole('region', { name: 'Question from the Reel' }).count(), 0);
  await go(`/circles/${circleId}/discussion?reel=unreviewed-or-forged`);
  await button('Open newest archive page').waitFor();
  assert.equal(await button('Load current discussion archive').count(), 0);
  assert.equal(await page.getByRole('region', { name: 'Question from the Reel' }).count(), 0);
  assert.equal(await button('Use Reel question in a draft').count(), 0);
  assert(!requests.slice(duplicateAt).some(call => call.path.startsWith('/api/circles')));
  pass('A duplicate or unreviewed Reel reference never selects a question or triggers a Circle request.');
  for (const [name, expected] of Object.entries(sourceHashes)) assert.equal(createHash('sha256').update(read(name)).digest('hex'), expected, name);
} catch (error) {
  failure = redact(error.stack || error);
} finally {
  if (browser) { await browser.close(); cleanup.browser = 'closed'; }
  if (fixture) { await fixture.close(); cleanup.database = 'closed'; }
  writeFileSync(resolve(output, 'browser.json'), JSON.stringify({ status: failure ? 'FAIL' : 'PASS', startedAt,
    completedAt: new Date().toISOString(), origin, stories, requests, errors, failure, cleanup, sourceHashes,
    scope: 'Built Next web routes and actual browser account client. Provider responses and identity are synthetic. Canonical HTTP handlers use a single disposable SQL database. No live provider, member data, private meeting destination or deployment.' }, null, 2) + '\n', { flag: 'wx' });
}
if (failure) throw Error(failure);
