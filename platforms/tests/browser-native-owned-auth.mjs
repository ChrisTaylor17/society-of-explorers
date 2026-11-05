import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const [run,...extra]=process.argv.slice(2);
if(extra.length||(run!==undefined&&(run.length>64||run.split('-').some(part=>!part||/[^a-z0-9]/.test(part)))))throw Error('Expected one optional evidence run name');
const suffix=run?'-'+run:'',fixtureDir='verification/web/evidence/native-owned-auth-fixture'+suffix;
const ROOT=process.cwd(),file='verification/web/evidence/native-owned-auth-browser'+suffix+'.json',sha=b=>createHash('sha256').update(b).digest('hex');
if(run&&fs.existsSync(file))throw Error('Evidence run already exists');
function read(name){const p=path.resolve(ROOT,name),s=fs.lstatSync(p);assert(s.isFile()&&!s.isSymbolicLink()&&(!s.size||s.blocks),'Refuse linked/offloaded source '+name);return fs.readFileSync(p);}
function runtime(p){const s=fs.statSync(p);assert(s.size&&s.blocks,'Refuse offloaded runtime');}
async function bounded(fn,ms=5000){let timer;try{return await Promise.race([fn(),new Promise((_,no)=>timer=setTimeout(()=>no(Error('Owned operation timed out')),ms))]);}finally{clearTimeout(timer);}}
read('verification/web/tests/support/public-profile-app.mjs');
process.chdir(path.join(ROOT,'verification/web'));
const {createPublicProfileApp,publicProfileAppHashes,ORIGIN,PROVIDER,PUBLIC_KEY,ACCESS,SUBJECTS,NEW_SUBJECT}=await import('../../verification/web/tests/support/public-profile-app.mjs');
const priorReceipt=fs.existsSync(path.join(ROOT,file))?{sha256:sha(read(file)),receipt:JSON.parse(read(file))}:null,startedAt=new Date().toISOString(),stories=[],errors=[],unexpected=[],http=[],cleanup={browser:'pending',database:'pending'};
let sourceHashes={},bundle,browser,page,fixture,failure=null,actor='author',mismatch=false,denied=false,stats;
function write(status){fs.writeFileSync(path.join(ROOT,file),JSON.stringify({status,startedAt,completedAt:new Date().toISOString(),stories,errors,unexpected,http,cleanup,sourceHashes,bundleSHA256:bundle?sha(bundle):null,stats,priorReceipt,failure,
 scope:'Actual native App/OwnedAccountScreen, official cached AuthClient 2.99.3, owned-auth controller, native JS auth/member ports, MemberCircleScreen and ContributionsScreen. Canonical bearer/account/setup/contribution/message handlers and actual member identity uniqueness/Circle SQL execute in disposable PGlite. Native module/secure storage/AppState/connectivity/React Native primitives and provider delivery/server token verification are synthetic. SDK executes in Chromium, not Hermes. No issued credential, provider configuration/sign-in, native compilation/Codegen/OS storage/network, production SQL, Google flow or device acceptance.'},null,2)+'\n');}
const pass=name=>{stories.push(name);write('RUNNING');console.log('PASS '+stories.length+': '+name);};write('RUNNING');
try{
 assert(process.execArgv.some(v=>v.endsWith('/deny-build-network.cjs')),'Startup network denial required');
 const require=createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');runtime(require.resolve('playwright'));
 const executablePath='/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';runtime(executablePath);
 bundle=read(fixtureDir+'/page.js');sourceHashes={...JSON.parse(read(fixtureDir+'/source-manifest.json')).sourceHashes,...await publicProfileAppHashes(),'platforms/tests/browser-native-owned-auth.mjs':sha(read('platforms/tests/browser-native-owned-auth.mjs'))};
 for(const[n,h]of Object.entries(sourceHashes))assert.equal(sha(read(n)),h,'Rebundle changed source '+n);
 fixture=await createPublicProfileApp();
 browser=await require('playwright').chromium.launch({headless:true,timeout:15000,executablePath,env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:'/Users/christaylor'},args:['--disable-background-networking','--disable-component-update','--no-first-run']});
 const context=await browser.newContext({viewport:{width:320,height:850}});page=await context.newPage();const p=page;p.setDefaultTimeout(6500);
 p.on('pageerror',e=>errors.push(e.stack||String(e)));p.on('console',m=>{if(m.type()==='error'&&!/^Failed to load resource: the server responded with a status of (400|401|403|409|422|429|503)/.test(m.text()))errors.push(m.text());});
 await context.route('**/*',async route=>{try{
  const req=route.request(),u=new URL(req.url());
  if(u.origin===ORIGIN&&u.pathname==='/'){await route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#101d1a;font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif"><div id="root"></div><script type="module" src="/page.mjs"></script></body></html>'});return;}
  if(u.origin===ORIGIN&&u.pathname==='/page.mjs'){await route.fulfill({contentType:'text/javascript',body:bundle});return;}
  const headers=await req.allHeaders();assert.equal(headers.cookie,undefined);
  if(u.origin===PROVIDER){
   assert.equal(headers.apikey,PUBLIC_KEY);let status=200,body;
   const user=id=>({id,aud:'authenticated',role:'authenticated',email:'PRIVATE_PROVIDER_EMAIL',app_metadata:{provider:'email'},user_metadata:{private:'PRIVATE_PROVIDER_PROFILE'},identities:[],created_at:'2026-01-01T00:00:00Z'});
   if(u.pathname==='/auth/v1/token'&&req.method()==='POST'){
    const input=JSON.parse(req.postData());assert(['?grant_type=password','?grant_type=refresh_token'].includes(u.search));
    const refresh=u.search==='?grant_type=refresh_token';
    if(refresh){assert.equal(input.refresh_token,'NONISSUED_SYNTHETIC_REFRESH');assert.deepEqual(Object.keys(input),['refresh_token']);}
    else{assert.equal(input.email,actor==='new'?'new@example.test':'member@example.test');assert.equal(input.password,'Synthetic-password-only-42');assert.deepEqual(input.gotrue_meta_security,{});assert.deepEqual(Object.keys(input).sort(),['email','gotrue_meta_security','password']);}
    if(denied){status=400;body={code:'invalid_credentials',msg:'PRIVATE_PROVIDER_RAW_DETAIL'};}
    else body={access_token:actor==='new'?ACCESS.new:refresh?ACCESS.rotated:ACCESS.author,refresh_token:'NONISSUED_SYNTHETIC_REFRESH',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:user(actor==='new'?NEW_SUBJECT:SUBJECTS.author)};
    http.push({kind:'provider',path:u.pathname+u.search,method:req.method(),status,bodyKeys:Object.keys(input).sort()});
   }else if(u.pathname==='/auth/v1/user'&&req.method()==='GET'){
    assert.equal(u.search,'');const bearer=headers.authorization?.slice(7);assert(Object.values(ACCESS).includes(bearer));body=user(mismatch?SUBJECTS.other:bearer===ACCESS.new?NEW_SUBJECT:SUBJECTS.author);http.push({kind:'provider',path:u.pathname,method:'GET',status,exactTokenRecognized:true});
   }else{unexpected.push(u.origin+u.pathname+u.search);await route.abort();return;}
   await route.fulfill({status,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)});return;
  }
  if(u.origin===ORIGIN&&(u.pathname.startsWith('/api/auth/')||u.pathname.startsWith('/api/circles/'))){
   assert(Object.values(ACCESS).some(token=>headers.authorization==='Bearer '+token));const response=await fixture.dispatch(u.pathname+u.search,{method:req.method(),headers,body:req.postData()??undefined});
   http.push({kind:'member',path:u.pathname+u.search,method:req.method(),status:response.status,body:req.postData()??null});await route.fulfill({status:response.status,headers:{'content-type':'application/json','cache-control':'private, no-store'},body:await response.text()});return;
  }
  unexpected.push(u.origin+u.pathname);await route.abort();
 }catch(error){errors.push(error.stack||String(error));try{await route.abort();}catch{}}});
 await p.goto(ORIGIN);
 const button=name=>p.getByRole('button',{name,exact:true}),field=name=>p.getByLabel(name,{exact:true});
 const settle=()=>p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const state=()=>p.evaluate(()=>({stats:window.nativeQa.stats(),requests:window.nativeQa.requests}));
 const enabled=name=>p.waitForFunction(name=>[...document.querySelectorAll('button')].some(x=>x.getAttribute('aria-label')===name&&!x.disabled),name);
 async function show({network='online',who='author',preserve=false}={}){
  await p.evaluate(()=>window.nativeQa.unmount());await settle();if(!preserve){await fixture.close();fixture=await createPublicProfileApp();}actor=who;mismatch=false;denied=false;
  await p.evaluate(({network,preserve})=>window.nativeQa.show(network,preserve),{network,preserve});await button('Connect my account').waitFor();await settle();
 }
 async function connect(){await button('Connect my account').click();await field('Email').waitFor();await settle();}
 async function fill(){await field('Email').fill(actor==='new'?'new@example.test':'member@example.test');await field('Password').fill('Synthetic-password-only-42');}
 async function signIn(){await fill();await button('Sign in').click();await enabled('Continue to my member account');await settle();}
 async function account(){await button('Continue to my member account').click();await enabled('Check my member account');await button('Check my member account').click();await enabled('View my contributions');}
 async function contributions(){await button('View my contributions').click();await enabled('Load my posted messages');await button('Load my posted messages').click();await button('Check this contribution').first().waitFor();}
 await p.evaluate(()=>window.nativeQa.showUnconfigured());await button('Connect my account').click();await p.getByText('Sign-in is unavailable in this build. Your account has not been connected.',{exact:true}).waitFor();assert.equal((await state()).stats.prepared,0);assert.equal((await state()).stats.reads,0);assert.equal((await state()).requests.length,0);assert.equal(await field('Password').count(),0);
 pass('registered default factory refuses an absent native module without invented configuration, SDK storage access or provider/member requests');
 for(const retirement of ['blur','unmount']){
  await show();await p.evaluate(()=>window.nativeQa.holdPreparation());await button('Connect my account').click();await p.waitForFunction(()=>window.nativeQa.stats().preparationHeld);
  await p.evaluate(kind=>{if(kind==='blur')window.nativeQa.activity('blur');else window.nativeQa.unmount();},retirement);await settle();await p.evaluate(()=>window.nativeQa.releasePreparation());await p.waitForFunction(()=>window.nativeQa.stats().connectionsClosed===1);assert.equal(await field('Password').count(),0);assert.equal((await state()).requests.length,0);assert.equal((await state()).stats.reads,0);assert.equal((await state()).stats.netListeners,0);
 }
 pass('a prepared account connection delivered after blur or unmount is closed instead of attaching observers, reading storage or exposing sign-in controls');
 await show();assert.deepEqual((await state()).requests,[]);assert.equal((await state()).stats.prepared,0);assert.equal((await state()).stats.reads,0);await connect();assert.equal((await state()).stats.prepared,1);assert.equal((await state()).stats.reads,0);assert.deepEqual((await state()).requests,[]);assert.equal(await field('Password').getAttribute('type'),'password');
 pass('actual App default branch performs no preparation/storage/provider/member request at mount; explicit Connect prepares the account controller through native JS ports without a storage/provider call, with a masked password field');
 await signIn();assert.equal(await field('Email').inputValue(),'');assert.equal(await field('Password').inputValue(),'');let current=await state();assert.deepEqual(current.requests.map(r=>[r.kind,r.path]),[['provider','/auth/v1/token?grant_type=password'],['provider','/auth/v1/user']]);assert(current.stats.storedSlots.includes('session'));assert.doesNotMatch(await p.locator('body').innerText(),/PRIVATE_PROVIDER|NONISSUED_|73111111/);
 await fixture.leave();await fixture.quarantine();await account();assert.equal(await button('Continue to Circle').count(),0);assert.equal((await state()).requests.filter(r=>r.kind==='member').length,1);await contributions();const own=(await fixture.state()).message.content;await p.getByText(own,{exact:true}).waitFor();
 const beforeSelect=http.length;await button('Check this contribution').first().click();await button('Withdraw my message').waitFor();
 assert.equal(http.slice(beforeSelect).filter(r=>r.method==='GET'&&r.path==='/api/circles/'+fixture.circleId+'/messages/'+fixture.messageId&&r.status===200).length,1);
 assert.equal(await button('Withdraw my message').isDisabled(),true);
 await p.getByRole('checkbox',{name:'I understand withdrawal removes this message from member views and cannot be undone here',exact:true}).click();await button('Withdraw my message').click();await p.getByText('Withdrawal confirmed. The message is removed from member views; restricted safety evidence may remain.',{exact:true}).waitFor();
 assert.equal((await fixture.state()).message.visibility,'withdrawn');
 pass('real AuthClient password exchange and exact-token verification precede explicit canonical member check; account-wide contributions work after leaving/quarantine without configured Circle, and acknowledged withdrawal executes canonical SQL');
 await show({who:'new'});await connect();await signIn();await button('Continue to my member account').click();await enabled('Check my member account');await button('Check my member account').click();await p.getByRole('checkbox',{name:'I want to set up a member record for this signed-in account',exact:true}).waitFor();assert.equal(await button('Set up my member account').isDisabled(),true);
 await p.getByRole('checkbox',{name:'I want to set up a member record for this signed-in account',exact:true}).click();await button('Set up my member account').click();await enabled('View my contributions');current=await state();assert.deepEqual(current.requests.filter(r=>r.kind==='member').map(r=>[r.method,r.path]),[['GET','/api/auth/member'],['POST','/api/auth/ensure-member'],['GET','/api/auth/member']]);assert.deepEqual(current.requests.find(r=>r.path==='/api/auth/ensure-member').bodyKeys,[]);const created=(await fixture.rows()).filter(r=>r.supabase_auth_id===NEW_SUBJECT);assert.equal(created.length,1);assert.equal(created[0].tier,'free');assert.equal(created[0].exp_tokens,0);
 pass('new verified provider subject requires acknowledgement and exact empty-body setup, executes unique-subject SQL, and becomes ready only after fresh canonical member readback');
 await show();await connect();mismatch=true;await fill();await button('Sign in').click();await p.waitForFunction(()=>window.nativeQa.requests.some(r=>r.path==='/auth/v1/user'&&r.status===200));await enabled('Restore saved sign-in');assert.equal(await button('Continue to my member account').isDisabled(),true);assert.equal((await state()).requests.filter(r=>r.kind==='member').length,0);assert.doesNotMatch(await p.locator('body').innerText(),/PRIVATE_PROVIDER|73222222/);
 pass('successful token delivery with a different exact-token user is refused before account access, with no subject/profile disclosure');
 for(const retirement of ['blur','offline','background']){
  await show();await connect();await fill();await p.evaluate(kind=>{if(kind==='offline')window.nativeQa.network('offline');else if(kind==='background')window.nativeQa.activity('change','background');else window.nativeQa.activity('blur');},retirement);await settle();assert.equal(await field('Password').inputValue(),'');assert.equal(await field('Email').inputValue(),'');assert.equal((await state()).requests.length,0);
  await p.evaluate(()=>{window.nativeQa.network('online');window.nativeQa.activity('change','active');window.nativeQa.activity('focus');});await settle();assert.equal((await state()).requests.length,0);
 }
 pass('typed email/password retire on Android blur, background and offline; returning active/online never signs in or restores automatically');
 for(const endpoint of ['/auth/v1/token','/auth/v1/user']){
  await show();await connect();await p.evaluate(path=>window.nativeQa.hold(path),endpoint);await fill();await button('Sign in').click();await p.waitForFunction(path=>window.nativeQa.requests.some(r=>r.path.startsWith(path)&&r.held),endpoint);
  await p.evaluate(()=>window.nativeQa.activity('blur'));await settle();assert.equal(await field('Password').inputValue(),'');await p.evaluate(()=>window.nativeQa.release());await settle();assert.equal(await button('Continue to my member account').isDisabled(),true);assert.equal((await state()).requests.filter(r=>r.kind==='member').length,0);const count=(await state()).requests.length;
  await p.evaluate(()=>window.nativeQa.activity('focus'));await settle();assert.equal((await state()).requests.length,count);
 }
 pass('late password-token and exact-user replies after blur cannot restore ready/private UI or start member reads; foreground return does not replay the operation');
 await show();await connect();await signIn();await account();await contributions();const content=(await fixture.state()).message.content;await p.getByText(content,{exact:true}).waitFor();const before=(await state()).requests.length;await p.evaluate(()=>window.nativeQa.network('offline'));await field('Password').waitFor();assert.equal(await p.getByText(content,{exact:true}).count(),0);await p.evaluate(()=>window.nativeQa.network('online'));await settle();assert.equal((await state()).requests.length,before);
 pass('offline retirement from the composed private contributions view returns to sign-in and removes private content; connectivity recovery fetches nothing');
 await show();await connect();await signIn();await p.evaluate(()=>window.nativeQa.unmount());await settle();await p.evaluate(()=>window.nativeQa.expireSaved());await show({preserve:true});assert.equal((await state()).requests.length,0);await connect();assert.equal((await state()).requests.length,0);await button('Restore saved sign-in').click();await enabled('Continue to my member account');current=await state();assert.deepEqual(current.requests.map(r=>r.path),['/auth/v1/token?grant_type=refresh_token','/auth/v1/user']);assert.equal(current.requests.filter(r=>r.kind==='member').length,0);
 pass('fresh app construction does not restore over the network; explicit restore of expired protected storage uses actual SDK refresh rotation and fresh user verification without a member fetch');
 const providerBefore=(await state()).requests.length;await p.evaluate(()=>window.nativeQa.network('offline'));await enabled('Clear sign-in from this device');await button('Clear sign-in from this device').click();await p.waitForFunction(()=>window.nativeQa.stats().resets===1);await settle();assert.deepEqual((await state()).stats.storedSlots,[]);assert.equal((await state()).requests.length,providerBefore);assert.equal(await button('Continue to my member account').isDisabled(),true);
 await show({preserve:true});await connect();await button('Restore saved sign-in').click();await enabled('Restore saved sign-in');assert.equal((await state()).requests.length,0);assert.equal(await button('Continue to my member account').isDisabled(),true);
 pass('offline device clear advances the native storage epoch and clears saved sessions without provider logout; a fresh explicit restore finds no session and cannot resurrect the account');
 await show();await connect();await signIn();await p.evaluate(()=>window.nativeQa.resetUnknown());await button('Clear sign-in from this device').click();await p.waitForFunction(()=>window.nativeQa.stats().resets===1);await settle();assert.equal(await button('Continue to my member account').isDisabled(),true);assert.match(await p.locator('body').innerText(),/could not|uncertain|unknown|not confirmed|unavailable/i);assert.equal((await state()).requests.filter(r=>r.path.includes('logout')).length,0);
 pass('lost durable local-clear receipt remains unavailable/uncertain, never claims provider revocation and never retains account entry');
 await show();await connect();denied=true;await fill();await button('Sign in').click();await enabled('Restore saved sign-in');assert.equal(await field('Password').inputValue(),'');assert.equal((await state()).requests.length,1);assert.equal(await button('Continue to my member account').isDisabled(),true);assert.doesNotMatch(await p.locator('body').innerText(),/PRIVATE_PROVIDER_RAW_DETAIL/);
 pass('provider rejection is sanitized, clears password input, performs no automatic retry and grants no account access');
 await show();await connect();await signIn();const switchBefore=(await state()).requests.length;await field('Email').fill('invalid-replacement-email');await field('Password').fill('Synthetic-password-only-42');await button('Sign in').click();await settle();assert.equal((await state()).requests.length,switchBefore);assert.equal(await field('Email').inputValue(),'');assert.equal(await field('Password').inputValue(),'');assert.equal(await button('Continue to my member account').isDisabled(),true);await enabled('Restore saved sign-in');await button('Restore saved sign-in').click();await enabled('Continue to my member account');assert.deepEqual((await state()).requests.slice(switchBefore).map(r=>r.path),['/auth/v1/user']);
 pass('invalid replacement sign-in clears fields and old readiness without a provider call; the previous saved identity requires explicit restore and fresh verification before Continue');
 await show({network:'unknown'});await connect();assert.equal(await button('Sign in').isDisabled(),true);assert.equal((await state()).requests.length,0);await p.evaluate(()=>window.nativeQa.network('online'));await settle();assert.equal((await state()).requests.length,0);await field('Email').focus();await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Password');
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);const heights=await p.locator('button:visible').evaluateAll(xs=>xs.map(x=>x.getBoundingClientRect().height));assert(heights.every(h=>h>=48));await p.screenshot({path:path.join(ROOT,'verification/web/evidence/native-owned-auth-320'+suffix+'.png'),fullPage:true});await button('Close sign-in').click();await settle();assert.equal((await state()).stats.netListeners,0);assert.equal((await state()).stats.handles,0);await p.evaluate(()=>window.nativeQa.unmount());await settle();stats=await state();assert.equal(stats.stats.netListeners,0);assert.equal(stats.stats.appListeners,0);assert.equal(stats.stats.handles,0);
 pass('unknown connectivity refuses sign-in; keyboard order, masked input, 48px actions and 320px layout work with explicit DOM doubles; Close disposes all app/connectivity observers and request handles');
 assert(!http.some(r=>r.path.includes('/book-salons/')||r.path.includes('/join')||r.path.includes('/logout')));assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);for(const[n,h]of Object.entries(sourceHashes))assert.equal(sha(read(n)),h,'Source changed during proof '+n);
}catch(error){failure=error.stack||String(error);}finally{
 write(failure?'FAIL':'CLEANING_UP');try{if(page)await bounded(()=>page.evaluate(()=>{window.nativeQa?.release();window.nativeQa?.releasePreparation();window.nativeQa?.unmount();}));}catch{}
 try{if(browser)await bounded(()=>browser.close());cleanup.browser=browser?'closed':'not-created';}catch(error){cleanup.browser='failed';failure??=error.stack||String(error);}
 try{if(fixture)await bounded(()=>fixture.close());cleanup.database=fixture?'closed':'not-created';}catch(error){cleanup.database='failed';failure??=error.stack||String(error);}
 try{assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);for(const[n,h]of Object.entries(sourceHashes))assert.equal(sha(read(n)),h,'Source changed during cleanup '+n);}catch(error){failure??=error.stack||String(error);}write(failure?'FAIL':'PASS');
}
if(failure)throw Error(failure);console.log('PASS native app-owned authentication: '+stories.length+' stories.');
