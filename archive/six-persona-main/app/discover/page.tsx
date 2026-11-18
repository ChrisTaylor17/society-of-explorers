'use client';
import { useState, useEffect } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

const TIER_COLORS: Record<string, string> = { free: muted, explorer: muted, seeker: gold, scholar: '#7B68EE', philosopher: '#DC143C' };

export default function DiscoverPage() {
  const [members, setMembers] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/members/discover').then(r => r.json()).then(d => setMembers(d.members || [])).catch(() => {});
  }, []);

  useEffect(() => {
    const obs = new IntersectionObserver(entries => { entries.forEach(e => { if (e.isIntersecting) (e.target as HTMLElement).style.opacity = '1'; }); }, { threshold: 0.1 });
    document.querySelectorAll('[data-fade]').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [members]);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />
      <section style={{ padding: '8rem 2rem 3rem', textAlign: 'center' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1rem' }}>DISCOVER</div>
        <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 400, color: parchment, marginBottom: '0.75rem' }}>Find collaborators. Build together.</h1>
        <p style={{ fontSize: '18px', color: ivory85, maxWidth: '500px', margin: '0 auto' }}>Explorers building meaningful things.</p>
      </section>

      <section data-fade style={{ padding: '0 2rem 4rem', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1px', background: `${gold}10` }}>
          {members.map(m => (
            <div key={m.id} style={{ background: '#0d0d0d', padding: '1.5rem', border: `1px solid rgba(201,168,76,0.1)` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.75rem' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: `${TIER_COLORS[m.tier] || gold}22`, border: `1px solid ${TIER_COLORS[m.tier] || gold}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel, serif', fontSize: '12px', color: TIER_COLORS[m.tier] || gold }}>
                  {(m.display_name || '?')[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: '16px', color: parchment }}>{m.display_name}</div>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.1em', color: TIER_COLORS[m.tier] || muted }}>{(m.tier || 'explorer').toUpperCase()}</div>
                </div>
                <div style={{ marginLeft: 'auto', fontFamily: 'Cinzel, serif', fontSize: '12px', color: gold }}>{m.exp_tokens || 0} <span style={{ fontSize: '8px', color: muted }}>EXP</span></div>
              </div>
              {m.bio && <p style={{ fontSize: '14px', color: muted, lineHeight: 1.6, marginBottom: '0.5rem' }}>{m.bio.slice(0, 100)}{m.bio.length > 100 ? '...' : ''}</p>}
              {m.skills?.length > 0 && (
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {m.skills.slice(0, 4).map((s: string) => (
                    <span key={s} style={{ fontSize: '10px', color: muted, border: `1px solid ${gold}22`, padding: '2px 8px', borderRadius: '10px' }}>{s}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {members.length === 0 && <div style={{ padding: '3rem', textAlign: 'center', gridColumn: '1/-1' }}><p style={{ color: muted, fontStyle: 'italic' }}>No members yet.</p></div>}
        </div>
      </section>
      <PublicFooter />
    </div>
  );
}
