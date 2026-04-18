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
const THINKER_SYMBOLS: Record<string, string> = {
  socrates: '\u03A3', plato: '\u03A0', aurelius: 'M',
  nietzsche: 'N', einstein: 'E', jobs: 'J',
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

function truncate(s: string, max: number): string {
  if (!s) return '';
  return s.length > max ? s.slice(0, max - 1) + '\u2026' : s;
}

interface FeedResponse {
  id: string;
  response_text: string;
  created_at: string;
  display_name: string;
  current_streak: number;
  thinker_id: string | null;
  question_text: string | null;
  reflection_text: string | null;
  reflection_created_at: string | null;
}

export default function FeedPage() {
  const [feed, setFeed] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showCTA, setShowCTA] = useState(false);
  const [active, setActive] = useState<FeedResponse | null>(null);
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

  // Close modal on Escape
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setActive(null); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [active]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <PublicNav />
        <span style={{ color: muted, fontFamily: 'Cinzel, serif', fontSize: '11px' }}>LOADING...</span>
      </div>
    );
  }

  const todayQuestion = feed?.todayQuestion;
  const responses: FeedResponse[] = feed?.recentResponses || [];
  const wisdomMoments: FeedResponse[] = feed?.wisdomMoments || [];
  const stats = feed?.stats || { totalMembers: 0, totalResponses: 0, activeThinkers: 0, todayCount: 0 };
  const leaders: any[] = feed?.streakLeaders || [];

  const qThinkerId = todayQuestion?.thinker_id || '';
  const qThinkerColor = THINKER_COLORS[qThinkerId] || gold;
  const qThinkerName = THINKER_NAMES[qThinkerId] || qThinkerId;
  const qThinkerAvatar = THINKER_AVATARS[qThinkerId] || '??';

  function renderWisdomCard(r: FeedResponse, variant: 'feature' | 'stream') {
    const tColor = THINKER_COLORS[r.thinker_id || ''] || gold;
    const tName = THINKER_NAMES[r.thinker_id || ''] || r.thinker_id || 'Question';
    const tAvatar = THINKER_AVATARS[r.thinker_id || ''] || '??';
    const featured = variant === 'feature';
    const isNew = !knownIds.current.has(r.id);
    if (isNew) knownIds.current.add(r.id);

    return (
      <button
        key={r.id}
        onClick={() => setActive(r)}
        style={{
          display: 'block', width: '100%', textAlign: 'left',
          background: '#0d0d0d',
          borderLeft: `3px solid ${tColor}`,
          border: `1px solid ${gold}10`, borderLeftWidth: '3px',
          padding: featured ? '1.25rem' : '1rem 1.1rem',
          cursor: 'pointer',
          color: 'inherit', fontFamily: 'inherit',
          animation: isNew ? 'fadeIn 0.6s ease' : undefined,
          transition: 'border-color 0.2s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = `${gold}33`; e.currentTarget.style.borderLeftColor = tColor; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = `${gold}10`; e.currentTarget.style.borderLeftColor = tColor; }}
      >
        {/* Thinker asked row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
          <div style={{
            width: '22px', height: '22px', borderRadius: '50%',
            background: `${tColor}18`, border: `1.5px solid ${tColor}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Cinzel, serif', fontSize: '8px', color: tColor, flexShrink: 0,
          }}>{tAvatar}</div>
          <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.18em', color: tColor }}>
            {tName.toUpperCase()} ASKED
          </span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: '10px', color: muted }}>{timeAgo(r.created_at)}</span>
        </div>

        {/* Question excerpt */}
        {r.question_text && (
          <p style={{
            fontSize: '12px', color: `${muted}cc`, fontStyle: 'italic', margin: 0, marginBottom: '0.6rem',
            lineHeight: 1.5,
            display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            &ldquo;{r.question_text}&rdquo;
          </p>
        )}

        {/* Member answer row */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '0.4rem' }}>
          <span style={{ fontSize: '13px', color: gold }}>{r.display_name}</span>
          {r.current_streak >= 3 && (
            <span style={{
              fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.15em',
              color: gold, border: `1px solid ${gold}44`, padding: '1px 5px',
            }}>{r.current_streak}d STREAK</span>
          )}
        </div>
        <p style={{
          fontSize: featured ? '15px' : '14px', color: parchment, lineHeight: 1.6, margin: 0,
          display: '-webkit-box', WebkitLineClamp: featured ? 3 : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {truncate(r.response_text, featured ? 280 : 180)}
        </p>

        {/* Reflects */}
        {r.reflection_text ? (
          <>
            <div style={{
              height: '1px', background: `${gold}33`,
              margin: featured ? '0.9rem 0' : '0.75rem 0',
            }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.4rem' }}>
              <span style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', color: tColor, opacity: 0.55, lineHeight: 1 }}>
                {THINKER_SYMBOLS[r.thinker_id || ''] || '\u00B7'}
              </span>
              <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.18em', color: `${tColor}cc` }}>
                {tName.toUpperCase()} REFLECTS
              </span>
            </div>
            <p style={{
              fontFamily: 'Cormorant Garamond, serif',
              fontSize: featured ? '15px' : '14px', fontStyle: 'italic',
              color: ivory85, lineHeight: 1.75, margin: 0,
            }}>
              {r.reflection_text}
            </p>
          </>
        ) : (
          <p style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.18em', color: `${muted}88`, marginTop: '0.6rem', marginBottom: 0 }}>
            {THINKER_SYMBOLS[r.thinker_id || ''] || '\u00B7'} &nbsp; REFLECTION PENDING
          </p>
        )}
      </button>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif', paddingBottom: '80px' }}>
      <PublicNav />

      {/* HERO */}
      <section style={{ padding: '7rem 2rem 2rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '1.25rem' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: gold, animation: 'pulse 2s infinite' }} />
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold }}>LIVE</span>
          </div>

          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(26px, 5vw, 38px)', fontWeight: 400, fontStyle: 'italic', lineHeight: 1.2, color: parchment, marginBottom: '0.75rem' }}>
            What explorers are thinking right now.
          </h1>
          <p style={{ fontSize: '15px', color: ivory85, lineHeight: 1.7, marginBottom: '2rem' }}>
            Every morning, a new question. Every answer, a reflection. These are today&rsquo;s wisdom moments.
          </p>

          {todayQuestion && (
            <div style={{ background: '#0d0d0d', border: `1px solid ${gold}22`, padding: '1.5rem', marginTop: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '0.75rem' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: `${qThinkerColor}18`, border: `1.5px solid ${qThinkerColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel, serif', fontSize: '8px', color: qThinkerColor }}>{qThinkerAvatar}</div>
                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: qThinkerColor }}>TODAY &middot; {qThinkerName.toUpperCase()}</span>
              </div>
              <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 'clamp(17px, 3vw, 22px)', fontWeight: 400, fontStyle: 'italic', lineHeight: 1.5, color: parchment, margin: 0 }}>
                &ldquo;{todayQuestion.question_text}&rdquo;
              </p>
              <p style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: muted, marginTop: '1rem' }}>
                {stats.todayCount} EXPLORER{stats.todayCount !== 1 ? 'S' : ''} ANSWERED TODAY
              </p>
            </div>
          )}
        </div>
      </section>

      {/* TODAY'S WISDOM MOMENTS */}
      {wisdomMoments.length > 0 && (
        <section style={{ padding: '2rem 2rem 1rem' }}>
          <div style={{ maxWidth: '640px', margin: '0 auto' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, marginBottom: '0.75rem', textAlign: 'center' }}>
              TODAY&rsquo;S WISDOM MOMENTS
            </div>
            <p style={{ fontSize: '13px', color: muted, fontStyle: 'italic', textAlign: 'center', marginBottom: '1rem' }}>
              Answer + reflection pairs, in the last few hours.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {wisdomMoments.map(r => renderWisdomCard(r, 'feature'))}
            </div>
          </div>
        </section>
      )}

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
              {responses.map(r => renderWisdomCard(r, 'stream'))}
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

      {/* Modal — full scripture panel */}
      {active && (() => {
        const tColor = THINKER_COLORS[active.thinker_id || ''] || gold;
        const tName = THINKER_NAMES[active.thinker_id || ''] || active.thinker_id || 'Question';
        const tAvatar = THINKER_AVATARS[active.thinker_id || ''] || '??';
        return (
          <div
            onClick={() => setActive(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 500,
              background: 'rgba(5,5,5,0.88)', backdropFilter: 'blur(6px)',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
              padding: '4rem 1.25rem', overflowY: 'auto',
              animation: 'fadeIn 0.25s ease',
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: '#0a0a0a', border: `1px solid ${gold}33`,
                maxWidth: '600px', width: '100%', padding: '2rem 1.5rem',
                position: 'relative',
              }}
            >
              {/* Close */}
              <button
                onClick={() => setActive(null)}
                aria-label="Close"
                style={{
                  position: 'absolute', top: '8px', right: '12px',
                  background: 'none', border: 'none', color: muted, fontSize: '22px',
                  cursor: 'pointer', lineHeight: 1,
                }}
              >{'\u00D7'}</button>

              {/* Asked row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.75rem' }}>
                <div style={{
                  width: '32px', height: '32px', borderRadius: '50%',
                  background: `${tColor}18`, border: `2px solid ${tColor}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'Cinzel, serif', fontSize: '10px', color: tColor,
                }}>{tAvatar}</div>
                <div>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: tColor }}>{tName.toUpperCase()} ASKED</div>
                  <div style={{ fontSize: '11px', color: muted }}>{timeAgo(active.created_at)}</div>
                </div>
              </div>

              {/* Question */}
              {active.question_text && (
                <p style={{
                  fontFamily: 'Cormorant Garamond, serif', fontSize: '18px',
                  fontStyle: 'italic', color: parchment, lineHeight: 1.55,
                  margin: '0 0 1.5rem',
                }}>
                  &ldquo;{active.question_text}&rdquo;
                </p>
              )}

              {/* Answer block */}
              <div style={{ background: '#111', border: `1px solid ${gold}15`, padding: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '0.5rem' }}>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold }}>
                    {active.display_name.toUpperCase()} ANSWERED
                  </span>
                  {active.current_streak >= 3 && (
                    <span style={{
                      fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.15em',
                      color: gold, border: `1px solid ${gold}44`, padding: '1px 5px',
                    }}>{active.current_streak}d STREAK</span>
                  )}
                </div>
                <p style={{ fontSize: '16px', color: parchment, lineHeight: 1.7, margin: 0 }}>
                  {active.response_text}
                </p>
              </div>

              {/* Reflection block — scripture panel */}
              {active.reflection_text ? (
                <div style={{
                  background: '#0a0a0a',
                  borderTop: `1px solid ${gold}`,
                  borderLeft: `1px solid ${gold}15`,
                  borderRight: `1px solid ${gold}15`,
                  borderBottom: `1px solid ${gold}15`,
                  padding: '1.5rem 1.25rem',
                }}>
                  <div style={{
                    fontFamily: 'Cinzel, serif', fontSize: '22px',
                    color: tColor, opacity: 0.45,
                    textAlign: 'center', marginBottom: '0.5rem', lineHeight: 1,
                  }}>
                    {THINKER_SYMBOLS[active.thinker_id || ''] || '\u00B7'}
                  </div>
                  <div style={{
                    fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em',
                    color: `${tColor}cc`, textAlign: 'center', marginBottom: '0.9rem',
                  }}>
                    {tName.toUpperCase()} REFLECTS
                  </div>
                  <p style={{
                    fontFamily: 'Cormorant Garamond, serif',
                    fontSize: '17px', fontStyle: 'italic',
                    color: parchment, lineHeight: 1.8, margin: 0,
                  }}>
                    {active.reflection_text}
                  </p>
                </div>
              ) : (
                <p style={{ fontSize: '13px', color: muted, fontStyle: 'italic', textAlign: 'center' }}>
                  Reflection pending.
                </p>
              )}

              {/* Footer CTA */}
              <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                <a href="/practice" style={{
                  fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold,
                  border: `1px solid ${gold}44`, padding: '10px 22px',
                  textDecoration: 'none', display: 'inline-block',
                }}>ANSWER TODAY&rsquo;S QUESTION &rarr;</a>
              </div>
            </div>
          </div>
        );
      })()}

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
