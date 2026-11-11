'use client';
import { useState, useEffect, useId, useRef } from 'react';
import Link from 'next/link';
import { getMemberSession } from '@/lib/auth/getSession';
import AccountSignOut from '@/components/AccountSignOut';
import { subscribeAuthProviderChanges } from '@/lib/auth/providerSelection';

const gold = '#c9a84c';
const parchment = '#E8DCC8';
const DESKTOP_NAV_MIN_WIDTH = 1400;

type NavLink = { l: string; h: string };

const PRIMARY_LINKS = [
  { l: 'Explore', h: '/explore' },
  { l: 'Salons', h: '/salons/pilot', note: 'Proposed plan' },
  { l: 'Christian fellowship', h: '/fellowship' },
  { l: 'Library', h: '/great-books' },
];

const NAV_LINKS: NavLink[] = [
  { l: 'Practice', h: '/practice' },
  { l: 'Feed', h: '/feed' },
  { l: 'Circles', h: '/circles' },
  { l: 'Activities & experiences', h: '/experience' },
  { l: 'Council', h: '/council' },
  { l: 'Join', h: '/join' },
  { l: 'Build & ventures · proposed', h: '/structure' },
  { l: 'Manifesto', h: '/manifesto' },
  { l: 'Roadmap', h: '/roadmap' },
  { l: 'Movement', h: '/movement' },
  { l: 'Vision', h: '/vision' },
  { l: 'Atlas · external', h: 'https://prompts-mvp.vercel.app' },
];

const NAV_GROUPS = [
  { label: 'Community & practice', hrefs: ['/practice', '/feed', '/circles', '/experience', '/insights', '/council', '/join'] },
  { label: 'Vision & ideas', note: 'Plans and earlier ideas.', hrefs: ['/structure', '/manifesto', '/roadmap', '/movement', '/vision'] },
  { label: 'Separate destination', note: 'Atlas opens a different website.', hrefs: ['https://prompts-mvp.vercel.app'] },
];

function PrimaryLinks({ onNavigate }: { onNavigate?: () => void }) {
  return <div className="soe-nav-primary-links">
    {PRIMARY_LINKS.map(lk => <a key={lk.h} href={lk.h} onClick={onNavigate} className="soe-nav-primary-link">
      <span>{lk.l}</span>{lk.note && <small> {lk.note}</small>}
    </a>)}
  </div>;
}

function MoreLinks({ links, onNavigate }: { links: NavLink[]; onNavigate?: () => void }) {
  return <details className="soe-nav-more">
    <summary>More from SoE</summary>
    <div className="soe-nav-more-panel">
      {NAV_GROUPS.map(group => <section key={group.label} aria-label={group.label}>
        <h3>{group.label}</h3>
        {group.note && <p className="soe-nav-group-note">{group.note}</p>}
        {links.filter(lk => group.hrefs.includes(lk.h)).map(lk => <a key={lk.h} href={lk.h} onClick={onNavigate} className="soe-nav-secondary-link">{lk.l}</a>)}
      </section>)}
    </div>
  </details>;
}

function truncate(name: string, max = 12): string {
  return name.length > max ? name.slice(0, max - 1) + '\u2026' : name;
}

export default function PublicNav({ checkSession = true }: { checkSession?: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [walletSignOutPending, setWalletSignOutPending] = useState(false);
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
    const desktop = window.matchMedia(`(min-width: ${DESKTOP_NAV_MIN_WIDTH}px)`);
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
    const stop = subscribeAuthProviderChanges(() => { active = false; setDisplayName(null); setWalletSignOutPending(false); setAuthChecked(true); });
    getMemberSession(() => { if (active) setWalletSignOutPending(true); })
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

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }} className="hide-mobile">
          <PrimaryLinks />
          <MoreLinks links={visibleLinks} />
          <a
            href={authHref}
            style={{
              ...linkStyle, color: gold, opacity: !checkSession || authChecked ? 1 : 0,
              border: `1px solid ${gold}44`, padding: '6px 14px',
              transition: 'opacity 0.3s',
            }}
          >{authLabel}</a>
          <AccountSignOut available={Boolean(selectedName)} resumeWalletSignOut={checkSession && walletSignOutPending} />
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
          <AccountSignOut available={Boolean(selectedName)} resumeWalletSignOut={checkSession && walletSignOutPending} />
          <PrimaryLinks onNavigate={() => setMenuOpen(false)} />
          <MoreLinks links={visibleLinks} onNavigate={() => setMenuOpen(false)} />
          <a href={authHref} onClick={() => setMenuOpen(false)} style={{ display: 'flex', alignItems: 'center', minHeight: '44px', fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.2em', color: gold, textDecoration: 'none' }}>{authLabel.toUpperCase()}</a>
        </nav>
      </dialog>

      <style>{`
        .soe-nav-primary-links { display: flex; align-items: center; gap: 1.5rem; }
        .soe-nav-primary-link { display: flex; flex-direction: column; justify-content: center; min-height: 44px; color: ${parchment}; font-family: Cinzel, serif; font-size: 12px; line-height: 1.5; letter-spacing: .06em; text-decoration: none; }
        .soe-nav-primary-link small { display: block; color: ${gold}; font-family: Georgia, serif; font-size: 11px; letter-spacing: .02em; }
        .soe-nav-more { position: relative; }
        .soe-nav-more > summary { cursor: pointer; min-height: 44px; padding: .75rem .25rem; color: ${gold}; font-family: Cinzel, serif; font-size: 12px; line-height: 1.6; letter-spacing: .06em; }
        .soe-nav-more-panel { display: grid; gap: 1.25rem; padding: 1rem; background: #0a0a0a; border: 1px solid ${gold}44; }
        .soe-nav-more-panel section { min-width: 0; }
        .soe-nav-more-panel h3 { margin: 0 0 .5rem; font-family: Cinzel, serif; font-size: 11px; line-height: 1.6; letter-spacing: .08em; color: ${gold}; }
        .soe-nav-group-note { margin: 0 0 .5rem; color: ${parchment}; font-family: Georgia, serif; font-size: 12px; line-height: 1.5; }
        .soe-nav-secondary-link { display: flex; align-items: center; min-height: 44px; padding: .5rem 0; color: ${parchment}; font-family: Cinzel, serif; font-size: 12px; line-height: 1.6; letter-spacing: .04em; overflow-wrap: anywhere; text-decoration: none; }
        .soe-nav-primary-link:hover, .soe-nav-secondary-link:hover { text-decoration: underline; }
        .soe-nav-primary-link:focus-visible, .soe-nav-secondary-link:focus-visible, .soe-nav-more > summary:focus-visible { outline: 3px solid ${gold}; outline-offset: 3px; }
        .soe-public-nav .soe-nav-more-panel { position: absolute; top: calc(100% + .5rem); right: 0; width: min(660px, calc(100vw - 3rem)); grid-template-columns: 1.1fr 1fr .9fr; max-height: 75dvh; overflow-y: auto; box-shadow: 0 12px 36px #0009; }
        .soe-public-mobile-dialog .soe-nav-primary-links, .soe-public-noscript .soe-nav-primary-links { flex-direction: column; align-items: stretch; gap: .25rem; }
        .soe-public-mobile-dialog .soe-nav-primary-link { min-height: 52px; color: ${gold}; }
        @media (max-width: ${DESKTOP_NAV_MIN_WIDTH - 1}px) { .soe-public-nav .hide-mobile { display: none !important; } .soe-public-nav .show-mobile { display: block !important; } }
        @media (min-width: ${DESKTOP_NAV_MIN_WIDTH}px) { .soe-public-nav .show-mobile { display: none !important; } }
      `}</style>

      <noscript>
        <style>{`
          .soe-public-noscript { display: none; }
          @media (max-width: ${DESKTOP_NAV_MIN_WIDTH - 1}px) {
            .soe-public-nav { position: relative !important; }
            .soe-public-nav .show-mobile { display: none !important; }
            .soe-public-noscript { display: block; padding: 0 1.25rem 1rem; background: #0a0a0a; color: ${parchment}; border-bottom: 1px solid ${gold}44; }
            .soe-public-noscript summary { cursor: pointer; min-height: 44px; padding: .75rem; border: 1px solid ${gold}66; font-family: Cinzel, serif; font-size: 12px; line-height: 1.6; letter-spacing: .15em; color: ${gold}; }
            .soe-public-noscript nav { display: grid; gap: .25rem; margin-top: .5rem; }
            .soe-public-noscript a { display: block; min-height: 44px; padding: .6rem .75rem; font-family: Cinzel, serif; font-size: 12px; line-height: 1.6; letter-spacing: .15em; color: ${gold}; text-decoration: none; overflow-wrap: anywhere; }
            .soe-public-noscript a:hover { text-decoration: underline; }
            .soe-public-noscript a:focus-visible, .soe-public-noscript summary:focus-visible { outline: 3px solid ${gold}; outline-offset: 3px; }
          }
        `}</style>
        <div className="soe-public-noscript">
          <details>
            <summary>Site navigation</summary>
            <nav aria-label="Site links without JavaScript">
              <PrimaryLinks />
              <MoreLinks links={NAV_LINKS} />
            </nav>
          </details>
        </div>
      </noscript>
    </>
  );
}
