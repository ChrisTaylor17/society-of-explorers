'use client';
import { useState, useEffect } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import Link from 'next/link';
import { parsePublicActivityReply, type PublicActivity } from '@/lib/feed/publicActivity';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const muted = '#9a8f7a';

const ICONS: Record<string, string> = {
  task_created: '\u2713', task_completed: '\u2705', exp_awarded: '\ud83c\udf96',
  artifact_minted: '\ud83c\udfd9', ritual_logged: '\ud83d\udd25', project_created: '\ud83d\udcca',
  room_started: '\ud83d\udcf9', member_joined: '\ud83d\udc64', verdict_shared: '\ud83d\udccb',
  thinker_insight: '\ud83d\udca1',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function ActivityPage() {
  const [events, setEvents] = useState<PublicActivity[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => { controller.abort(); if (active) setStatus('error'); }, 10_000);
    fetch('/api/feed?limit=50', { cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Activity unavailable');
        const current = parsePublicActivityReply(await response.json());
        if (!current) throw new Error('Activity unavailable');
        if (active && !controller.signal.aborted) { setEvents(current); setStatus('ready'); }
      }).catch(() => { if (active) { setEvents([]); setStatus('error'); } }).finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [attempt]);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />
      <section style={{ padding: '8rem 2rem 2rem', textAlign: 'center' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1rem' }}>ACTIVITY</div>
        <h1 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 400, color: parchment }}>What&apos;s happening</h1>
      </section>

      <section style={{ padding: '0 2rem 4rem' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          {status === 'loading' && <p role="status" style={{ textAlign: 'center', color: muted }}>Loading published activity…</p>}
          {status === 'error' && <div style={{ textAlign: 'center' }}><p role="status">Published activity could not be loaded.</p><button type="button" onClick={() => { setStatus('loading'); setAttempt(value => value + 1); }}>Try again</button></div>}
          {status === 'ready' && events.length === 0 && <p style={{ textAlign: 'center', color: muted }}>No published activity is available yet. <Link href="/circles">Explore the Circles</Link>.</p>}
          {events.map(ev => (
            <div key={ev.id} style={{ display: 'flex', gap: '12px', padding: '12px 0', borderBottom: `1px solid ${gold}08` }}>
              <span style={{ fontSize: '16px', width: '28px', textAlign: 'center', flexShrink: 0 }}>{ICONS[ev.event_type] || '\u2022'}</span>
              <div style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
                <p style={{ fontSize: '15px', color: parchment, margin: 0, lineHeight: 1.5 }}>{ev.title}</p>
                {ev.description && <p style={{ fontSize: '13px', color: muted, margin: '2px 0 0', lineHeight: 1.5 }}>{ev.description}</p>}
              </div>
              <span style={{ fontSize: '11px', color: muted, flexShrink: 0, marginTop: '2px' }}>{timeAgo(ev.created_at)}</span>
            </div>
          ))}
        </div>
      </section>
      <PublicFooter />
    </div>
  );
}
