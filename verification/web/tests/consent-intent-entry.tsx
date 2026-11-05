import React from 'react';
import { createRoot } from 'react-dom/client';
import MessageAiConsent from '../../../app/circles/contributions/MessageAiConsent';
import Contributions from '../../../app/circles/contributions/Contributions';
const input=(window as unknown as {consentInput:{circleId:string;messageId:string}}).consentInput;
const listeners=new Set<(event:string)=>void>(),callbacks=new Map<number,(event:unknown)=>void>();
const root=createRoot(document.getElementById('root')!);
let sequence=0,view=0;
const qa={
 factory(){return {auth:{onAuthStateChange(listener:(event:string)=>void){listeners.add(listener);return {data:{subscription:{unsubscribe(){listeners.delete(listener);}}}};}}};},
 emit(event:string){for(const listener of listeners)listener(event);},
 show(kind:'direct'|'contributions'='direct'){root.render(<React.StrictMode key={++view}>{kind==='direct'?<MessageAiConsent circleId={input.circleId} messageId={input.messageId}/>:<Contributions/>}</React.StrictMode>);},
 // Retain the real callback installed by React. No replacement product handler.
 retain(node:HTMLElement,name:'onClick'|'onChange'){
  const key=Object.getOwnPropertyNames(node).find(k=>k.startsWith('__reactProps$'));
  const props=key?(node as unknown as Record<string,Record<string,unknown>>)[key]:null;
  const callback=props?.[name];if(typeof callback!=='function')throw Error('Actual callback unavailable');
  const id=++sequence;callbacks.set(id,callback as (event:unknown)=>void);return id;
 },
 invoke(id:number,checked=false){callbacks.get(id)?.({preventDefault(){},target:{checked}});},
 unmount(){root.unmount();callbacks.clear();},listeners,
};
Object.assign(window,{aiQa:qa,consentQa:qa});qa.show();
