'use client';

// Route-level error boundary. Shows a calm recovery screen instead of a blank
// page. Only the opaque digest is shown; error messages and stacks never are.
import { useEffect } from 'react';
import Link from 'next/link';
import { RECOVERY_LINKS } from '@/lib/site/recoveryLinks';

const gold = '#c9a84c';
const parchment = '#E8DCC8';
const muted = '#a39882';

export default function RouteError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Digest only: the message can contain user or server details.
    console.error('[soe] route error', error.digest ?? 'no-digest');
  }, [error]);

  return (
    <main
      role="alert"
      style={{
        minHeight: '100vh', background: '#0a0a0a', color: parchment,
        fontFamily: 'Cormorant Garamond, serif', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: '6rem 1.5rem',
      }}
    >
      <div style={{ maxWidth: '520px', width: '100%', textAlign: 'center' }}>
        <h1 style={{ fontFamily: 'Cinzel, serif', fontWeight: 400, fontSize: 'clamp(1.6rem, 5vw, 2.3rem)', color: '#f5f0e8', margin: '0 0 0.5rem' }}>
          Something went wrong on this page
        </h1>
        <p style={{ fontSize: '1.15rem', color: muted, fontStyle: 'italic', margin: '0 0 1.75rem' }}>
          Nothing you did caused this. Try again, or head somewhere else for now.
        </p>
        <button
          type="button"
          onClick={() => unstable_retry()}
          style={{
            background: gold, color: '#000', border: 'none', padding: '12px 28px',
            fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.2em', cursor: 'pointer',
          }}
        >
          TRY AGAIN
        </button>
        <p style={{ marginTop: '2rem', fontSize: '1rem', color: muted }}>
          {RECOVERY_LINKS.map((link, i) => (
            <span key={link.href}>
              {i > 0 && ' · '}
              <Link href={link.href} style={{ color: gold }}>{link.label}</Link>
            </span>
          ))}
        </p>
        {error.digest && (
          <p style={{ marginTop: '1.5rem', fontSize: '0.85rem', color: muted }}>Reference: {error.digest}</p>
        )}
      </div>
    </main>
  );
}
