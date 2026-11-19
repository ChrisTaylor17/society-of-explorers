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
const output = path.join(ROOT, 'platforms/evidence/quest-contributions-composed.json');
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
  scope: 'Actual QuestCircle/React/auth bridge/generated Quest host/view and actual Bun CSS modules, actual auth/member + own-contributions GET + message-state/withdrawal handlers and current strict SQL in disposable PGlite. Explicit synthetic identity/SDK events/nonissued credentials and narrow PostgREST/NextResponse/NextLink ports; virtual HTTPS entirely intercepted. No real provider/cookie verification, SDK auth network, hosted database, multi-backend scheduling, native bridge, Quest headset or immersive acceptance. Prior Quest7/archive/keyed-write proof sources and outputs untouched. No native/headset or real auth verification claim.' });
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
  const manifest = JSON.parse(read('platforms/evidence/quest-contributions-composed-fixture/source-manifest.json'));
  const shared=JSON.parse(read('platforms/evidence/shared-build.json'));
  assert.equal(shared.exitCode,0,'Shared source build must have succeeded');
  assert.equal(shared.outputSHA256,sha(read('platforms/quest/circle-host.mjs')),'Generated host must match the successful shared build');
  const sharedManifest=JSON.parse(read('platforms/evidence/shared-source-manifest.json'));
  assert.deepEqual(shared.sourceHashes,sharedManifest.sourceHashes,'Shared build and source manifest must agree');
  sourceHashes = { ...manifest.sourceHashes, ...shared.sourceHashes,
    'platforms/evidence/shared-build.json':sha(read('platforms/evidence/shared-build.json')),
    'platforms/evidence/shared-source-manifest.json':sha(read('platforms/evidence/shared-source-manifest.json')) };
  const files = ['platforms/tests/bundle-quest-contributions-composed.mjs', 'platforms/tests/browser-quest-contributions-composed.mjs',
    'verification/web/tests/support/member-contributions-app.mjs', 'verification/web/tests/support/offline-app.mjs', 'tests/security/fakes.ts',
    'app/api/auth/member/route.ts', 'lib/auth/memberDto.ts', 'lib/auth/provider.ts', 'lib/http/routeError.ts',
    'app/api/circles/contributions/route.ts','app/quest/contributions/page.tsx','app/quest/page.tsx', 'app/api/circles/[circleId]/messages/[messageId]/route.ts','lib/circles/message-moderation.ts','lib/circles/message-moderation-server.ts', 'lib/circles/thread-server.ts', 'lib/circles/thread.ts', 'lib/circles/moderation-server.ts',
    'lib/rateLimit.ts'];
  for (const file of files) sourceHashes[file] = sha(read(file));
  for (const [file, digest] of Object.entries(sourceHashes)) assert.equal(sha(read(file)), digest, 'Changed bundle source: ' + file);
  bundle = read('platforms/evidence/quest-contributions-composed-fixture/page.js'); css = read('platforms/evidence/quest-contributions-composed-fixture/page.css');
  const fixtureModule = await import('../../verification/web/tests/support/member-contributions-app.mjs');
  for (const [file, digest] of Object.entries(fixtureModule.COVERAGE_SOURCE_HASHES)) (file.endsWith('.sql') ? sqlHashes : sourceHashes)[file] = digest;
  Object.assign(sourceHashes, await fixtureModule.contributionAppHashes()); limits = fixtureModule.COVERAGE_FIXTURE_LIMITS; f = await fixtureModule.createMemberContributionsApp({ profileAware: true });
  Object.assign(sourceHashes, await (await import('../../verification/web/tests/support/public-profile-app.mjs')).publicProfileAppHashes());
  const secondCircle=await f.addCircle();
  for(let i=0;i<26;i++)await f.post({circleId:i%2?f.circleId:secondCircle,content:'Owned synthetic contribution '+i});
  await f.post({who:'other',content:'PRIVATE_OTHER_MEMBER_BODY'});
  await f.hide();await f.leave();await f.leave('author',secondCircle);await f.quarantine();await f.quarantine(secondCircle);
  const origin = fixtureModule.ORIGIN;
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
      else { assert.ok(url.pathname==='/api/circles/contributions'||/^\/api\/circles\/[0-9a-f-]+\/messages\/[0-9a-f-]+$/.test(url.pathname)); assert.ok(Object.values(fixtureModule.TOKENS).some(value => headers.authorization === 'Bearer ' + value)); }
      if(request.method()==='POST')assert.equal(headers.origin,origin,'Browser mutation origin must match actual route origin');
      controller = new AbortController(); controllers.set(request, controller);
      const entry = { method: request.method(), path: url.pathname, queryKeys: [...url.searchParams.keys()].sort(), status: null, delivered: false, kind: null, itemCount: null }; api.push(entry);
      const work = (async () => {
        const response = await f.dispatch(url.pathname + url.search, {method:request.method(),headers,body:request.postData()??undefined,signal:controller.signal});
        assert.match(response.headers.get('cache-control'), /private.*no-store/); entry.status = response.status;
        const bytes = await response.text(), value = JSON.parse(bytes); entry.kind = value.kind ?? (value.state?'receipt':value.message&&typeof value.message==='object'?'state':'member'); entry.itemCount = value.items?.length ?? null;
        if (value.items) {
          latest=value;
          assert.doesNotMatch(bytes,/PRIVATE_OTHER_MEMBER_BODY|PRIVATE_SYNTHETIC_REPORT_NOTE|reporter|email|supabase_auth_id/);
          for(const item of value.items){assert.equal(item.message.is_mine,true);if(item.message.visibility!=='visible')assert.equal(item.message.content,null);}
        }
        if(request.method()==='GET'&&url.pathname.includes('/messages/')&&response.status===200)latestState=value;
        if(request.method()==='POST'&&url.pathname.includes('/messages/')&&response.status===200)latestReceipt=value;
        if(dropNextPost&&request.method()==='POST'&&url.pathname.includes('/messages/')){dropNextPost=false;entry.droppedAfterCommit=true;await route.abort('failed');return;}
        const kind=url.pathname.includes('/messages/')?(request.method()==='POST'?'action':'state'):value.items?'list':'member';
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
  const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const count=()=>page.evaluate(()=>window.questContributionsQa.counts());
  const lists=()=>f.http.filter(x=>x.path.startsWith('/api/circles/contributions'));
  const actions=()=>f.http.filter(x=>x.method==='POST');
  const stateReads=()=>f.http.filter(x=>x.method==='GET'&&x.path.includes('/messages/'));
  async function connect(){await page.getByRole('button',{name:'Connect signed-in account',exact:true}).click();await page.waitForFunction(()=>!document.getElementById('member-session-check').disabled);}
  async function check(){await page.locator('#member-session-check').click();}
  async function ready(){await page.waitForFunction(()=>!document.getElementById('member-contributions-refresh').disabled);}
  async function reset(actor='author',provider='supabase',sdkActor=actor){await page.evaluate(()=>window.questContributionsQa.providerChanged());f.select(actor,provider);await page.evaluate(who=>window.questContributionsQa.actor(who),sdkActor);await settle();await connect();await check();}
  async function load(){await ready();await page.locator('#member-contributions-refresh').click();await page.waitForFunction(()=>document.getElementById('member-contributions-status').textContent.includes('shown below'));}
  async function select(id){await page.locator('[data-contribution-id="'+id+'"]').getByRole('button',{name:'Check my contribution',exact:true}).click();await page.waitForFunction(()=>document.getElementById('member-contributions-action-status').textContent.includes('Current message loaded'));}
  async function findOwn(id){await load();if(!latest.items.some(x=>x.message.id===id)){await page.locator('#member-contributions-next').click();await page.waitForFunction(()=>document.getElementById('member-contributions-status').textContent.includes('shown below'));}assert.ok(latest.items.some(x=>x.message.id===id));}
  const unknown=()=>page.waitForFunction(()=>!document.getElementById('member-contributions-retry').hidden);
  const confirmed=()=>page.waitForFunction(()=>document.getElementById('member-contributions-action-status').textContent.includes('Withdrawal confirmed'));
  await page.goto(origin);await page.bringToFront();await page.getByRole('button',{name:'Connect signed-in account',exact:true}).waitFor();await settle();
  assert.deepEqual(await page.evaluate(()=>window.questContributionsQa.markupContract()),{complete:true,legacy:true,partial:true,duplicates:true});
  assert.match(await page.locator('h1').innerText(),/My Quest Browser contributions/);assert.equal(await page.locator('#circle-refresh').count(),0);
  assert.deepEqual(await count(),{factories:0,calls:0,subscriptions:0});assert.equal(api.length,0);await connect();assert.equal((await count()).calls,0);assert.equal(api.length,0);await check();await ready();assert.equal(lists().length,0);
  await reset('other','supabase','author');await page.waitForFunction(()=>document.getElementById('member-session-status').textContent.includes('Could not confirm'));assert.equal(lists().length,0);assert.equal(await page.locator('#member-contributions-refresh').isDisabled(),true);
  pass('standalone account entry needs no Circle ID or membership; markup preflight, zero automatic SDK/API work and selected-account mismatch refusal hold');

  await reset();await load();assert.equal(latest.items.length,25);assert.equal(stateReads().length,0);assert.equal(actions().length,0);
  const firstIds=latest.items.map(x=>x.message.id),circles=new Set(latest.items.map(x=>x.circleId));
  await page.locator('#member-contributions-next').click();await page.waitForFunction(()=>document.getElementById('member-contributions-status').textContent.includes('shown below'));assert.equal(latest.items.length,2);
  for(const item of latest.items){assert.equal(firstIds.includes(item.message.id),false);circles.add(item.circleId);}
  assert.equal(circles.size,2);assert.equal(await page.locator('[data-contribution-id]').count(),2);assert.ok(lists().at(-1).path.includes('?after='));
  assert.doesNotMatch(await page.locator('body').innerText(),/PRIVATE_OTHER_MEMBER_BODY|PRIVATE_SYNTHETIC_REPORT_NOTE|PRIVATE_AUTHOR_LABEL/);
  pass('actual own-only SQL returns replacement pages across two left and quarantined Circles, beyond the first25, without Circle lookup or automatic message-state reads');

  await findOwn(f.messageId);const beforeSelect=stateReads().length;await select(f.messageId);assert.equal(stateReads().length,beforeSelect+1);assert.equal(await page.locator('[data-contribution-id]').count(),0);
  assert.equal(latestState.message.is_mine,true);assert.equal(latestState.message.visibility,'hidden');assert.equal(latestState.message.content,null);assert.equal(latestState.canWithdraw,true);
  assert.match(await page.locator('#member-contributions-explanations').innerText(),/author-facing explanation/);assert.match(await page.locator('#member-contributions-privacy').innerText(),/not physical erasure/);
  assert.equal(await page.locator('#member-contributions-withdraw').isDisabled(),true);await page.locator('#member-contributions-confirm').focus();await page.locator('#member-contributions-confirm').press('Space');
  const beforeLost=await f.counts();dropNextPost=true;await page.locator('#member-contributions-withdraw').click();await unknown();const sent=actions().at(-1);
  assert.equal((await f.counts()).receipts,beforeLost.receipts+1);assert.equal((await f.state()).message.visibility,'withdrawn');assert.equal(await page.locator('#member-contributions-back').isDisabled(),true);
  assert.equal(await page.locator('#member-contributions-return').isDisabled(),true);assert.equal(await page.locator('#member-contributions-refresh').isDisabled(),true);
  const idleCalls=api.length;await settle();assert.equal(api.length,idleCalls);await page.locator('#member-contributions-check').click();await page.waitForFunction(()=>document.getElementById('member-contributions-action-status').textContent.includes('does not confirm the earlier action'));
  assert.equal(latestState.message.visibility,'withdrawn');assert.equal(actions().length,1);await page.locator('#member-contributions-retry').click();await confirmed();assert.equal(actions().at(-1).body,sent.body);assert.equal(latestReceipt.replayed,true);assert.equal(latestReceipt.withdrawn,true);assert.equal((await f.counts()).receipts,beforeLost.receipts+1);
  pass('fresh hidden-author permissions allow explicit withdrawal after leave/quarantine; lost committed reply locks navigation and only exact manual SQL replay confirms');

  await page.locator('#member-contributions-back').click();await load();const nextOwn=latest.items.find(x=>x.message.visibility==='visible');assert.ok(nextOwn);await select(nextOwn.message.id);await page.locator('#member-contributions-confirm').check();
  await f.hide({circleId:nextOwn.circleId,messageId:nextOwn.message.id});const beforeStale=await f.counts();await page.locator('#member-contributions-withdraw').click();await unknown();assert.equal(f.calls.at(-1).status,'PT409');assert.deepEqual(await f.counts(),beforeStale);
  assert.equal(await page.locator('#member-contributions-back').isDisabled(),true);const beforeState=actions().length;await page.locator('#member-contributions-check').click();await page.waitForFunction(()=>document.getElementById('member-contributions-action-status').textContent.includes('does not confirm the earlier action'));assert.equal(actions().length,beforeState);
  pass('a real intervening review makes the checked revision stale; fresh state does not replace the pending withdrawal or manufacture confirmation');

  await reset();await ready();holdKind='list';held=null;await page.locator('#member-contributions-refresh').click({noWaitAfter:true});await bounded(async()=>{while(!held)await new Promise(resolve=>setImmediate(resolve));});
  const heldListCalls=api.length;await page.evaluate(()=>window.questContributionsQa.providerChanged());held.resolve();await bounded(()=>Promise.allSettled([...pending]));await settle();assert.equal(api.length,heldListCalls);assert.equal(await page.locator('[data-contribution-id]').count(),0);
  await reset();await load();const chosen=latest.items.find(x=>x.message.visibility==='visible');holdKind='state';held=null;await page.locator('[data-contribution-id="'+chosen.message.id+'"]').getByRole('button',{name:'Check my contribution'}).click({noWaitAfter:true});await bounded(async()=>{while(!held)await new Promise(resolve=>setImmediate(resolve));});
  const heldStateCalls=api.length;await page.evaluate(()=>window.dispatchEvent(new Event('blur')));held.resolve();await bounded(()=>Promise.allSettled([...pending]));await settle();assert.equal(api.length,heldStateCalls);assert.equal(await page.locator('#member-contributions-message').innerText(),'');assert.equal(await page.locator('#member-contributions-selected').isVisible(),false);
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await settle();assert.equal(api.length,heldStateCalls);
  pass('held actual list and selected-state replies cannot restore private content after account replacement or blur, and focus alone makes no request');

  await reset();await load();const pendingOwn=latest.items.find(x=>x.message.visibility==='visible');await select(pendingOwn.message.id);await page.locator('#member-contributions-confirm').check();const beforeHeld=await f.counts();holdKind='action';held=null;await page.locator('#member-contributions-withdraw').click({noWaitAfter:true});await bounded(async()=>{while(!held)await new Promise(resolve=>setImmediate(resolve));});assert.equal((await f.counts()).receipts,beforeHeld.receipts+1);
  const heldActionCalls=api.length;await page.evaluate(()=>window.questContributionsQa.emit('SIGNED_OUT'));held.resolve();await bounded(()=>Promise.allSettled([...pending]));await settle();assert.equal(api.length,heldActionCalls);assert.equal(await page.locator('#member-contributions-message').innerText(),'');assert.equal(await page.locator('#member-contributions-confirm').isChecked(),false);
  pass('a committed held withdrawal cannot restore message or receipt after SDK logout; the private retry details retire without an automatic request');

  await reset();await load();await page.evaluate(()=>window.dispatchEvent(new Event('offline')));await settle();assert.equal(await page.locator('[data-contribution-id]').count(),0);const offlineCalls=api.length;await page.evaluate(()=>window.dispatchEvent(new Event('online')));await settle();assert.equal(api.length,offlineCalls);
  await page.evaluate(()=>window.questContributionsQa.mode(document.documentElement.dataset.circle));await settle();await connect();await check();await page.waitForFunction(()=>!document.getElementById('member-contributions-open').disabled);const beforeOpen=api.length;
  await page.locator('#member-contributions-open').click();assert.equal(api.length,beforeOpen);assert.equal(await page.locator('#member-circle-workspace').isVisible(),false);await load();assert.equal(await page.locator('[data-contribution-id]').count(),25);const beforeReturn=api.length;await page.locator('#member-contributions-return').click();assert.equal(api.length,beforeReturn);assert.equal(await page.locator('[data-contribution-id]').count(),0);assert.equal(await page.locator('#member-circle-workspace').isVisible(),true);
  pass('offline retirement and embedded account-level navigation clear history; reconnect/open/return do not fetch Circle metadata or private content automatically');

  await page.locator('#member-contributions-open').click();await load();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);for(const control of await page.locator('#member-contributions button:visible').all())assert.ok((await control.boundingBox()).height>=44);
  await page.screenshot({path:path.join(ROOT,'platforms/evidence/quest-contributions-composed-320.png'),fullPage:true});assert.ok(api.every(x=>!x.path.includes('ai-consent')&&!x.path.includes('/advice')));
  const beforeUnmount=api.length;await page.evaluate(()=>window.questContributionsQa.unmount());await settle();assert.equal((await count()).subscriptions,0);assert.equal(api.length,beforeUnmount);assert.equal(await page.locator('[data-quest-member-view]').count(),0);
  pass('320px real CSS controls remain usable; no AI route is called; unmount disposes all account/history observers without a late private request');
  cleanErrors();for(const [file,digest]of Object.entries({...sourceHashes,...sqlHashes}))assert.equal(sha(read(file)),digest,'Source changed during composition: '+file);
} catch(error){failure=error.stack||String(error);}
finally {
  write(failure?'FAIL':'CLEANING_UP');for(const controller of controllers.values())controller.abort();for(const release of releases)release();
  try{await bounded(()=>Promise.allSettled([...pending]),5000,'Owned route cleanup');}catch(error){failure??=error.stack||String(error);}
  try{if(browser)await bounded(()=>browser.close(),5000,'Owned browser cleanup');cleanup.browser=browser?'closed':'not-created';}catch(error){cleanup.browser='failed';failure??=error.stack||String(error);try{signalOwnedChrome('SIGTERM');if(ownedChrome().includes(ownedBrowserPid))signalOwnedChrome('SIGKILL');}catch{}}
  try{if(f)await bounded(()=>f.close(),5000,'Owned DB cleanup');cleanup.database=f?'closed':'not-created';}catch(error){cleanup.database='failed';failure??=error.stack||String(error);}
  try{cleanErrors();}catch(error){failure??=error.stack||String(error);}write(failure?'FAIL':'PASS');
}
if(failure)throw Error(failure);console.log('PASS Quest contributions composed Chromium: '+stories.length+' stories, '+api.length+' actual handler requests; owned browser/database closed.');
