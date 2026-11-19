import React from 'react';
import {createRoot} from 'react-dom/client';
import {CircleHostingScreen} from '../native/CircleHostingScreen';
import {createCircleHosting} from '../shared/circle-hosting';
import {createNativeMemberPorts} from '../native/src/circles/native-ports';
let root=createRoot(document.getElementById('root')!),session:ReturnType<typeof createCircleHosting>|null=null,count=0,state='active',platform='ios';
const listeners=new Map<string,Set<(value:string)=>void>>(),callbacks=new Map<string,()=>void>(),retained=new Map<number,()=>void>();let retainedId=0;
const qa={get platform(){return platform;},get state(){return state;},
 listen(name:string,fn:(value:string)=>void){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name)!.add(fn);return{remove:()=>listeners.get(name)!.delete(fn)};},
 capture(label:string,fn:()=>void){if(label)callbacks.set(label,fn);},retain(label:string){const fn=callbacks.get(label);if(!fn)throw Error('Missing callback');const id=++retainedId;retained.set(id,fn);return id;},invoke(id:number){retained.get(id)?.();},
 activity(value:string,event='change'){state=value;for(const fn of listeners.get(event)??[])fn(value);},model:()=>session?.model(),
 async show(value:{platform:'ios'|'android';memberId:string;capability:boolean}){
  root.unmount();session?.close();callbacks.clear();retained.clear();root=createRoot(document.getElementById('root')!);platform=value.platform;state='active';
  const origin=location.origin,storageKey='native-admission-'+(++count),generation='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const bridge={capabilities:async()=>({version:2,origin,storageKey,redirectPolicy:'reject-before-send',storagePolicy:'os-protected',storageGeneration:generation,hostingPolicy:'circle-host-v1',...(value.capability?{circleAdmissionPolicy:'member-bound-circle-admission-v1'}:{})}),begin:async()=>crypto.randomUUID(),cancel:async()=>{},read:async()=>null,write:async()=>{},remove:async()=>{},resetAccountStorage:async()=>({previousGeneration:generation,generation,cleared:true}),
   async send(_id:string,input:{url:string;method:'GET'|'POST';bearer:string;body?:string}){
    const r=await fetch(input.url,{method:input.method,headers:{Authorization:'Bearer '+input.bearer,...(input.method==='POST'?{'Content-Type':'application/json'}:{})},...(input.body?{body:input.body}:{}),credentials:'omit',cache:'no-store',redirect:'error'});
    return{status:r.status,url:r.url,redirected:r.redirected,body:await r.text()};
   }};
  const ports=await createNativeMemberPorts(bridge,{origin,storageKey}),owner={scope:()=>state==='active'?'native-fixture-owner':null,credentials:async()=>state==='active'?{bearer:'NONISSUED_SYNTHETIC_NATIVE',subject:value.memberId}:null,subscribe:()=>()=>{}};
  session=createCircleHosting({origin,memberId:value.memberId,owner,transport:ports.transport,hostingTransport:ports.hostingTransport!,newRequestId:async()=>crypto.randomUUID()});
  const config={origin,owner,transport:ports.transport},connectivity={snapshot:()=> 'online' as const,subscribe:()=>()=>{}};
  root.render(<React.StrictMode><CircleHostingScreen session={session} config={config} connectivity={connectivity} hostApprovalAvailable={Boolean(ports.admissionTransport)} onBack={()=>{}} onMyCircles={()=>{}} onClose={()=>{}}/></React.StrictMode>);
 },close(){root.unmount();session?.close();session=null;},};
window.nativeAdmissionQa=qa;
declare global{interface Window{nativeAdmissionQa:typeof qa}}
