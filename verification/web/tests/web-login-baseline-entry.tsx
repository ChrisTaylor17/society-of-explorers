import React from 'react';
import {createRoot} from 'react-dom/client';
import '../../../app/globals.css';
import Login from '../../../app/login/page';
const root=createRoot(document.getElementById('root')!);
let version=0,sequence=0;
const callbacks=new Map<number,(event:unknown)=>unknown>();
const qa={navigations:[] as Array<{method:string;path:string}>,
 show(){root.render(<React.StrictMode key={++version}><Login/></React.StrictMode>);},
 detach(){root.render(<div>Login view closed</div>);},
 retain(node:HTMLElement){const key=Object.getOwnPropertyNames(node).find(name=>name.startsWith('__reactProps$'));const fn=key?(node as unknown as Record<string,Record<string,unknown>>)[key]?.onSubmit:null;if(typeof fn!=='function')throw Error('Actual callback unavailable');const id=++sequence;callbacks.set(id,fn as(event:unknown)=>unknown);return id;},
 invoke(id:number){void callbacks.get(id)?.({preventDefault(){}});},
 close(){root.unmount();callbacks.clear();},
};
Object.assign(window,{loginQa:qa});qa.show();
