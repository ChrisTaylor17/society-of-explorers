import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const ROOT=process.cwd(),file='verification/web/evidence/native-public-profile-browser.json',sha=b=>createHash('sha256').update(b).digest('hex');
function read(name){const p=path.resolve(ROOT,name),s=fs.lstatSync(p);assert(s.isFile()&&!s.isSymbolicLink()&&(!s.size||s.blocks),'Refuse linked/offloaded source '+name);return fs.readFileSync(p);}
function runtime(p){const s=fs.statSync(p);assert(s.size&&s.blocks,'Refuse offloaded runtime');}
read('verification/web/tests/support/public-profile-app.mjs');
process.chdir(path.join(ROOT,'verification/web'));
const {createPublicProfileApp,publicProfileAppHashes,ORIGIN,PROVIDER,PUBLIC_KEY,TOKENS:ACCESS,SUBJECTS,NEW_SUBJECT}=await import('../../verification/web/tests/support/public-profile-app.mjs');
const priorReceipt=fs.existsSync(path.join(ROOT,file))?{sha256:sha(read(file)),status:JSON.parse(read(file)).status}:null,startedAt=new Date().toISOString(),stories=[],errors=[],unexpected=[],http=[],cleanup={browser:'pending',database:'pending'};
let holdNextPost=false,heldPost=null;
let sourceHashes={},bundle,browser,page,fixture,failure=null,actor='author',mismatch=false,denied=false,stats;
function write(status){fs.writeFileSync(path.join(ROOT,file),JSON.stringify({status,startedAt,completedAt:new Date().toISOString(),stories,errors,unexpected,http,cleanup,sourceHashes,bundleSHA256:bundle?sha(bundle):null,stats,priorReceipt,failure,
 scope:'Actual registered App, cached AuthClient, native JS member/anonymous profile ports, Circle host and discussion author profile screens. Canonical bearer/member/Circle/participation handlers and the current publication-filtered reference and profile SQL run in disposable PGlite. Native primitives, OS services, delivery and provider identity are explicit doubles. Actual callback functions are retained to model late native events. No native compilation, SDK acquisition, provider call, deployment or production SQL.'},null,2)+'\n');}
const pass=name=>{stories.push(name);write('RUNNING');console.log('PASS '+stories.length+': '+name);};write('RUNNING');
try{
 assert(process.execArgv.some(v=>v.endsWith('/deny-build-network.cjs')),'Startup network denial required');
 const require=createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');runtime(require.resolve('playwright'));
 const executablePath='/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';runtime(executablePath);
 bundle=read('verification/web/evidence/native-public-profile-fixture/page.js');sourceHashes={...JSON.parse(read('verification/web/evidence/native-public-profile-fixture/source-manifest.json')).sourceHashes,...await publicProfileAppHashes(),'platforms/tests/browser-native-public-profile.mjs':sha(read('platforms/tests/browser-native-public-profile.mjs'))};
 for(const[n,h]of Object.entries(sourceHashes))assert.equal(sha(read(n)),h,'Rebundle changed source '+n);
 fixture=await createPublicProfileApp();
 browser=await require('playwright').chromium.launch({headless:true,timeout:15000,executablePath,env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:'/Users/christaylor'},args:['--disable-background-networking','--disable-component-update','--no-first-run']});
 const context=await browser.newContext({viewport:{width:320,height:850}});page=await context.newPage();const p=page;p.setDefaultTimeout(6500);
 p.on('pageerror',e=>errors.push(e.stack||String(e)));p.on('console',m=>{if(m.type()==='error'&&!/^Failed to load resource: the server responded with a status of (400|401|403|404|409|422|429|503)/.test(m.text()))errors.push(m.text());});
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
    else{assert.equal(input.email,actor==='new'?'new@example.test':actor==='other'?'other@example.test':'member@example.test');assert.equal(input.password,'Synthetic-password-only-42');assert.deepEqual(input.gotrue_meta_security,{});assert.deepEqual(Object.keys(input).sort(),['email','gotrue_meta_security','password']);}
    if(denied){status=400;body={code:'invalid_credentials',msg:'PRIVATE_PROVIDER_RAW_DETAIL'};}
    else body={access_token:actor==='new'?ACCESS.new:actor==='other'?ACCESS.other:refresh?ACCESS.rotated:ACCESS.author,refresh_token:'NONISSUED_SYNTHETIC_REFRESH',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:user(actor==='new'?NEW_SUBJECT:actor==='other'?SUBJECTS.other:SUBJECTS.author)};
    http.push({kind:'provider',path:u.pathname+u.search,method:req.method(),status,bodyKeys:Object.keys(input).sort()});
   }else if(u.pathname==='/auth/v1/user'&&req.method()==='GET'){
    assert.equal(u.search,'');const bearer=headers.authorization?.slice(7);assert(Object.values(ACCESS).includes(bearer));body=user(mismatch?SUBJECTS.other:bearer===ACCESS.new?NEW_SUBJECT:bearer===ACCESS.other?SUBJECTS.other:SUBJECTS.author);http.push({kind:'provider',path:u.pathname,method:'GET',status,exactTokenRecognized:true});
   }else{unexpected.push(u.origin+u.pathname+u.search);await route.abort();return;}
   await route.fulfill({status,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)});return;
  }
  if(u.origin===ORIGIN&&(u.pathname.startsWith('/api/explorer/')||u.pathname.startsWith('/api/auth/')||u.pathname.startsWith('/api/circles')||u.pathname.startsWith('/api/book-salons/')||u.pathname.startsWith('/api/great-books/'))){
   const publicLane=req.method()==='GET'&&(u.pathname.startsWith('/api/explorer/')||u.pathname==='/api/circles'||u.pathname==='/api/great-books/passage'||u.pathname.startsWith('/api/great-books/text/'));if(publicLane){assert.equal(req.postData(),null);assert.equal(u.search,u.pathname.startsWith('/api/explorer/')?'':u.search);assert.equal(headers.authorization,undefined);assert.equal(headers.apikey,undefined);assert.equal(req.method(),'GET');}else assert(Object.values(ACCESS).some(token=>headers.authorization==='Bearer '+token));
   let requestGate=null;
   if(holdNextPost&&(u.pathname==='/api/circles'||u.pathname.endsWith('/complete'))&&req.method()==='POST'){holdNextPost=false;let release;const promise=new Promise(resolve=>{release=resolve;});heldPost={release,done:false,body:req.postData()};requestGate=heldPost;await promise;}
   const response=await fixture.dispatch(u.pathname+u.search,{method:req.method(),headers,body:req.postData()??undefined}),body=await response.text();
   http.push({kind:publicLane?'public':'member',path:u.pathname+u.search,method:req.method(),status:response.status,body:req.postData()??null,...(publicLane?{response:JSON.parse(body)}:{})});if(requestGate){requestGate.done=true;requestGate.status=response.status;}
   await route.fulfill({status:response.status,headers:{'content-type':'application/json','cache-control':'private, no-store'},body});return;
  }
  unexpected.push(u.origin+u.pathname);await route.abort();
 }catch(error){errors.push(error.stack||String(error));try{await route.abort();}catch{}}});
 await p.goto(ORIGIN);
 const button=name=>p.getByRole('button',{name,exact:true}),field=name=>p.getByLabel(name,{exact:true});
 const settle=()=>p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const enabled=name=>p.waitForFunction(name=>[...document.querySelectorAll('button')].some(x=>x.getAttribute('aria-label')===name&&!x.disabled),name);
 const state=()=>p.evaluate(()=>({stats:window.nativeQa.stats(),requests:window.nativeQa.requests}));
 const retain=label=>p.evaluate(label=>window.nativeQa.retainCallback('press',label),label),invoke=id=>p.evaluate(id=>window.nativeQa.invokeCallback(id),id);
 const text=()=>p.locator('body').innerText(),publicCalls=()=>http.filter(r=>r.path.startsWith('/api/explorer/'));
 const published={displayName:'Published host and author',bio:'Public authored biography',discipline:'Public field of study',skills:['Shared reading','Careful listening'],projectDescription:'Published project description',seeking:'Published collaboration interests',philosophy:'Published personal philosophy',visibility:'public'};
 let circleId,messageId,hostId;const title='Public profile journey Circle';
 async function show({fresh=true,profiles=true}={}){
  await p.evaluate(()=>window.nativeQa.unmount());await settle();if(fresh){await fixture.close();fixture=await createPublicProfileApp();}
  fixture.transformHttp(null);fixture.beforeHttp(null);actor='author';mismatch=false;denied=false;
  await fixture.updateProfile(published,'other');hostId=fixture.actors.other;
  if(fresh){circleId=await fixture.seedCircle({title,reading:false});messageId=(await fixture.post({circleId,who:'other',content:'A published author’s visible discussion message.'})).id;}
  await p.evaluate(profiles=>{window.nativeQa.publicProfilesAvailable(profiles);window.nativeQa.show();},profiles);await enabled('Connect my account');
 }
 async function signIn(){await button('Connect my account').click();await field('Email').fill('member@example.test');await field('Password').fill('Synthetic-password-only-42');await button('Sign in').click();await enabled('Continue to my member account');}
 async function account(){await button('Continue to my member account').click();await enabled('Check my member account');await button('Check my member account').click();await enabled('Discover Circles');}
 async function directory(){await button('Discover Circles').click();await enabled('Search Circles');await field('Search words').fill(title);await button('Search Circles').click();await button('View Circle: '+title).click();await enabled('Check current Circle');}
 async function start(options){await show(options);await signIn();await account();await directory();}
 async function openHost(){await button('View host public profile').click();await enabled('Refresh public profile');}
 async function discussion(waitProfile=true){if(!await fixture.isMember(circleId)){await fixture.join(circleId);await button('Check current Circle').click();await enabled('Open discussion');}await button('Open discussion').click();await enabled(waitProfile?'View author public profile':'Open complete discussion archive');}
 async function restore(){await button('Restore saved sign-in').click();await enabled('Continue to my member account');await account();await directory();}
 function noSecrets(value){for(const secret of ['PRIVATE_PROVIDER_EMAIL','PRIVATE_PROVIDER_PROFILE','NONISSUED_','PRIVATE_AUTHOR_EMAIL','profile_visibility','supabase_auth_id'])assert(!value.includes(secret),secret);}

 await show();const inert=http.length;await settle();assert.equal(http.length,inert);await signIn();await account();await directory();assert.equal(await fixture.isMember(circleId),false);const before=publicCalls().length,providerBefore=http.filter(r=>r.kind==='provider').length;
 await openHost();assert.equal(publicCalls().length,before+1);assert.equal(http.filter(r=>r.kind==='provider').length,providerBefore+1); // only fresh private Circle proof, before anonymous read
 for(const value of Object.values(published).flat().filter(v=>v!=='public'))assert((await text()).includes(value));assert.equal(await fixture.isMember(circleId),false);assert.equal(await p.locator('img').count(),0);noSecrets(await text());
 assert.equal(publicCalls().at(-1).path,'/api/explorer/'+hostId);assert.equal(publicCalls().at(-1).kind,'public');await p.screenshot({path:path.join(ROOT,'verification/web/evidence/native-public-profile-full-320.png'),fullPage:true});
 pass('actual registered App signs in through cached AuthClient and native ports, then a nonmember explicitly opens the current published host profile with all seven authored fields and no membership grant');

 const anonAt=http.length;await button('Refresh public profile').click();await enabled('Refresh public profile');assert.equal(http.slice(anonAt).length,1);assert.equal(http.at(-1).kind,'public');assert.equal(http.at(-1).path,'/api/explorer/'+hostId);
 await fixture.updateProfile({visibility:'private'},'other');await button('Refresh public profile').click();await enabled('Load public profile');assert.match(await text(),/not publicly available/);assert(!(await text()).includes(published.bio));await button('Back to Circle').click();await enabled('Check current Circle');assert.equal(await button('View host public profile').count(),0);
 pass('refresh uses only anonymous exact-ID GET; canonical unpublication clears all prior fields, and Back freshly checks the Circle and removes its profile entry');

 await fixture.updateProfile(published,'other');await button('Check current Circle').click();await enabled('View host public profile');const oldHost=await retain('View host public profile');await fixture.updateProfile({visibility:'private'},'other');const changedAt=publicCalls().length;await button('View host public profile').click();await enabled('Check current Circle');assert.equal(publicCalls().length,changedAt);assert.equal(await button('Refresh public profile').count(),0);assert.match(await text(),/profile reference changed/);
 await fixture.updateProfile(published,'other');await button('Check current Circle').click();await enabled('View host public profile');await invoke(oldHost);await settle();assert.equal(publicCalls().length,changedAt);await openHost();const oldClose=await retain('Close member view'),oldRefresh=await retain('Refresh public profile');await button('Back to Circle').click();await enabled('Check current Circle');await openHost();const oldAt=http.length;await invoke(oldClose);await invoke(oldRefresh);await settle();assert.equal(http.length,oldAt);assert((await text()).includes(published.bio));
 pass('fresh host recheck refuses an unpublished reference before public transmission; real old host, profile Close and Refresh callbacks cannot operate on a later selection or remounted profile');

 for(const mode of ['wrong-id','malformed-404','server-failure']){
  fixture.transformHttp(async({path,response})=>{if(!path.startsWith('/api/explorer/'))return response;if(mode==='wrong-id'){const body=await response.json();body.profile.id=fixture.authorId;return Response.json(body);}return mode==='malformed-404'?Response.json({error:'Unexpected failure'},{status:404}):Response.json({error:'Synthetic outage'},{status:503});});
  await button('Refresh public profile').click();await enabled('Retry public profile');assert(!(await text()).includes(published.bio));assert(!/not publicly available on this check/.test(await text()));fixture.transformHttp(null);await button('Retry public profile').click();await enabled('Refresh public profile');assert((await text()).includes(published.bio));
 }
 pass('wrong-member success, malformed404 and temporary failures discard prior displayed details and require an explicit successful anonymous retry');

 await button('Back to Circle').click();await enabled('Check current Circle');await discussion();await button('View author public profile').click();await enabled('Refresh public profile');assert((await text()).includes(published.philosophy));await button('Back to discussion').click();await enabled('Open complete discussion archive');assert((await text()).includes('visible discussion message'));
 await button('Open complete discussion archive').click();await enabled('View author public profile');await button('View author public profile').click();await enabled('Refresh public profile');await button('Back to discussion').click();await enabled('Open complete discussion archive');await button('Open complete discussion archive').click();await enabled('Open thread');await button('Open thread').click();await enabled('View author public profile');await button('View author public profile').click();await enabled('Refresh public profile');
 pass('explicit published-author entries work from the canonical latest100 conversation, complete archive and current thread; each return reconnects to fresh private discussion and keeps public requests anonymous');

 const threadReturnAt=http.length;await button('Back to discussion').click();await enabled('View author public profile');assert.match(http.slice(threadReturnAt).find(r=>r.kind==='member').path,new RegExp('/discussion\\?message='+messageId+'$'));assert.match(await text(),/Current thread loaded/);await fixture.hide({circleId,messageId});await button('Open complete discussion archive').click();await enabled('Open thread');assert.equal(await button('View author public profile').count(),0);assert(!(await text()).includes('visible discussion message'));
 pass('a freshly hidden message retains its moderation placeholder while its author profile entry disappears');

 await start();await discussion();await button('Open complete discussion archive').click();await enabled('Start a new discussion message');await button('Start a new discussion message').click();await field('Your discussion comment').fill('A deliberately uncertain native post.');await button('Prepare discussion preview').click();await p.getByRole('checkbox',{name:'I reviewed this exact message and target, and want to post it to this Circle',exact:true}).click();await p.evaluate(path=>window.nativeQa.hold(path,'POST'),'/api/circles/'+circleId+'/discussion');await button('Post reviewed discussion message').click();await enabled('Retry exact reviewed discussion post');assert.equal(await button('View author public profile').isDisabled(),true);const unknownAt=publicCalls().length;const blocked=await retain('View author public profile');await invoke(blocked);await settle();assert.equal(publicCalls().length,unknownAt);await button('Close circle').click();await p.evaluate(()=>window.nativeQa.release());
 pass('an uncertain discussion write blocks author-profile navigation, including invocation of its captured disabled callback; deliberate Close still retires the view');

 for(const transition of ['blur','offline','background']){
  await start();await openHost();const staleRefresh=await retain('Refresh public profile');await p.evaluate(kind=>{if(kind==='offline')window.nativeQa.network('offline');else if(kind==='background')window.nativeQa.activity('change','background');else window.nativeQa.activity('blur');},transition);await field('Password').waitFor();assert(!(await text()).includes(published.bio));const at=http.length;await invoke(staleRefresh);await p.evaluate(()=>{window.nativeQa.network('online');window.nativeQa.activity('change','active');window.nativeQa.activity('focus');});await settle();assert.equal(http.length,at);await restore();assert.equal(await button('Refresh public profile').count(),0);await openHost();
 }
 pass('blur, background and offline remove the public selection with the owned account view; old callbacks and foreground events do not reopen it, and fresh account/Circle checks precede a new explicit selection');

 await start();await p.evaluate(path=>window.nativeQa.hold(path,'GET'),'/api/explorer/'+hostId);await button('View host public profile').click();await button('Close member view').waitFor();await button('Close member view').click();const closedAt=http.length;await p.evaluate(()=>window.nativeQa.release());await settle();assert(!(await text()).includes(published.bio));assert.equal(http.length,closedAt);
 pass('Close remains available during a held anonymous response; late delivery cannot restore the closed member or profile view');

 await start();await openHost();const ownerOldClose=await retain('Close member view'),ownerOldRefresh=await retain('Refresh public profile');await p.evaluate(path=>window.nativeQa.hold(path,'GET'),'/api/explorer/'+hostId);await button('Refresh public profile').click();await p.waitForFunction(()=>window.nativeQa.requests.some(r=>r.kind==='public'&&r.held));await p.evaluate(()=>window.nativeQa.activity('blur'));await field('Password').waitFor();await p.evaluate(()=>window.nativeQa.activity('focus'));actor='other';await field('Email').fill('other@example.test');await field('Password').fill('Synthetic-password-only-42');await button('Sign in').click();await enabled('Continue to my member account');await account();const ownerAt=http.length;await p.evaluate(()=>window.nativeQa.release());await invoke(ownerOldClose);await invoke(ownerOldRefresh);await settle();assert.equal(http.length,ownerAt);assert(!(await text()).includes(published.bio));assert.equal(await button('Discover Circles').isEnabled(),true);assert.equal(await button('Refresh public profile').count(),0);await directory();await openHost();assert((await text()).includes(published.bio));
 pass('actual App sign-in replacement from A to B retires a held public profile and its captured Close/Refresh callbacks; late delivery cannot replace B’s member menu, and B opens a profile only through a fresh explicit Circle selection');

 await start({profiles:false});assert.equal(await button('View host public profile').count(),0);await discussion(false);assert.equal(await button('View author public profile').count(),0);assert.equal((await state()).requests.some(r=>r.path.startsWith('/api/explorer/')),false);
 pass('legacy native capabilities offer no host or author profile buttons and never route public-profile requests through member transport');

 await start();await openHost();assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));noSecrets(await text());await p.evaluate(()=>window.nativeQa.unmount());await settle();stats=(await state()).stats;assert.equal(stats.netListeners,0);assert.equal(stats.appListeners,0);assert.equal(stats.handles,0);assert.equal(stats.retainedCallbacks,0);assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);for(const[n,h]of Object.entries(sourceHashes))assert.equal(sha(read(n)),h,'Changed source during proof '+n);
 pass('the 320px composed view fits without horizontal overflow, shows no identity/provider secrets, and terminal unmount releases native handles, observers and callback captures with no unexpected network');
}catch(error){failure=error.stack||String(error);console.error(failure);}
finally{try{heldPost?.release();if(browser)await browser.close();cleanup.browser='closed';}catch(error){cleanup.browser=String(error);}try{if(fixture)await fixture.close();cleanup.database='closed';}catch(error){cleanup.database=String(error);}write(failure?'FAIL':'PASS');}
if(failure)process.exitCode=1;
