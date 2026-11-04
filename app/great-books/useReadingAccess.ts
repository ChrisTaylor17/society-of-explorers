'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { bindCircleAccess } from '@/lib/circles/browser-access';
import { circleHeaders } from '@/lib/circles/client';
import { createClient } from '@/lib/supabase/client';

export type ReadingFailure = { sent: boolean; status: number | null };

/** Private reading tools share the existing browser identity adapter. A return
 * to the page enables explicit actions; it never repeats a provider request. */
export function useReadingAccess(onRetire: () => void) {
  const [active, setActive] = useState(true), [busy, setBusy] = useState(false);
  const latestRetire = useRef(onRetire); latestRetire.current = onRetire;
  const access = useRef({ mounted: false, active: true, observing: false, busy: false, generation: 0, controller: null as AbortController | null });
  const retire = useCallback((inactive = false) => {
    const value = access.current;
    if (!value.mounted) return;
    value.generation++; value.busy = false;
    if (inactive) value.active = false;
    value.controller?.abort(); value.controller = null;
    setActive(value.active); setBusy(false); latestRetire.current();
  }, []);
  useEffect(() => {
    const value = access.current;
    value.mounted = true; value.active = document.visibilityState === 'visible'; value.observing = false;
    setActive(value.active);
    // A browser blur also fires when focus enters our book iframe, while the
    // top document still has focus. Filter that one event locally; pagehide and
    // hidden visibility must always retire the reading tools.
    const blurListeners = new Map<() => void, () => void>();
    const readingWindow = {
      addEventListener(name: string, listener: () => void) {
        const callback = name === 'blur' ? () => { if (!document.hasFocus()) listener(); } : listener;
        if (name === 'blur') blurListeners.set(listener, callback);
        window.addEventListener(name, callback);
      },
      removeEventListener(name: string, listener: () => void) {
        window.removeEventListener(name, name === 'blur' ? blurListeners.get(listener) || listener : listener);
        if (name === 'blur') blurListeners.delete(listener);
      },
    };
    // Once focus is inside the book, a later external focus loss may reach only
    // the child window. Observe that owned frame as well, including navigation.
    const disposeFrames = Array.from(document.querySelectorAll<HTMLIFrameElement>('iframe[data-reading-frame]'), frame => {
      let child: Window | null = null;
      const blur = () => { if (!document.hasFocus()) retire(true); };
      const detach = () => { try { child?.removeEventListener('blur', blur); } catch {} child = null; };
      const attach = () => { detach(); try { child = frame.contentWindow; child?.addEventListener('blur', blur); } catch { retire(true); } };
      frame.addEventListener('load', attach); attach();
      return () => { frame.removeEventListener('load', attach); detach(); };
    });
    const dispose = bindCircleAccess({ window: readingWindow, document,
      subscribeAuth: listener => {
        try {
          const { data } = createClient().auth.onAuthStateChange(event => listener(event));
          value.observing = true;
          return () => data.subscription.unsubscribe();
        } catch { retire(true); return () => {}; }
      },
      onInactive: () => retire(true), onIdentity: () => retire(),
      onActive: () => { if (value.observing && document.visibilityState === 'visible') { value.active = true; setActive(true); } },
    });
    return () => { dispose(); disposeFrames.forEach(disposeFrame => disposeFrame()); value.generation++; value.mounted = false; value.observing = false; value.busy = false; value.controller?.abort(); value.controller = null; };
  }, [retire]);

  const run = useCallback(async <T,>(url: string, init: RequestInit,
    consume: (response: Response, signal: AbortSignal, current: () => boolean) => Promise<T>,
    success: (value: T) => void, failure: (error: ReadingFailure) => void, timeoutMs = 15_000): Promise<void> => {
    const value = access.current;
    if (!value.mounted || !value.active || !value.observing || value.busy) return;
    value.busy = true;
    const generation = ++value.generation, controller = new AbortController();
    value.controller = controller; setBusy(true);
    const current = () => value.mounted && value.active && value.generation === generation && !controller.signal.aborted;
    const owned = () => value.mounted && value.active && value.generation === generation;
    let sent = false, status: number | null = null, result: T | undefined, failed = false;
    let abort = () => {};
    const cancelled = new Promise<never>((_resolve, reject) => { abort = () => reject(new Error('Reading request retired')); controller.signal.addEventListener('abort', abort, { once: true }); });
    const deadline = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const request = async () => {
        const credentials = await circleHeaders(init.body !== undefined && init.body !== null);
        if (!current()) throw new Error('Reading request retired');
        const headers = new Headers(init.headers);
        for (const [name, content] of Object.entries(credentials)) headers.set(name, content);
        sent = true;
        const response = await fetch(url, { ...init, headers, cache: 'no-store', redirect: 'error', signal: controller.signal });
        status = response.status;
        if (!response.ok) throw new Error('Reading request unavailable');
        if (!current()) throw new Error('Reading request retired');
        return consume(response, controller.signal, current);
      };
      result = await Promise.race([request(), cancelled]);
    } catch { failed = true; }
    finally { clearTimeout(deadline); controller.signal.removeEventListener('abort', abort); }
    if (!owned()) return;
    value.busy = false; value.controller = null; setBusy(false);
    if (failed) failure({ sent, status }); else success(result as T);
  }, []);
  return { active, busy, run, cancel: () => retire() };
}
