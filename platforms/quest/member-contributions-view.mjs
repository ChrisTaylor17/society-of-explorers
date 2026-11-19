import {createMemberContributions,MESSAGE_REPORT_OPTIONS,MESSAGE_WITHDRAWAL_PRIVACY,MESSAGE_AI_DISCLOSURE,MESSAGE_AI_POLICY,MESSAGE_AI_POLICY_HREF} from './circle-host.mjs';

const controls=['member-contributions-open','member-contributions','member-contributions-heading','member-contributions-status','member-contributions-list','member-contributions-refresh','member-contributions-items','member-contributions-next','member-contributions-selected','member-contributions-selected-heading','member-contributions-action-status','member-contributions-message','member-contributions-explanations','member-contributions-privacy','member-contributions-confirm-label','member-contributions-confirm','member-contributions-withdraw','member-contributions-check','member-contributions-retry','member-contributions-back','member-contributions-return','member-circle-workspace'];
/** Older configured pages may omit this complete island. Partial or duplicate
 * controls must fail before an account client can be observed. */
const aiControls=['member-contributions-ai','member-contributions-ai-intro','member-contributions-ai-provider','member-contributions-ai-revocation','member-contributions-ai-policy','member-contributions-ai-status','member-contributions-ai-current','member-contributions-ai-check','member-contributions-ai-off','member-contributions-ai-confirm-label','member-contributions-ai-confirm','member-contributions-ai-confirm-text','member-contributions-ai-allow','member-contributions-ai-retirement'];
export function assertContributionsMarkup(doc,aiConsent=false) {
  if(typeof aiConsent!=='boolean')throw Error('Contribution capability unavailable');
  const count=controls.filter(id=>doc.getElementById(id)).length;
  const aiCount=aiControls.filter(id=>doc.getElementById(id)).length;
  if(count&&count!==controls.length)throw Error('Contribution controls unavailable');
  if((aiCount&&aiCount!==aiControls.length)||(aiConsent&&(count!==controls.length||aiCount!==aiControls.length)))throw Error('AI review controls unavailable');
  if(typeof doc.querySelectorAll==='function'&&[...controls,...aiControls].some(id=>doc.querySelectorAll(`[id="${id}"]`).length>1))throw Error('Duplicate contribution controls unavailable');
  return count===controls.length;
}
export function mountMemberContributions({window:win,document:doc,config,circleHost}) {
  if(!assertContributionsMarkup(doc,config?.aiConsent===undefined?false:config.aiConsent))return {dispose(){}};
  const $=id=>doc.getElementById(id),view=createMemberContributions(config);
  let opened=!circleHost,disposed=false,focused=doc.hasFocus(),visible=doc.visibilityState==='visible',selected=null,renderEpoch=0;
  const renderedHandlers=[];
  let model=view.model(),circle=circleHost?.model();
  const handlers=[];let off=()=>{},offCircle=()=>{};
  const text=(tag,value)=>{const e=doc.createElement(tag);e.textContent=value;return e;};
  const canLeaveCircle=()=>circle?.threadWrite?.canNavigate!==false&&circle?.messageSafety?.canNavigate!==false&&!circle?.participation?.write.busy;
  function render() {
    if(disposed)return;
    const epoch=++renderEpoch;
    for(const clear of renderedHandlers.splice(0))clear();
    // An event retained from an earlier render may never target a later
    // selection, account, confirmation, or lifecycle, even on the same node.
    const bind=(element,event,enabled,action)=>{
      const callback=()=>{if(!disposed&&epoch===renderEpoch&&enabled)action();};
      element[`on${event}`]=callback;
      renderedHandlers.push(()=>{if(element[`on${event}`]===callback)element[`on${event}`]=null;});
    };
    const on=(id,event,enabled,action)=>bind($(id),event,opened&&enabled,action);
    $('member-contributions-open').hidden=opened;
    $('member-contributions-open').disabled=!model.connected||!model.active||!model.online||!canLeaveCircle();
    $('member-contributions').hidden=!opened;$('member-circle-workspace').hidden=opened;
    $('member-contributions').setAttribute('aria-busy',String(model.busy||Boolean(model.safety?.busy)||Boolean(model.aiConsent?.busy)));
    $('member-contributions-status').textContent=model.message;
    $('member-contributions-list').hidden=Boolean(model.selected);
    $('member-contributions-refresh').disabled=!model.canRefresh;
    $('member-contributions-next').hidden=!model.nextCursor;$('member-contributions-next').disabled=!model.canNext;
    $('member-contributions-items').replaceChildren(...model.items.map(item=>{
      const article=doc.createElement('article');article.dataset.contributionId=item.message.id;article.dataset.circleId=item.circleId;
      article.append(text('strong','Your contribution'),text('p',item.message.created_at),text('p',item.message.content??(item.message.visibility==='withdrawn'?'This contribution was withdrawn.':'This contribution is restricted by moderation.')));
      const button=text('button','Check my contribution');button.type='button';button.disabled=!model.canSelect;
      bind(button,'click',opened&&model.canSelect,()=>void view.select(item.circleId,item.message.id));article.append(button);return article;
    }));
    const safety=model.safety,state=safety?.state;
    $('member-contributions-selected').hidden=!model.selected;
    $('member-contributions-action-status').textContent=safety?.message??'';
    const message=[];
    if(state){const article=doc.createElement('article');article.append(text('strong','Your contribution'),text('p',state.message.created_at),text('p',state.message.content??(state.message.visibility==='withdrawn'?'This contribution was withdrawn.':'This contribution is restricted by moderation.')));message.push(article);}
    $('member-contributions-message').replaceChildren(...message);
    $('member-contributions-explanations').replaceChildren(...(state?.explanations.map(explanation=>{
      const label=MESSAGE_REPORT_OPTIONS.find(option=>option.value===explanation.reason)?.label??({no_violation:'No violation found',insufficient_evidence:'Insufficient evidence',resolved:'Concern resolved'}[explanation.reason]??explanation.reason);
      const article=doc.createElement('article');article.append(text('strong',(explanation.action==='hide'?'Hidden':'Moderator restriction lifted')+' · '+label),text('p',explanation.summary),text('p',explanation.created_at));return article;
    })??[]));
    $('member-contributions-privacy').textContent=MESSAGE_WITHDRAWAL_PRIVACY;
    $('member-contributions-confirm-label').hidden=!state?.canWithdraw;
    $('member-contributions-confirm').checked=Boolean(safety?.confirmed);$('member-contributions-confirm').disabled=!safety?.canConfirm;
    $('member-contributions-withdraw').hidden=!state?.canWithdraw;$('member-contributions-withdraw').disabled=!safety?.canWithdraw;
    $('member-contributions-check').disabled=!safety?.canCheck;
    $('member-contributions-retry').hidden=!safety?.canRetry;$('member-contributions-retry').disabled=!safety?.canRetry;
    $('member-contributions-back').disabled=!model.canBack;$('member-contributions-return').disabled=!model.canNavigate;$('member-contributions-return').hidden=!circleHost;
    const ai=model.aiConsent;
    if($('member-contributions-ai')){
      $('member-contributions-ai').hidden=!model.selected;
      $('member-contributions-ai-intro').textContent=MESSAGE_AI_DISCLOSURE.intro;
      $('member-contributions-ai-provider').textContent=MESSAGE_AI_DISCLOSURE.provider;
      $('member-contributions-ai-revocation').textContent=MESSAGE_AI_DISCLOSURE.revocation;
      $('member-contributions-ai-policy').textContent=`Read the message AI policy (${MESSAGE_AI_POLICY})`;
      $('member-contributions-ai-policy').setAttribute('href',MESSAGE_AI_POLICY_HREF);
      $('member-contributions-ai-status').textContent=ai?.message??'AI review settings are unavailable in this connection. Permission is not being assumed.';
      $('member-contributions-ai-current').textContent=ai?.state?(ai.state.allowed?'Saved setting: Anthropic review is allowed for this message.':'Saved setting: future AI review is off for this message.'):'Current permission has not been verified.';
      $('member-contributions-ai-check').disabled=!ai?.canCheck;
      $('member-contributions-ai-off').disabled=!ai?.canKeepOff;
      $('member-contributions-ai-off').textContent=ai?.state?.allowed?'Revoke future AI review':'Keep future AI review off';
      $('member-contributions-ai-confirm').checked=Boolean(ai?.confirmed);
      $('member-contributions-ai-confirm').disabled=!ai?.canConfirm;
      $('member-contributions-ai-confirm-text').textContent=MESSAGE_AI_DISCLOSURE.confirmation;
      $('member-contributions-ai-allow').disabled=!ai?.canAllow;
      $('member-contributions-ai-allow').textContent=ai?.state?.allowed?'Keep Anthropic review allowed for this message':'Allow Anthropic review of this message';
      $('member-contributions-ai-retirement').textContent=MESSAGE_AI_DISCLOSURE.retirement;
      const action=ai?.action;
      on('member-contributions-ai-check','click',ai?.canCheck,()=>void view.checkAiConsent(action));
      on('member-contributions-ai-off','click',ai?.canKeepOff,()=>void view.setAiConsent(false,action));
      on('member-contributions-ai-confirm','change',ai?.canConfirm,()=>view.confirmAiConsent($('member-contributions-ai-confirm').checked,action));
      on('member-contributions-ai-allow','click',ai?.canAllow,()=>void view.setAiConsent(true,action));
    }
    bind($('member-contributions-open'),'click',!opened&&model.connected&&model.active&&model.online&&canLeaveCircle(),()=>{
      opened=true;circleHost?.close();activity();render();$('member-contributions-heading').focus();
    });
    on('member-contributions-refresh','click',model.canRefresh,()=>void view.refresh());
    on('member-contributions-next','click',model.canNext,()=>void view.next());
    on('member-contributions-confirm','change',safety?.canConfirm,()=>view.confirm($('member-contributions-confirm').checked));
    on('member-contributions-withdraw','click',safety?.canWithdraw,()=>void view.withdraw());
    on('member-contributions-check','click',safety?.canCheck,()=>void view.check());
    on('member-contributions-retry','click',safety?.canRetry,()=>void view.retry());
    on('member-contributions-back','click',model.canBack,()=>{view.back();$('member-contributions-refresh').focus();});
    on('member-contributions-return','click',Boolean(circleHost)&&model.canNavigate,()=>{
      view.close();opened=false;activity();render();$('circle-refresh').focus();
    });
    const pair=model.selected?`${model.selected.circleId}:${model.selected.messageId}`:null;
    if(opened&&pair&&pair!==selected)$('member-contributions-selected-heading').focus();selected=pair;
  }
  function activity() {
    view.activity(visible&&focused);
    circleHost?.activity(!opened&&visible&&focused);
  }
  const dispose=()=>{
    if(disposed)return;disposed=true;renderEpoch++;
    for(const clear of renderedHandlers.splice(0))clear();
    for(const stop of [()=>view.disconnect(),()=>off(),()=>offCircle(),...handlers]){try{stop();}catch{/* Finish every independent retirement. */}}
    handlers.length=0;
    for(const id of ['member-contributions-items','member-contributions-message','member-contributions-explanations'])try{$(id)?.replaceChildren();}catch{}
    for(const id of ['member-contributions-status','member-contributions-action-status','member-contributions-ai-status','member-contributions-ai-current'])if($(id))$(id).textContent='';
    if($('member-contributions-confirm'))$('member-contributions-confirm').checked=false;
    if($('member-contributions-ai-confirm'))$('member-contributions-ai-confirm').checked=false;
    if($('member-contributions-ai'))$('member-contributions-ai').hidden=true;
    if($('member-contributions'))$('member-contributions').hidden=true;
    if($('member-contributions-open')){$('member-contributions-open').hidden=false;$('member-contributions-open').disabled=true;}
    if($('member-circle-workspace'))$('member-circle-workspace').hidden=false;
  };
  try {
    off=view.subscribe(value=>{model=value;render();});
    offCircle=circleHost?.subscribe(value=>{circle=value;render();})??(()=>{});
    const listen=(target,event,callback)=>{target.addEventListener(event,callback);handlers.push(()=>target.removeEventListener(event,callback));};
    listen(win,'blur',()=>{focused=false;activity();});listen(win,'focus',()=>{focused=true;activity();});
    listen(doc,'visibilitychange',()=>{visible=doc.visibilityState==='visible';activity();});
    listen(win,'offline',()=>view.connectivity(false));listen(win,'online',()=>view.connectivity(true));
    listen(win,'pagehide',dispose);view.connect();activity();view.connectivity(win.navigator.onLine!==false);render();
    return {view,dispose};
  }catch{dispose();throw Error('Member contributions could not be opened');}
}
