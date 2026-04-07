'use client';
import { useState, useEffect } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

const STEPS = [
  { num: 1, title: 'Propose', desc: 'Any explorer can pitch a project. AI thinkers help refine your idea, challenge your assumptions, and sharpen your pitch.' },
  { num: 2, title: 'Fund', desc: 'Members pledge capital. Smart contracts hold funds in escrow. No middlemen, no banks, no gatekeepers.' },
  { num: 3, title: 'Build', desc: 'Milestone-based releases. The community tracks progress. Thinkers serve as advisors. Full transparency on-chain.' },
  { num: 4, title: 'Return', desc: 'Profits split automatically via smart contracts. Investors see their capital working in real time. Money stays in the ecosystem.' },
];

const CARDS = [
  { title: 'Kiva Model', body: 'Micro-investment with personal connection. See exactly where your money goes. Get it back when the project succeeds.' },
  { title: 'Prediction Markets', body: 'Stake on outcomes. Skin in the game creates honest signals about which projects will actually succeed.' },
  { title: 'Living Stories', body: 'Follow founders like a show. Video updates, milestone celebrations, real-time progress. Not boring status reports — compelling narratives.' },
];

export default function ProjectsPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [interest, setInterest] = useState('both');
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setSubmitting(true);
    try {
      await fetch('/api/projects/interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), interest_type: interest }),
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
          backgroundImage: 'linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url("/images/hero-council.jpeg")',
          backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed',
        }}
      >
        <div style={{ maxWidth: '720px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1.5rem' }}>PROJECTS</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(36px, 7vw, 60px)', fontWeight: 400, lineHeight: 1.15, marginBottom: '1.5rem', color: parchment }}>
            Fund what matters.<br />Build what lasts.
          </h1>
          <p style={{ fontSize: '20px', color: ivory85, lineHeight: 1.8, maxWidth: '600px', margin: '0 auto 2.5rem' }}>
            A philosophical funding platform where entrepreneurs find capital, investors find meaning, and smart contracts ensure accountability.
          </p>
          <div style={{
            display: 'inline-block', fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.25em',
            color: gold, border: `1px solid ${gold}55`, padding: '8px 24px', borderRadius: '20px',
          }}>
            COMING SOON
          </div>
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: '#0a0a0a', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '0.75rem' }}>HOW IT WORKS</div>
          </div>

          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: '19px', top: '8px', bottom: '8px', width: '1px', background: `${gold}22` }} />

            {STEPS.map((item, i) => (
              <div key={item.num} style={{ display: 'flex', gap: '1.5rem', marginBottom: i < STEPS.length - 1 ? '2.5rem' : '0', position: 'relative' }}>
                <div style={{
                  width: '40px', height: '40px', flexShrink: 0, background: '#0a0a0a',
                  border: `1px solid ${gold}44`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'Cinzel, serif', fontSize: '12px', color: gold, position: 'relative', zIndex: 1,
                }}>
                  {item.num}
                </div>
                <div style={{ paddingTop: '4px' }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', color: parchment, marginBottom: '0.35rem', letterSpacing: '0.08em' }}>{item.title.toUpperCase()}</div>
                  <p style={{ fontSize: '16px', color: muted, lineHeight: 1.8 }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ WHY THIS MATTERS ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: '#0d0d0d', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '680px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '2rem' }}>WHY THIS MATTERS</div>

          <p style={{ fontSize: '22px', color: parchment, lineHeight: 1.8, fontStyle: 'italic', marginBottom: '2rem' }}>
            We lost the ability to build great things together. Cathedrals took generations. The pyramids coordinated thousands. Modern bureaucracy killed that spirit.
          </p>
          <p style={{ fontSize: '20px', color: ivory85, lineHeight: 1.8, marginBottom: '2rem' }}>
            Blockchain brings it back. Instant, secure, transparent capital flows. AI coordinates the work. Philosophy ensures we build things worth building.
          </p>
          <p style={{ fontSize: '20px', color: ivory85, lineHeight: 1.8 }}>
            Society of Explorers is where the world's most ambitious people compete to fund and build meaningful things.
          </p>
        </div>
      </section>

      {/* ═══ INSPIRATION CARDS ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: '#0a0a0a', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1px', background: `${gold}10` }}>
            {CARDS.map(card => (
              <div key={card.title} style={{ background: '#0d0d0d', padding: '2.5rem 2rem', border: `1px solid rgba(201,168,76,0.15)` }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.15em', color: gold, marginBottom: '1rem' }}>
                  {card.title.toUpperCase()}
                </div>
                <p style={{ fontSize: '16px', color: muted, lineHeight: 1.8 }}>{card.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ EXPRESS INTEREST ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: '#0d0d0d', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '480px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '1rem' }}>BE FIRST</div>
          <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 400, color: parchment, marginBottom: '2rem', lineHeight: 1.3 }}>
            Want to propose a project or fund one?
          </h2>

          {submitted ? (
            <div style={{ padding: '2rem', border: `1px solid ${gold}33`, background: `${gold}08` }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.15em', color: gold, marginBottom: '0.75rem' }}>YOU'RE ON THE LIST</div>
              <p style={{ fontSize: '16px', color: ivory85, lineHeight: 1.7 }}>
                We'll reach out when the Projects layer launches. Welcome to the frontier.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left' }}>
              <input
                value={name} onChange={e => setName(e.target.value)}
                placeholder="Your name" required
                style={inputStyle}
              />
              <input
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder="Your email" type="email" required
                style={inputStyle}
              />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px 0' }}>
                {[
                  { value: 'propose', label: 'I want to propose a project' },
                  { value: 'fund', label: 'I want to fund projects' },
                  { value: 'both', label: 'Both' },
                ].map(opt => (
                  <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '15px', color: muted }}>
                    <input
                      type="radio" name="interest" value={opt.value}
                      checked={interest === opt.value}
                      onChange={() => setInterest(opt.value)}
                      style={{ accentColor: gold }}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>

              <button
                type="submit"
                disabled={submitting}
                style={{
                  fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em',
                  color: '#0a0a0a', background: gold, border: 'none', height: '48px',
                  cursor: 'pointer', opacity: submitting ? 0.5 : 1, borderRadius: 0,
                }}
              >
                {submitting ? 'SUBMITTING...' : 'JOIN THE WAITLIST'}
              </button>
            </form>
          )}
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
