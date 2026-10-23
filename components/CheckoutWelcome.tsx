'use client';
// Shown once after Stripe sends a new member back to /salon?welcome=1.
import { useEffect, useState } from 'react';
import { track } from '@/lib/analytics/client';

const gold = '#c9a84c';

export default function CheckoutWelcome() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('welcome') !== '1') return;
    setShow(true);
    track('checkout_welcome_view');
    params.delete('welcome');
    const rest = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`);
  }, []);

  if (!show) return null;
  return (
    <div role="status" aria-live="polite" style={{ maxWidth: '640px', margin: '6rem auto 0', padding: '1rem 1.25rem', boxSizing: 'border-box', width: 'calc(100% - 2rem)', border: `1px solid ${gold}55`, background: '#0d0d0d', position: 'relative', zIndex: 1 }}>
      <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.3em', color: gold, marginBottom: '0.5rem' }}>WELCOME TO THE SOCIETY</div>
      <p style={{ fontSize: '15px', color: '#f5f0e8', lineHeight: 1.6, margin: 0 }}>
        Thank you. Your payment went through. Your membership updates as soon as Stripe confirms it, usually within a minute. Next step: pick a salon below, or start today&apos;s <a href="/practice" style={{ color: gold }}>Daily Practice</a>.
      </p>
      <button onClick={() => setShow(false)} aria-label="Dismiss welcome message" style={{ position: 'absolute', top: '6px', right: '10px', background: 'none', border: 'none', color: gold, fontSize: '18px', cursor: 'pointer' }}>×</button>
    </div>
  );
}
