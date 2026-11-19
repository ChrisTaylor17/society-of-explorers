// View-local unsent values only. No storage, authority or cross-scope recovery.
export function createFieldRenderer(root){
 const drafts=new Map();let previous=[],lastReset,lastHTML,parkedFocus=null;
 function render(html,fields,reset){
  const invalidated=reset!==lastReset,active=root.ownerDocument?.activeElement;let focused=null;
  if(invalidated){drafts.clear();parkedFocus=null;}
  else {
   if(parkedFocus&&active&&active!==root.ownerDocument?.body)parkedFocus=null;
   for(const field of previous){const el=root.querySelector('#'+field.id);if(!field.scope||!field.enabled||!el||el.disabled)continue;
   drafts.set(field.id,{scope:field.scope,value:el.value});
   if(el===active)focused={id:field.id,scope:field.scope,start:el.selectionStart,end:el.selectionEnd,direction:el.selectionDirection};
   }
  }
  for(const field of fields)if(!field.scope||drafts.get(field.id)?.scope!==field.scope)drafts.delete(field.id);
  if(focused)parkedFocus=focused;
  if(parkedFocus&&!fields.some(f=>f.id===parkedFocus.id&&f.scope===parkedFocus.scope))parkedFocus=null;
  const replaced=html!==lastHTML;if(replaced){root.innerHTML=html;lastHTML=html;}
  for(const field of fields){const el=root.querySelector('#'+field.id);if(!el)continue;
   const saved=drafts.get(field.id),value=field.scope&&field.enabled&&saved?.scope===field.scope?saved.value:field.initial??'';
   if(el.value!==value)el.value=value;
   if(!invalidated&&field.enabled&&field.scope&&parkedFocus?.id===field.id&&parkedFocus.scope===field.scope&&!el.disabled&&(replaced||active===root.ownerDocument?.body)){
    const position=parkedFocus;parkedFocus=null;
    try{el.focus?.({preventScroll:true});if(el.tagName==='TEXTAREA'&&Number.isInteger(position.start)&&Number.isInteger(position.end))el.setSelectionRange?.(position.start,position.end,position.direction);}catch{}
   }
  }
  previous=fields;lastReset=reset;
 }
 return{render,dispose(){drafts.clear();parkedFocus=null;for(const f of previous){const el=root.querySelector('#'+f.id);if(el)el.value=f.initial??'';}previous=[];}};
}
