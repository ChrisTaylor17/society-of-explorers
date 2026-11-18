'use client';
import { useState, useEffect } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

const GUIDE_LEVELS = ['', 'Guide', 'Senior Guide', 'Master Guide'];
const RANK_STYLES: Record<number, { color: string; size: string; accent: string }> = {
  0: { color: gold, size: '32px', accent: `${gold}22` },
  1: { color: '#C0C0C0', size: '28px', accent: 'rgba(192,192,192,0.12)' },
  2: { color: '#CD7F32', size: '26px', accent: 'rgba(205,127,50,0.12)' },
};

export default function LeaderboardPage() {
  const [guides, setGuides] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/leaderboard').then(r => r.json()).then(d => { setGuides(d.guides || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    const obs = new IntersectionObserver(entries => { entries.forEach(e => { if (e.isIntersecting) (e.target as HTMLElement).style.opacity = '1'; }); }, { threshold: 0.1 });
    document.querySelectorAll('[data-fade]').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [guides]);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif', animation: 'fadeIn 0.8s ease' }}>
      <PublicNav />

      {/* Hero */}
      <section style={{ padding: '8rem 2rem 3rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1rem' }}>THE GUIDES</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(24px, 5vw, 36px)', fontWeight: 400, fontStyle: 'italic', color: parchment, marginBottom: '0.75rem' }}>
            Those who teach, lead. Those who lead, create.
          </h1>
          <p style={{ fontSize: '16px', color: ivory85, lineHeight: 1.7 }}>
            Guides are members who completed a salon and now lead their own. The flywheel turns.
          </p>
        </div>
      </section>

      {/* Leaderboard */}
      <section data-fade style={{ padding: '0 2rem 4rem', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '700px', margin: '0 auto' }}>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem' }}>
              <span style={{ color: muted, fontFamily: 'Cinzel, serif', fontSize: '11px' }}>LOADING...</span>
            </div>
          ) : guides.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', border: `1px solid ${gold}15`, background: '#0d0d0d' }}>
              <p style={{ fontSize: '18px', color: parchment, fontStyle: 'italic', marginBottom: '0.5rem' }}>No Guides yet.</p>
              <p style={{ fontSize: '14px', color: muted, marginBottom: '1.5rem' }}>The first salon hasn&apos;t graduated. You could be among the founding Guides.</p>
              <a href="/salon" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: '#0a0a0a', background: gold, padding: '0 24px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '44px' }}>FIND A SALON</a>
            </div>
          ) : (
            <>
              {/* Top 3 podium */}
              {guides.length >= 3 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: '12px', marginBottom: '2rem', flexWrap: 'wrap' }}>
                  {[1, 0, 2].map(rank => {
                    const g = guides[rank];
                    if (!g) return null;
                    const rs = RANK_STYLES[rank];
                    const isFirst = rank === 0;
                    return (
                      <div key={g.id} style={{ textAlign: 'center', padding: isFirst ? '2rem 1.5rem' : '1.5rem 1.25rem', background: '#0d0d0d', border: `1px solid ${rs.color}33`, minWidth: '140px', order: rank === 1 ? 0 : rank === 0 ? 1 : 2 }}>
                        <div style={{ fontFamily: 'Playfair Display, serif', fontSize: rs.size, color: rs.color, marginBottom: '0.5rem' }}>{rank + 1}</div>
                        <div style={{ fontSize: isFirst ? '18px' : '16px', color: parchment, marginBottom: '4px' }}>{g.display_name}</div>
                        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.1em', color: rs.color, marginBottom: '0.75rem' }}>{GUIDE_LEVELS[g.guide_level] || 'Guide'}</div>
                        <div style={{ fontSize: '13px', color: muted }}>
                          {g.salons_led || 0} salons &middot; {g.members_graduated || 0} graduated
                        </div>
                        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', color: rs.color, marginTop: '0.5rem' }}>
                          {(g.guide_earnings_total || 0).toLocaleString()} <span style={{ fontSize: '8px', color: muted }}>EXP</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Full list */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {guides.map((g, i) => {
                  const isTop3 = i < 3;
                  const rs = RANK_STYLES[i];
                  return (
                    <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 12px', borderBottom: `1px solid ${gold}08`, transition: 'background 0.2s' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#0d0d0d'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <div style={{ fontFamily: 'Playfair Display, serif', fontSize: isTop3 ? '24px' : '18px', color: rs?.color || muted, width: '36px', textAlign: 'center' }}>
                        {i + 1}
                      </div>
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: isTop3 ? (rs?.accent || '#1a1a1a') : '#1a1a1a', border: `1px solid ${isTop3 ? (rs?.color || muted) : muted}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel, serif', fontSize: '12px', color: isTop3 ? (rs?.color || muted) : muted, flexShrink: 0 }}>
                        {(g.display_name || '?')[0].toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '17px', color: parchment }}>{g.display_name}</div>
                        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.1em', color: isTop3 ? (rs?.color || gold) : muted, marginTop: '2px' }}>{GUIDE_LEVELS[g.guide_level] || 'Guide'}</div>
                      </div>
                      <div style={{ textAlign: 'right', fontSize: '13px', color: muted }}>
                        <div>{g.salons_led || 0} salons</div>
                        <div>{g.members_graduated || 0} graduated</div>
                      </div>
                      <div style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', color: isTop3 ? (rs?.color || gold) : gold, minWidth: '70px', textAlign: 'right' }}>
                        {(g.guide_earnings_total || 0).toLocaleString()} <span style={{ fontSize: '8px', color: muted }}>EXP</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '2rem 2rem 4rem', textAlign: 'center' }}>
        <div style={{ width: '60px', height: '1px', background: `${gold}4d`, margin: '0 auto 2rem' }} />
        <p style={{ fontSize: '18px', color: parchment, fontStyle: 'italic', marginBottom: '0.5rem' }}>Every Guide started as a member.</p>
        <p style={{ fontSize: '14px', color: muted, marginBottom: '1.5rem' }}>Complete a salon. Lead your own. The flywheel turns.</p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="/salon" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, padding: '0 28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '48px' }}>FIND A SALON</a>
          <a href="/join" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: gold, textDecoration: 'none', border: `1px solid ${gold}44`, padding: '0 24px', display: 'inline-flex', alignItems: 'center', height: '48px' }}>JOIN THE SOCIETY</a>
        </div>
      </section>

      <PublicFooter />
      <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
    </div>
  );
}
