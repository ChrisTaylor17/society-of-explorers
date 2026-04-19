'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { getMemberSession } from '@/lib/auth/getSession';
import { createClient } from '@/lib/supabase/client';

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
const THINKER_SYMBOLS: Record<string, string> = {
  socrates: '\u03A3', plato: '\u03A0', aurelius: 'M',
  nietzsche: 'N', einstein: 'E', jobs: 'J',
};

const CATEGORY_ORDER: string[] = [
  'identity', 'goal', 'challenge', 'value', 'emotional_pattern',
  'relationship', 'commitment', 'milestone', 'preference',
];
const CATEGORY_LABELS: Record<string, string> = {
  identity: 'IDENTITY',
  goal: 'GOALS',
  challenge: 'CHALLENGES',
  value: 'VALUES',
  emotional_pattern: 'PATTERNS',
  relationship: 'CONNECTIONS',
  commitment: 'COMMITMENTS',
  milestone: 'MILESTONES',
  preference: 'PREFERENCES',
};

const SOURCE_LABELS: Record<string, string> = {
  practice: 'PRACTICE',
  salon: 'SALON',
  council: 'COUNCIL',
};

function relativeDay(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins}m ago`;
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(diff / 86400000);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'last week';
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 60) return 'last month';
  return `${Math.floor(days / 30)} months ago`;
}

function formatKey(key: string): string {
  return key.replace(/_/g, ' ');
}

function truncate(s: string, max: number): string {
  if (!s) return '';
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '\u2026' : s;
}

export default function InsightsPage() {
  const [loading, setLoading] = useState(true);
  const [unauthenticated, setUnauthenticated] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const session = await getMemberSession();
        if (!session?.member) { setUnauthenticated(true); setLoading(false); return; }

        let authToken: string | null = null;
        try {
          const supabase = createClient();
          const { data: { session: auth } } = await supabase.auth.getSession();
          authToken = auth?.access_token || null;
        } catch {}

        const res = await fetch('/api/insights', {
          headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {},
        });
        if (res.status === 401) { setUnauthenticated(true); setLoading(false); return; }
        if (!res.ok) { setError('Could not load insights.'); setLoading(false); return; }
        const json = await res.json();
        setData(json);
      } catch (err: any) {
        setError(err?.message || 'Network error');
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <PublicNav />
        <span style={{ color: muted, fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.25em' }}>LOADING\u2026</span>
      </div>
    );
  }

  if (unauthenticated) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
        <PublicNav />
        <main style={{ maxWidth: '520px', margin: '0 auto', padding: '10rem 2rem 6rem', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1.25rem' }}>INSIGHTS</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(26px, 4vw, 34px)', fontStyle: 'italic', fontWeight: 400, color: parchment, lineHeight: 1.25, marginBottom: '1rem' }}>
            This is your private wisdom profile.
          </h1>
          <p style={{ fontSize: '16px', color: ivory85, lineHeight: 1.7, marginBottom: '2rem' }}>
            Sign in to see what the thinkers know about you &mdash; facts they&rsquo;ve learned from your answers, and every conversation that shaped them.
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/login" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, padding: '0 28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '48px' }}>SIGN IN</a>
            <a href="/join" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: gold, border: `1px solid ${gold}`, padding: '0 24px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '48px' }}>JOIN FREE</a>
          </div>
        </main>
        <PublicFooter />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
        <PublicNav />
        <main style={{ padding: '10rem 2rem', textAlign: 'center' }}>
          <p style={{ fontSize: '15px', color: muted }}>{error}</p>
        </main>
        <PublicFooter />
      </div>
    );
  }

  const facts: any[] = data?.semanticFacts || [];
  const threads: any[] = data?.threads || [];
  const displayName = data?.member?.display_name || 'Explorer';

  const factsByCategory: Record<string, any[]> = {};
  for (const f of facts) {
    if (!factsByCategory[f.category]) factsByCategory[f.category] = [];
    factsByCategory[f.category].push(f);
  }
  const orderedCategories = CATEGORY_ORDER.filter(c => factsByCategory[c]?.length > 0);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      {/* HERO */}
      <section style={{ padding: '7rem 2rem 2rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1.25rem' }}>
            SOCIETY OF EXPLORERS
          </div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(30px, 5.5vw, 44px)', fontWeight: 400, fontStyle: 'italic', lineHeight: 1.15, color: parchment, marginBottom: '1rem' }}>
            What the Thinkers Know About You
          </h1>
          <p style={{ fontSize: '16px', color: ivory85, lineHeight: 1.7, maxWidth: '560px', margin: '0 auto 1.75rem' }}>
            {displayName}, this is your living wisdom profile.
          </p>
          <div style={{ width: '60px', height: '1px', background: `${gold}66`, margin: '0 auto 1.25rem' }} />
          <p style={{ fontSize: '14px', color: muted, fontStyle: 'italic', lineHeight: 1.7, maxWidth: '520px', margin: '0 auto' }}>
            The more you share, the more the AIs remember &mdash; and the wiser their guidance becomes.
          </p>
        </div>
      </section>

      {/* SECTION 1 — SEMANTIC FACTS */}
      <section style={{ padding: '3rem 2rem 2rem' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, textAlign: 'center', marginBottom: '2.25rem' }}>
            WHAT WE&rsquo;VE LEARNED
          </div>

          {orderedCategories.length === 0 ? (
            <div style={{ padding: '1.75rem', textAlign: 'center', border: `1px dashed ${gold}22` }}>
              <p style={{ fontSize: '15px', color: parchment, fontStyle: 'italic', margin: 0, marginBottom: '0.5rem' }}>
                Nothing learned yet.
              </p>
              <p style={{ fontSize: '13px', color: muted, margin: 0, marginBottom: '1.25rem' }}>
                Answer today&rsquo;s question to start building your wisdom profile.
              </p>
              <a href="/practice" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: gold, border: `1px solid ${gold}44`, padding: '10px 22px', textDecoration: 'none', display: 'inline-block' }}>
                TODAY&rsquo;S QUESTION &rarr;
              </a>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2.25rem' }}>
              {orderedCategories.map(cat => {
                const items = factsByCategory[cat];
                return (
                  <div key={cat}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.9rem' }}>
                      <span style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold }}>
                        {CATEGORY_LABELS[cat] || cat.toUpperCase()}
                      </span>
                      <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: `${muted}aa` }}>
                        {items.length}
                      </span>
                      <span style={{ flex: 1, height: '1px', background: `${gold}1a` }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {items.map(f => {
                        const tid = f.thinker_id as string | null;
                        const tColor = tid ? (THINKER_COLORS[tid] || gold) : gold;
                        const tSymbol = tid ? (THINKER_SYMBOLS[tid] || '\u25C8') : '\u25C8';
                        const tName = tid ? (THINKER_NAMES[tid] || tid) : null;
                        const confPct = Math.round((f.confidence || 0) * 100);
                        return (
                          <div key={f.id} className="fact-card" style={{
                            background: '#0d0d0d',
                            border: `1px solid ${gold}12`,
                            borderLeft: `2px solid ${tColor}55`,
                            padding: '14px 16px',
                            display: 'flex',
                            gap: '14px',
                            alignItems: 'flex-start',
                            transition: 'border-color 0.25s, background 0.25s',
                          }}>
                            {/* Thinker avatar */}
                            <div style={{
                              width: '34px', height: '34px', flexShrink: 0, borderRadius: '50%',
                              border: `1px solid ${tColor}55`, background: `${tColor}10`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontFamily: 'Cinzel, serif', fontSize: '14px', color: tColor,
                              lineHeight: 1,
                            }} title={tName || 'Distilled from the council'}>
                              {tSymbol}
                            </div>

                            {/* Body */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', marginBottom: '4px', flexWrap: 'wrap' }}>
                                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.18em', color: gold }}>
                                  {formatKey(f.key).toUpperCase()}
                                </span>
                                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.12em', color: `${muted}bb` }}>
                                  {relativeDay(f.created_at)}
                                </span>
                              </div>
                              <p style={{ fontSize: '15px', color: parchment, lineHeight: 1.6, margin: '0 0 10px 0' }}>
                                {f.value}
                              </p>

                              {/* Confidence bar */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ flex: 1, height: '2px', background: `${gold}18`, position: 'relative', maxWidth: '200px' }}>
                                  <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${confPct}%`, background: gold, opacity: 0.75 }} />
                                </div>
                                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: muted }}>
                                  {confPct}%
                                </span>
                                <span className="fact-hover-note" style={{
                                  fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.15em',
                                  color: gold, opacity: 0, transition: 'opacity 0.25s',
                                }}>
                                  ACTIVE IN TODAY&rsquo;S REFLECTIONS
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* SECTION 2 — WISDOM THREADS */}
      <section style={{ padding: '3rem 2rem 2rem' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, textAlign: 'center', marginBottom: '2.25rem' }}>
            WISDOM THREADS
          </div>

          {threads.length === 0 ? (
            <div style={{ padding: '1.75rem', textAlign: 'center', border: `1px dashed ${gold}22` }}>
              <p style={{ fontSize: '15px', color: muted, fontStyle: 'italic', margin: 0 }}>
                No threads yet. Every answer and reflection becomes a thread here.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {threads.map((t, i) => {
                const tColor = THINKER_COLORS[t.thinker_id] || gold;
                const tName = THINKER_NAMES[t.thinker_id] || t.thinker_id || 'Thinker';
                const tSymbol = THINKER_SYMBOLS[t.thinker_id] || '\u00B7';
                const sourceLabel = SOURCE_LABELS[t.source] || (t.source ? t.source.toUpperCase() : 'EXCHANGE');

                return (
                  <div key={t.session_id || `thread-${i}`} className="thread-card" style={{
                    background: '#0d0d0d',
                    border: `1px solid ${gold}14`,
                    padding: '1.4rem 1.25rem',
                    transition: 'border-color 0.25s, background 0.25s',
                  }}>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem', flexWrap: 'wrap' }}>
                      <div style={{
                        width: '30px', height: '30px', flexShrink: 0, borderRadius: '50%',
                        border: `1px solid ${tColor}66`, background: `${tColor}15`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'Cinzel, serif', fontSize: '13px', color: tColor, lineHeight: 1,
                      }}>{tSymbol}</div>
                      <span style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: tColor }}>
                        {tName.toUpperCase()}
                      </span>
                      <span style={{
                        fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.2em',
                        color: gold, border: `1px solid ${gold}55`, padding: '3px 8px',
                      }}>{sourceLabel}</span>
                      <span style={{ flex: 1 }} />
                      <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.12em', color: muted }}>
                        {relativeDay(t.created_at)}
                      </span>
                    </div>

                    {/* Answer */}
                    {t.user && (
                      <div style={{ marginBottom: t.assistant ? '1rem' : 0 }}>
                        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.2em', color: `${muted}cc`, marginBottom: '5px' }}>
                          YOU
                        </div>
                        <p style={{ fontSize: '15px', color: parchment, lineHeight: 1.65, margin: 0 }}>
                          {truncate(t.user.content, 260)}
                        </p>
                      </div>
                    )}

                    {/* Reflection */}
                    {t.assistant && (
                      <div style={{ paddingTop: t.user ? '0.85rem' : 0, borderTop: t.user ? `1px solid ${gold}1a` : 'none' }}>
                        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.2em', color: `${tColor}cc`, marginBottom: '5px' }}>
                          {tName.toUpperCase()}
                        </div>
                        <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', fontStyle: 'italic', color: ivory85, lineHeight: 1.8, margin: 0 }}>
                          {t.assistant.content}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* DATA VALUE FOOTNOTE */}
      <section style={{ padding: '3rem 2rem 5rem' }}>
        <div style={{ maxWidth: '560px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ width: '60px', height: '1px', background: `${gold}4d`, margin: '0 auto 1.75rem' }} />
          <p style={{ fontSize: '14px', color: muted, fontStyle: 'italic', lineHeight: 1.8, margin: 0 }}>
            Every answer you give strengthens this profile.
            <br />
            In time, this living memory will power deeper guidance, matched conversations, and &mdash; one day &mdash; a marketplace for your wisdom.
          </p>
          <div style={{ marginTop: '1.5rem' }}>
            <Link href="/manifesto" style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.25em', color: gold, textDecoration: 'none', opacity: 0.7 }}>
              READ THE MANIFESTO &rarr;
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />

      <style>{`
        .fact-card:hover {
          border-color: ${gold}33;
          background: #101010;
        }
        .fact-card:hover .fact-hover-note { opacity: 1; }
        .thread-card:hover {
          border-color: ${gold}33;
          background: #101010;
        }
      `}</style>
    </div>
  );
}
