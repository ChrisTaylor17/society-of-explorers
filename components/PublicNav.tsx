'use client';
import { useState, useEffect } from 'react';
import { getMemberSession } from '@/lib/auth/getSession';

const gold = '#c9a84c';
const parchment = '#E8DCC8';

const NAV_LINKS = [
  { l: 'Practice', h: '/practice' },
  { l: 'Feed', h: '/feed' },
  { l: 'Manifesto', h: '/manifesto' },
  { l: 'Roadmap', h: '/roadmap' },
  { l: 'Vision', h: '/vision' },
  { l: 'Council', h: '/council' },
  { l: 'Join', h: '/join' },
];

function truncate(name: string, max = 12): string {
  return name.length > max ? name.slice(0, max - 1) + '\u2026' : name;
}

export default function PublicNav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    getMemberSession()
      .then(session => {
        if (session?.member) {
          const name = session.member.display_name || 'Account';
          setDisplayName(truncate(name));
        }
      })
      .catch(() => {})
      .finally(() => setAuthChecked(true));
  }, []);

  const linkStyle = { fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: parchment, textDecoration: 'none', opacity: 0.7 } as const;
  const authLabel = displayName || 'Sign In';
  const authHref = displayName ? '/dashboard' : '/login';

  // Insights link surfaces only when the viewer is signed in.
  const visibleLinks = NAV_LINKS.flatMap(lk => {
    if (lk.l === 'Council' && displayName) {
      return [{ l: 'Insights', h: '/insights' }, lk];
    }
    return [lk];
  });

  return (
    <>
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200, padding: '0 2rem', height: '56px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: scrolled ? 'rgba(10,10,10,0.95)' : 'transparent',
        backdropFilter: scrolled ? 'blur(8px)' : 'none',
        borderBottom: scrolled ? `1px solid ${gold}11` : 'none', transition: 'all 0.3s',
      }}>
        <a href="/" style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.2em', color: gold, textDecoration: 'none' }}>
          SOCIETY OF EXPLORERS
        </a>

        <div style={{ display: 'flex', gap: '1.75rem', alignItems: 'center' }} className="hide-mobile">
          {visibleLinks.map(lk => (
            <a key={lk.h} href={lk.h} style={linkStyle}>{lk.l}</a>
          ))}
          <a
            href={authHref}
            style={{
              ...linkStyle, color: gold, opacity: authChecked ? 1 : 0,
              border: `1px solid ${gold}44`, padding: '6px 14px',
              transition: 'opacity 0.3s',
            }}
          >{authLabel}</a>
        </div>

        <button onClick={() => setMenuOpen(v => !v)} style={{ display: 'none', background: 'none', border: 'none', color: gold, fontSize: '20px', cursor: 'pointer' }} className="show-mobile">
          {menuOpen ? '\u00d7' : '\u2630'}
        </button>
      </nav>

      {menuOpen && (
        <div style={{ position: 'fixed', top: '56px', left: 0, right: 0, bottom: 0, background: 'rgba(10,10,10,0.98)', zIndex: 199, padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {[...visibleLinks, { l: authLabel, h: authHref }].map(lk => (
            <a key={lk.h + lk.l} href={lk.h} onClick={() => setMenuOpen(false)} style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.2em', color: gold, textDecoration: 'none' }}>{lk.l.toUpperCase()}</a>
          ))}
        </div>
      )}

      <style>{`
        @media (max-width: 640px) { .hide-mobile { display: none !important; } .show-mobile { display: block !important; } }
        @media (min-width: 641px) { .show-mobile { display: none !important; } }
      `}</style>
    </>
  );
}
