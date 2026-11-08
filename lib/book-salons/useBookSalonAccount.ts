'use client';
import { useEffect, useRef, useState } from 'react';
import { bindCircleAccess } from '../circles/browser-access';
import { createClient } from '../supabase/client';
import { createSalonAccount, initialSalonAccountView, type SalonDraft } from './browser-account';

export function useBookSalonAccount() {
  const [view, setView] = useState(initialSalonAccountView);
  const session = useRef<ReturnType<typeof createSalonAccount> | null>(null);
  useEffect(() => {
    const controller = createSalonAccount(fetch); session.current = controller;
    const offView = controller.subscribe(setView); let observing = false;
    const activate = () => { if (observing && document.visibilityState === 'visible' && navigator.onLine !== false) controller.activate(); };
    const inactive = () => controller.retire(true);
    const offAccess = bindCircleAccess({ window, document, onInactive: inactive, onActive: activate, onIdentity: () => controller.retire(),
      subscribeAuth(listener) {
        try { const { data } = createClient().auth.onAuthStateChange(listener); observing = true; return () => data.subscription.unsubscribe(); }
        catch { inactive(); return () => {}; }
      },
    });
    window.addEventListener('offline', inactive); window.addEventListener('online', activate);
    if (navigator.onLine === false) inactive();
    if (observing && controller.model().active) void controller.load();
    return () => { session.current = null; offView(); offAccess(); window.removeEventListener('offline', inactive); window.removeEventListener('online', activate); controller.dispose(); };
  }, []);
  return { ...view, load: () => session.current?.load(), create: () => session.current?.create(), join: (id: string) => session.current?.join(id),
    checkJoin: () => session.current?.checkJoin(), openCreate: () => session.current?.openCreate(), closeCreate: () => session.current?.closeCreate(),
    editDraft: (patch: Partial<SalonDraft>) => session.current?.editDraft(patch) };
}
