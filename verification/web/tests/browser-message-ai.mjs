// Actual author/reviewer components -> actual routes -> strict disposable SQL.
// Auth, browser credential/event ports and provider output are explicit doubles.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT=fileURLToPath(new URL('../../../',import.meta.url)),WEB=path.join(ROOT,'verification/web');
const reportPath=path.join(WEB,'evidence/message-ai-browser.json'),origin='https://message-ai-fixture.test';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function read(name){const file=path.isAbsolute(name)?name:path.join(ROOT,name),info=fs.statSync(file);assert.ok(!info.size||info.blocks,'Refuse offloaded file: '+name);return fs.readFileSync(file);}
function materialized(name){const info=fs.statSync(name);assert.ok(info.size&&info.blocks,'Refuse offloaded runtime: '+name);return{bytes:info.size,blocks:info.blocks};}
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
async function bounded(work,ms=5000,label='Owned operation'){
 let timer;try{return await Promise.race([work(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' timed out')),ms);})]);}finally{clearTimeout(timer);}
}
let priorReceipt=null;
if(fs.existsSync(reportPath)){const previous=read(reportPath);priorReceipt={sha256:sha(previous),receipt:JSON.parse(previous)};}
const startedAt=new Date().toISOString(),stories=[],api=[],unexpected=[],pageErrors=[],consoleErrors=[],routeErrors=[],retiredRoutes=[],cleanup={browser:'pending',database:'pending'};
let failure=null,browser=null,f=null,bundle=null,css=null,sourceHashes={},sqlHashes={},limits={},runtime={},layout={},providerInputVerified=false,observedDecisionCount=null;
const controllers=new Map(),pending=new Set(),releaseProviders=new Set();
function report(status){return{version:1,status,startedAt,completedAt:new Date().toISOString(),stories,api,unexpected,pageErrors,consoleErrors,routeErrors,retiredRoutes,cleanup,layout,runtime,
 sourceHashes,sqlHashes,bundleSHA256:bundle?sha(bundle):null,cssSHA256:css?sha(css):null,
 provider:{synthetic:true,calls:f?.providerCalls.length??0,inputExactlyMessageText:providerInputVerified},
 decisions:f?{expected:0,observed:observedDecisionCount}:null,limits,priorReceipt,
 scope:'Actual Contributions/consent/MessageReviews React components and Bun CSS modules, actual consent/safety/advice route modules and exact strict SQL chain in disposable PGlite. Existing offline NextResponse JSON/header + PostgREST/auth transports are explicit doubles; browser credential supplier, SDK event subscription and NextLink adapters are explicit. Provider is synthetic; no remote account/provider/SDK/device/hosted/deployment acceptance. Fixture body has16px padding; global Next/PostCSS/fonts excluded.',failure};}
const write=status=>fs.writeFileSync(reportPath,JSON.stringify(report(status),null,2)+'\n');
const assertNoErrors=()=>{assert.deepEqual(unexpected,[]);assert.deepEqual(pageErrors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(routeErrors,[]);};
const pass=name=>{stories.push(name);write('RUNNING');console.log('PASS '+stories.length+': '+name);};
write('RUNNING');
try{
 process.chdir(WEB);
 assert.ok(process.execArgv.some(value=>value.endsWith('/deny-build-network.cjs')),'Startup deny guard required');
 const require=createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');
 const executablePath='/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
 runtime={node:process.version,playwright:materialized(require.resolve('playwright')),chromium:materialized(executablePath),startupGuard:true,cleanEnvironment:true};
 bundle=read('verification/web/evidence/message-ai-fixture/page.js');css=read('verification/web/evidence/message-ai-fixture/page.css');
 const manifest=JSON.parse(read('verification/web/evidence/message-ai-fixture/source-manifest.json'));
 sourceHashes={...manifest.sourceHashes};
 for(const name of ['verification/web/tests/browser-message-ai.mjs','verification/web/tests/support/message-ai-app.mjs','verification/web/tests/support/message-ai-db.mjs',
  'app/api/circles/contributions/route.ts','app/api/circles/[circleId]/messages/[messageId]/route.ts','app/api/circles/[circleId]/messages/[messageId]/ai-consent/route.ts',
  'app/api/admin/circles/messages/route.ts','app/api/admin/circles/[circleId]/messages/[messageId]/route.ts','app/api/admin/circles/[circleId]/messages/[messageId]/advice/route.ts',
  'lib/circles/message-moderation-server.ts','lib/circles/moderation-server.ts','lib/http/routeError.ts'])sourceHashes[name]=sha(read(name));
 for(const [name,expected]of Object.entries(sourceHashes))assert.equal(sha(read(name)),expected,'Rebundle/review changed source: '+name);
 const fixtureModule=await import('./support/message-ai-app.mjs');
 f=await fixtureModule.messageAiApp();sqlHashes=fixtureModule.MESSAGE_AI_SOURCE_HASHES;limits=fixtureModule.MESSAGE_AI_FIXTURE_LIMITS;
 const CONTENT=fixtureModule.CONTENT;
 const ADVICE={observations:[],counterevidence:[{excerpt:'without a personal attack',note:'The message distinguishes an idea from a person.'}],questions:['What surrounding context should the human reviewer check?']};
 const decisionCount=async()=>Number((await f.db.query('SELECT count(*)::int n FROM public.circle_message_decisions')).rows[0].n);
 const assertNoDecisions=async()=>{observedDecisionCount=await decisionCount();assert.equal(observedDecisionCount,0,'AI never makes a human decision');};
 const {chromium}=require('playwright');
 browser=await chromium.launch({headless:true,timeout:15000,executablePath,env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:'/Users/christaylor'},args:['--disable-background-networking','--disable-component-update','--no-first-run']});
 const context=await browser.newContext({viewport:{width:320,height:844}}),page=await context.newPage();page.setDefaultTimeout(7000);
 let dropConsentReply=false;
 page.on('pageerror',error=>pageErrors.push(error.message));
 page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('Failed to load resource:'))consoleErrors.push(message.text());});
 page.on('requestfailed',request=>{controllers.get(request)?.abort();});
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  try{
   if(url.origin!==origin){unexpected.push(request.url());await route.abort();return;}
   if(url.pathname==='/'){await route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/page.css"></head><body style="margin:0;padding:16px;background:#0a0a0a;color:#f5f0e8;box-sizing:border-box"><div id="root"></div><script type="module" src="/page.mjs"></script></body></html>'});return;}
   if(url.pathname==='/page.mjs'){await route.fulfill({contentType:'text/javascript',body:bundle});return;}
   if(url.pathname==='/page.css'){await route.fulfill({contentType:'text/css',body:css});return;}
   if(!url.pathname.startsWith('/api/')){unexpected.push(request.url());await route.abort();return;}
   const controller=new AbortController();controllers.set(request,controller);
   const body=request.postData()??undefined,entry={path:url.pathname,method:request.method(),bodyKeys:body?Object.keys(JSON.parse(body)).sort():[],status:null,delivered:false};api.push(entry);
   const work=(async()=>{
    const response=await f.dispatch(url.pathname+url.search,request.method(),body,controller.signal);entry.status=response.status;
    const reply=await response.text();
    assert.match(response.headers.get('cache-control'),/private.*no-store/);
    if(dropConsentReply&&request.method()==='POST'&&url.pathname.endsWith('/ai-consent')){dropConsentReply=false;await route.abort();return;}
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:reply});entry.delivered=true;
   })();pending.add(work);
   try{await work;}finally{pending.delete(work);controllers.delete(request);}
  }catch(error){if(controllers.get(request)?.signal.aborted||/cancelled|aborted|Target.*closed|route.*handled/i.test(String(error))){retiredRoutes.push({path:url.pathname,reason:'Browser request retired'});}else routeErrors.push(error.stack||String(error));try{await route.abort();}catch{}controllers.delete(request);}
 });
 const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const owner=async()=>{f.setActor(f.authorId);await page.evaluate(()=>window.aiQa.show('owner'));await page.getByRole('button',{name:'Load my posted messages',exact:true}).click();await page.getByRole('button',{name:'AI review settings',exact:true}).click();await page.getByRole('button',{name:'Check AI review settings',exact:true}).click();await page.getByText('Current AI review settings checked.',{exact:true}).waitFor();};
 const reviewer=async()=>{f.setActor(f.reviewerId);await page.evaluate(()=>window.aiQa.show('review'));await page.getByRole('button',{name:'Load assigned message reviews',exact:true}).click();await page.getByRole('button',{name:/^Review message in /}).click();await page.getByRole('region',{name:'Current message review',exact:true}).waitFor();};
 const enable=async()=>{await page.getByRole('checkbox',{name:/I read this policy/}).check();await page.getByRole('button',{name:'Allow Anthropic review of this message',exact:true}).click();await page.getByText('Permission confirmed for this message. This setting does not itself send the message.',{exact:true}).waitFor();};
 async function authorSet(allowed){
  f.setActor(f.authorId);const current=await(await f.dispatch(f.messagePath+'/ai-consent')).json();
  const response=await f.dispatch(f.messagePath+'/ai-consent','POST',{expectedConsentRevision:current.consentRevision,contentHash:current.contentHash,policy:current.policy,allowed});
  assert.equal(response.status,200);const receipt=await response.json();assert.equal(receipt.allowed,allowed);assert.equal(receipt.consentRevision,current.consentRevision+Number(current.allowed!==allowed));return receipt;
 }
 function holdProvider(label){const started=gate(),result=gate();f.setProvider(async()=>{started.resolve();return result.promise;});const release=()=>{releaseProviders.delete(release);result.resolve({...ADVICE,counterevidence:[{...ADVICE.counterevidence[0],note:label}]});};releaseProviders.add(release);return{started:started.promise,release};}
 await page.goto(origin);await page.getByRole('button',{name:'Load my posted messages',exact:true}).waitFor();await page.waitForFunction(()=>window.aiQa.listeners.size>0);
 assert.equal(api.length,0);assert.equal(f.providerCalls.length,0);
 await page.getByRole('button',{name:'Load my posted messages',exact:true}).click();await page.getByRole('button',{name:'AI review settings',exact:true}).click();
 assert.equal(api.filter(entry=>entry.path.endsWith('/ai-consent')).length,0);
 const check=page.getByRole('button',{name:'Check AI review settings',exact:true});await check.focus();await page.keyboard.press('Space');
 await page.getByText('AI review permission is off for this message.',{exact:true}).waitFor();
 const allow=page.getByRole('button',{name:'Allow Anthropic review of this message',exact:true});assert.equal(await allow.isDisabled(),true);
 await page.keyboard.press('Tab');
 layout.keyboard=await page.evaluate(()=>({tag:document.activeElement.tagName,type:document.activeElement.getAttribute('type'),outline:getComputedStyle(document.activeElement).outlineStyle}));
 assert.equal(layout.keyboard.type,'checkbox');assert.notEqual(layout.keyboard.outline,'none');await page.keyboard.press('Space');assert.equal(await allow.isEnabled(),true);
 await allow.click();await page.getByText('Permission confirmed for this message. This setting does not itself send the message.',{exact:true}).waitFor();
 const consentRequests=api.filter(entry=>entry.path.endsWith('/ai-consent'));assert.deepEqual(consentRequests.map(entry=>entry.method),['GET','POST','GET']);
 layout.ownerNoOverflow=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);assert.equal(layout.ownerNoOverflow,true);
 layout.ownerButtonHeights=await page.locator('button').evaluateAll(elements=>elements.map(el=>el.getBoundingClientRect().height));assert.ok(layout.ownerButtonHeights.every(height=>height>=44));
 layout.actualCss=await page.getByRole('region',{name:'Message AI review permission'}).evaluate(el=>({overflowWrap:getComputedStyle(el).overflowWrap,classes:el.className}));assert.equal(layout.actualCss.overflowWrap,'anywhere');assert.doesNotMatch(layout.actualCss.classes,/undefined/);
 assert.doesNotMatch(await page.locator('body').innerText(),/PRIVATE_REPORT_NOTE/);await assertNoDecisions();pass('author initial/no automatic settings read, explicit default-off check, keyboard policy confirmation, bound POST+freshGET and actual CSS at320px');

 await reviewer();await page.getByRole('button',{name:'Request AI observations',exact:true}).click();await page.getByRole('heading',{name:'Counterevidence to check',exact:true}).waitFor();
 assert.equal(f.providerCalls.length,1);assert.equal(f.providerCalls[0].content,CONTENT);
 assert.equal(await page.getByLabel('Moderator restriction',{exact:true}).inputValue(),'');assert.equal(await page.getByLabel('Reason based on conduct',{exact:true}).inputValue(),'');assert.equal(await page.getByLabel('Author-facing explanation',{exact:true}).inputValue(),'');
 assert.equal(await page.getByRole('checkbox',{name:/I reviewed the evidence/}).isChecked(),false);assert.equal(await page.getByRole('button',{name:'Save message decision',exact:true}).isDisabled(),true);
 layout.reviewerNoOverflow=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);assert.equal(layout.reviewerNoOverflow,true);await assertNoDecisions();pass('assigned reviewer actual queue/case/advice shows counterevidence; provider receives exact message only; human decision fields remain blank and decision count0');

 await owner();await page.getByRole('button',{name:'Revoke future AI review',exact:true}).click();await page.getByText(/^Future AI review revoked\./).waitFor();const beforeDenied=f.providerCalls.length;
 await reviewer();await page.getByRole('button',{name:'Request AI observations',exact:true}).click();await page.getByRole('status').filter({hasText:'No eligible assignment is available.'}).waitFor();
 assert.equal(api.at(-1).status,403);assert.equal(f.providerCalls.length,beforeDenied);assert.equal(await page.getByRole('heading',{name:'Counterevidence to check',exact:true}).count(),0);await assertNoDecisions();pass('author revoke actualPOST/readback blocks next reviewer advice with403 and zero additional provider calls');

 await owner();await enable();await reviewer();const aba=holdProvider('STALE_ABA_ADVICE');await page.getByRole('button',{name:'Request AI observations',exact:true}).click();await bounded(()=>aba.started);
 const revoked=await authorSet(false),reenabled=await authorSet(true);assert.equal(reenabled.consentRevision,revoked.consentRevision+1);f.setActor(f.reviewerId);aba.release();
 await page.getByRole('status').filter({hasText:'This message or its reports changed.'}).waitFor();assert.equal(api.at(-1).status,409);assert.doesNotMatch(await page.locator('body').innerText(),/STALE_ABA_ADVICE/);await assertNoDecisions();pass('revoke+reenable during an actual in-flight request advances consent revision and suppresses stale advice409');

 for(const kind of ['blur','logout']){
  await reviewer();const held=holdProvider('LATE_'+kind.toUpperCase()+'_ADVICE');await page.getByRole('button',{name:'Request AI observations',exact:true}).click();await bounded(()=>held.started);
  const failed=page.waitForEvent('requestfailed',{predicate:request=>new URL(request.url()).pathname===f.reviewPath+'/advice'});
  if(kind==='logout'){f.setActor(null);await page.evaluate(()=>window.aiQa.emit('SIGNED_OUT'));}else await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await failed;assert.equal(f.providerCalls.at(-1).signal.aborted,true,'Browser retirement reaches the actual handler abort signal before provider release');
  await page.getByRole('status').filter({hasText:'Private reports, evidence and drafts cleared.'}).waitFor();held.release();await settle();
  assert.equal(await page.getByRole('region',{name:'Current message review',exact:true}).count(),0);assert.doesNotMatch(await page.locator('body').innerText(),/LATE_.*_ADVICE|PRIVATE_REPORT_NOTE/);
  const count=api.length;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await settle();assert.equal(api.length,count);await assertNoDecisions();
  pass(kind+' retires actual held advice, aborts its server lifetime and prevents late private results or automatic restoration');
 }

 await owner();const beforeDrop=api.length;dropConsentReply=true;await page.getByRole('button',{name:'Revoke future AI review',exact:true}).click();await page.getByText(/The change could not be confirmed and may have been saved/).waitFor();await settle();
 assert.deepEqual(api.slice(beforeDrop).map(entry=>[entry.method,entry.status,entry.delivered]),[['POST',200,false]]);assert.equal(await page.getByRole('button',{name:'Revoke future AI review',exact:true}).count(),0);
 await page.getByRole('button',{name:'Check AI review settings',exact:true}).click();await page.getByText('AI review permission is off for this message.',{exact:true}).waitFor();await assertNoDecisions();pass('committed consent mutation with lost reply stays unknown with no retry; explicit current-state read reveals the actual saved revocation');

 for(const call of f.providerCalls)assert.equal(call.content,CONTENT);providerInputVerified=true;
 assert.equal(f.providerCalls.length,4);assertNoErrors();
 for(const [name,expected]of Object.entries({...sourceHashes,...sqlHashes}))assert.equal(sha(read(name)),expected,'Source changed during composed proof: '+name);
 await assertNoDecisions();
}catch(error){failure=error.stack||String(error);}
finally{
 write(failure?'FAIL':'CLEANING_UP');
 for(const controller of controllers.values())controller.abort();for(const release of releaseProviders)release();
 try{await bounded(()=>Promise.allSettled([...pending]),5000,'Owned route cleanup');}catch(error){failure??=error.stack||String(error);}
 try{if(browser)await bounded(()=>browser.close(),5000,'Owned browser cleanup');cleanup.browser=browser?'closed':'not-created';}catch(error){cleanup.browser='failed';failure??=error.stack||String(error);}
 try{if(f)await bounded(()=>f.close(),5000,'Owned database cleanup');cleanup.database=f?'closed':'not-created';}catch(error){cleanup.database='failed';failure??=error.stack||String(error);}
 try{assertNoErrors();}catch(error){failure??=error.stack||String(error);}
 write(failure?'FAIL':'PASS');
}
if(failure)throw Error(failure);
console.log('PASS composed message AI Chromium: '+stories.length+' stories; provider calls synthetic; zero human decisions.');
