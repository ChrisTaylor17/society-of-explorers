// Current consent recovery proof. Real React components, HTTP handlers and SQL;
// synthetic identity/credential events and intercepted delivery are explicit.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const ROOT=fileURLToPath(new URL('../../../',import.meta.url)),origin='https://message-ai-fixture.test';
const sha=b=>createHash('sha256').update(b).digest('hex');
const read=n=>{const p=path.isAbsolute(n)?n:path.join(ROOT,n),s=fs.lstatSync(p);assert(s.isFile()&&!s.isSymbolicLink()&&(!s.size||s.blocks),n);return fs.readFileSync(p);};
const file='verification/web/evidence/consent-intent-browser.json',startedAt=new Date().toISOString();
const priorReceipt=fs.existsSync(path.join(ROOT,file))?{sha256:sha(read(file)),status:JSON.parse(read(file)).status}:null;
const preservedEvidenceHashes={};
for(const folder of ['consent-intent-provisional-card-selector','consent-intent-provisional-14','consent-intent-provisional-lint'])for(const name of ['consent-intent-browser.json','consent-intent-browser.log','browser-consent-intent.mjs','consent-intent-lint.log']){
 const file='verification/web/evidence/'+folder+'/'+name;if(!fs.existsSync(path.join(ROOT,file)))continue;preservedEvidenceHashes[file]=sha(read(file));
 if(priorReceipt&&name==='consent-intent-browser.json'&&preservedEvidenceHashes[file]===priorReceipt.sha256)priorReceipt.archivePath=file;
}
const result={status:'RUNNING',startedAt,stories:[],http:[],errors:[],sourceHashes:{},runtimeHashes:{},evidenceHashes:{},preservedEvidenceHashes,priorReceipt,cleanup:{browser:'pending',database:'pending'},
 scope:'Actual MessageAiConsent and Contributions React components, current consent/contribution handlers and additive consent intent SQL in disposable PGlite. Server identity, PostgREST, browser credentials/SDK events/NextLink and delivery are explicit doubles. Real DOM callbacks are captured to exercise retired UI events. Held requests deliberately outlive browser abort before SQL. No remote provider, native runtime, production data, deployed authentication, independent PostgreSQL sessions or human review acceptance.'};
const hashes=result.sourceHashes,write=()=>fs.writeFileSync(path.join(ROOT,file),JSON.stringify(result,null,2)+'\n');
const pass=name=>{result.stories.push(name);write();console.log('PASS '+result.stories.length+': '+name);};
async function bounded(fn,ms=5000){let timer;try{return await Promise.race([fn(),new Promise((_,no)=>timer=setTimeout(()=>no(Error('Owned operation timed out')),ms))]);}finally{clearTimeout(timer);}}
let browser,page,f,held=null,holdNext=false,dropNext=false,tamperPost=false,tamperReadback=false,tamperGet=false;
write();
try{
 assert(process.execArgv.some(v=>v.endsWith('/deny-build-network.cjs')));
 process.chdir(path.join(ROOT,'verification/web'));
 const bundle=read('verification/web/evidence/consent-intent-fixture/page.js'),css=read('verification/web/evidence/consent-intent-fixture/page.css');
 const manifest=JSON.parse(read('verification/web/evidence/consent-intent-fixture/source-manifest.json'));
 Object.assign(hashes,manifest.sourceHashes);Object.assign(result.runtimeHashes,manifest.runtimeHashes);
 for(const name of ['page.js','page.css','source-manifest.json']){const file='verification/web/evidence/consent-intent-fixture/'+name;result.evidenceHashes[file]=sha(read(file));}
 for(const n of ['verification/web/tests/browser-consent-intent.mjs','verification/web/scripts/bundle-consent-intent.mjs','verification/web/tests/support/current-message-ai-consent-app.mjs'])hashes[n]=sha(read(n));
 const mod=await import('./support/current-message-ai-consent-app.mjs');
 Object.assign(hashes,typeof mod.currentConsentSourceHashes==='function'?await mod.currentConsentSourceHashes():mod.currentConsentSourceHashes);
 for(const[n,h]of Object.entries(hashes))assert.equal(sha(read(n)),h,'Stale source '+n);
 f=await mod.currentMessageAiApp({allowance:null});
 const requestPath=f.messagePath+'/ai-consent';
 const playwrightRoot='/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/';
 const require=createRequire(playwrightRoot+'playwright/package.json');
 const executablePath='/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
 const runtimeLeaves=[process.execPath,executablePath,...['playwright/package.json','playwright/index.js','playwright-core/package.json','playwright-core/index.js','playwright-core/browsers.json','playwright-core/lib/bootstrap.js','playwright-core/lib/coreBundle.js','playwright-core/lib/utilsBundle.js'].map(n=>playwrightRoot+n)];
 for(const name of runtimeLeaves)result.runtimeHashes[name]=sha(read(name));
 for(const[name,h]of Object.entries(result.runtimeHashes))assert.equal(sha(read(name)),h,'Stale runtime '+name);
 browser=await require('playwright').chromium.launch({headless:true,executablePath,env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:'/Users/christaylor'},args:['--disable-background-networking','--disable-component-update','--no-first-run']});
 const context=await browser.newContext({viewport:{width:320,height:850}});page=await context.newPage();page.setDefaultTimeout(6000);
 page.on('pageerror',e=>result.errors.push(e.stack||String(e)));
 await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());try{
  assert.equal(url.origin,origin);
  if(url.pathname==='/'){await route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/page.css"><body style="margin:0;padding:16px;background:#101d1a;color:#eee;box-sizing:border-box"><div id="root"></div><script>window.consentInput='+JSON.stringify({circleId:f.circleId,messageId:f.messageId})+'</script><script type="module" src="/page.mjs"></script></body></html>'});return;}
  if(url.pathname==='/page.mjs'){await route.fulfill({contentType:'text/javascript',body:bundle});return;}
  if(url.pathname==='/page.css'){await route.fulfill({contentType:'text/css',body:css});return;}
  assert(url.pathname===requestPath||url.pathname==='/api/circles/contributions'||url.pathname===f.messagePath,'Unexpected route '+url.pathname);
  let gate;
  if(holdNext&&url.pathname===requestPath&&req.method()==='POST'){holdNext=false;let release;const promise=new Promise(resolve=>{release=resolve;});gate={release,done:false,body:req.postData()};held=gate;await promise;}
  const response=await f.dispatch(url.pathname+url.search,req.method(),req.postData()??undefined);let body=await response.json();
  const entry={method:req.method(),path:url.pathname,status:response.status,request:req.postData(),held:Boolean(gate)};result.http.push(entry);
  if(gate){gate.done=true;gate.status=response.status;gate.response=body;}
  if(url.pathname===requestPath&&req.method()==='POST'){
   if(dropNext){dropNext=false;await route.abort();return;}
   if(tamperPost){tamperPost=false;body={...body,consentRevision:JSON.parse(req.postData()).expectedConsentRevision};entry.tampered='old receipt revision';}
   if(tamperReadback){tamperReadback=false;tamperGet=true;}
  }else if(url.pathname===requestPath&&tamperGet){tamperGet=false;body={...body,contentHash:'f'.repeat(64)};entry.tampered='readback hash';}
  try{await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:JSON.stringify(body)});}catch(error){if(!gate)throw error;}
 }catch(error){result.errors.push(error.stack||String(error));try{await route.abort();}catch{}}});
 const button=name=>page.getByRole('button',{name,exact:true});
 const checkbox=()=>page.getByRole('checkbox',{name:'I read this policy and allow this message’s text to be sent to Anthropic for advisory review.',exact:true});
 const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const enabled=name=>page.waitForFunction(name=>[...document.querySelectorAll('button')].some(b=>b.textContent===name&&!b.disabled),name);
 const current=async()=>{const r=await f.dispatch(requestPath);assert.equal(r.status,200);return r.json();};
 const check=async()=>{await enabled('Check AI review settings');await button('Check AI review settings').click();await page.getByText(/^Last checked: AI review permission is (on|off) for this message\.$/).waitFor();};
 const confirmedOff=()=>page.getByText('Future AI review is confirmed off. A review request already in progress may still transmit or complete; text already sent to Anthropic cannot be recalled.',{exact:true}).waitFor();
 const confirmedOn=()=>page.getByText('Permission confirmed for this message. This setting does not itself send the message.',{exact:true}).waitFor();
 async function choose(allowed){const text=allowed?(await button('Keep Anthropic review allowed for this message').count()?'Keep Anthropic review allowed for this message':'Allow Anthropic review of this message'):(await button('Revoke future AI review').count()?'Revoke future AI review':'Keep future AI review off');if(allowed)await checkbox().check();await button(text).click();}
 const openSettings=()=>page.locator('li').filter({has:page.locator(`a[href*="${f.messageId}"]`)}).getByRole('button',{name:'AI review settings',exact:true}).click();
 async function show(kind='direct'){await page.evaluate(kind=>window.consentQa.show(kind),kind);await settle();if(kind==='contributions'){await button('Load my posted messages').click();await openSettings();}await enabled('Check AI review settings');}
 async function retire(){await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await settle();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await settle();}
 const waitHeld=()=>bounded(async()=>{while(!held)await new Promise(r=>setTimeout(r,10));});
 async function release(){const gate=held;assert(gate);gate.release();await bounded(async()=>{while(!gate.done)await new Promise(r=>setTimeout(r,10));});held=null;await settle();return gate;}
 const retain=(node,event='onClick')=>node.evaluate((node,event)=>window.consentQa.retain(node,event),event);
 const invoke=(id,checked=false)=>page.evaluate(([id,checked])=>window.consentQa.invoke(id,checked),[id,checked]);
 await page.goto(origin);await enabled('Check AI review settings');assert.equal(result.http.length,0);await check();
 assert.equal((await current()).consentRevision,0);assert.equal(await button('Keep future AI review off').count(),1);assert.equal(await button('Allow Anthropic review of this message').isDisabled(),true);
 pass('mount is inert; legacy absence stays false/revision zero until an explicit choice; opt-in requires the policy checkbox');
 const beforeOff=await current();await choose(false);await confirmedOff();assert.equal((await current()).consentRevision,beforeOff.consentRevision+1);
 pass('explicit keep-off advances consent revision even when unchanged and requires exact receipt plus independent matching readback');
 await show('contributions');await check();holdNext=true;await choose(true);await waitHeld();const initial=JSON.parse(held.body).expectedConsentRevision;await retire();
 assert.equal(await page.getByRole('region',{name:'Message AI review permission'}).count(),0);await button('Load my posted messages').click();await openSettings();await check();
 assert.equal((await current()).consentRevision,initial);await choose(false);await confirmedOff();const retiredEnable=await release();assert.equal(retiredEnable.status,409);assert.equal((await current()).allowed,false);
 pass('actual Contributions retirement/remount recovers held enable: unchanged GET grants no completion, explicit keep-off fences the older request with409');
 await show();await check();await choose(true);await confirmedOn();holdNext=true;await choose(false);await waitHeld();await retire();await show('contributions');await check();
 assert.equal(await button('Keep Anthropic review allowed for this message').isDisabled(),true);await choose(true);await confirmedOn();const retiredRevoke=await release();assert.equal(retiredRevoke.status,409);assert.equal((await current()).allowed,true);
 pass('held revoke cannot override a later reaffirmed permission; reaffirm-on requires a new explicit policy checkbox after remount');
 dropNext=true;await choose(false);await page.getByText(/The change could not be confirmed and may still finish\./).waitFor();const lostAt=result.http.length;await settle();assert.equal(result.http.length,lostAt);
 await check();assert.equal((await current()).allowed,false);assert.equal(await page.getByText(/The earlier change is still uncertain\./).count(),1);await choose(false);await confirmedOff();
 pass('lost committed reply stays uncertain with no automatic request; fresh saved state alone does not claim confirmation, and a new keep-off decision settles');
 await show();await check();holdNext=true;await choose(true);await waitHeld();await page.getByText(/The change could not be confirmed and may still finish\./).waitFor({timeout:18000});
 await check();await choose(false);await confirmedOff();assert.equal((await release()).status,409);assert.equal((await current()).allowed,false);
 pass('actual15-second UI timeout does not cancel an old server write; explicit same-base keep-off safely fences its late execution');
 tamperPost=true;await choose(true);await page.getByText(/The change could not be confirmed and may still finish\./).waitFor();assert.equal(await page.getByText('Permission confirmed for this message. This setting does not itself send the message.',{exact:true}).count(),0);await check();await choose(false);await confirmedOff();
 pass('base-revision receipt tampering cannot confirm consent despite an actual commit; recovery remains explicit');
 tamperReadback=true;await choose(true);await page.getByText(/The change could not be confirmed and may still finish\./).waitFor();await check();await choose(false);await confirmedOff();
 pass('mismatched readback hash cannot confirm consent; only a matching later explicit decision can settle');
 await show();await check();const oldCheckbox=await retain(checkbox(),'onChange');await checkbox().check();const oldAllow=await retain(button('Allow Anthropic review of this message')),oldCheck=await retain(button('Check AI review settings'));
 await check();let at=result.http.length;await invoke(oldAllow);await invoke(oldCheckbox,true);await invoke(oldCheck);await settle();assert.equal(result.http.length,at);assert.equal(await checkbox().isChecked(),false);assert.equal(await button('Allow Anthropic review of this message').isDisabled(),true);
 pass('old Allow, checkbox and Check callbacks cannot act on a newer same-revision snapshot after refresh');
 await checkbox().check();const checkedAllow=await retain(button('Allow Anthropic review of this message'));await checkbox().uncheck();at=result.http.length;await invoke(checkedAllow);await settle();assert.equal(result.http.length,at);
 pass('unchecking policy consent synchronously retires a previously captured Allow callback');
 await checkbox().check();const preBlur=await retain(button('Allow Anthropic review of this message')),preBlurCheck=await retain(button('Check AI review settings'));await retire();await check();at=result.http.length;await invoke(preBlur);await invoke(preBlurCheck);await settle();assert.equal(result.http.length,at);
 await checkbox().check();const preRemount=await retain(button('Allow Anthropic review of this message'));await show();await check();at=result.http.length;await invoke(preRemount);await settle();assert.equal(result.http.length,at);
 pass('actual old callbacks from pre-blur and unmounted panels cannot submit after current access resumes');
 f.setActor(null);await button('Check AI review settings').click();await page.getByText('Sign in to check your message’s AI review settings.',{exact:true}).waitFor();assert.equal(await checkbox().count(),0);f.setActor(f.authorId);await check();
 pass('canonical authorization denial clears the settings and permission controls; returning requires a new explicit read');
 const prior=await current();tamperGet=true;await check();await choose(true);await page.getByText('The message or permission changed. Check current settings before choosing again.',{exact:true}).waitFor();assert.deepEqual(await current(),prior);await check();
 pass('stale/tampered source hash is refused by actual SQL; it neither enables permission nor overwrites current consent');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(ROOT,'verification/web/evidence/consent-intent-320.png'),fullPage:true});
 assert.equal(f.providerCalls.length,0);result.providerCalls=0;assert.deepEqual(result.errors,[]);
 for(const[n,h]of Object.entries(hashes))assert.equal(sha(read(n)),h,'Source changed '+n);
 pass('320px permission controls fit and all consent operations invoke zero providers');result.status='PASS';
}catch(error){result.status='FAIL';result.failure=error.stack||String(error);if(page)result.failedView=await page.locator('body').innerText().catch(()=>null);process.exitCode=1;}
finally{
 if(held&&!held.done){held.release();await bounded(async()=>{while(!held.done)await new Promise(r=>setTimeout(r,10));}).catch(()=>{});}
 if(page)await page.evaluate(()=>window.consentQa?.unmount()).catch(()=>{});
 if(page){const listeners=await page.evaluate(()=>window.consentQa?.listeners.size).catch(()=>null);result.remainingAuthListeners=listeners;if(listeners!==0){result.status='FAIL';result.failure??='Auth observers remained after unmount';process.exitCode=1;}}
 if(browser){await browser.close();result.cleanup.browser='closed';}
 if(f){await f.close();result.cleanup.database='closed';}
 try{assert.deepEqual(result.errors,[]);for(const[n,h]of Object.entries({...hashes,...result.runtimeHashes,...result.evidenceHashes,...preservedEvidenceHashes}))assert.equal(sha(read(n)),h,'Input changed during cleanup '+n);}catch(error){result.status='FAIL';result.failure??=error.stack||String(error);process.exitCode=1;}
 result.completedAt=new Date().toISOString();write();
}
console.log(JSON.stringify({status:result.status,stories:result.stories.length,http:result.http.length,errors:result.errors,failure:result.failure,cleanup:result.cleanup}));
