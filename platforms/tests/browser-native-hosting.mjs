import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const [run,platform='android',...extra]=process.argv.slice(2);
assert(!extra.length&&(run===undefined||/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(run))&&['android','ios'].includes(platform));
const ROOT=process.cwd(),output='verification/web/evidence'+(run?'/native-hosting-browser-'+run+'-'+platform:'');
const clipMode=run?.startsWith('clips-');
const shareMode=run?.startsWith('clips-share-');
const salonMode=run?.startsWith('clips-salon-');
const linkMode=run?.startsWith('clips-salon-links-');
const eltMode=run?.startsWith('clips-elt-');
const lavaMode=run?.startsWith('clips-lava-');
if(run)fs.mkdirSync(path.join(ROOT,output));
const file=output+(run?'/browser.json':'/native-hosting-browser.json'),sha=b=>createHash('sha256').update(b).digest('hex');
const fixtureDir='verification/web/evidence/native-hosting-fixture'+(run?'-'+run:'');
function read(name){const p=path.resolve(ROOT,name),s=fs.lstatSync(p);assert(s.isFile()&&!s.isSymbolicLink()&&(!s.size||s.blocks),'Refuse linked/offloaded source '+name);return fs.readFileSync(p);}
function runtime(p){const s=fs.statSync(p);assert(s.size&&s.blocks,'Refuse offloaded runtime');}
async function bounded(fn,ms=5000){let timer;try{return await Promise.race([fn(),new Promise((_,no)=>timer=setTimeout(()=>no(Error('Owned operation timed out')),ms))]);}finally{clearTimeout(timer);}}
read('verification/web/tests/support/public-profile-app.mjs');
process.chdir(path.join(ROOT,'verification/web'));
const {createPublicProfileApp:createCircleHostingApp,publicProfileAppHashes:hostingAppHashes,ORIGIN,PROVIDER,PUBLIC_KEY,TOKENS:ACCESS,SUBJECTS,NEW_SUBJECT}=await import('../../verification/web/tests/support/public-profile-app.mjs');
const priorReceipt=fs.existsSync(path.join(ROOT,file))?{sha256:sha(read(file)),status:JSON.parse(read(file)).status}:null,startedAt=new Date().toISOString(),stories=[],errors=[],unexpected=[],http=[],mediaHttp=[],cleanup={browser:'pending',database:'pending'};
let holdNextPost=false,heldPost=null;
let sourceHashes={},bundle,browser,page,fixture,failure=null,actor='author',mismatch=false,denied=false,stats;
function write(status){fs.writeFileSync(path.join(ROOT,file),JSON.stringify({status,platform,startedAt,completedAt:new Date().toISOString(),stories,errors,unexpected,http,mediaHttp,cleanup,sourceHashes,bundleSHA256:bundle?sha(bundle):null,stats,priorReceipt,failure,
 scope:'Actual registered App, cached AuthClient, native JS hosting/member/anonymous-edition/passage ports, Circle creation and completion screens. Canonical bearer/member/Circle/participation handlers and the current owner-aware hosting and additive membership intent SQL run in disposable PGlite. Native primitives, OS services, delivery and provider identity are explicit doubles. Actual callback functions are retained to model late native events. No native compilation, SDK acquisition, provider call, deployment or production SQL.'},null,2)+'\n');}
const pass=name=>{stories.push(name);write('RUNNING');console.log('PASS '+stories.length+': '+name);};write('RUNNING');
try{
 assert(process.execArgv.some(v=>v.endsWith('/deny-build-network.cjs')),'Startup network denial required');
 const require=createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');runtime(require.resolve('playwright'));
 const executablePath='/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';runtime(executablePath);
 bundle=read(fixtureDir+'/page.js');sourceHashes={...JSON.parse(read(fixtureDir+'/source-manifest.json')).sourceHashes,...await hostingAppHashes(),'platforms/tests/browser-native-hosting.mjs':sha(read('platforms/tests/browser-native-hosting.mjs'))};
 for(const[n,h]of Object.entries(sourceHashes))assert.equal(sha(read(n)),h,'Rebundle changed source '+n);
 fixture=await createCircleHostingApp();
 browser=await require('playwright').chromium.launch({headless:true,timeout:15000,executablePath,env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:'/Users/christaylor'},args:['--disable-background-networking','--disable-component-update','--no-first-run']});
 const context=await browser.newContext({viewport:{width:320,height:850},serviceWorkers:'block'});page=await context.newPage();const p=page;p.setDefaultTimeout(6500);
 const clips=clipMode?JSON.parse(read('platforms/native/clip-catalog.json')).videos:[];
 const media=new Map(clips.map(clip=>{
   const bytes=read(fixtureDir+'/media/'+clip.resource+'.mp4');
   assert.equal(sha(bytes),clip.mediaSHA256);
   return ['/native-clip-media/'+clip.id+'.mp4',bytes];
 }));
 if(clipMode)await context.addInitScript(()=>{window.nativeClipQa={available:true,callbacks:new Map()};});
 p.on('pageerror',e=>errors.push(e.stack||String(e)));p.on('console',m=>{if(m.type()==='error'&&!/^Failed to load resource: the server responded with a status of (400|401|403|404|409|422|429|503)/.test(m.text()))errors.push(m.text());});
 await context.route('**/*',async route=>{try{
  const req=route.request(),u=new URL(req.url());
  if(u.origin===ORIGIN&&u.pathname==='/'){await route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#101d1a;font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif"><div id="root"></div><script type="module" src="/page.mjs"></script></body></html>'});return;}
  if(u.origin===ORIGIN&&u.pathname==='/page.mjs'){await route.fulfill({contentType:'text/javascript',body:bundle});return;}
  const headers=await req.allHeaders();assert.equal(headers.cookie,undefined);
  if(u.origin===ORIGIN&&media.has(u.pathname)){
   assert.equal(u.search,'');assert.equal(req.method(),'GET');assert.equal(headers.authorization,undefined);
   const bytes=media.get(u.pathname),range=headers.range?/^bytes=(\d+)-(\d*)$/.exec(headers.range):null;
   assert(!headers.range||range);
   const first=range?Number(range[1]):0,last=range?.[2]?Math.min(Number(range[2]),bytes.length-1):bytes.length-1;
   assert(first<=last&&first>=0);
   mediaHttp.push({path:u.pathname,status:range?206:200,start:first,end:last});
   await route.fulfill({status:range?206:200,contentType:'video/mp4',headers:{'accept-ranges':'bytes','cache-control':'no-store',
      ...(range?{'content-range':`bytes ${first}-${last}/${bytes.length}`}:{})},body:bytes.subarray(first,last+1)});return;
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
   const publicLane=req.method()==='GET'&&(u.pathname==='/api/circles'||u.pathname==='/api/great-books/passage'||u.pathname.startsWith('/api/great-books/text/'));if(publicLane){assert.equal(headers.authorization,undefined);assert.equal(headers.apikey,undefined);assert.equal(req.method(),'GET');}else assert(Object.values(ACCESS).some(token=>headers.authorization==='Bearer '+token));
   let requestGate=null;
   if(holdNextPost&&(u.pathname==='/api/circles'||u.pathname.endsWith('/complete'))&&req.method()==='POST'){holdNextPost=false;let release;const promise=new Promise(resolve=>{release=resolve;});heldPost={release,done:false,body:req.postData()};requestGate=heldPost;await promise;}
   const response=await fixture.dispatch(u.pathname+u.search,{method:req.method(),headers,body:req.postData()??undefined}),body=await response.text();
   http.push({kind:publicLane?'public':'member',path:u.pathname+u.search,method:req.method(),status:response.status,body:req.postData()??null,...(publicLane?{response:JSON.parse(body)}:{})});if(requestGate){requestGate.done=true;requestGate.status=response.status;}
   await route.fulfill({status:response.status,headers:{'content-type':'application/json','cache-control':'private, no-store'},body});return;
  }
  unexpected.push(u.origin+u.pathname);await route.abort();
 }catch(error){errors.push(error.stack||String(error));try{await route.abort();}catch{}}});


 await p.goto(ORIGIN+'/?platform='+platform);
 const button=name=>p.getByRole('button',{name,exact:true}),field=name=>p.getByLabel(name,{exact:true});
 const settle=()=>p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const enabled=name=>p.waitForFunction(name=>[...document.querySelectorAll('button')].some(x=>x.getAttribute('aria-label')===name&&!x.disabled),name);
 const state=()=>p.evaluate(()=>({stats:window.nativeQa.stats(),requests:window.nativeQa.requests}));
 const retain=label=>p.evaluate(label=>window.nativeQa.retainCallback('press',label),label),invoke=id=>p.evaluate(id=>window.nativeQa.invokeCallback(id),id);
 const text=()=>p.locator('body').innerText(),posts=()=>http.filter(r=>r.method==='POST'&&r.path==='/api/circles');
 const startDate=new Date(Date.now()+2*86400000).toISOString().slice(0,10),title='Native hosted Circle';
 async function waitHeld(){await bounded(async()=>{while(!heldPost)await new Promise(r=>setTimeout(r,10));});}
 async function releaseHeld(){const gate=heldPost;if(!gate)return;gate.release();await bounded(async()=>{while(!gate.done)await new Promise(r=>setTimeout(r,10));});heldPost=null;await settle();return gate;}
 async function show({fresh=true,hosting=true,who='author'}={}){
  await releaseHeld();await p.evaluate(()=>window.nativeQa.unmount());await settle();if(fresh){await fixture.close();fixture=await createCircleHostingApp();}
  fixture.transformHttp(null);fixture.beforeHttp(null);actor=who;mismatch=false;denied=false;holdNextPost=false;
  await p.evaluate(hosting=>{window.nativeQa.hostingAvailable(hosting);window.nativeQa.show();},hosting);await enabled('Connect my account');
 }
 async function signIn(){await button('Connect my account').click();await field('Email').fill(actor==='other'?'other@example.test':'member@example.test');await field('Password').fill('Synthetic-password-only-42');await button('Sign in').click();await enabled('Continue to my member account');}
 async function account(){await button('Continue to my member account').click();await enabled('Check my member account');await button('Check my member account').click();await enabled('Start a Circle');}
 async function enter(){await button('Start a Circle').click();await enabled('Check hosting access');}
 async function check(){await button('Check hosting access').click();await enabled('Check hosting access');}
 async function start(){await show();await signIn();await account();await enter();await check();await field('Circle name').waitFor();}
 async function fill({name=title,format='In person',selectFormat=true}={}){
  await field('Circle name').fill(name);if(selectFormat)await p.getByRole('radio',{name:format,exact:true}).click();
  if(format!=='Online'){await field('City').fill('Boston');await field('Public venue name').fill('Public library');}
  if(format!=='In person')await field('Private meeting link (HTTPS)').fill('https://meeting.example.test/private-host-room');
  await field('Start on or after (YYYY-MM-DD)').fill(startDate);await p.getByRole('radio',{name:'UTC · UTC',exact:true}).click();
  await p.getByRole('checkbox',{name:'I agree to the community norms and to host this free Circle',exact:true}).click();
 }
 async function review(){await button('Review Circle listing').click();await p.getByRole('checkbox',{name:'Create this free Circle with my account',exact:true}).waitFor();}
 async function confirm(retry=false){await p.getByRole('checkbox',{name:'Create this free Circle with my account',exact:true}).click();await button(retry?'Confirm exact Circle creation retry':'Confirm and list Circle').click();}
 async function created(){await enabled('New Circle draft');return(await fixture.hosted()).find(row=>row.title===title)?.id;}
 async function retry(){await button('Review exact Circle creation retry').click();await p.getByRole('checkbox',{name:'Create this free Circle with my account',exact:true}).waitFor();await confirm(true);}
 async function mine(name=title){await button('View my Circles').click();await enabled('Load my Circles');await button('Load my Circles').click();await button('View Circle: '+name).click();await enabled('Check current Circle');}
 async function restore(){await button('Restore saved sign-in').click();await enabled('Continue to my member account');await account();await enter();await check();}

 const screenshot=(name,fullPage=false)=>p.screenshot({path:path.join(ROOT,output,name),fullPage});
 const edition=JSON.parse(read('content/root-kernel/philemon.web-classic.json'));
 const radio=name=>p.getByRole('radio',{name,exact:true});
 const hostingChoice='Prepare Philemon Circle online';
 if(salonMode){
   const beforeUnavailable=http.length;
   await p.evaluate(()=>window.nativeQa.showUnconfigured());
   await button('Find an online Circle').click();
   await p.getByText('Public Circle search is unavailable in this build.',{exact:true}).waitFor();
   assert(await button('Load online Circles').isDisabled());assert.equal(http.length,beforeUnavailable);
   pass('an unconfigured app shows a closed public search and makes no request');
   await show();
   const onlineTitle='Philemon online salon',hybridTitle='Scripture hybrid salon',localTitle='Local-only reading salon';
   const meeting='https://meeting.example.test/synthetic-salon';
   const reelQuestion='How would you report both heights so a reader can tell what each number measures and where it was measured from?';
   const discussReel='Discuss Which height are we measuring? in a Circle';
   const seed=async(who,title,format)=>{
     const expectedMemberId=fixture.actors[who];
     const body=await fixture.createBody({expectedMemberId,title,description:'A synthetic public listing.',format,
       ...(format==='online'?{city:null,venueName:null,venueType:'online'}:{}),onlineUrl:format==='in_person'?null:meeting});
     const reply=await fixture.dispatch('/api/circles',{method:'POST',body,headers:{authorization:'Bearer '+ACCESS[who],origin:ORIGIN,'x-soe-expected-member':expectedMemberId}});
     const result=await reply.json();assert.equal(reply.status,200,result.error);return result.circleId;
   };
   const chosen=await seed('other',onlineTitle,'online');
   await seed('other',hybridTitle,'hybrid');
   await seed('author',localTitle,'in_person');
   const start=http.length,guestButton='Sign in for '+onlineTitle;
   await button('Explore Clips').click();await button('Find an online Circle').click();await enabled('Load online Circles');
   assert.equal(http.length,start);
   await button('Load online Circles').click();await enabled(guestButton);
   assert.equal(await button('Sign in for '+hybridTitle).count(),1);assert.equal(await button('Sign in for '+localTitle).count(),0);
   assert.deepEqual(http.slice(start).map(row=>[row.kind,row.path,row.method]),[['public','/api/circles?format=online','GET']]);
   assert.equal((await state()).stats.prepared,0);assert.equal((await state()).stats.reads,0);
   assert(!(await text()).includes(meeting));assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await screenshot('online-circles-guest-320.png',true);
   const staleChoice=await retain(guestButton);
   await button('Back from online Circles').click();await button('Read the full Philemon study').click();
   await button('Find an online reading Circle').click();await enabled('Load online Circles');await invoke(staleChoice);
   assert.equal(await button('Clear selected Circle').count(),0);
   await button('Back from online Circles').click();await button('Back to account').click();
   if (linkMode) {
     const before = http.length;
     const link = ORIGIN + '/clips/watch/which-height';
     await p.evaluate(link => window.nativeQa.show('offline', false, link, 'inactive'), link);
     await p.getByText('Shared Reel', { exact: true }).waitFor();
     assert(await button('Play Which height are we measuring?').isDisabled());
     await p.evaluate(() => { window.nativeQa.activity('change', 'active'); window.nativeQa.network('online'); });
     await enabled('Play Which height are we measuring?');
     assert.equal(await button('Play Who gets the night sky?').count(), 0);
     assert.equal(await button('Connect my account').count(), 0);
     assert.equal(await p.locator('video').count(), 0);
     assert.equal(http.length, before);assert.equal(mediaHttp.length, 0);
     assert.equal((await state()).stats.prepared, 0);
     await p.getByText('Shared Reel', { exact: true }).waitFor();
     const discussBounds = await button(discussReel).boundingBox();
     assert(discussBounds.y + discussBounds.height <= 850);
     await screenshot('shared-reel-cold-320.png', true);
     pass('a cold link delivered before foreground while offline opens the exact public Reel and transcript without autoplay, an account read or a Circle request');
   } else await button('Explore Clips').click();
   await button(discussReel).click();await enabled('Load online Circles');
   await p.getByText(reelQuestion,{exact:true}).waitFor();
   await button('Load online Circles').click();await enabled(guestButton);
   await button(guestButton).click();await enabled('Connect my account');
   assert((await text()).includes('Sign in to continue with '+onlineTitle));
   await p.getByText(reelQuestion,{exact:true}).waitFor();
   assert.equal((await state()).stats.prepared,0);assert.equal((await state()).stats.reads,0);
   pass('signed-out Clips and Philemon reach online and hybrid listings through the anonymous policy without an account client or a saved-session read; retiring the public screen prevents an old selection');

   await signIn();await button('Continue to my member account').click();await enabled('Check my member account');
   assert(await button('Open selected Circle').isDisabled());
   await button('Check my member account').click();await enabled('Open selected Circle');
   const path='/api/circles/'+chosen,at=http.length;
   await button('Open selected Circle').click();await enabled('Review joining this Circle');
   assert.deepEqual(http.slice(at).filter(row=>row.path.startsWith('/api/circles/')).map(row=>[row.path,row.method]),[[path,'GET']]);
   assert((await text()).includes(onlineTitle));assert.equal(await button('Open online meeting').count(),0);
   await button('Review joining this Circle').click();await enabled('Confirm join');
   assert.equal(await button('Open online meeting').count(),0);
   await button('Confirm join').click();await enabled('Open online meeting');
   pass('the selected public Circle survives sign-in and opens only after current member verification; the meeting stays closed through join review');

   await p.getByText(reelQuestion,{exact:true}).waitFor();
   await button('Open discussion').click();await enabled('Open complete discussion archive');
   assert.equal(await button('Use Reel question in a draft').count(),0);
   const posts=()=>http.filter(row=>row.path===path+'/discussion'&&row.method==='POST').length;
   const beforePost=posts();
   await button('Open complete discussion archive').click();await enabled('Use Reel question in a draft');
   const oldStarter=await retain('Use Reel question in a draft');
   await button('Use Reel question in a draft').click();
   const draft=field('Your discussion comment');
   const expected=reelQuestion+'\n\n'+ORIGIN+'/clips/watch/which-height';
   assert.equal(await draft.inputValue(),expected);
   const edited='I would name the reference point for each measurement.\n\n'+expected;
   await draft.fill(edited);await invoke(oldStarter);
   assert.equal(await draft.inputValue(),edited);
   await button('Prepare discussion preview').click();
   const reviewed=p.getByRole('checkbox',{name:'I reviewed this exact message and target, and want to post it to this Circle'});
   await reviewed.waitFor();
   assert(await button('Post reviewed discussion message').isDisabled());assert.equal(posts(),beforePost);
   await p.getByText(edited,{exact:true}).waitFor();
   await reviewed.click();await button('Post reviewed discussion message').click();await enabled('Open saved discussion message');
   assert.equal(posts(),beforePost+1);
   assert.deepEqual((await fixture.db.query('SELECT content FROM seminar_messages WHERE cohort_id=$1 AND member_id=$2',
    [chosen,fixture.authorId])).rows,[{content:edited}]);
   await button('Back to Circle').click();await enabled('Open online meeting');
   pass('the Reel question survives guest discovery and sign-in, cannot overwrite an active draft, and saves the edited text exactly once after review');

   const openings=()=>p.evaluate(()=>[...window.nativeQa.openedMeetings]);
   const firstOpenAt=http.length;
   await button('Open online meeting').click();await p.waitForFunction(()=>window.nativeQa.openedMeetings.length===1);
   assert.deepEqual(await openings(),[meeting]);assert(!(await text()).includes(meeting));
   assert.equal(http.slice(firstOpenAt).filter(row=>row.path===path&&row.method==='GET').length,1);
   const staleMeeting=await retain('Open online meeting');
   await button('Review leaving this Circle').click();await button('Confirm leave').click();await enabled('Review joining this Circle');
   await invoke(staleMeeting);await settle();assert.deepEqual(await openings(),[meeting]);assert.equal(await button('Open online meeting').count(),0);
   pass('current members open the exact meeting after a fresh read, and confirmed leave retires the button and its old callback');

   await button('Review joining this Circle').click();await button('Confirm join').click();await enabled('Open online meeting');
   await fixture.leave('author',chosen);
   await button('Open online meeting').click();await enabled('Review joining this Circle');
   assert.deepEqual(await openings(),[meeting]);assert.equal(await button('Open online meeting').count(),0);
   pass('an explicit open rechecks SQL after remote membership removal and declines the old meeting link');

   await button('Review joining this Circle').click();await button('Confirm join').click();await enabled('Open online meeting');
   await p.evaluate(path=>window.nativeQa.hold(path,'GET'),path);
   await button('Open online meeting').click();await p.waitForFunction(path=>window.nativeQa.requests.some(request=>request.path===path&&request.held),path);
   await p.evaluate(()=>window.nativeQa.activity('change','background'));await p.evaluate(()=>window.nativeQa.release());await settle();
   assert.deepEqual(await openings(),[meeting]);assert.equal(await button('Open online meeting').count(),0);
   pass('a meeting reply delivered after backgrounding cannot open the meeting');
   if (linkMode) {
     await show();await signIn();await account();
     await button('Read Philemon').click();await button('Host guide').waitFor();
     const before = http.length;
     await p.evaluate(url => window.nativeQa.emitLink(url), ORIGIN + '/clips/watch/night-sky-traffic');
     await settle();await button('Host guide').waitFor();
     assert.equal(await button('Open shared Reel').count(), 0);
     await button('Back to account').click();await enabled('Open shared Reel');
     const staleOpen = await retain('Open shared Reel');
     await p.evaluate(url => window.nativeQa.emitLink(url), ORIGIN + '/clips/watch/telescope-first-tilt');
     await settle();await invoke(staleOpen);
     await enabled('Open shared Reel');assert.equal(await p.getByText('Shared Reel', {exact: true}).count(), 0);
     for (const url of [ORIGIN + '/clips/watch/night-sky-traffic?token=secret', 'https://another.test/clips/watch/which-height',
       'com.example.email://auth/callback?code=fixture', ORIGIN + '/circles/private', ORIGIN + '/clips/watch/missing-reel']) {
       await p.evaluate(url => window.nativeQa.emitLink(url), url);
     }
     await settle();
     await button('Open shared Reel').click();
     await enabled('Play What did the tilt prove?');
     assert.equal(await button('Play Who gets the night sky?').count(), 0);
     assert.equal(http.length, before);assert.equal(await p.locator('video').count(), 0);
     await button('Discuss What did the tilt prove? in a Circle').click();await enabled('Search Circles');
     assert.equal(await radio('Online').getAttribute('aria-checked'), 'true');assert.equal(http.length, before);
     pass('a warm link preserves the open study, rejects malformed and older actions, and opens the latest chosen Reel into the verified member directory');
   }
   await show();
 }
 if(clipMode){
   const video=p.locator('video');
   const first=lavaMode?clips.find(clip=>clip.id==='which-height')
     :eltMode?clips.find(clip=>clip.id==='telescope-first-tilt'):platform==='android'?clips[1]:clips[0];
   const second=platform==='android'?clips[0]:clips[1];
   assert(first && second && first.id!==second.id);
   const open=()=>button('Explore Clips').click();
   const play=clip=>button('Play '+clip.title).click();
   const playing=async clip=>{
     try{await p.waitForFunction(id=>[...document.querySelectorAll('video')].some(el=>el.dataset.clipId===id&&!el.paused&&el.currentTime>0.25),clip.id);}
     catch(error){
       const states=await video.evaluateAll(elements=>elements.map(el=>({id:el.dataset.clipId,ready:el.readyState,paused:el.paused,ended:el.ended,time:el.currentTime,error:el.error?.code})));
       throw Error('Playback did not start for '+clip.id+' '+JSON.stringify(states),{cause:error});
     }
   };
   const normalise=value=>value.replace(/\s+/g,' ').trim();
   const originalHttp=http.length;
   await p.evaluate(()=>window.nativeQa.network('offline'));await open();await enabled('Play '+first.title);
   assert.equal(await field('Password').count(),0);
   assert.equal(await video.count(),0);assert.deepEqual(mediaHttp,[]);assert.equal(http.length,originalHttp);
   assert.equal((await state()).stats.prepared,0);
   const publicCopy=normalise(await text());
   for(const clip of clips){assert(publicCopy.includes(clip.credit));assert(publicCopy.includes(normalise(clip.transcript)));}
   assert(publicCopy.includes(edition.paragraphs[0][2].text)&&publicCopy.includes('https://creativecommons.org/licenses/by/4.0/'));
   if(lavaMode){
     assert(publicCopy.includes('https://www.pexels.com/terms-of-service/'));
     assert(publicCopy.includes('USGS eruption report · https://www.usgs.gov/media/videos/october-17-2026-video-kilauea-summit-lava-fountaining-episode-55'));
   }
   pass('signed-out offline Clips shows exact transcripts, Philemon and the Reel credit before any player, account or media request');

   const shareClip = clips.find(clip => clip.attribution);
   const shareLabel = 'Share ' + shareClip.title;
   const shareUrl = ORIGIN + '/clips/watch/' + shareClip.id;
   const payload = { title: shareClip.title, message: shareClip.title + '\n' + shareUrl };
   const shares = () => p.evaluate(() => window.nativeQa.reelShares);
   let staleShare;
   if (shareMode) {
     assert.deepEqual(await shares(), []);
     const beforeShare = (await state()).stats;
     await button(shareLabel).click();
     await p.waitForFunction(() => window.nativeQa.reelShares.length === 1);
     assert.deepEqual(await shares(), [payload]);
     const afterShare = (await state()).stats;
     for (const key of ['prepared', 'reads', 'writes', 'handles']) assert.equal(afterShare[key], beforeShare[key]);
     assert.equal(http.length, originalHttp);
     assert.deepEqual(mediaHttp, []);
     await p.evaluate(() => window.nativeQa.shareUnavailable(true));
     await button(shareLabel).click();
     await p.getByText(shareUrl, { exact: true }).waitFor();
     await p.evaluate(() => window.nativeQa.shareUnavailable(false));
     staleShare = await retain(shareLabel);
     pass('an explicit guest tap passes only the public Reel link and title to the share sheet, with a copyable link if it fails');
   }

   await play(first);await playing(first);
   assert.equal(await video.count(),1);
   const firstKey=await video.getAttribute('data-request-key');
   const dimensions=await video.evaluate(el=>({width:el.videoWidth,height:el.videoHeight,duration:el.duration,rate:el.playbackRate}));
   assert.equal(dimensions.width,first.width);assert.equal(dimensions.height,first.height);
   assert(Math.abs(dimensions.duration-first.durationMs/1000)<0.25);assert.equal(dimensions.rate,1);
   await video.scrollIntoViewIfNeeded();await screenshot('clips-playing-320.png');
   await button('Pause '+first.title).click();
   await p.waitForFunction(()=>document.querySelector('video')?.paused&&document.body.textContent.includes('Paused'));
   await play(first);await playing(first);
   assert.equal(await video.getAttribute('data-request-key'),firstKey);
   await button('Replay '+first.title).waitFor({timeout:31_000});
   assert(await video.evaluate(el=>el.ended&&el.currentTime>=el.duration-0.05));
   pass('the actual packaged video decodes at the pinned size and normal speed, pauses, resumes the same view and reaches the end');

   await button('Replay '+first.title).click();await playing(first);
   assert.notEqual(await video.getAttribute('data-request-key'),firstKey);
   await play(second);await playing(second);assert.equal(await video.count(),1);
   const retiredKey=await video.getAttribute('data-request-key');
   const beforeBlur=mediaHttp.length;
   await p.evaluate(platform=>window.nativeQa.activity(platform==='android'?'blur':'change','inactive'),platform);
   await p.waitForFunction(()=>document.querySelectorAll('video').length===0);
   await p.evaluate(platform=>window.nativeQa.activity(platform==='android'?'focus':'change','active'),platform);
   await p.evaluate(key=>window.nativeClipQa.callbacks.get(key)('playing'),retiredKey);
   await settle();assert.equal(await video.count(),0);assert.equal(mediaHttp.length,beforeBlur);assert.equal(http.length,originalHttp);
   pass('replay and clip switching own one player, and focus loss stops it without replay from a late event');

   await play(second);await playing(second);
   const closedKey=await video.getAttribute('data-request-key');
   await button('Back to account').click();await enabled('Connect my account');
   if (shareMode) {
     await invoke(staleShare);
     assert.deepEqual(await shares(), [payload]);
     pass('a retired Clips screen cannot open the share sheet through an old control');
   }
   const afterClose=mediaHttp.length;
   await open();await button('Back to account').waitFor();
   await p.evaluate(key=>window.nativeClipQa.callbacks.get(key)('playing'),closedKey);
   await settle();assert.equal(await video.count(),0);assert.equal(mediaHttp.length,afterClose);
   await button('Read the full Philemon study').click();
   await button('Read the letter').waitFor();assert((await text()).includes(edition.paragraphs.at(-1).at(-1).text));
   await button('Back to account').click();
   await p.evaluate(()=>{window.nativeClipQa.available=false;});
   await open();await button('Back to account').waitFor();
   assert.equal(await button('Play '+first.title).count(),0);
   assert(normalise(await text()).includes(normalise(first.transcript)));
   await button('Back to account').click();
   await p.evaluate(()=>{window.nativeClipQa.available=true;window.nativeClipQa.callbacks.clear();window.nativeQa.network('online');});
   assert.equal(http.length,originalHttp);
   pass('closing retires active playback, the reading clip opens the full study, and a build without the player still provides the text');

   await signIn();await account();
   const signedInAt=http.length,mediaAt=mediaHttp.length;
   await open();await button('Find an online Circle').waitFor();
   if (shareMode) {
     await button(shareLabel).click();
     await p.waitForFunction(() => window.nativeQa.reelShares.length === 2);
     assert.deepEqual(await shares(), [payload, payload]);
     assert.equal(http.length, signedInAt);
     pass('a verified member shares the same guest-readable URL without including member information');
   }
   await button('Find an online Circle').click();await button('Search Circles').waitFor();await settle();
   assert.equal(await radio('Online').getAttribute('aria-checked'),'true');
   assert.equal(await video.count(),0);assert.equal(http.length,signedInAt);assert.equal(mediaHttp.length,mediaAt);
   pass('the verified member screen opens Clips and continues to Circle discovery without an automatic account, discovery or media request');
   await show();
 }
 const chooseOnline=async()=>{await button('Read Philemon').click();await button('Host guide').click();await button('Prepare a weekly online Circle').click();};

 await show();
 await p.evaluate(()=>window.nativeQa.network('offline'));
 const offlineAt=http.length, staleConnect=await retain('Connect my account');
 await button('Read Philemon').press('Enter');
 await invoke(staleConnect);
 const scripture=await text();
 for(const paragraph of edition.paragraphs)for(const verse of paragraph)assert(scripture.includes(verse.text),'Missing verse '+verse.verse);
 for(const note of edition.footnotes)assert(scripture.includes(note.text),'Missing footnote '+note.verse);
 assert(scripture.includes(edition.publisherUrl)&&scripture.includes(edition.rightsUrl));
 assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await screenshot('philemon-letter-320.png');
 await button('Compare readings').click();
 const notes=await text();
 assert.match(notes,/Nicene Christian reading/);
 assert.match(notes,/Biblical Unitarian reading/);
 assert.match(notes,/Catholic Catechism, paragraphs 253–255/);
 assert.match(notes,/https:\/\/www\.biblicalunitarian\.com\/articles\/what-do-biblical-unitarians-believe/);
 assert.match(notes,/Questions for your salon/);
 await screenshot('philemon-notes-320.png');
 await button('Host guide').click();
 const guide=await text();
 assert.match(guide,/45-minute conversation with four to six readers/);
 assert.match(guide,/Share the meeting link privately/);
 for(const stage of ['Welcome · 5 min','Read aloud · 8 min','Compare the greeting · 12 min','Discuss the appeal · 15 min','Close · 5 min'])assert(guide.includes(stage));
 await screenshot('philemon-guide-320.png');
 const staleGuide=await retain('Prepare a weekly online Circle');
 await button('Back to account').click();
 await invoke(staleGuide);await settle();
 assert.equal(http.length,offlineAt);
 assert.equal((await state()).stats.prepared,0);
 assert.equal(await button('Clear Philemon hosting choice').count(),0);
 pass('signed-out readers open all 25 exact verses, both publisher notes, both sourced perspectives and the 45-minute host guide offline. Retired Connect and host-guide callbacks leave the account and hosting choice untouched');

 await show();
 const choiceAt=http.length;
 await chooseOnline();await settle();
 assert.equal(http.length,choiceAt);
 assert.equal((await state()).stats.prepared,0);
 assert.equal(await button('Clear Philemon hosting choice').count(),1);
 await signIn();await account();await enabled(hostingChoice);
 const checkAt=http.length;
 await button(hostingChoice).click();await enabled('Check hosting access');await settle();
 assert.equal(http.length,checkAt);
 assert.equal(await field('Circle name').count(),0);
 await check();await field('Circle name').waitFor();
 assert.equal(await radio('Online').getAttribute('aria-checked'),'true');
 assert.equal(await field('Private meeting link (HTTPS)').inputValue(),'');
 assert.equal(await field('Public venue name').count(),0);
 const editionAt=http.length;
 assert.equal(await radio('Choose a book and weekly selections').getAttribute('aria-checked'),'true');
 assert.equal(await radio('Paul’s Letter to Philemon').getAttribute('aria-checked'),'true');
 await button('Load source edition').click();
 await field('Week 1 first reading position').waitFor();
 const editionCall=http.slice(editionAt).find(row=>row.kind==='public');
 assert.equal(editionCall.path,'/api/great-books/text/philemon');
 assert.equal(editionCall.status,200);
 assert.equal(await field('Week 1 last reading position').inputValue(),'1');
 await fill({name:'Philemon native salon',format:'Online',selectFormat:false});
 const reviewAt=posts().length;
 await review();
 assert.match(await text(),/World English Bible publisher/);
 assert.doesNotMatch(await text(),/Project Gutenberg edition/);
 assert.equal(posts().length,reviewAt);
 assert.equal(await button('Confirm and list Circle').isDisabled(),true);
 await confirm();await enabled('New Circle draft');
 const hosted=(await fixture.hosted()).find(row=>row.title==='Philemon native salon');
 assert(hosted&&await fixture.isMember(hosted.id));
 assert.equal(posts().length,reviewAt+1);
 const posted=JSON.parse(posts().at(-1).body);
 assert.equal(posted.format,'online');
 assert.equal(posted.expectedMemberId,fixture.authorId);
 assert.deepEqual(posted.readingProgram,{version:1,bookId:'philemon',editionId:editionCall.response.edition.editionId,sessions:[{from:0,to:0}]});
 assert.deepEqual(hosted.circle_reading_program,posted.readingProgram);
 const anonymous=await fixture.dispatch('/api/circles/'+hosted.id);
 const owned=await fixture.dispatch('/api/circles/'+hosted.id,{headers:{authorization:'Bearer '+ACCESS.author}});
 assert.equal(anonymous.status,200);assert.equal(owned.status,200);
 assert.doesNotMatch(await anonymous.text(),/private-host-room/);
 assert.match(await owned.text(),/private-host-room/);
 await mine('Philemon native salon');
 const readAt=http.length;
 await button('Read meeting 1 selection').click();
 await button('Compare readings').waitFor();
 assert.match(await text(),/Scripture · Philemon 1|Publisher footnotes/);
 assert.match(await text(),/Grace to you and peace from God our Father and the Lord Jesus Christ/);
 assert.match(await text(),/Verse 10/);
 assert.equal(http.slice(readAt).some(row=>row.path==='/api/circles/'+hosted.id&&row.status===200),true);
 assert.equal(http.slice(readAt).some(row=>row.kind==='public'),false);
 await button('Compare readings').click();
 assert.match(await text(),/Biblical Unitarian reading/);
 await button('Back to Circle reading plan').click();
 await enabled('Check current Circle');
 pass('the Philemon guide carries Online and the exact edition through sign-in, verification and reviewed creation. Circle detail opens the complete bundled letter and study notes after a fresh check');

 await show();
 await chooseOnline();
 await button('Clear Philemon hosting choice').click();
 await signIn();await account();
 assert.equal(await button(hostingChoice).count(),0);
 await enter();await check();await field('Circle name').waitFor();
 assert.equal(await radio('In person').getAttribute('aria-checked'),'true');
 assert.equal(await field('Private meeting link (HTTPS)').count(),0);
 await button('Return to member account').click();
 const memberStudyAt=http.length;
 await chooseOnline();await enabled('Check hosting access');await settle();
 assert.equal(http.length,memberStudyAt);
 await check();await field('Circle name').waitFor();
 assert.equal(await radio('Online').getAttribute('aria-checked'),'true');
 assert.equal(await field('Private meeting link (HTTPS)').inputValue(),'');
 await field('Private meeting link (HTTPS)').fill('https://meeting.example.test/retired-philemon-draft');
 fixture.transformHttp(async({path,response})=>{
  if(path!=='/api/circles/start')return response;
  const result=await response.json();result.memberId=fixture.actors.other;return Response.json(result);
 });
 await check();
 assert.equal(await field('Private meeting link (HTTPS)').count(),0);
 assert.doesNotMatch(await text(),/retired-philemon-draft/);
 fixture.transformHttp(null);
 await check();await field('Circle name').waitFor();
 assert.equal(await radio('Online').getAttribute('aria-checked'),'true');
 assert.equal(await field('Private meeting link (HTTPS)').inputValue(),'');
 assert.equal(await radio('Paul’s Letter to Philemon').getAttribute('aria-checked'),'true');
 pass('ordinary hosting starts in person. A failed owner check clears the private draft while retaining the public Online and Philemon presets');

 if(platform==='android'){
 await show();const beforeConnect=http.length;await settle();assert.equal(http.length,beforeConnect);await signIn();await account();const beforeEntry=http.length;await enter();await settle();assert.equal(http.length,beforeEntry);assert.equal(await field('Circle name').count(),0);await check();await fill();const beforeReview=posts().length;await review();assert.equal(posts().length,beforeReview);assert.equal(await button('Confirm and list Circle').isDisabled(),true);assert.match(await text(),/First meeting:/);assert.match(await text(),/Shared 12-week starter/);await screenshot('native-hosting-review-320.png',true);await confirm();let circleId=await created();assert(!String(await text()).includes('Active Circles at your last hosting check'));assert(!String(await text()).includes('Active Circles you host:'));assert(circleId);assert.equal((await fixture.hosted()).length,1);assert.equal(await fixture.isMember(circleId),true);assert.equal(JSON.parse(posts().at(-1).body).expectedMemberId,fixture.authorId);assert.equal(http.at(-1).path,'/api/circles/'+circleId);
 pass('actual App sign-in with cached AuthClient and canonical member checks reaches inert hosting entry; explicit owner eligibility, reviewed starter schedule and checkbox create one Circle and host membership, with current detail checked before another draft');

 const firstCircle=circleId;await button('New Circle draft').click();assert.equal(await field('Circle name').count(),0);await check();assert.equal(await field('Circle name').inputValue(),'');await fill({name:'Second deliberate hosted Circle'});await review();await confirm();await enabled('New Circle draft');assert.equal((await fixture.hosted()).length,2);assert((await fixture.hosted()).some(row=>row.id===firstCircle));
 pass('only verified creation success enables New Circle draft; it clears earlier fields and requires fresh eligibility and review before a distinct second listing');

 await start();await fill({format:'In person + online'});await p.getByRole('radio',{name:'Choose a book and weekly selections',exact:true}).click();await p.getByRole('radio',{name:'Hamlet',exact:true}).click();await button('Load source edition').click();await field('Week 1 first reading position').waitFor();await field('Week 1 first reading position').fill('42');await field('Week 1 last reading position').fill('43');const oldRead=await retain('Read week 1 selection');await field('Week 1 last reading position').fill('44');const oldReadAt=http.length;await invoke(oldRead);await settle();assert.equal(http.length,oldReadAt);assert.equal(await p.getByLabel('Reading text',{exact:true}).count(),0);await field('Week 1 last reading position').fill('43');const publicAt=http.length;await button('Read week 1 selection').click();await p.getByLabel('Reading text',{exact:true}).waitFor();assert.match(await text(),/Project Gutenberg/);const passage=http.slice(publicAt).filter(row=>row.kind==='public');assert.equal(passage.length,1);assert.match(passage[0].path,/\/passage\?book=hamlet&edition=[^&]+&block=41$/);assert.equal(http.slice(publicAt).filter(row=>row.kind==='provider').length,0);await button('Back to Circle draft').click();assert.equal(await field('Circle name').inputValue(),title);assert.equal(await field('Week 1 first reading position').inputValue(),'42');await button('Add another reading week').click();await field('Week 2 first reading position').fill('1');await field('Week 2 last reading position').fill('2');await review();assert.match(await text(),/private-host-room/);await confirm();circleId=await created();let payload=JSON.parse(posts().at(-1).body);assert.deepEqual(payload.readingProgram.sessions,[{from:41,to:42},{from:0,to:1}]);assert.equal(payload.readingProgram.bookId,'hamlet');assert.deepEqual(JSON.parse(JSON.stringify((await fixture.hosted())[0].circle_reading_program)),payload.readingProgram);
 const publicResponse=await fixture.dispatch('/api/circles/'+circleId);assert.equal(publicResponse.status,200);assert(!JSON.stringify(await publicResponse.json()).includes('private-host-room'));
 pass('custom hybrid hosting uses actual edition metadata and public native passage ports to preview Hamlet before listing; source credits, exact weekly coordinates and draft survive the reader return, while the canonical public listing excludes the private meeting URL');

 await mine();await button('Review completing this Circle').click();await enabled('Confirm Circle completion');assert.match(await text(),/permanently closes new joins and attendance responses/);const completionAt=http.filter(row=>row.path.endsWith('/complete')).length;await button('Cancel Circle completion').click();assert.equal(http.filter(row=>row.path.endsWith('/complete')).length,completionAt);await button('Review completing this Circle').click();await button('Confirm Circle completion').click();await enabled('Check current Circle');assert.equal((await fixture.membership(circleId)).ended,true);assert.equal(await fixture.isMember(circleId),true);assert.equal(await button('Review completing this Circle').count(),0);assert.equal(await button('Open discussion').isEnabled(),true);const completion=http.filter(row=>row.path.endsWith('/complete')).at(-1);assert.equal(JSON.parse(completion.body).expectedMemberId,fixture.authorId);
 pass('the host reviews and can cancel completion; confirmed owner-bound completion closes future joins and attendance while retaining existing membership and discussion access');

 await start();await fill();await review();await confirm();circleId=await created();const left=await fixture.dispatch('/api/circles/'+circleId+'/leave',{method:'POST',headers:{authorization:'Bearer '+ACCESS.author},body:{requestId:crypto.randomUUID(),expectedRevision:await fixture.revision(circleId)}});assert.equal(left.status,200);await fixture.db.query('UPDATE book_cohorts SET start_date=NULL WHERE id=$1',[circleId]);await mine();assert.match(await text(),/full listing is unavailable/);assert.equal(await fixture.isMember(circleId),false);await button('Review completing this Circle').click();await button('Confirm Circle completion').click();await enabled('Check current Circle');assert.equal((await fixture.db.query('SELECT status FROM book_cohorts WHERE id=$1',[circleId])).rows[0].status,'completed');assert.equal(await fixture.isMember(circleId),false);assert.equal(await button('Open discussion').isDisabled(),true);
 pass('My Circles recovers hosted-left membership controls when the calendar is unavailable; the canonical host can complete without rejoining or receiving member discussion access');

 await start();await fill();await review();holdNextPost=true;await confirm();await waitHeld();await enabled('Review exact Circle creation retry');const exact=heldPost.body;assert.equal((await fixture.hosted()).length,0);await check();assert.match(await text(),/may already have been created/);assert.equal(await button('Return to member account').isDisabled(),true);assert.equal(await field('Circle name').count(),0);await button('Review exact Circle creation retry').click();await p.getByRole('checkbox',{name:'Create this free Circle with my account',exact:true}).waitFor();await button('Cancel Circle review').click();await enabled('Review exact Circle creation retry');await retry();await created();assert.equal(posts().at(-1).body,exact);await releaseHeld();assert.equal((await fixture.hosted()).length,1);
 pass('a create held before SQL remains unknown after unchanged eligibility; normal navigation stays blocked, exact retry has a cancellable review, and later original delivery cannot duplicate the recovered Circle');

 await start();await fill();await review();holdNextPost=true;await confirm();await waitHeld();await enabled('Review exact Circle creation retry');const refusedBody=heldPost.body;let refuse=true;fixture.beforeHttp(({path,method})=>path==='/api/circles'&&method==='POST'&&refuse?Response.json({error:'Synthetic refusal'},{status:400}):null);await retry();await enabled('Review exact Circle creation retry');assert.equal(posts().at(-1).body,refusedBody);assert.equal(await button('Return to member account').isDisabled(),true);refuse=false;await retry();await created();await releaseHeld();assert.equal((await fixture.hosted()).length,1);fixture.beforeHttp(null);
 pass('a rejected exact retry preserves uncertainty about an older held attempt and its original bytes until an explicit successful retry resolves it');

 for(const transition of ['blur','offline','background']){
  await start();await fill({format:'Online'});await review();holdNextPost=true;await confirm();await waitHeld();await p.evaluate(kind=>{if(kind==='offline')window.nativeQa.network('offline');else if(kind==='background')window.nativeQa.activity('change','background');else window.nativeQa.activity('blur');},transition);await field('Password').waitFor();assert(!String(await text()).includes('private-host-room'));const retired=http.length;await p.evaluate(()=>{window.nativeQa.network('online');window.nativeQa.activity('change','active');window.nativeQa.activity('focus');});await settle();assert.equal(http.length,retired);await restore();await enabled('Review exact Circle creation retry');assert.equal(await field('Circle name').count(),0);await retry();await created();await releaseHeld();assert.equal((await fixture.hosted()).length,1);
 }
 pass('blur, background and offline unmount private hosting presentation but preserve exact unknown creation inside the retained owned-account context; foreground is inert and fresh SDK/member/hosting proof precedes explicit retry');

 await start();await fill();const oldReview=await retain('Review Circle listing');await field('Circle name').fill('Updated raw draft');const rawAt=http.length;await invoke(oldReview);await settle();assert.equal(http.length,rawAt);assert.equal(await button('Confirm and list Circle').count(),0);await review();await p.getByRole('checkbox',{name:'Create this free Circle with my account',exact:true}).click();const oldConfirm=await retain('Confirm and list Circle'),oldCancel=await retain('Cancel Circle review');await button('Cancel Circle review').click();await field('Circle name').fill('Newer native listing');await review();const callbackAt=http.length;await invoke(oldConfirm);await invoke(oldCancel);await settle();assert.equal(http.length,callbackAt);assert.match(await text(),/Newer native listing/);assert.equal(await button('Confirm and list Circle').isDisabled(),true);await confirm();await enabled('New Circle draft');assert.equal((await fixture.hosted())[0].title,'Newer native listing');
 pass('actual native Review, Confirm and Cancel callbacks captured before raw edits or from an older review cannot submit or dismiss a newer listing');

 await start();await fill({format:'Online'});const oldClose=await retain('Close member view'),oldInput=await p.evaluate(()=>window.nativeQa.retainCallback('change','Circle name'));await p.evaluate(()=>window.nativeQa.activity('blur'));await field('Password').waitFor();await p.evaluate(()=>window.nativeQa.activity('focus'));await restore();await field('Circle name').waitFor();assert.equal(await field('Circle name').inputValue(),'');await fill({name:'Current remounted listing'});const remountAt=http.length;await invoke(oldClose);await p.evaluate(id=>window.nativeQa.invokeCallback(id,'Retired draft injection'),oldInput);await settle();assert.equal(http.length,remountAt);assert.equal(await field('Circle name').inputValue(),'Current remounted listing');
 pass('retained old child Close and input callbacks cannot close a recovered member context or edit the new unsent hosting draft');

 await start();await fill({format:'Online'});let wrongOwner=true;fixture.transformHttp(async({path,response})=>{if(path!=='/api/circles/start'||!wrongOwner)return response;const value=await response.json();value.memberId=fixture.actors.other;return Response.json(value);});await check();assert.equal(await field('Circle name').count(),0);assert(!String(await text()).includes('private-host-room'));wrongOwner=false;await check();await field('Circle name').waitFor();assert.equal(await field('Circle name').inputValue(),'');assert.equal(await p.getByRole('radio',{name:'In person',exact:true}).getAttribute('aria-checked'),'true');fixture.transformHttp(null);
 pass('a failed canonical owner check removes the raw private draft, and successful same-account recovery cannot resurrect its name or meeting link');

 await start();await fill();await review();mismatch=true;const actorPosts=posts().length;await confirm();await enabled('Check hosting access').catch(()=>{});assert.equal(posts().length,actorPosts);assert.equal((await fixture.hosted()).length,0);mismatch=false;
 pass('an exact-token provider subject mismatch at confirmation cannot issue a hosting POST or create a listing for either account');

 await start();await fill();await review();let lost=true;fixture.transformHttp(({path,method,response})=>path==='/api/circles'&&method==='POST'&&lost?Response.json({error:'Lost committed reply'},{status:503}):response);await confirm();await enabled('Review exact Circle creation retry');assert.equal((await fixture.hosted()).length,1);lost=false;await check();assert.equal(await button('New Circle draft').count(),0);await retry();await created();assert.equal((await fixture.hosted()).length,1);fixture.transformHttp(null);
 pass('a lost committed creation cannot be settled by a changed hosting count; exact replay and fresh owner detail recover its one persisted Circle');

 await start();await fill();await review();let failRead=true;fixture.transformHttp(({path,method,response})=>method==='GET'&&/^\/api\/circles\/[0-9a-f-]+$/.test(path)&&failRead?Response.json({error:'Current detail unavailable'},{status:503}):response);await confirm();await enabled('Check created Circle');assert.equal(await button('New Circle draft').isDisabled(),true);assert.equal((await fixture.hosted()).length,1);failRead=false;await button('Check created Circle').click();await created();assert.equal((await fixture.hosted()).length,1);fixture.transformHttp(null);
 pass('an owned creation receipt with unavailable current detail preserves the known Circle but disables another draft until explicit fresh current-host readback succeeds');

 await start();await fill({format:'Online'});await review();holdNextPost=true;await confirm();await waitHeld();await enabled('Review exact Circle creation retry');const earlierClose=await retain('Close member view');await p.evaluate(()=>window.nativeQa.activity('blur'));await field('Password').waitFor();await p.evaluate(()=>window.nativeQa.activity('focus'));actor='other';await field('Email').fill('other@example.test');await field('Password').fill('Synthetic-password-only-42');await button('Sign in').click();await enabled('Continue to my member account');await account();await enter();await check();await field('Circle name').waitFor();assert.equal(await field('Circle name').inputValue(),'');assert.equal(await button('Review exact Circle creation retry').count(),0);assert(!String(await text()).includes('private-host-room'));await fill({name:'Different canonical owner listing'});await review();await confirm();await enabled('New Circle draft');const bCircle=(await fixture.hosted('other')).find(row=>row.title==='Different canonical owner listing');assert(bCircle);await releaseHeld();assert.equal((await fixture.hosted()).length,1);const afterSwitch=http.length;await invoke(earlierClose);await settle();assert.equal(http.length,afterSwitch);assert.equal(await button('New Circle draft').isEnabled(),true);assert.equal((await fixture.hosted('other')).filter(row=>row.id===bCircle.id).length,1);
 pass('actual SDK sign-in switches A to B after a held creation; canonical B receives a clean hosting context, cannot retry A’s private request, and late A delivery or its old Close callback cannot replace B’s confirmed listing');

 await start();await fill();await review();await confirm();circleId=await created();await mine();let completionMode='wrong-owner';fixture.transformHttp(async({path,method,response})=>{if(!path.endsWith('/complete')||method!=='POST')return response;if(completionMode==='refused')return Response.json({error:'Synthetic retry refusal'},{status:400});if(completionMode==='wrong-owner'){const value=await response.json();value.memberId=fixture.actors.other;return Response.json(value);}return response;});await button('Review completing this Circle').click();await button('Confirm Circle completion').click();await enabled('Retry exact participation request');const exactCompletion=http.filter(row=>row.path.endsWith('/complete')).at(-1).body;assert.equal((await fixture.membership(circleId)).ended,true);assert.equal(await button('Return to member account').isDisabled(),true);completionMode='refused';await button('Retry exact participation request').click();await enabled('Retry exact participation request');assert.equal(http.filter(row=>row.path.endsWith('/complete')).at(-1).body,exactCompletion);completionMode='normal';await button('Retry exact participation request').click();await enabled('Check current Circle');assert.equal(http.filter(row=>row.path.endsWith('/complete')).at(-1).body,exactCompletion);assert.equal(await button('Review completing this Circle').count(),0);fixture.transformHttp(null);
 pass('a wrong-owner completion receipt cannot confirm the actual committed completion; a refused retry preserves its uncertainty, and only exact owned replay with fresh state resolves the current host view');

 await show({hosting:false});await signIn();await button('Continue to my member account').click();await enabled('Check my member account');await button('Check my member account').click();await enabled('Discover Circles');assert.equal(await button('Start a Circle').isDisabled(),true);assert.equal((await state()).requests.some(row=>row.path==='/api/circles/start'),false);
 pass('a native connection without the reviewed hosting capability leaves Start a Circle unavailable and sends no hosting request');

 await start();await fill();await review();await confirm();await created();assert(!String(await text()).includes('Active Circles at your last hosting check'));assert(!String(await text()).includes('Active Circles you host:'));await screenshot('native-hosting-created-320.png',true);
 }
 assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.evaluate(()=>window.nativeQa.unmount());await settle();stats=(await state()).stats;assert.equal(stats.netListeners,0);assert.equal(stats.appListeners,0);assert.equal(stats.linkListeners,0);assert.equal(stats.handles,0);assert.equal(stats.retainedCallbacks,0);assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);for(const[n,h]of Object.entries(sourceHashes))assert.equal(sha(read(n)),h,'Changed source during proof '+n);
 pass('the composed 320px screen fits without horizontal overflow and terminal unmount releases native handles, subscriptions and retained callbacks, with no unexpected network or browser errors');
}catch(error){failure=error.stack||String(error);console.error(failure);}
finally{try{heldPost?.release();if(browser)await browser.close();cleanup.browser='closed';}catch(error){cleanup.browser=String(error);}try{if(fixture)await fixture.close();cleanup.database='closed';}catch(error){cleanup.database=String(error);}write(failure||cleanup.browser!=='closed'||cleanup.database!=='closed'?'FAIL':'PASS');}
if(failure||cleanup.browser!=='closed'||cleanup.database!=='closed')process.exitCode=1;
