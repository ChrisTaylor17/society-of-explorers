'use client';
import { useState } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

const gold = '#c9a84c';
const parchment = '#E8DCC8';
const muted = '#9a8f7a';

const FOUNDING = 'https://buy.stripe.com/7sY7sE0Ic3lQ1wifXC9oc00';
const SALON = 'https://buy.stripe.com/00w9AM62w8Gaej49ze9oc01';
const DIGITAL = 'https://buy.stripe.com/9B6fZabmQ3lQ0sebHm9oc02';

const TIERS = [
  {
    name: 'EXPLORER', subtitle: 'Digital', price: '$9.99', period: '/mo', badge: null, link: DIGITAL, cta: 'Begin Your Initiation', featured: false,
    features: ['All 6 AI thinker agents — unlimited conversations', 'Full Great Books reading program', 'TwiddleTwattle access — post, collaborate, create', 'The Labyrinth — all rooms', 'Member directory and messaging', '$EXP reputation earning', 'Salon conversation history'],
  },
  {
    name: 'SALON', subtitle: 'Physical + Digital', price: '$99', period: '/mo', badge: 'MOST POPULAR', link: SALON, cta: 'Join the Salon', featured: true,
    features: ['Everything in Explorer', 'Physical access to 92B South St, Boston', 'Monthly salon evenings and workshops', 'Voice AI conversations with thinkers', 'AI matchmaking for deep connections', 'Event priority access', 'Higher $EXP earning multiplier'],
  },
  {
    name: 'FOUNDING MEMBER', subtitle: 'Lifetime', price: '$499', period: ' one-time', badge: 'LIMITED', link: FOUNDING, cta: 'Claim Your Founding Seat', featured: false,
    features: ['Everything in Salon, forever', 'Your name engraved at 92B South St and on the blockchain', 'Founding dinner with your TribeKey', 'Maximum $EXP earning multiplier', 'Governance rights — vote on the Society\u2019s future', 'Hardware priority for TribeKey + Crystal Hub (in development)'],
    note: '10 seats total. When they\u2019re gone, this tier closes permanently.',
  },
];

const FAQS = [
  { q: 'Can I cancel anytime?', a: 'Yes. Explorer and Salon are month-to-month with no commitment. Cancel from your account settings.' },
  { q: 'What are AI thinkers?', a: 'Six philosophical minds — Socrates, Plato, Nietzsche, Marcus Aurelius, Einstein, and Steve Jobs — trained on deep source material. They remember you across sessions and respond in character.' },
  { q: 'Do I need to know about crypto or blockchain?', a: 'No. The digital layer works invisibly. You earn reputation ($EXP) by participating — reading, discussing, creating. No wallets or tokens required to use the platform.' },
  { q: 'Where is the physical space?', a: '92B South St in downtown Boston. Salon members have access to the space for events, workshops, and co-working.' },
];

export default function JoinPage() {
  const [interestName, setInterestName] = useState('');
  const [interestEmail, setInterestEmail] = useState('');
  const [interestWhy, setInterestWhy] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  async function submitInterest(e: React.FormEvent) {
    e.preventDefault();
    if (!interestName || !interestEmail) return;
    setSubmitting(true);
    try { await fetch('/api/founding-interest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: interestName, email: interestEmail, why: interestWhy }) }); } catch {}
    setSubmitted(true); setSubmitting(false);
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      {/* HERO */}
      <section style={{ textAlign: 'center', padding: '100px 2rem 60px' }}>
        <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '1rem' }}>Join the Society</h1>
        <p style={{ fontSize: '1.1rem', color: muted, fontStyle: 'italic', maxWidth: '450px', margin: '0 auto' }}>Choose the path that fits your journey.</p>
      </section>

      {/* TIERS */}
      <section style={{ padding: '0 2rem 4rem' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1px', background: `${gold}12` }}>
          {TIERS.map(tier => (
            <div key={tier.name} style={{ background: tier.featured ? '#111' : '#0d0d0d', padding: '2.5rem 2rem', position: 'relative', borderTop: tier.featured ? `3px solid ${gold}` : `1px solid ${gold}11`, display: 'flex', flexDirection: 'column' }}>
              {tier.badge && (
                <div style={{ position: 'absolute', top: tier.featured ? '-1px' : '0', right: '1rem', fontFamily: 'Cinzel, serif', fontSize: '6px', letterSpacing: '0.15em', color: '#0a0a0a', background: gold, padding: '3px 10px' }}>{tier.badge}</div>
              )}
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: muted, marginBottom: '0.25rem' }}>{tier.subtitle.toUpperCase()}</div>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.15em', color: gold, marginBottom: '0.5rem' }}>{tier.name}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '2rem' }}>
                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '2.5rem', color: parchment }}>{tier.price}</span>
                <span style={{ fontSize: '13px', color: muted }}>{tier.period}</span>
              </div>
              <div style={{ flex: 1, marginBottom: '2rem' }}>
                {tier.features.map((f, i) => (
                  <div key={i} style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.5rem', alignItems: 'flex-start' }}>
                    <span style={{ color: gold, opacity: 0.4, marginTop: '4px', fontSize: '7px', flexShrink: 0 }}>⬡</span>
                    <span style={{ fontSize: '14px', color: `${parchment}bb`, lineHeight: 1.5 }}>{f}</span>
                  </div>
                ))}
              </div>
              {tier.note && (
                <p style={{ fontSize: '12px', color: muted, fontStyle: 'italic', marginBottom: '1rem', lineHeight: 1.6 }}>{tier.note}</p>
              )}
              <a href={tier.link} target="_blank" rel="noopener noreferrer" style={{
                display: 'block', textAlign: 'center', fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em',
                color: tier.featured ? '#000' : gold, background: tier.featured ? gold : 'transparent',
                border: tier.featured ? 'none' : `1px solid ${gold}44`, padding: '12px', textDecoration: 'none',
              }}>{tier.cta.toUpperCase()}</a>
            </div>
          ))}
        </div>
      </section>

      {/* FOUNDING DINNER FORM */}
      <section style={{ padding: '4rem 2rem', background: '#050505' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, opacity: 0.5, marginBottom: '1rem' }}>THE FOUNDING DINNER</div>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.3rem, 3vw, 2rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '1rem' }}>Reserve Your Seat at 92B South St</h2>
          <p style={{ fontSize: '1rem', color: muted, lineHeight: 1.8, marginBottom: '2rem', maxWidth: '480px', margin: '0 auto 2rem' }}>
            Ten founding members. One dinner. If you know you belong here, leave your name.
          </p>
          {submitted ? (
            <div style={{ padding: '2rem', border: `1px solid ${gold}33`, background: '#0a0800' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, marginBottom: '0.5rem' }}>YOUR SEAT IS NOTED</div>
              <p style={{ fontSize: '14px', color: muted, fontStyle: 'italic' }}>We will be in touch directly.</p>
            </div>
          ) : (
            <form onSubmit={submitInterest} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', textAlign: 'left' }}>
              <input value={interestName} onChange={e => setInterestName(e.target.value)} required placeholder="Your name"
                style={{ background: '#111', border: `1px solid ${gold}22`, padding: '10px 12px', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: parchment, outline: 'none', width: '100%', boxSizing: 'border-box' }} />
              <input type="email" value={interestEmail} onChange={e => setInterestEmail(e.target.value)} required placeholder="your@email.com"
                style={{ background: '#111', border: `1px solid ${gold}22`, padding: '10px 12px', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: parchment, outline: 'none', width: '100%', boxSizing: 'border-box' }} />
              <textarea value={interestWhy} onChange={e => setInterestWhy(e.target.value)} rows={3} placeholder="Why are you an explorer? (optional)"
                style={{ background: '#111', border: `1px solid ${gold}22`, padding: '10px 12px', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: parchment, outline: 'none', resize: 'vertical', width: '100%', boxSizing: 'border-box' }} />
              <button type="submit" disabled={submitting} style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.25em', color: '#000', background: submitting ? `${gold}88` : gold, border: 'none', padding: '12px', cursor: 'pointer' }}>
                {submitting ? 'NOTING YOUR SEAT...' : 'RESERVE MY SEAT'}
              </button>
              <p style={{ fontSize: '11px', color: muted, fontStyle: 'italic', textAlign: 'center', opacity: 0.6 }}>This does not obligate you to purchase.</p>
            </form>
          )}
        </div>
      </section>

      {/* FAQ */}
      <section style={{ padding: '4rem 2rem' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, opacity: 0.5, textAlign: 'center', marginBottom: '2rem' }}>FREQUENTLY ASKED</div>
          {FAQS.map((faq, i) => (
            <div key={i} style={{ borderBottom: `1px solid ${gold}11`, marginBottom: '0' }}>
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)} style={{
                width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '1.25rem 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
              }}>
                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.08em', color: parchment }}>{faq.q}</span>
                <span style={{ color: gold, fontSize: '14px', opacity: 0.5, flexShrink: 0, marginLeft: '1rem' }}>{openFaq === i ? '−' : '+'}</span>
              </button>
              {openFaq === i && (
                <p style={{ fontSize: '15px', color: muted, lineHeight: 1.8, paddingBottom: '1.25rem' }}>{faq.a}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Contact */}
      <section style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ fontSize: '13px', color: muted, opacity: 0.6 }}>Questions? Email <span style={{ color: gold }}>chris@societyofexplorers.com</span></p>
      </section>

      <PublicFooter />
    </div>
  );
}
