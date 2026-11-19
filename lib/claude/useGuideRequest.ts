'use client';

import { useCallback, useEffect, useRef } from 'react';
import { subscribeAuthProviderChanges } from '@/lib/auth/providerSelection';

// A mounted page owns at most one guide operation. Retired accounts cannot
// restart it; remount after sign-in. Cancellation never automatically resends.
export function useGuideRequest(onRetire: () => void) {
  const active = useRef<AbortController | null>(null);
  const available = useRef(true);
  useEffect(() => {
    available.current = true;
    const retire = () => {
      available.current = false;
      active.current?.abort(); active.current = null;
      onRetire();
    };
    const unsubscribe = subscribeAuthProviderChanges(retire);
    return () => {
      unsubscribe(); available.current = false;
      active.current?.abort(); active.current = null;
    };
  }, [onRetire]);
  const begin = useCallback(() => {
    if (!available.current || active.current) return null;
    const controller = new AbortController(); active.current = controller;
    return controller;
  }, []);
  const owns = useCallback((controller: AbortController) => available.current && active.current === controller, []);
  const finish = useCallback((controller: AbortController) => {
    if (active.current === controller) active.current = null;
  }, []);
  const cancel = useCallback(() => { active.current?.abort(); }, []);
  return { begin, owns, finish, cancel };
}
