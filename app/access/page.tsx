'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

const gold = '#C5A55A';
const parchment = '#E8DCC8';
const muted = '#9a8f7a';

interface SafeData {
  conversations: number; highlights: number; waddles: number;
  artifacts: number; exp: number; booksStarted: number; booksCompleted: number;
}

const TIERS = [
  {
    name: 'OPEN', subtitle: 'Free Access', icon: '○', locked: false,
    features: [
      'Homepage Socrates taste',
      'Great Books library (read-only)',
      'Public Waddle feed',
      'Labyrinth walk',
      'Temple Quest game',
    ],
  },
  {
    name: 'LOCKED', subtitle: 'Member — $10+/mo', icon: '⬡', locked: true,
    features: [
      'Full thinker conversations',
      'Voice mode with distinct voices',
      'Great Books annotations + progress',
      'Private Waddle creation',
      'Book Salon participation',
      'Hub task management',
      '$EXP earning',
    ],
  },
  {
    name: 'SEALED', subtitle: 'Patron — $100+/mo', icon: '◆', locked: true,
    features: [
      'Everything in LOCKED',
      'Private ritual rooms',
      'Founding dinner invitations',
      'Governance voting',
      'Priority artifact generation',
      'Direct oracle consultations',
      'Physical space at 92B South St',
    ],
  },
];

export default function AccessPage() {
  const supabase = createClient();
  const [memberId, setMemberId] = useState<string | null>(null);
  const [memberName, setMemberName] = useState('');
  const [safeData, setSafeData] = useState<SafeData | null>(null);
  const [loadingSafe, setLoadingSafe] = useState(false);

  useEffect(() => {
    import('@/lib/auth/getSession').then(({ getMemberSession }) => {
      getMemberSession().then(s => {
        if (s?.member) {
          setMemberId(s.member.id);
          setMemberName(s.member.display_name || 'Explorer');
          setLoadingSafe(true);
          fetch(`/api/safe?memberId=${s.member.id}`)
            .then(r => r.json())
            .then(d => { setSafeData(d); setLoadingSafe(false); })
            .catch(() => setLoadingSafe(false));
        }
      });
    });
  }, []);

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/access` },
    });
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to bottom, #000, transparent)' }}>
        <a href="/salon" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, textDecoration: 'none', opacity: 0.7 }}>← RETURN TO THE SALON</a>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5 }}>SOCIETY OF EXPLORERS</div>
      </nav>

      {/* Header */}
      <div style={{ textAlign: 'center', padding: '80px 2rem 40px' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.5em', color: gold, opacity: 0.5, marginBottom: '1.5rem' }}>ACCESS + SOVEREIGNTY</div>
        <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 300, letterSpacing: '0.15em', marginBottom: '1rem' }}>
          LOCK & SAFE
        </h1>
        <p style={{ fontSize: '1.1rem', color: muted, fontStyle: 'italic', maxWidth: '500px', margin: '0 auto', lineHeight: 1.8 }}>
          Your key to the inner temple. Your vault for everything you create.
        </p>
      </div>

      {/* Section 1: THE LOCK */}
      <section style={{ padding: '4rem 2rem', maxWidth: '1000px', margin: '0 auto' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem', textAlign: 'center' }}>I.</div>
        <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '3rem', textAlign: 'center', borderBottom: `1px solid ${gold}22`, paddingBottom: '1rem' }}>
          THE LOCK
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1px', background: `${gold}12` }}>
          {TIERS.map(tier => (
            <div key={tier.name} style={{ background: '#0d0d0d', padding: '2.5rem 2rem', display: 'flex', flexDirection: 'column' }}>
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '2.5rem', color: gold, opacity: tier.locked ? 0.3 : 0.7, marginBottom: '0.75rem' }}>{tier.icon}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.2em', color: gold }}>{tier.name}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: muted, marginTop: '0.25rem' }}>{tier.subtitle}</div>
              </div>
              <div style={{ flex: 1 }}>
                {tier.features.map((f, i) => (
                  <div key={i} style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.5rem', alignItems: 'flex-start' }}>
                    <div style={{ color: gold, opacity: 0.4, marginTop: '3px', fontSize: '7px', flexShrink: 0 }}>⬡</div>
                    <div style={{ fontSize: '0.9rem', color: `${parchment}bb`, lineHeight: 1.5 }}>{f}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <a href="/join" style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: '#000', background: gold, padding: '12px 30px', textDecoration: 'none', display: 'inline-block' }}>
            UPGRADE YOUR ACCESS →
          </a>
        </div>
      </section>

      {/* Section 2: THE SAFE */}
      <section style={{ padding: '4rem 2rem', background: '#050505' }}>
        <div style={{ maxWidth: '700px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem', textAlign: 'center' }}>II.</div>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '0.5rem', textAlign: 'center', borderBottom: `1px solid ${gold}22`, paddingBottom: '1rem' }}>
            YOUR SAFE
          </h2>
          <p style={{ fontSize: '1rem', color: muted, fontStyle: 'italic', textAlign: 'center', marginBottom: '2rem' }}>
            Everything you create is yours.
          </p>

          {!memberId ? (
            <div style={{ textAlign: 'center', padding: '3rem', border: `1px solid ${gold}22`, background: '#0d0d0d' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '1.5rem', color: gold, opacity: 0.2, marginBottom: '1rem' }}>⬡</div>
              <p style={{ fontSize: '1rem', color: muted, marginBottom: '1.5rem' }}>Sign in to view your Safe</p>
              <button onClick={signInWithGoogle} style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: '#000', background: gold, border: 'none', padding: '10px 24px', cursor: 'pointer' }}>
                SIGN IN WITH GOOGLE
              </button>
            </div>
          ) : loadingSafe ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: muted, fontStyle: 'italic' }}>Opening your Safe...</div>
          ) : safeData ? (
            <div style={{ border: `1px solid ${gold}22`, background: '#0d0d0d' }}>
              <div style={{ padding: '1.5rem 2rem', borderBottom: `1px solid ${gold}11` }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold }}>{memberName.toUpperCase()}&apos;S SAFE</div>
              </div>
              {[
                { icon: 'Σ', label: 'Thinker Conversations', value: safeData.conversations },
                { icon: '◈', label: 'Great Books Highlights', value: safeData.highlights },
                { icon: '◎', label: 'Waddles Recorded', value: safeData.waddles },
                { icon: '⬡', label: 'Artifacts Created', value: safeData.artifacts },
                { icon: '◆', label: '$EXP Earned', value: safeData.exp },
                { icon: '◇', label: 'Books Started', value: safeData.booksStarted },
                { icon: '✓', label: 'Books Completed', value: safeData.booksCompleted },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 2rem', borderBottom: `1px solid ${gold}08` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', color: gold, opacity: 0.3, width: '20px', textAlign: 'center' }}>{item.icon}</span>
                    <span style={{ fontSize: '0.95rem', color: `${parchment}bb` }}>{item.label}</span>
                  </div>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', color: gold }}>{item.value}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {/* Section 2.5: LEARNING LEDGER */}
      {safeData && (
        <section style={{ padding: '4rem 2rem', maxWidth: '700px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem', textAlign: 'center' }}>LEARNING LEDGER</div>
          <div style={{ border: `1px solid ${gold}22`, background: '#0d0d0d', padding: '2rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1px', background: `${gold}11`, marginBottom: '1.5rem' }}>
              {[
                { label: 'EXP FROM READING', value: safeData.exp },
                { label: 'BOOKS STARTED', value: safeData.booksStarted },
                { label: 'BOOKS COMPLETED', value: safeData.booksCompleted },
              ].map(item => (
                <div key={item.label} style={{ background: '#0a0a0a', padding: '1.25rem', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '20px', color: gold, marginBottom: '0.5rem' }}>{item.value}</div>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.15em', color: muted }}>{item.label}</div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: '0.95rem', color: muted, lineHeight: 1.7, fontStyle: 'italic', textAlign: 'center' }}>
              Your learning is recorded. When ETH ID launches, this history becomes part of your sovereign identity on-chain.
            </p>
          </div>
        </section>
      )}

      {/* Section 3: DATA SOVEREIGNTY */}
      <section style={{ padding: '4rem 2rem', maxWidth: '700px', margin: '0 auto' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem', textAlign: 'center' }}>III.</div>
        <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '2rem', textAlign: 'center', borderBottom: `1px solid ${gold}22`, paddingBottom: '1rem' }}>
          DATA SOVEREIGNTY
        </h2>
        <p style={{ fontSize: '1.15rem', lineHeight: 1.9, textAlign: 'center', marginBottom: '2rem' }}>
          Your data lives in your Safe. It is encrypted, portable, and yours. No platform can access it without your permission. This is the Living Archive — the beginning of sovereign data.
        </p>
        <div style={{ textAlign: 'center' }}>
          <a href="/data-layer" style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, textDecoration: 'none', border: `1px solid ${gold}44`, padding: '10px 24px', display: 'inline-block' }}>
            READ THE FULL DATA LAYER VISION →
          </a>
        </div>
      </section>

      <footer style={{ padding: '3rem 2rem', borderTop: `1px solid ${gold}22`, textAlign: 'center' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, opacity: 0.4 }}>SOCIETY OF EXPLORERS · LOCK & SAFE</div>
      </footer>
    </div>
  );
}
