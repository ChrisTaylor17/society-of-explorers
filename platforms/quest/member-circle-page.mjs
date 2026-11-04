import {createVerifiedSupabaseCircleOwner,memberCircleConfig,approvedOrigin} from './circle-host.mjs';
import {mountCirclePage,browserCircleTransport,assertCircleMarkup} from './circle-view.mjs';
import {assertContributionsMarkup,mountMemberContributions} from './member-contributions-view.mjs';
/** The authenticated application supplies its existing client. No SDK method is
 * called until the user chooses Check member session. */
export function mountExistingMemberCircle(options) { return mount(options,true); }
export function mountExistingMemberContributions(options) { return mount(options,false); }
function mount({window:win,document:doc,config},withCircle) {
  if(withCircle)assertCircleMarkup(doc);
  if(!assertContributionsMarkup(doc)&&!withCircle)throw Error('Contribution controls unavailable');
  const button=doc.getElementById('member-session-check'),status=doc.getElementById('member-session-status');
  if(!button||!status)throw Error('Member session controls unavailable');
  const newRequestId=typeof win.crypto?.randomUUID==='function'?async()=>win.crypto.randomUUID():undefined;
  const transport=config?.transport??browserCircleTransport(win);
  const approved=withCircle?memberCircleConfig({...config,newRequestId,transport})
    : {...config,origin:approvedOrigin(config?.origin),newRequestId,transport};
  if(!approved)throw Error('Member Circle configuration unavailable');
  const {auth,verificationTimeoutMs,...hostConfig}=approved;
  const binding=createVerifiedSupabaseCircleOwner(auth,{timeoutMs:verificationTimeoutMs});
  let visible=doc.visibilityState==='visible',focused=doc.hasFocus(),online=win.navigator.onLine!==false,disposed=false,started=false,screen=null,contributions=null,off=()=>{};
  const handlers=[];
  const dispose=()=>{
    if(disposed)return;disposed=true;
    for(const stop of [()=>binding.stop(),()=>contributions?.dispose(),()=>screen?.dispose(),()=>off(),...handlers]){try{stop();}catch{/* Finish every independent retirement step. */}}
    handlers.length=0;
  };
  try {
    if(withCircle)screen=mountCirclePage({window:win,document:doc,config:{...hostConfig,owner:binding.owner}});
    contributions=mountMemberContributions({window:win,document:doc,config:{...hostConfig,owner:binding.owner},circleHost:screen?.host});
    off=binding.subscribe(m=>{status.textContent=m.message;button.disabled=m.busy||!m.active;button.textContent=m.busy?'Checking member session…':'Check member session';});
    const listen=(target,event,fn)=>{target.addEventListener(event,fn);handlers.push(()=>target.removeEventListener(event,fn));};
    const activity=()=>binding.activity(visible&&focused&&online);
    listen(win,'blur',()=>{focused=false;activity();});listen(win,'focus',()=>{focused=true;activity();});
    listen(doc,'visibilitychange',()=>{visible=doc.visibilityState==='visible';activity();});
    listen(win,'offline',()=>{online=false;activity();});listen(win,'online',()=>{online=true;activity();});
    listen(button,'click',()=>{if(disposed||!visible||!focused||!online)return;if(!started){started=true;void binding.start();}else void binding.check();});
    listen(win,'pagehide',dispose);activity();
    return {binding,host:screen?.host,contributions:contributions.view,dispose};
  } catch { dispose();throw Error('Member Circle could not be opened'); }
}
