import React from 'react';
import { createRoot } from 'react-dom/client';
import Contributions from '../../../app/circles/contributions/Contributions';
import MessageReviews from '../../../app/moderation/messages/MessageReviews';

const root = createRoot(document.getElementById('root')!);
const listeners = new Set<(event: string) => void>();
const qa = {
  listeners,
  emit(event: string) { for (const listener of [...listeners]) listener(event); },
  show(view: 'owner' | 'review') { root.render(<React.StrictMode>{view === 'owner' ? <Contributions /> : <MessageReviews />}</React.StrictMode>); },
  factory() { return { auth: { onAuthStateChange(listener: (event: string) => void) {
    listeners.add(listener); return { data: { subscription: { unsubscribe() { listeners.delete(listener); } } } };
  } } }; },
};
Object.assign(window, { aiQa: qa });
qa.show('owner');
