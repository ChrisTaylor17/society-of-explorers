'use client';
import { useState, useEffect } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

const gold = '#c9a84c';
const parchment = '#E8DCC8';
const muted = '#9a8f7a';

interface FrequencyVector {
  focus: number;
  coherence: number;
  engagement: number;
  exploration: number;
  magnitude: number;
}

interface Match {
  memberId: string;
  displayName: string;
  similarity: number;
  vector: FrequencyVector;
  tags: string[];
}

const DIM_LABELS: { key: keyof FrequencyVector; label: string; color: string }[] = [
  { key: 'focus', label: 'Focus', color: '#c9a84c' },
  { key: 'coherence', label: 'Coherence', color: '#7B68EE' },
  { key: 'engagement', label: 'Engagement', color: '#DC143C' },
  { key: 'exploration', label: 'Exploration', color: '#4169E1' },
];

function CoherenceBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.round(value * 100);
  return (
    <div style={{ marginBottom: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
        <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.12em', color: muted }}>{label.toUpperCase()}</span>
        <span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '11px', color: parchment }}>{pct}%</span>
      </div>
      <div style={{ height: '4px', background: `${gold}15`, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

export default function FrequencyMatchPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [callerVector, setCallerVector] = useState<FrequencyVector | null>(null);
  const [callerTags, setCallerTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    import('@/lib/auth/getSession').then(({ getMemberSession }) => {
      getMemberSession().then(session => {
        if (!session) {
          setError('Sign in to discover resonant explorers.');
          setLoading(false);
          return;
        }
        fetch(`/api/world/match?memberId=${session.member.id}`)
          .then(r => r.json())
          .then(data => {
            if (data.error) { setError(data.error); }
            else {
              setMatches(data.matches || []);
              setCallerVector(data.callerVector || null);
              setCallerTags(data.callerTags || []);
            }
            setLoading(false);
          })
          .catch(() => { setError('Failed to load matches.'); setLoading(false); });
      });
    });
  }, []);

  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) (e.target as HTMLElement).style.opacity = '1'; });
    }, { threshold: 0.1 });
    document.querySelectorAll('[data-fade]').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [loading]);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      {/* Hero */}
      <section style={{ textAlign: 'center', padding: '100px 2rem 2rem' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.5em', color: gold, opacity: 0.5, marginBottom: '1.5rem' }}>FREQUENCY MATCHING · WORLD LAYER</div>
        <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.8rem, 4.5vw, 3rem)', fontWeight: 300, letterSpacing: '0.08em', color: '#f5f0e8', marginBottom: '1rem' }}>
          Resonant Explorers
        </h1>
        <p style={{ fontSize: '1.1rem', color: muted, fontStyle: 'italic', maxWidth: '520px', margin: '0 auto 2.5rem', lineHeight: 1.8 }}>
          Find explorers whose frequency profile aligns with yours — across focus, coherence, engagement, and exploration.
        </p>
      </section>

      {/* Your profile */}
      {callerVector && (
        <section data-fade style={{ padding: '0 2rem 3rem', opacity: 0, transition: 'opacity 0.8s ease' }}>
          <div style={{ maxWidth: '480px', margin: '0 auto', border: `1px solid ${gold}22`, background: '#0d0d0d', padding: '1.5rem 2rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, opacity: 0.6, marginBottom: '1rem' }}>YOUR FREQUENCY PROFILE</div>
            {DIM_LABELS.map(d => (
              <CoherenceBar key={d.key} label={d.label} value={callerVector[d.key]} color={d.color} />
            ))}
            {callerTags.length > 0 && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '1rem' }}>
                {callerTags.map(tag => (
                  <span key={tag} style={{ padding: '3px 10px', fontSize: '10px', fontFamily: 'Cinzel, serif', letterSpacing: '0.08em', color: gold, border: `1px solid ${gold}33`, background: `${gold}08` }}>{tag}</span>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Matches */}
      <section data-fade style={{ padding: '0 2rem 4rem', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: muted, fontStyle: 'italic' }}>Scanning frequencies...</div>
          ) : error ? (
            <div style={{ textAlign: 'center', padding: '3rem' }}>
              <p style={{ color: muted, fontStyle: 'italic', marginBottom: '1rem' }}>{error}</p>
              <a href="/join" style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, textDecoration: 'none' }}>Join the Society →</a>
            </div>
          ) : matches.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: muted, fontStyle: 'italic' }}>
              No resonant explorers found yet. As more members opt in, your matches will appear.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1px', background: `${gold}12` }}>
              {matches.map((m, i) => (
                <div key={m.memberId} style={{ background: '#0d0d0d', padding: '1.5rem 2rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <div>
                      <div style={{ fontFamily: 'Cinzel, serif', fontSize: '13px', letterSpacing: '0.06em', color: '#f5f0e8', marginBottom: '2px' }}>{m.displayName}</div>
                      <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.15em', color: muted }}>MATCH #{i + 1}</div>
                    </div>
                    <div style={{ fontFamily: 'Cinzel, serif', fontSize: '20px', color: gold, opacity: 0.8, lineHeight: 1 }}>
                      {Math.round(m.similarity * 100)}%
                    </div>
                  </div>

                  {DIM_LABELS.map(d => (
                    <CoherenceBar key={d.key} label={d.label} value={m.vector[d.key]} color={d.color} />
                  ))}

                  {m.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                      {m.tags.map(tag => (
                        <span key={tag} style={{ padding: '2px 8px', fontSize: '9px', fontFamily: 'Cinzel, serif', letterSpacing: '0.06em', color: muted, border: `1px solid ${gold}22` }}>{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* How it works */}
      <section data-fade style={{ padding: '3rem 2rem 4rem', background: '#050505', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, opacity: 0.4, marginBottom: '2rem' }}>HOW FREQUENCY MATCHING WORKS</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.5rem' }}>
            {[
              { icon: '🧠', title: 'Measure', desc: 'EEG alpha/theta ratio captures focused calm' },
              { icon: '💓', title: 'Cohere', desc: 'HRV 0.1 Hz power measures autonomic harmony' },
              { icon: '📐', title: 'Vectorise', desc: 'Four dimensions normalised into a profile' },
              { icon: '🔮', title: 'Match', desc: 'Cosine similarity finds resonant explorers' },
            ].map(step => (
              <div key={step.title}>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{step.icon}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: gold, marginBottom: '0.35rem' }}>{step.title.toUpperCase()}</div>
                <p style={{ fontSize: '13px', color: muted, lineHeight: 1.6 }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
