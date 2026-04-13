'use client';
import { useState, useEffect } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const muted = '#9a8f7a';

const GUIDE_LEVELS = ['', 'Guide', 'Senior Guide', 'Master Guide'];

export default function LeaderboardPage() {
  const [guides, setGuides] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/leaderboard').then(r => r.json()).then(d => setGuides(d.guides || [])).catch(() => {});
  }, []);

  useEffect(() => {
    const obs = new IntersectionObserver(entries => { entries.forEach(e => { if (e.isIntersecting) (e.target as HTMLElement).style.opacity = '1'; }); }, { threshold: 0.1 });
    document.querySelectorAll('[data-fade]').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [guides]);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      <section style={{ padding: '8rem 2rem 3rem', textAlign: 'center' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1rem' }}>THE GUIDES</div>
        <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(24px, 5vw, 36px)', fontWeight: 400, fontStyle: 'italic', color: parchment }}>
          Those who teach, lead. Those who lead, create.
        </h1>
      </section>

      <section data-fade style={{ padding: '0 2rem 4rem', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '700px', margin: '0 auto' }}>
          {guides.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem', border: `1px solid ${gold}15` }}>
              <p style={{ fontSize: '18px', color: muted, fontStyle: 'italic', marginBottom: '1rem' }}>No Guides yet. You could be the first.</p>
              <a href="/join" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: gold, textDecoration: 'none' }}>JOIN A SALON &rarr;</a>
            </div>
          )}
          {guides.map((g, i) => (
            <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 0', borderBottom: `1px solid ${gold}08` }}>
              <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '24px', color: i < 3 ? gold : muted, width: '36px', textAlign: 'center' }}>
                {i + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '18px', color: parchment }}>{g.display_name}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.1em', color: gold, marginTop: '2px' }}>{GUIDE_LEVELS[g.guide_level] || 'Guide'}</div>
              </div>
              <div style={{ textAlign: 'right', fontSize: '13px', color: muted }}>
                <div>{g.salons_led || 0} salons</div>
                <div>{g.members_graduated || 0} graduated</div>
              </div>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', color: gold, minWidth: '60px', textAlign: 'right' }}>
                {(g.guide_earnings_total || 0).toLocaleString()} <span style={{ fontSize: '8px', color: muted }}>EXP</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ fontSize: '16px', color: muted, marginBottom: '1rem' }}>Every Guide started as a member.</p>
        <a href="/join" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, padding: '0 28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '48px' }}>READY TO EXPLORE?</a>
      </section>

      <PublicFooter />
    </div>
  );
}
