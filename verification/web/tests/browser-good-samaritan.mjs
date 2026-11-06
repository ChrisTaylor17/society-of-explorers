import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { createPublicProfileApp, publicProfileAppHashes, ORIGIN } from './support/public-profile-app.mjs';
import { installQuestXrDouble } from '../../../platforms/tests/quest-xr-browser-double.mjs';

const root = resolve('../..'), file = name => resolve(root, name);
const [run, ...extra] = process.argv.slice(2);
assert(!extra.length && /^built-shell-root-kernel-luke-[a-z0-9-]+-$/.test(run ?? ''));
assert(process.execArgv.some(value => value.endsWith('/deny-build-network.cjs')));
const prefix = 'verification/web/evidence/' + run;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function read(name) {
  const path = file(name), info = lstatSync(path);
  assert(info.isFile() && info.blocks, name);
  return readFileSync(path);
}
const readyBytes = read(prefix + 'server-ready.json'), ready = JSON.parse(readyBytes);
assert.equal(ready.status, 'READY');
assert.match(ready.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
const sourcePath = 'content/root-kernel/luke-good-samaritan.web-classic.json';
const editionBytes = read(sourcePath), edition = JSON.parse(editionBytes);
assert.equal(sha(editionBytes), ready.sourceHashes[sourcePath]);
const bookId = 'luke-good-samaritan', editionId = 'web-classic-' + sha(JSON.stringify(edition));
const study = '/great-books/scripture/' + bookId;
const selection = { version: 1, bookId, editionId, sessions: [{ from: 0, to: 0 }] };
const start = '/circles/start?' + new URLSearchParams({ book: bookId, edition: editionId, from: '0', to: '0', format: 'online' });
const { chromium } = createRequire(process.env.SOE_PLAYWRIGHT_PACKAGE + '/package.json')('playwright');
const exec = promisify(execFile);
const guard = file('verification/web/scripts/built-shell-network-guard.cjs');
const result = { status: 'RUNNING', buildId: ready.buildId, readySha256: sha(readyBytes), sourceHashes: {},
  stories: [], refused: [], calls: [], errors: [], previews: {}, cleanup: {} };
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

async function open(origin, { signedIn = false, headset = false, javaScriptEnabled = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 320, height: 850 },
    serviceWorkers: 'block', hasTouch: true, javaScriptEnabled });
  if (headset) await context.addInitScript(installQuestXrDouble);
  if (signedIn) {
    const intent = randomUUID(), selected = 'v1.' + intent + '.wallet.' + app.authorId;
    const signed = await app.walletCookie('author') + '; soe_auth_intent=' + intent + '; soe_auth_selection_v1=' + selected;
    await context.addCookies(signed.split('; ').map(cookie => {
      const [name, ...parts] = cookie.split('=');
      return { name, value: parts.join('='), url: ORIGIN, secure: true, httpOnly: name !== 'soe_auth_intent' };
    }));
  }
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    try {
      if (url.origin !== origin) { result.refused.push(url.origin); await route.abort(); return; }
      if (!url.pathname.startsWith('/api/')) {
        if (origin === ready.origin) await route.continue();
        else await route.fulfill(await fetchShell(request, url));
        return;
      }
      const method = request.method();
      const knownPath = /^\/api\/(?:auth\/(?:member|provider)|circles(?:\/start|\/[a-f0-9-]{36}(?:\/discussion(?:\/preview)?)?)?|great-books\/text\/luke-good-samaritan)$/;
      assert(signedIn && knownPath.test(url.pathname), url.pathname);
      const headers = await request.allHeaders();
      if (url.pathname.startsWith('/api/great-books/')) {
        for (const key of ['cookie', 'authorization', 'apikey']) assert.equal(headers[key], undefined, key);
      }
      const response = await app.dispatch(url.pathname + url.search, { method, headers, body: request.postData() ?? undefined });
      result.calls.push({ method, path: url.pathname + url.search, status: response.status });
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
    } catch (error) {
      result.errors.push(String(error));
      await route.abort().catch(() => {});
    }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => result.errors.push(String(error)));
  return { page, context };
}

const link = (page, name) => page.getByRole('link', { name, exact: true });
const button = (page, name) => page.getByRole('button', { name, exact: true });
async function savePreview(page, name) {
  const path = prefix + name + '.png';
  result.previews[path] = sha(await page.screenshot({ path: file(path) }));
}
async function verses(page) {
  assert.deepEqual(await page.locator('[data-verse-text]').evaluateAll(nodes => nodes.map(node => ({
    verse: Number(node.dataset.verseText), text: node.textContent,
  }))), edition.paragraphs.flat());
}

try {
  result.sourceHashes = { ...await publicProfileAppHashes(), [sourcePath]: sha(editionBytes) };
  for (const name of ['verification/web/tests/browser-good-samaritan.mjs',
    'platforms/tests/quest-xr-browser-double.mjs', 'platforms/quest/room-reading.mjs', 'platforms/quest/circle-host.mjs']) {
    result.sourceHashes[name] = sha(read(name));
  }
  browser = await chromium.launch({ executablePath: process.env.SOE_BROWSER_EXECUTABLE, headless: true, timeout: 12000,
    env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' },
    args: ['--disable-background-networking', '--disable-component-update', '--no-first-run',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

  const guest = await open(ready.origin, { javaScriptEnabled: false });
  assert.equal((await guest.page.goto(ready.origin + '/great-books')).status(), 200);
  await link(guest.page, 'Read and discuss the Good Samaritan').click();
  await guest.page.waitForURL(ready.origin + study);
  await guest.page.getByRole('heading', { name: edition.title, level: 1 }).waitFor();
  await verses(guest.page);
  const references = guest.page.getByRole('region', { name: 'Publisher cross-references' });
  for (const note of edition.footnotes) assert.equal(await link(references, note.text).getAttribute('href'), note.href);
  assert.equal(await link(guest.page, 'Read the publisher’s edition').getAttribute('href'), edition.publisherUrl);
  assert.equal(await link(guest.page, 'Publisher reuse terms').getAttribute('href'), edition.rightsUrl);
  const guide = guest.page.getByRole('region', { name: 'A 45-minute salon' });
  const agenda = await guide.locator('ol').first().getByRole('listitem').allTextContents();
  assert.equal(agenda.reduce((sum, text) => sum + Number(text.match(/^(\d+) min/)?.[1]), 0), 45);
  assert.equal(await link(guide, 'Host a Good Samaritan salon').getAttribute('href'), start);
  assert(await guest.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && innerWidth === 320));
  await link(guest.page, 'Read the passage').click();
  await savePreview(guest.page, 'reading-320');
  await link(guest.page, 'Host guide').click();
  await savePreview(guest.page, 'host-guide-320');
  await guest.context.close();
  result.stories.push('A signed-out 320px reader follows the library link, sees all verses and both publisher references with JavaScript off, and opens the exact hosting invitation.');

  app = await createPublicProfileApp({ lukeEdition: true, memberBlocks: true });
  const web = await open(ORIGIN, { signedIn: true });
  const { page } = web;
  assert.equal((await page.goto(ORIGIN + study)).status(), 200);
  await link(page, 'Host a Good Samaritan salon').click();
  await page.waitForURL(ORIGIN + start);
  await button(page, 'Check hosting access').click();
  const online = page.getByRole('radio', { name: 'Online', exact: true });
  await online.waitFor();
  assert(await online.isChecked());
  assert.equal(await page.getByLabel('Book and pinned source edition').inputValue(), bookId);
  await button(page, 'Load and verify selected edition').click();
  const first = page.getByLabel('Week 1 begins at reading position');
  await first.waitFor();
  assert.equal(await first.inputValue(), '1');
  assert.equal(await page.getByLabel('Week 1 ends at reading position').inputValue(), '1');
  const schedule = await app.createBody();
  const title = 'Good Samaritan test salon';
  await page.getByLabel('Circle name').fill(title);
  await page.getByLabel('Private video link (https)', { exact: true }).fill('https://meeting.fixture.test/good-samaritan');
  await page.locator('#circle-weekday').selectOption(String(schedule.weekday));
  await page.locator('#circle-time').fill(schedule.time);
  await page.locator('#circle-timezone').selectOption(schedule.timezone);
  await page.getByLabel('First week starts').fill(schedule.startDate);
  await page.getByRole('checkbox', { name: /I will use a public venue/ }).check();
  await button(page, 'Review my Circle listing').click();
  const review = page.getByRole('region', { name: 'Review your Circle listing' });
  const confirm = button(review, 'Confirm and list my Circle');
  await confirm.waitFor();
  assert(await confirm.isDisabled());
  await review.getByRole('checkbox').check();
  await confirm.click();
  const created = link(page, 'Open my Circle');
  await created.waitFor();
  const circle = (await app.hosted()).find(row => row.title === title);
  assert.deepEqual(circle.circle_reading_program, selection);
  assert.equal(await created.getAttribute('href'), '/circles/' + circle.id);
  await created.click();
  await button(page, 'Load current Circle access').click();
  const reading = link(page, 'Week 1: Complete source edition');
  await reading.waitFor();
  assert.equal(await reading.getAttribute('href'), study + '?circle=' + circle.id + '#scripture');
  await reading.click();
  await page.waitForURL(ORIGIN + study + '?circle=' + circle.id + '#scripture');
  await page.locator('[data-verse-text]').first().waitFor();
  await verses(page);
  await link(page, 'Return to Circle details').click();
  await page.waitForURL(ORIGIN + '/circles/' + circle.id);
  await web.context.close();
  assert(result.calls.some(row => row.path === '/api/great-books/text/' + bookId && row.status === 200));
  result.stories.push('The compiled host form checks the signed account, verifies the edition anonymously, requires an explicit confirmation, and reopens the persisted selection and original Circle.');

  const headset = await open(ORIGIN, { signedIn: true, headset: true });
  const quest = headset.page;
  assert.equal((await quest.goto(ORIGIN + '/quest/' + circle.id)).status(), 200);
  await quest.evaluate(() => window.questXrQa.enable());
  await button(quest, 'Connect signed-in account').click();
  const panel = text => quest.waitForFunction(value => window.questXrQa.panel().replace(/\s+/g, ' ').includes(value), text);
  const press = async label => {
    await quest.waitForFunction(value => window.questXrQa.labels().includes(value), label);
    await quest.evaluate(value => window.questXrQa.press(value), label);
  };
  const trigger = () => quest.evaluate(() => window.questXrQa.select());
  await quest.locator('#quest-immersive-enter').click();
  await panel('check your signed-in account');
  await trigger();
  await panel('check Circle access and load recent discussion');
  await trigger();
  const before = result.calls.length;
  await press('Read selection');
  await panel('Luke 10:25–37 · Page 1');
  const frame = () => quest.evaluate(() => window.questXrQa.panel());
  const beginning = await frame();
  const image = await quest.evaluate(() => window.questXrQa.image());
  assert(image.startsWith('data:image/png;base64,'));
  const screenshot = prefix + 'headset-reading.png';
  const png = Buffer.from(image.split(',')[1], 'base64');
  writeFileSync(file(screenshot), png);
  result.previews[screenshot] = sha(png);
  const count = Number(/Page 1 of (\d+)/.exec(beginning)?.[1]);
  assert(count > 1);
  const frames = [beginning];
  for (let i = 2; i <= count; i++) {
    await press('Next page');
    await panel('Luke 10:25–37 · Page ' + i + ' of ' + count);
    frames.push(await frame());
  }
  const all = frames.join(' ').replace(/\s+/g, ' ');
  assert.match(all, /Go and do likewise/);
  assert.match(all, /Publisher cross-references/);
  assert.match(all, /Deuteronomy 6:5/);
  await press('Source info');
  await panel('Source edition and rights');
  const readingCalls = result.calls.slice(before);
  assert.deepEqual(readingCalls.filter(call => call.path.startsWith('/api/great-books/')), []);
  assert(readingCalls.some(call => call.path === '/api/circles/' + circle.id && call.status === 200));
  await press('Back to discussion');
  await quest.waitForFunction(() => window.questXrQa.labels().includes('Read selection'));
  await headset.context.close();
  result.stories.push('A simulated headset verifies current access, reads the same bundled selection through its final verse, shows publisher credits, and returns to discussion.');
  for (const [name, hash] of Object.entries(result.sourceHashes)) assert.equal(sha(read(name)), hash, name);
  assert.deepEqual(result.refused, []);
  assert.deepEqual(result.errors, []);
  result.status = 'PASS';
} catch (error) {
  result.status = 'FAIL';
  result.failure = error.stack;
  console.error(result.failure);
  process.exitCode = 1;
} finally {
  try { if (browser) { await browser.close(); result.cleanup.browser = true; } }
  finally { if (app) { await app.close(); result.cleanup.database = true; } }
  writeFileSync(file(prefix + 'good-samaritan-stories.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  for (const story of result.stories) console.log('PASS: ' + story);
}
