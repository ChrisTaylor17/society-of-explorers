import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { directMessageApp, ids, origin, people } from './support/direct-message-app.mjs';

assert.ok(process.execArgv.some(value => value.endsWith('/deny-build-network.cjs')));
const { chromium } = createRequire(process.env.SOE_PLAYWRIGHT_PACKAGE + '/package.json')('playwright');
const run = process.argv[2] ?? '01';
assert.match(run, /^[a-z0-9-]{1,24}$/);
const fixture = 'evidence/direct-message-fixture-' + run;
const [bundle, manifest] = await Promise.all([readFile(fixture + '/page.js'), readFile(fixture + '/source-hashes.json')]);
const sha = value => createHash('sha256').update(value).digest('hex');
const sourceHashes = JSON.parse(manifest);
for (const [path, digest] of Object.entries(sourceHashes)) assert.equal(sha(await readFile('../../' + path)), digest, path);
const app = await directMessageApp();
const stories = [], requests = [], errors = [], unexpected = [];
const closes = { browser: false, database: false };
let browser, failure, holdBob;
const latch = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};
async function bounded(promise, label, timeout = 8_000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(Error('Timed out waiting for ' + label)), timeout);
  })]); } finally { clearTimeout(timer); }
}
try {
  browser = await chromium.launch({ executablePath: process.env.SOE_BROWSER_EXECUTABLE, headless: true,
    args: ['--disable-background-networking', '--disable-component-update', '--no-first-run', '--host-resolver-rules=MAP * ~NOTFOUND'] });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const cookies = app.cookies[ids.alice].split('; ').map(cookie => {
    const [name, value] = cookie.split('=');
    return { name, value, url: origin, secure: true, httpOnly: true, sameSite: 'Lax' };
  });
  await context.addCookies(cookies);
  await context.addInitScript(actor => { window.dmActor = actor; }, people[0]);
  const page = await context.newPage();
  page.setDefaultTimeout(8_000);
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', async route => {
    try {
      const req = route.request(), url = new URL(req.url()), method = req.method();
      if (url.origin === origin && url.pathname === '/members') return await route.fulfill({ contentType: 'text/html',
        body: '<!doctype html><title>Synthetic members</title><div id="root"></div><script type="module" src="/page.js"></script>' });
      if (url.origin === origin && url.pathname === '/page.js') return await route.fulfill({ contentType: 'text/javascript', body: bundle });
      if (url.origin === origin && url.pathname === '/api/members/discover') return await route.fulfill({ json: { members: people } });
      if (url.origin !== origin || url.pathname !== '/api/message') {
        unexpected.push({ origin: url.origin, path: url.pathname });
        return await route.abort();
      }
      const headers = await req.allHeaders(), peer = url.searchParams.get('peerId');
      assert.equal(headers['x-soe-expected-member'], ids.alice);
      assert.match(headers.cookie ?? '', /soe_auth_selection_v1/);
      const response = await app.dispatch(app.request(method, { peer, headers, body: req.postData() ?? undefined }));
      assert.match(response.headers.get('cache-control'), /private.*no-store/);
      requests.push({ method, peer, status: response.status });
      const gate = method === 'GET' && peer === ids.bob ? holdBob : null;
      if (gate) {
        holdBob = null;
        gate.reached.resolve();
        await gate.release.promise;
      }
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
      gate?.delivered.resolve();
    } catch (error) {
      errors.push(String(error));
      await route.abort().catch(() => {});
    }
  });

  await page.goto(origin + '/members', { timeout: 8_000 });
  console.log('Loaded the composed Members page.');
  const openBob = page.getByRole('button', { name: 'SEND MESSAGE', exact: true }).first();
  await openBob.click();
  await page.getByText('Private Bob thread', { exact: true }).waitFor();
  assert.deepEqual(await app.flags(), [[ids.incoming, true], [ids.outgoing, false], [ids.other, false]]);
  assert.ok(requests.some(request => request.method === 'PATCH' && request.status === 200));
  stories.push('The signed browser loads a conversation and marks only the exact incoming messages from that peer read.');
  console.log('Confirmed the first private thread and its read update.');

  const question = 'What would count as good evidence for each of our views?';
  const draft = page.getByPlaceholder('Message Bob Fixture...');
  const sentCount = () => requests.filter(request => request.method === 'POST').length;
  await page.getByRole('button', { name: /CHOOSE A THINKER QUESTION/ }).click();
  await page.getByRole('button', { name: 'Add Socrates-inspired question to draft' }).click();
  assert.equal(await draft.inputValue(), question);
  assert.equal(sentCount(), 0);
  await page.getByRole('button', { name: 'SEND', exact: true }).click();
  await page.getByText(question, { exact: true }).waitFor();
  const bob = await app.dispatch(app.request('GET', { peer: ids.alice, headers: { cookie: app.cookies[ids.bob] } }));
  assert.ok((await bob.json()).messages.some(message => message.content === question && message.sender_id === ids.alice));
  assert.equal(sentCount(), 1);
  stories.push('A prepared Thinker question stays in the draft until Send and reaches the other participant as an ordinary message.');
  console.log('Confirmed the prepared question in both participant views.');

  await app.seed(ids.new, ids.bob, ids.alice, 'Unseen Bob reply');
  const gate = holdBob = { reached: latch(), release: latch(), delivered: latch() };
  try {
    await bounded(page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))), 'the browser refresh event');
    await bounded(gate.reached.promise, 'the held Bob reply');
    console.log('Holding the old thread reply.');
    await page.getByText('Carol Fixture', { exact: true }).click();
    await page.getByText('Private Carol thread', { exact: true }).waitFor();
    const late = page.waitForResponse(response => new URL(response.url()).searchParams.get('peerId') === ids.bob);
    gate.release.resolve();
    assert.equal((await late).status(), 200);
    await bounded(gate.delivered.promise, 'the retired response delivery');
    await page.waitForTimeout(150);
    assert.equal(await page.getByText('Unseen Bob reply', { exact: true }).count(), 0);
    assert.equal((await app.flags()).find(([id]) => id === ids.new)[1], false);
    assert.equal((await app.flags()).find(([id]) => id === ids.other)[1], true);
  } finally { gate.release.resolve(); }
  stories.push('A held reply from the old thread cannot appear in the new conversation or mark the old messages read.');
  await context.addCookies([{ name: 'soe_auth_provider', value: 'signed_out', url: origin, secure: true, httpOnly: true }]);
  const denied = page.waitForResponse(response => new URL(response.url()).searchParams.get('peerId') === ids.carol && response.status() === 401);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await denied;
  await page.getByText('Private Carol thread', { exact: true }).waitFor({ state: 'detached' });
  stories.push('An explicit session refusal clears the conversation even when no local account event arrived.');
  assert.deepEqual({ errors, unexpected }, { errors: [], unexpected: [] });
} catch (error) {
  failure = error;
} finally {
  holdBob?.release.resolve();
  try { if (browser) { await bounded(browser.close(), 'browser cleanup'); closes.browser = true; } } catch (error) { failure ??= error; }
  try { await app.close(); closes.database = true; } catch (error) { failure ??= error; }
  await writeFile('evidence/direct-message-browser-' + run + '.json', JSON.stringify({ status: failure ? 'FAIL' : 'PASS', stories, requests,
    errors, unexpected, closes, sourceHashes, bundleSha256: sha(bundle), failure: failure?.stack }, null, 2) + '\n', { flag: 'wx' });
}
if (failure) throw failure;
for (const story of stories) console.log('PASS ' + story);
