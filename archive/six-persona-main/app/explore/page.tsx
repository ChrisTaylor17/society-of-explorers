'use client';
import { useEffect, useState } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

export default function ExplorePage() {
  const [daos, setDaos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/communities').then(r => r.json()).then(d => { setDaos(d.discover || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const flagship = daos.find(d => d.slug === 'society-of-explorers' || d.slug === 'soe');
  const others = daos.filter(d => d !== flagship);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      <section style={{ padding: '8rem 2rem 3rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1rem' }}>EXPLORE DAOs</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(26px, 5vw, 36px)', fontWeight: 400, color: parchment, marginBottom: '1rem', lineHeight: 1.25 }}>
            Live DAOs running on Consilience Systems.
          </h1>
          <p style={{ fontSize: '16px', color: ivory85, lineHeight: 1.7 }}>
            Citizen-science collectives, DePIN networks, open hardware, and habit layers. Discover and join.
          </p>
        </div>
      </section>

      <section style={{ padding: '0 2rem 4rem' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto' }}>
          {loading ? (
            <p style={{ textAlign: 'center', color: muted, fontFamily: 'Cinzel, serif', fontSize: '11px' }}>LOADING...</p>
          ) : (
            <>
              {/* Flagship (if SOE in list) */}
              {flagship ? (
                <a href="/soe" style={{ display: 'block', background: '#0d0d0d', border: `1px solid ${gold}33`, padding: '1.75rem', textDecoration: 'none', marginBottom: '1.5rem', transition: 'border-color 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = gold}
                  onMouseLeave={e => e.currentTarget.style.borderColor = `${gold}33`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, border: `1px solid ${gold}`, padding: '3px 10px' }}>FLAGSHIP</span>
                    <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', color: '#4CAF50' }}>{'\u25cf'} LIVE</span>
                  </div>
                  <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '22px', color: parchment, marginBottom: '0.5rem' }}>{flagship.name}</div>
                  <p style={{ fontSize: '14px', color: muted, lineHeight: 1.6, margin: 0 }}>{flagship.description || 'Daily philosophical practice + matched conversations + 7-week salons.'}</p>
                </a>
              ) : (
                <a href="/soe" style={{ display: 'block', background: '#0d0d0d', border: `1px solid ${gold}33`, padding: '1.75rem', textDecoration: 'none', marginBottom: '1.5rem', transition: 'border-color 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = gold}
                  onMouseLeave={e => e.currentTarget.style.borderColor = `${gold}33`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, border: `1px solid ${gold}`, padding: '3px 10px' }}>FLAGSHIP</span>
                    <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', color: '#4CAF50' }}>{'\u25cf'} LIVE</span>
                  </div>
                  <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '22px', color: parchment, marginBottom: '0.5rem' }}>Society of Explorers</div>
                  <p style={{ fontSize: '14px', color: muted, lineHeight: 1.6, margin: 0 }}>Citizen science of the mind. Daily philosophical practice, matched conversations, 7-week salons. $EXP soulbound reputation.</p>
                </a>
              )}

              {others.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2.5rem 1rem', border: `1px solid ${gold}15`, background: '#0d0d0d' }}>
                  <p style={{ fontSize: '16px', color: parchment, fontStyle: 'italic', marginBottom: '0.5rem' }}>More DAOs launching soon.</p>
                  <p style={{ fontSize: '13px', color: muted, marginBottom: '1.5rem' }}>Be an early builder. Launch the next one.</p>
                  <a href="/create-community" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: '#0a0a0a', background: gold, padding: '0 24px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '44px' }}>CREATE A DAO</a>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
                  {others.map(d => (
                    <a key={d.id} href={`/c/${d.slug}`} style={{ display: 'block', background: '#0d0d0d', border: `1px solid ${gold}15`, padding: '1.25rem', textDecoration: 'none', transition: 'border-color 0.2s' }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = `${gold}44`}
                      onMouseLeave={e => e.currentTarget.style.borderColor = `${gold}15`}>
                      <div style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.1em', color: gold, marginBottom: '0.5rem' }}>{d.name}</div>
                      <p style={{ fontSize: '13px', color: muted, lineHeight: 1.5, margin: 0, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{d.description || 'Consilience DAO'}</p>
                    </a>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <section style={{ padding: '2rem 2rem 6rem', textAlign: 'center' }}>
        <div style={{ width: '60px', height: '1px', background: `${gold}4d`, margin: '0 auto 2rem' }} />
        <p style={{ fontSize: '15px', color: muted, marginBottom: '1.5rem' }}>Launch your own citizen-science DAO in four steps.</p>
        <a href="/create-community" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, padding: '0 32px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '48px' }}>CREATE YOUR DAO</a>
      </section>

      <PublicFooter />
    </div>
  );
}
