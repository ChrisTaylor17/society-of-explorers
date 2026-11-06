'use client';
import { useState, useEffect, useId, useRef } from 'react';
import Link from 'next/link';
import { getMemberSession } from '@/lib/auth/getSession';
import AccountSignOut from '@/components/AccountSignOut';
import { subscribeAuthProviderChanges } from '@/lib/auth/providerSelection';

const gold = '#c9a84c';
const parchment = '#E8DCC8';

const NAV_LINKS = [
  { l: 'Atlas', h: 'https://prompts-mvp.vercel.app' },
  { l: 'Practice', h: '/practice' },
  { l: 'Feed', h: '/feed' },
  { l: 'Circles', h: '/circles' },
  { l: 'Manifesto', h: '/manifesto' },
  { l: 'Roadmap', h: '/roadmap' },
  { l: 'Movement', h: '/movement' },
  { l: 'Vision', h: '/vision' },
  { l: 'Council', h: '/council' },
  { l: 'Join', h: '/join' },
];

function truncate(name: string, max = 12): string {
  return name.length > max ? name.slice(0, max - 1) + '\u2026' : name;
}

export default function PublicNav({ checkSession = true }: { checkSession?: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const mobileMenuId = useId();
  const mobileMenu = useRef<HTMLDialogElement>(null);
  const closeMenuButton = useRef<HTMLButtonElement>(null);
  const brandLink = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const dialog = mobileMenu.current;
    if (!dialog) return;
    if (!menuOpen) {
      if (dialog.open) dialog.close();
      return;
    }
    // A modal dialog keeps covered page controls out of keyboard navigation
    // and returns focus to the opener when it closes.
    if (!dialog.open) dialog.showModal();
    closeMenuButton.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const desktop = window.matchMedia('(min-width: 641px)');
    const closeOnDesktop = () => {
      if (desktop.matches) {
        dialog.close();
        brandLink.current?.focus({ preventScroll: true });
      }
    };
    desktop.addEventListener('change', closeOnDesktop);
    closeOnDesktop();
    return () => {
      document.body.style.overflow = previousOverflow;
      desktop.removeEventListener('change', closeOnDesktop);
    };
  }, [menuOpen]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!checkSession) return;
    let active = true;
    const stop = subscribeAuthProviderChanges(() => { active = false; setDisplayName(null); setAuthChecked(true); });
    getMemberSession()
      .then(session => {
        if (active && session?.member) {
          const name = session.member.display_name || 'Account';
          setDisplayName(truncate(name));
        }
      })
      .catch(() => {})
      .finally(() => { if (active) setAuthChecked(true); });
    return () => { active = false; stop(); };
  }, [checkSession]);

  const linkStyle = { fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: parchment, textDecoration: 'none', opacity: 0.7 } as const;
  const selectedName = checkSession ? displayName : null;
  const authLabel = selectedName || 'Sign In';
  const authHref = selectedName ? '/dashboard' : '/login';

  // Insights link surfaces only when the viewer is signed in.
  const visibleLinks = NAV_LINKS.flatMap(lk => {
    if (lk.l === 'Council' && selectedName) {
      return [{ l: 'Insights', h: '/insights' }, lk];
    }
    return [lk];
  });

  return (
    <>
      <nav aria-label="Primary navigation" className="soe-public-nav" style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200, padding: '0 2rem', height: 'var(--soe-public-nav-height, 56px)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: scrolled ? 'rgba(10,10,10,0.95)' : 'transparent',
        backdropFilter: scrolled ? 'blur(8px)' : 'none',
        borderBottom: scrolled ? `1px solid ${gold}11` : 'none', transition: 'all 0.3s',
      }}>
        <Link ref={brandLink} href="/" style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.2em', color: gold, textDecoration: 'none' }}>
          SOCIETY OF EXPLORERS
        </Link>

        <div style={{ display: 'flex', gap: '1.75rem', alignItems: 'center' }} className="hide-mobile">
          {visibleLinks.map(lk => (
            <a key={lk.h} href={lk.h} style={linkStyle}>{lk.l}</a>
          ))}
          <a
            href={authHref}
            style={{
              ...linkStyle, color: gold, opacity: !checkSession || authChecked ? 1 : 0,
              border: `1px solid ${gold}44`, padding: '6px 14px',
              transition: 'opacity 0.3s',
            }}
          >{authLabel}</a>
          <AccountSignOut available={Boolean(selectedName)} />
        </div>

        <button type="button" aria-label="Open navigation" aria-expanded={menuOpen} aria-controls={mobileMenuId}
          onClick={() => setMenuOpen(true)} style={{ display: 'none', background: 'none', border: 'none', color: gold, fontSize: '20px', minWidth: '44px', minHeight: '44px', cursor: 'pointer' }} className="show-mobile">
          {menuOpen ? '\u00d7' : '\u2630'}
        </button>
      </nav>

      <dialog ref={mobileMenu} id={mobileMenuId} aria-label="Site navigation" className="soe-public-mobile-dialog"
        onCancel={event => { event.preventDefault(); setMenuOpen(false); }} onClose={() => setMenuOpen(false)}
        style={{ position: 'fixed', inset: 0, margin: 0, width: '100%', height: '100dvh', maxWidth: 'none', maxHeight: 'none', boxSizing: 'border-box', border: 0, background: '#0a0a0a', color: parchment, padding: '1.25rem 2rem 2rem', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
          <h2 style={{ fontFamily: 'Cinzel, serif', color: gold, fontSize: '14px', margin: 0 }}>Navigation</h2>
          <button ref={closeMenuButton} type="button" aria-label="Close navigation" onClick={() => setMenuOpen(false)}
            style={{ background: 'none', border: `1px solid ${gold}66`, color: gold, fontSize: '24px', minWidth: '44px', minHeight: '44px', cursor: 'pointer' }}>×</button>
        </div>
        <nav aria-label="Mobile navigation" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
          <AccountSignOut available={Boolean(selectedName)} />
          {[...visibleLinks, { l: authLabel, h: authHref }].map(lk => (
            <a key={lk.h + lk.l} href={lk.h} onClick={() => setMenuOpen(false)} style={{ display: 'flex', alignItems: 'center', minHeight: '44px', fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.2em', color: gold, textDecoration: 'none' }}>{lk.l.toUpperCase()}</a>
          ))}
        </nav>
      </dialog>

      <style>{`
        @media (max-width: 640px) { .hide-mobile { display: none !important; } .show-mobile { display: block !important; } }
        @media (min-width: 641px) { .show-mobile { display: none !important; } }
      `}</style>
    </>
  );
}
