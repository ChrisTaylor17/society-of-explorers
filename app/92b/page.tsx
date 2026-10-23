'use client';
import { useState, useEffect } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { CAPITAL_CAMPAIGN_GOAL_DOLLARS, CAPITAL_USE_OF_FUNDS } from '@/lib/capital/campaign';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

const FEATURES = [
  { title: 'AI Salon', body: 'The proposed salon would offer private, member-controlled conversations with Great Thinker guides, with memory governed by explicit consent.' },
  { title: 'Great Books Library', body: 'A possible reading room for the works that shaped civilization, small seminars, and shared inquiry across generations.' },
  { title: 'Music Therapy Chamber', body: 'A possible room for consent-based sound and attention practices, designed around restoration rather than surveillance.' },
];

const STATUS_COLORS: Record<string, string> = {
  'UNDER REVIEW': '#FFA726',
  CONDITIONAL: '#9a8f7a',
  FUNDING: gold,
  FUTURE: muted,
};

const TIMELINE = [
  {
    title: 'Location path',
    desc: '92B South St is the intended first Boston node, subject to lease status, repairs, access, and landlord alignment.',
    status: 'UNDER REVIEW',
  },
  {
    title: 'Due diligence',
    desc: 'Legal, repair, insurance, access, and operating questions must be resolved before any physical commitment.',
    status: 'CONDITIONAL',
  },
  {
    title: 'Patronage campaign',
    desc: 'Patronage funds the work required to determine whether the physical-node path can become responsible and viable.',
    status: 'FUNDING',
  },
  {
    title: 'Buildout and opening',
    desc: 'Planning begins only if the location path becomes viable. No buildout or opening date is promised.',
    status: 'FUTURE',
  },
];

export default function NinetyTwoBPage() {
  const [city, setCity] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [why, setWhy] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) (e.target as HTMLElement).style.opacity = '1'; });
    }, { threshold: 0.1 });
    document.querySelectorAll('[data-fade]').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      document.querySelectorAll<HTMLElement>('[data-parallax]').forEach(el => {
        el.style.backgroundAttachment = 'scroll';
      });
    }
  }, []);

  async function handlePropose(e: React.FormEvent) {
    e.preventDefault();
    if (!city.trim() || !name.trim() || !email.trim()) return;
    setSubmitting(true);
    try {
      await fetch('/api/92b/propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: city.trim(), name: name.trim(), email: email.trim(), why: why.trim() }),
      });
      setSubmitted(true);
    } catch {}
    setSubmitting(false);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#111', border: `1px solid ${gold}22`, padding: '14px 16px',
    fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', color: parchment,
    outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      {/* ═══ HERO ═══ */}
      <section
        data-parallax
        style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '8rem 2rem 6rem', position: 'relative',
          backgroundImage: 'linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url("/images/hero-guild.jpeg")',
          backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed',
        }}
      >
        <div style={{ maxWidth: '720px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1.5rem' }}>92B SOUTH ST &middot; BOSTON</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(36px, 7vw, 56px)', fontWeight: 400, lineHeight: 1.15, marginBottom: '1.5rem', color: parchment }}>
            A possible first physical salon
          </h1>
          <p style={{ fontSize: '20px', color: ivory85, lineHeight: 1.8, maxWidth: '620px', margin: '0 auto 2.5rem' }}>
            A transparent proposal for a Boston room where philosophy, Great Books, music, and privacy-first AI could support real human connection.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/92b/fund" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, padding: '0 28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '48px', borderRadius: 0 }}>FUND THIS SPACE</a>
            <a href="#propose" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: gold, background: 'transparent', border: `1px solid ${gold}`, padding: '0 28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '48px', borderRadius: 0 }}>PROPOSE YOUR CITY</a>
          </div>
        </div>
      </section>

      {/* ═══ THE SPACE ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: '#0a0a0a', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '0.75rem' }}>THE SPACE</div>
            <p style={{ fontSize: '18px', color: ivory85, fontStyle: 'italic' }}>A working vision, not a secured location or active buildout.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1px', background: `${gold}10`, marginBottom: '1px' }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{ background: '#0d0d0d', padding: '2.5rem 2rem', border: `1px solid rgba(201,168,76,0.15)` }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.15em', color: gold, marginBottom: '1rem' }}>{f.title.toUpperCase()}</div>
                <p style={{ fontSize: '16px', color: muted, lineHeight: 1.8 }}>{f.body}</p>
              </div>
            ))}
          </div>
          <div style={{ background: '#0d0d0d', padding: '2.5rem 2rem', border: `1px solid rgba(201,168,76,0.15)` }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.15em', color: gold, marginBottom: '1rem' }}>COUNCIL MODE LOUNGE</div>
            <p style={{ fontSize: '16px', color: muted, lineHeight: 1.8, maxWidth: '640px' }}>The proposal includes a communal room for small groups to question multiple thinker guides together while keeping member identity and memory under clear consent.</p>
          </div>
        </div>
      </section>

      {/* ═══ TRANSPARENCY ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: '#0d0d0d', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '0.75rem' }}>FULL TRANSPARENCY</div>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 400, color: parchment, lineHeight: 1.3 }}>Here is exactly where the proposal stands.</h2>
          </div>
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: '3px', top: '8px', bottom: '8px', width: '1px', background: `${gold}22` }} />
            {TIMELINE.map((item, i) => (
              <div key={item.title} style={{ display: 'flex', gap: '1.5rem', marginBottom: i < TIMELINE.length - 1 ? '2.5rem' : '0', position: 'relative' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: STATUS_COLORS[item.status], flexShrink: 0, marginTop: '8px', position: 'relative', zIndex: 1 }} />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.35rem' }}>
                    <div style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', color: parchment, letterSpacing: '0.08em' }}>{item.title.toUpperCase()}</div>
                    <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.15em', color: STATUS_COLORS[item.status], opacity: 0.8 }}>{item.status}</span>
                  </div>
                  <p style={{ fontSize: '16px', color: muted, lineHeight: 1.8 }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ USE OF FUNDS ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: '#0a0a0a', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '0.75rem' }}>USE OF FUNDS</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {CAPITAL_USE_OF_FUNDS.map(f => {
              const pct = (f.amount / CAPITAL_CAMPAIGN_GOAL_DOLLARS) * 100;
              return (
              <div key={f.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '14px', color: parchment }}>{f.label}</span>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', color: gold }}>${f.amount.toLocaleString()}</span>
                </div>
                <div style={{ height: '6px', background: '#1a1a1a', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: gold, borderRadius: '3px' }} />
                </div>
                <div style={{ textAlign: 'right', marginTop: '2px' }}>
                  <span style={{ fontSize: '11px', color: muted }}>{pct.toFixed(1)}%</span>
                </div>
                <p style={{ fontSize: '13px', color: muted, lineHeight: 1.6, margin: '8px 0 0' }}>{f.summary}</p>
              </div>
              );
            })}
          </div>
          <div style={{ textAlign: 'center', marginTop: '2rem', padding: '1.5rem', border: `1px solid ${gold}22` }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '24px', color: gold, marginBottom: '0.25rem' }}>${CAPITAL_CAMPAIGN_GOAL_DOLLARS.toLocaleString()}</div>
            <div style={{ fontSize: '14px', color: muted }}>Total Funding Goal</div>
          </div>
          <p style={{ fontSize: '16px', color: muted, lineHeight: 1.8, textAlign: 'center', marginTop: '1.5rem' }}>
            Campaign totals and material milestones will be reported without exposing patron payment details or private relationship context.
          </p>
        </div>
      </section>

      {/* ═══ PROPOSE YOUR CITY ═══ */}
      <section id="propose" data-fade style={{ padding: '6rem 2rem', background: '#0d0d0d', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '480px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '1rem' }}>PROPOSE YOUR CITY</div>
          <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 400, color: parchment, marginBottom: '1rem', lineHeight: 1.3 }}>
            Want a Society of Explorers salon in your city?
          </h2>
          <p style={{ fontSize: '18px', color: ivory85, lineHeight: 1.8, marginBottom: '2rem' }}>
            If the Boston path becomes viable, the same community-led model could be explored elsewhere. Submit your city as an expression of interest, not a promise of a new location.
          </p>

          {submitted ? (
            <div style={{ padding: '2rem', border: `1px solid ${gold}33`, background: `${gold}08` }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.15em', color: gold, marginBottom: '0.75rem' }}>PROPOSAL RECORDED</div>
              <p style={{ fontSize: '16px', color: ivory85, lineHeight: 1.7 }}>Your proposal has been recorded. We&apos;ll be in touch.</p>
            </div>
          ) : (
            <form onSubmit={handlePropose} style={{ display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left' }}>
              <input value={city} onChange={e => setCity(e.target.value)} placeholder="City" required style={inputStyle} />
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" required style={inputStyle} />
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Your email" type="email" required style={inputStyle} />
              <textarea value={why} onChange={e => setWhy(e.target.value)} placeholder="Why your city? (optional)" rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
              <button type="submit" disabled={submitting} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, border: 'none', height: '48px', cursor: 'pointer', opacity: submitting ? 0.5 : 1, borderRadius: 0 }}>
                {submitting ? 'SUBMITTING...' : 'PROPOSE A SALON'}
              </button>
            </form>
          )}

          <div style={{ marginTop: '1.5rem' }}>
            <a href="/92b/fund" style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: gold, textDecoration: 'none' }}>Or fund the Boston salon now &rarr;</a>
            <div style={{ marginTop: '1rem' }}>
              <a href="/salons" style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: muted, textDecoration: 'none' }}>View all cities &rarr;</a>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: '#0a0a0a', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 400, fontStyle: 'italic', lineHeight: 1.3, color: parchment, marginBottom: '1.5rem' }}>
            This may begin here.
          </h2>
          <p style={{ fontSize: '20px', color: ivory85, lineHeight: 1.9, marginBottom: '2.5rem' }}>
            92B South St is the intended first Boston node if access, terms, repairs, campaign support, and landlord alignment make the path responsible.
          </p>
          <a href="/92b/fund" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, padding: '0 28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '48px', borderRadius: 0 }}>FUND THE FIRST NODE</a>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
