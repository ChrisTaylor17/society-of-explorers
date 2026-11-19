import React from 'react';
import { createRoot } from 'react-dom/client';
import { assertContributionsMarkup } from '../quest/member-contributions-view.mjs';
import { mountExistingMemberContributions } from '../quest/member-circle-page.mjs';
import QuestCircle from '../../app/quest/[circleId]/QuestCircle';
import { notifyAuthProviderChanged } from '../../lib/auth/providerSelection';

const {subjects,tokens}=(window as unknown as {questAuth:{subjects:Record<'author'|'other'|'outsider',string>;tokens:Record<'author'|'other'|'outsider',string>}}).questAuth;
let actor: keyof typeof subjects = 'author', factories = 0, calls = 0;
const listeners = new Set<(event: string, session: null) => void>();
const auth = {
  async getSession() { calls++; return { data: { session: { access_token: tokens[actor], user: { id: subjects[actor] } } } }; },
  async getUser(jwt: string) { calls++; if (jwt !== tokens[actor]) throw Error('Synthetic exact-token mismatch'); return { data: { user: { id: subjects[actor] } } }; },
  onAuthStateChange(listener: (event: string, session: null) => void) { listeners.add(listener); return { data: { subscription: { unsubscribe() { listeners.delete(listener); } } } }; },
};
let legacy: ReturnType<typeof mountExistingMemberContributions> | null = null;
const root = createRoot(document.getElementById('root')!);
const saved = new Map<string, { el: HTMLInputElement; fn: (() => void) | undefined; checkbox: boolean }[]>();
const qa = { legacy() { legacy?.dispose(); legacy=mountExistingMemberContributions({window,document,config:{origin:location.origin,auth}}); }, closeLegacy() { legacy?.dispose();legacy=null; }, capture(name: string, ids: string[]) { saved.set(name, ids.map(id => { const el = document.getElementById(id) as HTMLElement; return { el: el as HTMLInputElement, fn: (id.endsWith('confirm') ? el.onchange : el.onclick)?.bind(el) as (() => void) | undefined, checkbox: id.endsWith('confirm') };  })); }, invoke(name: string) { for (const {el,fn,checkbox} of saved.get(name) ?? []) { const previous=el.checked; if(checkbox)el.checked=true; fn?.(); if(checkbox&&el.isConnected)el.checked=previous; } }, markupContract() {
    const complete=assertContributionsMarkup(document,true);
    const legacy=!assertContributionsMarkup({getElementById:()=>null});
    let partial=false;try{assertContributionsMarkup({getElementById:(id:string)=>id==='member-contributions-check'?null:document.getElementById(id)});}catch{partial=true;}
    const duplicate=document.createElement('div');duplicate.id='member-contributions-confirm';document.body.append(duplicate);
    let duplicates=false;try{assertContributionsMarkup(document);}catch{duplicates=true;}finally{duplicate.remove();}
    let missingAi=false;try{assertContributionsMarkup({getElementById:(id:string)=>id.startsWith('member-contributions-ai')?null:document.getElementById(id)},true);}catch{missingAi=true;}
    return{complete,legacy,partial,duplicates,missingAi};
  }, factory() { factories++; return { auth }; }, counts: () => ({ factories, calls, subscriptions: listeners.size }),
  actor(value: keyof typeof subjects) { actor = value; }, providerChanged: notifyAuthProviderChanged,
  emit(event: string) { for (const listener of [...listeners]) listener(event, null); }, mode(circleId: string | null) { root.render(<React.StrictMode><QuestCircle key={circleId ?? 'own'} circleId={circleId ?? undefined} /></React.StrictMode>); }, unmount() { legacy?.dispose();legacy=null;root.unmount(); } };
Object.assign(window, { questAiConsentQa: qa });
root.render(<React.StrictMode><QuestCircle circleId={undefined} /></React.StrictMode>);
