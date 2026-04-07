'use client';
import { useState, useEffect } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { createClient } from '@supabase/supabase-js';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

const THINKERS = [
  { id: 'socrates', name: 'Socrates', avatar: 'SO', color: '#C9A94E' },
  { id: 'nietzsche', name: 'Nietzsche', avatar: 'FN', color: '#DC143C' },
  { id: 'aurelius', name: 'Aurelius', avatar: 'MA', color: '#8B7355' },
  { id: 'einstein', name: 'Einstein', avatar: 'AE', color: '#4169E1' },
  { id: 'plato', name: 'Plato', avatar: 'PL', color: '#7B68EE' },
  { id: 'jobs', name: 'Jobs', avatar: 'SJ', color: '#A0A0A0' },
];

export default function CouncilPreviewPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) (e.target as HTMLElement).style.opacity = '1'; });
    }, { threshold: 0.1 });
    document.querySelectorAll('[data-fade]').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      await supabase.from('founding_interest').insert({
        name: email.trim(),
        email: email.trim().toLowerCase(),
        why: '[Council Mode Waitlist]',
        created_at: new Date().toISOString(),
      });
      setSubmitted(true);
    } catch {}
    setSubmitting(false);
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      <section style={{ padding: '8rem 2rem 4rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <a href="/" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: gold, textDecoration: 'none', display: 'inline-block', marginBottom: '2rem' }}>&larr; BACK TO HOME</a>

          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1.5rem' }}>COUNCIL MODE</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(36px, 7vw, 56px)', fontWeight: 400, lineHeight: 1.15, marginBottom: '1rem', color: parchment }}>
            Consult multiple thinkers simultaneously
          </h1>
          <p style={{ fontSize: '20px', color: ivory85, lineHeight: 1.8, maxWidth: '600px', margin: '0 auto 2.5rem' }}>
            Pose a question to the full council — Socrates, Nietzsche, Aurelius, Einstein, Plato, and Jobs — and receive perspectives from each, debating and building on each other's responses.
          </p>

          <div style={{ display: 'inline-block', fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.25em', color: gold, border: `1px solid ${gold}55`, padding: '8px 24px', borderRadius: '20px', marginBottom: '3rem' }}>
            AVAILABLE NOW FOR MEMBERS
          </div>
        </div>
      </section>

      {/* ═══ THINKERS GRID ═══ */}
      <section data-fade style={{ padding: '0 2rem 4rem', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '12px', marginBottom: '3rem' }}>
            {THINKERS.map(t => (
              <div key={t.id} style={{ textAlign: 'center', padding: '1.25rem 0.5rem', background: '#0d0d0d', border: `1px solid ${t.color}33` }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: `${t.color}22`, border: `1px solid ${t.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem', fontFamily: 'Cinzel, serif', fontSize: '12px', color: t.color }}>{t.avatar}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.12em', color: t.color }}>{t.name.toUpperCase()}</div>
              </div>
            ))}
          </div>

          <div style={{ background: '#0d0d0d', border: `1px solid rgba(201,168,76,0.15)`, padding: '2rem', marginBottom: '3rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.15em', color: gold, marginBottom: '1rem' }}>HOW IT WORKS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ fontSize: '16px', color: muted, lineHeight: 1.7 }}>1. Ask any question — philosophical, practical, creative, existential.</p>
              <p style={{ fontSize: '16px', color: muted, lineHeight: 1.7 }}>2. Each thinker responds from their unique worldview, seeing what the others said.</p>
              <p style={{ fontSize: '16px', color: muted, lineHeight: 1.7 }}>3. They debate each other. They disagree. They build on each other's ideas.</p>
              <p style={{ fontSize: '16px', color: muted, lineHeight: 1.7 }}>4. They remember your past conversations. Every session deepens the relationship.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ WAITLIST ═══ */}
      <section data-fade style={{ padding: '0 2rem 6rem', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '420px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '1rem' }}>GET NOTIFIED</div>
          <p style={{ fontSize: '18px', color: ivory85, lineHeight: 1.7, marginBottom: '1.5rem' }}>
            Council Mode is live for members. Join to get early access and updates.
          </p>

          {submitted ? (
            <div style={{ padding: '1.5rem', border: `1px solid ${gold}33`, background: `${gold}08` }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.15em', color: gold }}>YOU'RE ON THE LIST</div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px' }}>
              <input
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder="Your email" type="email" required
                style={{ flex: 1, background: '#111', border: `1px solid ${gold}22`, padding: '14px 16px', fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', color: parchment, outline: 'none' }}
              />
              <button type="submit" disabled={submitting} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, border: 'none', padding: '0 20px', height: '48px', cursor: 'pointer', opacity: submitting ? 0.5 : 1, borderRadius: 0 }}>
                {submitting ? '...' : 'JOIN'}
              </button>
            </form>
          )}

          <div style={{ marginTop: '2rem' }}>
            <a href="/join" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, padding: '0 28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '48px', borderRadius: 0 }}>BECOME A MEMBER</a>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
