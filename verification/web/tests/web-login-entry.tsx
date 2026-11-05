import React from 'react';
import {createRoot} from 'react-dom/client';
import '../../../app/globals.css';
import Login from '../../../app/login/page';
import Confirmation from '../../../app/auth/confirm/Confirmation';
import Completion from '../../../app/auth/complete/Completion';
const root=createRoot(document.getElementById('root')!);
let version=0,sequence=0;
const callbacks=new Map<number,(event:unknown)=>unknown>();
const qa={navigations:[] as Array<{method:string;path:string}>,
 show(){const query=new URLSearchParams(window.location.search);root.render(<React.StrictMode key={++version}>{window.location.pathname==='/auth/confirm'?<Confirmation/>:window.location.pathname==='/auth/complete'?<Completion nextPath={query.get('next')??'/dashboard'} intent={query.get('intent')}/>:<Login/>}</React.StrictMode>);},
 detach(){root.render(<div>Login view closed</div>);},
 retain(node:HTMLElement){const key=Object.getOwnPropertyNames(node).find(name=>name.startsWith('__reactProps$'));const fn=key?(node as unknown as Record<string,Record<string,unknown>>)[key]?.onSubmit:null;if(typeof fn!=='function')throw Error('Actual callback unavailable');const id=++sequence;callbacks.set(id,fn as(event:unknown)=>unknown);return id;},
 invoke(id:number){void callbacks.get(id)?.({preventDefault(){}});},
 close(){root.unmount();callbacks.clear();},
};
Object.assign(window,{loginQa:qa});qa.show();
