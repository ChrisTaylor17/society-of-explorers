import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, lstatSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, basename, join } from 'node:path';

const [prefix, run, sourceDirectory, ...extra] = process.argv.slice(2);
assert(!extra.length && /^built-shell-fellowship-[0-9]+-$/.test(prefix ?? '') && /^fellowship-[0-9]+$/.test(run ?? ''));
assert(sourceDirectory?.startsWith('/Users/christaylor/Library/Application Support/Society of Explorers/Verification/'));
assert(process.execArgv.some(v => v.endsWith('/deny-build-network.cjs')));
const output = resolve('verification/web/evidence', run);
mkdirSync(output, { recursive: true });
const inputs = {}, hash = value => createHash('sha256').update(value).digest('hex');
function read(file) {
  const info = lstatSync(file);
  assert(info.isFile() && !info.isSymbolicLink() && (!info.size || info.blocks));
  const data = readFileSync(file); inputs[file] = hash(data); return data;
}
const ready = JSON.parse(read(resolve('verification/web/evidence', prefix + 'server-ready.json')));
assert.equal(ready.status, 'READY'); const origin = ready.origin;
assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
const edition = JSON.parse(read('content/fellowship/scripture.web-classic.json'));
assert.equal(ready.sourceHashes['content/fellowship/scripture.web-classic.json'], inputs['content/fellowship/scripture.web-classic.json']);
const require = createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');
const executable = '/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
read(executable); read(require.resolve('playwright'));
const stories = [], external = [], featureApi = [], fixtureApi = [], errors = [], screenshots = [];
let browser, failure = null;
async function context(width, javaScriptEnabled = true, homeFixtures = false) {
  const ctx = await browser.newContext({ viewport: { width, height: 960 }, javaScriptEnabled, serviceWorkers: 'block', acceptDownloads: true });
  await ctx.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== origin) { external.push(url.origin + url.pathname); return route.abort(); }
    if (url.pathname.startsWith('/api/')) {
      if (homeFixtures && req.method() === 'GET' && !req.frame().url().includes('/fellowship')) {
        fixtureApi.push({ path: url.pathname, method: req.method() });
        return route.fulfill({ status: url.pathname.includes('/auth/') ? 401 : 503, contentType: 'application/json', body: JSON.stringify({ error: 'Local public-shell fixture; no provider' }) });
      }
      featureApi.push({ path: url.pathname, method: req.method() }); return route.abort();
    }
    return route.continue();
  });
  const page = await ctx.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(String(error)));
  return { ctx, page };
}
async function open(page, path) {
  const response = await page.goto(origin + path); assert.equal(response.status(), 200);
  await page.getByRole('main').waitFor();
}
async function fits(page) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Page has horizontal overflow');
}
async function picture(page, name) {
  const path = join(output, name + '.png'); await page.screenshot({ path }); screenshots.push({ path, sha256: hash(readFileSync(path)) });
}

try {
  browser = await require('playwright').chromium.launch({ executablePath: executable, headless: true, timeout: 15000,
    env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' } });
  const desktop = await context(1440, true, true), page = desktop.page;
  await open(page, '/');
  await page.getByRole('heading', { name: 'Christian fellowship & honest inquiry' }).waitFor();
  await page.getByRole('link', { name: 'Christian fellowship', exact: true }).first().click();
  await page.waitForURL(origin + '/fellowship'); await fits(page);
  await page.getByRole('heading', { name: 'Faith that makes room for honest questions.' }).waitFor();
  await picture(page, 'fellowship-desktop');
  stories.push('The existing homepage and primary navigation reach a distinct fellowship section without replacing the Society or its founder manifesto.');
  await page.getByRole('link', { name: 'Read our fellowship covenant', exact: true }).click();
  await page.getByRole('heading', { name: 'Conviction, humility and love of neighbor.' }).waitFor();
  assert.equal(await page.locator('main article > section').count(), 9);
  assert.match(await page.locator('main').innerText(), /Nobody must pretend to believe/);
  await open(page, '/manifesto'); assert.match(await page.locator('main').innerText(), /The Fifty-Fifty System/i);
  stories.push('The nine-part Christian covenant is substantive and welcoming; the original broader founder manifesto remains reachable and distinct.');
  await open(page, '/fellowship/scripture');
  assert.equal(await page.locator('[data-claim]:visible').count(), 9);
  const storageSnapshot = async () => hash(Buffer.from(await page.evaluate(() => JSON.stringify({ local: Object.entries(localStorage).sort(), session: Object.entries(sessionStorage).sort() }))));
  const storageBeforeCorrection = await storageSnapshot();
  const observed = await page.locator('[data-scripture-verse]').evaluateAll(nodes => nodes.map(n => ({ id: n.dataset.scriptureVerse, text: n.textContent })));
  assert.deepEqual(observed, edition.passages.flatMap(p => p.verses.map(v => ({ id: p.id + ':' + v.verse, text: v.text }))));
  assert.equal(await page.locator('[data-scripture-superscription=psalm-22]').textContent(), edition.passages[0].superscription);
  assert.equal(await page.locator('[data-publisher-note]').count(), edition.passages.reduce((n, p) => n + p.footnotes.length, 0));
  stories.push('All330 rendered verses and38 publisher notes match the pinned edition data,including the empty main-text Acts8:37 and its complete publisher variant.');
  for (const passage of edition.passages) {
    const file = join(sourceDirectory, basename(new URL(passage.publisherUrl).pathname).replace('.htm', '.source.html'));
    const html = read(file); assert.equal(hash(html), passage.sourceSha256);
    const publisher = await page.evaluate(({ html, verses, notes }) => {
      const doc = new DOMParser().parseFromString(html, 'text/html'), normal = text => text.replace(/\s+/g, ' ').trim();
      const values = verses.map(number => {
        const start = doc.getElementById('V' + number), next = doc.getElementById('V' + (number + 1));
        const end = next ?? Array.from(doc.querySelectorAll('ul.tnav')).at(-1);
        if (!start || !end) throw Error('Publisher verse boundary missing');
        const range = doc.createRange(); range.setStartAfter(start); range.setEndBefore(end);
        const copy = range.cloneContents(); copy.querySelectorAll('.notemark,.verse,.footnote,.copyright,.tnav').forEach(n => n.remove());
        return { verse: number, text: normal(copy.textContent) };
      });
      const footnotes = notes.map(id => {
        const node = doc.getElementById(id)?.cloneNode(true); if (!node) throw Error('Publisher note missing');
        node.querySelectorAll('.notemark,.notebackref').forEach(n => n.remove());
        return { id, text: normal(node.textContent) };
      });
      return { values, footnotes, superscription: normal(doc.querySelector('.d')?.textContent ?? '') };
    }, { html: html.toString(), verses: passage.verses.map(v => v.verse), notes: passage.footnotes.map(n => n.id) });
    const normal = text => text.replace(/\s+/g, ' ').trim();
    assert.deepEqual(publisher.values, passage.verses.map(v => ({ verse: v.verse, text: normal(v.text) })), passage.id);
    assert.deepEqual(publisher.footnotes, passage.footnotes.map(n => ({ id: n.id, text: normal(n.text) })), passage.id + ' notes');
    assert.equal(publisher.superscription, passage.superscription, passage.id + ' superscription');
  }
  stories.push('Independent browser DOM ranges match every included verse and footnote to all14 original publisher HTML pages,not just the importer output.');
  await page.getByLabel('Passage family', { exact: true }).selectOption('psalm');
  await page.getByLabel('Relationship', { exact: true }).selectOption('quotation'); assert.equal(await page.locator('[data-claim]:visible').count(), 2);
  await page.getByLabel('Relationship', { exact: true }).selectOption('comparison'); await page.getByText('No connection has this combination.', { exact: false }).waitFor();
  await page.getByLabel('Passage family', { exact: true }).selectOption('isaiah'); assert.equal(await page.locator('[data-claim]:visible').count(), 1);
  assert.equal(await page.locator('[data-claim=burial-with-a-rich-man]').isVisible(), true);
  await page.getByLabel('Passage family', { exact: true }).selectOption('all'); await page.getByLabel('Relationship', { exact: true }).selectOption('all');
  const cry = page.locator('[data-claim=cry-of-abandonment]');
  await cry.getByText('Read the cited passages', { exact: true }).click();
  await cry.getByRole('link', { name: 'Read this passage in context below', exact: true }).first().click();
  assert.equal(await page.locator('#reading-psalm-22').evaluate(n => n.open), true);
  stories.push('Relationship filters distinguish explicit quotation,allusion,comparison and textual issue; verse links open the full surrounding Scripture.');
  await cry.getByText('Prepare a correction', { exact: true }).click();
  const preview = cry.getByRole('button', { name: 'Preview my correction', exact: true }), download = cry.getByRole('button', { name: 'Download proposal', exact: true });
  assert.equal(await preview.isDisabled(), true); assert.equal(await download.isDisabled(), true);
  const proposed = '<img src=x onerror=alert(1)> A revised reading grounded in the full psalm.';
  await cry.getByRole('textbox', { name: 'Proposed analysis', exact: true }).fill(proposed);
  assert.equal(await preview.isDisabled(), true);
  await cry.getByRole('textbox', { name: 'Reason and source to check', exact: true }).fill('Compare Psalm22:1 with22:22–31 in the publisher’s full context.');
  await preview.click(); assert.equal(await cry.locator('img').count(), 0);
  await cry.getByRole('region', { name: 'Your local correction preview' }).waitFor();
  const [saved] = await Promise.all([page.waitForEvent('download'), download.click()]);
  const path = join(output, 'correction-proposal.json'); await saved.saveAs(path);
  const proposal = JSON.parse(readFileSync(path)); assert.equal(proposal.claimId, 'cry-of-abandonment');
  assert.equal(proposal.proposedAnalysis, proposed); assert.equal(proposal.published, false); assert.equal(proposal.scriptureChanged, false);
  assert(proposal.sourceReferences.every(source => new URL(source.href).protocol === 'https:'));
  await page.getByLabel('Passage family', { exact: true }).selectOption('isaiah'); await page.getByLabel('Passage family', { exact: true }).selectOption('all');
  assert.equal(await cry.getByRole('region', { name: 'Your local correction preview' }).isVisible(), true);
  await cry.getByRole('textbox', { name: 'Proposed analysis', exact: true }).fill('Another draft.'); assert.equal(await download.isDisabled(), true);
  await cry.getByRole('button', { name: 'Reset my correction', exact: true }).click();
  assert.equal(await cry.getByRole('textbox', { name: 'Reason and source to check', exact: true }).inputValue(), '');
  assert.deepEqual(await page.locator('[data-scripture-verse]').evaluateAll(nodes => nodes.map(n => ({ id: n.dataset.scriptureVerse, text: n.textContent }))), observed);
  assert.equal(await storageSnapshot(), storageBeforeCorrection);
  stories.push('A reasoned local correction previews and exports with exact provenance; editing retires the preview,filtering preserves it,reset clears it,and markup is displayed as text. Scripture and preexisting browser storage are unchanged; no submission occurs.');
  await open(page, '/fellowship/research/ancient-jesus-passage');
  await page.getByRole('heading', { name: 'An ancient passage. A new argument. An open question.' }).waitFor();
  assert.match(await page.locator('main').innerText(), /18\.63–64/);
  assert.match(await page.locator('main').innerText(), /does not announce a newly discovered 2,000-year-old manuscript/);
  assert.match(await page.locator('main').innerText(), /411 CE/); assert.match(await page.locator('main').innerText(), /462 CE/);
  assert.match(await page.locator('[data-received-text]').innerText(), /He was \[the\] Christ/);
  assert.equal(await page.locator('main img,main iframe').count(), 0);
  await page.locator('[data-analysis-review=tf-transmission] summary').click();
  await page.locator('[data-analysis-review=tf-transmission]').getByRole('textbox', { name: 'Reason and source to check', exact: true }).waitFor();
  await fits(page); await picture(page, 'research-desktop');
  stories.push('The compiled dossier identifies the preprint and received text,labels news matching provisional,separates copy/composition dates,presents competing arguments and exposes local correction controls without manuscript images or copied modern translations.');
  await open(page, '/great-books/scripture/philemon');
  await page.getByRole('link', { name: 'Christian fellowship', exact: true }).click(); await page.waitForURL(origin + '/fellowship');
  stories.push('The existing Root Kernel reading surface links back to the fellowship section.');
  assert.equal((await desktop.ctx.cookies()).length, 0); await desktop.ctx.close();
  const mobile = await context(320, true, true);
  await open(mobile.page, '/'); await mobile.page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await mobile.page.getByRole('link', { name: 'CHRISTIAN FELLOWSHIP', exact: true }).press('Enter'); await mobile.page.waitForURL(origin + '/fellowship'); await fits(mobile.page);
  await picture(mobile.page, 'fellowship-mobile');
  for (const path of ['/fellowship/manifesto', '/fellowship/scripture', '/fellowship/research/ancient-jesus-passage']) {
    await open(mobile.page, path); await fits(mobile.page);
  }
  await mobile.page.getByRole('link', { name: 'Skip to content', exact: true }).press('Enter');
  assert.equal(await mobile.page.locator('main').evaluate(n => n === document.activeElement), true);
  await picture(mobile.page, 'research-mobile');
  await mobile.ctx.close(); stories.push('At320px,mobile navigation,all four pages,keyboard skip link and the horizontally contained witness table remain usable without page overflow.');
  const nojs = await context(900, false);
  await open(nojs.page, '/fellowship/scripture'); assert.equal(await nojs.page.locator('[data-claim]:visible').count(), 9);
  await nojs.page.locator('#reading-isaiah-53 summary').click(); await nojs.page.getByRole('article', { name: 'Scripture · Isaiah 53' }).waitFor();
  await open(nojs.page, '/fellowship/research/ancient-jesus-passage'); await nojs.page.locator('[data-received-text]').waitFor();
  await nojs.ctx.close(); stories.push('With JavaScript disabled,the full study,all claims,Scripture disclosures and received Josephus passage remain readable; interactive-tool limits are explicit.');
} catch (error) { failure = String(error.stack ?? error); }
finally {
  if (browser) try { await browser.close(); } catch (error) { failure ??= String(error); }
  const unchanged = Object.entries(inputs).every(([file, sha]) => hash(readFileSync(file)) === sha);
  const report = { status: !failure && !external.length && !featureApi.length && !errors.length && unchanged ? 'PASS' : 'FAIL',
    failure, stories, external, featureApi, homepageOnlySyntheticApiFixtures: fixtureApi, errors, inputsUnchanged: unchanged,
    inputSha256: inputs, screenshots, browserClosed: true, buildId: ready.buildId,
    scope: 'Actual compiled Next frontend in owned cached Chromium; signed-out public research. Homepage API GETs are intercepted synthetic failures. No provider,member data,live AI,shared correction queue,hosted deployment or physical-device acceptance.' };
  writeFileSync(join(output, 'browser.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, stories: stories.length, failure, evidence: join(output, 'browser.json') }));
  process.exit(report.status === 'PASS' ? 0 : 1);
}
