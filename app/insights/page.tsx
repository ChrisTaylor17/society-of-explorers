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
  emotional_pattern: 'EMOTIONAL PATTERNS',
  relationship: 'RELATIONSHIPS',
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
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 1) return 'earlier today';
  if (hrs < 12) return `${hrs}h ago`;
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'earlier today';
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
        <span style={{ color: muted, fontFamily: 'Cinzel, serif', fontSize: '11px' }}>LOADING\u2026</span>
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
            Sign in to see what the thinkers know about you — facts they&rsquo;ve learned from your answers, and every conversation that shaped them.
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

  // Group facts by category
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
      <section style={{ padding: '7rem 2rem 2.5rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '680px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1.25rem' }}>
            SOCIETY OF EXPLORERS
          </div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(30px, 5.5vw, 44px)', fontWeight: 400, fontStyle: 'italic', lineHeight: 1.15, color: parchment, marginBottom: '1rem' }}>
            What the Thinkers Know About You
          </h1>
          <p style={{ fontSize: '16px', color: ivory85, lineHeight: 1.7, maxWidth: '560px', margin: '0 auto' }}>
            {displayName}, this is your living wisdom profile. It grows with every answer.
          </p>
        </div>
      </section>

      {/* SECTION 1 — SEMANTIC FACTS */}
      <section style={{ padding: '1rem 2rem 2rem' }}>
        <div style={{ maxWidth: '680px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, textAlign: 'center', marginBottom: '2rem' }}>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              {orderedCategories.map(cat => {
                const items = factsByCategory[cat];
                return (
                  <div key={cat}>
                    <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, marginBottom: '0.75rem' }}>
                      {CATEGORY_LABELS[cat] || cat.toUpperCase()}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {items.map(f => (
                        <div key={f.id} style={{
                          background: '#0d0d0d', borderLeft: `2px solid ${gold}33`,
                          border: `1px solid ${gold}10`, borderLeftWidth: '2px',
                          padding: '10px 14px',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', marginBottom: '3px' }}>
                            <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold }}>
                              {formatKey(f.key).toUpperCase()}
                            </span>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', flexShrink: 0 }}>
                              <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: muted }}>
                                {Math.round((f.confidence || 0) * 100)}% CONFIDENCE
                              </span>
                              <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: `${muted}aa` }}>
                                {relativeDay(f.created_at)}
                              </span>
                            </div>
                          </div>
                          <p style={{ fontSize: '15px', color: parchment, lineHeight: 1.6, margin: 0 }}>
                            {f.value}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* SECTION 2 — WISDOM THREADS */}
      <section style={{ padding: '2rem 2rem 2rem' }}>
        <div style={{ maxWidth: '680px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, textAlign: 'center', marginBottom: '2rem' }}>
            WISDOM THREADS
          </div>

          {threads.length === 0 ? (
            <div style={{ padding: '1.75rem', textAlign: 'center', border: `1px dashed ${gold}22` }}>
              <p style={{ fontSize: '15px', color: muted, fontStyle: 'italic', margin: 0 }}>
                No threads yet. Every answer + reflection becomes a thread here.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {threads.map((t, i) => {
                const tColor = THINKER_COLORS[t.thinker_id] || gold;
                const tName = THINKER_NAMES[t.thinker_id] || t.thinker_id || 'Thinker';
                const tSymbol = THINKER_SYMBOLS[t.thinker_id] || '\u00B7';
                const sourceLabel = SOURCE_LABELS[t.source] || (t.source ? t.source.toUpperCase() : 'EXCHANGE');

                return (
                  <div key={t.session_id || `thread-${i}`} style={{
                    background: '#0d0d0d', border: `1px solid ${gold}12`,
                    padding: '1.25rem 1.1rem',
                  }}>
                    {/* Header row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.9rem', flexWrap: 'wrap' }}>
                      <span style={{
                        fontFamily: 'Cinzel, serif', fontSize: '16px',
                        color: tColor, opacity: 0.55, lineHeight: 1,
                      }}>{tSymbol}</span>
                      <span style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.18em', color: tColor }}>
                        {tName.toUpperCase()}
                      </span>
                      <span style={{
                        fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.15em',
                        color: muted, border: `1px solid ${muted}44`, padding: '2px 7px',
                      }}>{sourceLabel}</span>
                      <span style={{ flex: 1 }} />
                      <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.12em', color: muted }}>
                        {relativeDay(t.created_at)}
                      </span>
                    </div>

                    {/* Answer */}
                    {t.user && (
                      <div style={{ marginBottom: t.assistant ? '0.9rem' : 0 }}>
                        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.2em', color: `${muted}cc`, marginBottom: '4px' }}>
                          YOU
                        </div>
                        <p style={{ fontSize: '15px', color: parchment, lineHeight: 1.6, margin: 0 }}>
                          {t.user.content}
                        </p>
                      </div>
                    )}

                    {/* Reflection */}
                    {t.assistant && (
                      <div style={{ paddingTop: t.user ? '0.75rem' : 0, borderTop: t.user ? `1px solid ${gold}18` : 'none' }}>
                        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.2em', color: `${tColor}cc`, marginBottom: '4px' }}>
                          {tName.toUpperCase()}
                        </div>
                        <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', fontStyle: 'italic', color: ivory85, lineHeight: 1.75, margin: 0 }}>
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

      {/* FOOTNOTE */}
      <section style={{ padding: '2rem 2rem 5rem' }}>
        <div style={{ maxWidth: '560px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ width: '60px', height: '1px', background: `${gold}4d`, margin: '0 auto 1.5rem' }} />
          <p style={{ fontSize: '14px', color: muted, fontStyle: 'italic', lineHeight: 1.7, margin: 0 }}>
            This is your living wisdom profile. Every answer and reflection adds to it.
            This is the foundation of the personal data layer described in the{' '}
            <Link href="/manifesto" style={{ color: gold, textDecoration: 'none' }}>Manifesto</Link>.
          </p>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
