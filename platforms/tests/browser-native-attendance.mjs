import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const ROOT=process.cwd(),file='verification/web/evidence/native-attendance-browser.json',sha=b=>createHash('sha256').update(b).digest('hex');
function read(name){const p=path.resolve(ROOT,name),s=fs.lstatSync(p);assert(s.isFile()&&!s.isSymbolicLink()&&(!s.size||s.blocks),'Refuse linked/offloaded source '+name);return fs.readFileSync(p);}
function runtime(p){const s=fs.statSync(p);assert(s.size&&s.blocks,'Refuse offloaded runtime');}
async function bounded(fn,ms=5000){let timer;try{return await Promise.race([fn(),new Promise((_,no)=>timer=setTimeout(()=>no(Error('Owned operation timed out')),ms))]);}finally{clearTimeout(timer);}}
read('verification/web/tests/support/circle-attendance-app.mjs');
process.chdir(path.join(ROOT,'verification/web'));
const {createCircleAttendanceApp,attendanceAppHashes,ORIGIN,PROVIDER,PUBLIC_KEY,TOKENS:ACCESS,SUBJECTS,NEW_SUBJECT}=await import('../../verification/web/tests/support/circle-attendance-app.mjs');
const priorReceipt=fs.existsSync(path.join(ROOT,file))?{sha256:sha(read(file)),status:JSON.parse(read(file)).status}:null,startedAt=new Date().toISOString(),stories=[],errors=[],unexpected=[],http=[],cleanup={browser:'pending',database:'pending'};
let holdNextPost=false,heldPost=null;
let sourceHashes={},bundle,browser,page,fixture,failure=null,actor='author',mismatch=false,denied=false,stats;
function write(status){fs.writeFileSync(path.join(ROOT,file),JSON.stringify({status,startedAt,completedAt:new Date().toISOString(),stories,errors,unexpected,http,cleanup,sourceHashes,bundleSHA256:bundle?sha(bundle):null,stats,priorReceipt,failure,
 scope:'Actual registered App, cached AuthClient, native JS member/attendance/anonymous-public ports, Circle attendance review and current meeting view. Canonical bearer/member/Circle/participation handlers and the additive attendance intent/receipt SQL run in disposable PGlite. Native primitives, OS services, delivery and provider identity are explicit doubles. Actual callback functions are retained to model late native events. No native compilation, SDK acquisition, provider call, deployment or production SQL.'},null,2)+'\n');}
const pass=name=>{stories.push(name);write('RUNNING');console.log('PASS '+stories.length+': '+name);};write('RUNNING');
try{
 assert(process.execArgv.some(v=>v.endsWith('/deny-build-network.cjs')),'Startup network denial required');
 const require=createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');runtime(require.resolve('playwright'));
 const executablePath='/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';runtime(executablePath);
 bundle=read('verification/web/evidence/native-attendance-fixture/page.js');sourceHashes={...JSON.parse(read('verification/web/evidence/native-attendance-fixture/source-manifest.json')).sourceHashes,...await attendanceAppHashes(),'platforms/tests/browser-native-attendance.mjs':sha(read('platforms/tests/browser-native-attendance.mjs'))};
 for(const[n,h]of Object.entries(sourceHashes))assert.equal(sha(read(n)),h,'Rebundle changed source '+n);
 fixture=await createCircleAttendanceApp();
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
  if(u.origin===ORIGIN&&(u.pathname.startsWith('/api/auth/')||u.pathname.startsWith('/api/circles')||u.pathname.startsWith('/api/book-salons/')||u.pathname.startsWith('/api/great-books/'))){
   const publicLane=u.pathname==='/api/circles'||u.pathname==='/api/great-books/passage';if(publicLane){assert.equal(headers.authorization,undefined);assert.equal(headers.apikey,undefined);assert.equal(req.method(),'GET');}else assert(Object.values(ACCESS).some(token=>headers.authorization==='Bearer '+token));
   let requestGate=null;
   if(holdNextPost&&u.pathname.endsWith('/rsvp')&&req.method()==='POST'){holdNextPost=false;let release;const promise=new Promise(resolve=>{release=resolve;});heldPost={release,done:false,body:req.postData()};requestGate=heldPost;await promise;}
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
 const format=date=>new Date(date+'T00:00:00Z').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'});
 const retain=label=>p.evaluate(label=>window.nativeQa.retainCallback('press',label),label),invoke=id=>p.evaluate(id=>window.nativeQa.invokeCallback(id),id);
 let circleId,date,secondDate;
 const title='Native attendance Circle',detailPath=()=>'/api/circles/'+circleId,rsvpPath=()=>detailPath()+'/rsvp';
 const posts=()=>http.filter(r=>r.method==='POST'&&r.path===rsvpPath());
 async function show({fresh=false,attendance=true,who='author'}={}){
  await p.evaluate(()=>window.nativeQa.unmount());await settle();if(fresh){await fixture.close();fixture=await createCircleAttendanceApp();}
  actor=who;mismatch=false;denied=false;await p.evaluate(attendance=>{window.nativeQa.attendanceAvailable(attendance);window.nativeQa.show();},attendance);await enabled('Connect my account');
 }
 async function signIn(){await button('Connect my account').click();await field('Email').fill(actor==='other'?'other@example.test':'member@example.test');await field('Password').fill('Synthetic-password-only-42');await button('Sign in').click();await enabled('Continue to my member account');}
 async function account(){await button('Continue to my member account').click();await enabled('Check my member account');await button('Check my member account').click();await enabled('Discover Circles');}
 async function discover(){await button('Discover Circles').click();await enabled('Search Circles');await field('Search words').fill(title);await button('Search Circles').click();await button('View Circle: '+title).click();await enabled('Check current Circle');}
 async function mine(){await button('My Circles').click();await enabled('Load my Circles');await button('Load my Circles').click();await button('View Circle: '+title).click();await enabled('Check current Circle');}
 async function join(){await button('Review joining this Circle').click();await enabled('Confirm join');await button('Confirm join').click();await enabled('Open discussion');}
 async function start({member=true,attendance=true}={}){
  await show({fresh:true,attendance});circleId=await fixture.seedCircle({title,reading:false});await signIn();await account();await discover();if(member)await join();
  const current=await fixture.membership(circleId);date=current.meetings[0].date;secondDate=current.meetings[1].date;
 }
 async function review(status,day=date){await button(`Review ${status==='going'?'Going':'Not going'} on ${format(day)}`).click();await enabled('Confirm attendance response');}
 async function ready(){await enabled('Check current Circle');await enabled('Review Going on '+format(date));}
 async function confirm(){await button('Confirm attendance response').click();await ready();}
 async function refresh(){await button('Check current Circle').click();await ready();}
 async function direct(status,{requestId=randomUUID(),revision,day=date,who='author'}={}){
  const body={expectedMemberId:fixture.actors[who],requestId,expectedRevision:revision??await fixture.revision(circleId),date:day,status};
  const response=await fixture.dispatch(rsvpPath(),{method:'POST',headers:{Authorization:'Bearer '+(who==='other'?ACCESS.other:ACCESS.author)},body});assert.equal(response.status,200);return{body,result:await response.json()};
 }
 async function waitHeld(){await bounded(async()=>{while(!heldPost)await new Promise(r=>setTimeout(r,10));});}
 async function releaseHeld(){const gate=heldPost;assert(gate);gate.release();await bounded(async()=>{while(!gate.done)await new Promise(r=>setTimeout(r,10));});heldPost=null;await settle();return gate;}
 await start({member:false});assert.equal(await p.getByRole('button',{name:/^Review (Going|Not going) on/}).count(),0);assert.equal(posts().length,0);assert.equal(await fixture.rsvpRow(circleId,date),null);await join();
 pass('actual App sign-in, canonical member proof, anonymous discovery and explicit reviewed join reach attendance controls; nonmembers cannot respond');
 const beforeReview=posts().length;await review('going');assert.equal(posts().length,beforeReview);assert.equal(await p.getByText('Mark yourself Going.',{exact:true}).count(),1);assert.equal(await button('Check current Circle').isDisabled(),true);assert.equal(await button('Return to member account').isDisabled(),true);assert.equal(await button('Open discussion').isDisabled(),true);await p.screenshot({path:path.join(ROOT,'verification/web/evidence/native-attendance-review-320.png'),fullPage:true});await button('Cancel attendance change').click();assert.equal(posts().length,beforeReview);assert.equal(await fixture.rsvpRow(circleId,date),null);
 pass('fresh meeting review shows exact Circle/date/time/zone and response, freezes other actions, and cancellation sends no RSVP');
 await review('going');const baseRevision=await fixture.revision(circleId);await p.evaluate(path=>window.nativeQa.hold(path,'GET'),detailPath());await button('Confirm attendance response').click();await p.waitForFunction(path=>window.nativeQa.requests.some(r=>r.path===path&&r.method==='GET'&&r.held),detailPath());assert.equal((await fixture.rsvpRow(circleId,date)).status,'going');assert.equal(await fixture.revision(circleId),baseRevision+1);assert.equal(await p.getByText(/You are going\./).count(),0);await p.evaluate(()=>window.nativeQa.release());await ready();assert.match(await p.locator('body').innerText(),/You are going\./);const firstBody=JSON.parse(posts().at(-1).body);assert.equal(firstBody.expectedMemberId,fixture.actors.author);assert.equal(firstBody.date,date);assert.equal(firstBody.status,'going');assert.equal(firstBody.expectedRevision,baseRevision);
 pass('canonical member/date/status/revision and OS request ID commit actual SQL; current Going appears only after fresh readback');
 await show();await signIn();await account();await mine();await ready();assert.match(await p.locator('body').innerText(),/You are going\./);const previous=await fixture.revision(circleId);await review('not_going');await confirm();assert.equal((await fixture.rsvpRow(circleId,date)).status,'not_going');assert.equal(await fixture.isMember(circleId),true);assert.equal(await fixture.revision(circleId),previous+1);assert.match(await p.locator('body').innerText(),/You are not going\./);
 await p.screenshot({path:path.join(ROOT,'verification/web/evidence/native-attendance-current-320.png'),fullPage:true});
 pass('a new App session reloads persisted Going; a separately reviewed Not going response changes attendance while keeping membership');
 const noopBase=await fixture.revision(circleId);await review('not_going');await confirm();const noopBody=JSON.parse(posts().at(-1).body);assert.equal(await fixture.revision(circleId),noopBase+1);const replay=await fixture.dispatch(rsvpPath(),{method:'POST',headers:{Authorization:'Bearer '+ACCESS.author},body:noopBody});assert.equal(replay.status,200);assert.equal((await replay.json()).replayed,true);assert.equal(await fixture.revision(circleId),noopBase+1);
 pass('a newly confirmed unchanged answer advances the intent revision once; replaying its exact accepted key does not advance it again');
 await review('going');await direct('not_going');await button('Confirm attendance response').click();await enabled('Check current Circle');assert.equal((await fixture.rsvpRow(circleId,date)).status,'not_going');assert.equal(posts().at(-1).status,409);await refresh();
 pass('a concurrent newer accepted response makes the stale reviewed revision fail without overwriting its attendance');
 let mode='lost';fixture.transformHttp(({path,method,response})=>path===rsvpPath()&&method==='POST'&&mode!=='normal'?new Response('{}',{status:mode==='lost'?503:400}):response);await review('going');await button('Confirm attendance response').click();await enabled('Retry exact participation request');const lostBody=posts().at(-1).body;assert.equal((await fixture.rsvpRow(circleId,date)).status,'going');assert.equal(await button('Check current Circle').isDisabled(),true);assert.equal(await button('Return to member account').isDisabled(),true);assert.match(await p.locator('body').innerText(),/Mark yourself Going/);mode='refuse';await button('Retry exact participation request').click();await enabled('Retry exact participation request');assert.equal(posts().at(-1).status,400);assert.equal(posts().at(-1).body,lostBody);mode='normal';await button('Retry exact participation request').click();await ready();assert.equal(posts().at(-1).body,lostBody);fixture.transformHttp(null);
 pass('lost committed reply retains exact reviewed intent and blocks replacement/navigation; a refused retry preserves uncertainty, and later exact replay plus readback resolves it');
 await review('going');let loseReplay=true;fixture.transformHttp(({path,method,response})=>{if(path===rsvpPath()&&method==='POST'&&loseReplay){loseReplay=false;return new Response('{}',{status:503});}return response;});await button('Confirm attendance response').click();await enabled('Retry exact participation request');const historicalBody=posts().at(-1).body;await direct('not_going');await button('Retry exact participation request').click();await ready();assert.equal(posts().at(-1).body,historicalBody);assert.equal((await fixture.rsvpRow(circleId,date)).status,'not_going');assert.match(await p.locator('body').innerText(),/You are not going\./);fixture.transformHttp(null);
 pass('historical Going receipt replay after a later Not going response shows the fresh current response and never reapplies the historical status');
 await review('going');holdNextPost=true;await button('Confirm attendance response').click();await waitHeld();await enabled('Retry exact participation request');const heldRevision=JSON.parse(heldPost.body).expectedRevision;await button('Close member view').click();await field('Password').waitFor();await show();await signIn();await account();await mine();await ready();await review('not_going');await confirm();assert.equal(await fixture.revision(circleId),heldRevision+1);const delayed=await releaseHeld();assert.equal(delayed.status,409);assert.equal((await fixture.rsvpRow(circleId,date)).status,'not_going');
 pass('after close and a new App session, a newly confirmed unchanged Not going answer fences an older held Going request; the old handler returns409 and cannot overwrite it');
 await review('going');holdNextPost=true;await button('Confirm attendance response').click();await waitHeld();await enabled('Retry exact participation request');await button('Close member view').click();await field('Password').waitFor();await show();await signIn();await account();await mine();await ready();await button('Review leaving this Circle').click();await enabled('Confirm leave');await button('Confirm leave').click();await enabled('Review joining this Circle');const afterLeave=await releaseHeld();assert([403,409].includes(afterLeave.status));assert.equal(await fixture.isMember(circleId),false);assert.equal(await fixture.rsvpRow(circleId,date),null);assert.equal(await p.getByRole('button',{name:/^Review (Going|Not going) on/}).count(),0);
 pass('leaving in a newer context removes attendance and blocks a previously held RSVP from recreating a response or membership');
 await start();await review('going');const oldConfirm=await retain('Confirm attendance response'),oldCancel=await retain('Cancel attendance change');await button('Cancel attendance change').click();await review('not_going',secondDate);const callbacksAt=http.length;await invoke(oldConfirm);await invoke(oldCancel);await settle();assert.equal(http.length,callbacksAt);assert.equal(await button('Confirm attendance response').isEnabled(),true);assert.match(await p.locator('body').innerText(),/Mark yourself Not going/);await button('Cancel attendance change').click();await p.evaluate(()=>window.nativeQa.releaseCallbacks());
 pass('retained real Confirm and Cancel callbacks from an earlier meeting review cannot submit or cancel a newer response');
 await review('going');const staleClose=await retain('Close member view');await p.evaluate(()=>window.nativeQa.activity('blur'));await field('Password').waitFor();const retired=http.length;await p.evaluate(()=>window.nativeQa.activity('focus'));await settle();assert.equal(http.length,retired);await enabled('Restore saved sign-in');await button('Restore saved sign-in').click();await enabled('Continue to my member account');await account();await mine();await ready();await invoke(staleClose);await settle();assert.equal(await button('Check current Circle').isEnabled(),true);assert.equal(await button('Confirm attendance response').count(),0);await p.evaluate(()=>window.nativeQa.releaseCallbacks());
 pass('blur clears private review and focus is inert; explicit SDK/member/current-Circle recovery is required, and old Close cannot retire the newer context');
 for(const transition of ['offline','background']){
  await review('going');const before=http.length;await p.evaluate(kind=>{if(kind==='offline')window.nativeQa.network('offline');else window.nativeQa.activity('change','background');},transition);await field('Password').waitFor();assert.equal(await button('Confirm attendance response').count(),0);await p.evaluate(()=>{window.nativeQa.network('online');window.nativeQa.activity('change','active');window.nativeQa.activity('focus');});await settle();assert.equal(http.length,before);await button('Restore saved sign-in').click();await enabled('Continue to my member account');await account();await mine();await ready();
 }
 pass('offline and background retire the review without writing; reconnect/foreground never restores authority or sends automatically');
 await fixture.db.query('UPDATE book_cohorts SET max_members=3,circle_participation_revision=circle_participation_revision+1 WHERE id=$1',[circleId]);await fixture.join(circleId,'outsider');await refresh();assert.equal((await (await fixture.dispatch(detailPath(),{headers:{Authorization:'Bearer '+ACCESS.author}})).json()).circle.spots_left,0);await review('going');await confirm();assert.equal((await fixture.rsvpRow(circleId,date)).status,'going');
 pass('a full Circle still lets an existing member respond; membership capacity is not presented as a separate meeting-seat limit');
 let forge=true;fixture.transformHttp(async({path,method,response})=>{if(forge&&path===rsvpPath()&&method==='POST'){const body=await response.json();return new Response(JSON.stringify({...body,memberId:fixture.actors.other}),{status:response.status});}return response;});await review('not_going');await button('Confirm attendance response').click();await enabled('Retry exact participation request');assert.equal((await fixture.rsvpRow(circleId,date)).status,'not_going');assert.equal(await button('Check current Circle').isDisabled(),true);forge=false;await button('Retry exact participation request').click();await ready();assert.match(await p.locator('body').innerText(),/You are not going\./);fixture.transformHttp(null);
 pass('a successful HTTP reply with a different member receipt cannot establish success; exact owner-matched replay and fresh detail are required');
 await fixture.quarantine(circleId);await button('Check current Circle').click();await enabled('Review leaving this Circle');assert.equal(await p.getByRole('button',{name:/^Review (Going|Not going) on/}).count(),0);assert.equal(await button('Open discussion').isDisabled(),true);
 pass('hidden Circle state removes new attendance controls while retaining deliberate leave recovery');
 await start();let changed=false;fixture.beforeHttp(async({path,method})=>{if(!changed&&path===detailPath()&&method==='GET'){changed=true;await fixture.db.query('UPDATE book_cohorts SET circle_weekday=(circle_weekday+1)%7,circle_participation_revision=circle_participation_revision+1 WHERE id=$1',[circleId]);}});const calendarPosts=posts().length;await button('Review Going on '+format(date)).click();await enabled('Check current Circle');assert.equal(await button('Confirm attendance response').count(),0);assert.equal(posts().length,calendarPosts);assert.equal(await fixture.rsvpRow(circleId,date),null);assert.match(await p.locator('body').innerText(),/That action is no longer available/);fixture.beforeHttp(null);
 pass('a meeting removed by the fresh calendar check cannot retain a response review or send against its old date');
 await start();await fixture.db.query("UPDATE book_cohorts SET status='completed',circle_participation_revision=circle_participation_revision+1 WHERE id=$1",[circleId]);await button('Check current Circle').click();await enabled('Review leaving this Circle');assert.equal(await p.getByRole('button',{name:/^Review (Going|Not going) on/}).count(),0);
 pass('completed Circles cannot accept a new attendance response while current members can still leave');
 await start({attendance:false});assert.equal(await p.getByRole('button',{name:/^Review (Going|Not going) on/}).count(),0);assert.equal(await button('Open discussion').isEnabled(),true);await p.getByText('Attendance changes are unavailable in this connection.',{exact:true}).waitFor();
 pass('an older native bridge without attendance capability keeps Circle membership/discussion usable and exposes no unsupported RSVP control');
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await p.evaluate(()=>window.nativeQa.unmount());await settle();stats=await state();assert.equal(stats.stats.netListeners,0);assert.equal(stats.stats.appListeners,0);assert.equal(stats.stats.handles,0);assert.equal(stats.stats.retainedCallbacks,0);
 pass('320px attendance views fit without horizontal overflow and terminal unmount clears observers, handles and retained callbacks');
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);for(const[n,h]of Object.entries(sourceHashes))assert.equal(sha(read(n)),h,'Source changed during proof '+n);

}catch(error){failure=error.stack||String(error);if(page)try{console.log('FAILED VIEW',await page.locator('body').innerText());}catch{}}finally{
 write(failure?'FAIL':'CLEANING_UP');if(heldPost){heldPost.release();try{await bounded(async()=>{while(!heldPost.done)await new Promise(r=>setTimeout(r,10));});}catch{}heldPost=null;}
 try{if(page)await bounded(()=>page.evaluate(()=>{window.nativeQa?.release();window.nativeQa?.releasePreparation();window.nativeQa?.unmount();}));}catch{}
 try{if(browser)await bounded(()=>browser.close());cleanup.browser=browser?'closed':'not-created';}catch(error){cleanup.browser='failed';failure??=error.stack||String(error);}
 try{if(fixture)await bounded(()=>fixture.close());cleanup.database=fixture?'closed':'not-created';}catch(error){cleanup.database='failed';failure??=error.stack||String(error);}
 try{assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);for(const[n,h]of Object.entries(sourceHashes))assert.equal(sha(read(n)),h,'Source changed during cleanup '+n);}catch(error){failure??=error.stack||String(error);}write(failure?'FAIL':'PASS');
}
if(failure)throw Error(failure);console.log('PASS native attendance: '+stories.length+' stories.');
