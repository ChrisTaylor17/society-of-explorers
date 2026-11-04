// Actual Quest component -> actual member/discussion handlers -> strict SQL.
// Synthetic identity/SDK verification and local HTTPS fulfillment only.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)), WEB = path.join(ROOT, 'verification/web');
const output = path.join(ROOT, 'platforms/evidence/quest-message-actions-composed.json');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function read(name) { const file = path.isAbsolute(name) ? name : path.join(ROOT, name), stat = fs.statSync(file), link=fs.lstatSync(file); assert.ok(stat.isFile()&&!link.isSymbolicLink(),'Refuse non-file/symlink source: '+name); assert.ok(stat.blocks, 'Refuse offloaded file: ' + name); return fs.readFileSync(file); }
async function bounded(work, ms = 5000, label = 'Owned operation') { let timer; try { return await Promise.race([Promise.resolve().then(work), new Promise((_, reject) => { timer = setTimeout(() => reject(Error(label + ' timed out')), ms); })]); } finally { clearTimeout(timer); } }
const gate = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const stories = [], api = [], pageErrors = [], consoleErrors = [], unexpected = [], routeErrors = [], retiredRoutes = [];
const cleanup = { browser: 'pending', database: 'pending' }, pending = new Set(), controllers = new Map(), releases = new Set();
const startedAt = new Date().toISOString(), executablePath = process.env.SOE_BROWSER_EXECUTABLE;
const priorReceipt = fs.existsSync(output) ? (() => { const bytes = read(output); return { sha256: sha(bytes), receipt: JSON.parse(bytes) }; })() : null;
let browser, ownedBrowserPid, f, failure = null, bundle, css, sourceHashes = {}, sqlHashes = {}, limits = {}, runtime = {}, latest = null;
let holdKind = null, held = null, dropNextPost = false, latestState = null, latestReceipt = null;
const report = status => ({ version: 1, status, startedAt, finishedAt: new Date().toISOString(), stories, api, pageErrors, consoleErrors, unexpected, routeErrors, retiredRoutes,
  cleanup, runtime, sourceHashes, sqlHashes, bundleSHA256: bundle ? sha(bundle) : null, cssSHA256: css ? sha(css) : null, limits, failure, priorReceipt,
  scope: 'Actual QuestCircle/React/auth bridge/generated Quest host/view and actual Bun CSS modules, actual auth/member + discussion GET + message-state/action handlers and current strict SQL in disposable PGlite. Explicit synthetic identity/SDK events/nonissued credentials and narrow PostgREST/NextResponse/NextLink ports; virtual HTTPS entirely intercepted. No real provider/cookie verification, SDK auth network, hosted database, multi-backend scheduling, native bridge, Quest headset or immersive acceptance. Prior Quest7/archive/keyed-write proof sources and outputs untouched. No native/headset or real auth verification claim.' });
const write = status => { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report(status), null, 2) + '\n'); };
const pass = name => { stories.push(name); write('RUNNING'); console.log('PASS ' + stories.length + ': ' + name); };
function cleanErrors() { assert.deepEqual(pageErrors, []); assert.deepEqual(consoleErrors, []); assert.deepEqual(unexpected, []); assert.deepEqual(routeErrors, []); }
function ownedChrome() { return execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' }).split('\n').map(line => line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/)).filter(m => m && Number(m[2]) === process.pid && m[3].startsWith(executablePath + ' ')).map(m => Number(m[1])); }
function signalOwnedChrome(signal) { if (!ownedBrowserPid || !ownedChrome().includes(ownedBrowserPid)) return; const group = Number(execFileSync('/bin/ps', ['-p', String(ownedBrowserPid), '-o', 'pgid='], { encoding: 'utf8' }).trim()); process.kill(group === ownedBrowserPid ? -ownedBrowserPid : ownedBrowserPid, signal); }
write('RUNNING');
try {
  process.chdir(WEB);
  assert.ok(process.execArgv.some(value => value.endsWith('/deny-build-network.cjs')), 'Startup deny guard required');
  assert.ok(process.env.SOE_PLAYWRIGHT_PACKAGE && executablePath, 'Explicit cached runtimes required');
  read(executablePath); read(path.join(process.env.SOE_PLAYWRIGHT_PACKAGE, 'package.json'));
  const require = createRequire(path.join(process.env.SOE_PLAYWRIGHT_PACKAGE, 'package.json'));
  const manifest = JSON.parse(read('platforms/evidence/quest-message-actions-composed-fixture/source-manifest.json'));
  const shared=JSON.parse(read('platforms/evidence/shared-build.json'));
  assert.equal(shared.exitCode,0,'Shared source build must have succeeded');
  assert.equal(shared.outputSHA256,sha(read('platforms/quest/circle-host.mjs')),'Generated host must match the successful shared build');
  const sharedManifest=JSON.parse(read('platforms/evidence/shared-source-manifest.json'));
  assert.deepEqual(shared.sourceHashes,sharedManifest.sourceHashes,'Shared build and source manifest must agree');
  sourceHashes = { ...manifest.sourceHashes, ...shared.sourceHashes,
    'platforms/evidence/shared-build.json':sha(read('platforms/evidence/shared-build.json')),
    'platforms/evidence/shared-source-manifest.json':sha(read('platforms/evidence/shared-source-manifest.json')) };
  const files = ['platforms/tests/bundle-quest-message-actions-composed.mjs', 'platforms/tests/browser-quest-message-actions-composed.mjs',
    'verification/web/tests/support/platforms-message-actions-app.mjs', 'verification/web/tests/support/offline-app.mjs', 'tests/security/fakes.ts',
    'app/api/auth/member/route.ts', 'lib/auth/memberDto.ts', 'lib/auth/provider.ts', 'lib/http/routeError.ts',
    'app/api/circles/[circleId]/discussion/route.ts', 'app/api/circles/[circleId]/messages/[messageId]/route.ts','lib/circles/message-moderation.ts','lib/circles/message-moderation-server.ts', 'lib/circles/thread-server.ts', 'lib/circles/thread.ts', 'lib/circles/moderation-server.ts',
    'lib/rateLimit.ts'];
  for (const file of files) sourceHashes[file] = sha(read(file));
  for (const [file, digest] of Object.entries(sourceHashes)) assert.equal(sha(read(file)), digest, 'Changed bundle source: ' + file);
  bundle = read('platforms/evidence/quest-message-actions-composed-fixture/page.js'); css = read('platforms/evidence/quest-message-actions-composed-fixture/page.css');
  const module = await import('../../verification/web/tests/support/platforms-message-actions-app.mjs');
  for (const [file, digest] of Object.entries(module.COVERAGE_SOURCE_HASHES)) (file.endsWith('.sql') ? sqlHashes : sourceHashes)[file] = digest;
  Object.assign(sourceHashes, await module.safetyAppHashes()); limits = module.COVERAGE_FIXTURE_LIMITS; f = await module.createPlatformsMessageActionsApp();
  const origin = module.ORIGIN;
  browser = await require('playwright').chromium.launch({ headless: true, timeout: 15000, executablePath,
    env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' }, args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'] });
  const pids = ownedChrome(); assert.equal(pids.length, 1); ownedBrowserPid = pids[0];
  runtime = { node: process.version, chromium: browser.version(), bun: manifest.bunVersion, startupDeny: true, cleanEnvironment: true, ownedBrowserPid };
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } }), page = await context.newPage(); page.setDefaultTimeout(7000);
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('Failed to load resource:')) consoleErrors.push(message.text()); });
  page.on('requestfailed', request => controllers.get(request)?.abort());
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()); let controller;
    try {
      if (url.origin !== origin) { unexpected.push(url.origin + url.pathname); return await route.abort(); }
      if (url.pathname === '/') return await route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="en" data-circle="${f.circleId}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/page.css"></head><body style="margin:0;background:#101d1a"><div id="root"></div><script type="module" src="/page.mjs"></script></body></html>` });
      if (url.pathname === '/page.mjs') return await route.fulfill({ contentType: 'text/javascript', body: bundle });
      if (url.pathname === '/page.css') return await route.fulfill({ contentType: 'text/css', body: css });
      assert.ok(['GET','POST'].includes(request.method()));
      const headers = await request.allHeaders(); assert.equal(headers.cookie, undefined); assert.equal(headers.referer, undefined);
      if (url.pathname === '/api/auth/member') assert.equal(headers.authorization, undefined);
      else { assert.ok(['/api/circles/'+f.circleId+'/discussion','/api/circles/'+f.circleId+'/messages/'+f.messageId].includes(url.pathname)); assert.ok(Object.values(module.TOKENS).some(value => headers.authorization === 'Bearer ' + value)); }
      if(request.method()==='POST')assert.equal(headers.origin,origin,'Browser mutation origin must match actual route origin');
      controller = new AbortController(); controllers.set(request, controller);
      const entry = { method: request.method(), path: url.pathname, queryKeys: [...url.searchParams.keys()].sort(), status: null, delivered: false, kind: null, itemCount: null }; api.push(entry);
      const work = (async () => {
        const response = await f.dispatch(url.pathname + url.search, {method:request.method(),headers,body:request.postData()??undefined,signal:controller.signal});
        assert.match(response.headers.get('cache-control'), /private.*no-store/); entry.status = response.status;
        const bytes = await response.text(), value = JSON.parse(bytes); entry.kind = value.kind ?? (value.state?'receipt':value.message&&typeof value.message==='object'?'state':'member'); entry.itemCount = value.items?.length ?? null;
        if (value.items) {
          latest = value;
          assert.doesNotMatch(bytes, /PRIVATE_SYNTHETIC_REPORT_NOTE|contentHash|reporter|email|supabase_auth_id/);
          for (const item of [...value.items, ...(value.root ? [value.root, value.focus] : [])]) {
            assert.deepEqual(Object.keys(item).sort(), ['id', 'member_name', 'content', 'created_at', 'is_mine', 'visibility', 'parentMessageId', 'rootMessageId'].sort());
            if (['hidden', 'withdrawn'].includes(item.visibility)) assert.equal(item.content, null);
          }
        }
        assert.doesNotMatch(bytes,/PRIVATE_QUEST_SAFETY_NOTE/,'Private report note must not echo into any member/action/read DTO');
        if(request.method()==='GET'&&url.pathname.includes('/messages/')&&response.status===200)latestState=value;
        if(request.method()==='POST'&&url.pathname.includes('/messages/')&&response.status===200)latestReceipt=value;
        if(dropNextPost&&request.method()==='POST'&&url.pathname.includes('/messages/')){dropNextPost=false;entry.droppedAfterCommit=true;await route.abort('failed');return;}
        const kind=url.pathname.includes('/messages/')?(request.method()==='POST'?'action':'state'):value.items?'read':'member';
        if(holdKind===kind){holdKind=null;held=gate();releases.add(held.resolve);await held.promise;releases.delete(held.resolve);}
        await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: bytes }); entry.delivered = true;
      })();
      pending.add(work); try { await work; } finally { pending.delete(work); controllers.delete(request); }
    } catch (error) {
      if (controller?.signal.aborted || /aborted|cancelled|Target.*closed|route.*handled/i.test(String(error))) retiredRoutes.push({ path: url.pathname, reason: 'Browser request retired' });
      else routeErrors.push(error.stack || String(error));
      try { await route.abort(); } catch {} controllers.delete(request);
    }
  });
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const count = () => page.evaluate(() => window.questMessageActionsQa.counts());
  const privateCalls = () => f.calls.length;
  const connect = async () => { await page.getByRole('button', { name: 'Connect signed-in account', exact: true }).click(); await page.waitForFunction(() => !document.getElementById('member-session-check').disabled); };
  const check = async () => { await page.locator('#member-session-check').click(); };
  const ready = () => page.waitForFunction(() => !document.getElementById('circle-archive-open').disabled);
  async function reset(actor = 'author', provider = 'supabase', sdkActor = actor) {
    await page.evaluate(() => window.questMessageActionsQa.providerChanged()); f.select(actor, provider);
    await page.evaluate(value => window.questMessageActionsQa.actor(value), sdkActor); await settle();
    await connect(); await check();
  }
  await page.goto(origin);await page.bringToFront();await page.getByRole('button',{name:'Connect signed-in account',exact:true}).waitFor();await settle();
  assert.deepEqual(await page.evaluate(()=>window.questMessageActionsQa.markupContract()),{legacy:true,safetyWithoutWriter:true,partial:true,duplicates:[true,true,true]});
  assert.deepEqual(await count(),{factories:0,calls:0,subscriptions:0});assert.equal(api.length,0);await connect();assert.equal((await count()).calls,0);assert.equal(api.length,0);
  await check();await ready();assert.equal(api.length,1);assert.equal(privateCalls(),0);
  for(const [actor,provider,sdkActor]of [['author','wallet','author'],['reporter','supabase','author']]){
    await reset(actor,provider,sdkActor);await page.waitForFunction(()=>document.getElementById('member-session-status').textContent.includes('Could not confirm'));assert.equal(privateCalls(),0);
  }
  pass('complete/legacy safety markup and known-ID duplicate preflight hold; mount/Connect make no SDK method/private request and metadata mismatch blocks private RPC');
  async function archive(){await ready();await page.locator('#circle-archive-open').click();await page.waitForFunction(()=>document.getElementById('circle-archive-status').textContent.includes('Current archive page loaded'));}
  const messageCard=()=>page.locator('[data-message-id="'+f.messageId+'"]');
  async function openActions(){await messageCard().getByRole('button',{name:'Check message actions',exact:true}).click();await page.waitForFunction(()=>document.getElementById('circle-safety-status').textContent.includes('Current message loaded'));}
  const actions=()=>f.http.filter(x=>x.method==='POST'&&x.path.includes('/messages/'));
  const stateReads=()=>f.http.filter(x=>x.method==='GET'&&x.path.includes('/messages/'));
  const unknown=()=>page.waitForFunction(()=>!document.getElementById('circle-safety-retry').hidden);
  const confirmed=()=>page.waitForFunction(()=>document.getElementById('circle-safety-status').textContent.includes('confirmed')||document.getElementById('circle-safety-status').textContent.includes('Report received'));
  async function reportDraft(note,reason='harassment'){
    await page.locator('#circle-safety-reason').selectOption(reason);await page.locator('#circle-safety-note').fill(note);
    assert.equal(await page.locator('#circle-safety-report').isDisabled(),true);
    assert.ok((await page.locator('#circle-safety-confirm').locator('..').boundingBox()).height>=44);
    await page.locator('#circle-safety-confirm').focus();await page.locator('#circle-safety-confirm').press('Space');assert.equal(await page.locator('#circle-safety-report').isDisabled(),false);
  }
  await reset('reporter');await archive();const beforeStateReads=stateReads().length;
  assert.equal(beforeStateReads,0,'Archive load cannot automatically check safety');await openActions();
  assert.equal(latestState.message.is_mine,false);assert.equal(latestState.canReport,true);assert.equal(latestState.canWithdraw,false);
  assert.equal(await page.locator('#circle-archive-messages article').count(),0,'Checking safety must retire stale archive bodies');
  assert.match(await page.locator('#circle-safety-report-fields').innerText(),/political or religious disagreement/);
  assert.equal(await page.locator('#circle-safety-reason option[value="misleading"]').textContent(),'Misleading content');
  await page.evaluate(()=>{const e=document.getElementById('circle-safety-note');e.value='Rejected'+String.fromCharCode(7);e.dispatchEvent(new Event('input',{bubbles:true}));});assert.equal(await page.locator('#circle-safety-note').inputValue(),'');
  const normalNote='PRIVATE_QUEST_SAFETY_NOTE: a synthetic conduct concern, not a viewpoint finding.';
  await reportDraft(normalNote);await page.locator('#circle-safety-note').fill(normalNote+' Updated.');assert.equal(await page.locator('#circle-safety-confirm').isChecked(),false);assert.equal(await page.locator('#circle-safety-report').isDisabled(),true);
  await page.locator('#circle-safety-confirm').check();const beforeReport=await f.counts(),beforeRequests=api.length;await page.locator('#circle-safety-report').click();await confirmed();
  const afterReport=await f.counts();assert.equal(afterReport.reports,beforeReport.reports+1);assert.equal(afterReport.receipts,beforeReport.receipts+1);assert.equal(latestReceipt.received,true);assert.equal(latestReceipt.state.message.visibility,'visible');
  assert.equal(api.length,beforeRequests+2,'Report sends one metadata check and one action, with no automatic refresh');assert.match(await page.locator('#circle-safety-status').innerText(),/allegation, not a finding/);
  assert.equal(await page.locator('#circle-safety-withdraw').isVisible(),false);assert.equal(await page.locator('#circle-safety-note').inputValue(),'');
  pass('fresh canonical permissions, explicit reason/private note/checkbox and real report SQL produce a private human-review receipt without auto-hide or AI consent');

  await page.locator('#circle-safety-close').click();await archive();await openActions();await reportDraft('PRIVATE_QUEST_SAFETY_NOTE: lost reply needs exact recovery.','spam');
  const beforeLost=await f.counts();dropNextPost=true;await page.locator('#circle-safety-report').click();await unknown();const sent=actions().at(-1),afterLost=await f.counts();
  assert.equal(afterLost.reports,beforeLost.reports+1);assert.equal(afterLost.receipts,beforeLost.receipts+1);
  assert.equal(await page.locator('#circle-safety-close').isDisabled(),true);assert.equal(await page.locator('#circle-archive-open').isDisabled(),true);assert.equal(await page.locator('#circle-thread-new').isDisabled(),true);assert.equal(await page.locator('#circle-post').isDisabled(),true);
  const unknownCalls=api.length;await settle();assert.equal(api.length,unknownCalls);
  await page.locator('#circle-safety-refresh').click();await page.waitForFunction(()=>document.getElementById('circle-safety-status').textContent.includes('does not confirm the earlier action'));
  assert.equal(actions().length,2);assert.equal(new URL(stateReads().at(-1).path,origin).search,'');assert.equal(await page.locator('#circle-safety-retry').isVisible(),true);assert.equal(await page.locator('#circle-safety-report').isDisabled(),true);
  await page.locator('#circle-safety-retry').click();await confirmed();assert.equal(actions().at(-1).body,sent.body);assert.equal(latestReceipt.replayed,true);assert.deepEqual(await f.counts(),afterLost);
  pass('lost committed report stays unknown; current-state GET retains the exact pending request and only manual byte-identical POST replay confirms without duplicate report');

  await page.locator('#circle-safety-close').click();await archive();await openActions();await reportDraft('PRIVATE_QUEST_SAFETY_NOTE: stale checked revision.','other');
  await f.report();const beforeStale=await f.counts();await page.locator('#circle-safety-report').click();await unknown();assert.equal(f.calls.at(-1).status,'PT409');assert.deepEqual(await f.counts(),beforeStale);
  await page.locator('#circle-safety-refresh').click();await page.waitForFunction(()=>document.getElementById('circle-safety-status').textContent.includes('does not confirm the earlier action'));assert.equal(await page.locator('#circle-safety-retry').isVisible(),true);assert.equal(await page.locator('#circle-safety-close').isDisabled(),true);
  pass('a separate actual report invalidates the checked revision; stale POST is refused and a fresh state read cannot invent confirmation or a fresh action key');

  await reset('reporter');await archive();holdKind='state';held=null;await messageCard().getByRole('button',{name:'Check message actions',exact:true}).click({noWaitAfter:true});await bounded(async()=>{while(!held)await new Promise(resolve=>setImmediate(resolve));});
  const beforeRetire=api.length;await page.evaluate(()=>window.questMessageActionsQa.providerChanged());held.resolve();await bounded(()=>Promise.allSettled([...pending]));await settle();
  assert.equal(api.length,beforeRetire);assert.equal(await page.locator('#circle-safety-message').innerText(),'');assert.equal(await page.locator('#circle-safety-note').inputValue(),'');assert.equal(await page.locator('#circle-safety').isVisible(),false);
  await reset('reporter');await archive();await openActions();await reportDraft('PRIVATE_QUEST_SAFETY_NOTE: committed reply retired by SDK logout.','inappropriate');
  const beforeHeld=await f.counts();holdKind='action';held=null;await page.locator('#circle-safety-report').click({noWaitAfter:true});await bounded(async()=>{while(!held)await new Promise(resolve=>setImmediate(resolve));});assert.equal((await f.counts()).reports,beforeHeld.reports+1);
  const beforeLogout=api.length;await page.evaluate(()=>window.questMessageActionsQa.emit('SIGNED_OUT'));assert.equal(await page.locator('#circle-safety-message').innerText(),'');held.resolve();await bounded(()=>Promise.allSettled([...pending]));await settle();
  assert.equal(api.length,beforeLogout);assert.equal(await page.locator('#circle-safety').isVisible(),false);assert.equal(await page.locator('#circle-safety-confirm').isChecked(),false);assert.doesNotMatch(await page.locator('body').innerText(),/PRIVATE_QUEST_SAFETY_NOTE/);
  pass('held actual checked-state and committed-action replies cannot restore private message/note/receipt after provider change or SDK logout, with no automatic recovery');

  await f.hide();await reset('author');await archive();await f.leave('author');await openActions();
  assert.equal(latestState.message.is_mine,true);assert.equal(latestState.message.visibility,'hidden');assert.equal(latestState.message.content,null);assert.equal(latestState.canWithdraw,true);assert.equal(latestState.canReport,false);
  assert.match(await page.locator('#circle-safety-privacy').innerText(),/not physical erasure/);assert.match(await page.locator('#circle-safety-privacy').innerText(),/retention policy is not yet finalized/);
  assert.match(await page.locator('#circle-safety-explanations').innerText(),/author-facing explanation/);
  assert.equal(await page.locator('#circle-safety-withdraw').isDisabled(),true);await page.locator('#circle-safety-confirm').focus();await page.locator('#circle-safety-confirm').press('Space');
  const beforeWithdrawal=await f.counts();dropNextPost=true;await page.locator('#circle-safety-withdraw').click();await unknown();const withdrawal=actions().at(-1);
  assert.equal((await f.counts()).receipts,beforeWithdrawal.receipts+1);assert.equal((await f.state('author')).message.visibility,'withdrawn');
  await page.locator('#circle-safety-refresh').click();await page.waitForFunction(()=>document.getElementById('circle-safety-status').textContent.includes('does not confirm the earlier action'));assert.equal(latestState.message.visibility,'withdrawn');assert.equal(await page.locator('#circle-safety-retry').isVisible(),true);
  await page.locator('#circle-safety-retry').click();await confirmed();assert.equal(actions().at(-1).body,withdrawal.body);assert.equal(latestReceipt.replayed,true);assert.equal(latestReceipt.withdrawn,true);assert.equal((await f.counts()).receipts,beforeWithdrawal.receipts+1);assert.match(await page.locator('#circle-safety-message').innerText(),/This contribution was withdrawn/);
  pass('an author can freshly check a hidden contribution after leaving and explicitly withdraw it; lost reply/current tombstone GET stays unknown until exact real SQL replay');

  await reset('reporter');await archive();assert.equal(latest.items[0].visibility,'withdrawn');assert.equal(latest.items[0].content,null);await openActions();assert.equal(latestState.message.visibility,'withdrawn');assert.equal(latestState.canReport,false);assert.equal(latestState.canWithdraw,false);assert.equal(latestState.explanations.length,0);
  assert.equal(await page.locator('#circle-safety-report').isVisible(),false);assert.equal(await page.locator('#circle-safety-withdraw').isVisible(),false);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  for(const control of await page.locator('#circle-safety button:visible').all())assert.ok((await control.boundingBox()).height>=44);
  await page.screenshot({path:path.join(ROOT,'platforms/evidence/quest-message-actions-composed-320.png'),fullPage:true});
  assert.ok(api.every(x=>!x.path.includes('ai-consent')&&!x.path.includes('/advice')));
  pass('another member reads the actual withdrawal tombstone with no author-only explanations or report notes;320px controls remain usable and no AI endpoint is invoked');
  const beforeUnmount=api.length;await page.evaluate(()=>window.questMessageActionsQa.unmount());await settle();assert.equal((await count()).subscriptions,0);assert.equal(api.length,beforeUnmount);assert.equal(await page.locator('[data-quest-member-view]').count(),0);
  pass('unmount disposes safety/keyed view and SDK observation without a late private request');
  cleanErrors();
  for (const [file, digest] of Object.entries({ ...sourceHashes, ...sqlHashes })) assert.equal(sha(read(file)), digest, 'Source changed during composition: ' + file);
} catch (error) { failure = error.stack || String(error); }
finally {
  write(failure ? 'FAIL' : 'CLEANING_UP');
  for (const controller of controllers.values()) controller.abort(); for (const release of releases) release();
  try { await bounded(() => Promise.allSettled([...pending]), 5000, 'Owned route cleanup'); } catch (error) { failure ??= error.stack || String(error); }
  try { if (browser) await bounded(() => browser.close(), 5000, 'Owned browser cleanup'); cleanup.browser = browser ? 'closed' : 'not-created'; }
  catch (error) { cleanup.browser = 'failed'; failure ??= error.stack || String(error); try { signalOwnedChrome('SIGTERM'); if (ownedChrome().includes(ownedBrowserPid)) signalOwnedChrome('SIGKILL'); } catch {} }
  try { if (f) await bounded(() => f.close(), 5000, 'Owned DB cleanup'); cleanup.database = f ? 'closed' : 'not-created'; } catch (error) { cleanup.database = 'failed'; failure ??= error.stack || String(error); }
  try { cleanErrors(); } catch (error) { failure ??= error.stack || String(error); }
  write(failure ? 'FAIL' : 'PASS');
}
if (failure) throw Error(failure);
console.log('PASS Quest message-actions composed Chromium: ' + stories.length + ' stories, ' + api.length + ' actual handler requests; owned browser/database closed.');
