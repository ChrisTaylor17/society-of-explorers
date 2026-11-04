import React from 'react';
import {createRoot} from 'react-dom/client';
import QuestCircle from '../../app/quest/[circleId]/QuestCircle';
import {notifyAuthProviderChanged} from '../../lib/auth/providerSelection';

const listeners = new Set<(event: string, session: null) => void>();
let calls = 0, factories = 0;
const subject = '11111111-1111-4111-8111-111111111111';
const auth = {
  async getSession() { calls++; return {data: {session: {access_token: 'NONISSUED_QUEST_PAGE_FIXTURE', user: {id: subject}}}}; },
  async getUser(jwt: string) { calls++; if(jwt !== 'NONISSUED_QUEST_PAGE_FIXTURE') throw Error('Unexpected test fixture credential'); return {data: {user: {id: subject}}}; },
  onAuthStateChange(listener: (event: string, session: null) => void) { listeners.add(listener); return {data: {subscription: {unsubscribe() { listeners.delete(listener); }}}}; },
};
const qa = {auth, providerCalls: () => calls, factories: () => factories, factory() {factories++;return {auth};},
  subscriptions: () => listeners.size, providerChanged: notifyAuthProviderChanged, unmount: () => root.unmount()};
Object.assign(window, {questQa: qa});
const root = createRoot(document.getElementById('root')!);
root.render(<React.StrictMode><QuestCircle circleId="44444444-4444-4444-8444-444444444444"/></React.StrictMode>);
