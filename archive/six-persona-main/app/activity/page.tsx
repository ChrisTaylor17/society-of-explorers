'use client';
import { useState, useEffect } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
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
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/feed?limit=50').then(r => r.json()).then(d => setEvents(d.events || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />
      <section style={{ padding: '8rem 2rem 2rem', textAlign: 'center' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1rem' }}>ACTIVITY</div>
        <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 400, color: parchment }}>What's happening</h1>
      </section>

      <section style={{ padding: '0 2rem 4rem' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          {loading && <p style={{ textAlign: 'center', color: muted }}>Loading...</p>}
          {!loading && events.length === 0 && <p style={{ textAlign: 'center', color: muted, fontStyle: 'italic' }}>No activity yet. Ask the Council something.</p>}
          {events.map(ev => (
            <div key={ev.id} style={{ display: 'flex', gap: '12px', padding: '12px 0', borderBottom: `1px solid ${gold}08` }}>
              <span style={{ fontSize: '16px', width: '28px', textAlign: 'center', flexShrink: 0 }}>{ICONS[ev.event_type] || '\u2022'}</span>
              <div style={{ flex: 1 }}>
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
