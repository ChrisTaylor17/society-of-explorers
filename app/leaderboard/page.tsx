'use client';

import { useEffect, useRef, useState } from 'react';
import PublicFooter from '@/components/PublicFooter';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const muted = '#9a8f7a';
const CHECK_DEADLINE_MS = 10_000;
type CheckState = 'checking' | 'unavailable' | 'error' | 'invalid' | 'timeout';

const messages: Record<CheckState, string> = {
  checking: 'Checking leaderboard availability…',
  unavailable: 'The guide leaderboard is unavailable.',
  error: 'We could not check leaderboard availability. Try again.',
  invalid: 'The availability response could not be verified. Try again.',
  timeout: 'The availability check took too long. Try again.',
};

function isUnavailable(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.keys(value).length === 2
    && 'code' in value && value.code === 'leaderboard_unavailable'
    && 'error' in value && value.error === 'Leaderboard unavailable.';
}

export default function LeaderboardPage() {
  const [state, setState] = useState<CheckState>('checking');
  const [attempt, setAttempt] = useState(0);
  const cancelCurrent = useRef<(() => void) | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const retire = () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
    // One deadline covers both response headers and a non-abortable JSON body.
    const timer = setTimeout(() => {
      if (!active) return;
      retire();
      setState('timeout');
    }, CHECK_DEADLINE_MS);
    cancelCurrent.current = retire;

    void (async () => {
      let response: Response;
      try {
        response = await fetch('/api/leaderboard', {
          method: 'GET', credentials: 'omit', cache: 'no-store',
          redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal,
        });
      } catch {
        if (active) { retire(); setState('error'); }
        return;
      }
      if (!active) return;
      if (response.status !== 503) { retire(); setState('error'); return; }
      let payload: unknown;
      try { payload = await response.json(); }
      catch {
        if (active) { retire(); setState('invalid'); }
        return;
      }
      if (!active) return;
      retire();
      setState(isUnavailable(payload) ? 'unavailable' : 'invalid');
    })();

    return () => {
      retire();
      if (cancelCurrent.current === retire) cancelCurrent.current = null;
    };
  }, [attempt]);

  function retry() {
    // Retire immediately, before React schedules the replacement effect.
    cancelCurrent.current?.();
    setState('checking');
    setAttempt(value => value + 1);
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <header style={{ borderBottom: `1px solid ${gold}22`, padding: '1.25rem 1.5rem' }}>
        <nav aria-label="Public navigation" style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <span style={{ color: gold, minHeight: 44, display: 'inline-flex', alignItems: 'center', fontFamily: 'Cinzel, serif', fontSize: 12 }}>SOCIETY OF EXPLORERS</span>
          <a href="/explore" style={{ color: parchment, minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>Explore the community</a>
        </nav>
      </header>
      <main style={{ maxWidth: 700, minHeight: '55vh', margin: '0 auto', padding: '5rem 1.5rem' }}>
        <p style={{ fontFamily: 'Cinzel, serif', fontSize: 10, letterSpacing: '0.3em', color: gold }}>THE GUIDES</p>
        <h1 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 'clamp(26px, 5vw, 36px)', fontWeight: 400 }}>Guide leaderboard</h1>
        <section aria-label="Leaderboard availability" style={{ padding: '1.5rem', border: `1px solid ${gold}33`, background: '#0d0d0d' }}>
          <p role="status" aria-live="polite" aria-atomic="true" style={{ marginTop: 0, fontSize: 20 }}>{messages[state]}</p>
          <p style={{ color: muted, fontSize: 17, lineHeight: 1.6 }}>Profiles shared in the directory do not authorize publishing member activity or earnings. Rankings are paused while a separate sharing choice is defined.</p>
          <button type="button" onClick={retry} aria-label="Retry leaderboard availability" style={{ minHeight: 44, padding: '0.65rem 1rem', background: gold, color: '#0a0a0a', border: 0, cursor: 'pointer', fontSize: 14 }}>Check again</button>
        </section>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem', marginTop: '1.5rem' }}>
          <a href="/explore" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', color: gold }}>Find a community</a>
          <a href="/members" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', color: gold }}>Browse published profiles</a>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
