'use client';
import { useState, useEffect, use } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

const THINKER_COLORS: Record<string, string> = {
  Socrates: '#C9A94E', Plato: '#7B68EE', 'Marcus Aurelius': '#8B7355', Aurelius: '#8B7355',
  Nietzsche: '#DC143C', Einstein: '#4169E1', Jobs: '#A0A0A0', 'Steve Jobs': '#A0A0A0',
};

const POSITION_BADGES: Record<string, { label: string; color: string }> = {
  AGREE: { label: 'AGREES', color: '#4CAF50' },
  CHALLENGE: { label: 'CHALLENGES', color: '#DC143C' },
  REFRAME: { label: 'REFRAMES', color: '#7B68EE' },
  AMPLIFY: { label: 'AMPLIFIES', color: '#4169E1' },
};

interface Session {
  question: string;
  thinker_responses: { thinker: string; response: string; vote_position: string; one_liner: string }[];
  created_at: string;
}

export default function VerdictPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/council/verdict/${slug}`)
      .then(r => r.json())
      .then(d => { if (d.session) setSession(d.session); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><PublicNav /><span style={{ color: muted, fontFamily: 'Cinzel, serif', fontSize: '11px' }}>LOADING...</span></div>;
  if (!session) return <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem' }}><PublicNav /><span style={{ color: parchment, fontFamily: 'Cinzel, serif' }}>Verdict not found</span><a href="/council" style={{ color: gold, fontFamily: 'Cinzel, serif', fontSize: '10px', textDecoration: 'none' }}>START YOUR OWN SESSION</a></div>;

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      <section style={{ padding: '8rem 2rem 3rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '1.5rem' }}>COUNCIL VERDICT</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(24px, 5vw, 40px)', fontWeight: 400, fontStyle: 'italic', color: parchment, lineHeight: 1.3, marginBottom: '1rem' }}>
            &ldquo;{session.question}&rdquo;
          </h1>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '2rem' }}>
            {session.thinker_responses.map(r => {
              const badge = POSITION_BADGES[r.vote_position] || POSITION_BADGES.REFRAME;
              return (
                <span key={r.thinker} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '8px', fontFamily: 'Cinzel, serif', letterSpacing: '0.1em', color: badge.color, border: `1px solid ${badge.color}44`, padding: '3px 8px', borderRadius: '10px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: THINKER_COLORS[r.thinker] || gold }} />
                  {r.thinker.toUpperCase()} {badge.label}
                </span>
              );
            })}
          </div>
        </div>
      </section>

      <section style={{ padding: '0 2rem 4rem' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {session.thinker_responses.map(r => {
            const color = THINKER_COLORS[r.thinker] || gold;
            const badge = POSITION_BADGES[r.vote_position] || POSITION_BADGES.REFRAME;
            return (
              <div key={r.thinker} style={{ background: '#0d0d0d', border: `1px solid rgba(201,168,76,0.12)`, padding: '1.5rem 2rem', borderLeft: `3px solid ${color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.12em', color }}>{r.thinker.toUpperCase()}</span>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.1em', color: badge.color }}>{badge.label}</span>
                </div>
                <p style={{ fontSize: '16px', color: ivory85, lineHeight: 1.8, margin: 0 }}>{r.response}</p>
                {r.one_liner && <p style={{ fontSize: '13px', color: muted, marginTop: '0.5rem', fontStyle: 'italic' }}>{r.one_liner}</p>}
              </div>
            );
          })}
        </div>
      </section>

      <section style={{ padding: '2rem', textAlign: 'center' }}>
        <a href="/council" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, padding: '0 28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '48px', borderRadius: 0 }}>GET YOUR OWN COUNCIL VERDICT</a>
      </section>

      <PublicFooter />
    </div>
  );
}
