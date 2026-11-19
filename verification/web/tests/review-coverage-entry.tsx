import React from 'react';
import { createRoot } from 'react-dom/client';
import CircleReviews from '../../../app/moderation/circles/CircleReviews';
import MessageReviews from '../../../app/moderation/messages/MessageReviews';

const root = createRoot(document.getElementById('root')!);
const listeners = new Set<(event: string) => void>();
let credentialGate: Promise<void> | null = null;
let release: (() => void) | null = null;
const qa = {
  listeners,
  emit(event: string) { for (const listener of [...listeners]) listener(event); },
  show(view: 'listing' | 'message') { root.render(<React.StrictMode key={view}>{view === 'listing' ? <CircleReviews /> : <MessageReviews />}</React.StrictMode>); },
  holdCredentials() { credentialGate = new Promise<void>(resolve => { release = resolve; }); },
  releaseCredentials() { release?.(); release = null; credentialGate = null; },
  async credentials(json: boolean) { if (credentialGate) await credentialGate; return json ? { 'Content-Type': 'application/json' } : {}; },
  factory() { return { auth: { onAuthStateChange(listener: (event: string) => void) {
    listeners.add(listener); return { data: { subscription: { unsubscribe() { listeners.delete(listener); } } } };
  } } }; },
};
Object.assign(window, { coverageQa: qa });
qa.show('listing');
