import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const ROOT=process.cwd(),PREFIX='verification/web/evidence/native-message-ai-consent',sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=name=>{const p=path.isAbsolute(name)?name:path.join(ROOT,name),s=fs.lstatSync(p);assert(s.isFile()&&!s.isSymbolicLink()&&(!s.size||s.blocks),'Unavailable source '+name);return fs.readFileSync(p);};
const PASSWORD='PRIVATE_NATIVE_CONSENT_PASSWORD_42',EMAIL='PRIVATE_NATIVE_CONSENT@example.invalid',REFRESH='PRIVATE_NATIVE_CONSENT_REFRESH';
const secrets=new Set([PASSWORD,EMAIL,REFRESH]),redact=value=>{let text=String(value);for(const secret of secrets)text=text.split(secret).join('[redacted]');return text;};
const file=PREFIX+'-browser.json';let priorReceipt=null;
if(fs.existsSync(path.join(ROOT,file))){const bytes=read(file),archive=PREFIX+'-prior-'+Date.now()+'.json';fs.writeFileSync(path.join(ROOT,archive),bytes);priorReceipt={path:archive,sha256:sha(bytes),status:JSON.parse(bytes).status};}
const result={status:'RUNNING',startedAt:new Date().toISOString(),stories:[],http:[],errors:[],sourceHashes:{},runtimeHashes:{},evidenceHashes:{},priorReceipt,cleanup:{browser:'pending',database:'pending'},
 scope:'Actual registered native App, OwnedAccountScreen, MemberCircleScreen, ContributionsScreen, portable consent and contribution controllers, strict native JavaScript ports and cached AuthClient2.99.3 in Chromium. Canonical member identity handler and publication-aware consent/message/contribution handlers run against current disposable PGlite SQL. Provider exact-token verification, message-route author resolution, PostgREST delivery, React Native primitives/lifecycle and OS protected store/transport are explicit doubles. No Kotlin compilation, Codegen, Hermes, issued credentials, production SQL, real provider or device acceptance.'};
const write=()=>{const text=JSON.stringify(result,null,2)+'\n';for(const secret of secrets)assert(!text.includes(secret),'Private sentinel in evidence');fs.writeFileSync(path.join(ROOT,file),text);};
const pass=story=>{result.stories.push(story);write();console.log('PASS '+result.stories.length+': '+story);};
async function bounded(work,ms=10000){let timer;try{return await Promise.race([work(),new Promise((_,no)=>timer=setTimeout(()=>no(Error('Owned operation timed out')),ms))]);}finally{clearTimeout(timer);}}
let browser,page,f,held=null,holdNext=false,dropNext=false;const pending=new Set();write();
try{
 assert(process.execArgv.some(v=>v.endsWith('/deny-build-network.cjs')),'Network startup guard required');
 const bundle=read(PREFIX+'-fixture/page.js'),manifest=JSON.parse(read(PREFIX+'-fixture/source-manifest.json'));
 Object.assign(result.sourceHashes,manifest.sourceHashes);Object.assign(result.runtimeHashes,manifest.runtimeHashes);
 for(const n of ['page.js','source-manifest.json'])result.evidenceHashes[PREFIX+'-fixture/'+n]=sha(read(PREFIX+'-fixture/'+n));
 for(const n of ['platforms/tests/browser-native-message-ai-consent.mjs','verification/web/scripts/deny-build-network.cjs','verification/web/tests/support/current-message-ai-consent-app.mjs','verification/web/tests/support/public-profile-app.mjs'])result.sourceHashes[n]=sha(read(n));
 process.chdir(path.join(ROOT,'verification/web'));
 const mod=await import('../../verification/web/tests/support/current-message-ai-consent-app.mjs');
 const identity=await import('../../verification/web/tests/support/public-profile-app.mjs');
 Object.assign(result.sourceHashes,await mod.currentConsentSourceHashes());
 const {ORIGIN,PROVIDER,PUBLIC_KEY,ACCESS,SUBJECTS}=identity;for(const value of Object.values(ACCESS))secrets.add(value);
 f=await mod.currentMessageAiApp({allowance:null});f.setAvailable(false);
 const secondText='A second owned native contribution for selection retirement.',second=await f.post({circleId:f.circleId,content:secondText});
 const messageRoute=f.app.load('app/api/circles/[circleId]/messages/[messageId]/route.ts'),consentRoute=f.app.load('app/api/circles/[circleId]/messages/[messageId]/ai-consent/route.ts');
 const consentPath=f.messagePath+'/ai-consent';
 async function dispatch(url,method,headers,body){
  assert.equal(headers.authorization,'Bearer '+ACCESS.author);f.setActor(f.authorId);
  if(url.pathname==='/api/auth/member')return f.memberDispatch(url.pathname,{method,headers,body:body??undefined});
  if(url.pathname==='/api/circles/contributions')return f.dispatch(url.pathname+url.search,method,body??undefined);
  const m=/^\/api\/circles\/([^/]+)\/messages\/([^/]+)(\/ai-consent)?$/.exec(url.pathname);assert(m,'Unexpected member route');
  const request=new Request(url,{method,headers,...(body==null?{}:{body})});
  return (m[3]?consentRoute:messageRoute)[method](request,{params:Promise.resolve({circleId:m[1],messageId:m[2]})});
 }
 const playwrightRoot='/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/',require=createRequire(playwrightRoot+'playwright/package.json');
 const executablePath='/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
 for(const n of [process.execPath,executablePath,...['playwright/package.json','playwright/index.js','playwright-core/package.json','playwright-core/index.js','playwright-core/browsers.json','playwright-core/lib/bootstrap.js','playwright-core/lib/coreBundle.js','playwright-core/lib/utilsBundle.js'].map(n=>playwrightRoot+n)])result.runtimeHashes[n]=sha(read(n));
 for(const[n,h]of Object.entries({...result.sourceHashes,...result.runtimeHashes}))assert.equal(sha(read(n)),h,'Stale input '+n);
 browser=await require('playwright').chromium.launch({headless:true,executablePath,env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:'/Users/christaylor'},args:['--disable-background-networking','--disable-component-update','--no-first-run']});
 const context=await browser.newContext({viewport:{width:320,height:850},serviceWorkers:'block',acceptDownloads:false});page=await context.newPage();page.setDefaultTimeout(7000);
 page.on('pageerror',error=>result.errors.push(redact(error.stack||error)));
 page.on('console',message=>{if([...secrets].some(secret=>message.text().includes(secret)))result.errors.push('Private sentinel in console');});
 const user={id:SUBJECTS.author,aud:'authenticated',role:'authenticated',email:EMAIL,app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
 await context.route('**/*',route=>{const work=(async()=>{const request=route.request(),url=new URL(request.url());let gate;try{
  if(url.origin===ORIGIN&&url.pathname==='/')return await route.fulfill({headers:{'content-type':'text/html','referrer-policy':'no-referrer'},body:'<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#101d1a;font-family:system-ui"><div id="root"></div><script type="module" src="/page.js"></script></body></html>'});
  if(url.origin===ORIGIN&&url.pathname==='/page.js')return await route.fulfill({contentType:'text/javascript',body:bundle});
  const headers=await request.allHeaders(),method=request.method();assert.equal(headers.cookie,undefined);assert.equal(headers.referer,undefined);
  if(url.origin===PROVIDER){assert.equal(headers.apikey,PUBLIC_KEY);let body;
   if(url.pathname+url.search==='/auth/v1/token?grant_type=password'){assert.equal(method,'POST');const input=JSON.parse(request.postData());assert.equal(input.email,EMAIL);assert.equal(input.password,PASSWORD);body={access_token:ACCESS.author,refresh_token:REFRESH,token_type:'bearer',expires_in:3600,user};}
   else{assert.equal(url.pathname+url.search,'/auth/v1/user');assert.equal(method,'GET');assert.equal(headers.authorization,'Bearer '+ACCESS.author);body=user;}
   result.http.push({kind:'provider-double',method,path:url.pathname,status:200});return await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  }
  assert.equal(url.origin,ORIGIN);const entry={kind:'member',method,path:url.pathname,bodyKeys:request.postData()?Object.keys(JSON.parse(request.postData())).sort():[],status:null};result.http.push(entry);
  if(holdNext&&url.pathname.endsWith('/ai-consent')&&method==='POST'){holdNext=false;let release;const promise=new Promise(resolve=>{release=resolve;});gate={release,done:false,status:null};held=gate;entry.held=true;await promise;}
  const response=await dispatch(url,method,headers,request.postData()),bytes=await response.text();entry.status=response.status;
  assert.match(response.headers.get('cache-control'),/private.*no-store/);if(url.pathname!=='/api/auth/member')assert.doesNotMatch(bytes,/PRIVATE_REPORT_NOTE|supabase_auth_id/);
  if(gate){gate.status=response.status;gate.done=true;}
  if(dropNext&&url.pathname.endsWith('/ai-consent')&&method==='POST'){dropNext=false;entry.droppedAfterCommit=true;return await route.abort();}
  try{await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:bytes});}catch(error){if(!gate)throw error;}
 }catch(error){result.errors.push(redact(error.stack||error));try{await route.abort();}catch{}}})();pending.add(work);work.finally(()=>pending.delete(work));return work;});
 const button=name=>page.getByRole('button',{name,exact:true}),settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const enabled=name=>page.waitForFunction(name=>[...document.querySelectorAll('button')].some(b=>b.getAttribute('aria-label')===name&&!b.disabled),name);
 const state=()=>page.evaluate(()=>window.nativeAiConsentQa.stats());
 const retain=locator=>locator.evaluate(node=>window.nativeAiConsentQa.retain(node));
 const invoke=ids=>page.evaluate(ids=>ids.forEach(id=>window.nativeAiConsentQa.invoke(id)),ids);
 async function signIn(){await button('Connect my account').click();await page.getByLabel('Email',{exact:true}).fill(EMAIL);await page.getByLabel('Password',{exact:true}).fill(PASSWORD);await button('Sign in').click();await enabled('Continue to my member account');await button('Continue to my member account').click();await enabled('Check my member account');await button('Check my member account').click();await enabled('View my contributions');await button('View my contributions').click();await enabled('Load my posted messages');}
 async function select(text=mod.CONTENT){await button('Load my posted messages').click();await enabled('Load my posted messages');f.setActor(f.authorId);const listed=await(await f.dispatch('/api/circles/contributions')).json();const id=text===secondText?second.id:f.messageId,index=listed.items.findIndex(item=>item.message.id===id);assert(index>=0,'Expected owned message in current page');await button('Check this contribution').nth(index).click();await enabled('Check current message state');}
 const check=async()=>{await enabled('Check current AI review permission');await button('Check current AI review permission').click();await enabled((await current()).allowed?'Revoke permission for this message':'Keep AI review off for this message');};
 const current=async()=>{f.setActor(f.authorId);const r=await f.dispatch(consentPath);assert.equal(r.status,200);return r.json();};
 const checkbox=()=>page.getByRole('checkbox',{name:'I read this policy and allow this message’s text to be sent to Anthropic for advisory review.',exact:true});
 async function choose(allow){if(allow)await checkbox().click();const allowed=(await current()).allowed;await button(allow?(allowed?'Reaffirm permission for this message':'Allow AI review for this message'):(allowed?'Revoke permission for this message':'Keep AI review off for this message')).click();}
 const confirmed=allow=>page.getByText(allow?'Permission confirmed for this message. This setting does not itself send the message.':'Future AI review is confirmed off. A review request already in progress may still transmit or complete; text already sent to Anthropic cannot be recalled.',{exact:true}).waitFor();
 const unknown=()=>page.getByText(/The change could not be confirmed and may still finish/).waitFor();
 async function release(){const g=held;assert(g);g.release();await bounded(async()=>{while(!g.done)await new Promise(r=>setTimeout(r,10));});held=null;await settle();return g;}
 await page.goto(ORIGIN);await button('Connect my account').waitFor();await settle();assert.equal((await state()).prepared,0);assert.equal(result.http.length,0);
 await signIn();assert.equal(result.http.filter(x=>x.kind==='member').length,1);assert.equal(result.http.some(x=>x.path.includes('contributions')),false);
 await select();assert.equal(result.http.some(x=>x.path.endsWith('/ai-consent')),false);await check();assert.equal((await current()).allowed,false);assert.equal((await current()).consentRevision,0);assert.equal(await button('Allow AI review for this message').isDisabled(),true);
 assert.match(await page.locator('body').innerText(),/Anthropic.*Claude/);assert.match(await page.locator('body').innerText(),/not anonymous or zero-retention/);
 pass('actual registered App requires explicit sign-in, canonical member proof, contribution load and consent check; legacy permission stays off without implicit provider invocation');
 await choose(false);await confirmed(false);assert.equal((await current()).consentRevision,1);await choose(true);await confirmed(true);assert.equal((await current()).allowed,true);await choose(false);await confirmed(false);assert.equal((await current()).consentRevision,3);
 pass('real current SQL records unchanged keep-off, fresh-checkbox allow and revoke; native flow confirms exact receipt with separate readback');
 await checkbox().click();const captured=[];for(const name of ['Allow AI review for this message','Keep AI review off for this message','Check current AI review permission','Check current message state','Back to my contributions','Return to member account','Close member view'])captured.push(await retain(button(name)));captured.push(await retain(checkbox()));
 await checkbox().click();let at=result.http.length;await invoke(captured);await settle();assert.equal(result.http.length,at);assert.equal(await checkbox().getAttribute('aria-checked'),'false');assert.equal(await button('Allow AI review for this message').isDisabled(),true);
 pass('all retained native callbacks including navigation are inert after unchecking; an old enabled Allow cannot regain authority');
 await page.getByRole('checkbox',{name:'I understand withdrawal removes this message from member views and cannot be undone here',exact:true}).click();await enabled('Withdraw my message');const oldWithdrawal=await retain(button('Withdraw my message'));await check();await checkbox().click();const old=[await retain(button('Allow AI review for this message')),await retain(checkbox()),await retain(button('Back to my contributions'))];await button('Back to my contributions').click();await select(secondText);await check();await checkbox().click();at=result.http.length;await invoke(old);await settle();assert.equal(result.http.length,at);assert.equal(await checkbox().getAttribute('aria-checked'),'true');await page.getByRole('checkbox',{name:'I understand withdrawal removes this message from member views and cannot be undone here',exact:true}).click();await enabled('Withdraw my message');at=result.http.length;await invoke([oldWithdrawal]);await settle();assert.equal(result.http.length,at);assert.equal(await button('Withdraw my message').isDisabled(),false);
 await button('Back to my contributions').click();await select();await check();at=result.http.length;await invoke(old);await settle();assert.equal(result.http.length,at);
 pass('selection and same-message recreation retire former callbacks; old enabled Allow and withdrawal stay inert even while the new contribution action is enabled');
 holdNext=true;await choose(true);await unknown();assert(held);await check();const before=(await current()).consentRevision;await choose(false);await confirmed(false);assert.equal((await current()).consentRevision,before+1);assert.equal((await release()).status,409);assert.equal((await current()).allowed,false);
 pass('a timed-out held enable cannot defeat a later explicit unchanged keep-off; actual SQL rejects the old revision');
 await choose(true);await confirmed(true);holdNext=true;await choose(false);await unknown();await check();assert.equal(await button('Reaffirm permission for this message').isDisabled(),true);await choose(true);await confirmed(true);assert.equal((await release()).status,409);assert.equal((await current()).allowed,true);
 pass('fresh explicit checkbox and reaffirmation fence an older held revoke with a real SQL conflict');
 dropNext=true;await choose(false);await unknown();at=result.http.length;await settle();assert.equal(result.http.length,at);await check();await page.getByText(/The earlier change is still uncertain/).waitFor();await choose(false);await confirmed(false);
 pass('a lost committed reply remains uncertain without automatic retry; a new read does not settle it, and a new explicit decision does');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);for(const b of await page.locator('button:visible').all())assert((await b.boundingBox()).height>=44);await page.screenshot({path:path.join(ROOT,PREFIX+'-320.png'),fullPage:true});result.evidenceHashes[PREFIX+'-320.png']=sha(read(PREFIX+'-320.png'));
 await choose(true);await confirmed(true);await page.getByRole('checkbox',{name:'I understand withdrawal removes this message from member views and cannot be undone here',exact:true}).click();await button('Withdraw my message').click();await page.getByText('This contribution was withdrawn.',{exact:true}).waitFor();await check();assert.equal(await checkbox().isDisabled(),true);await choose(false);await confirmed(false);assert.equal((await current()).allowed,false);
 pass('withdrawn author-owned messages retain explicit consent checking and revocation while enabling is unavailable; 320px layout fits and controls meet44px');
 const retired=[await retain(button('Check current AI review permission')),await retain(button('Keep AI review off for this message'))];await page.evaluate(()=>window.nativeAiConsentQa.network('offline'));await settle();assert(!((await page.locator('body').innerText()).includes(mod.CONTENT)));at=result.http.length;await page.evaluate(()=>window.nativeAiConsentQa.network('online'));await invoke(retired);await settle();assert.equal(result.http.length,at);
 await page.evaluate(()=>window.nativeAiConsentQa.unmount());await settle();await invoke(retired);await settle();assert.equal(result.http.length,at);assert.equal((await state()).handles,0);assert.equal((await state()).netListeners,0);assert.equal((await state()).appListeners,0);
 pass('offline and unmount retire private state and retained callbacks; reconnect alone sends nothing and native handles/listeners are disposed');
 await page.evaluate(()=>window.nativeAiConsentQa.show({legacy:true}));await button('Connect my account').waitFor();await signIn();await select(secondText);await page.getByText(/This app connection does not support changing AI review permission/).waitFor();assert.equal(await button('Check current AI review permission').count(),0);
 pass('legacy native bridge honestly omits unsupported author-consent actions after the same real App account flow');
 await page.evaluate(()=>window.nativeAiConsentQa.unmount());await settle();assert.equal(f.providerCalls.length,0);assert.equal(result.http.some(x=>x.path.endsWith('/advice')),false);result.aiProviderCalls=0;assert.equal((await context.cookies()).length,0);assert.deepEqual(result.errors,[]);result.status='PASS';
}catch(error){result.status='FAIL';result.failure=redact(error.stack||error);if(page)result.failedView=redact(await page.locator('body').innerText().catch(()=>''));process.exitCode=1;}
finally{
 if(held&&!held.done)held.release();await bounded(()=>Promise.allSettled([...pending])).catch(error=>{result.status='FAIL';result.failure??=redact(error);process.exitCode=1;});
 if(page)await page.evaluate(()=>window.nativeAiConsentQa?.unmount()).catch(()=>{});
 if(browser){await bounded(()=>browser.close());result.cleanup.browser='closed';}if(f){await bounded(()=>f.close());result.cleanup.database='closed';}
 try{assert.deepEqual(result.errors,[]);for(const[n,h]of Object.entries({...result.sourceHashes,...result.runtimeHashes,...result.evidenceHashes}))assert.equal(sha(read(n)),h,'Input changed '+n);}catch(error){result.status='FAIL';result.failure??=redact(error.stack||error);process.exitCode=1;}
 result.completedAt=new Date().toISOString();write();
}
console.log(JSON.stringify({status:result.status,stories:result.stories.length,http:result.http.length,errors:result.errors,failure:result.failure,cleanup:result.cleanup}));

process.exitCode=result.status==='PASS'?0:1;
