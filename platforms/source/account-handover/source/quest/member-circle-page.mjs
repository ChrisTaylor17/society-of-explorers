import {createVerifiedSupabaseCircleOwner} from './circle-host.mjs';
import {mountCirclePage,browserCircleTransport} from './circle-view.mjs';
/** Imported by the existing authenticated application bootstrap. No SDK/client,
 * credential input, fixture authority or global configuration is discovered. */
export function mountExistingMemberCircle({window:win,document:doc,config}) {
  const {auth,verificationTimeoutMs,...hostConfig}=config;
  const binding=createVerifiedSupabaseCircleOwner(auth,{timeoutMs:verificationTimeoutMs});
  const button=doc.getElementById('member-session-check'),status=doc.getElementById('member-session-status');
  if(!button||!status)throw Error('Member session controls unavailable');
  const screen=mountCirclePage({window:win,document:doc,config:{...hostConfig,owner:binding.owner,transport:hostConfig.transport??browserCircleTransport(win)}});
  const off=binding.subscribe(m=>{status.textContent=m.message;button.disabled=!m.canCheck;button.textContent=m.busy?'Checking member session…':'Check member session';});
  let visible=doc.visibilityState==='visible',focused=doc.hasFocus(),online=win.navigator.onLine!==false,disposed=false;
  const handlers=[],listen=(target,event,fn)=>{target.addEventListener(event,fn);handlers.push(()=>target.removeEventListener(event,fn));};
  const activity=()=>binding.activity(visible&&focused&&online);
  listen(win,'blur',()=>{focused=false;activity();});listen(win,'focus',()=>{focused=true;activity();});
  listen(doc,'visibilitychange',()=>{visible=doc.visibilityState==='visible';activity();});
  listen(win,'offline',()=>{online=false;activity();});listen(win,'online',()=>{online=true;activity();});
  listen(button,'click',()=>void binding.check());
  const dispose=()=>{if(disposed)return;disposed=true;binding.stop();screen.dispose();off();for(const remove of handlers)remove();};
  listen(win,'pagehide',dispose);activity();void binding.start();
  return {binding,host:screen.host,dispose};
}
