'use client';
import { useState, useEffect } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

const FEATURES = [
  { title: 'AI Salon', body: 'Holographic thinker stations. Walk up, sit down, have Socrates challenge your thinking. Persistent memory means he remembers you next time.' },
  { title: 'Great Books Library', body: 'A curated collection of the works that shaped civilization. Weekly reading groups. Annotated editions. The intellectual foundation.' },
  { title: 'Music Therapy Chamber', body: 'A dedicated room for brainwave-tuned soundscapes. Muse S EEG integration. Sound as philosophy, experienced in person.' },
];

const STATUS_COLORS: Record<string, string> = { COMPLETE: '#4CAF50', 'IN PROGRESS': '#FFA726', 'FUNDING NEEDED': gold, UPCOMING: muted };

const TIMELINE = [
  { title: 'Lease Signed', desc: '92B South St, Boston. The space is ours.', status: 'COMPLETE' },
  { title: 'Construction', desc: 'Buildout is underway. Electrical, walls, flooring, lighting.', status: 'IN PROGRESS' },
  { title: 'Equipment & Tech', desc: 'AI stations, screens, sound system, library shelving, furniture.', status: 'FUNDING NEEDED' },
  { title: 'Grand Opening', desc: 'Target: when funding goal is met. Founding dinner for all backers.', status: 'UPCOMING' },
];

const FUNDS = [
  { label: 'Construction', amount: 45000, pct: 37.5 },
  { label: 'Technology & AI Stations', amount: 30000, pct: 25 },
  { label: 'Furniture & Library', amount: 20000, pct: 16.7 },
  { label: 'Sound System & Music Therapy', amount: 15000, pct: 12.5 },
  { label: 'Opening Event & First 3 Months', amount: 10000, pct: 8.3 },
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
            The First Physical Salon
          </h1>
          <p style={{ fontSize: '20px', color: ivory85, lineHeight: 1.8, maxWidth: '620px', margin: '0 auto 2.5rem' }}>
            A real space where philosophy meets technology. AI thinkers on the walls. Great Books on the shelves. Council Mode on every screen. Music therapy in the air. The Renaissance starts here.
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
            <p style={{ fontSize: '18px', color: ivory85, fontStyle: 'italic' }}>Currently under construction. Here's what we're building.</p>
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
            <p style={{ fontSize: '16px', color: muted, lineHeight: 1.8, maxWidth: '640px' }}>A communal space where groups engage multiple thinkers simultaneously. Debates projected on screens. The salon experience, amplified.</p>
          </div>
        </div>
      </section>

      {/* ═══ TRANSPARENCY ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: '#0d0d0d', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '0.75rem' }}>FULL TRANSPARENCY</div>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 400, color: parchment, lineHeight: 1.3 }}>We believe in building in public. Here's exactly where we are.</h2>
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
            {FUNDS.map(f => (
              <div key={f.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '14px', color: parchment }}>{f.label}</span>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', color: gold }}>${f.amount.toLocaleString()}</span>
                </div>
                <div style={{ height: '6px', background: '#1a1a1a', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${f.pct}%`, background: gold, borderRadius: '3px' }} />
                </div>
                <div style={{ textAlign: 'right', marginTop: '2px' }}>
                  <span style={{ fontSize: '11px', color: muted }}>{f.pct}%</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: '2rem', padding: '1.5rem', border: `1px solid ${gold}22` }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '24px', color: gold, marginBottom: '0.25rem' }}>$120,000</div>
            <div style={{ fontSize: '14px', color: muted }}>Total Funding Goal</div>
          </div>
          <p style={{ fontSize: '16px', color: muted, lineHeight: 1.8, textAlign: 'center', marginTop: '1.5rem' }}>
            Every dollar is tracked. Every milestone is public. This is how the Renaissance gets funded.
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
            If we can build one in Boston, we can build them everywhere. Submit your city and we'll start planning.
          </p>

          {submitted ? (
            <div style={{ padding: '2rem', border: `1px solid ${gold}33`, background: `${gold}08` }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.15em', color: gold, marginBottom: '0.75rem' }}>PROPOSAL RECORDED</div>
              <p style={{ fontSize: '16px', color: ivory85, lineHeight: 1.7 }}>Your proposal has been recorded. We'll be in touch.</p>
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
            This is happening.
          </h2>
          <p style={{ fontSize: '20px', color: ivory85, lineHeight: 1.9, marginBottom: '2.5rem' }}>
            92B South St is real. The lease is signed. The construction is underway. The only question is how fast we get there.
          </p>
          <a href="/92b/fund" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, padding: '0 28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '48px', borderRadius: 0 }}>FUND THE SALON</a>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
