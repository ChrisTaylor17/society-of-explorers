import type { Metadata } from 'next';
import Link from 'next/link';
import { RECOVERY_LINKS } from '@/lib/site/recoveryLinks';

export const metadata: Metadata = {
  title: 'Page not found',
  description: 'This page does not exist or has moved.',
  robots: { index: false, follow: true },
};

const gold = '#c9a84c';
const parchment = '#E8DCC8';
const muted = '#a39882';

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: '100vh', background: '#0a0a0a', color: parchment,
        fontFamily: 'Cormorant Garamond, serif', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: '6rem 1.5rem',
      }}
    >
      <div style={{ maxWidth: '520px', width: '100%', textAlign: 'center' }}>
        <p style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.4em', color: gold, margin: 0 }}>
          404
        </p>
        <h1 style={{ fontFamily: 'Cinzel, serif', fontWeight: 400, fontSize: 'clamp(1.8rem, 5vw, 2.6rem)', color: '#f5f0e8', margin: '1rem 0 0.5rem' }}>
          This path leads nowhere
        </h1>
        <p style={{ fontSize: '1.15rem', color: muted, fontStyle: 'italic', margin: '0 0 2rem' }}>
          The page you asked for does not exist or has moved. Here are a few good places to go instead.
        </p>
        <nav aria-label="Suggested pages">
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.75rem' }}>
            {RECOVERY_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  style={{
                    display: 'block', padding: '14px 18px', border: `1px solid ${gold}44`,
                    color: parchment, textDecoration: 'none', textAlign: 'left',
                  }}
                >
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '13px', letterSpacing: '0.12em', color: gold }}>
                    {link.label}
                  </span>
                  <span style={{ display: 'block', fontSize: '1rem', color: muted }}>{link.note}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </main>
  );
}
