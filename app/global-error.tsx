'use client';

// Last-resort boundary for errors in the root layout. Must render its own
// <html> and <body>, and cannot rely on global CSS or fonts.
import { useEffect } from 'react';

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error('[soe] global error', error.digest ?? 'no-digest');
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#0a0a0a', color: '#E8DCC8', fontFamily: 'Georgia, serif' }}>
        <title>Something went wrong | Society of Explorers</title>
        <main role="alert" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div style={{ maxWidth: '480px', textAlign: 'center' }}>
            <h1 style={{ fontWeight: 400, fontSize: '1.9rem', margin: '0 0 0.75rem' }}>Society of Explorers is having trouble</h1>
            <p style={{ color: '#a39882', fontSize: '1.1rem', margin: '0 0 1.5rem' }}>Please try again in a moment.</p>
            <button
              type="button"
              onClick={() => unstable_retry()}
              style={{ background: '#c9a84c', color: '#000', border: 'none', padding: '12px 28px', fontSize: '14px', letterSpacing: '0.15em', cursor: 'pointer' }}
            >
              TRY AGAIN
            </button>
            {/* Plain anchor: client routing may be what failed. */}
            <p style={{ marginTop: '1.5rem' }}>
              <a href="/" style={{ color: '#c9a84c' }}>Go to the home page</a>
            </p>
          </div>
        </main>
      </body>
    </html>
  );
}
