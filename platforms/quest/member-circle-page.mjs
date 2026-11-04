import {createVerifiedSupabaseCircleOwner,memberCircleConfig} from './circle-host.mjs';
import {mountCirclePage,browserCircleTransport,assertCircleMarkup} from './circle-view.mjs';
/** The authenticated application supplies its existing client. No SDK method is
 * called until the user chooses Check member session. */
export function mountExistingMemberCircle({window:win,document:doc,config}) {
  assertCircleMarkup(doc);
  const button=doc.getElementById('member-session-check'),status=doc.getElementById('member-session-status');
  if(!button||!status)throw Error('Member session controls unavailable');
  const approved=memberCircleConfig({...config,transport:config?.transport??browserCircleTransport(win)});
  if(!approved)throw Error('Member Circle configuration unavailable');
  const {auth,verificationTimeoutMs,...hostConfig}=approved;
  const binding=createVerifiedSupabaseCircleOwner(auth,{timeoutMs:verificationTimeoutMs});
  let visible=doc.visibilityState==='visible',focused=doc.hasFocus(),online=win.navigator.onLine!==false,disposed=false,started=false,screen=null,off=()=>{};
  const handlers=[];
  const dispose=()=>{
    if(disposed)return;disposed=true;
    for(const stop of [()=>binding.stop(),()=>screen?.dispose(),()=>off(),...handlers]){try{stop();}catch{/* Finish every independent retirement step. */}}
    handlers.length=0;
  };
  try {
    screen=mountCirclePage({window:win,document:doc,config:{...hostConfig,owner:binding.owner}});
    off=binding.subscribe(m=>{status.textContent=m.message;button.disabled=m.busy||!m.active;button.textContent=m.busy?'Checking member session…':'Check member session';});
    const listen=(target,event,fn)=>{target.addEventListener(event,fn);handlers.push(()=>target.removeEventListener(event,fn));};
    const activity=()=>binding.activity(visible&&focused&&online);
    listen(win,'blur',()=>{focused=false;activity();});listen(win,'focus',()=>{focused=true;activity();});
    listen(doc,'visibilitychange',()=>{visible=doc.visibilityState==='visible';activity();});
    listen(win,'offline',()=>{online=false;activity();});listen(win,'online',()=>{online=true;activity();});
    listen(button,'click',()=>{if(disposed||!visible||!focused||!online)return;if(!started){started=true;void binding.start();}else void binding.check();});
    listen(win,'pagehide',dispose);activity();
    return {binding,host:screen.host,dispose};
  } catch { dispose();throw Error('Member Circle could not be opened'); }
}
