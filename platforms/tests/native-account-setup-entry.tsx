import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemberCircleScreen} from '../native/MemberCircleScreen';
const root=createRoot(document.getElementById('root')!);
const origin='https://provisioning.invalid',circle='11111111-1111-4111-8111-111111111111';
const subject='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',token='NONISSUED_EXACT_NATIVE_TOKEN';
let epoch=0,online:'online'|'offline'|'unknown'='online',currentSubject:string|null=subject;
let providerReads=0,sessionReads=0;
type Held={promise:Promise<void>;release():void;method?:string;path?:string};
let held:Held|null=null,credentialHeld:Held|null=null;
const ownerListeners=new Set<(event:string,session:null)=>void>(),netListeners=new Set<(value:string)=>void>(),appListeners=new Map<string,Set<(value:string)=>void>>();
const requests:Array<{url:string;method:string;body?:string;signal:AbortSignal;bodyRead:boolean;status?:number}>=[];
const appState={currentState:'active',addEventListener(name:string,fn:(value:string)=>void){let s=appListeners.get(name);if(!s){s=new Set();appListeners.set(name,s);}s.add(fn);return{remove(){s?.delete(fn);}};}};
const connectivity={snapshot:()=>online,subscribe(fn:(value:string)=>void){netListeners.add(fn);return()=>{netListeners.delete(fn);};}};
const auth={
 async getSession(){sessionReads++;return{data:{session:currentSubject?{access_token:token,user:{id:currentSubject}}:null}};},
 async getUser(jwt:string){providerReads++;if(jwt!==token)throw Error('Unexpected synthetic credential');const proof=currentSubject,gate=credentialHeld;if(gate)await gate.promise;return{data:{user:proof?{id:proof}:null}};},
 onAuthStateChange(fn:(event:string,session:null)=>void){ownerListeners.add(fn);return{data:{subscription:{unsubscribe(){ownerListeners.delete(fn);}}}};},
};
const transport=async(url:string,init:{method:'GET'|'POST';headers:Record<string,string>;body?:string;signal:AbortSignal;cache:'no-store';redirect:'error';credentials:'omit'})=>{
 const entry={url,method:init.method,body:init.body,signal:init.signal,bodyRead:false,status:undefined as number|undefined};requests.push(entry);
 const response=await fetch(url,init),gate=held&&(!held.method||held.method===init.method)&&(!held.path||new URL(url).pathname===held.path)?held:null;entry.status=response.status;
 return{status:response.status,url:response.url,redirected:response.redirected,json:async()=>{entry.bodyRead=true;if(gate)await gate.promise;return response.json();}};
};
function hold(method?:string,path?:string):Held{let release=()=>{};const promise=new Promise<void>(resolve=>{release=resolve;});return{promise,release,method,path};}
const qa={appState,requests,
 show(state:'online'|'offline'|'unknown'='online'){
  held?.release();credentialHeld?.release();held=null;credentialHeld=null;requests.length=0;online=state;currentSubject=subject;appState.currentState='active';providerReads=0;sessionReads=0;
  const config={circleId:circle,origin,auth,transport};
  root.render(<React.StrictMode key={++epoch}><MemberCircleScreen config={config} connectivity={connectivity} onClose={()=>root.render(<div>Member view closed</div>)}/></React.StrictMode>);
 },
 stats:()=>({providerReads,sessionReads,ownerListeners:ownerListeners.size,netListeners:netListeners.size,appListeners:[...appListeners.values()].reduce((n,set)=>n+set.size,0)}),
 holdBody(method?:string,path?:string){held=hold(method,path);},releaseBody(){held?.release();held=null;},
 holdCredential(){credentialHeld=hold();},releaseCredential(){credentialHeld?.release();credentialHeld=null;},
 activity(name:string,value='active'){if(name==='change')appState.currentState=value;for(const fn of [...appListeners.get(name)??[]])fn(value);},
 network(value:'online'|'offline'|'unknown'){online=value;for(const fn of [...netListeners])fn(value);},
 retire(){currentSubject=null;for(const fn of [...ownerListeners])fn('SIGNED_OUT',null);},
 replace(){currentSubject='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';for(const fn of [...ownerListeners])fn('USER_UPDATED',null);},
 unmount(){root.render(<div>Fixture unmounted</div>);},
};
Object.assign(window,{nativeQa:qa});qa.show();
