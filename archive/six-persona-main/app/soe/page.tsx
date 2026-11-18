'use client';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { useEffect } from 'react';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

export default function SOEPage() {
  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) (e.target as HTMLElement).style.opacity = '1'; });
    }, { threshold: 0.1 });
    document.querySelectorAll('[data-fade]').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      <section style={{ padding: '8rem 2rem 3rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, marginBottom: '0.5rem' }}>FLAGSHIP INSTANCE ON CONSILIENCE</div>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: ivory85, marginBottom: '1.5rem' }}>SOCIETY OF EXPLORERS</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(28px, 5vw, 40px)', fontWeight: 400, fontStyle: 'italic', lineHeight: 1.3, marginBottom: '1.5rem' }}>
            Citizen science of the mind.
          </h1>
          <p style={{ fontSize: '17px', color: ivory85, lineHeight: 1.7, maxWidth: '560px', margin: '0 auto 2rem' }}>
            SOE is the first DAO built on Consilience Systems. The habit layer: daily philosophical practice, matched conversations, and 7-week salons. Soulbound $EXP reputation for verified contributions to the collective inquiry.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/practice" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, padding: '0 28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '48px' }}>START DAILY PRACTICE</a>
            <a href="/council" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: gold, border: `1px solid ${gold}`, padding: '0 28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '48px' }}>COUNCIL MODE</a>
          </div>
        </div>
      </section>

      {/* Modules */}
      <section data-fade style={{ padding: '2rem 2rem 4rem', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, textAlign: 'center', marginBottom: '2rem' }}>SOE MODULES</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1px', background: `${gold}10` }}>
            {[
              { label: 'DAILY PRACTICE', desc: 'One question a day. 280 characters. Build streaks. See what others think.', href: '/practice' },
              { label: 'MATCHED CONVERSATIONS', desc: 'After 7 responses, paired with a fellow explorer for a structured 1:1.', href: '/match' },
              { label: 'SALONS', desc: 'Seven people, seven weeks, 35 sessions. Lead, graduate, start your own.', href: '/salon' },
              { label: 'COUNCIL MODE', desc: 'Multi-thinker debate. Real-time streaming. Verdicts you can share.', href: '/council' },
              { label: 'LIVE SESSIONS', desc: 'Weekly video sessions on Daily.co. Wednesday 8pm ET.', href: '/live' },
              { label: 'LEADERBOARD', desc: 'Public ranking of Guides by salons led and members graduated.', href: '/leaderboard' },
            ].map(m => (
              <a key={m.label} href={m.href} style={{ background: '#0d0d0d', padding: '1.5rem', textDecoration: 'none', transition: 'background 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#111'}
                onMouseLeave={e => e.currentTarget.style.background = '#0d0d0d'}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: gold, marginBottom: '0.5rem' }}>{m.label}</div>
                <p style={{ fontSize: '13px', color: muted, lineHeight: 1.6, margin: 0 }}>{m.desc}</p>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Metadata / stats */}
      <section data-fade style={{ padding: '2rem 2rem 4rem', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ background: '#0d0d0d', border: `1px solid ${gold}22`, padding: '1.5rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, marginBottom: '1rem' }}>DAO SPEC</div>
            {[
              { label: 'Template', value: 'Habit / Research Layer' },
              { label: 'Reputation token', value: '$EXP (soulbound)' },
              { label: 'Governance', value: 'DAO / Benevolent hybrid' },
              { label: 'Membership', value: 'Explorer (free) / Seeker / Philosopher / Oracle' },
              { label: 'Data methods', value: 'Surveys, cohort participation, AI-facilitated sessions' },
              { label: 'Chain', value: 'Solana (Token-2022, NonTransferable)' },
            ].map(r => (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${gold}08` }}>
                <span style={{ fontSize: '13px', color: muted }}>{r.label}</span>
                <span style={{ fontSize: '13px', color: parchment, textAlign: 'right' }}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '2rem 2rem 6rem', textAlign: 'center' }}>
        <div style={{ width: '60px', height: '1px', background: `${gold}4d`, margin: '0 auto 2rem' }} />
        <p style={{ fontSize: '15px', color: muted, marginBottom: '1.5rem' }}>Want to launch something like this for your community?</p>
        <a href="/create-community" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: gold, border: `1px solid ${gold}`, padding: '0 28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '48px' }}>CREATE YOUR OWN DAO</a>
      </section>

      <PublicFooter />
    </div>
  );
}
