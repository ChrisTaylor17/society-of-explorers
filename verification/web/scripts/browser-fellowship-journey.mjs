import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const [prefix, run, ...extra] = process.argv.slice(2);
assert(!extra.length && /^built-shell-[a-z0-9-]+-$/.test(prefix ?? '') && /^fellowship-journey-[0-9]+$/.test(run ?? ''));
assert(process.execArgv.some(v => v.endsWith('/deny-build-network.cjs')));
const hash = value => createHash('sha256').update(value).digest('hex');
const readyFile = resolve('verification/web/evidence', prefix + 'server-ready.json');
const ready = JSON.parse(readFileSync(readyFile));
assert.equal(ready.status, 'READY');
const origin = ready.origin;
assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
const output = resolve('verification/web/evidence', run);
mkdirSync(output, { recursive: true });
const require = createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');
const executable = '/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const id = '81d97662-ffde-42dc-a07f-bc9e8832a972';
const listing = {
  id, title: 'Synthetic local salon', description: 'Test fixture only; no real host or meeting.',
  format: 'online', format_label: 'Online', city: null, region: null, venue_name: null, venue_label: 'Online',
  meeting_label: 'Sunday at 7 PM', weekday: 0, time: '19:00', timezone: 'America/New_York',
  start_date: '2026-11-08', first_meeting: '2026-11-08', next_meeting: '2026-11-08', week: 1,
  reading: { week: 1, title: 'Synthetic reading', slug: 'synthetic', author: 'Fixture', selection: 'A local test selection' },
  reading_program: null, program_length: 12, member_count: 1, max_members: 8, spots_left: 7,
  status: 'forming', host_name: 'Fixture host', going_next: null, phase: 'upcoming',
};
const topics = [
  { id: 'psalm-22', title: 'Psalm 22 · lament and hope', source: '/fellowship/scripture#cry-of-abandonment' },
  { id: 'isaiah-53', title: 'Isaiah 53 · the suffering servant', source: '/fellowship/scripture#numbered-with-transgressors' },
  { id: 'josephus', title: 'Josephus · text and historical evidence', source: '/fellowship/research/ancient-jesus-passage' },
];
const stories = [], api = [], external = [], unexpected = [], errors = [], screenshots = [];
let browser, failure = null;
async function open(page, path) {
  assert.equal((await page.goto(origin + path)).status(), 200);
  await page.locator('body').waitFor();
}
async function fits(page) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Horizontal overflow at ' + page.url());
}
function nextFrom(href) { return new URL(href, origin).searchParams.get('next'); }
async function picture(page, name) {
  const path = resolve(output, name + '.png');
  await page.screenshot({ path }); screenshots.push({ path, sha256: hash(readFileSync(path)) });
}
try {
  browser = await require('playwright').chromium.launch({ executablePath: executable, headless: true, timeout: 15000,
    env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' } });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { external.push(url.origin + url.pathname); return route.abort(); }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    api.push({ path: url.pathname, search: url.search, method: request.method() });
    assert.equal(request.method(), 'GET', 'No automatic mutation is allowed');
    if (url.pathname === '/api/circles') {
      assert(!url.searchParams.has('fellowship') && !url.searchParams.has('reel'), 'Public study context must not alter discovery authority');
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ready: true, circles: [listing], page: { limit: 25, nextCursor: null, asOf: '2026-11-08T07:30:00Z' } }) });
    }
    if (url.pathname === '/api/circles/' + id && url.searchParams.get('view') === 'listing') {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(listing) });
    }
    unexpected.push(url.pathname + url.search);
    return route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Local unsigned fixture"}' });
  });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(String(error)));
  for (const topic of topics) {
    await open(page, '/fellowship');
    const card = page.locator('article').filter({ has: page.getByRole('heading', { name: topic.title, exact: true }) });
    assert.equal(await card.getByRole('link', { name: 'Read the sources first' }).getAttribute('href'), topic.source);
    await card.getByRole('link', { name: 'Find a Circle with this question' }).click();
    await page.getByRole('region', { name: 'Fellowship question for your Circle' }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('fellowship'), topic.id);
    assert.equal(await page.getByLabel('Format', { exact: true }).inputValue(), 'online');
    await page.getByRole('heading', { name: 'Current results page' }).waitFor(); await fits(page);
    await page.locator('[data-circle-id="' + id + '"]').getByRole('link', { name: listing.title, exact: true }).click();
    const panel = page.getByRole('region', { name: 'Your Fellowship question' });
    await panel.getByRole('heading', { name: topic.title }).waitFor();
    await page.getByRole('region', { name: 'Public Circle preview' }).waitFor(); await fits(page);
    const signIn = page.getByRole('main').getByRole('link', { name: 'Sign in', exact: true });
    const next = nextFrom(await signIn.getAttribute('href'));
    assert.equal(new URL(next, origin).searchParams.get('fellowship'), topic.id);
    assert.equal(new URL(next, origin).pathname, '/circles/' + id);
    if (topic.id === 'psalm-22') {
      await picture(page, 'phone-circle-question');
      await signIn.click(); await page.waitForURL(url => url.pathname === '/login');
      assert.equal(new URL(page.url()).searchParams.get('next'), next);
      await page.goBack(); await panel.waitFor();
    }
    assert.equal(await page.getByRole('button', { name: 'Confirm join', exact: true }).count(), 0);
    await open(page, '/circles/' + id + '/discussion?fellowship=' + topic.id);
    await page.getByRole('region', { name: 'Question from Fellowship' }).getByRole('heading', { name: topic.title }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Use Fellowship question in a draft' }).count(), 0);
    assert.equal(nextFrom(await page.getByRole('link', { name: 'Sign in or create an account', exact: true }).getAttribute('href')), '/circles/' + id + '/discussion?fellowship=' + topic.id);
    await fits(page);
    await open(page, '/quest/' + id + '?fellowship=' + topic.id);
    await page.getByRole('region', { name: 'Fellowship study for this Circle' }).getByRole('heading', { name: topic.title }).waitFor();
    assert.equal(nextFrom(await page.getByRole('link', { name: 'Sign in to your account', exact: true }).getAttribute('href')), '/quest/' + id + '?fellowship=' + topic.id);
    assert.equal(await page.locator('#circle-thread-fellowship').isEnabled(), false);
    await fits(page);
    if (topic.id === 'josephus') await picture(page, 'phone-quest-josephus');
    stories.push(topic.title + ': real compiled Fellowship links reach the synthetic public salon; study and sign-in return survive in detail, discussion and Quest without joining or posting.');
  }
  await open(page, '/circles?format=online&fellowship=psalm-22');
  await page.getByRole('heading', { name: 'Current results page' }).waitFor();
  await page.getByLabel('Reading, topic or circle name').fill('hope');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.waitForURL(url => url.searchParams.get('q') === 'hope');
  assert.equal(new URL(page.url()).searchParams.get('fellowship'), 'psalm-22');
  await page.goBack(); await page.waitForURL(url => !url.searchParams.has('q'));
  await page.getByRole('region', { name: 'Fellowship question for your Circle' }).waitFor();
  await page.goForward(); await page.waitForURL(url => url.searchParams.get('q') === 'hope');
  await page.getByRole('heading', { name: 'Current results page' }).waitFor();
  assert.equal(await page.getByLabel('Reading, topic or circle name').inputValue(), 'hope');
  stories.push('Search and browser Back/Forward preserve the selected Fellowship question while the public listing request contains only discovery filters.');
  for (const query of ['fellowship=unknown', 'fellowship=psalm-22&fellowship=isaiah-53', 'fellowship=psalm-22&reel=irrelevant', 'fellowship=psalm-22&study=philemon']) {
    const before = api.length;
    await open(page, '/circles?format=online&' + query);
    await page.getByText('This search link or its book, edition or reading selection could not be verified.', { exact: false }).waitFor();
    assert.equal(api.length, before);
    await open(page, '/circles/' + id + '/discussion?' + query);
    await page.getByText('This discussion link has invalid, duplicate or unsupported parameters.', { exact: false }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Load current discussion archive' }).count(), 0);
    assert.equal(await page.getByRole('region', { name: 'Question from Fellowship' }).count(), 0);
    assert.equal(api.length, before);
  }
  stories.push('Unknown, duplicate and mixed study contexts cannot silently select a question or load a discovery/discussion result.');
  await page.setViewportSize({ width: 320, height: 900 });
  for (const path of ['/fellowship', '/quest', '/quest/' + id + '?fellowship=isaiah-53', '/circles?format=online&fellowship=isaiah-53']) {
    await open(page, path); if (path.startsWith('/circles?')) await page.getByRole('heading', { name: 'Current results page' }).waitFor();
    await fits(page);
  }
  await open(page, '/quest');
  await page.getByRole('link', { name: topics[2].title + ' · find a Circle', exact: true }).click();
  await page.getByRole('heading', { name: 'Current results page' }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('fellowship'), 'josephus');
  stories.push('The new paths fit 390px and 320px browser widths; Quest home also reaches the same topic-aware discovery path.');
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []); assert.deepEqual(external, []);
  stories.push('No browser error, external request, private API request, membership mutation or message post occurred in the public journey.');
  await context.close();
} catch (error) { failure = String(error.stack ?? error); }
finally { if (browser) await browser.close(); }
const report = { status: failure ? 'FAIL' : 'PASS', stories, failure, errors, external, unexpected, api, screenshots,
  sourceHashes: ready.sourceHashes, buildId: ready.buildId, readyReceiptSha256: hash(readFileSync(readyFile)),
  testSha256: hash(readFileSync(new URL(import.meta.url))), cleanup: { browserClosed: Boolean(browser) },
  scope: 'Actual compiled Next pages and hydration, real local navigation and sign-in-return URLs. Public listing transport uses explicitly synthetic fixtures; no issued account, provider, hosted database or physical headset. Node and browser external requests denied.' };
writeFileSync(resolve(output, 'browser.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: report.status, stories: stories.length, failure, output }));
if (failure) process.exitCode = 1;
