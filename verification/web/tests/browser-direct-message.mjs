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
const [bundle, css, manifest] = await Promise.all(['page.js','page.css','source-hashes.json'].map(name => readFile(fixture + '/' + name)));
const sha = value => createHash('sha256').update(value).digest('hex');
const sourceHashes = JSON.parse(manifest);
for (const [path, digest] of Object.entries(sourceHashes)) assert.equal(sha(await readFile('../../' + path)), digest, path);
const app = await directMessageApp();
const stories = [], requests = [], errors = [], unexpected = [];
const closes = { browser: false, database: false };
let browser, failure, holdBob, holdBlock;
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
        body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic members</title><link rel="stylesheet" href="/page.css"><div id="root"></div><script type="module" src="/page.js"></script>' });
      if (url.origin === origin && url.pathname === '/page.js') return await route.fulfill({ contentType: 'text/javascript', body: bundle });
      if (url.origin === origin && url.pathname === '/page.css') return await route.fulfill({ contentType: 'text/css', body: css });
      if (url.origin === origin && url.pathname === '/api/members/discover') return await route.fulfill({ json: { members: people } });
      if (url.origin !== origin || url.pathname !== '/api/message') {
        unexpected.push({ origin: url.origin, path: url.pathname });
        return await route.abort();
      }
      const headers = await req.allHeaders(), peer = url.searchParams.get('peerId');
      assert.equal(headers['x-soe-expected-member'], ids.alice);
      assert.match(headers.cookie ?? '', /soe_auth_selection_v1/);
      const response = await app.dispatch(app.request(method, { query: url.search, headers, body: req.postData() ?? undefined }));
      assert.match(response.headers.get('cache-control'), /private.*no-store/);
      requests.push({ method, peer, status: response.status });
      const gate = method === 'GET' && peer === ids.bob ? holdBob : method === 'PUT' ? holdBlock : null;
      if (gate) {
        if (method === 'PUT') holdBlock = null;
        else holdBob = null;
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
  await page.getByRole('button', { name: /Bob Fixture.*Published profile/ }).click();
  await page.getByText('Unseen Bob reply', { exact: true }).waitFor();
  const stale = holdBob = { reached: latch(), release: latch(), delivered: latch() };
  try {
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await bounded(stale.reached.promise, 'a private reply produced before blocking');
    await page.getByRole('button', { name: 'Block member', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'SEND', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Confirm block', exact: true }).click();
    await page.getByText('You blocked direct messages with this member.', { exact: true }).waitFor();
    stale.release.resolve();
    await bounded(stale.delivered.promise, 'delivery of the pre-block reply');
    assert.equal(await page.getByText('Unseen Bob reply', { exact: true }).count(), 0);
    const blockedSend = await app.dispatch(app.request('POST', {
      headers: { cookie: app.cookies[ids.bob], origin, 'content-type': 'application/json' },
      body: JSON.stringify({ recipientId: ids.alice, content: 'Blocked browser fixture send' }),
    }));
    assert.equal(blockedSend.status, 403);
  } finally { stale.release.resolve(); }
  stories.push('Explicit blocking clears the private thread, retires a held pre-block reply and refuses a new send from the other account.');

  await page.setViewportSize({ width: 320, height: 820 });
  const back = page.getByRole('button', { name: 'Back to conversations', exact: true });
  assert(await back.isVisible());
  assert((await back.boundingBox()).height >= 44);
  const nav = page.getByRole('navigation', { name: 'Member views' });
  const controls = await nav.getByRole('button').all();
  assert.equal(controls.length, 5);
  for (const control of controls) {
    const bounds = await control.boundingBox();
    assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 320 && bounds.height >= 44);
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: 'evidence/direct-message-block-' + run + '-320.png', fullPage: true });
  await back.click();
  await page.getByRole('button', { name: 'Blocked members', exact: true }).click();
  await page.getByRole('button', { name: 'Load blocked members', exact: true }).click();
  await page.getByRole('listitem').getByText(/Bob Fixture/).waitFor();
  await page.getByRole('button', { name: 'Review unblock', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm unblock', exact: true }).click();
  await page.getByText('You have no direct-message blocks.', { exact: true }).waitFor();
  await back.click();
  await page.getByRole('button', { name: /Bob Fixture.*Published profile/ }).click();
  await page.getByText('Private Bob thread', { exact: true }).waitFor();
  await draft.waitFor();
  const composer = await page.getByRole('button', { name: 'SEND', exact: true }).boundingBox();
  assert(composer && composer.x + composer.width <= 320);
  stories.push('At 320px the owner can review and remove a block from the private list. A fresh conversation opens the preserved history.');

  await back.click();
  await page.getByRole('button', { name: /Carol Fixture.*Published profile/ }).click();
  await page.getByText('Private Carol thread', { exact: true }).waitFor();
  await context.addCookies([{ name: 'soe_auth_provider', value: 'signed_out', url: origin, secure: true, httpOnly: true }]);
  const denied = page.waitForResponse(response => new URL(response.url()).searchParams.get('peerId') === ids.carol && response.status() === 401);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await denied;
  await page.getByText('Private Carol thread', { exact: true }).waitFor({ state: 'detached' });
  stories.push('An explicit session refusal clears the conversation even when no local account event arrived.');
  await context.addCookies(cookies);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.getByText('Private Carol thread', { exact: true }).waitFor();
  const departed = holdBlock = { reached: latch(), release: latch(), delivered: latch() };
  try {
    await page.getByRole('button', { name: 'Block member', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm block', exact: true }).click();
    await bounded(departed.reached.promise, 'a committed block with held confirmation');
    await page.evaluate(() => window.dmChangeAccount());
    await page.getByRole('heading', { name: 'Sign-in changed', exact: true }).waitFor();
    departed.release.resolve();
    await bounded(departed.delivered.promise, 'delivery after account retirement');
    assert.equal(await page.getByText('Direct messages blocked.', { exact: true }).count(), 0);
    assert.equal(await page.getByText('Private Carol thread', { exact: true }).count(), 0);
  } finally { departed.release.resolve(); }
  stories.push('A committed block reply cannot reopen the conversation or publish a stale status after account retirement.');
  assert.deepEqual({ errors, unexpected }, { errors: [], unexpected: [] });
} catch (error) {
  failure = error;
} finally {
  holdBob?.release.resolve();
  holdBlock?.release.resolve();
  try { if (browser) { await bounded(browser.close(), 'browser cleanup'); closes.browser = true; } } catch (error) { failure ??= error; }
  try { await app.close(); closes.database = true; } catch (error) { failure ??= error; }
  await writeFile('evidence/direct-message-browser-' + run + '.json', JSON.stringify({ status: failure ? 'FAIL' : 'PASS', stories, requests,
    errors, unexpected, closes, sourceHashes, bundleSha256: sha(bundle), cssSha256: sha(css), failure: failure?.stack }, null, 2) + '\n', { flag: 'wx' });
}
if (failure) throw failure;
for (const story of stories) console.log('PASS ' + story);
