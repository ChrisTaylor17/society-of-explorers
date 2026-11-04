import React from 'react';
import {createRoot} from 'react-dom/client';
import App from '../native/App';
import type {NativeConnectivityPort, NativeConnectivityState} from '../native/src/circles/native-connectivity';
const root=createRoot(document.getElementById('root')!);
const circle='11111111-1111-4111-8111-111111111111',subject='22222222-2222-4222-8222-222222222222';
type Mode='normal'|'registration-offline'|'snapshot-offline'|'invalid-disposer'|'throw-snapshot'|'missing'|'snapshot-background'|'snapshot-blur'|'auth-background';
let epoch=0,state:NativeConnectivityState='unknown',mode:Mode='normal',port:NativeConnectivityPort|undefined;
let authRelease:(()=>void)|null=null,authGate:Promise<void>|null=null,bodyRelease:(()=>void)|null=null,bodyGate:Promise<void>|null=null;
let authBackgroundArmed=false;
const authCalls:string[]=[],requests:Array<{url:string;signal:AbortSignal;bodyRead:boolean}>=[],netListeners=new Set<(s:NativeConnectivityState)=>void>(),lateListeners:Array<(s:NativeConnectivityState)=>void>=[];
const authListeners=new Set<(event:string,session:null)=>void>();
const appListeners=new Map<string,Set<(state:string)=>void>>();
const appState={currentState:'active',addEventListener(name:string,fn:(state:string)=>void){let set=appListeners.get(name);if(!set){set=new Set();appListeners.set(name,set);}set.add(fn);return{remove(){set?.delete(fn);}};}};
function emitApp(name:string,value='active'){if(name==='change')appState.currentState=value;for(const fn of [...appListeners.get(name)??[]])fn(value);}
const auth={async getSession(){authCalls.push('session');if(authBackgroundArmed){authBackgroundArmed=false;emitApp('change','background');}if(authGate)await authGate;return{data:{session:{access_token:'NONISSUED_NATIVE_FIXTURE',user:{id:subject}}}};},async getUser(token:string){authCalls.push('user:'+token);return{data:{user:{id:subject}}};},onAuthStateChange(fn:(event:string,session:null)=>void){authListeners.add(fn);return{data:{subscription:{unsubscribe(){authListeners.delete(fn);}}}};}};
const config={circleId:circle,origin:'https://native-connectivity-fixture.test',auth,transport:async(url:string,init:{signal:AbortSignal})=>{const entry={url,signal:init.signal,bodyRead:false};requests.push(entry);return{status:200,url,redirected:false,json:async()=>{entry.bodyRead=true;if(bodyGate)await bodyGate;
 if(url.includes('/discussion'))return{kind:'archive',circleId:circle,limit:25,nextCursor:null,items:[{id:'33333333-3333-4333-8333-333333333333',member_name:'Synthetic reader',content:'PRIVATE_NATIVE_ARCHIVE',created_at:'2026-11-04T12:00:00Z',is_mine:true,visibility:'visible',parentMessageId:null,rootMessageId:'33333333-3333-4333-8333-333333333333'}]};
 return{cohort:{id:circle,book_id:'soe-circles-path',title:'Synthetic private native Circle'},messages:[{id:'33333333-3333-4333-8333-333333333333',member_name:'Synthetic reader',content:'PRIVATE_NATIVE_BODY',created_at:'2026-11-04T12:00:00Z',is_mine:true}]};}};}};
function makePort(){if(mode==='missing')return undefined;const current=new Set<(s:NativeConnectivityState)=>void>();return{snapshot(){if(mode==='throw-snapshot')throw Error('Synthetic snapshot failure');if(mode==='snapshot-offline'){for(const f of [...current])f('offline');return'online' as const;}if(current.size>=2&&mode==='snapshot-background')emitApp('change','background');if(current.size>=2&&mode==='snapshot-blur')emitApp('blur');return state;},subscribe(fn:(s:NativeConnectivityState)=>void){current.add(fn);netListeners.add(fn);lateListeners.push(fn);if(mode==='registration-offline')fn('offline');if(mode==='invalid-disposer'){fn('online');return undefined as unknown as ()=>void;}return()=>{current.delete(fn);netListeners.delete(fn);fn('online');};}};}
const qa={appState,authCalls,requests,netListeners,authListeners,lateListeners,
 show(nextState:NativeConnectivityState='unknown',nextMode:Mode='normal',activity='active'){state=nextState;mode=nextMode;authBackgroundArmed=nextMode==='auth-background';appState.currentState=activity;authCalls.length=0;requests.length=0;netListeners.clear();port=makePort();root.render(<React.StrictMode key={++epoch}><App memberCircle={config} connectivity={port}/></React.StrictMode>);},
 emit(value:NativeConnectivityState){state=value;for(const fn of [...netListeners])fn(value);},
 late(value:NativeConnectivityState){for(const fn of lateListeners)fn(value);},
 app:emitApp,
 identity(event='SIGNED_OUT'){for(const fn of [...authListeners])fn(event,null);},
 holdAuth(){authGate=new Promise<void>(resolve=>authRelease=resolve);},releaseAuth(){authRelease?.();authGate=null;authRelease=null;},
 holdBody(){bodyGate=new Promise<void>(resolve=>bodyRelease=resolve);},releaseBody(){bodyRelease?.();bodyGate=null;bodyRelease=null;},
 replace(nextState:NativeConnectivityState,nextMode:Mode='normal'){state=nextState;mode=nextMode;port=makePort();root.render(<React.StrictMode key={epoch}><App memberCircle={config} connectivity={port}/></React.StrictMode>);},
 unmount(){root.unmount();},
};
Object.assign(window,{nativeQa:qa});qa.show();
