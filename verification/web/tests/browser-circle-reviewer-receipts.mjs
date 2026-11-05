import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
const ROOT=fileURLToPath(new URL('../../../',import.meta.url)),ORIGIN='https://circle-reviewer.test',PREFIX='verification/web/evidence/circle-reviewer-web';
const sha=b=>createHash('sha256').update(b).digest('hex'),read=name=>{const p=path.isAbsolute(name)?name:path.join(ROOT,name),s=fs.lstatSync(p);assert(s.isFile()&&!s.isSymbolicLink()&&(!s.size||s.blocks),name);return fs.readFileSync(p);};
const receipt=PREFIX+'.json';let priorReceipt=null;
if(fs.existsSync(path.join(ROOT,receipt))){const bytes=read(receipt),archive=PREFIX+'-prior-'+Date.now()+'.json';fs.writeFileSync(path.join(ROOT,archive),bytes);priorReceipt={path:archive,sha256:sha(bytes)};}
const result={status:'RUNNING',startedAt:new Date().toISOString(),stories:[],http:[],receipts:[],errors:[],sourceHashes:{},runtimeHashes:{},evidenceHashes:{},priorReceipt,cleanup:{browser:'pending',database:'pending'},scope:'Actual CircleReviews, ReviewCoverage and useReviewAccess in Chromium with canonical listing handlers and disposable current SQL including correlated receipts. Account credentials/events, actor resolution, PostgREST and delivery faults are explicit doubles. No real sign-in, provider, independent PostgreSQL contention or device acceptance.'};
const write=()=>fs.writeFileSync(path.join(ROOT,receipt),JSON.stringify(result,null,2)+'\n'),pass=story=>{result.stories.push(story);write();console.log('PASS '+result.stories.length+': '+story);};
async function bounded(work,ms=10000){let timer;try{return await Promise.race([work(),new Promise((_,no)=>timer=setTimeout(()=>no(Error('Operation timed out')),ms))]);}finally{clearTimeout(timer);}}
let browser,page,f,replyFault=null,failReadback=false,staleReadback=false,lastCoverage=null;const pending=new Set(),wires=[];write();
try{
 assert(process.execArgv.some(v=>v.endsWith('/deny-build-network.cjs')));process.chdir(path.join(ROOT,'verification/web'));
 const fixture=PREFIX+'-fixture',manifest=JSON.parse(read(fixture+'/source-manifest.json')),bundle=read(fixture+'/page.js'),css=read(fixture+'/page.css');
 Object.assign(result.sourceHashes,manifest.sourceHashes);Object.assign(result.runtimeHashes,manifest.runtimeHashes);
 for(const n of ['page.js','page.css','source-manifest.json'])result.evidenceHashes[fixture+'/'+n]=sha(read(fixture+'/'+n));
 for(const n of ['verification/web/tests/browser-circle-reviewer-receipts.mjs','verification/web/scripts/deny-build-network.cjs','verification/web/tests/support/native-circle-reviewer-app.mjs'])result.sourceHashes[n]=sha(read(n));
 const mod=await import('./support/native-circle-reviewer-app.mjs');Object.assign(result.sourceHashes,await mod.nativeCircleReviewerSourceHashes());f=await mod.nativeCircleReviewerApp({reportCount:101});
 const base='/api/admin/circles/reports/'+f.circleId;
 const playwrightRoot='/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/',require=createRequire(playwrightRoot+'playwright/package.json'),executablePath='/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
 for(const n of [process.execPath,executablePath,...['playwright/package.json','playwright/index.js','playwright-core/package.json','playwright-core/index.js','playwright-core/browsers.json','playwright-core/lib/bootstrap.js','playwright-core/lib/coreBundle.js','playwright-core/lib/utilsBundle.js'].map(n=>playwrightRoot+n)])result.runtimeHashes[n]=sha(read(n));
 for(const[n,h]of Object.entries({...result.sourceHashes,...result.runtimeHashes}))assert.equal(sha(read(n)),h,'Stale input '+n);
 browser=await require('playwright').chromium.launch({headless:true,executablePath,env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:'/Users/christaylor'},args:['--disable-background-networking','--disable-component-update','--no-first-run']});
 const context=await browser.newContext({viewport:{width:320,height:850},serviceWorkers:'block',acceptDownloads:false});page=await context.newPage();page.setDefaultTimeout(7000);page.on('pageerror',error=>result.errors.push(error.stack||String(error)));
 await context.route('**/*',route=>{const work=(async()=>{const req=route.request(),url=new URL(req.url());try{
  assert.equal(url.origin,ORIGIN);
  if(url.pathname==='/')return await route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/page.css"><body style="margin:0;padding:16px;box-sizing:border-box;background:#101d1a;color:#eee"><div id="root"></div><script type="module" src="/page.mjs"></script></body></html>'});
  if(url.pathname==='/page.mjs')return await route.fulfill({contentType:'text/javascript',body:bundle});if(url.pathname==='/page.css')return await route.fulfill({contentType:'text/css',body:css});
  assert(url.pathname.startsWith('/api/admin/circles/reports'));const headers=await req.allHeaders();assert.equal(headers.authorization,undefined);assert.equal(headers.cookie,undefined);
  const text=req.postData(),input=text?JSON.parse(text):null,isDecision=req.method()==='POST'&&(url.pathname===base||url.pathname.endsWith('/coverage/decision'));
  const entry={method:req.method(),path:url.pathname,bodyKeys:input?Object.keys(input).sort():[],status:null};result.http.push(entry);
  if(failReadback&&req.method()==='GET'&&url.pathname===base){failReadback=false;entry.status=503;entry.fault='readback';return await route.fulfill({status:503,contentType:'application/json',body:'{"error":"Synthetic unavailable readback"}'});}
  if(isDecision&&replyFault==='refuse'){replyFault=null;entry.status=403;entry.fault='refused retry';return await route.fulfill({status:403,contentType:'application/json',body:'{"error":"Synthetic current access refusal"}'});}
  const response=await f.dispatch(url.pathname+url.search,req.method(),text??undefined),value=await response.json();entry.status=response.status;assert.match(response.headers.get('cache-control'),/private.*no-store/);
  if(staleReadback&&req.method()==='GET'&&url.pathname===base&&response.status===200){staleReadback=false;entry.fault='stale readback';value.revision=0;}
  if(url.pathname.endsWith('/coverage')&&response.status===200)lastCoverage=value;
  if(isDecision){wires.push(text);if(response.status===200){result.receipts.push({circleId:value.circleId,requestIdSha256:sha(value.requestId),bodySha256:sha(text),action:value.decision.action,reportCount:value.decision.report_count,revision:value.revision,hidden:value.hidden,replayed:value.replayed});
   if(replyFault){entry.fault=replyFault;const fault=replyFault;replyFault=null;if(fault==='drop')return await route.abort();if(fault==='circle')value.circleId=f.secondCircleId;if(fault==='request')value.requestId=randomUUID();if(fault==='count')value.decision.report_count++;if(fault==='session')value.sessionId=randomUUID();}
  }}
  await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:JSON.stringify(value)});
 }catch(error){result.errors.push(error.stack||String(error));try{await route.abort();}catch{}}})();pending.add(work);work.finally(()=>pending.delete(work));return work;});
 const button=name=>page.getByRole('button',{name,exact:true}),full=()=>page.getByRole('region',{name:'Full report review',exact:true}),settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const idle=async()=>{await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Load assigned Circles'&&!b.disabled));await settle();};
 const retain=(node,event='onClick')=>node.evaluate((node,event)=>window.reviewerRetainedQa.retain(node,event),event),invoke=id=>page.evaluate(id=>window.reviewerRetainedQa.invoke(id),id);
 async function open(second=false){await button('Load assigned Circles').click();await idle();await button('Review '+(second?f.secondCircleTitle:f.circleTitle)).click();await idle();}
 async function prepare(action='restore',quote=f.description){await page.getByLabel('Decision',{exact:true}).selectOption(action);await page.getByLabel('Reason based on conduct',{exact:true}).selectOption(action==='hide'?'safety':'no_violation');if(action==='hide')await page.getByLabel('Exact excerpt supporting this reason',{exact:true}).fill(quote);await page.getByLabel('Host-facing explanation',{exact:true}).fill('The human reviewer checked all current reports and explained the conduct finding.');await page.locator('fieldset').getByRole('checkbox').check();}
 await page.goto(ORIGIN);await page.evaluate(()=>window.reviewerRetainedQa.show('listing'));await idle();assert.equal(result.http.length,0);await open();assert.equal(await page.getByLabel('Decision',{exact:true}).isDisabled(),true);
 pass('listing queue and case load require explicit actions; the101-report preview does not permit a decision');
 await button('Start full case review').click();await idle();let acknowledgements=0;while(await button('Acknowledge this report page').count()){await full().getByRole('checkbox').check();await button('Acknowledge this report page').click();await idle();acknowledgements++;}
 assert.equal(acknowledgements,3);assert.equal(lastCoverage.totalReports,101);assert.equal(lastCoverage.complete,true);
 pass('all101 reports require three deliberate bounded acknowledgements before the listing decision form opens');
 await prepare('hide',f.circleTitle+'\n'+f.description);let at=result.http.length;await button('Save reviewed decision').click();await idle();assert.equal(result.http.length,at);assert.equal((await f.counts()).decisions,0);await page.getByText(/A listing excerpt must be within its title or its description/).waitFor();
 pass('an excerpt spanning title and description is rejected locally without a write');
 await page.getByLabel('Exact excerpt supporting this reason',{exact:true}).fill(f.description);await page.locator('fieldset').getByRole('checkbox').check();const oldForm=await retain(page.locator('form'),'onSubmit');replyFault='circle';await button('Save reviewed decision').click();await idle();await button('Retry exact decision').waitFor();assert.equal((await f.counts()).decisions,1);assert.equal((await f.counts()).open,0);assert(!(await page.getByRole('status').innerText()).includes('Decision saved.'));
 pass('a successful server decision delivered with the wrong Circle cannot confirm the outcome');
 replyFault='request';await button('Retry exact decision').click();await idle();await button('Retry exact decision').waitFor();assert.equal(wires[0],wires[1]);assert.equal((await f.counts()).decisions,1);
 pass('a wrong request identifier also leaves the exact decision uncertain and creates no duplicate');
 failReadback=true;await button('Retry exact decision').click();await idle();assert.equal(wires[0],wires[2]);await page.getByText(/Decision saved and confirmed by its receipt/).waitFor();assert.equal(await button('Retry exact decision').count(),0);
 pass('the correct exact replay confirms the101-report outcome even when fresh case readback fails');
 await open();await prepare();replyFault='drop';await button('Save reviewed decision').click();await idle();await button('Retry exact decision').waitFor();assert.equal((await f.counts()).decisions,2);const restoreWire=wires.at(-1),staleRetry=await retain(button('Retry exact decision'));
 replyFault='refuse';await button('Retry exact decision').click();await idle();await button('Retry exact decision').waitFor();assert((await page.getByRole('status').innerText()).includes('even if this retry was refused'));
 pass('a lost ordinary decision receipt enables deliberate exact retry; a refused retry does not erase uncertainty about the earlier send');
 // An independent later reviewer action changes current visibility and revision.
 const fresh=await(await f.dispatch(base)).json();const later=await f.dispatch(base,'POST',{expectedRevision:fresh.revision,requestId:randomUUID(),action:'hide',reason:'safety',summary:'A separate human review identified a current conduct issue.',evidenceReportId:null,evidenceExcerpt:f.circleTitle});assert.equal(later.status,200);await f.addListingReports(f.circleId,1);
 replyFault='count';await button('Retry exact decision').click();await idle();await button('Retry exact decision').waitFor();assert.equal(wires.at(-1),restoreWire);
 pass('an incorrect original report count cannot confirm a replay after a later decision');
 replyFault='session';await button('Retry exact decision').click();await idle();await button('Retry exact decision').waitFor();assert.equal(wires.at(-1),restoreWire);
 pass('an unexpected coverage session cannot confirm an ordinary decision receipt');
 staleReadback=true;await button('Retry exact decision').click();await idle();assert.equal(wires.at(-1),restoreWire);await page.getByText(/Decision saved and confirmed by its receipt/).waitFor();assert.equal(await button('Retry exact decision').count(),0);assert.equal(await page.getByRole('region',{name:'Current Circle review',exact:true}).count(),0);
 pass('a correctly bound replay confirms the original request while an older-than-receipt case read is refused');
 await open();await page.getByText('Currently hidden from the directory.',{exact:true}).waitFor();assert.deepEqual(await f.counts(),{total:102,open:1,decisions:3});
 pass('an explicit fresh read displays the later hidden state and new report without changing the original confirmed outcome');
 await open(true);await prepare();at=result.http.length;await invoke(oldForm);await invoke(staleRetry);await settle();assert.equal(result.http.length,at);assert.equal((await f.counts(f.secondCircleId)).decisions,0);assert.equal(await button('Save reviewed decision').isDisabled(),false);
 pass('retained prior-case submission and retry controls cannot act on a different enabled listing');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);for(const b of await page.locator('button:visible').all())assert((await b.boundingBox()).height>=44);await page.screenshot({path:path.join(ROOT,PREFIX+'-320.png'),fullPage:true});result.evidenceHashes[PREFIX+'-320.png']=sha(read(PREFIX+'-320.png'));
 await page.evaluate(()=>window.reviewerRetainedQa.holdCredentials());await button('Load assigned Circles').click();await settle();await page.evaluate(()=>window.dispatchEvent(new Event('blur')));at=result.http.length;await page.evaluate(()=>window.reviewerRetainedQa.releaseCredentials());await settle();assert.equal(result.http.length,at);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await idle();assert.equal(result.http.length,at);
 pass('320px controls fit; blur retires held credential work and return to focus performs no automatic request');
 await page.evaluate(()=>window.reviewerRetainedQa.unmount());await settle();assert.equal(await page.evaluate(()=>window.reviewerRetainedQa.listeners.size),0);assert.equal(f.providerCalls.length,0);assert.deepEqual(result.errors,[]);result.providerCalls=0;result.caseCounts=await f.counts();result.status='PASS';
}catch(error){result.status='FAIL';result.failure=error.stack||String(error);}
finally{
 if(page)await page.evaluate(()=>window.reviewerRetainedQa?.releaseCredentials()).catch(()=>{});await bounded(()=>Promise.allSettled([...pending])).catch(error=>{result.status='FAIL';result.failure??=String(error);});
 if(browser){await bounded(()=>browser.close());result.cleanup.browser='closed';}if(f){await bounded(()=>f.close());result.cleanup.database='closed';}
 try{assert.deepEqual(result.errors,[]);for(const[n,h]of Object.entries({...result.sourceHashes,...result.runtimeHashes,...result.evidenceHashes}))assert.equal(sha(read(n)),h,'Input changed '+n);}catch(error){result.status='FAIL';result.failure??=error.stack||String(error);}
 result.completedAt=new Date().toISOString();write();
}
console.log(JSON.stringify({status:result.status,stories:result.stories.length,http:result.http.length,errors:result.errors,failure:result.failure,cleanup:result.cleanup}));process.exitCode=result.status==='PASS'?0:1;
