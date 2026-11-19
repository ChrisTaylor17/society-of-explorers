import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const ROOT=process.cwd(),file='verification/web/evidence/native-source-reading-browser.json',sha=b=>createHash('sha256').update(b).digest('hex');
function read(name){const p=path.resolve(ROOT,name),s=fs.lstatSync(p);assert(s.isFile()&&!s.isSymbolicLink()&&(!s.size||s.blocks),'Refuse linked/offloaded source '+name);return fs.readFileSync(p);}
function runtime(p){const s=fs.statSync(p);assert(s.size&&s.blocks,'Refuse offloaded runtime');}
async function bounded(fn,ms=5000){let timer;try{return await Promise.race([fn(),new Promise((_,no)=>timer=setTimeout(()=>no(Error('Owned operation timed out')),ms))]);}finally{clearTimeout(timer);}}
read('verification/web/tests/support/current-saved-public-profile-app.mjs');
process.chdir(path.join(ROOT,'verification/web'));
const {createSavedReadingApp,savedReadingAppHashes,ORIGIN,PROVIDER,PUBLIC_KEY,TOKENS:ACCESS,SUBJECTS,NEW_SUBJECT}=await import('../../verification/web/tests/support/current-saved-public-profile-app.mjs');
const priorReceipt=fs.existsSync(path.join(ROOT,file))?{sha256:sha(read(file)),status:JSON.parse(read(file)).status}:null,startedAt=new Date().toISOString(),stories=[],errors=[],unexpected=[],http=[],cleanup={browser:'pending',database:'pending'};
let holdNextPost=false,heldPost=null;
let sourceHashes={},bundle,browser,page,fixture,failure=null,actor='author',mismatch=false,denied=false,stats;
function write(status){fs.writeFileSync(path.join(ROOT,file),JSON.stringify({status,startedAt,completedAt:new Date().toISOString(),stories,errors,unexpected,http,cleanup,sourceHashes,bundleSHA256:bundle?sha(bundle):null,stats,priorReceipt,failure,
 scope:'Full source reader browser composition: actual SourceReadingScreen/controller/SourceReader wrapper, iframe Fabric double, real Hamlet source route and an available asset adapter (no Hamlet assets). All eight editions and 312 assets are verified separately by source-reader-fidelity-browser.json. Native resource fetching, hash enforcement, WebView lifecycle and rendering are NOT executed. Actual registered App, cached AuthClient, native JS member/saved-reading/anonymous-passage ports, saved-list and Circle reader. Canonical bearer/owner/progress/member/Circle/passage handlers and unchanged current reading sources plus additive CAS SQL run in disposable PGlite. Native primitives, OS services, delivery and provider identity are explicit doubles. Actual callback functions are retained to model late native events. No native compilation, SDK acquisition, provider call, deployment or production SQL.'},null,2)+'\n');}
const pass=name=>{stories.push(name);write('RUNNING');console.log('PASS '+stories.length+': '+name);};write('RUNNING');
try{
 assert(process.execArgv.some(v=>v.endsWith('/deny-build-network.cjs')),'Startup network denial required');
 const require=createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');runtime(require.resolve('playwright'));
 const executablePath='/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';runtime(executablePath);
 bundle=read('verification/web/evidence/native-source-reading-fixture/page.js');sourceHashes={...JSON.parse(read('verification/web/evidence/native-source-reading-fixture/source-manifest.json')).sourceHashes,...await savedReadingAppHashes(),'platforms/tests/browser-native-source-reading.mjs':sha(read('platforms/tests/browser-native-source-reading.mjs'))};
 for(const[n,h]of Object.entries(sourceHashes))assert.equal(sha(read(n)),h,'Rebundle changed source '+n);
 const {offlineApp}=await import('../../verification/web/tests/support/offline-app.mjs');
 const app=offlineApp({root:ROOT}),readerRoute=app.load('app/api/great-books/edition/[bookId]/reader/route.ts'),assetRoute=app.load('app/api/great-books/edition/[bookId]/assets/[...asset]/route.ts');
 const catalog=JSON.parse(read('lib/books/source-reader-catalog.json'));
 const extra=['lib/books/source-reader-server.ts','lib/books/source-reader.ts','lib/books/editions.ts','app/api/great-books/edition/[bookId]/reader/route.ts','app/api/great-books/edition/[bookId]/assets/[...asset]/route.ts'];
 for(const entry of catalog.editions.filter(e=>['hamlet','apology','relativity'].includes(e.bookId))){extra.push('content/great-books/'+entry.bookId+'/native-reader.html');for(const asset of entry.assets)extra.push('content/great-books/'+entry.bookId+'/assets/'+asset.path);}
 for(const name of extra)sourceHashes[name]=sha(read(name));
 fixture=await createSavedReadingApp();
 browser=await require('playwright').chromium.launch({headless:true,timeout:15000,executablePath,env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:'/Users/christaylor'},args:['--disable-background-networking','--disable-component-update','--no-first-run']});
 const context=await browser.newContext({viewport:{width:320,height:850}});page=await context.newPage();const p=page;p.setDefaultTimeout(6500);
 p.on('pageerror',e=>errors.push(e.stack||String(e)));p.on('console',m=>{if(m.type()==='error'&&!/^Failed to load resource: the server responded with a status of (400|401|403|404|409|422|429|503)/.test(m.text()))errors.push(m.text());});
 await context.route('**/*',async route=>{try{
  const req=route.request(),u=new URL(req.url());
  if(u.origin===ORIGIN&&u.pathname==='/'){await route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#101d1a;font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif"><div id="root"></div><script type="module" src="/page.mjs"></script></body></html>'});return;}
  if(u.origin===ORIGIN&&u.pathname==='/page.mjs'){await route.fulfill({contentType:'text/javascript',body:bundle});return;}
  const headers=await req.allHeaders();assert.equal(headers.cookie,undefined);
  const sourceMatch=/^\/api\/great-books\/edition\/([^/]+)\/(reader|assets\/(.+))$/.exec(u.pathname);
  if(u.origin===ORIGIN&&sourceMatch){
   for(const key of ['authorization','apikey','cookie','referer'])assert.equal(headers[key],undefined);
   assert.equal(req.method(),'GET');assert.equal(req.postData(),null);
   const bookId=sourceMatch[1],response=await (sourceMatch[2]==='reader'?readerRoute:assetRoute).GET(new Request(u),{params:Promise.resolve({bookId,asset:sourceMatch[3]?.split('/')})});
   http.push({kind:'source',path:u.pathname+u.search,method:'GET',status:response.status});
   await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});return;
  }
  if(u.origin===PROVIDER){
   assert.equal(headers.apikey,PUBLIC_KEY);let status=200,body;
   const user=id=>({id,aud:'authenticated',role:'authenticated',email:'PRIVATE_PROVIDER_EMAIL',app_metadata:{provider:'email'},user_metadata:{private:'PRIVATE_PROVIDER_PROFILE'},identities:[],created_at:'2026-01-01T00:00:00Z'});
   if(u.pathname==='/auth/v1/token'&&req.method()==='POST'){
    const input=JSON.parse(req.postData());assert(['?grant_type=password','?grant_type=refresh_token'].includes(u.search));
    const refresh=u.search==='?grant_type=refresh_token';
    if(refresh){assert.equal(input.refresh_token,'NONISSUED_SYNTHETIC_REFRESH');assert.deepEqual(Object.keys(input),['refresh_token']);}
    else{assert.equal(input.email,actor==='new'?'new@example.test':actor==='other'?'other@example.test':'member@example.test');assert.equal(input.password,'Synthetic-password-only-42');assert.deepEqual(input.gotrue_meta_security,{});assert.deepEqual(Object.keys(input).sort(),['email','gotrue_meta_security','password']);}
    if(denied){status=400;body={code:'invalid_credentials',msg:'PRIVATE_PROVIDER_RAW_DETAIL'};}
    else body={access_token:actor==='new'?ACCESS.new:actor==='other'?ACCESS.other:refresh?ACCESS.rotated:ACCESS.author,refresh_token:'NONISSUED_SYNTHETIC_REFRESH',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:user(actor==='new'?NEW_SUBJECT:actor==='other'?SUBJECTS.other:SUBJECTS.author)};
    http.push({kind:'provider',path:u.pathname+u.search,method:req.method(),status,bodyKeys:Object.keys(input).sort()});
   }else if(u.pathname==='/auth/v1/user'&&req.method()==='GET'){
    assert.equal(u.search,'');const bearer=headers.authorization?.slice(7);assert(Object.values(ACCESS).includes(bearer));body=user(mismatch?SUBJECTS.other:bearer===ACCESS.new?NEW_SUBJECT:bearer===ACCESS.other?SUBJECTS.other:SUBJECTS.author);http.push({kind:'provider',path:u.pathname,method:'GET',status,exactTokenRecognized:true});
   }else{unexpected.push(u.origin+u.pathname+u.search);await route.abort();return;}
   await route.fulfill({status,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)});return;
  }
  if(u.origin===ORIGIN&&(u.pathname.startsWith('/api/auth/')||u.pathname.startsWith('/api/circles')||u.pathname.startsWith('/api/book-salons/')||u.pathname.startsWith('/api/great-books/'))){
   const publicLane=u.pathname==='/api/circles'||u.pathname==='/api/great-books/passage';if(publicLane){assert.equal(headers.authorization,undefined);assert.equal(headers.apikey,undefined);assert.equal(req.method(),'GET');}else assert(Object.values(ACCESS).some(token=>headers.authorization==='Bearer '+token));
   let requestGate=null;
   if(holdNextPost&&u.pathname==='/api/great-books/progress'&&req.method()==='POST'){holdNextPost=false;let release;const promise=new Promise(resolve=>{release=resolve;});heldPost={release,done:false,body:req.postData()};requestGate=heldPost;await promise;}
   const response=await fixture.dispatch(u.pathname+u.search,{method:req.method(),headers,body:req.postData()??undefined}),body=await response.text();
   http.push({kind:publicLane?'public':'member',path:u.pathname+u.search,method:req.method(),status:response.status,body:req.postData()??null,...(publicLane?{response:JSON.parse(body)}:{})});if(requestGate){requestGate.done=true;requestGate.status=response.status;}
   await route.fulfill({status:response.status,headers:{'content-type':'application/json','cache-control':'private, no-store'},body});return;
  }
  unexpected.push(u.origin+u.pathname);await route.abort();
 }catch(error){errors.push(error.stack||String(error));try{await route.abort();}catch{}}});
 await p.goto(ORIGIN);
 const button=name=>p.getByRole('button',{name,exact:true}),field=name=>p.getByLabel(name,{exact:true});
 const settle=()=>p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const state=()=>p.evaluate(()=>({stats:window.nativeQa.stats(),requests:window.nativeQa.requests}));
 const enabled=name=>p.waitForFunction(name=>[...document.querySelectorAll('button')].some(x=>x.getAttribute('aria-label')===name&&!x.disabled),name);
 const progressPath='/api/great-books/progress',posts=()=>http.filter(r=>r.path===progressPath&&r.method==='POST');
 async function reset(who='author'){
  await p.evaluate(()=>window.nativeQa.unmount());await settle();actor=who;mismatch=false;denied=false;
  await p.evaluate(()=>{window.nativeQa.savedReadingAvailable(true);window.nativeQa.readingAvailable(true);window.nativeQa.show();});await enabled('Connect my account');
 }
 async function signIn(){await button('Connect my account').click();await field('Email').fill(actor==='other'?'other@example.test':'member@example.test');await field('Password').fill('Synthetic-password-only-42');await button('Sign in').click();await enabled('Continue to my member account');}
 async function account(expectSaved=true){await button('Continue to my member account').click();await enabled('Check my member account');await button('Check my member account').click();await enabled(expectSaved?'Saved reading':'Discover Circles');}
 async function list(load=true){await button('Saved reading').click();await enabled('Load my saved reading');if(load){await button('Load my saved reading').click();await p.getByText('Your saved reading is loaded. Opening a place does not change it.',{exact:true}).waitFor();}}
 async function circle(){await button('Discover Circles').click();await enabled('Search Circles');await field('Search words').fill('Saved reading Circle');await button('Search Circles').click();await button('View Circle: Saved reading Circle').click();await enabled('Read meeting 1 selection');await button('Read meeting 1 selection').click();await ready();}
 async function review(completed=false){if(completed)await p.getByRole('checkbox',{name:'Mark this edition finished when saving',exact:true}).click();await button('Review saving this reading position').click();await enabled('Confirm save reading place');}
 const savedNotice='Your private saved place was confirmed by a fresh read.';
 const retain=label=>p.evaluate(label=>window.nativeQa.retainCallback('press',label),label);
 const invoke=id=>p.evaluate(id=>window.nativeQa.invokeCallback(id),id);
 async function startCircle(){await reset();await signIn();await account();await circle();}
 async function checkBook(){await enabled('Load saved place for this book');await button('Load saved place for this book').click();await enabled('Review saving this reading position');}
 const frame=()=>p.frameLocator('iframe[title="Complete source edition"]');
 const ready=async()=>{await enabled('Next reading position');await p.getByText('Complete source edition. Scrolling and footnotes leave your selected save position unchanged.',{exact:true}).waitFor();};
 const sourceKeys=()=>p.evaluate(()=>window.nativeSourceQa.activeKeys());
 const details=async()=>{if(await button('Reading details and saved place').count())await button('Reading details and saved place').click();};
 const circleId=await fixture.seedReadingCircle({title:'Saved reading Circle'});
 await signIn();await account();const before=http.length;await circle();
 assert.equal(await fixture.isMember(circleId),false);assert.equal(http.slice(before).filter(r=>r.kind==='source'&&r.path.includes('/reader?')).length,1);assert.equal(http.filter(r=>r.path.startsWith('/api/great-books/passage')).length,0);
 assert.equal(await frame().locator('[data-reading-index]').count(),fixture.books.hamlet.pin.blockCount);
 assert.equal(await frame().locator('[data-reading-index="41"]').innerText(),'BARNARDO.\nWho’s there?\n');
 pass('actual signed-in App rechecks the selected Circle and opens the complete verified Hamlet source through the real reader route, without joining, fetching passage text or sending member credentials to the source');
 const key=(await sourceKeys())[0];await button('Next reading position').click();await ready();assert.equal(await p.getByText('Selected save position 43 · Selection 42–44',{exact:true}).count(),1);
 await p.evaluate(key=>window.nativeSourceQa.emit(key,'ready',41),key);await settle();assert.equal(await p.getByText('Selected save position 43 · Selection 42–44',{exact:true}).count(),1);
 await button('Next reading position').click();await p.getByText('Selected save position 44 · Selection 42–44',{exact:true}).waitFor();await p.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.getAttribute('aria-label')==='Previous reading position'&&!b.disabled));assert.equal(await button('Next reading position').isDisabled(),true);
 await button('Previous reading position').click();await ready();await button('Previous reading position').click();await ready();assert.equal(await button('Previous reading position').isDisabled(),true);
 pass('Previous/Next preserve exact inclusive bounds; replaced native-surface callbacks cannot change the currently selected save position');
 await details();await checkBook();const postCount=posts().length;
 await frame().locator('body').evaluate(body=>body.ownerDocument.defaultView.scrollTo(0,body.scrollHeight));await review();assert.equal(await p.getByText('Save position 42 in the current verified edition.',{exact:true}).count(),1);assert.equal(posts().length,postCount);
 await button('Hide reading details').click();assert.equal(await button('Next reading position').isDisabled(),true);await details();await button('Confirm save reading place').click();await p.getByText(savedNotice,{exact:true}).waitFor();assert.equal((await fixture.row('hamlet')).section_id.endsWith(':41'),true);
 pass('scrolling the full book does not remap the save target; reviewed exact-position save uses actual owner/CAS SQL and fresh readback, and hiding details preserves the pending review');
 await button('Back to Circle reading plan').click();await button('Return to member account').click();await list();await button('Open saved place in Hamlet').click();await ready();assert.equal(await p.getByText(/Selected save position 42/).count(),1);
 await button('Previous reading position').click();await ready();assert.equal(await p.getByText(/Selected save position 41/).count(),1);assert.equal((await fixture.row('hamlet')).section_id.endsWith(':41'),true);
 pass('saved-reading entry rechecks persisted state and opens the same complete source at the exact saved position with full-edition navigation; reading alone leaves stored progress unchanged');
 const failureKey=(await sourceKeys())[0];await p.evaluate(key=>window.nativeSourceQa.emit(key,'unavailable'),failureKey);await enabled('Retry complete source edition');assert.equal(await p.locator('iframe').count(),0);
 const atFailure=http.length;await settle();assert.equal(http.length,atFailure);await button('Retry complete source edition').click();await ready();assert.notEqual((await sourceKeys())[0],failureKey);
 pass('a renderer/resource failure removes the source and requires explicit retry with a fresh request lifetime at the same selected position');
 for(const kind of ['blur','offline','background']){
  await startCircle();await p.evaluate(()=>window.nativeSourceQa.hold());await button('Next reading position').click();await p.waitForFunction(()=>window.nativeSourceQa.activeKeys().length===1);const heldKey=(await sourceKeys())[0];
  await p.evaluate(kind=>{if(kind==='offline')window.nativeQa.network('offline');else if(kind==='background')window.nativeQa.activity('change','background');else window.nativeQa.activity('blur');},kind);await field('Password').waitFor();const at=http.length;
  await p.evaluate(key=>{window.nativeSourceQa.emit(key);window.nativeSourceQa.release();window.nativeQa.network('online');window.nativeQa.activity('change','active');window.nativeQa.activity('focus');},heldKey);await settle();assert.equal(await p.locator('iframe').count(),0);assert.equal(http.length,at);
 }
 pass('blur, background and offline retire the full source; deliberately delivered late Fabric events cannot reopen it, and recovery performs no automatic source fetch');
 await startCircle();await details();await checkBook();await review();const oldConfirm=await retain('Confirm save reading place');await button('Cancel saved-place review').click();await button('Next reading position').click();await ready();const oldAt=http.length;await invoke(oldConfirm);await settle();assert.equal(http.length,oldAt);assert.equal(await button('Confirm save reading place').count(),0);
 pass('a retained confirmation callback from a discarded saved-place review cannot write after the full reader selects another position');
 await button('Hide reading details').click();assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);const heights=await p.locator('button:visible').evaluateAll(xs=>xs.map(x=>x.getBoundingClientRect().height));assert(heights.every(h=>h>=48));await p.screenshot({path:path.join(ROOT,'verification/web/evidence/native-source-reading-320.png'),fullPage:true});
 await button('Close member view').click();await field('Password').waitFor();await p.evaluate(()=>window.nativeQa.unmount());await settle();stats=await state();assert.equal(stats.stats.netListeners,0);assert.equal(stats.stats.appListeners,0);assert.equal(stats.stats.handles,0);assert.equal((await sourceKeys()).length,0);
 pass('320px layout has no page overflow and 48px controls in browser primitives; closing/unmounting removes the source and all application lifecycle/request observers');
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);for(const[n,h]of Object.entries(sourceHashes))assert.equal(sha(read(n)),h,'Source changed during proof '+n);
}catch(error){failure=error.stack||String(error);if(page)try{console.log('FAILED VIEW',await page.locator('body').innerText());}catch{}}finally{
 write(failure?'FAIL':'CLEANING_UP');if(heldPost){heldPost.release();try{await bounded(async()=>{while(!heldPost.done)await new Promise(r=>setTimeout(r,10));});}catch{}heldPost=null;}
 try{if(page)await bounded(()=>page.evaluate(()=>{window.nativeQa?.release();window.nativeQa?.releasePreparation();window.nativeQa?.unmount();}));}catch{}
 try{if(browser)await bounded(()=>browser.close());cleanup.browser=browser?'closed':'not-created';}catch(error){cleanup.browser='failed';failure??=error.stack||String(error);}
 try{if(fixture)await bounded(()=>fixture.close());cleanup.database=fixture?'closed':'not-created';}catch(error){cleanup.database='failed';failure??=error.stack||String(error);}
 try{assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);for(const[n,h]of Object.entries(sourceHashes))assert.equal(sha(read(n)),h,'Source changed during cleanup '+n);}catch(error){failure??=error.stack||String(error);}write(failure?'FAIL':'PASS');
}
if(failure)throw Error(failure);console.log('PASS native complete source reading: '+stories.length+' stories.');
