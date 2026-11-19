import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { createCircleMemberBlocksApp, text } from './support/circle-member-blocks-app.mjs';
import { rpc } from './support/review-coverage-db.mjs';
import { installQuestXrDouble } from '../../../platforms/tests/quest-xr-browser-double.mjs';

const ROOT = resolve('../..');
const files = name => resolve(ROOT, name);
const evidence = 'verification/web/evidence/';
const [run, ...extra] = process.argv.slice(2);
assert(!extra.length && (run === undefined || /^built-shell-quest-room-safety-[a-z0-9-]+-$/.test(run)));
const prefix = evidence + (run ?? 'built-shell-member-block-manager-final-browser-');
const resultPath = files(prefix + 'stories.json');
const readyPath = files(prefix + 'server-ready.json');
const read = path => {
  const info = lstatSync(path);
  assert(info.isFile() && !info.isSymbolicLink() && info.blocks, path);
  return readFileSync(path);
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const readyBytes = read(readyPath), ready = JSON.parse(readyBytes);
assert.equal(ready.status, 'READY');
assert.match(ready.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
assert(process.execArgv.some(value => value.endsWith('/deny-build-network.cjs')));

const { chromium } = createRequire(process.env.SOE_PLAYWRIGHT_PACKAGE + '/package.json')('playwright');
const exec = promisify(execFile);
const guard = files('verification/web/scripts/built-shell-network-guard.cjs');
const report = { status: 'RUNNING', buildId: ready.buildId, readySha256: hash(readyBytes),
  stories: [], faults: [], blockedOrigins: [], calls: [], sourceHashes: {}, cleanup: {} };
let app, browser, loseNext = false, loseNextUnblock = false, loseReport = false;
let holdReply = null, releaseReply = null;
const save = () => writeFileSync(resultPath, JSON.stringify(report, null, 2) + '\n');
const button = (page, label) => page.getByRole('button', { name: label, exact: true });
async function shell(request, url) {
  assert.equal(request.method(), 'GET');
  const forwarded = ['accept', 'rsc', 'next-router-prefetch', 'next-router-state-tree', 'next-url', 'next-router-segment-prefetch'];
  const headers = Object.fromEntries(Object.entries(request.headers()).filter(([key]) => forwarded.includes(key)));
  const { stdout } = await exec(process.execPath, ['--require', guard, '-e', `
    (async () => {
      const gate = globalThis.__soeBuiltShellGuard;
      const url = new URL(process.argv[1], gate.origin);
      if (url.origin !== gate.origin) throw Error('Invalid test shell address');
      const response = await fetch(url, { headers: JSON.parse(process.argv[2]), redirect: 'manual' });
      const headers = Object.fromEntries(response.headers);
      for (const key of ['content-encoding','content-length','transfer-encoding','connection','set-cookie']) delete headers[key];
      const body = Buffer.from(await response.arrayBuffer());
      if (gate.denied.length || body.length > 8000000) throw Error('Shell guard refused the response');
      process.stdout.write(JSON.stringify({ status: response.status, headers, body: body.toString('base64') }));
    })().catch(error => { console.error(error.message); process.exitCode = 1; });`, url.pathname + url.search, JSON.stringify(headers)],
  { env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor', SOE_BUILT_SHELL_PORT: new URL(ready.origin).port },
    timeout: 7000, maxBuffer: 12000000 });
  const output = JSON.parse(stdout);
  return { ...output, body: Buffer.from(output.body, 'base64') };
}

async function open(path) {
  const context = await browser.newContext({ viewport: { width: 320, height: 850 }, serviceWorkers: 'block', hasTouch: true });
  if (path.startsWith('/quest/')) await context.addInitScript(installQuestXrDouble);
  const intent = randomUUID();
  const signed = await app.walletCookie('author') + '; soe_auth_intent=' + intent
    + '; soe_auth_selection_v1=v1.' + intent + '.wallet.' + app.viewerId;
  await context.addCookies(signed.split('; ').map(cookie => {
    const [name, ...parts] = cookie.split('=');
    return { name, value: parts.join('='), url: app.ORIGIN, secure: true, httpOnly: name !== 'soe_auth_intent' };
  }));
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    let delayed = false;
    try {
      if (url.origin !== app.ORIGIN) { report.blockedOrigins.push(url.origin); await route.abort(); return; }
      if (!url.pathname.startsWith('/api/')) { await route.fulfill(await shell(request, url)); return; }
      assert(/^\/api\/(?:auth\/(?:member|provider)|members\/blocks|book-salons\/[a-f0-9-]+|circles\/[a-f0-9-]+(?:\/(?:discussion(?:\/preview)?|messages\/[a-f0-9-]+))?)$/.test(url.pathname), url.pathname);
      const method = request.method(), body = request.postData() ?? undefined;
      const response = await app.dispatch(url.pathname + url.search, { method, headers: await request.allHeaders(), body });
      const safety = /^\/api\/circles\/[a-f0-9-]+\/messages\/[a-f0-9-]+$/.test(url.pathname);
      const action = safety && method === 'POST' ? JSON.parse(body).action : null;
      const block = action === 'block';
      const unblock = method === 'POST' && url.pathname === '/api/members/blocks';
      report.calls.push({ method, path: url.pathname, status: response.status, block,
        ...(action ? { action, actionBodySha256: hash(body) } : {}), ...(unblock ? { unblockBodySha256: hash(body) } : {}) });
      if (safety && url.pathname === holdReply?.path && method === holdReply.method) {
        holdReply = null; delayed = true;
        await new Promise(resolve => { releaseReply = resolve; });
      }
      if (block && loseNext || unblock && loseNextUnblock || action === 'report' && loseReport) {
        assert.equal(response.status, 200);
        if (block) loseNext = false;
        else if (unblock) loseNextUnblock = false;
        else loseReport = false;
        await route.abort('failed');
        return;
      }
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
    } catch (error) {
      // A retired request can lose its browser route after its exact state
      // reply has been held. Any other route error remains a fixture failure.
      if (!delayed || !request.failure()?.errorText.includes('ERR_ABORTED')) report.faults.push(String(error));
      await route.abort().catch(() => {});
    }
  });
  const page = await context.newPage();
  page.on('pageerror', error => report.faults.push(String(error)));
  page.setDefaultTimeout(10000);
  await page.bringToFront();
  assert.equal((await page.goto(app.ORIGIN + path)).status(), 200);
  return { page, context };
}
async function contains(page, content) { await page.getByText(content, { exact: true }).first().waitFor(); }
async function absent(page, ...contents) {
  for (const content of contents) assert.equal(await page.getByText(content, { exact: true }).count(), 0, content);
}
async function archiveWeb(page) {
  await button(page, 'Load current discussion archive').click();
  await page.getByRole('heading', { name: 'Discussion archive', exact: true }).waitFor();
}
async function blockWeb(page) {
  const post = page.locator('[data-discussion-message="' + app.postId + '"]');
  await post.getByRole('button', { name: 'Check message actions', exact: true }).click();
  const block = post.getByRole('button', { name: 'Block author', exact: true });
  await block.waitFor();
  assert(await block.isDisabled());
  await post.getByRole('checkbox', { name: 'I checked this message and will choose an action below.', exact: true }).check();
  await block.click();
}

async function testRoomMessageActions() {
  const heading = 'First checked line of the synthetic post.';
  const finalLine = 'Final checked line with café and a reply.';
  const long = [heading, ...Array.from({ length: 9 }, (_, i) => `Checked part ${i + 1}. Read every line.`), finalLine].join('\n');
  const longPost = (await rpc(app.db, 'soe_circle_discussion_post', [app.targetId, app.circleId, randomUUID(), long,
    null, null, null, 'Synthetic member'])).message.id;
  const longState = '/api/circles/' + app.circleId + '/messages/' + longPost;
  const viewerState = '/api/circles/' + app.circleId + '/messages/' + app.viewerPostId;
  const quest = await open('/quest/' + app.circleId), { page } = quest;
  await page.evaluate(() => window.questXrQa.enable());
  await button(page, 'Connect signed-in account').click();
  const see = value => page.waitForFunction(text => window.questXrQa.panel().replace(/\s+/g, ' ').includes(text), value);
  const labels = () => page.evaluate(() => window.questXrQa.labels());
  const label = value => page.waitForFunction(text => window.questXrQa.labels().includes(text), value);
  const press = async value => { await label(value); await page.evaluate(text => window.questXrQa.press(text), value); };
  const trigger = () => page.evaluate(() => window.questXrQa.select());
  const roomEnter = page.locator('#quest-immersive-enter'), roomExit = page.locator('#quest-immersive-exit');
  async function enter() {
    await roomEnter.click();
    await see('Press the controller trigger to check your signed-in account.');
    await trigger();
    await see('Press the trigger to check Circle access and load recent discussion.');
    await trigger();
    await see('discussion 1 of');
  }
  async function findPreview(value) {
    for (let count = 0; count < 5; count++) {
      const before = await page.evaluate(() => window.questXrQa.panel());
      if (before.replace(/\s+/g, ' ').includes(value)) return;
      await press('Next preview');
      await page.waitForFunction(previous => window.questXrQa.panel() !== previous, before);
    }
    throw Error('Expected Circle preview did not appear');
  }
  const calls = path => report.calls.filter(call => call.path === path);
  async function waitForHeldReply() {
    for (let i = 0; !releaseReply && i < 80; i++) await new Promise(resolve => setTimeout(resolve, 50));
    assert(releaseReply, 'Expected the actual message action reply to be held');
  }
  const writes = (path, action) => calls(path).filter(call => call.action === action);
  async function readAndChoose() {
    await press('Message actions');
    await see('Checked post. Part 1 of');
    if ((await labels()).includes('Next part')) await press('Next part');
    await press('Choose action');
  }
  await enter();
  await findPreview(heading);
  await press('Message actions');
  await see('Checked post. Part 1 of 2.');
  assert((await labels()).includes('Next part'));
  assert(!(await labels()).includes('Choose action'));
  assert.deepEqual(calls(longState).map(call => call.method), ['GET']);
  await press('Next part');
  await see(finalLine);
  await press('Choose action');
  await press('Report post');
  await see('Reason 1 of 6.');
  await press('Next reason');
  await see('Harassment or hateful conduct. Reason 2 of 6.');
  await press('Use this reason');
  await see('Review private report');
  await label('Send private report');
  await page.evaluate(() => window.questXrQa.repeat());
  assert.equal(writes(longState, 'report').length, 0);
  const screenshot = await page.evaluate(() => window.questXrQa.image());
  assert(screenshot.startsWith('data:image/png;base64,'));
  writeFileSync(files(prefix + 'headset-report-review.png'), Buffer.from(screenshot.split(',')[1], 'base64'));
  loseReport = true;
  await press('Send private report');
  await see('Message action unconfirmed');
  assert.equal(loseReport, false);
  await press('Check current message');
  await see('Current message state loaded.');
  assert.equal(writes(longState, 'report').length, 1);
  await press('Retry exact report');
  await see('Report received for private human review.');
  const reports = writes(longState, 'report');
  assert.equal(reports.length, 2);
  assert(reports.every(call => call.status === 200 && call.actionBodySha256 === reports[0].actionBodySha256));
  assert.deepEqual((await app.db.query('SELECT reason, note, status FROM public.circle_message_reports WHERE message_id=$1', [longPost])).rows,
    [{ reason: 'harassment', note: null, status: 'open' }]);
  report.stories.push('The headset pages through the exact checked text and confirms a reason separately. A lost report reply stays unconfirmed after a read, then exact retry recovers one private human report.');

  await press('Read current discussion');
  await see('discussion 1 of');
  await findPreview(text.viewer);
  await readAndChoose();
  await label('Withdraw my post');
  assert(!(await labels()).includes('Report post') && !(await labels()).includes('Block member'));
  await press('Withdraw my post');
  await see('Restricted evidence may remain for safety review.');
  assert.equal(writes(viewerState, 'withdraw').length, 0);
  await press('Confirm withdrawal');
  await see('Withdrawal confirmed.');
  assert.equal((await app.db.query('SELECT withdrawn FROM public.circle_message_states WHERE message_id=$1', [app.viewerPostId])).rows[0].withdrawn, true);
  await press('Read current discussion');
  await see('discussion 1 of');
  report.stories.push('Only the author receives withdrawal for their post, with a separate confirmation and a saved tombstone.');

  await findPreview(heading);
  holdReply = { path: longState, method: 'GET' };
  const before = writes(longState, 'block').length;
  await press('Message actions');
  await waitForHeldReply();
  await page.evaluate(() => window.questXrQa.visibility('visible-blurred'));
  await page.waitForFunction(() => document.getElementById('quest-immersive-status').textContent.includes('Headset focus changed.'));
  releaseReply(); releaseReply = null;
  await page.waitForFunction(() => window.questXrQa.labels().length === 0);
  assert(!(await page.evaluate(() => window.questXrQa.panel())).includes(heading));
  assert.equal(writes(longState, 'block').length, before);
  report.stories.push('Headset focus loss during a held message check clears the controls and ignores the late private response.');

  await page.locator('#member-session-check').click();
  await enter();
  await findPreview(heading);
  await readAndChoose();
  await press('Block member');
  await see('Review member block');
  assert.equal(writes(longState, 'block').length, 0);
  loseNext = true;
  await press('Confirm block');
  await see('Message action unconfirmed');
  assert(await app.ownedBlock());
  assert(!(await labels()).includes('Check current message'));
  await press('Retry exact block');
  await see('Member blocked.');
  const blocks = writes(longState, 'block');
  assert.equal(blocks.length, 2);
  assert(blocks.every(call => call.status === 200 && call.actionBodySha256 === blocks[0].actionBodySha256));
  await press('Read current discussion');
  await see(text.independent);
  const current = await page.evaluate(() => ({ panel: window.questXrQa.panel(), ...window.questXrQa.stats() }));
  assert(!current.panel.includes(heading) && !current.panel.includes(text.target));
  assert(current.draws > 0 && current.uploads > 0);
  assert.deepEqual(current.errors, []);
  await roomExit.click();
  await page.locator('#member-session-check').click();
  await page.locator('#circle-archive-open').click();
  await contains(page, text.independent);
  await absent(page, text.target, text.targetOther, long);
  report.stories.push('The checked member block uses an exact retry after a lost reply. The reloaded room and regular archive hide that author and retain the independent reply.');

  await enter();
  await findPreview(text.independent);
  await readAndChoose();
  await press('Report post');
  await press('Use this reason');
  await see('Review private report');
  const independentState = '/api/circles/' + app.circleId + '/messages/' + app.thirdReplyId;
  holdReply = { path: independentState, method: 'POST' };
  await press('Send private report');
  await waitForHeldReply();
  assert.equal(writes(independentState, 'report').length, 1);
  await page.evaluate(() => window.questXrQa.visibility('visible-blurred'));
  await page.waitForFunction(() => document.getElementById('quest-immersive-status').textContent.includes('An interrupted message action may have been saved.'));
  releaseReply(); releaseReply = null;
  await page.waitForFunction(() => window.questXrQa.labels().length === 0);
  assert(!(await page.evaluate(() => window.questXrQa.panel())).includes(text.independent));
  assert.equal(writes(independentState, 'report').length, 1);
  assert.deepEqual((await app.db.query('SELECT reason, note, status FROM public.circle_message_reports WHERE message_id=$1', [app.thirdReplyId])).rows,
    [{ reason: 'safety', note: null, status: 'open' }]);
  const ai = await app.db.query('SELECT count(*)::integer AS total FROM public.circle_message_ai_attempts WHERE message_id=ANY($1::uuid[])', [[longPost, app.thirdReplyId]]);
  assert.equal(ai.rows[0].total, 0);
  report.stories.push('Focus loss after a saved report clears its private review, shows an interrupted-action notice and makes no automatic retry. Neither report creates an AI review attempt.');
  await quest.context.close();
}

try {
  for (const name of [
    'platforms/tests/quest-xr-browser-double.mjs', 'verification/web/tests/browser-circle-member-blocks.mjs', 'verification/web/tests/support/circle-member-blocks-app.mjs',
    'verification/web/tests/support/public-profile-app.mjs', 'docs/sql/circle-member-blocks-apply.sql',
    'docs/sql/direct-message-blocks-apply.sql', 'docs/sql/wallet-challenge-consumption-apply.sql',
    'docs/sql/wallet-session-revocation-apply.sql', 'app/circles/[circleId]/discussion/DiscussionBrowser.tsx',
    'app/circles/messages/MessageActions.tsx', 'app/quest/[circleId]/QuestCircle.tsx', 'platforms/quest/circle-host.mjs',
    'platforms/quest/circle-view.mjs', 'lib/circles/message-moderation.ts',
    'platforms/quest/member-blocks-view.mjs', 'platforms/shared/member-blocks.ts', 'app/api/members/blocks/route.ts',
    'lib/members/direct-message.ts', 'lib/members/direct-message-server.ts',
    ...(run ? ['platforms/quest/immersive-circle.mjs', 'platforms/quest/room-message-safety.mjs', 'platforms/quest/room-reading.mjs'] : []),
  ]) {
    report.sourceHashes[name] = hash(read(files(name)));
    if (ready.sourceHashes[name]) assert.equal(report.sourceHashes[name], ready.sourceHashes[name], name);
  }
  app = await createCircleMemberBlocksApp();
  browser = await chromium.launch({ executablePath: process.env.SOE_CHROMIUM_EXECUTABLE, headless: true, timeout: 15000,
    args: ['--disable-background-networking','--disable-component-update','--no-first-run','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const path = '/circles/' + app.circleId + '/discussion';
  const web = await open(path);
  await archiveWeb(web.page);
  await contains(web.page, text.target);
  await contains(web.page, text.targetOther);
  await web.page.locator('[data-discussion-message="' + app.postId + '"]').getByRole('button', { name: 'Reply to this message' }).click();
  const draft = web.page.locator('textarea').first();
  await draft.fill('SYNTHETIC_DRAFT_CLEARED_ON_BLOCK');
  await blockWeb(web.page);
  await contains(web.page, 'Member blocked. Load the current discussion to continue.');
  assert.equal(await web.page.locator('textarea').count(), 0);
  await absent(web.page, text.target, text.targetOther, text.independent);
  assert(await app.ownedBlock());
  await archiveWeb(web.page);
  await absent(web.page, text.target, text.targetOther);
  await contains(web.page, text.independent);
  assert.equal(await web.page.getByText('This message is unavailable.', { exact: true }).count(), 2);
  report.stories.push('The compiled phone-width web archive clears the draft and every old card on confirmation. Reload preserves the third member’s reply.');
  await web.page.screenshot({ path: files(prefix + 'web-320.png') });

  await app.unblock();
  await archiveWeb(web.page);
  await contains(web.page, text.target);
  loseNext = true;
  await blockWeb(web.page);
  await contains(web.page, 'Block unconfirmed. Check Members → Chat → Blocked members before deciding again.');
  assert.equal(loseNext, false);
  await absent(web.page, text.target, text.targetOther);
  assert(await app.ownedBlock());
  report.stories.push('The compiled browser clears old content after a lost reply and leaves the result unconfirmed even though SQL saved the block.');
  await web.context.close();

  await app.unblock();
  const quest = await open('/quest/' + app.circleId);
  await quest.page.evaluate(() => window.questXrQa.enable());
  await button(quest.page, 'Connect signed-in account').click();
  await quest.page.getByText('Account connection opened.', { exact: false }).waitFor();
  const questArchive = quest.page.locator('#circle-archive-open');
  if (await questArchive.isDisabled() && await quest.page.locator('#member-session-check').isEnabled()) {
    await quest.page.locator('#member-session-check').click();
  }
  await questArchive.click();
  const post = quest.page.locator('#circle-archive-messages article').filter({ hasText: text.target });
  await post.getByRole('button', { name: 'Check message actions', exact: true }).click();
  const block = quest.page.locator('#circle-safety-block');
  await block.waitFor();
  assert(await block.isDisabled());
  await quest.page.locator('#circle-safety-confirm').check();
  await block.click();
  await quest.page.waitForFunction(() => document.getElementById('circle-safety-status').textContent.includes('Member blocked.'));
  await absent(quest.page, text.target, text.targetOther);
  await questArchive.click();
  await contains(quest.page, text.independent);
  await absent(quest.page, text.target, text.targetOther);
  assert(await app.ownedBlock());
  report.stories.push('The compiled Quest Browser connects the signed fixture wallet, checks the selected author, and reloads the same blocked thread.');
  await quest.page.screenshot({ path: files(prefix + 'quest-320.png') });
  const seePanel = value => quest.page.waitForFunction(text => window.questXrQa.panel().replace(/\s+/g, ' ').includes(text), value);
  const trigger = () => quest.page.evaluate(() => window.questXrQa.select());
  const loadBlocks = button(quest.page, 'Load blocked members');
  const reviewUnblock = quest.page.getByRole('button', { name: /^Review unblock for / });
  await loadBlocks.click();
  await reviewUnblock.waitFor();
  assert.equal(await reviewUnblock.count(), 1);
  await quest.page.locator('#quest-immersive-enter').click();
  await seePanel('Press the controller trigger to check your signed-in account.');
  assert.equal(await reviewUnblock.count(), 0, 'A private block list must clear on entering the room');
  await trigger();
  await seePanel('Press the trigger to check Circle access and load recent discussion.');
  await trigger();
  await seePanel(text.independent);
  const panel = await quest.page.evaluate(() => ({ text: window.questXrQa.panel(), ...window.questXrQa.stats() }));
  assert(!panel.text.includes(text.target) && !panel.text.includes(text.targetOther));
  assert(panel.draws > 0);
  assert.deepEqual(panel.errors, []);
  await quest.page.locator('#quest-immersive-exit').click();
  report.stories.push('The compiled Quest room renders the independent reply in simulated WebXR after the same member block.');
  await quest.page.locator('#member-session-check').click();
  assert.equal(await reviewUnblock.count(), 0);
  await loadBlocks.click();
  await reviewUnblock.waitFor();
  await quest.page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal(await reviewUnblock.count(), 0);
  assert(await loadBlocks.isDisabled());
  await quest.page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await quest.page.locator('#member-session-check').click();
  await loadBlocks.click();
  await reviewUnblock.waitFor();
  await reviewUnblock.click();
  await quest.page.getByRole('heading', { name: 'Review unblock', exact: true }).waitFor();
  assert(await app.ownedBlock());
  await quest.page.screenshot({ path: files(prefix + 'review-320.png') });
  report.stories.push('The signed-in Quest list requires a fresh manual load after immersive mode and browser inactivity. The checked row opens the exact unblock review.');

  loseNextUnblock = true;
  await button(quest.page, 'Unblock this member').click();
  await contains(quest.page, 'Unblock unconfirmed. You can retry this exact request or clear the view.');
  assert.equal(loseNextUnblock, false);
  assert.equal(await app.ownedBlock(), null);
  assert.equal(await reviewUnblock.count(), 0);
  await button(quest.page, 'Retry exact unblock').click();
  await contains(quest.page, 'Unblocked. Load your current list to continue.');
  const unblocks = report.calls.filter(call => call.unblockBodySha256);
  assert.equal(unblocks.length, 2);
  assert(unblocks.every(call => call.status === 200 && call.unblockBodySha256 === unblocks[0].unblockBodySha256));
  await loadBlocks.click();
  await contains(quest.page, 'There are no blocks on this page.');
  await questArchive.click();
  await contains(quest.page, text.target);
  report.stories.push('Quest Browser retries the unchanged unblock after the committed reply is lost. The refreshed list is empty and the current Circle post is visible again.');
  await quest.context.close();
  assert.equal(report.calls.filter(call => call.block && call.status === 200).length, 3);
  if (run) await testRoomMessageActions();
  assert.deepEqual(report.faults, []);
  assert.deepEqual(report.blockedOrigins, []);
  report.status = 'PASS';
} finally {
  releaseReply?.();
  try { await browser?.close(); report.cleanup.browser = true; }
  finally { await app?.close(); report.cleanup.database = true; save(); }
}
console.log(JSON.stringify({ status: report.status, stories: report.stories.length, requests: report.calls.length }));
