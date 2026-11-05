import React from 'react';
import {createRoot} from 'react-dom/client';
import '../../../app/globals.css';
import Recovery from '../../../app/auth/recovery/Recovery';
const root=createRoot(document.getElementById('root')!);
const callbacks=new Map<number,(event:unknown)=>unknown>();
let sequence=0,view=0;
const qa={
 show(timeoutMs=800){root.render(<React.StrictMode key={++view}><Recovery timeoutMs={timeoutMs}/></React.StrictMode>);},
 detach(){root.render(<div>Recovery view closed</div>);},
 retain(node:HTMLElement,name:'onClick'|'onChange'|'onSubmit'){
  const propsFor=(target:HTMLElement)=>{const key=Object.getOwnPropertyNames(target).find(name=>name.startsWith('__reactProps$'));return key?(target as unknown as Record<string,Record<string,unknown>>)[key]:null;};
  let callback=propsFor(node)?.[name];
  if(typeof callback!=='function'&&name==='onClick'&&node.closest('form'))callback=propsFor(node.closest('form')!)?.onSubmit;
  if(typeof callback!=='function')throw Error('Actual React callback unavailable');
  const id=++sequence;callbacks.set(id,callback as (event:unknown)=>unknown);return id;
 },
 invoke(id:number,value=''){return callbacks.get(id)?.({preventDefault(){},target:{value},currentTarget:{value}});},
 unmount(){root.unmount();callbacks.clear();},
};
Object.assign(window,{recoveryQa:qa});qa.show();
