import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const ROOT=process.cwd(),[variant,run,probe,...extra]=process.argv.slice(2);
assert(!extra.length&&['native','quest'].includes(variant)&&/^[a-z0-9-]{1,48}$/.test(run)&&[undefined,'--failure-probe'].includes(probe));
assert(process.execArgv.some(v=>v.endsWith('/deny-build-network.cjs')));
const dir=path.join(ROOT,'verification/web/evidence/platform-admission-'+variant+'-'+run);
const output=path.join(ROOT,'verification/web/evidence/platform-admission-'+variant+'-'+run+(probe?'-failure-probe':'')+'-browser.json');
assert(!fs.existsSync(output));
const sha=b=>createHash('sha256').update(b).digest('hex');
const sourceHashes=JSON.parse(fs.readFileSync(path.join(dir,'source-manifest.json'))).sourceHashes;
sourceHashes['platforms/tests/browser-platform-admission.mjs']=sha(fs.readFileSync(new URL(import.meta.url)));
const stories=[],http=[],errors=[],unexpected=[],cleanup={browser:false,database:false};
let fixture,browser,page,actor,circle,host,recipient,failure,lost=null,failed=false;
const scope=variant==='native'
 ?'Actual MemberCircleScreen,retained member connection,directory,admission screen/controller and native JS ports with actual local route/SQL. React Native,provider,bridge and network delivery are explicit doubles. No installed app,device,Hermes,secure store or native HTTP acceptance.'
 :'Actual QuestCircle,web invitation component/hook,platform DOM and XR canvas with actual local route/SQL. Provider SDK,Next Link,network delivery and XR session/input are explicit doubles. No physical Quest or real-provider acceptance.';
const write=status=>fs.writeFileSync(output,JSON.stringify({status,scope,stories,http,errors,unexpected,cleanup,sourceHashes,failure},null,2)+'\n');
const pass=label=>{stories.push(label);console.log('PASS '+stories.length+': '+label);write('RUNNING');};
try{
 for(const[name,hash]of Object.entries(sourceHashes))assert.equal(sha(fs.readFileSync(path.join(ROOT,name))),hash,name);
 process.chdir(path.join(ROOT,'verification/web'));
 const {admissionApp,IDS}=await import('../../verification/web/tests/support/circle-admission-app.mjs');
 host=IDS.newcomer;recipient=IDS.reader;
 const require=createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');
 browser=await require('playwright').chromium.launch({headless:true,timeout:15000,
  executablePath:'/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:'/Users/christaylor'},
  args:['--disable-background-networking','--disable-component-update','--no-first-run','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:390,height:850},serviceWorkers:'block'});page=await context.newPage();page.setDefaultTimeout(10000);
 page.on('pageerror',e=>errors.push(String(e)));
 if(variant==='quest')await context.addCookies([{url:'https://offline.invalid',name:'soe_auth_intent',value:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',secure:true,sameSite:'Lax'}]);
 await context.route('**/*',async route=>{
  try{
   const request=route.request(),url=new URL(request.url());
   if(url.origin!=='https://offline.invalid'){unexpected.push(url.origin+url.pathname);await route.abort();return;}
   if(url.pathname==='/'){await route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><style>[hidden]{display:none!important}body{margin:0;background:#101d1a;color:#f4f2e5}main{box-sizing:border-box;max-width:1100px;margin:auto}button{min-height:48px}textarea,input{box-sizing:border-box;max-width:100%}a{color:#eed6a0}canvas{max-width:100%}</style></head><body><div id="root"></div><script src="/page.js"></script></body></html>'});return;}
   const filename=path.basename(url.pathname);
   if(url.pathname==='/'+filename&&/^[A-Za-z0-9_.-]+\.(?:js|css)$/.test(filename)&&fs.existsSync(path.join(dir,filename))){await route.fulfill({contentType:filename.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(path.join(dir,filename))});return;}
   if(url.pathname==='/favicon.ico'){await route.fulfill({status:204});return;}
   assert(fixture,'No synthetic database');
   const headers=await request.allHeaders();
   assert.equal(headers.apikey,undefined);
   let sender=actor;
   if(variant==='native'){
    assert.equal(headers.cookie,undefined);assert(headers.authorization?.startsWith('Bearer NONISSUED_NATIVE_'));
    sender=headers.authorization.slice('Bearer NONISSUED_NATIVE_'.length);assert([host,recipient].includes(sender));
   }else if(headers.authorization)assert.equal(headers.authorization,'Bearer NONISSUED_QUEST_'+actor);
   assert([host,recipient].includes(sender));fixture.setActor(sender);
   const body=request.postData()?JSON.parse(request.postData()):undefined;
   const entry={path:url.pathname,method:request.method(),actor:sender,bodySha256:sha(request.postData()??''),keys:body?Object.keys(body):[],status:null};http.push(entry);
   if(url.pathname==='/api/auth/member'){
    assert.equal(request.method(),'GET');assert.equal(url.search,'');entry.status=200;
    await route.fulfill({contentType:'application/json',body:JSON.stringify({member:{id:sender,supabase_auth_id:sender,display_name:sender===host?'Synthetic phone host':'Synthetic reader'},auth:{provider:'supabase',subject:sender}})});return;
   }
   assert.equal(url.search,'','Codes never enter query strings');
   const admission=/^\/api\/circles\/[a-f0-9-]+\/(admission-access|recipient-code|invitation-review|invitations|invitation-check|join-invited|invitation-receipt|invitations\/revoke)$/.test(url.pathname);
   assert(admission||/^\/api\/circles\/[a-f0-9-]+$/.test(url.pathname),'Unexpected API path '+url.pathname);
   const response=admission?await fixture.dispatchAdmission(url.pathname,{method:request.method(),body}):await fixture.dispatch(url.pathname,request.method(),body);
   entry.status=response.status;
   if(lost&&url.pathname.endsWith('/'+lost)&&response.status===200){lost=null;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic post-commit reply loss',outcome:'unknown'})});return;}
   await route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
  }catch(error){errors.push(String(error));try{await route.abort();}catch{}}
 });
 await page.goto('https://offline.invalid');await page.bringToFront();
 const button=name=>page.getByRole('button',{name,exact:true});
 const sharing='I choose to share my member name and account reference with this salon’s host.';
 const confirmation='I reviewed the account, recipient and effects above and want this invitation action.';
 const nativeReady=()=>page.waitForFunction(()=>window.nativeAdmissionQa.model()?.access&&!window.nativeAdmissionQa.model()?.busy);
 async function accountRoot(){
  await button('Check existing sign-in').click();await button('Check my member account').click();
  await page.waitForFunction(()=>window.nativeAdmissionQa.accountModel()?.canOpenCircle);
 }
 async function nativeOpen(platform,memberId){
  actor=memberId;await page.evaluate(value=>window.nativeAdmissionQa.show(value),{circleId:circle,memberId,platform,mode:'root'});
  await accountRoot();
  if(await button('Return to private salon invitation').count())await button('Return to private salon invitation').click();
  else{await button('Open selected Circle').click();await button('Salon invitations and host approvals').click();}
  await button('Check invitation access').click();await nativeReady();
 }
 async function nativeResume(platform){
  await page.evaluate(platform=>window.nativeAdmissionQa.activity('active',platform==='android'?'focus':'change'),platform);
  await accountRoot();await button('Return to private salon invitation').click();await button('Check invitation access').click();await nativeReady();
 }
 async function pauseNative(platform){
  await page.evaluate(platform=>window.nativeAdmissionQa.activity(platform==='android'?'active':'background',platform==='android'?'blur':'change'),platform);
  await page.getByRole('heading',{name:'Your member account',exact:true}).waitFor();
  const cleared=await page.evaluate(()=>{const m=window.nativeAdmissionQa.model();return m?.review===null&&m?.approvalText===''&&m?.recipientCode===''&&m?.access===null;});
  assert.equal(cleared,true,'Background retirement clears the retained private model');
 }
 async function newFixture(){
  if(fixture)await fixture.close();fixture=await admissionApp();circle=(await fixture.create()).circleId;
  if(probe)throw Error('Intentional browser-runner failure probe after database setup');
 }
 if(variant==='native'){
  await page.waitForFunction(()=>window.nativeAdmissionQa);
  for(const platform of ['ios','android']){
   await newFixture();const start=http.length;await nativeOpen(platform,recipient);
   assert.equal(http.slice(start).filter(v=>v.path.endsWith('/recipient-code')).length,0);
   await page.getByRole('checkbox',{name:sharing,exact:true}).click();await button('Create my sharing code').click();
   const codeNode=page.getByLabel('My one-hour sharing code',{exact:true});await codeNode.waitFor();const code=await codeNode.innerText();assert.match(code,/^soe-cr1\./);
   await nativeOpen(platform,host);await page.getByLabel('Recipient sharing code',{exact:true}).fill(code);await button('Review recipient').click();
   await page.getByRole('checkbox',{name:confirmation,exact:true}).waitFor();assert.equal(await button('Issue approval code').isDisabled(),true);
   await page.getByRole('checkbox',{name:confirmation,exact:true}).click();await button('Issue approval code').click();
   const approval=page.getByLabel('Approval code for the reviewed recipient',{exact:true});await approval.waitFor();const token=await approval.innerText();assert.match(token,/^soe-ci1\./);
   pass(platform+' member account → selected salon → invitations supports explicit sharing and host review/confirmed approval through real routes/SQL.');
   await nativeOpen(platform,recipient);await page.getByLabel('Host approval code',{exact:true}).fill(token);await button('Review my approval').click();
   await page.getByRole('checkbox',{name:confirmation,exact:true}).click();const old=await page.evaluate(()=>window.nativeAdmissionQa.retain('Confirm join'));
   await pauseNative(platform);await nativeResume(platform);assert.equal(await page.getByLabel('Host approval code',{exact:true}).inputValue(),'');
   await page.getByLabel('Host approval code',{exact:true}).fill(token);await button('Review my approval').click();await page.getByRole('checkbox',{name:confirmation,exact:true}).click();
   const before=http.length;await page.evaluate(id=>window.nativeAdmissionQa.invoke(id),old);await page.waitForTimeout(50);assert.equal(http.length,before,'A stale confirmation cannot act on a new review');
   await page.screenshot({path:path.join(dir,platform+'-join-review.png'),fullPage:true});
   lost='join-invited';await button('Confirm join').click();await page.waitForFunction(()=>window.nativeAdmissionQa.model()?.uncertain&&!window.nativeAdmissionQa.model()?.busy);
   await pauseNative(platform);await nativeResume(platform);await button('Check earlier invitation result').click();
   await page.waitForFunction(()=>/earlier join was recorded/.test(window.nativeAdmissionQa.model()?.message??''));
   const sent=http.slice(start);assert.equal(sent.filter(v=>v.path.endsWith('/join-invited')).length,1);
   assert.deepEqual(sent.find(v=>v.path.endsWith('/invitation-receipt')).keys,['expectedMemberId','requestId','expectedRevision','approvalNonce','proofHash']);
   assert.equal((await fixture.db.query('SELECT count(*)::int n FROM book_cohort_members WHERE cohort_id=$1',[circle])).rows[0].n,2);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:path.join(dir,platform+'-recovered.png'),fullPage:true});
   pass(platform+' background/blur clears review and codes; stale confirmation is inert; a lost join survives retained-parent reentry and recovers read-only with one join.');
   await nativeOpen(platform,host);await button('Review revocation').click();await page.getByRole('checkbox',{name:confirmation,exact:true}).click();
   lost='invitations/revoke';await button('Confirm revocation').click();await page.waitForFunction(()=>window.nativeAdmissionQa.model()?.uncertain&&!window.nativeAdmissionQa.model()?.busy);
   await button('Check invitation access').click();await nativeReady();await button('Check earlier invitation result').click();
   await page.getByRole('checkbox',{name:confirmation,exact:true}).click();await button('Confirm revocation').click();
   await page.waitForFunction(()=>/Revocation recorded/.test(window.nativeAdmissionQa.model()?.message??''));
   const retries=http.slice(start).filter(v=>v.path.endsWith('/invitations/revoke'));assert.equal(retries.length,2);assert.equal(retries[0].bodySha256,retries[1].bodySha256);
   assert.equal((await fixture.db.query('SELECT count(*)::int n FROM book_cohort_members WHERE cohort_id=$1',[circle])).rows[0].n,2);
   pass(platform+' host revocation deliberately retries the exact request after a lost reply and preserves current members.');
   await button('Discard private invitation view and return').click();
   await page.getByRole('heading',{name:'Your member account',exact:true}).waitFor();
   assert.equal(await button('Return to private salon invitation').count(),0);
   assert.equal(await page.evaluate(()=>window.nativeAdmissionQa.model()===undefined),true);
   pass(platform+' explicit discard clears the retained private controller and returns to the real member screen.');
   await page.evaluate(()=>window.nativeAdmissionQa.close());
  }
 }else{
  await page.waitForFunction(()=>window.questAdmissionQa&&window.questXrQa);await newFixture();
  async function questOpen(memberId){
   actor=memberId;await page.evaluate(value=>window.questAdmissionQa.show(value),{memberId,circleId:circle});
   await button('Connect signed-in account').waitFor();const before=http.length,calls=await page.evaluate(()=>window.questAdmissionQa.providerCalls());
   await page.waitForTimeout(30);assert.equal(http.length,before);assert.equal(await page.evaluate(()=>window.questAdmissionQa.providerCalls()),calls);
   assert.equal(await page.getByRole('heading',{name:'Salon invitations',exact:true}).count(),0);
   await page.evaluate(()=>window.questXrQa.enable());await button('Connect signed-in account').click();await button('Check invitation access').click();
   await page.getByText('Current account and salon access checked. Codes are shared only when you explicitly choose.',{exact:true}).waitFor();
  }
  await questOpen(recipient);await page.getByRole('checkbox',{name:sharing,exact:true}).check();await button('Create my sharing code').click();
  const codeField=page.getByLabel('My one-hour sharing code',{exact:true});await codeField.waitFor();const code=await codeField.inputValue();
  await page.evaluate(()=>window.questXrQa.hold());await page.locator('#quest-immersive-enter').click();await page.waitForFunction(()=>window.questXrQa.stats().held);
  assert.equal(await button('Check invitation access').isDisabled(),true);assert.equal(await page.getByLabel('My one-hour sharing code',{exact:true}).count(),0);
  assert.equal(await page.getByLabel('Host approval code',{exact:true}).count(),0);
  const paused=http.length;await page.evaluate(()=>window.questXrQa.release());await page.waitForFunction(()=>window.questXrQa.stats().draws>0);
  assert.equal(http.length,paused,'Opening XR never transmits an invitation');await page.locator('#quest-immersive-exit').click();
  await button('Check invitation access').click();await page.getByLabel('Host approval code',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('Host approval code',{exact:true}).inputValue(),'');
  pass('Actual QuestCircle does no private/provider work before Connect; permission-pending and active immersive entry clear private codes/review and require a fresh regular-window check after exit.');
  await questOpen(host);await page.getByLabel('Recipient sharing code',{exact:true}).fill(code);await button('Review recipient').click();
  await page.getByRole('checkbox',{name:/I reviewed the account, recipient and effects above/}).check();await button('Issue approval code').click();
  const approval=page.getByLabel('Approval code for the reviewed recipient',{exact:true});await approval.waitFor();const token=await approval.inputValue();
  await questOpen(recipient);await page.getByLabel('Host approval code',{exact:true}).fill(token);await button('Review my approval').click();
  await page.getByRole('checkbox',{name:/I reviewed the account, recipient and effects above/}).check();lost='join-invited';await button('Confirm join').click();
  await page.getByText(/The result is uncertain/).waitFor();await button('Check invitation access').click();await button('Check earlier invitation result').click();
  await page.getByText('Your earlier join was recorded. Check current salon access; membership may have changed since then.',{exact:true}).waitFor();
  assert.equal(http.filter(v=>v.path.endsWith('/join-invited')).length,1);
  assert.equal((await fixture.db.query('SELECT count(*)::int n FROM book_cohort_members WHERE cohort_id=$1',[circle])).rows[0].n,2);
  pass('Quest regular-window sharing,host approval,recipient confirmation and lost-join read-only recovery use current routes/SQL and create one membership.');
  await button('Check invitation access').click();await page.getByText('You are currently a member.',{exact:false}).waitFor();
  await page.evaluate(()=>window.questXrQa.online(false));await page.getByText(/Private codes, recipient names and review cleared/).waitFor();
  await page.evaluate(()=>window.questXrQa.online(true));await button('Check invitation access').click();
  await page.evaluate(()=>window.questAdmissionQa.providerChanged());
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Connect signed-in account'&&!b.disabled));
  await page.waitForFunction(()=>window.questAdmissionQa.subscriptions()===0);
  assert.equal(await page.getByRole('heading',{name:'Salon invitations',exact:true}).count(),0);assert.equal(await page.evaluate(()=>window.questAdmissionQa.subscriptions()),0);
  pass('Quest offline/account change clears the invitation view; account disconnect ends that connected view and removes SDK observers.');
  await page.screenshot({path:path.join(dir,'quest-disconnected.png'),fullPage:true});await page.evaluate(()=>window.questAdmissionQa.close());
 }
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
 for(const[name,hash]of Object.entries(sourceHashes))assert.equal(sha(fs.readFileSync(path.join(ROOT,name))),hash,name);
}catch(error){failed=true;failure=String(error.stack??error);console.error(failure);}
finally{
 try{if(browser){await browser.close();cleanup.browser=true;}}catch(e){failed=true;errors.push(String(e));}
 try{if(fixture){await fixture.close();cleanup.database=true;}}catch(e){failed=true;errors.push(String(e));}
 // A WASM runtime may update process.exitCode during close. Keep failure in an
 // owned flag and set the final status only after all independent cleanup.
 const status=failed||failure||errors.length||unexpected.length?'FAIL':'PASS';
 write(status);process.exitCode=status==='FAIL'?1:0;
}
