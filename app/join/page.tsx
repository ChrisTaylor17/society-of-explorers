'use client';
import { useState, useEffect } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { createClient } from '@/lib/supabase/client';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

// TODO: Replace with actual Stripe Price IDs from dashboard
const SEEKER_PRICE = process.env.NEXT_PUBLIC_STRIPE_PRICE_SEEKER || 'seeker';
const PHILOSOPHER_PRICE = process.env.NEXT_PUBLIC_STRIPE_PRICE_PHILOSOPHER || 'philosopher';
const ORACLE_PRICE = 'oracle'; // One-time payment — needs separate Stripe product

const TIERS = [
  {
    id: 'explorer', name: 'Explorer', price: 'Free', period: '', badge: null, featured: false,
    cta: 'START FREE', ctaAction: 'oauth' as const,
    tagline: 'Begin your journey',
    features: [
      '3 Council questions per day',
      'Browse the Constellation',
      'Read verdict cards',
      'No salon access',
    ],
  },
  {
    id: 'seeker', name: 'Seeker', price: '$19', period: '/mo', badge: 'MOST POPULAR', featured: true,
    cta: 'BECOME A SEEKER', ctaAction: 'checkout' as const,
    tagline: 'Find your people',
    features: [
      'Unlimited Council access',
      'Join a 7-week salon',
      'Earn $EXP tokens',
      'Voice conversations with thinkers',
      'Activity feed access',
    ],
    note: 'Covers our infrastructure costs',
  },
  {
    id: 'philosopher', name: 'Philosopher', price: '$49', period: '/mo', badge: null, featured: false,
    cta: 'BECOME A PHILOSOPHER', ctaAction: 'checkout' as const,
    tagline: 'Lead the way',
    features: [
      'Everything in Seeker',
      'Priority salon placement',
      'Guide candidacy — lead your own salon',
      '$EXP treasury when you become a Guide',
      'Advanced memory — thinkers remember everything',
    ],
  },
  {
    id: 'oracle', name: 'Oracle', price: '$499', period: ' lifetime', badge: 'FOUNDING', featured: false,
    cta: 'BECOME AN ORACLE', ctaAction: 'checkout' as const,
    tagline: 'Founding member',
    features: [
      'Everything in Philosopher, forever',
      'Founding member status',
      'Direct line to all 6 thinkers',
      'Governance votes (HATS)',
      'Name on the founders wall at 92B South St',
    ],
  },
];

const FAQS = [
  { q: 'What is a salon?', a: 'A 7-week program with 7 people. You meet 5 days a week, rotating through three tracks: Singularity & AI, Blockchain & Data Sovereignty, and The Secret & Consciousness. Every member leads sessions. Graduates become Guides with their own salon.' },
  { q: 'What are AI thinkers?', a: 'Six historical minds — Socrates, Plato, Marcus Aurelius, Nietzsche, Einstein, and Steve Jobs — reimagined as modern advisors. They debate your questions in Council Mode, remember your journey across sessions, and can create tasks, award $EXP, and take real actions on your behalf.' },
  { q: 'What is $EXP?', a: '$EXP is a non-transferable reputation token earned by participating. Attend sessions, lead discussions, complete tasks, receive awards from thinkers. It\'s proof of intellectual contribution, not a speculative asset.' },
  { q: 'Can I cancel anytime?', a: 'Yes. Monthly memberships can be cancelled at any time. Oracle (lifetime) is a one-time purchase.' },
  { q: 'What if I\'m not in Boston?', a: 'Digital salons are available for all members. Video sessions run on Daily.co. The full Council Mode and thinker experience works from anywhere.' },
];

export default function JoinPage() {
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) (e.target as HTMLElement).style.opacity = '1'; });
    }, { threshold: 0.1 });
    document.querySelectorAll('[data-fade]').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (window.location.hash) {
      const el = document.getElementById(window.location.hash.slice(1));
      if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
    }
  }, []);

  async function handleCheckout(tier: string) {
    if (tier === 'explorer') { window.location.href = '/login'; return; }
    setCheckoutLoading(tier);
    try {
      let email: string | undefined;
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        email = user?.email ?? undefined;
      } catch {}

      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, email }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {}
    setCheckoutLoading(null);
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      {/* Hero */}
      <section style={{ padding: '8rem 2rem 3rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1.5rem' }}>JOIN THE SOCIETY</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(28px, 5vw, 40px)', fontWeight: 400, fontStyle: 'italic', color: parchment, marginBottom: '1rem' }}>
            Where AI meets philosophy meets you.
          </h1>
          <p style={{ fontSize: '16px', color: ivory85, lineHeight: 1.7, maxWidth: '520px', margin: '0 auto' }}>
            Six thinkers. Seven-week salons. A Council that remembers your journey.
          </p>
        </div>
      </section>

      {/* Pricing Grid */}
      <section data-fade style={{ padding: '0 2rem 4rem', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1px', background: `${gold}10` }}>
          {TIERS.map(t => (
            <div key={t.id} id={t.id} style={{
              background: '#0d0d0d', padding: '2rem 1.5rem', position: 'relative',
              border: t.featured ? `2px solid ${gold}` : `1px solid rgba(201,168,76,0.15)`,
              display: 'flex', flexDirection: 'column',
            }}>
              {t.badge && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: t.featured ? '2px' : 'auto', background: t.featured ? gold : 'transparent' }}>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.15em', color: gold, display: 'block', textAlign: 'center', padding: '4px 0' }}>{t.badge}</span>
                </div>
              )}
              <div style={{ marginTop: t.badge ? '20px' : '0' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.12em', color: gold, marginBottom: '4px' }}>{t.name.toUpperCase()}</div>
                <div style={{ fontSize: '14px', color: muted, marginBottom: '0.75rem' }}>{t.tagline}</div>
                <div style={{ marginBottom: '1.25rem' }}>
                  <span style={{ fontFamily: 'Playfair Display, serif', fontSize: '36px', color: parchment }}>{t.price}</span>
                  {t.period && <span style={{ fontSize: '14px', color: muted }}>{t.period}</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, marginBottom: '1.5rem' }}>
                  {t.features.map(f => (
                    <div key={f} style={{ fontSize: '13px', color: muted, lineHeight: 1.5, paddingLeft: '12px', position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 0, color: `${gold}66` }}>&middot;</span>
                      {f}
                    </div>
                  ))}
                </div>
                {(t as any).note && <div style={{ fontSize: '11px', color: `${gold}88`, fontStyle: 'italic', marginBottom: '0.75rem' }}>{(t as any).note}</div>}
                <button
                  onClick={() => t.ctaAction === 'oauth' ? (window.location.href = '/login') : handleCheckout(t.id)}
                  disabled={checkoutLoading === t.id}
                  style={{
                    fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em',
                    color: '#0a0a0a', background: gold, border: 'none', height: '44px',
                    cursor: 'pointer', borderRadius: 0, width: '100%',
                    opacity: checkoutLoading === t.id ? 0.5 : 1,
                  }}
                >
                  {checkoutLoading === t.id ? 'REDIRECTING...' : t.cta}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section data-fade style={{ padding: '2rem 2rem 4rem', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, marginBottom: '1.5rem', textAlign: 'center' }}>FREQUENTLY ASKED</div>
          {FAQS.map((faq, i) => (
            <div key={i} style={{ borderBottom: `1px solid ${gold}08` }}>
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)} style={{
                width: '100%', background: 'none', border: 'none', padding: '16px 0',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
              }}>
                <span style={{ fontSize: '16px', color: parchment, textAlign: 'left', fontFamily: 'Cormorant Garamond, serif' }}>{faq.q}</span>
                <span style={{ color: gold, fontSize: '18px', flexShrink: 0, marginLeft: '12px' }}>{openFaq === i ? '-' : '+'}</span>
              </button>
              {openFaq === i && <p style={{ fontSize: '14px', color: muted, lineHeight: 1.7, padding: '0 0 16px' }}>{faq.a}</p>}
            </div>
          ))}
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
