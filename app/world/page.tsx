'use client';
import { useState, useEffect } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

const gold = '#c9a84c';
const parchment = '#E8DCC8';
const muted = '#9a8f7a';

interface Space {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  city: string | null;
  country: string | null;
  space_type: string;
  total_scans: number;
  avg_quality: number;
  cover_url: string | null;
  created_at: string;
}

const TYPE_ICONS: Record<string, string> = {
  salon: '⬡', library: '📚', temple: '◈', garden: '🌿', waypoint: '🧭', outpost: '⚑',
};

export default function WorldHub() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/world/spaces')
      .then(r => r.json())
      .then(d => { setSpaces(d.spaces || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) (e.target as HTMLElement).style.opacity = '1'; });
    }, { threshold: 0.1 });
    document.querySelectorAll('[data-fade]').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [loading]);

  const totalScans = spaces.reduce((s, sp) => s + sp.total_scans, 0);
  const avgQuality = spaces.length > 0
    ? Math.round(spaces.reduce((s, sp) => s + sp.avg_quality, 0) / spaces.length)
    : 0;

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      {/* Hero */}
      <section style={{ textAlign: 'center', padding: '100px 2rem 3rem' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.5em', color: gold, opacity: 0.5, marginBottom: '1.5rem' }}>SCAN-TO-EARN · WORLD LAYER</div>
        <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(2rem, 5vw, 3.2rem)', fontWeight: 300, letterSpacing: '0.08em', color: '#f5f0e8', marginBottom: '1rem' }}>
          Scanned Spaces
        </h1>
        <p style={{ fontSize: '1.15rem', color: muted, fontStyle: 'italic', maxWidth: '560px', margin: '0 auto 2.5rem', lineHeight: 1.8 }}>
          Explore the world layer. Scan real spaces. Earn EXP. Leave spatial annotations for future explorers.
        </p>
      </section>

      {/* Stats bar */}
      <section data-fade style={{ padding: '0 2rem 3rem', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: `${gold}12` }}>
          {[
            { label: 'Active Spaces', value: spaces.length },
            { label: 'Total Scans', value: totalScans },
            { label: 'Avg Quality', value: avgQuality > 0 ? `${avgQuality}%` : '—' },
          ].map(stat => (
            <div key={stat.label} style={{ background: '#0d0d0d', padding: '1.5rem', textAlign: 'center' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2rem)', color: gold, marginBottom: '0.25rem' }}>{stat.value}</div>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: muted }}>{stat.label.toUpperCase()}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Spaces grid */}
      <section data-fade style={{ padding: '0 2rem 4rem', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: muted, fontStyle: 'italic' }}>Loading spaces...</div>
          ) : spaces.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem' }}>
              <p style={{ color: muted, fontStyle: 'italic', marginBottom: '1.5rem' }}>No spaces scanned yet. Be the first explorer.</p>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, opacity: 0.6 }}>COMING SOON</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1px', background: `${gold}12` }}>
              {spaces.map(space => (
                <div key={space.id} style={{ background: '#0d0d0d', padding: '2rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>{TYPE_ICONS[space.space_type] || '⬡'}</span>
                    <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, opacity: 0.5 }}>{space.space_type.toUpperCase()}</span>
                  </div>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', letterSpacing: '0.08em', color: '#f5f0e8', marginBottom: '0.25rem' }}>{space.name}</div>
                  {space.city && (
                    <div style={{ fontSize: '13px', color: muted, fontStyle: 'italic', marginBottom: '0.75rem' }}>{space.city}{space.country ? `, ${space.country}` : ''}</div>
                  )}
                  {space.description && (
                    <p style={{ fontSize: '14px', color: `${parchment}aa`, lineHeight: 1.8, marginBottom: '1rem' }}>
                      {space.description.length > 120 ? space.description.slice(0, 120) + '…' : space.description}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: '1rem', fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.1em', color: muted }}>
                    <span>{space.total_scans} scan{space.total_scans !== 1 ? 's' : ''}</span>
                    {space.avg_quality > 0 && <span>·</span>}
                    {space.avg_quality > 0 && <span>{space.avg_quality}% quality</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* How it works */}
      <section data-fade style={{ padding: '4rem 2rem', background: '#050505', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, opacity: 0.4, marginBottom: '2rem' }}>HOW SCAN-TO-EARN WORKS</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.5rem' }}>
            {[
              { icon: '📸', title: 'Scan', desc: 'Photograph or 3D-scan a real space' },
              { icon: '🔐', title: 'Prove', desc: 'SHA-256 hash proves authenticity' },
              { icon: '✓', title: 'Verify', desc: 'Space host reviews quality' },
              { icon: '⬡', title: 'Earn', desc: 'EXP based on quality + bonuses' },
            ].map(step => (
              <div key={step.title}>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{step.icon}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: gold, marginBottom: '0.35rem' }}>{step.title.toUpperCase()}</div>
                <p style={{ fontSize: '13px', color: muted, lineHeight: 1.6 }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
