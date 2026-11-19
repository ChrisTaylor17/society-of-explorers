import {createVerifiedSupabaseCircleOwner,memberCircleConfig,approvedOrigin,hasCircleAuthority} from './circle-host.mjs';
import {mountCirclePage,browserCircleTransport,assertCircleMarkup} from './circle-view.mjs';
import {assertContributionsMarkup,mountMemberContributions} from './member-contributions-view.mjs';
import {immersiveControls,mountImmersiveCircle} from './immersive-circle.mjs';
import {mountBrowserSalon,salonControls} from './salon-presence.mjs';
import {mountBrowserMeeting} from './meeting.mjs';
import {mountMemberBlocks} from './member-blocks-view.mjs';
export {assertContributionsMarkup};
/** The authenticated application supplies its existing client. Account checks
 * start only on a deliberate action in the regular window or headset room. */
export function mountExistingMemberCircle(options) { return mount(options,true); }
export function mountExistingMemberContributions(options) { return mount(options,false); }
function mount({window:win,document:doc,config,onRegularActivity},withCircle) {
  if(onRegularActivity!==undefined&&typeof onRegularActivity!=='function')throw Error('Regular view activity observer unavailable');
  if(withCircle)assertCircleMarkup(doc);
  const immersive=withCircle?config?.immersive:null;
  const reelStarter=withCircle?config?.reelStarter:undefined;
  const fellowshipStarter=withCircle?config?.fellowshipStarter:undefined;
  const sharedSalon=withCircle&&config?.sharedSalon===true;
  const meeting=withCircle&&config?.meeting===true;
  if(sharedSalon)salonControls(doc);
  if(immersive){
    immersiveControls(doc,sharedSalon);
    if(typeof immersive.createAuth!=='function'||typeof immersive.pauseRegular!=='function')throw Error('Immersive Circle configuration unavailable');
  }
  const aiConsent=config?.aiConsent===undefined?false:config.aiConsent;
  if(!assertContributionsMarkup(doc,aiConsent)&&!withCircle)throw Error('Contribution controls unavailable');
  const button=doc.getElementById('member-session-check'),status=doc.getElementById('member-session-status');
  if(!button||!status)throw Error('Member session controls unavailable');
  const newRequestId=typeof win.crypto?.randomUUID==='function'?async()=>win.crypto.randomUUID():undefined;
  const transport=config?.transport??browserCircleTransport(win);
  const browserBinding=config?.browserBinding;
  if(browserBinding&&(!hasCircleAuthority(browserBinding.owner)||typeof config.transport!=='function'||config.auth!==undefined))throw Error('Browser authority unavailable');
  const approved=withCircle&&!browserBinding?memberCircleConfig({...config,newRequestId,transport})
    : {...config,origin:approvedOrigin(config?.origin),newRequestId,transport};
  if(!approved)throw Error('Member Circle configuration unavailable');
  const {auth,browserBinding:ownedBrowser,verificationTimeoutMs,...hostConfig}=approved;
  const binding=ownedBrowser??createVerifiedSupabaseCircleOwner(auth,{timeoutMs:verificationTimeoutMs});
  let visible=doc.visibilityState==='visible',focused=doc.hasFocus(),online=win.navigator.onLine!==false,disposed=false,started=false,screen=null,contributions=null,blocks=null,off=()=>{},room=null,immersiveOpen=false,browserSalon=null,browserMeeting=null;
  const regularActive=()=>!disposed&&visible&&focused&&online&&!immersiveOpen;
  const handlers=[];
  const dispose=()=>{
    if(disposed)return;disposed=true;
    try{onRegularActivity?.(false);}catch{/* Continue clearing the owned views. */}
    for(const stop of [()=>room?.dispose(),()=>browserSalon?.dispose(),()=>browserMeeting?.dispose(),()=>binding.stop(),()=>contributions?.dispose(),()=>blocks?.dispose(),()=>screen?.dispose(),()=>off(),...handlers]){try{stop();}catch{/* Finish every independent retirement step. */}}
    handlers.length=0;
  };
  try {
    if(withCircle)screen=mountCirclePage({window:win,document:doc,config:{...hostConfig,owner:binding.owner},reelStarter,fellowshipStarter});
    contributions=mountMemberContributions({window:win,document:doc,config:{...hostConfig,aiConsent,owner:binding.owner},circleHost:screen?.host});
    blocks=mountMemberBlocks({document:doc,config:{...hostConfig,owner:binding.owner}});
    if(sharedSalon)browserSalon=mountBrowserSalon(doc,{
      window:win,...hostConfig,owner:binding.owner,isActive:regularActive,
      onPresent() {
        void screen.host.followLatestArchive(() => regularActive() && browserSalon.present()
          && !doc.getElementById('circle-archive').contains(doc.activeElement));
      },
      onAccessLost() { screen.host.close(); },
    });
    if(meeting)browserMeeting=mountBrowserMeeting(doc,{window:win,...hostConfig,owner:binding.owner,isActive:regularActive});
    const renderSession=m=>{status.textContent=m.message;button.disabled=m.busy||!m.active;button.textContent=m.busy?'Checking member session…':'Check member session';browserSalon?.render();browserMeeting?.render();};
    off=binding.subscribe(renderSession);
    const listen=(target,event,fn)=>{target.addEventListener(event,fn);handlers.push(()=>target.removeEventListener(event,fn));};
    const activity=()=>{
      if(disposed)return;
      onRegularActivity?.(regularActive());
      if(!regularActive()){browserSalon?.retire();browserMeeting?.retire();}
      blocks?.activity(regularActive(),online);
      binding.activity(regularActive());
      renderSession(binding.model());
    };
    if(withCircle&&immersive)room=mountImmersiveCircle({window:win,document:doc,config:{...hostConfig,immersive,sharedSalon},reelStarter,fellowshipStarter,
      onMeetingRequested:browserMeeting?()=>browserMeeting.focus():null,onModeChange(open){
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
