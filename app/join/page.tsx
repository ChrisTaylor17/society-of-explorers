'use client';
import { useState, useEffect } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

const gold = '#c9a84c';
const parchment = '#E8DCC8';
const muted = '#9a8f7a';

const TIERS = [
  {
    id: 'explorer', name: 'Explorer', price: 'Free', period: '', badge: null, featured: false,
    cta: 'Start Exploring', ctaAction: 'oauth' as const,
    features: [
      '3 Socrates demo exchanges',
      'Browse the Great Books catalog',
      'Read TwiddleTwattle threads',
      'Public world layer access',
    ],
  },
  {
    id: 'seeker', name: 'Seeker', price: '$19', period: '/mo', badge: null, featured: false,
    cta: 'Begin Your Journey', ctaAction: 'checkout' as const,
    features: [
      'All 6 AI thinkers — unlimited',
      'Voice mode conversations',
      'Full Great Books reading program',
      'TwiddleTwattle post & collaborate',
      'Online salon access',
      '1× $EXP earning rate',
    ],
  },
  {
    id: 'scholar', name: 'Scholar', price: '$49', period: '/mo', badge: 'MOST POPULAR', featured: true,
    cta: 'Join the Salon', ctaAction: 'checkout' as const,
    features: [
      'Everything in Seeker',
      'Physical access — 92B South St, Boston',
      'Monthly salon evenings',
      'AI frequency matchmaking',
      'Book salon hosting rights',
      '2× $EXP earning rate',
    ],
  },
  {
    id: 'philosopher', name: 'Philosopher', price: '$99', period: '/mo', badge: 'LIMITED', featured: false,
    cta: 'Claim Your Seat', ctaAction: 'checkout' as const,
    features: [
      'Everything in Scholar',
      'Commons governance rights',
      'Founding dinner invitation',
      '4× $EXP earning rate',
      'TribeKey priority access',
      'Private oracle — dedicated thinker thread',
    ],
  },
];

const FAQS = [
  {
    q: 'Is this a philosophy class?',
    a: 'No. It\'s a community. There are no grades, no prerequisites, and no lectures. We read together, think together, and build together. The AI thinkers are companions — not professors.',
  },
  {
    q: 'Do I need to be in Boston?',
    a: 'Not at all. Explorer and Seeker are fully digital — AI thinkers, Great Books, TwiddleTwattle, and online salons work from anywhere. Scholar and Philosopher include physical access to our Boston space for those who want in-person evenings.',
  },
  {
    q: 'What are AI thinkers?',
    a: 'Six philosophical minds — Socrates, Plato, Nietzsche, Marcus Aurelius, Einstein, and Steve Jobs — each trained on deep source material. They remember you across sessions, respond in character, and push back on your ideas. Seekers and above get unlimited access to all six.',
  },
  {
    q: 'What is $EXP?',
    a: '$EXP is a soulbound reputation token. You earn it by participating — reading, discussing, scanning spaces, attending salons. It cannot be bought, sold, or transferred. Higher tiers earn $EXP at a multiplied rate. Burn it for premium features like extended AI sessions and governance weight.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Seeker, Scholar, and Philosopher are month-to-month with no commitment. Cancel from your account settings and your access continues through the end of the billing period.',
  },
];

export default function JoinPage() {
  const [interestName, setInterestName] = useState('');
  const [interestEmail, setInterestEmail] = useState('');
  const [interestWhy, setInterestWhy] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) (e.target as HTMLElement).style.opacity = '1'; });
    }, { threshold: 0.1 });
    document.querySelectorAll('[data-fade]').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  // Scroll to tier if hash present
  useEffect(() => {
    if (window.location.hash) {
      const el = document.getElementById(window.location.hash.slice(1));
      if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
    }
  }, []);

  async function handleCheckout(tier: string) {
    setCheckoutLoading(tier);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setCheckoutLoading(null);
    }
  }

  function handleExplorerSignup() {
    window.location.href = '/auth/callback?provider=google';
  }

  async function submitInterest(e: React.FormEvent) {
    e.preventDefault();
    if (!interestName || !interestEmail) return;
    setSubmitting(true);
    try {
      await fetch('/api/founding-interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: interestName, email: interestEmail, why: interestWhy }),
      });
    } catch {}
    setSubmitted(true);
    setSubmitting(false);
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      {/* ═══ HERO ═══ */}
      <section style={{ textAlign: 'center', padding: '100px 2rem 4rem' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.5em', color: gold, opacity: 0.6, marginBottom: '1.5rem' }}>MEMBERSHIP</div>
        <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 400, letterSpacing: '0.02em', color: '#f5f0e8', marginBottom: '1rem' }}>
          Choose Your Path
        </h1>
        <p style={{ fontSize: '1.15rem', color: muted, fontStyle: 'italic', maxWidth: '480px', margin: '0 auto', lineHeight: 1.8 }}>
          Every explorer starts somewhere. Pick the depth that fits your life right now.
        </p>
      </section>

      {/* ═══ TIER CARDS ═══ */}
      <section data-fade style={{ padding: '0 2rem 5rem', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '1060px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '1px', background: `${gold}10` }}>
          {TIERS.map(t => (
            <div
              key={t.id}
              id={t.id}
              style={{
                background: t.featured ? `${gold}06` : '#0d0d0d',
                padding: '2.5rem 1.75rem',
                position: 'relative',
                display: 'flex', flexDirection: 'column',
                borderTop: t.featured ? `2px solid ${gold}` : 'none',
              }}
            >
              {t.badge && (
                <div style={{
                  position: 'absolute', top: t.featured ? '-1px' : '0', right: '1rem',
                  fontFamily: 'Cinzel, serif', fontSize: '6px', letterSpacing: '0.18em',
                  color: '#0a0a0a', background: gold, padding: '4px 10px',
                }}>{t.badge}</div>
              )}

              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.12em', color: gold, marginBottom: '0.5rem' }}>{t.name.toUpperCase()}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '1.75rem' }}>
                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '2.5rem', color: '#f5f0e8' }}>{t.price}</span>
                {t.period && <span style={{ fontSize: '14px', color: muted }}>{t.period}</span>}
              </div>

              <div style={{ flex: 1, marginBottom: '1.75rem' }}>
                {t.features.map((f, i) => (
                  <div key={i} style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.6rem', alignItems: 'flex-start' }}>
                    <span style={{ color: gold, opacity: 0.4, marginTop: '5px', fontSize: '6px', flexShrink: 0 }}>⬡</span>
                    <span style={{ fontSize: '14px', color: `${parchment}bb`, lineHeight: 1.5 }}>{f}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => t.ctaAction === 'oauth' ? handleExplorerSignup() : handleCheckout(t.id)}
                disabled={checkoutLoading === t.id}
                style={{
                  display: 'block', width: '100%', textAlign: 'center',
                  fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em',
                  color: t.featured ? '#0a0a0a' : gold,
                  background: t.featured ? gold : 'transparent',
                  border: t.featured ? 'none' : `1px solid ${gold}44`,
                  padding: '13px', cursor: 'pointer',
                  opacity: checkoutLoading === t.id ? 0.5 : 1,
                  transition: 'opacity 0.2s',
                }}
              >
                {checkoutLoading === t.id ? 'REDIRECTING...' : t.cta.toUpperCase()}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ FOUNDING DINNER FORM ═══ */}
      <section data-fade style={{ padding: '5rem 2rem', background: '#0d0d0d', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '560px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, opacity: 0.5, marginBottom: '1rem' }}>THE FOUNDING DINNER</div>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.4rem, 3vw, 2rem)', fontWeight: 400, letterSpacing: '0.02em', color: '#f5f0e8', marginBottom: '1rem' }}>
            Reserve Your Seat at 92B South St
          </h2>
          <p style={{ fontSize: '1rem', color: muted, lineHeight: 1.8, marginBottom: '2rem', maxWidth: '440px', margin: '0 auto 2rem' }}>
            Ten founding members. One dinner. If you know you belong here, leave your name.
          </p>

          {submitted ? (
            <div style={{ padding: '2rem', border: `1px solid ${gold}33`, background: `${gold}05` }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, marginBottom: '0.5rem' }}>YOUR SEAT IS NOTED</div>
              <p style={{ fontSize: '14px', color: muted, fontStyle: 'italic' }}>We will be in touch directly.</p>
            </div>
          ) : (
            <form onSubmit={submitInterest} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', textAlign: 'left' }}>
              <input
                value={interestName} onChange={e => setInterestName(e.target.value)} required
                placeholder="Your name"
                style={{ background: '#111', border: `1px solid ${gold}22`, padding: '11px 14px', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: parchment, outline: 'none', width: '100%', boxSizing: 'border-box' }}
              />
              <input
                type="email" value={interestEmail} onChange={e => setInterestEmail(e.target.value)} required
                placeholder="your@email.com"
                style={{ background: '#111', border: `1px solid ${gold}22`, padding: '11px 14px', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: parchment, outline: 'none', width: '100%', boxSizing: 'border-box' }}
              />
              <textarea
                value={interestWhy} onChange={e => setInterestWhy(e.target.value)} rows={3}
                placeholder="Why are you an explorer? (optional)"
                style={{ background: '#111', border: `1px solid ${gold}22`, padding: '11px 14px', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: parchment, outline: 'none', resize: 'vertical', width: '100%', boxSizing: 'border-box' }}
              />
              <button type="submit" disabled={submitting} style={{
                fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.25em',
                color: '#0a0a0a', background: submitting ? `${gold}88` : gold,
                border: 'none', padding: '13px', cursor: 'pointer',
              }}>
                {submitting ? 'NOTING YOUR SEAT...' : 'RESERVE MY SEAT'}
              </button>
              <p style={{ fontSize: '11px', color: muted, fontStyle: 'italic', textAlign: 'center', opacity: 0.5 }}>This does not obligate you to purchase.</p>
            </form>
          )}
        </div>
      </section>

      {/* ═══ FAQ ═══ */}
      <section data-fade style={{ padding: '5rem 2rem', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, opacity: 0.5, marginBottom: '0.75rem' }}>QUESTIONS</div>
            <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.4rem, 3vw, 2rem)', fontWeight: 400, letterSpacing: '0.02em', color: '#f5f0e8' }}>Frequently Asked</h2>
          </div>
          <div>
            {FAQS.map((faq, i) => (
              <div key={i} style={{ borderBottom: i < FAQS.length - 1 ? `1px solid ${gold}12` : 'none' }}>
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  style={{
                    width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
                    padding: '1.25rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}
                >
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.06em', color: '#f5f0e8' }}>{faq.q}</span>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '16px', color: gold, opacity: 0.5, flexShrink: 0, marginLeft: '1rem', transform: openFaq === i ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s' }}>+</span>
                </button>
                {openFaq === i && (
                  <div style={{ paddingBottom: '1.25rem' }}>
                    <p style={{ fontSize: '14px', color: muted, lineHeight: 1.8 }}>{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CONTACT ═══ */}
      <section style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ fontSize: '13px', color: muted, opacity: 0.5 }}>Questions? Email <span style={{ color: gold }}>chris@societyofexplorers.com</span></p>
      </section>

      <PublicFooter />
    </div>
  );
}
