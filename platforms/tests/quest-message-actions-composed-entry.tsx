import React from 'react';
import { createRoot } from 'react-dom/client';
import { assertCircleMarkup } from '../quest/circle-view.mjs';
import QuestCircle from '../../app/quest/[circleId]/QuestCircle';
import { notifyAuthProviderChanged } from '../../lib/auth/providerSelection';

const subjects = { reporter: '73222222-2222-4222-8222-222222222222', author: '73111111-1111-4111-8111-111111111111', outsider: '73333333-3333-4333-8333-333333333333' };
const tokens = { reporter: 'NONISSUED_SAFETY_REPORTER', author: 'NONISSUED_SAFETY_AUTHOR', outsider: 'NONISSUED_SAFETY_OUTSIDER' };
let actor: keyof typeof subjects = 'author', factories = 0, calls = 0;
const listeners = new Set<(event: string, session: null) => void>();
const auth = {
  async getSession() { calls++; return { data: { session: { access_token: tokens[actor], user: { id: subjects[actor] } } } }; },
  async getUser(jwt: string) { calls++; if (jwt !== tokens[actor]) throw Error('Synthetic exact-token mismatch'); return { data: { user: { id: subjects[actor] } } }; },
  onAuthStateChange(listener: (event: string, session: null) => void) { listeners.add(listener); return { data: { subscription: { unsubscribe() { listeners.delete(listener); } } } }; },
};
const root = createRoot(document.getElementById('root')!);
const qa = { markupContract() {
    assertCircleMarkup(document);
    const legacy={getElementById:(id:string)=>id.startsWith('circle-thread-')||id.startsWith('circle-safety')?null:document.getElementById(id)};
    assertCircleMarkup(legacy);
    assertCircleMarkup({getElementById:(id:string)=>id.startsWith('circle-thread-')?null:document.getElementById(id)});
    let partial=false;try{assertCircleMarkup({getElementById:(id:string)=>id.startsWith('circle-safety-')?null:document.getElementById(id)});}catch{partial=true;}
    const duplicates=[];
    for(const id of ['circle-host-status','circle-thread-draft','circle-safety-note']){
      const extra=document.createElement('div');extra.id=id;document.body.append(extra);
      try{assertCircleMarkup(document);duplicates.push(false);}catch{duplicates.push(true);}finally{extra.remove();}
    }
    return{legacy:true,safetyWithoutWriter:true,partial,duplicates};
  }, factory() { factories++; return { auth }; }, counts: () => ({ factories, calls, subscriptions: listeners.size }),
  actor(value: keyof typeof subjects) { actor = value; }, providerChanged: notifyAuthProviderChanged,
  emit(event: string) { for (const listener of [...listeners]) listener(event, null); }, unmount() { root.unmount(); } };
Object.assign(window, { questMessageActionsQa: qa });
root.render(<React.StrictMode><QuestCircle circleId={document.documentElement.dataset.circle!} /></React.StrictMode>);
