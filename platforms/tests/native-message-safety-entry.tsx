import React from 'react';
import {createRoot} from 'react-dom/client';
import {CircleScreen} from '../native/CircleScreen';
import type {ThreadMessage} from '../../lib/circles/thread';
import type {MessageSafetyState} from '../../lib/circles/message-moderation';
const root=createRoot(document.getElementById('root')!);
const circle='11111111-1111-4111-8111-111111111111',own='33333333-3333-4333-8333-333333333333',other='44444444-4444-4444-8444-444444444444',now='2026-11-04T12:00:00Z';
let epoch=0,scope:string|null='synthetic-owner',sequence=0,online:'online'|'offline'|'unknown'='online',lose=false,malformed=false,badGet=false,denied=false,member=true;
let gate:Promise<void>|null=null,release:(()=>void)|null=null;
const ownerListeners=new Set<()=>void>(),netListeners=new Set<(value:string)=>void>(),appListeners=new Map<string,Set<(value:string)=>void>>();
const requests:Array<{url:string;method:string;body?:string;signal:AbortSignal;bodyRead:boolean}>=[];
const messages=new Map<string,ThreadMessage>(),revision=new Map<string,number>(),reported=new Set<string>(),receipts=new Map<string,{body:string;value:unknown}>();
let reports=0,withdrawals=0;
function reset(){messages.clear();revision.clear();reported.clear();receipts.clear();reports=0;withdrawals=0;lose=false;malformed=false;badGet=false;denied=false;member=true;
 for(const[id,mine,content]of [[own,true,'PRIVATE_OWN_MESSAGE'],[other,false,'PRIVATE_OTHER_MESSAGE']] as const){messages.set(id,{id,member_name:mine?'Synthetic author':'Synthetic other',content,created_at:now,is_mine:mine,visibility:'visible',parentMessageId:null,rootMessageId:id});revision.set(id,0);}}
function safety(id:string):MessageSafetyState{const m=messages.get(id)!;return{circleId:circle,message:{id:m.id,member_name:m.member_name,content:m.content,created_at:m.created_at,is_mine:m.is_mine,visibility:m.visibility},revision:revision.get(id)!,contentHash:m.is_mine||m.visibility==='visible'?'a'.repeat(64):null,canReport:member&&!m.is_mine&&m.visibility==='visible'&&!reported.has(id),canWithdraw:m.is_mine&&m.visibility!=='withdrawn',explanations:m.is_mine&&m.visibility==='hidden'?[{id:'55555555-5555-4555-8555-555555555555',action:'hide',reason:'misleading',summary:'Synthetic author-facing explanation for this restriction.',created_at:now}]:[]};}
function reply(url:string,method:string,body?:string){const u=new URL(url),id=u.pathname.split('/').at(-1)!;
 if(u.pathname===`/api/book-salons/${circle}`&&method==='GET')return{status:200,body:{cohort:{id:circle,book_id:'soe-circles-path',title:'Synthetic native safety Circle'},messages:[...messages.values()].filter(m=>m.visibility==='visible').map(({id,member_name,content,created_at,is_mine})=>({id,member_name,content,created_at,is_mine}))}};
 if(u.pathname===`/api/circles/${circle}/discussion`&&method==='GET')return{status:200,body:{kind:'archive',circleId:circle,limit:25,nextCursor:null,items:[...messages.values()]}};
 if(!new RegExp(`^/api/circles/${circle}/messages/(?:${own}|${other})$`).test(u.pathname)||u.search)throw Error('Unexpected synthetic endpoint '+u.pathname);
 if(method==='GET'){if(denied){denied=false;return{status:403,body:{error:'Synthetic unavailable'}};}if(badGet){badGet=false;return{status:200,body:{...safety(id),message:{...safety(id).message,id:circle}}};}return{status:200,body:safety(id)};}
 const input=JSON.parse(body!),saved=receipts.get(input.requestId);if(saved&&saved.body!==body)return{status:409,body:{error:'Synthetic key conflict'}};
 let value:unknown;
 if(saved)value={...(saved.value as object),replayed:true};else{
  const before=safety(id);if(input.expectedRevision!==before.revision||input.contentHash!==before.contentHash)return{status:409,body:{error:'Synthetic stale state'}};
  if(input.action==='report'){if(!before.canReport)return{status:403,body:{error:'Synthetic report denied'}};reports++;reported.add(id);}
  else if(input.action==='withdraw'){if(!before.canWithdraw)return{status:403,body:{error:'Synthetic withdrawal denied'}};withdrawals++;messages.set(id,{...messages.get(id)!,visibility:'withdrawn',content:null});revision.set(id,before.revision+1);}else throw Error('Unexpected action');
  value={requestId:input.requestId,circleId:circle,messageId:id,state:safety(id),replayed:false,...(input.action==='report'?{received:true}:{withdrawn:true})};receipts.set(input.requestId,{body:body!,value});
 }
 if(lose){lose=false;return{status:503,body:{error:'Synthetic committed receipt lost',outcome:'unknown'}};}if(malformed){malformed=false;return{status:200,body:{...(value as object),requestId:circle}};}return{status:200,body:value};
}
const appState={currentState:'active',addEventListener(name:string,fn:(value:string)=>void){let s=appListeners.get(name);if(!s){s=new Set();appListeners.set(name,s);}s.add(fn);return{remove(){s?.delete(fn);}};}};
const config={circleId:circle,origin:'https://native-message-safety-fixture.test',owner:{scope:()=>scope,bearer:async()=>scope?'NONISSUED_NATIVE_SAFETY':null,subscribe(fn:()=>void){ownerListeners.add(fn);return()=>{ownerListeners.delete(fn);};}},newRequestId:async()=>`a0000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`,
 transport:async(url:string,init:{method:'GET'|'POST';body?:string;signal:AbortSignal})=>{const entry={url,method:init.method,body:init.body,signal:init.signal,bodyRead:false};requests.push(entry);const result=reply(url,init.method,init.body),held=gate;return{status:result.status,url,redirected:false,json:async()=>{entry.bodyRead=true;if(held)await held;return result.body;}};}};
const connectivity={snapshot:()=>online,subscribe(fn:(value:string)=>void){netListeners.add(fn);return()=>{netListeners.delete(fn);};}};
const qa={appState,requests,show(){release?.();release=null;gate=null;reset();requests.length=0;scope='synthetic-owner';online='online';appState.currentState='active';root.render(<React.StrictMode key={++epoch}><CircleScreen config={config} connectivity={connectivity} onClose={()=>root.render(<div>Circle closed</div>)}/></React.StrictMode>);},
 stats:()=>({reports,withdrawals,receipts:receipts.size,ownerListeners:ownerListeners.size,netListeners:netListeners.size}),
 losePost(){lose=true;},malformedPost(){malformed=true;},badGet(){badGet=true;},denyGet(){denied=true;},
 hiddenAuthorAfterLeave(){member=false;messages.set(own,{...messages.get(own)!,content:null,visibility:'hidden'});revision.set(own,1);},
 holdBody(){gate=new Promise<void>(resolve=>release=resolve);},releaseBody(){release?.();gate=null;release=null;},
 activity(name:string,value='active'){if(name==='change')appState.currentState=value;for(const fn of [...appListeners.get(name)??[]])fn(value);},
 network(value:'online'|'offline'|'unknown'){online=value;for(const fn of [...netListeners])fn(value);},
 retire(){scope=null;for(const fn of [...ownerListeners])fn();},unmount(){root.render(<div>Fixture unmounted</div>);},
};Object.assign(window,{nativeQa:qa});qa.show();
