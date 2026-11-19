import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { offlineApp } from './support/offline-app.mjs';
const require = createRequire(path.resolve('../../package.json'));
const tooling = createRequire(path.resolve('tooling/package.json'));
const { JSDOM } = tooling('jsdom');
const ID='77777777-7777-4777-8777-777777777777', RID='99999999-9999-4999-8999-999999999999', DID='aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const history={id:DID,action:'hide',reason:'misleading',summary:'The listing has been reviewed for misleading information.',created_at:'2026-11-03T12:00:00Z',report_count:1};
const queue={items:[{id:ID,title:'Fictional Circle',hidden:false,openReports:1,revision:1}],nextCursor:null};
const detail=()=>({circle:{id:ID,title:'Fictional Circle',description:'A public reading discussion.',hidden:false},revision:1,reports:[{id:RID,reason:'misleading',note:'PRIVATE_REPORT_NOTE <img src=x>',created_at:'2026-11-03T11:00:00Z'}],decisions:[],complete:true});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return{promise,resolve};};
async function mount({report=false,respond,credentials=async json=>json?{'content-type':'application/json'}:{},strict=false}={}){
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://offline.invalid/moderation/circles',pretendToBeVisual:true});
 const previous={};for(const[k,v]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){previous[k]=Object.getOwnPropertyDescriptor(globalThis,k);Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true});}
 const React=require('react'),{act}=React,{createRoot}=require('react-dom/client'),a=offlineApp(),requests=[];let listener;
 a.context.window=dom.window;a.context.document=dom.window.document;a.context.navigator=dom.window.navigator;
 a.setMock('next/link',()=>({__esModule:true,default:({children,...props})=>React.createElement('a',props,children)}));
 for(const specifier of['@/app/circles/messages/safety.module.css','./safety.module.css','../circles/passages/passage.module.css'])a.setMock(specifier,()=>({__esModule:true,default:new Proxy({},{get:(_target,key)=>String(key)})}));
 a.setMock('@/lib/circles/client',()=>({circleHeaders:credentials}));a.setMock('./client',()=>({circleHeaders:credentials}));
 a.setMock('@/lib/supabase/client',()=>({createClient:()=>({auth:{onAuthStateChange:fn=>{listener=fn;return{data:{subscription:{unsubscribe(){}}}}}}})}));
 let saved=false;
 a.context.fetch=async(url,init)=>{requests.push({url,init});if(respond)return respond(url,init);if(init.method==='POST'){saved=true;const request=JSON.parse(init.body);return Response.json({circleId:ID,requestId:request.requestId,decision:history,revision:2,hidden:true,replayed:false});}if(url.endsWith(ID))return Response.json(saved?{...detail(),circle:{...detail().circle,hidden:true},revision:2,reports:[],decisions:[history]}:detail());return Response.json(queue);};
 const View=a.load(report?'app/circles/ReportButton.tsx':'app/moderation/circles/CircleReviews.tsx').default;
 const root=createRoot(document.getElementById('root'));let circle=ID;
 const render=()=>strict?React.createElement(React.StrictMode,null,React.createElement(View,report?{circleId:circle}:{})):React.createElement(View,report?{circleId:circle}:{});
 await act(async()=>root.render(render()));
 const button=text=>[...document.querySelectorAll('button')].find(x=>x.textContent===text);
 const click=async text=>{assert.ok(button(text),text);await act(async()=>button(text).click());};
 const type=async(id,value)=>{await act(async()=>{const el=document.getElementById(id);const proto=el.tagName==='TEXTAREA'?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});};
 const select=async(id,value)=>{await act(async()=>{const el=document.getElementById(id);el.value=value;el.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});};
 const cleanup=async()=>{await act(async()=>root.unmount());dom.window.close();for(const[k,v]of Object.entries(previous)){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}};
 return{act,a,dom,requests,button,click,type,select,cleanup,text:()=>document.body.textContent,auth:async event=>act(async()=>listener(event)),changeCircle:async id=>{circle=id;await act(async()=>root.render(render()));}};
}
async function openCase(a){await a.click('Load assigned Circles');await a.click('Review Fictional Circle');}
async function prepare(a){await a.select('review-action','hide');await a.select('review-reason','misleading');await a.type('review-excerpt','A public reading');await a.type('review-summary',history.summary);await a.act(async()=>document.querySelector('input[type="checkbox"]').click());}
test('reviewer UI explicitly reads a case, escapes reports, posts once and displays fresh server history in Strict Mode',async()=>{
 const a=await mount({strict:true});try{
  assert.equal(a.requests.length,0);await openCase(a);assert.match(a.text(),/PRIVATE_REPORT_NOTE <img src=x>/);assert.equal(document.querySelector('img'),null);
  await prepare(a);await a.act(async()=>{a.button('Save reviewed decision').click();a.button('Save reviewed decision').click();});
  assert.equal(a.requests.filter(x=>x.init.method==='POST').length,1);assert.match(a.text(),/Decision saved/);assert.match(a.text(),/The listing has been reviewed/);
  assert.equal(document.getElementById('review-summary').value,'');assert.equal(document.querySelector('input[type="checkbox"]').checked,false);
  const sent=JSON.parse(a.requests.find(x=>x.init.method==='POST').init.body);assert.match(sent.requestId,/^[0-9a-f-]{36}$/);assert.equal(sent.expectedRevision,1);assert.equal(sent.evidenceReportId,null);assert.equal(sent.evidenceExcerpt,'A public reading');
  assert.ok(a.requests.every(x=>x.init.redirect==='error'&&x.init.cache==='no-store'));
 }finally{await a.cleanup();}
});
test('account change clears report text and decision draft; delayed read cannot restore them',async()=>{
 const held=deferred();let hold=false;const a=await mount({respond:(url)=>url.endsWith(ID)?(hold?held.promise:Response.json(detail())):Response.json(queue)});try{
  await openCase(a);await a.type('review-summary','PRIVATE_UNSENT_SUMMARY');await a.auth('SIGNED_OUT');assert.doesNotMatch(a.text(),/PRIVATE_REPORT_NOTE|PRIVATE_UNSENT_SUMMARY/);assert.equal(document.querySelector('textarea'),null);
  hold=true;await a.click('Load assigned Circles');await a.click('Review Fictional Circle');await a.auth('SIGNED_IN');await a.act(async()=>held.resolve(Response.json(detail())));assert.doesNotMatch(a.text(),/PRIVATE_REPORT_NOTE/);
 }finally{held.resolve(Response.json(detail()));await a.cleanup();}
});
test('unknown decision reply clears draft and requires a fresh manual read without automatic resend',async()=>{
 const a=await mount({respond:(url,init)=>{if(init.method==='POST')throw Error('FICTIONAL_LOST_REPLY');return Response.json(url.endsWith(ID)?detail():queue);}});try{
  await openCase(a);await prepare(a);await a.click('Save reviewed decision');assert.match(a.text(),/may have been saved/);assert.equal(document.querySelector('textarea'),null);assert.equal(a.requests.filter(x=>x.init.method==='POST').length,1);
  await a.click('Load assigned Circles');assert.equal(a.requests.filter(x=>x.init.method==='POST').length,1);
 }finally{await a.cleanup();}
});
test('conflict, denial and malformed replies clear private data instead of assuming success or an empty queue',async()=>{
 for(const status of[403,409,503]){const a=await mount({respond:(url,init)=>init.method==='POST'?Response.json({error:'fixture'},{status}):Response.json(url.endsWith(ID)?detail():queue)});try{await openCase(a);await prepare(a);await a.click('Save reviewed decision');assert.doesNotMatch(a.text(),/PRIVATE_REPORT_NOTE/);assert.equal(document.querySelector('textarea'),null);assert.equal(a.requests.filter(x=>x.init.method==='POST').length,1);}finally{await a.cleanup();}}
 const a=await mount({respond:()=>Response.json({items:[],nextCursor:'broken'})});try{await a.click('Load assigned Circles');assert.match(a.text(),/unavailable/);assert.doesNotMatch(a.text(),/No assigned Circles need review/);}finally{await a.cleanup();}
});
test('incomplete case disables decisions and makes the missing report scope explicit',async()=>{
 const a=await mount({respond:url=>Response.json(url.endsWith(ID)?{...detail(),complete:false}:queue)});try{await openCase(a);assert.match(a.text(),/more reports/);assert.equal(document.querySelector('fieldset').disabled,true);assert.equal(a.requests.filter(x=>x.init.method==='POST').length,0);}finally{await a.cleanup();}
});
test('reporting explicitly retries a lost reply with the same exact request and confirms receipt without claiming human review',async()=>{
 let lose=true;const a=await mount({report:true,respond:()=>{if(lose)throw Error('FICTIONAL_LOST_REPLY');return Response.json({received:true});}});try{
  await a.click('Report this circle');await a.type('report-note','Fictional note, not a real report.');await a.click('Send report');assert.match(a.text(),/may have arrived/);assert.equal(a.requests.length,1);const body=a.requests[0].init.body;
  lose=false;await a.click('Retry the same report');assert.equal(a.requests.length,2);assert.equal(a.requests[1].init.body,body);assert.match(a.text(),/does not mean a reviewer has read/);
 }finally{await a.cleanup();}
});
test('report drafts retire on account change and Circle navigation; retired credential waits never transmit',async()=>{
 const held=deferred();const a=await mount({report:true,credentials:()=>held.promise});try{
  await a.click('Report this circle');await a.type('report-note','PRIVATE_REPORT_DRAFT');await a.click('Send report');await a.auth('SIGNED_OUT');await a.act(async()=>held.resolve({}));assert.equal(a.requests.length,0);assert.equal(document.querySelector('textarea'),null);
  await a.click('Report this circle');await a.type('report-note','PRIVATE_SECOND_DRAFT');await a.changeCircle('88888888-8888-4888-8888-888888888888');assert.equal(document.querySelector('textarea'),null);assert.doesNotMatch(a.text(),/PRIVATE_SECOND_DRAFT/);
 }finally{held.resolve({});await a.cleanup();}
});

test('a timeout HTTP reply retains the exact report retry key and opening the form moves keyboard focus',async()=>{
 const a=await mount({report:true,respond:()=>Response.json({error:'timeout'},{status:408})});try{
  await a.click('Report this circle');assert.equal(document.activeElement.id,'report-reason');await a.click('Send report');const original=a.requests[0].init.body;assert.match(a.text(),/may have arrived/);await a.click('Retry the same report');assert.equal(a.requests[1].init.body,original);
 }finally{await a.cleanup();}
});
