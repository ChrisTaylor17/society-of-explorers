import {createVerifiedSupabaseCircleOwner,memberCircleConfig,approvedOrigin} from './circle-host.mjs';
import {mountCirclePage,browserCircleTransport,assertCircleMarkup} from './circle-view.mjs';
import {assertContributionsMarkup,mountMemberContributions} from './member-contributions-view.mjs';
import {immersiveControls,mountImmersiveCircle} from './immersive-circle.mjs';
export {assertContributionsMarkup};
/** The authenticated application supplies its existing client. Account checks
 * start only on a deliberate action in the regular window or headset room. */
export function mountExistingMemberCircle(options) { return mount(options,true); }
export function mountExistingMemberContributions(options) { return mount(options,false); }
function mount({window:win,document:doc,config},withCircle) {
  if(withCircle)assertCircleMarkup(doc);
  const immersive=withCircle?config?.immersive:null;
  if(immersive){
    immersiveControls(doc);
    if(typeof immersive.createAuth!=='function'||typeof immersive.pauseRegular!=='function')throw Error('Immersive Circle configuration unavailable');
  }
  const aiConsent=config?.aiConsent===undefined?false:config.aiConsent;
  if(!assertContributionsMarkup(doc,aiConsent)&&!withCircle)throw Error('Contribution controls unavailable');
  const button=doc.getElementById('member-session-check'),status=doc.getElementById('member-session-status');
  if(!button||!status)throw Error('Member session controls unavailable');
  const newRequestId=typeof win.crypto?.randomUUID==='function'?async()=>win.crypto.randomUUID():undefined;
  const transport=config?.transport??browserCircleTransport(win);
  const approved=withCircle?memberCircleConfig({...config,newRequestId,transport})
    : {...config,origin:approvedOrigin(config?.origin),newRequestId,transport};
  if(!approved)throw Error('Member Circle configuration unavailable');
  const {auth,verificationTimeoutMs,...hostConfig}=approved;
  const binding=createVerifiedSupabaseCircleOwner(auth,{timeoutMs:verificationTimeoutMs});
  let visible=doc.visibilityState==='visible',focused=doc.hasFocus(),online=win.navigator.onLine!==false,disposed=false,started=false,screen=null,contributions=null,off=()=>{},room=null,immersiveOpen=false;
  const handlers=[];
  const dispose=()=>{
    if(disposed)return;disposed=true;
    for(const stop of [()=>room?.dispose(),()=>binding.stop(),()=>contributions?.dispose(),()=>screen?.dispose(),()=>off(),...handlers]){try{stop();}catch{/* Finish every independent retirement step. */}}
    handlers.length=0;
  };
  try {
    if(withCircle)screen=mountCirclePage({window:win,document:doc,config:{...hostConfig,owner:binding.owner}});
    contributions=mountMemberContributions({window:win,document:doc,config:{...hostConfig,aiConsent,owner:binding.owner},circleHost:screen?.host});
    const renderSession=m=>{status.textContent=m.message;button.disabled=m.busy||!m.active;button.textContent=m.busy?'Checking member session…':'Check member session';};
    off=binding.subscribe(renderSession);
    const listen=(target,event,fn)=>{target.addEventListener(event,fn);handlers.push(()=>target.removeEventListener(event,fn));};
    const activity=()=>{
      if(disposed)return;
      binding.activity(visible&&focused&&online&&!immersiveOpen);
      renderSession(binding.model());
    };
    if(withCircle&&immersive)room=mountImmersiveCircle({window:win,document:doc,config:{...hostConfig,immersive},onModeChange(open){
      immersiveOpen=open;
      if(open)immersive.pauseRegular();
      activity();
    }});
    listen(win,'blur',()=>{focused=false;activity();});listen(win,'focus',()=>{focused=true;activity();});
    listen(doc,'visibilitychange',()=>{visible=doc.visibilityState==='visible';activity();});
    listen(win,'offline',()=>{online=false;activity();});listen(win,'online',()=>{online=true;activity();});
    listen(button,'click',()=>{if(disposed||!visible||!focused||!online||immersiveOpen)return;if(!started){started=true;void binding.start();}else void binding.check();});
    listen(win,'pagehide',dispose);activity();
    return {binding,host:screen?.host,contributions:contributions.view,dispose};
  } catch { dispose();throw Error('Member Circle could not be opened'); }
}
