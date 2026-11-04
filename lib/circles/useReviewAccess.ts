'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { bindCircleAccess } from './browser-access';
import { circleHeaders } from './client';
import { createClient } from '@/lib/supabase/client';

export type ReviewResult = { status: number; body: unknown };

/** A browser lifetime for private review data. Resuming permits a manual read;
 * it never replays a request or restores cleared private data. */
export function useReviewAccess(onRetire: () => void) {
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const retired = useRef(onRetire);
  retired.current = onRetire;
  const access = useRef({ mounted: false, active: true, observing: false, generation: 0, busy: false, controller: null as AbortController | null });

  const retire = useCallback((inactive = false) => {
    const lifetime = access.current;
    if (!lifetime.mounted) return;
    lifetime.generation++;
    if (inactive) lifetime.active = false;
    lifetime.busy = false;
    lifetime.controller?.abort();
    lifetime.controller = null;
    setActive(lifetime.active);
    setBusy(false);
    retired.current();
  }, []);

  useEffect(() => {
    const lifetime = access.current;
    lifetime.mounted = true;
    lifetime.active = document.visibilityState === 'visible';
    lifetime.observing = false;
    setActive(lifetime.active);
    const dispose = bindCircleAccess({
      window, document,
      subscribeAuth: listener => {
        try {
          const { data } = createClient().auth.onAuthStateChange(event => listener(event));
          lifetime.observing = true;
          return () => data.subscription.unsubscribe();
        } catch {
          retire(true);
          return () => {};
        }
      },
      onInactive: () => retire(true),
      onIdentity: () => retire(),
      onActive: () => {
        if (!lifetime.observing || document.visibilityState !== 'visible') return;
        lifetime.active = true;
        setActive(true);
      },
    });
    return () => {
      dispose();
      lifetime.generation++;
      lifetime.mounted = false;
      lifetime.busy = false;
      lifetime.observing = false;
      lifetime.controller?.abort();
      lifetime.controller = null;
    };
  }, [retire]);

  const perform = useCallback(async (
    url: string,
    init: RequestInit,
    onResult: (result: ReviewResult) => void,
    onFailure: (sent: boolean) => void,
  ): Promise<void> => {
    const lifetime = access.current;
    // This fence is synchronous, including before React paints disabled controls.
    if (!lifetime.mounted || !lifetime.active || !lifetime.observing || lifetime.busy) return;
    lifetime.busy = true;
    const generation = ++lifetime.generation;
    const controller = new AbortController();
    lifetime.controller = controller;
    setBusy(true);
    const current = () => lifetime.mounted && lifetime.active && lifetime.generation === generation;
    let sent = false;
    let result: ReviewResult | undefined;
    let failed = false;
    let abort: () => void = () => {};
    const cancelled = new Promise<never>((_resolve, reject) => {
      abort = () => reject(new Error('Review request retired'));
      controller.signal.addEventListener('abort', abort, { once: true });
    });
    // The deadline includes waiting for credentials and reading the reply body.
    const deadline = setTimeout(() => controller.abort(), 15_000);
    try {
      const request = async (): Promise<ReviewResult> => {
        const credentials = await circleHeaders(init.body !== undefined && init.body !== null);
        if (!current() || controller.signal.aborted) throw new Error('Review request retired');
        const headers = new Headers(init.headers);
        for (const [name, value] of Object.entries(credentials)) headers.set(name, value);
        sent = true;
        const response = await fetch(url, { ...init, headers, redirect: 'error', cache: 'no-store', signal: controller.signal });
        const body: unknown = await response.json().catch(() => null);
        return { status: response.status, body };
      };
      result = await Promise.race([request(), cancelled]);
    } catch {
      failed = true;
    } finally {
      clearTimeout(deadline);
      controller.signal.removeEventListener('abort', abort);
    }
    if (!current()) return;
    lifetime.busy = false;
    lifetime.controller = null;
    setBusy(false);
    // Release only this request before callbacks, allowing a fresh manual read
    // after a mutation receipt without an older finally block clearing it.
    if (failed || !result) onFailure(sent);
    else onResult(result);
  }, []);

  return { active, busy, perform };
}
