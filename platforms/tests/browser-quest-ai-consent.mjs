// Actual Quest composition and canonical HTTP handlers/current SQL. Identity,
// selected-provider cookie, SDK events and delivery are explicit local doubles.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const ROOT=fileURLToPath(new URL('../../',import.meta.url)),origin='https://message-ai-fixture.test';
const sha=b=>createHash('sha256').update(b).digest('hex');
const read=n=>{const p=path.isAbsolute(n)?n:path.join(ROOT,n),s=fs.lstatSync(p);assert(s.isFile()&&!s.isSymbolicLink()&&(!s.size||s.blocks),n);return fs.readFileSync(p);};
const file='platforms/evidence/quest-ai-consent-browser.json';
const result={status:'RUNNING',startedAt:new Date().toISOString(),stories:[],http:[],errors:[],sourceHashes:{},runtimeHashes:{},evidenceHashes:{},cleanup:{browser:'pending',database:'pending'},
 scope:'Actual QuestCircle, member-auth bridge, generated shared host, DOM controls and CSS; actual canonical member DTO, contribution, message and consent handlers over current SQL in disposable PGlite. The member check uses actual getAuthenticatedMember, browser intent/selection matching and member SQL with synthetic provider SDK identities/cookies. Message/contribution server identity remains a lower-level actor double; these are not issued production sessions. Nonissued SDK credentials/events, PostgREST, Next transport/Link and HTTPS delivery are local doubles. Held writes deliberately outlive browser abort before SQL. No real authentication/provider network, production SQL, independent PostgreSQL sessions, native runtime, headset, immersive or release acceptance. Old callback defect was source-grounded, not reproduced on a baseline.'};
const hashes=result.sourceHashes,write=()=>fs.writeFileSync(path.join(ROOT,file),JSON.stringify(result,null,2)+'\n');
const pass=name=>{result.stories.push(name);write();console.log('PASS '+result.stories.length+': '+name);};
async function bounded(fn,ms=5000){let timer;try{return await Promise.race([fn(),new Promise((_,no)=>timer=setTimeout(()=>no(Error('Owned operation timed out')),ms))]);}finally{clearTimeout(timer);}}
let browser,page,f,held=null,holdNext=false,dropNext=false;const pending=new Set();
write();
try{
 assert(process.execArgv.some(v=>v.endsWith('/deny-build-network.cjs')));process.chdir(path.join(ROOT,'verification/web'));
 const manifest=JSON.parse(read('platforms/evidence/quest-ai-consent-fixture/source-manifest.json'));
 const shared=JSON.parse(read('platforms/evidence/shared-build.json'));assert.equal(shared.exitCode,0);assert.equal(shared.outputSHA256,sha(read('platforms/quest/circle-host.mjs')));
 Object.assign(hashes,manifest.sourceHashes,shared.sourceHashes);Object.assign(result.runtimeHashes,manifest.runtimeHashes);
 const bundle=read('platforms/evidence/quest-ai-consent-fixture/page.js'),css=read('platforms/evidence/quest-ai-consent-fixture/page.css');
 for(const n of ['page.js','page.css','source-manifest.json']){const name='platforms/evidence/quest-ai-consent-fixture/'+n;result.evidenceHashes[name]=sha(read(name));}
 for(const n of ['platforms/tests/browser-quest-ai-consent.mjs','platforms/tests/bundle-quest-ai-consent.mjs','verification/web/tests/support/current-message-ai-consent-app.mjs','verification/web/tests/support/offline-app.mjs','tests/security/fakes.ts','app/api/auth/member/route.ts','lib/auth/memberDto.ts','lib/auth/provider.ts','lib/http/routeError.ts'])hashes[n]=sha(read(n));
 const mod=await import('../../verification/web/tests/support/current-message-ai-consent-app.mjs');Object.assign(hashes,await mod.currentConsentSourceHashes());
 for(const[n,h]of Object.entries(hashes))assert.equal(sha(read(n)),h,'Stale source '+n);
 f=await mod.currentMessageAiApp({allowance:null});f.setAvailable(false);
 const second=await f.post({circleId:f.circleId,content:'A second owned contribution for selection retirement.'});
 const subjects=f.SUBJECTS,tokens=f.TOKENS;
 const actors={author:f.authorId,other:f.actors.other,outsider:f.actors.outsider??'73333333-3333-4333-8333-333333333333'};
 const messageRoute=f.app.load('app/api/circles/[circleId]/messages/[messageId]/route.ts'),consentRoute=f.app.load('app/api/circles/[circleId]/messages/[messageId]/ai-consent/route.ts');
 async function dispatch(url,method,headers,body){
  const who=Object.keys(tokens).find(who=>headers.authorization==='Bearer '+tokens[who]);
  if(url.pathname!=='/api/auth/member'){assert(who,'Missing synthetic exact bearer');f.setActor(actors[who]);}
  if(url.pathname==='/api/auth/member')return f.memberDispatch(url.pathname+url.search,{method,headers});
  const req=new Request(url,{method,headers,...(body==null?{}:{body})});Object.defineProperty(req,'cookies',{value:{get:name=>name==='soe_auth_provider'?{value:'supabase'}:undefined}});
  if(url.pathname==='/api/circles/contributions')return f.dispatch(url.pathname+url.search,method,body??undefined);
  const m=/^\/api\/circles\/([^/]+)\/messages\/([^/]+)(\/ai-consent)?$/.exec(url.pathname);assert(m,'Unexpected route '+url.pathname);
  return(m[3]?consentRoute:messageRoute)[method](req,{params:Promise.resolve({circleId:m[1],messageId:m[2]})});
 }
 const requestPath=f.messagePath+'/ai-consent';
 const playwrightRoot='/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/',require=createRequire(playwrightRoot+'playwright/package.json');
 const executablePath='/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
 for(const name of [process.execPath,executablePath,...['playwright/package.json','playwright/index.js','playwright-core/package.json','playwright-core/index.js','playwright-core/browsers.json','playwright-core/lib/bootstrap.js','playwright-core/lib/coreBundle.js','playwright-core/lib/utilsBundle.js'].map(n=>playwrightRoot+n)])result.runtimeHashes[name]=sha(read(name));
 for(const[n,h]of Object.entries(result.runtimeHashes))assert.equal(sha(read(n)),h,'Stale runtime '+n);
 browser=await require('playwright').chromium.launch({headless:true,executablePath,env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:'/Users/christaylor'},args:['--disable-background-networking','--disable-component-update','--no-first-run']});
 const context=await browser.newContext({viewport:{width:320,height:850}});
 const intent='71111111-1111-4111-8111-111111111111';
 let legacyView=false;
 async function selectCookie(who){f.setCookieActor(who);await context.addCookies([{name:'soe_auth_provider',value:'supabase'},{name:'soe_auth_intent',value:intent},{name:'soe_auth_selection_v1',value:'v1.'+intent+'.supabase.'+subjects[who]}].map(cookie=>({...cookie,url:origin,secure:true,httpOnly:cookie.name!=='soe_auth_intent',sameSite:'Lax'})));}
 await selectCookie('author');page=await context.newPage();page.setDefaultTimeout(7000);
 page.on('pageerror',e=>result.errors.push(e.stack||String(e)));
 await context.route('**/*',route=>{const work=(async()=>{const req=route.request(),url=new URL(req.url());let gate;try{
  assert.equal(url.origin,origin);
  if(url.pathname==='/')return await route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/page.css"><body style="margin:0;background:#101d1a"><div id="root"></div><script>window.questAuth='+JSON.stringify({subjects,tokens})+'</script><script type="module" src="/page.mjs"></script></body></html>'});
  if(url.pathname==='/page.mjs')return await route.fulfill({contentType:'text/javascript',body:bundle});
  if(url.pathname==='/page.css')return await route.fulfill({contentType:'text/css',body:css});
  const headers=await req.allHeaders();assert.equal(headers.referer,undefined);
  if(url.pathname==='/api/auth/member'){assert.equal(headers.authorization,undefined);assert.match(headers.cookie??'',/soe_auth_provider=supabase/);}
  else {
   assert(Object.values(tokens).some(token=>headers.authorization==='Bearer '+token));
   if(legacyView){assert.equal(headers.cookie,undefined);assert.equal(headers['x-soe-auth-intent'],undefined);}
   else {assert.equal(headers['x-soe-auth-intent'],intent);assert.match(headers.cookie??'',/soe_auth_provider=supabase/);}
  }
  if(req.method()==='POST')assert.equal(headers.origin,origin);
  const entry={method:req.method(),path:url.pathname,request:req.postData(),status:null,held:false};result.http.push(entry);
  if(holdNext&&url.pathname.endsWith('/ai-consent')&&req.method()==='POST'){holdNext=false;let release;const promise=new Promise(resolve=>{release=resolve;});gate={release,done:false,body:req.postData()};held=gate;entry.held=true;await promise;}
  const response=await dispatch(url,req.method(),headers,req.postData());const bytes=await response.text();assert.match(response.headers.get('cache-control'),/private.*no-store/);entry.status=response.status;
  if(url.pathname!=='/api/auth/member')assert.doesNotMatch(bytes,/PRIVATE_REPORT_NOTE|supabase_auth_id/);
  if(gate){gate.done=true;gate.status=response.status;}
  if(dropNext&&url.pathname.endsWith('/ai-consent')&&req.method()==='POST'){dropNext=false;entry.droppedAfterCommit=true;return await route.abort();}
  try{await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:bytes});}catch(error){if(!gate)throw error;}
 }catch(error){result.errors.push(error.stack||String(error));try{await route.abort();}catch{}}})();pending.add(work);work.finally(()=>pending.delete(work));return work;});
 const $=id=>page.locator('#'+id),settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const counts=()=>page.evaluate(()=>window.questAiConsentQa.counts());
 const ready=id=>page.waitForFunction(id=>!document.getElementById(id).disabled,id);
 async function connect(){await page.getByRole('button',{name:'Connect signed-in account',exact:true}).click();await ready('member-session-check');}
 async function session(){await $('member-session-check').click();await ready('member-contributions-refresh');}
 async function select(id=f.messageId){await ready('member-contributions-refresh');await $('member-contributions-refresh').click();await page.locator('[data-contribution-id="'+id+'"]').getByRole('button').click();await ready('member-contributions-ai-check');}
 async function check(){await ready('member-contributions-ai-check');await $('member-contributions-ai-check').click();await ready('member-contributions-ai-off');}
 const current=async()=>{f.setActor(f.authorId);const response=await f.dispatch(requestPath);assert.equal(response.status,200);return response.json();};
 async function choose(allowed){if(allowed)await $('member-contributions-ai-confirm').check();await $(allowed?'member-contributions-ai-allow':'member-contributions-ai-off').click();}
 const confirmed=allowed=>page.waitForFunction(allowed=>document.getElementById('member-contributions-ai-status').textContent.includes(allowed?'Permission confirmed':'Future AI review is confirmed off'),allowed);
 async function retire(){await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await settle();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await settle();}
 async function restore(){await session();await select();await check();}
 const capture=(name,ids)=>page.evaluate(([name,ids])=>window.questAiConsentQa.capture(name,ids),[name,ids]);
 const invoke=name=>page.evaluate(name=>window.questAiConsentQa.invoke(name),name);
 const waitHeld=()=>bounded(async()=>{while(!held)await new Promise(r=>setTimeout(r,10));});
 async function release(){const g=held;assert(g);g.release();await bounded(async()=>{while(!g.done)await new Promise(r=>setTimeout(r,10));});held=null;await settle();return g;}
 await page.goto(origin);await page.bringToFront();await page.getByRole('button',{name:'Connect signed-in account',exact:true}).waitFor();await settle();
 assert.deepEqual(await page.evaluate(()=>window.questAiConsentQa.markupContract()),{complete:true,legacy:true,partial:true,duplicates:true,missingAi:true});
 assert.deepEqual(await counts(),{factories:0,calls:0,subscriptions:0});assert.equal(result.http.length,0);
 await page.evaluate(()=>document.getElementById('member-contributions-ai-confirm').remove());await page.getByRole('button',{name:'Connect signed-in account',exact:true}).click();await page.getByText('Your contributions could not connect. Try again or use your regular posted messages page.',{exact:true}).waitFor();assert.equal((await counts()).factories,0);assert.equal(result.http.length,0);
 await page.reload();await page.getByRole('button',{name:'Connect signed-in account',exact:true}).waitFor();await page.evaluate(()=>document.getElementById('member-contributions-ai').remove());await page.getByRole('button',{name:'Connect signed-in account',exact:true}).click();await page.getByText('Your contributions could not connect. Try again or use your regular posted messages page.',{exact:true}).waitFor();assert.equal((await counts()).factories,0);assert.equal(result.http.length,0);
 await page.reload();await page.bringToFront();await connect();assert.equal((await counts()).calls,0);assert.equal(result.http.length,0);await context.addCookies([{name:'soe_auth_selection_v1',value:'invalid-synthetic-selection',url:origin,secure:true,httpOnly:true,sameSite:'Lax'}]);await $('member-session-check').click();await page.waitForFunction(()=>document.getElementById('member-session-status').textContent.includes('Could not confirm'));assert.equal(result.http.some(x=>x.path.includes('contributions')),false);await selectCookie('author');await session();assert.equal(result.http.some(x=>x.path.includes('contributions')),false);
 await select();assert.equal(result.http.some(x=>x.path.endsWith('/ai-consent')),false);await check();assert.equal((await current()).consentRevision,0);assert.equal((await current()).allowed,false);assert.equal(await $('member-contributions-ai-allow').isDisabled(),true);
 assert.match(await $('member-contributions-ai-provider').innerText(),/Anthropic.*Claude/);assert.match(await $('member-contributions-ai-provider').innerText(),/not anonymous or zero-retention/);assert.equal(await $('member-contributions-ai-policy').getAttribute('href'),'/circles/message-ai-policy');
 assert.doesNotMatch(await page.locator('body').innerText(),/PRIVATE_REPORT_NOTE|PRIVATE_AUTHOR_LABEL/);
 pass('full required markup fails before client construction; actual member receipt parsing refuses mismatched synthetic cookies; explicit account, list, selected-state and consent checks; legacy absent permission stays off with named policy and no provider invocation');
 const rev=(await current()).consentRevision;await choose(false);await confirmed(false);assert.equal((await current()).consentRevision,rev+1);await choose(true);await confirmed(true);assert.equal((await current()).allowed,true);await choose(false);await confirmed(false);assert.equal((await current()).allowed,false);
 pass('fresh checkbox allows only the selected message; revoke and unchanged keep-off require exact successor receipt plus matching readback');
 await $('member-contributions-confirm').check();await capture('withdraw',['member-contributions-confirm','member-contributions-withdraw']);await check();await $('member-contributions-ai-confirm').check();
 const all=['member-contributions-ai-confirm','member-contributions-ai-allow','member-contributions-ai-off','member-contributions-ai-check','member-contributions-confirm','member-contributions-withdraw','member-contributions-check','member-contributions-retry','member-contributions-refresh','member-contributions-next','member-contributions-back','member-contributions-return'];
 await capture('old',all);await check();let at=result.http.length;await invoke('old');await invoke('withdraw');await settle();assert.equal(result.http.length,at);assert.equal(await $('member-contributions-ai-confirm').isChecked(),false);assert.equal(await $('member-contributions-ai-allow').isDisabled(),true);
 await $('member-contributions-ai-confirm').check();await capture('checked',['member-contributions-ai-allow']);await $('member-contributions-ai-confirm').uncheck();at=result.http.length;await invoke('checked');await settle();assert.equal(result.http.length,at);
 pass('all retained contribution callbacks are fenced after a new render; unchecking immediately retires a previously enabled Allow');
 await $('member-contributions-ai-confirm').check();await capture('selection',all);await $('member-contributions-back').click();await select(second.id);await check();await $('member-contributions-confirm').check();assert.equal(await $('member-contributions-withdraw').isDisabled(),false);at=result.http.length;await invoke('withdraw');await settle();assert.equal(result.http.length,at);assert.equal(await $('member-contributions-withdraw').isDisabled(),false);await check();at=result.http.length;await invoke('selection');await settle();assert.equal(result.http.length,at);assert.equal(await $('member-contributions-ai-confirm').isChecked(),false);assert.match(await $('member-contributions-message').innerText(),/second owned contribution/);
 await $('member-contributions-back').click();await select();await check();at=result.http.length;await invoke('selection');await settle();assert.equal(result.http.length,at);
 pass('old Allow, withdraw, checkbox and navigation callbacks cannot target a second message or a recreated same-message selection');
 holdNext=true;await choose(true);await waitHeld();await retire();assert.equal(await $('member-contributions-message').innerText(),'');const idle=result.http.length;await settle();assert.equal(result.http.length,idle);await restore();const base=(await current()).consentRevision;await choose(false);await confirmed(false);assert.equal((await current()).consentRevision,base+1);assert.equal((await release()).status,409);assert.equal((await current()).allowed,false);
 pass('after focus retirement a fresh unchanged keep-off fences an older held enable before SQL; returning focus makes no automatic request');
 await choose(true);await confirmed(true);holdNext=true;await choose(false);await waitHeld();await retire();await restore();assert.equal(await $('member-contributions-ai-allow').isDisabled(),true);await choose(true);await confirmed(true);assert.equal((await release()).status,409);assert.equal((await current()).allowed,true);
 pass('a fresh explicit checkbox and reaffirmation fence an older held revoke with a real SQL conflict');
 dropNext=true;await choose(false);await page.waitForFunction(()=>document.getElementById('member-contributions-ai-status').textContent.includes('could not be confirmed'));at=result.http.length;await settle();assert.equal(result.http.length,at);await check();assert.match(await $('member-contributions-ai-status').innerText(),/earlier change is still uncertain/);assert.equal((await current()).allowed,false);await choose(false);await confirmed(false);
 pass('lost committed reply stays uncertain without automatic retry; a fresh read does not settle delivery, but a new explicit keep-off does');
 await $('member-contributions-ai-confirm').check();await capture('account',all);await selectCookie('other');await page.evaluate(()=>{window.questAiConsentQa.actor('other');window.questAiConsentQa.providerChanged();});await settle();assert.equal(await $('member-contributions-message').innerText(),'');await connect();await session();at=result.http.length;await invoke('account');await settle();assert.equal(result.http.length,at);assert.equal(await $('member-contributions-ai-confirm').isChecked(),false);
 await selectCookie('author');await page.evaluate(()=>{window.questAiConsentQa.actor('author');window.questAiConsentQa.providerChanged();});await settle();await connect();await session();await select();await check();at=result.http.length;await invoke('account');await settle();assert.equal(result.http.length,at);
 pass('account replacement disposes old controls and subscriptions; callbacks cannot cross accounts or become valid when the author returns');
 await capture('offline',all);await page.evaluate(()=>window.dispatchEvent(new Event('offline')));await settle();assert.equal(await $('member-contributions-message').innerText(),'');at=result.http.length;await page.evaluate(()=>window.dispatchEvent(new Event('online')));await settle();assert.equal(result.http.length,at);await restore();at=result.http.length;await invoke('offline');await settle();assert.equal(result.http.length,at);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);for(const b of await page.locator('#member-contributions-ai button:visible').all())assert((await b.boundingBox()).height>=44);await page.screenshot({path:path.join(ROOT,'platforms/evidence/quest-ai-consent-320.png'),fullPage:true});
 await page.getByRole('button',{name:'Disconnect contributions view',exact:true}).click();legacyView=true;await page.evaluate(()=>window.questAiConsentQa.legacy());await session();await $('member-contributions-refresh').click();await page.locator('[data-contribution-id="'+f.messageId+'"]').getByRole('button').click();await page.waitForFunction(()=>document.getElementById('member-contributions-action-status').textContent.includes('Current message loaded'));assert.equal(await $('member-contributions-ai-check').isDisabled(),true);assert.match(await $('member-contributions-ai-status').innerText(),/unavailable in this connection/);await page.evaluate(()=>window.questAiConsentQa.closeLegacy());
 pass('an older default-capability composition retains withdrawal controls but cannot claim AI consent is available');
 legacyView=false;
 await connect();await session();await select();await check();await capture('unmount',all);at=result.http.length;await page.evaluate(()=>window.questAiConsentQa.unmount());await invoke('unmount');await settle();assert.equal(result.http.length,at);assert.equal((await counts()).subscriptions,0);assert.equal(f.providerCalls.length,0);assert(result.http.every(x=>!x.path.includes('/advice')));result.providerCalls=0;
 pass('offline and unmount retire private controls; 320px layout fits with44px buttons; zero AI-provider/advice calls and all SDK observers disposed');
 assert.deepEqual(result.errors,[]);for(const[n,h]of Object.entries(hashes))assert.equal(sha(read(n)),h,'Source changed '+n);result.status='PASS';
}catch(error){result.status='FAIL';result.failure=error.stack||String(error);if(page)result.failedView=await page.locator('body').innerText().catch(()=>null);process.exitCode=1;}
finally{
 if(held&&!held.done)held.release();await bounded(()=>Promise.allSettled([...pending])).catch(error=>{result.status='FAIL';result.failure??=String(error);process.exitCode=1;});
 if(page)await page.evaluate(()=>window.questAiConsentQa?.unmount()).catch(()=>{});
 if(browser){await bounded(()=>browser.close());result.cleanup.browser='closed';}if(f){await bounded(()=>f.close());result.cleanup.database='closed';}
 try{assert.deepEqual(result.errors,[]);for(const[n,h]of Object.entries({...hashes,...result.runtimeHashes,...result.evidenceHashes}))assert.equal(sha(read(n)),h,'Input changed during cleanup '+n);}catch(error){result.status='FAIL';result.failure??=error.stack||String(error);process.exitCode=1;}
 result.completedAt=new Date().toISOString();write();
}
console.log(JSON.stringify({status:result.status,stories:result.stories.length,http:result.http.length,errors:result.errors,failure:result.failure,cleanup:result.cleanup}));
