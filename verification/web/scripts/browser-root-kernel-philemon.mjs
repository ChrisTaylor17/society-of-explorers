import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const [prefix, run, ...extra] = process.argv.slice(2);
assert(!extra.length && /^built-shell-[a-z0-9-]+-$/.test(prefix ?? ''));
assert(/^root-kernel-philemon-[0-9]+$/.test(run ?? ''));
assert(process.execArgv.some(arg => arg.endsWith('/deny-build-network.cjs')));
const evidence = resolve('verification/web/evidence');
const readyPath = join(evidence, prefix + 'server-ready.json');
const output = join(evidence, run, 'browser.json');
const editionPath = 'content/root-kernel/philemon.web-classic.json';
const routePath = '/great-books/scripture/philemon';
const inputs = new Map();
function resident(file) {
  const stat = lstatSync(file);
  assert(stat.isFile() && stat.size && stat.blocks, 'Unavailable exact input ' + file);
  return file;
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function read(file) {
  const data = readFileSync(resident(file));
  inputs.set(file, hash(data));
  return data;
}
const ready = JSON.parse(read(readyPath));
assert.equal(ready.status, 'READY');
assert.match(ready.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
const origin = ready.origin;
const edition = JSON.parse(read(editionPath));
assert.equal(ready.sourceHashes[editionPath], inputs.get(editionPath));
const stories = [], external = [], privateCalls = [], errors = [], screenshots = [];
const require = createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');
const executable = resident('/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
resident(require.resolve('playwright'));
let browser, closed = false, failure = null;

async function pageFor(width, javaScriptEnabled = true) {
  const ctx = await browser.newContext({ viewport: { width, height: 850 }, javaScriptEnabled,
    serviceWorkers: 'block', acceptDownloads: false, isMobile: width === 320, hasTouch: width === 320 });
  await ctx.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      external.push(url.origin + url.pathname);
      await route.abort();
    } else if (/^\/api\//.test(url.pathname)) {
      privateCalls.push(url.pathname);
      await route.abort();
    } else {
      await route.continue();
    }
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', e => errors.push(String(e)));
  return { ctx, page };
}

async function scripture(page) {
  const reader = page.getByRole('article', { name: 'Scripture · Philemon 1' });
  await reader.waitFor();
  assert.deepEqual(await reader.locator('[data-verse-text]').evaluateAll(elements =>
    elements.map(el => ({ verse: Number(el.dataset.verseText), text: el.textContent }))), edition.paragraphs.flat());
  assert.deepEqual(await reader.locator('[data-publisher-footnote]').evaluateAll(elements =>
    elements.map(el => ({ verse: Number(el.dataset.publisherFootnote), text: el.textContent }))), edition.footnotes);
  return reader;
}

async function anchor(page, name, id) {
  await page.getByRole('link', { name, exact: true }).press('Enter');
  await page.waitForURL(url => url.hash === '#' + id);
  await page.waitForFunction(id => {
    const target = document.getElementById(id);
    if (!target || target !== document.activeElement) return false;
    const rect = target.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < innerHeight;
  }, id);
}

async function screenshot(page, name) {
  const file = join(evidence, run, name + '.png');
  await page.screenshot({ path: file });
  screenshots.push({ path: file, sha256: hash(readFileSync(file)) });
}

try {
  browser = await require('playwright').chromium.launch({ executablePath: executable, headless: true, timeout: 12000,
    env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' },
    args: ['--disable-background-networking', '--disable-component-update', '--no-first-run',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
  const desktop = await pageFor(1360);
  const page = desktop.page;
  assert.equal((await page.goto(origin + '/great-books')).status(), 200);
  assert.equal(await page.getByRole('heading', { name: 'Root Kernel Scripture study', exact: true }).count(), 1);
  await page.getByRole('link', { name: 'Read and discuss Philemon', exact: true }).press('Enter');
  await page.waitForURL(origin + routePath);
  await page.getByRole('heading', { name: edition.title, level: 1, exact: true }).waitFor();
  assert.match(await page.title(), /Philemon · Root Kernel Scripture Study/);
  stories.push('A signed-out library reader opens the study with the keyboard.');
  const reader = await scripture(page);
  stories.push('All 25 verses and both original publisher footnotes match the checked edition.');
  const notes = page.getByRole('complementary', { name: 'Two readings of the greeting' });
  assert.equal(await reader.getByRole('heading', { name: 'Nicene Christian reading' }).count(), 0);
  assert.equal(await notes.getByRole('heading', { name: 'Nicene Christian reading', exact: true }).count(), 1);
  assert.equal(await notes.getByRole('heading', { name: 'Biblical Unitarian reading', exact: true }).count(), 1);
  assert.match(await notes.getByRole('link', { name: 'Catholic Catechism, paragraphs 253–255' }).getAttribute('href'), /^https:\/\/www\.vatican\.va\//);
  assert.match(await notes.getByRole('link', { name: 'Biblical Unitarian statement of beliefs' }).getAttribute('href'), /^https:\/\/www\.biblicalunitarian\.com\//);
  assert.equal(await page.getByRole('link', { name: 'Read the publisher’s edition' }).getAttribute('href'), edition.publisherUrl);
  assert.equal(await page.getByRole('link', { name: 'Publisher reuse terms' }).getAttribute('href'), edition.rightsUrl);
  assert.equal(await page.getByRole('link', { name: 'Find an online reading Circle', exact: true }).getAttribute('href'), '/circles?format=online');
  stories.push('Study perspectives are outside Scripture and link to their own sources; the page links to the publisher and Circles.');
  await screenshot(page, 'desktop');
  await anchor(page, 'Go to verse 3', 'verse-3');
  await anchor(page, 'Publisher footnote for verse 10', 'publisher-note-2');
  await desktop.ctx.close();
  stories.push('Keyboard navigation jumps to the exact verse and publisher footnote.');

  const mobile = await pageFor(320);
  assert.equal((await mobile.page.goto(origin + routePath)).status(), 200);
  const body = await mobile.page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
    scriptureBottom: document.querySelector('article[aria-labelledby="scripture"]').getBoundingClientRect().bottom,
    studyTop: document.getElementById('study-notes').getBoundingClientRect().top }));
  assert.equal(body.width, 320);
  assert(body.scroll <= body.width && body.studyTop > body.scriptureBottom);
  await screenshot(mobile.page, 'mobile');
  const back = mobile.page.getByRole('link', { name: 'Return to Circle details', exact: true });
  assert.equal(await back.count(), 0);
  const circleId = 'a1111111-1111-4111-8111-111111111111';
  assert.equal((await mobile.page.goto(`${origin}${routePath}?circle=${circleId.toUpperCase()}#scripture`)).status(), 200);
  await back.waitFor();
  assert.equal(await back.getAttribute('href'), `/circles/${circleId}`);
  assert((await back.boundingBox()).height >= 44);
  await screenshot(mobile.page, 'circle-return-mobile');
  for (const query of [`circle=${circleId}&circle=${circleId}`, 'circle=https%3A%2F%2Ffixture.invalid']) {
    assert.equal((await mobile.page.goto(`${origin}${routePath}?${query}#scripture`, { waitUntil: 'networkidle' })).status(), 200);
    assert.equal(await back.count(), 0);
    await scripture(mobile.page);
  }
  await mobile.ctx.close();
  stories.push('At 320 pixels the full reading and notes fit in reading order without side scrolling.');
  stories.push('A single valid Circle gives the exact internal return link. Repeated or external-looking parameters leave the public study available.');

  const scriptless = await pageFor(420, false);
  assert.equal((await scriptless.page.goto(origin + routePath)).status(), 200);
  await scripture(scriptless.page);
  await scriptless.ctx.close();
  stories.push('The complete text and publisher footnotes render with JavaScript disabled.');

  const host = await pageFor(320);
  await host.page.goto(origin + routePath);
  await host.page.getByRole('link', { name: 'Host a Philemon salon', exact: true }).press('Enter');
  await host.page.waitForURL(origin + '/circles/host#philemon-salon');
  const guide = host.page.getByRole('region', { name: 'Host a Philemon salon online' });
  await guide.waitFor();
  assert.equal(await guide.getByRole('listitem').count(), 5);
  assert.match(await guide.innerText(), /Share the Root Kernel Philemon study\.\s+Ask everyone/);
  assert.equal(await guide.getByRole('link', { name: 'Root Kernel Philemon study', exact: true }).getAttribute('href'), routePath);
  await screenshot(host.page, 'host-guide');
  await guide.getByRole('link', { name: 'Start a weekly online Circle', exact: true }).press('Enter');
  const editionId = 'web-classic-' + hash(Buffer.from(JSON.stringify(edition)));
  const start = '/circles/start?' + new URLSearchParams({ book: 'philemon', edition: editionId, from: '0', to: '0', format: 'online' });
  await host.page.waitForURL(origin + start);
  const signIn = host.page.locator('#main').getByRole('link', { name: 'Sign in', exact: true });
  assert.equal(new URL(await signIn.getAttribute('href'), origin).searchParams.get('next'), start);
  assert.match(await host.page.locator('#main').innerText(), /Philemon study is selected for your first meeting/);
  assert.equal(await host.page.getByLabel('Private video link (https)', { exact: true }).count(), 0);
  await host.page.goto(origin + '/circles/start?format=online&format=in_person');
  assert.equal(new URL(await signIn.getAttribute('href'), origin).searchParams.get('next'), '/circles/start');
  await host.ctx.close();
  stories.push('The public study leads to the Philemon host guide and retains the online format and pinned letter in the sign-in return. An ambiguous format is ignored.');
  assert.deepEqual(external, []);
  assert.deepEqual(privateCalls, []);
  assert.deepEqual(errors, []);
} catch (error) {
  failure = error.stack || String(error);
} finally {
  if (browser) {
    try { await browser.close(); closed = true; }
    catch (error) { failure ??= String(error); }
  }
  for (const [file, pin] of inputs) assert.equal(hash(readFileSync(file)), pin, 'Changed input ' + file);
  writeFileSync(output, JSON.stringify({ status: failure ? 'FAIL' : 'PASS', stories, external, privateCalls, errors, closed,
    origin, builtId: ready.buildId, screenshots, inputHashes: Object.fromEntries(inputs), failure }, null, 2) + '\n', { flag: 'wx' });
}
if (failure) throw Error(failure);
console.log(JSON.stringify({ status: 'PASS', stories: stories.length, receipt: output }));
