'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { HALL_THINKERS, parsePublicHallPage, type PublicHallPage } from '@/lib/hall/public';

const gold = '#c9a84c';
const THINKER_NAMES: Record<string, string> = { socrates: 'Socrates', plato: 'Plato', nietzsche: 'Nietzsche', aurelius: 'Marcus Aurelius', einstein: 'Einstein', jobs: 'Steve Jobs' };
const THINKER_COLORS: Record<string, string> = { socrates: '#C9A84C', plato: '#7C9EBF', nietzsche: '#BF4040', aurelius: '#8B7355', einstein: '#6B9E6B', jobs: '#C0C0C0' };
type Filter = 'all' | typeof HALL_THINKERS[number];
const thinkerName = (id: string) => Object.hasOwn(THINKER_NAMES, id) ? THINKER_NAMES[id] : id;
const thinkerColor = (id: string) => Object.hasOwn(THINKER_COLORS, id) ? THINKER_COLORS[id] : gold;

async function readPublicHall(filter: Filter, controller: AbortController): Promise<PublicHallPage> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const current = () => { if (controller.signal.aborted) throw new Error('retired'); };
  try {
    return await Promise.race([
      (async () => {
        current();
        const query = filter === 'all' ? '' : `?thinker=${encodeURIComponent(filter)}`;
        const response = await fetch(`/api/hall${query}`, {
          credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal,
        });
        current();
        if (!response.ok) throw new Error('unavailable');
        const data: unknown = await response.json();
        current();
        const page = parsePublicHallPage(data);
        if (!page) throw new Error('unavailable');
        return page;
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('deadline')); }, 15_000);
      }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

export default function HallOfCreations() {
  const [page, setPage] = useState<PublicHallPage | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [filter, setFilter] = useState<Filter>('all');
  const epoch = useRef(0);
  const active = useRef<AbortController | null>(null);

  const load = useCallback(async (selected: Filter) => {
    const generation = ++epoch.current;
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    setFilter(selected); setPage(null); setPhase('loading');
    try {
      const result = await readPublicHall(selected, controller);
      if (generation !== epoch.current || controller.signal.aborted) return;
      setPage(result); setPhase('ready');
    } catch {
      if (generation !== epoch.current) return;
      setPage(null); setPhase('error');
    } finally { if (generation === epoch.current) active.current = null; }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const invalidate = () => { epoch.current++; active.current?.abort(); };
    void Promise.resolve().then(() => { if (!cancelled) void load('all'); });
    return () => { cancelled = true; invalidate(); };
  }, [load]);

  const selection = filter === 'all' ? 'all thinkers' : thinkerName(filter);
  const status = phase === 'loading' ? `Loading public creations for ${selection}…`
    : phase === 'error' ? 'Public creations are unavailable. You can retry loading.'
      : `Public text view loaded for ${selection}.`;
  return <main className="public-hall">
    <style>{`
      .public-hall { min-height:100vh; background:#0a0a0a; color:#e8d5a3; font-family:'Cormorant Garamond',serif; overflow-wrap:anywhere; }
      .public-hall * { box-sizing:border-box; }
      .public-hall a,.public-hall button { min-height:44px; display:inline-flex; align-items:center; justify-content:center; padding:10px 16px; border:1px solid ${gold}77; border-radius:4px; color:${gold}; background:#111; font:inherit; font-size:16px; cursor:pointer; text-decoration:none; }
      .public-hall :is(a,button):focus-visible { outline:3px solid ${gold}; outline-offset:3px; }
      .public-hall button[aria-pressed=true] { color:#f5f0e8; border-color:${gold}; background:#302a1b; }
      .public-hall nav { max-width:76rem; margin:auto; padding:1rem; display:flex; flex-wrap:wrap; gap:.75rem; align-items:center; justify-content:space-between; }
      .public-hall header { text-align:center; padding:2.5rem 1rem 1.5rem; border-bottom:1px solid ${gold}44; background:radial-gradient(ellipse at 50% 0%,rgba(201,168,76,.12),transparent 70%); }
      .public-hall h1 { color:${gold}; font-family:Cinzel,serif; font-size:clamp(1.8rem,5vw,3.25rem); font-weight:400; letter-spacing:.08em; margin:0 0 1rem; }
      .public-hall .intro { max-width:42rem; margin:0 auto 1.5rem; line-height:1.6; font-size:18px; }
      .public-hall .filters { display:flex; flex-wrap:wrap; justify-content:center; gap:.75rem; }
      .public-hall .results { max-width:76rem; margin:auto; padding:1.5rem 1rem 3rem; }
      .public-hall .results>p { line-height:1.6; }
      .public-hall .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr)); gap:1.5rem; margin-top:1.5rem; }
      .public-hall article { min-width:0; padding:1.5rem; background:#111; border:1px solid ${gold}55; border-radius:4px; }
      .public-hall article h2 { font-family:Cinzel,serif; font-size:1.2rem; font-weight:400; line-height:1.5; }
      .public-hall article p,.public-hall article blockquote { white-space:pre-wrap; line-height:1.7; }
      .public-hall article blockquote { border-left:2px solid ${gold}88; padding-left:1rem; margin:1rem 0 0; }
      .public-hall .credit { color:#c8bca6; font-style:italic; }
      .public-hall footer { text-align:center; padding:2rem 1rem; border-top:1px solid ${gold}44; }
      @media(max-width:480px) { .public-hall .cards { grid-template-columns:minmax(0,1fr); } }
    `}</style>
    <nav aria-label="Hall navigation"><Link href="/salon" prefetch={false}>Return to the Salon</Link><Link href="/circles" prefetch={false}>Find a Circle</Link></nav>
    <header>
      <h1>Hall of Creations</h1>
      <p className="intro">Public text creations inspired by Great Thinkers. Creator attribution is anonymous; publishing an artifact does not publish its creator’s profile.</p>
      <div className="filters" role="group" aria-label="Filter public creations by thinker">
        <button type="button" aria-pressed={filter === 'all'} onClick={() => load('all')}>All minds</button>
        {HALL_THINKERS.map(choice => <button key={choice} type="button" aria-pressed={filter === choice} onClick={() => load(choice)}>{thinkerName(choice)}</button>)}
      </div>
    </header>
    <section className="results" aria-label="Public text creations" aria-busy={phase === 'loading'}>
      <p role="status" aria-live="polite">{status}</p>
      <button type="button" onClick={() => load(filter)}>{phase === 'error' ? 'Retry loading creations' : 'Refresh creations'}</button>
      {phase === 'ready' && page && <>
        <p>Latest public text view for {selection}: showing {page.items.length} creations, up to 48.{page.page.hasMore ? ' More creations exist; earlier entries are not shown.' : ''}</p>
        {page.items.length === 0 ? <p>No public text creations are available for this selection.</p>
          : <div className="cards">{page.items.map(artifact => <article key={artifact.id}>
            <p style={{ color: thinkerColor(artifact.thinker_id) }}>{thinkerName(artifact.thinker_id)}</p>
            <h2>{artifact.title}</h2>
            <p className="credit">Anonymous Explorer</p>
            {artifact.description && <p>{artifact.description}</p>}
            {artifact.philosophical_note && <blockquote>{artifact.philosophical_note}</blockquote>}
          </article>)}</div>}
      </>}
    </section>
    <footer>Society of Explorers · Public text creations</footer>
  </main>;
}
