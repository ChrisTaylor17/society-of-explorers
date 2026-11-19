import React from 'react';
import { createRoot } from 'react-dom/client';
import MessageAiConsent from '../../../app/circles/contributions/MessageAiConsent';
const input=(window as unknown as {baseline:{circleId:string;messageId:string}}).baseline;
const listeners=new Set<(event:string)=>void>();
const root=createRoot(document.getElementById('root')!);
Object.assign(window,{aiQa:{
 factory(){return {auth:{onAuthStateChange(listener:(event:string)=>void){listeners.add(listener);return {data:{subscription:{unsubscribe(){listeners.delete(listener);}}}};}}};},
 emit(event:string){for(const listener of listeners)listener(event);},
 unmount(){root.unmount();},listeners,
}});
root.render(<React.StrictMode><MessageAiConsent circleId={input.circleId} messageId={input.messageId}/></React.StrictMode>);
