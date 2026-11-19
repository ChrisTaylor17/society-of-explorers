import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';

const ROOT=process.cwd(),PREFIX='verification/web/evidence/native-message-reviewer',sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=name=>{const p=path.isAbsolute(name)?name:path.join(ROOT,name),s=fs.lstatSync(p);assert(s.isFile()&&!s.isSymbolicLink()&&(!s.size||s.blocks),'Unavailable input '+name);return fs.readFileSync(p);};
const PASSWORD='PRIVATE_NATIVE_REVIEW_PASSWORD_42',EMAIL='PRIVATE_NATIVE_REVIEW@example.invalid',REFRESH='PRIVATE_NATIVE_REVIEW_REFRESH',NOTE='PRIVATE_NATIVE_REVIEW_REPORT';
const secrets=new Set([PASSWORD,EMAIL,REFRESH,NOTE]),redact=value=>{let text=String(value);for(const secret of secrets)text=text.split(secret).join('[redacted]');return text;};
const file=PREFIX+'-browser.json';let priorReceipt=null;
if(fs.existsSync(path.join(ROOT,file))){const bytes=read(file),archive=PREFIX+'-prior-'+Date.now()+'.json';fs.writeFileSync(path.join(ROOT,archive),bytes);priorReceipt={path:archive,sha256:sha(bytes),status:JSON.parse(bytes).status};}
const result={status:'RUNNING',startedAt:new Date().toISOString(),stories:[],http:[],coverage:[],receipts:[],errors:[],sourceHashes:{},runtimeHashes:{},evidenceHashes:{},priorReceipt,cleanup:{browser:'pending',database:'pending'},
 scope:'Actual registered native App, OwnedAccountScreen, MemberCircleScreen, MessageReviewsScreen, portable reviewer controller, strict dedicated native JavaScript reviewer port and cached AuthClient2.99.3 in Chromium. Canonical member identity and reviewer queue/detail/coverage/decision/advice handlers execute against current disposable PGlite SQL. Provider exact-token verification, reviewer actor resolution, PostgREST delivery, React Native primitives/lifecycle, protected store and native transport are explicit doubles. No Kotlin, Codegen, Hermes, device, issued credentials, real AI provider or production SQL acceptance.'};
const write=()=>{const text=JSON.stringify(result,null,2)+'\n';for(const secret of secrets)assert(!text.includes(secret),'Private sentinel in evidence');fs.writeFileSync(path.join(ROOT,file),text);};
const pass=story=>{result.stories.push(story);write();console.log('PASS '+result.stories.length+': '+story);};
async function bounded(work,ms=10000){let timer;try{return await Promise.race([work(),new Promise((_,no)=>timer=setTimeout(()=>no(Error('Owned operation timed out')),ms))]);}finally{clearTimeout(timer);}}
let browser,page,f,dropAck=false,dropDecision=false,failCaseRead=false,lastCoverage=null;
const pending=new Set(),decisionWires=[],coverageIds=new Map();write();
try{
 assert(process.execArgv.some(v=>v.endsWith('/deny-build-network.cjs')),'Network startup guard required');
 const bundle=read(PREFIX+'-fixture/page.js'),manifest=JSON.parse(read(PREFIX+'-fixture/source-manifest.json'));
 Object.assign(result.sourceHashes,manifest.sourceHashes);Object.assign(result.runtimeHashes,manifest.runtimeHashes);
 for(const n of ['page.js','source-manifest.json'])result.evidenceHashes[PREFIX+'-fixture/'+n]=sha(read(PREFIX+'-fixture/'+n));
 for(const n of ['platforms/tests/browser-native-message-reviewer.mjs','verification/web/scripts/deny-build-network.cjs','verification/web/tests/support/native-reviewer-app.mjs','verification/web/tests/support/public-profile-app.mjs'])result.sourceHashes[n]=sha(read(n));
 process.chdir(path.join(ROOT,'verification/web'));
 const mod=await import('../../verification/web/tests/support/native-reviewer-app.mjs'),identity=await import('../../verification/web/tests/support/public-profile-app.mjs');
 Object.assign(result.sourceHashes,await mod.nativeReviewerSourceHashes());
 const {ORIGIN,PROVIDER,PUBLIC_KEY,ACCESS,SUBJECTS}=identity;for(const value of Object.values(ACCESS))secrets.add(value);
 f=await mod.nativeReviewerApp({reportCount:101});
 const base=`/api/admin/circles/${f.circleId}/messages/${f.messageId}`;
 const playwrightRoot='/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/',require=createRequire(playwrightRoot+'playwright/package.json');
 const executablePath='/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
 for(const n of [process.execPath,executablePath,...['playwright/package.json','playwright/index.js','playwright-core/package.json','playwright-core/index.js','playwright-core/browsers.json','playwright-core/lib/bootstrap.js','playwright-core/lib/coreBundle.js','playwright-core/lib/utilsBundle.js'].map(n=>playwrightRoot+n)])result.runtimeHashes[n]=sha(read(n));
 for(const[n,h]of Object.entries({...result.sourceHashes,...result.runtimeHashes}))assert.equal(sha(read(n)),h,'Stale input '+n);
 browser=await require('playwright').chromium.launch({headless:true,executablePath,env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:'/Users/christaylor'},args:['--disable-background-networking','--disable-component-update','--no-first-run']});
 const context=await browser.newContext({viewport:{width:320,height:850},serviceWorkers:'block',acceptDownloads:false});page=await context.newPage();page.setDefaultTimeout(7000);
 page.on('pageerror',error=>result.errors.push(redact(error.stack||error)));
 page.on('console',message=>{if([...secrets].some(secret=>message.text().includes(secret)))result.errors.push('Private sentinel in console');});
 const user={id:SUBJECTS.author,aud:'authenticated',role:'authenticated',email:EMAIL,app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
 await context.route('**/*',route=>{const work=(async()=>{const request=route.request(),url=new URL(request.url());try{
  if(url.origin===ORIGIN&&url.pathname==='/')return await route.fulfill({headers:{'content-type':'text/html','referrer-policy':'no-referrer'},body:'<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#101d1a;font-family:system-ui"><div id="root"></div><script type="module" src="/page.js"></script></body></html>'});
  if(url.origin===ORIGIN&&url.pathname==='/page.js')return await route.fulfill({contentType:'text/javascript',body:bundle});
  const headers=await request.allHeaders(),method=request.method(),body=request.postData();assert.equal(headers.cookie,undefined);assert.equal(headers.referer,undefined);
  if(url.origin===PROVIDER){assert.equal(headers.apikey,PUBLIC_KEY);let reply;
   if(url.pathname+url.search==='/auth/v1/token?grant_type=password'){assert.equal(method,'POST');const input=JSON.parse(body);assert.equal(input.email,EMAIL);assert.equal(input.password,PASSWORD);reply={access_token:ACCESS.author,refresh_token:REFRESH,token_type:'bearer',expires_in:3600,user};}
   else{assert.equal(url.pathname+url.search,'/auth/v1/user');assert.equal(method,'GET');assert.equal(headers.authorization,'Bearer '+ACCESS.author);reply=user;}
   result.http.push({kind:'provider-double',method,path:url.pathname,status:200});return await route.fulfill({contentType:'application/json',body:JSON.stringify(reply)});
  }
  assert.equal(url.origin,ORIGIN);assert.equal(headers.authorization,'Bearer '+ACCESS.author);f.setActor(f.authorId);
  const input=body?JSON.parse(body):null,entry={kind:url.pathname.startsWith('/api/admin/')?'reviewer':'member',method,path:url.pathname,bodyKeys:input?Object.keys(input).sort():[],status:null,...(body?{bodySha256:sha(body)}:{})};result.http.push(entry);
  if(failCaseRead&&method==='GET'&&url.pathname===base){failCaseRead=false;entry.status=503;entry.deliveryFault='decision-readback';return await route.fulfill({status:503,headers:{'content-type':'application/json','cache-control':'private, no-store'},body:'{"error":"Synthetic readback unavailable"}'});}
  const response=url.pathname==='/api/auth/member'?await f.memberDispatch(url.pathname,{method,headers,body:body??undefined}):await f.dispatch(url.pathname+url.search,method,body??undefined);
  const bytes=await response.text();entry.status=response.status;assert.match(response.headers.get('cache-control'),/private.*no-store/);
  const value=JSON.parse(bytes);
  if(url.pathname.endsWith('/coverage')&&response.status===200){lastCoverage=value;let ids=coverageIds.get(value.sessionId);if(!ids){ids=new Set();coverageIds.set(value.sessionId,ids);}for(const report of value.reports)ids.add(report.id);
   result.coverage.push({method,page:value.pageNumber,reviewed:value.reviewedReports,total:value.totalReports,reports:value.reports.length,acknowledged:value.acknowledged,complete:value.complete,sessionSha256:sha(value.sessionId)});
  }
  if(method==='POST'&&(url.pathname===base||url.pathname.endsWith('/coverage/decision'))){decisionWires.push(body);if(response.status===200)result.receipts.push({bodySha256:sha(body),requestIdSha256:sha(value.requestId),action:value.decision.action,reportCount:value.decision.report_count,replayed:value.replayed,revision:value.safety.revision,visibility:value.safety.visibility});}
  if(dropAck&&method==='POST'&&url.pathname.endsWith('/coverage')&&input?.action==='ack'){dropAck=false;entry.droppedAfterCommit=true;return await route.abort();}
  if(dropDecision&&method==='POST'&&(url.pathname===base||url.pathname.endsWith('/coverage/decision'))){dropDecision=false;entry.droppedAfterCommit=true;return await route.abort();}
  await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:bytes});
 }catch(error){result.errors.push(redact(error.stack||error));try{await route.abort();}catch{}}})();pending.add(work);work.finally(()=>pending.delete(work));return work;});
 const button=name=>page.getByRole('button',{name,exact:true}),settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const enabled=name=>page.waitForFunction(name=>[...document.querySelectorAll('button')].some(b=>b.getAttribute('aria-label')===name&&!b.disabled),name);
 const state=()=>page.evaluate(()=>window.nativeReviewerQa.stats()),retain=locator=>locator.evaluate(node=>window.nativeReviewerQa.retain(node)),invoke=ids=>page.evaluate(ids=>ids.forEach(id=>window.nativeReviewerQa.invoke(id)),ids);
 const coverageCheck=()=>page.getByRole('checkbox',{name:'I have read every report on this page',exact:true});
 const decisionCheck=()=>page.getByRole('checkbox',{name:'I reviewed the current evidence and confirm this human decision',exact:true});
 async function signIn(enter=true){await button('Connect my account').click();await page.getByLabel('Email',{exact:true}).fill(EMAIL);await page.getByLabel('Password',{exact:true}).fill(PASSWORD);await button('Sign in').click();await enabled('Continue to my member account');await button('Continue to my member account').click();await enabled('Check my member account');await button('Check my member account').click();await enabled('View my contributions');if(enter){await enabled('Check assigned message reviews');await button('Check assigned message reviews').click();await enabled('Load assigned message reviews');}}
 async function openCase(id=f.messageId){await button('Load assigned message reviews').click();await enabled('Load assigned message reviews');f.setActor(f.authorId);const queue=await(await f.dispatch('/api/admin/circles/messages')).json();const index=queue.items.findIndex(item=>item.messageId===id);assert(index>=0,'Expected assigned case');await button('Review message in Assigned native review Circle').nth(index).click();await enabled('Refresh current review case');}
 async function acknowledge(){await coverageCheck().click();await enabled('Acknowledge this report page');await button('Acknowledge this report page').click();await enabled('Refresh review progress');}
 async function fillHide(excerpt){await page.getByRole('radio',{name:'Hide message',exact:true}).click();await page.getByRole('radio',{name:'Safety',exact:true}).click();await page.getByLabel('Explanation shown to the author',{exact:true}).fill('A human reviewed the complete case and identified a specific conduct concern.');await page.getByLabel('Exact evidence excerpt',{exact:true}).fill(excerpt);await decisionCheck().click();await enabled('Submit human decision');}
 async function refreshConfirmed(){await button('Refresh current review case').click();await enabled('Refresh current review case');}

 await page.goto(ORIGIN);await button('Connect my account').waitFor();await settle();assert.equal((await state()).prepared,0);assert.equal(result.http.length,0);
 await signIn();assert.equal(result.http.filter(x=>x.kind==='member').length,1);assert.equal(result.http.some(x=>x.kind==='reviewer'),false);
 await openCase();assert.equal(await button('Submit human decision').isDisabled(),true);assert.equal(await button('Request AI observations').isDisabled(),true);assert(!(await page.locator('body').innerText()).includes(NOTE));
 pass('actual registered App requires explicit sign-in, canonical member proof, reviewer entry, queue and fresh case; the 101-report preview grants no decision or AI authority');

 await button('Start full case review').click();await enabled('Refresh review progress');assert.equal(lastCoverage.reports.length,50);assert.equal(lastCoverage.reviewedReports,0);
 await coverageCheck().click();await enabled('Acknowledge this report page');const staleAck=[await retain(button('Acknowledge this report page')),await retain(coverageCheck()),await retain(button('Refresh review progress')),await retain(button('Back to assigned reviews')),await retain(button('Return to member account')),await retain(button('Close member view'))];
 await coverageCheck().click();let at=result.http.length;await invoke(staleAck);await settle();assert.equal(result.http.length,at);assert.equal(await coverageCheck().getAttribute('aria-checked'),'false');assert.equal(await button('Acknowledge this report page').isDisabled(),true);
 pass('unchanged-case retained enabled acknowledgement, checkbox and navigation callbacks are inert after unchecking');

 dropAck=true;await acknowledge();await page.getByText(/The page or acknowledgement reply was not confirmed and may still complete/).waitFor();at=result.http.length;await settle();assert.equal(result.http.length,at);
 await button('Refresh review progress').click();await enabled('Refresh review progress');assert.equal(lastCoverage.reviewedReports,50);assert.equal(lastCoverage.pageNumber,2);assert.equal(lastCoverage.complete,false);
 at=result.http.length;await invoke(staleAck);await settle();assert.equal(result.http.length,at);await acknowledge();assert.equal(lastCoverage.reviewedReports,100);assert.equal(lastCoverage.reports.length,1);assert.equal(await button('Submit human decision').isDisabled(),true);await acknowledge();
 assert.equal(lastCoverage.reviewedReports,101);assert.equal(lastCoverage.complete,true);assert.equal(coverageIds.get(lastCoverage.sessionId).size,101);
 pass('lost committed page acknowledgement triggers no retry; manual progress recovers the real frontier and all 101 distinct reports are acknowledged in 50/50/1 pages');

 await button('Previous report page').click();await enabled('Refresh review progress');await button('Previous report page').click();await enabled('Refresh review progress');assert.equal(lastCoverage.pageNumber,1);assert.equal(lastCoverage.acknowledged,true);assert.equal(lastCoverage.reviewedReports,101);
 const selectedReport=lastCoverage.reports[0];await button('Use report 1 as evidence').click();await fillHide(selectedReport.note);
 const oldPrimarySubmit=await retain(button('Submit human decision')),staleDecision=[oldPrimarySubmit,await retain(decisionCheck()),await retain(button('Use report 1 as evidence')),await retain(button('Refresh current review case')),await retain(button('Back to assigned reviews'))];
 await page.getByLabel('Explanation shown to the author',{exact:true}).fill('A human reviewed every current report and identified a specific conduct concern.');at=result.http.length;await invoke(staleDecision);await settle();assert.equal(result.http.length,at);assert.equal(await decisionCheck().getAttribute('aria-checked'),'false');assert.equal(await button('Submit human decision').isDisabled(),true);
 pass('completed coverage permits revisiting earlier-page evidence; editing the same case invalidates an old enabled decision, evidence selector, confirmation and navigation callbacks');

 await decisionCheck().click();dropDecision=true;await button('Submit human decision').click();await enabled('Retry exact decision');assert.equal((await f.coverage.counts('message')).decisions,1);assert.equal((await f.coverage.counts('message')).open,0);at=result.http.length;await settle();assert.equal(result.http.length,at);
 failCaseRead=true;await button('Retry exact decision').click();await page.getByText('The decision was confirmed, but the current case could not be loaded. Refresh it manually before another decision.',{exact:true}).waitFor();
 assert.equal(decisionWires.length,2);assert.equal(decisionWires[0],decisionWires[1]);assert.equal(JSON.parse(decisionWires[0]).evidenceReportId,selectedReport.id);assert.equal(JSON.parse(decisionWires[0]).evidenceExcerpt,selectedReport.note);
 assert.equal(result.receipts[0].reportCount,101);assert.equal(result.receipts[1].replayed,true);assert.equal((await f.coverage.counts('message')).decisions,1);assert.equal(await button('Retry exact decision').count(),0);
 pass('lost committed decision is manually replayed with identical body and request ID exactly once; 101-report receipt confirms the outcome despite a failed subsequent case read');

 await refreshConfirmed();assert.equal(await button('Submit human decision').isDisabled(),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 for(const b of await page.locator('button:visible').all())assert((await b.boundingBox()).height>=44);await page.screenshot({path:path.join(ROOT,PREFIX+'-320.png'),fullPage:true});result.evidenceHashes[PREFIX+'-320.png']=sha(read(PREFIX+'-320.png'));
 pass('confirmed decision recovery is explicit; cleared choices require a fresh decision, 320px layout fits and visible controls meet 44px');

 await f.addReports(f.messageId,250);await refreshConfirmed();await button('Start full case review').click();await enabled('Refresh review progress');
 for(let n=0;n<5;n++){assert.equal(lastCoverage.reviewedReports,n*50);assert.equal(lastCoverage.reports.length,50);assert.equal(await button('Submit human decision').isDisabled(),true);await acknowledge();}
 assert.equal(lastCoverage.totalReports,250);assert.equal(lastCoverage.reviewedReports,250);assert.equal(coverageIds.get(lastCoverage.sessionId).size,250);
 await page.getByRole('radio',{name:'Lift moderator restriction',exact:true}).click();await page.getByRole('radio',{name:'Concern resolved',exact:true}).click();await page.getByLabel('Explanation shown to the author',{exact:true}).fill('A human reviewed all current reports and found the restriction can be lifted.');await decisionCheck().click();await button('Submit human decision').click();await page.getByText('Decision confirmed. Current case loaded; another decision requires a new review.',{exact:true}).waitFor();
 const counts=await f.coverage.counts('message');assert.deepEqual(counts,{total:351,open:0,decisions:2});assert.equal(result.receipts.at(-1).reportCount,250);assert.equal(result.receipts.at(-1).action,'restore');result.caseCounts=counts;
 pass('a second real 250-report case requires five explicit page acknowledgements and records one human restore decision covering all 250 reports');

 await button('Back to assigned reviews').click();await openCase(f.secondMessageId);await fillHide('second synthetic');const oldAdvice=await retain(button('Request AI observations')),oldSecondarySubmit=await retain(button('Submit human decision'));
 at=result.http.length;await invoke([oldPrimarySubmit]);await settle();assert.equal(result.http.length,at);assert.equal(await decisionCheck().getAttribute('aria-checked'),'true');await decisionCheck().click();await invoke([oldAdvice,oldSecondarySubmit]);await settle();assert.equal(result.http.length,at);assert.equal(await button('Submit human decision').isDisabled(),true);
 await button('Request AI observations').click();await enabled('Request AI observations');assert.equal(result.http.filter(x=>x.path.endsWith('/advice')).length,1);assert.equal(result.http.find(x=>x.path.endsWith('/advice')).status,503);assert.deepEqual(result.http.find(x=>x.path.endsWith('/advice')).bodyKeys,['contentHash','expectedRevision']);assert.equal(f.providerCalls.length,0);
 pass('enabled advice/decision callbacks retire after same-case unchecking and a prior-case decision cannot target a new case; one explicit AI request receives server-disabled refusal without a provider call');

 const retired=[await retain(button('Request AI observations')),await retain(button('Refresh current review case')),await retain(button('Close member view'))];await page.evaluate(()=>window.nativeReviewerQa.activity('blur'));await settle();assert(!(await page.locator('body').innerText()).includes(f.secondContent));assert(!(await page.locator('body').innerText()).includes(NOTE));at=result.http.length;await page.evaluate(()=>window.nativeReviewerQa.activity('focus'));await invoke(retired);await settle();assert.equal(result.http.length,at);
 await page.evaluate(()=>window.nativeReviewerQa.network('offline'));await page.evaluate(()=>window.nativeReviewerQa.network('online'));await invoke(retired);await settle();assert.equal(result.http.length,at);await page.evaluate(()=>window.nativeReviewerQa.unmount());await settle();await invoke(retired);await settle();assert.equal(result.http.length,at);assert.equal((await state()).handles,0);assert.equal((await state()).netListeners,0);assert.equal((await state()).appListeners,0);
 pass('native blur/focus, offline/reconnect and unmount clear private evidence, retire retained callbacks and issue no automatic requests; handles and listeners are disposed');

 await page.evaluate(()=>window.nativeReviewerQa.show({legacy:true}));await button('Connect my account').waitFor();await signIn(false);assert.equal(await button('Check assigned message reviews').isDisabled(),true);await page.getByText(/Assigned message reviews are unavailable in this app connection/).waitFor();assert.equal((await page.evaluate(()=>window.nativeReviewerQa.requests)).some(x=>x.kind==='reviewer'),false);
 pass('legacy bridge keeps the reviewer destination disabled with an honest browser fallback after the actual canonical member sign-in flow');

 await page.evaluate(()=>window.nativeReviewerQa.unmount());await settle();assert.equal(f.providerCalls.length,0);result.aiProviderCalls=0;assert.equal((await context.cookies()).length,0);assert.deepEqual(result.errors,[]);result.status='PASS';
}catch(error){result.status='FAIL';result.failure=redact(error.stack||error);if(page)result.failedView=redact(await page.locator('body').innerText().catch(()=>''));process.exitCode=1;}
finally{
 await bounded(()=>Promise.allSettled([...pending])).catch(error=>{result.status='FAIL';result.failure??=redact(error);process.exitCode=1;});
 if(page)await page.evaluate(()=>window.nativeReviewerQa?.unmount()).catch(()=>{});
 if(browser){await bounded(()=>browser.close());result.cleanup.browser='closed';}if(f){await bounded(()=>f.close());result.cleanup.database='closed';}
 try{assert.deepEqual(result.errors,[]);for(const[n,h]of Object.entries({...result.sourceHashes,...result.runtimeHashes,...result.evidenceHashes}))assert.equal(sha(read(n)),h,'Input changed '+n);}catch(error){result.status='FAIL';result.failure??=redact(error.stack||error);process.exitCode=1;}
 result.completedAt=new Date().toISOString();write();
}
console.log(JSON.stringify({status:result.status,stories:result.stories.length,http:result.http.length,coverage:result.coverage.length,receipts:result.receipts.length,errors:result.errors,failure:result.failure,cleanup:result.cleanup}));
process.exitCode=result.status==='PASS'?0:1;
