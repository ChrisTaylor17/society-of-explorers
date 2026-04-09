'use client';
import { useState, useEffect } from 'react';

const gold = '#c9a84c';
const parchment = '#E8DCC8';

export default function PublicNav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const linkStyle = { fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: parchment, textDecoration: 'none', opacity: 0.7 } as const;

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

        {/* Desktop */}
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }} className="hide-mobile">
          <a href="/council" style={{ ...linkStyle, color: gold, opacity: 1 }}>Council</a>
          <a href="/projects" style={{ ...linkStyle, color: gold, opacity: 1 }}>Projects</a>
          <a href="/discover" style={linkStyle}>Discover</a>
          <a href="/create-community" style={linkStyle}>Create</a>
          <a href="/join" style={linkStyle}>Join</a>
          <a href="/login" style={{ ...linkStyle, color: gold, opacity: 1, border: `1px solid ${gold}44`, padding: '6px 16px' }}>Sign In</a>
        </div>

        {/* Mobile hamburger */}
        <button onClick={() => setMenuOpen(v => !v)} style={{ display: 'none', background: 'none', border: 'none', color: gold, fontSize: '20px', cursor: 'pointer' }} className="show-mobile">
          {menuOpen ? '×' : '☰'}
        </button>
      </nav>

      {/* Mobile menu */}
      {menuOpen && (
        <div style={{ position: 'fixed', top: '56px', left: 0, right: 0, bottom: 0, background: 'rgba(10,10,10,0.98)', zIndex: 199, padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {[{ l: 'Council', h: '/council' }, { l: 'Projects', h: '/projects' }, { l: 'Discover', h: '/discover' }, { l: 'Create', h: '/create-community' }, { l: 'Join', h: '/join' }, { l: 'Sign In', h: '/login' }].map(lk => (
            <a key={lk.h} href={lk.h} onClick={() => setMenuOpen(false)} style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.2em', color: gold, textDecoration: 'none' }}>{lk.l.toUpperCase()}</a>
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
