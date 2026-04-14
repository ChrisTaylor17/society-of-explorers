'use client';
import { useEffect, useRef, useState } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

const THINKER_NAMES: Record<string, string> = {
  socrates: 'Socrates', plato: 'Plato', aurelius: 'Marcus Aurelius',
  nietzsche: 'Nietzsche', einstein: 'Einstein', jobs: 'Steve Jobs',
};
const THINKER_COLORS: Record<string, string> = {
  socrates: '#C9A94E', plato: '#7B68EE', aurelius: '#8B7355',
  nietzsche: '#DC143C', einstein: '#4169E1', jobs: '#A0A0A0',
};
const THINKER_AVATARS: Record<string, string> = {
  socrates: 'SO', plato: 'PL', aurelius: 'MA',
  nietzsche: 'FN', einstein: 'AE', jobs: 'SJ',
};

const RANK_COLORS = ['#c9a84c', '#C0C0C0', '#CD7F32'];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function FeedPage() {
  const [feed, setFeed] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showCTA, setShowCTA] = useState(false);
  const knownIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/feed/pulse');
        const data = await res.json();
        (data.recentResponses || []).forEach((r: any) => knownIds.current.add(r.id));
        setFeed(data);
      } catch {}
      setLoading(false);
    }
    load();

    const iv = setInterval(async () => {
      try {
        const res = await fetch('/api/feed/pulse');
        const data = await res.json();
        setFeed(data);
      } catch {}
    }, 15000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setShowCTA(true), 3000);
    return () => clearTimeout(t);
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <PublicNav />
        <span style={{ color: muted, fontFamily: 'Cinzel, serif', fontSize: '11px' }}>LOADING...</span>
      </div>
    );
  }

  const todayQuestion = feed?.todayQuestion;
  const responses: any[] = feed?.recentResponses || [];
  const stats = feed?.stats || { totalMembers: 0, totalResponses: 0, activeThinkers: 0, todayCount: 0 };
  const leaders: any[] = feed?.streakLeaders || [];

  const qThinkerId = todayQuestion?.thinker_id || '';
  const qThinkerColor = THINKER_COLORS[qThinkerId] || gold;
  const qThinkerName = THINKER_NAMES[qThinkerId] || qThinkerId;
  const qThinkerAvatar = THINKER_AVATARS[qThinkerId] || '??';

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif', paddingBottom: '80px' }}>
      <PublicNav />

      {/* HERO */}
      <section style={{ padding: '7rem 2rem 2rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '1.25rem' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: gold, animation: 'pulse 2s infinite' }} />
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold }}>LIVE FEED</span>
          </div>

          {todayQuestion ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '1rem' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: `${qThinkerColor}18`, border: `1.5px solid ${qThinkerColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel, serif', fontSize: '9px', color: qThinkerColor }}>{qThinkerAvatar}</div>
                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: qThinkerColor }}>{qThinkerName.toUpperCase()} ASKS:</span>
              </div>
              <h1 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 'clamp(22px, 4vw, 30px)', fontWeight: 400, fontStyle: 'italic', lineHeight: 1.4, color: parchment, margin: 0 }}>
                &ldquo;{todayQuestion.question_text}&rdquo;
              </h1>
              <p style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: muted, marginTop: '1.25rem' }}>
                {stats.todayCount} EXPLORER{stats.todayCount !== 1 ? 'S' : ''} ANSWERED TODAY
              </p>
            </>
          ) : (
            <p style={{ fontSize: '16px', color: muted }}>Today&apos;s question is being generated.</p>
          )}
        </div>
      </section>

      {/* STATS */}
      <section style={{ padding: '1rem 2rem 2rem' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1px', background: `${gold}15` }}>
          {[
            { label: 'EXPLORERS', value: stats.totalMembers },
            { label: 'REFLECTIONS', value: stats.totalResponses },
            { label: 'ACTIVE STREAKS', value: stats.activeThinkers },
            { label: 'TODAY', value: stats.todayCount },
          ].map(s => (
            <div key={s.label} style={{ background: '#0d0d0d', padding: '1.1rem 0.5rem', textAlign: 'center' }}>
              <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '26px', color: gold, lineHeight: 1.1 }}>{(s.value || 0).toLocaleString()}</div>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.12em', color: muted, marginTop: '4px' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* STREAK LEADERS */}
      {leaders.length > 0 && (
        <section style={{ padding: '1rem 2rem 2rem' }}>
          <div style={{ maxWidth: '640px', margin: '0 auto' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, marginBottom: '0.75rem' }}>STREAK LEADERS</div>
            <div style={{ background: '#0d0d0d', border: `1px solid ${gold}15` }}>
              {leaders.map((l: any, i: number) => (
                <div key={`${l.display_name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderBottom: i < leaders.length - 1 ? `1px solid ${gold}08` : 'none' }}>
                  <span style={{ fontFamily: 'Playfair Display, serif', fontSize: i < 3 ? '18px' : '14px', color: RANK_COLORS[i] || muted, width: '22px', textAlign: 'center' }}>{i + 1}</span>
                  <span style={{ flex: 1, fontSize: '15px', color: parchment }}>{l.display_name}</span>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', color: gold }}>{l.current_streak}d</span>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', color: muted }}>{l.total_responses || 0} total</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* RESPONSE STREAM */}
      <section style={{ padding: '1rem 2rem 2rem' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, marginBottom: '0.75rem' }}>RESPONSE STREAM</div>

          {responses.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', border: `1px dashed ${gold}22` }}>
              <p style={{ fontSize: '15px', color: muted, fontStyle: 'italic', marginBottom: '0.5rem' }}>No reflections yet today.</p>
              <a href="/practice" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: gold, textDecoration: 'none', border: `1px solid ${gold}44`, padding: '10px 20px', display: 'inline-block', marginTop: '0.75rem' }}>BE THE FIRST</a>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {responses.map((r: any) => {
                const tColor = THINKER_COLORS[r.thinker_id] || gold;
                const tName = THINKER_NAMES[r.thinker_id] || r.thinker_id || 'Question';
                const isNew = !knownIds.current.has(r.id);
                if (isNew) knownIds.current.add(r.id);
                return (
                  <div key={r.id} style={{
                    background: '#0d0d0d', borderLeft: `3px solid ${tColor}`,
                    border: `1px solid ${gold}10`, padding: '0.9rem 1rem',
                    animation: isNew ? 'fadeIn 0.6s ease' : undefined,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '13px', color: gold }}>{r.display_name}</span>
                        <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.15em', color: tColor }}>&middot; {tName.toUpperCase()}</span>
                      </div>
                      <span style={{ fontSize: '11px', color: muted }}>{timeAgo(r.created_at)}</span>
                    </div>
                    {r.question_text && (
                      <p style={{ fontSize: '12px', color: `${muted}cc`, fontStyle: 'italic', margin: 0, marginBottom: '6px', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        &ldquo;{r.question_text}&rdquo;
                      </p>
                    )}
                    <p style={{
                      fontSize: '15px', color: parchment, lineHeight: 1.6, margin: 0,
                      display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>{r.response_text}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <PublicFooter />

      {/* Sticky bottom CTA */}
      <a
        href="/practice"
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 150,
          padding: '14px 20px', background: gold, color: '#0a0a0a',
          fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em',
          textDecoration: 'none', textAlign: 'center',
          transform: showCTA ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.5s ease',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.4)',
        }}
      >JOIN THE CONVERSATION &rarr;</a>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
