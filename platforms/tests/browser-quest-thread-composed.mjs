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
const output = path.join(ROOT, 'platforms/evidence/quest-thread-composed.json');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function read(name) { const file = path.isAbsolute(name) ? name : path.join(ROOT, name), stat = fs.statSync(file), link=fs.lstatSync(file); assert.ok(stat.isFile()&&!link.isSymbolicLink(),'Refuse non-file/symlink source: '+name); assert.ok(stat.blocks, 'Refuse offloaded file: ' + name); return fs.readFileSync(file); }
async function bounded(work, ms = 5000, label = 'Owned operation') { let timer; try { return await Promise.race([Promise.resolve().then(work), new Promise((_, reject) => { timer = setTimeout(() => reject(Error(label + ' timed out')), ms); })]); } finally { clearTimeout(timer); } }
const gate = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const stories = [], api = [], pageErrors = [], consoleErrors = [], unexpected = [], routeErrors = [], retiredRoutes = [];
const cleanup = { browser: 'pending', database: 'pending' }, pending = new Set(), controllers = new Map(), releases = new Set();
const startedAt = new Date().toISOString(), executablePath = process.env.SOE_BROWSER_EXECUTABLE;
const priorReceipt = fs.existsSync(output) ? (() => { const bytes = read(output); return { sha256: sha(bytes), receipt: JSON.parse(bytes) }; })() : null;
let browser, ownedBrowserPid, f, failure = null, bundle, css, sourceHashes = {}, sqlHashes = {}, limits = {}, runtime = {}, latest = null;
let holdKind = null, held = null, dropNextPost = false, latestPreview = null, latestReceipt = null;
const report = status => ({ version: 1, status, startedAt, finishedAt: new Date().toISOString(), stories, api, pageErrors, consoleErrors, unexpected, routeErrors, retiredRoutes,
  cleanup, runtime, sourceHashes, sqlHashes, bundleSHA256: bundle ? sha(bundle) : null, cssSHA256: css ? sha(css) : null, limits, failure, priorReceipt,
  scope: 'Actual QuestCircle/React/auth bridge/generated Quest host/view and actual Bun CSS modules, actual auth/member + discussion preview/POST/receipt/archive/thread handlers and current strict SQL in disposable PGlite. Explicit synthetic identity/SDK events/nonissued credentials and narrow PostgREST/NextResponse/NextLink ports; virtual HTTPS entirely intercepted. No real provider/cookie verification, SDK auth network, hosted database, multi-backend scheduling, native bridge, Quest headset or immersive acceptance. Prior Quest7 and eight-story archive proof sources/outputs untouched. No native/headset or real auth verification claim.' });
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
  const manifest = JSON.parse(read('platforms/evidence/quest-thread-composed-fixture/source-manifest.json'));
  const shared=JSON.parse(read('platforms/evidence/shared-build.json'));
  assert.equal(shared.exitCode,0,'Shared source build must have succeeded');
  assert.equal(shared.outputSHA256,sha(read('platforms/quest/circle-host.mjs')),'Generated host must match the successful shared build');
  const sharedManifest=JSON.parse(read('platforms/evidence/shared-source-manifest.json'));
  assert.deepEqual(shared.sourceHashes,sharedManifest.sourceHashes,'Shared build and source manifest must agree');
  sourceHashes = { ...manifest.sourceHashes, ...shared.sourceHashes,
    'platforms/evidence/shared-build.json':sha(read('platforms/evidence/shared-build.json')),
    'platforms/evidence/shared-source-manifest.json':sha(read('platforms/evidence/shared-source-manifest.json')) };
  const files = ['platforms/tests/bundle-quest-thread-composed.mjs', 'platforms/tests/browser-quest-thread-composed.mjs',
    'verification/web/tests/support/platforms-thread-app.mjs', 'verification/web/tests/support/offline-app.mjs', 'tests/security/fakes.ts',
    'app/api/auth/member/route.ts', 'lib/auth/memberDto.ts', 'lib/auth/provider.ts', 'lib/http/routeError.ts',
    'app/api/circles/[circleId]/discussion/route.ts', 'app/api/circles/[circleId]/discussion/preview/route.ts', 'lib/circles/thread-server.ts', 'lib/circles/thread.ts', 'lib/circles/moderation-server.ts',
    'lib/rateLimit.ts'];
  for (const file of files) sourceHashes[file] = sha(read(file));
  for (const [file, digest] of Object.entries(sourceHashes)) assert.equal(sha(read(file)), digest, 'Changed bundle source: ' + file);
  bundle = read('platforms/evidence/quest-thread-composed-fixture/page.js'); css = read('platforms/evidence/quest-thread-composed-fixture/page.css');
  const module = await import('../../verification/web/tests/support/platforms-thread-app.mjs');
  for (const [file, digest] of Object.entries(module.COVERAGE_SOURCE_HASHES)) (file.endsWith('.sql') ? sqlHashes : sourceHashes)[file] = digest;
  Object.assign(sourceHashes, await module.threadAppHashes()); limits = module.COVERAGE_FIXTURE_LIMITS; f = await module.createPlatformsThreadApp({ profileAware: true });
  Object.assign(sourceHashes, await (await import('../../verification/web/tests/support/public-profile-app.mjs')).publicProfileAppHashes());
  const origin = module.ORIGIN;
  browser = await require('playwright').chromium.launch({ headless: true, timeout: 15000, executablePath,
    env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' }, args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'] });
  const pids = ownedChrome(); assert.equal(pids.length, 1); ownedBrowserPid = pids[0];
  runtime = { node: process.version, chromium: browser.version(), bun: manifest.bunVersion, startupDeny: true, cleanEnvironment: true, ownedBrowserPid };
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } }), page = await context.newPage(); page.setDefaultTimeout(7000);
  const intent = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  await context.addCookies([{ url: origin, name: 'soe_auth_intent', value: intent, secure: true, sameSite: 'Lax' }]);
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
      const headers = await request.allHeaders();
      assert.equal(headers.cookie, 'soe_auth_intent=' + intent);
      assert.equal(headers['x-soe-auth-intent'], intent);
      assert.equal(headers.referer, undefined);
      if (url.pathname === '/api/auth/member') assert.equal(headers.authorization, undefined);
      else { assert.ok([`/api/circles/${f.circleId}/discussion`,`/api/circles/${f.circleId}/discussion/preview`].includes(url.pathname)); assert.ok(Object.values(module.TOKENS).some(value => headers.authorization === 'Bearer ' + value)); }
      if(request.method()==='POST')assert.equal(headers.origin,origin,'Browser mutation origin must match actual route origin');
      controller = new AbortController(); controllers.set(request, controller);
      const entry = { method: request.method(), path: url.pathname, queryKeys: [...url.searchParams.keys()].sort(), status: null, delivered: false, kind: null, itemCount: null }; api.push(entry);
      const work = (async () => {
        const response = await f.dispatch(url.pathname + url.search, {method:request.method(),headers,body:request.postData()??undefined,signal:controller.signal});
        assert.match(response.headers.get('cache-control'), /private.*no-store/); entry.status = response.status;
        const bytes = await response.text(), value = JSON.parse(bytes); entry.kind = value.kind ?? 'member'; entry.itemCount = value.items?.length ?? null;
        if (value.items) {
          latest = value;
          assert.doesNotMatch(bytes, /PRIVATE_SYNTHETIC_REPORT_NOTE|contentHash|reporter|email|supabase_auth_id/);
          for (const item of [...value.items, ...(value.root ? [value.root, value.focus] : [])]) {
            assert.deepEqual(Object.keys(item).sort(), ['id', 'member_name', 'content', 'created_at', 'is_mine', 'visibility', 'parentMessageId', 'rootMessageId', 'publicProfileId'].sort());
            if (['hidden', 'withdrawn'].includes(item.visibility)) assert.equal(item.content, null);
          }
        }
        if(url.pathname.endsWith('/preview')&&response.status===200)latestPreview=value;
        if(request.method()==='POST'&&!url.pathname.endsWith('/preview')&&response.status===200)latestReceipt=value;
        if(dropNextPost&&request.method()==='POST'&&!url.pathname.endsWith('/preview')){dropNextPost=false;entry.droppedAfterCommit=true;await route.abort('failed');return;}
        const kind=url.pathname.endsWith('/preview')?'preview':request.method()==='POST'?'post':value.items?'read':'member';
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
  const count = () => page.evaluate(() => window.questThreadQa.counts());
  const privateCalls = () => f.calls.length;
  const connect = async () => { await page.getByRole('button', { name: 'Connect signed-in account', exact: true }).click(); await page.waitForFunction(() => !document.getElementById('member-session-check').disabled); };
  const check = async () => { await page.locator('#member-session-check').click(); };
  const ready = () => page.waitForFunction(() => !document.getElementById('circle-archive-open').disabled);
  async function reset(actor = 'author', provider = 'supabase', sdkActor = actor) {
    await page.evaluate(() => window.questThreadQa.providerChanged()); f.select(actor, provider);
    await page.evaluate(value => window.questThreadQa.actor(value), sdkActor); await settle();
    await connect(); await check();
  }
  await page.goto(origin); await page.bringToFront(); await page.getByRole('button', { name: 'Connect signed-in account', exact: true }).waitFor(); await settle();
  assert.deepEqual(await count(), {factories:0,calls:0,subscriptions:0});assert.equal(api.length,0);assert.equal(privateCalls(),0);
  await connect();assert.equal(api.length,0);assert.equal((await count()).calls,0);
  await check();await ready();assert.equal(api.length,1);assert.equal(privateCalls(),0);
  await reset('outsider','supabase','author');await page.waitForFunction(()=>document.getElementById('member-session-status').textContent.includes('Could not confirm'));
  assert.equal(privateCalls(),0);assert.equal(await page.locator('#circle-archive-open').isDisabled(),true);
  pass('initial mount/Connect perform no SDK methods or private request; actual member-handler provider/subject mismatch blocks every private RPC');

  async function archive(){await ready();await page.locator('#circle-archive-open').click();await page.waitForFunction(()=>document.getElementById('circle-archive-status').textContent.includes('Current archive page loaded'));}
  const status=()=>page.locator('#circle-thread-status').innerText();
  const posts=()=>f.http.filter(x=>x.method==='POST'&&x.path===`/api/circles/${f.circleId}/discussion`);
  async function review(comment,parent=null){
    if(parent)await page.locator(`[data-message-id="${parent}"]`).getByRole('button',{name:'Reply to this message',exact:true}).click();
    else await page.locator('#circle-thread-new').click();
    await page.locator('#circle-thread-draft').fill(comment);await page.locator('#circle-thread-review').click();
    await page.waitForFunction(()=>!document.getElementById('circle-thread-preview').hidden);
    assert.equal(await page.locator('#circle-thread-post').isDisabled(),true);
    assert.equal(latestPreview.comment,comment);assert.equal(latestPreview.parentMessageId,parent);
    assert.ok((await page.locator('#circle-thread-confirm').locator('..').boundingBox()).height>=44);
    await page.locator('#circle-thread-confirm').focus();await page.locator('#circle-thread-confirm').press('Space');assert.equal(await page.locator('#circle-thread-post').isDisabled(),false);
  }
  const confirmed=()=>page.waitForFunction(()=>!document.getElementById('circle-thread-saved').hidden);
  const unknown=()=>page.waitForFunction(()=>!document.getElementById('circle-thread-check').hidden);
  async function openSaved(){await page.locator('#circle-thread-saved').click();await page.waitForFunction(()=>document.getElementById('circle-archive-status').textContent.includes('Current thread loaded'));}

  await reset();await archive();const baseline=await f.count();
  await page.locator('#circle-thread-new').click();const beforeRejectedDraft=api.length;
  await page.evaluate(()=>{const input=document.getElementById('circle-thread-draft');input.value='Rejected'+String.fromCharCode(7);input.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await page.locator('#circle-thread-draft').inputValue(),'','Rejected control text must not remain outside the actual model');assert.equal(api.length,beforeRejectedDraft);
  const rootComment='A careful question from Quest about the shared reading.';
  await review(rootComment);const rootPreview=structuredClone(latestPreview),beforePostRequests=api.length;
  assert.equal(await f.count(),baseline,'Preview cannot save a contribution');
  await page.locator('#circle-thread-post').click();await confirmed();
  assert.equal(await f.count(),baseline+1);assert.equal(latestReceipt.requestId,rootPreview.requestId);assert.equal(latestReceipt.message.content,rootComment);assert.equal(latestReceipt.replayed,false);
  const newRoot=latestReceipt.message.id;assert.equal(latestReceipt.message.parentMessageId,null);assert.equal(latestReceipt.message.rootMessageId,newRoot);
  assert.equal(api.length,beforePostRequests+2,'Explicit post performs one metadata check and one POST, with no automatic readback');
  await openSaved();assert.equal(latest.root.id,newRoot);assert.equal(latest.root.content,rootComment);assert.equal(await page.locator('#circle-read-status').textContent(),'');
  assert.ok((await f.messages()).some(row=>row.id===newRoot&&row.content===rootComment));
  pass('real Quest new-root preview/confirmation creates one strict-SQL receipt, then an explicit saved-thread GET proves the persisted content');

  const replyComment='I would distinguish the claim from its supporting evidence.';
  await review(replyComment,newRoot);const replyPreview=structuredClone(latestPreview);
  assert.ok(replyPreview.commentLimit<2000);assert.equal(await page.locator('#circle-thread-draft').getAttribute('maxlength'),String(replyPreview.commentLimit));
  assert.ok(replyPreview.content.startsWith(replyComment));assert.ok(replyPreview.content.includes(`/circles/${f.circleId}/discussion?message=${newRoot}`));
  assert.equal(await page.locator('#circle-thread-preview-parent').innerText(),rootComment);
  await page.locator('#circle-thread-post').click();await confirmed();const replyId=latestReceipt.message.id;
  assert.equal(latestReceipt.message.parentMessageId,newRoot);assert.equal(latestReceipt.message.rootMessageId,newRoot);assert.equal(latestReceipt.message.content,replyPreview.content);
  await openSaved();assert.equal(latest.root.id,newRoot);assert.equal(latest.focus.id,replyId);assert.equal(latest.items.find(x=>x.id===replyId).content,replyPreview.content);
  assert.equal(await page.locator(`[data-message-id="${replyId}"] a`).getAttribute('href'),`/circles/${f.circleId}/discussion?message=${replyId}`);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  for(const control of await page.locator('#circle-archive button:visible, #circle-archive a:visible').all())assert.ok((await control.boundingBox()).height>=44);
  await page.screenshot({path:path.join(ROOT,'platforms/evidence/quest-thread-composed-320.png'),fullPage:true});
  pass('real reply uses the verified root and server suffix/limit, strict SQL preserves canonical linkage, and explicit readback/safety links remain usable at320px');

  await archive();await review('A saved request whose first transport reply is deliberately lost.');
  const beforeLost=await f.count();dropNextPost=true;await page.locator('#circle-thread-post').click();await unknown();
  assert.equal(await f.count(),beforeLost+1);const lostId=latestReceipt.message.id,postCount=posts().length,requestsAtUnknown=api.length;
  assert.equal(await page.locator('#circle-archive-open').isDisabled(),true);assert.equal(await page.locator('#circle-thread-new').isDisabled(),true);
  assert.equal(await page.locator('#circle-thread-cancel').isDisabled(),true);assert.equal(await page.locator('#circle-post').isDisabled(),true);assert.equal(await page.locator('#circle-draft').isDisabled(),true);await settle();assert.equal(api.length,requestsAtUnknown);
  await f.withdraw(lostId);await page.locator('#circle-thread-check').click();await confirmed();
  assert.equal(posts().length,postCount);assert.equal(await f.count(),beforeLost+1);assert.match(await status(),/withdrawn/);
  await openSaved();assert.equal(latest.root.id,lostId);assert.equal(latest.root.visibility,'withdrawn');assert.equal(latest.root.content,null);
  assert.equal(await page.locator(`[data-message-id="${lostId}"]`).getByRole('button',{name:'Reply to this message',exact:true}).count(),0);
  assert.doesNotMatch(await page.locator('#circle-archive').innerText(),/A saved request whose first transport reply/);
  pass('lost committed POST stays unknown with navigation/new-key blocked; manual receipt lookup confirms its real withdrawn tombstone without reposting or reviving content');

  await archive();await review('Manual exact retry must recover the same committed request.');
  const beforeRetry=await f.count();dropNextPost=true;await page.locator('#circle-thread-post').click();await unknown();
  const first=posts().at(-1),retryMessage=latestReceipt.message.id;await page.locator('#circle-thread-retry').click();await confirmed();
  const second=posts().at(-1);assert.equal(second.body,first.body);assert.equal(JSON.parse(second.body).requestId,JSON.parse(first.body).requestId);
  assert.equal(latestReceipt.replayed,true);assert.equal(latestReceipt.message.id,retryMessage);assert.equal(await f.count(),beforeRetry+1);
  pass('manual retry reuses byte-identical body/request key and actual SQL replays one receipt without a second contribution');

  await archive();await review('This reply cannot use a parent that was restricted after preview.',newRoot);
  const beforeStale=await f.count();await f.hide(newRoot);await page.locator('#circle-thread-post').click();await unknown();
  assert.equal(await f.count(),beforeStale);assert.equal(f.calls.at(-1).status,'PT409');
  await page.locator('#circle-thread-check').click();await unknown();assert.match(await status(),/No receipt was found/);assert.equal(await f.count(),beforeStale);
  pass('human restriction after the exact preview makes actual post SQL reject stale parent evidence; missing receipt remains unknown rather than falsely unsaved');

  await reset();await archive();await page.locator('#circle-thread-new').click();await page.locator('#circle-thread-draft').fill('A held preview must never return after account retirement.');
  holdKind='preview';held=null;await page.locator('#circle-thread-review').click({noWaitAfter:true});await bounded(async()=>{while(!held)await new Promise(resolve=>setImmediate(resolve));});
  const beforeRetire=api.length,oldPosts=posts().length;assert.equal(await page.evaluate(()=>{window.questThreadQa.providerChanged();return document.getElementById('circle-thread-draft').value===''&&document.getElementById('circle-thread-preview-content').textContent==='';}),true);
  held.resolve();await bounded(()=>Promise.allSettled([...pending]));await settle();assert.equal(api.length,beforeRetire);assert.equal(posts().length,oldPosts);assert.equal(await page.locator('#circle-thread-preview-content').innerText(),'');
  await reset();await archive();await review('A held committed reply may save but cannot restore retired private UI.');
  const beforeHeldPost=await f.count();holdKind='post';held=null;await page.locator('#circle-thread-post').click({noWaitAfter:true});await bounded(async()=>{while(!held)await new Promise(resolve=>setImmediate(resolve));});
  assert.equal(await f.count(),beforeHeldPost+1);const beforeSignout=api.length;await page.evaluate(()=>window.questThreadQa.emit('SIGNED_OUT'));
  assert.equal(await page.locator('#circle-thread-draft').inputValue(),'');held.resolve();await bounded(()=>Promise.allSettled([...pending]));await settle();
  assert.equal(api.length,beforeSignout);assert.equal(await page.locator('#circle-archive-messages article').count(),0);assert.equal(await page.locator('#circle-thread-saved').isVisible(),false);
  assert.doesNotMatch(await page.locator('body').innerText(),/held committed reply may save|held preview must never return/);
  pass('held actual preview and committed-post replies cannot restore draft/preview/receipt after provider-change or SDK logout, and retirement causes no automatic recovery');

  const beforeUnmount=api.length;await page.evaluate(()=>window.questThreadQa.unmount());await settle();assert.equal((await count()).subscriptions,0);assert.equal(api.length,beforeUnmount);assert.equal(await page.locator('[data-quest-member-view]').count(),0);
  pass('actual component unmount disposes the keyed view and SDK observation without a late request');
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
console.log('PASS Quest keyed-thread composed Chromium: ' + stories.length + ' stories, ' + api.length + ' actual handler requests; owned browser/database closed.');
