'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { parseBookSalonPage, type BookSalonListing } from './salon-discovery';

type View = { cohorts: BookSalonListing[]; loading: boolean; error: boolean; nextOffset: number | null; requestedOffset: number };
const initial = (): View => ({ cohorts: [], loading: true, error: false, nextOffset: null, requestedOffset: 0 });

export function useBookSalonDiscovery() {
  const [view, setView] = useState<View>(initial);
  const lifetime = useRef({ mounted: false, generation: 0, controller: null as AbortController | null });
  const load = useCallback(async (offset = 0) => {
    const core = lifetime.current;
    if (!core.mounted) return;
    const generation = ++core.generation;
    core.controller?.abort(); const controller = new AbortController(); core.controller = controller;
    const current = () => core.mounted && core.generation === generation;
    setView(v => ({ ...(offset ? v : initial()), loading: true, error: false, requestedOffset: offset }));
    const timer = window.setTimeout(() => controller.abort(), 10_000);
    try {
      // Public listing does not wait for SDK, account setup or private identity.
      const res = await fetch(`/api/book-salons?offset=${offset}`, { cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal });
      const data = res.ok ? parseBookSalonPage(await res.json(), offset) : null;
      if (!current()) return;
      if (!data || controller.signal.aborted) throw Error('Listing unavailable');
      setView(v => {
        const rows = offset ? new Map(v.cohorts.map(row => [row.id, row])) : new Map<string, BookSalonListing>();
        for (const row of data.cohorts) rows.set(row.id, row);
        return { cohorts: [...rows.values()], loading: false, error: false, nextOffset: data.page.nextOffset, requestedOffset: offset };
      });
    } catch { if (current()) setView(v => ({ ...v, loading: false, error: true })); }
    finally { window.clearTimeout(timer); if (current()) core.controller = null; }
  }, []);
  useEffect(() => {
    const core = lifetime.current; core.mounted = true; void load();
    return () => { core.mounted = false; core.generation++; core.controller?.abort(); core.controller = null; };
  }, [load]);
  return { ...view, load };
}
