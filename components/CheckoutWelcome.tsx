'use client';
// A legacy return hint is not payment evidence. Verified billing lives at /billing.
import { useEffect, useState } from 'react';
import { track } from '@/lib/analytics/client';

const gold = '#c9a84c';

export default function CheckoutWelcome() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('welcome') !== '1') return;
    let current = true;
    queueMicrotask(() => { if (current) setShow(true); });
    track('checkout_welcome_view');
    params.delete('welcome');
    const rest = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`);
    return () => { current = false; };
  }, []);

  if (!show) return null;
  return (
    <div role="status" aria-live="polite" style={{ maxWidth: '640px', margin: '6rem auto 0', padding: '1rem 1.25rem', boxSizing: 'border-box', width: 'calc(100% - 2rem)', border: `1px solid ${gold}55`, background: '#0d0d0d', position: 'relative', zIndex: 1 }}>
      <div style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.15em', color: gold, marginBottom: '0.5rem' }}>RETURNED FROM CHECKOUT</div>
      <p style={{ fontSize: '15px', color: '#f5f0e8', lineHeight: 1.6, margin: 0 }}>
        This return link does not confirm a payment or membership change. <a href="/billing" style={{ color: gold, display: 'inline-flex', alignItems: 'center', minHeight: '44px' }}>Check your billing status</a> before starting another checkout. You can keep reading and participating in free Circles while a payment is being checked.
      </p>
      <button onClick={() => setShow(false)} aria-label="Dismiss welcome message" style={{ minWidth: '44px', minHeight: '44px', marginTop: '8px', background: 'none', border: `1px solid ${gold}`, color: gold, fontSize: '18px', cursor: 'pointer' }}>×</button>
    </div>
  );
}
