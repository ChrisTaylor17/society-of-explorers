'use client';
import { useEffect, useRef, useState } from 'react';
import { bindCircleAccess } from '../circles/browser-access';
import { createClient } from '../supabase/client';
import { createGuideProgramSession, initialProgramAccountView } from './browser-program';

export function useGuideProgram() {
  const [view, setView] = useState(initialProgramAccountView);
  const session = useRef<ReturnType<typeof createGuideProgramSession> | null>(null);
  useEffect(() => {
    const controller = createGuideProgramSession(fetch); session.current = controller;
    const offView = controller.subscribe(setView);
    let observing = false;
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
    return () => { session.current = null; offView(); offAccess(); window.removeEventListener('offline', inactive);
      window.removeEventListener('online', activate); controller.dispose(); };
  }, []);
  return { ...view, load: () => session.current?.load(), join: (id: string) => session.current?.join(id) };
}
