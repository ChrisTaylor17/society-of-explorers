'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { getMemberSession, getSupabaseAccessToken } from '@/lib/auth/getSession';
import { track } from '@/lib/analytics/client';
import { FAQS, FREE_SIGNUP_PATH, TIERS, checkoutErrorMessage } from '@/lib/join/content';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';
const PAID_TIER_IDS = new Set(['seeker', 'scholar', 'philosopher', 'oracle']);

function membershipReturnPath(tier: string): string {
  return `/join?intent=membership&tier=${encodeURIComponent(tier)}`;
}

function isStripeCheckoutUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;

  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'checkout.stripe.com';
  } catch {
    return false;
  }
}

export default function JoinPage() {
  const router = useRouter();
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<{ tier: string; message: string } | null>(null);
  const [checkoutIntent, setCheckoutIntent] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    track('join_view');
  }, []);

  useEffect(() => {
    if (window.location.hash) {
      const el = document.getElementById(window.location.hash.slice(1));
      if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tier = params.get('tier');
    if (params.get('intent') !== 'membership' || !tier || !PAID_TIER_IDS.has(tier)) return;

    let active = true;
    let timer: number | undefined;
    getMemberSession()
      .then((session) => {
        if (!active) return;
        if (!session?.member) {
          router.replace(`/login?next=${encodeURIComponent(membershipReturnPath(tier))}`);
          return;
        }

        setCheckoutIntent(tier);
        window.history.replaceState({}, '', `/join#${tier}`);
        timer = window.setTimeout(() => {
          document.getElementById(tier)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      })
      .catch(() => {
        if (active) router.replace(`/login?next=${encodeURIComponent(membershipReturnPath(tier))}`);
      });

    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [router]);

  function startFree() {
    track('signup_start', { tier: 'explorer', source: 'free_tier' });
    router.push(FREE_SIGNUP_PATH);
  }

  async function handleCheckout(tier: string) {
    if (tier === 'explorer') { startFree(); return; }
    track('tier_select', { tier });
    setCheckoutLoading(tier);
    setCheckoutError(null);
    setCheckoutIntent(null);
    try {
      const session = await getMemberSession();
      if (!session?.member) {
        track('signup_start', { tier, source: 'paid_tier' });
        router.push(`/login?next=${encodeURIComponent(membershipReturnPath(tier))}`);
        return;
      }

      track('checkout_start', { tier });
      const accessToken = await getSupabaseAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

      const res = await fetch('/api/checkout', {
        method: 'POST',
        cache: 'no-store',
        headers,
        credentials: 'same-origin',
        body: JSON.stringify({ tier }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          router.push(`/login?next=${encodeURIComponent(membershipReturnPath(tier))}`);
          return;
        }
        const code = typeof data.code === 'string' ? data.code : `http_${res.status}`;
        track('checkout_error', { tier, code });
        setCheckoutError({ tier, message: checkoutErrorMessage(res.status, code) });
        return;
      }
      if (!isStripeCheckoutUrl(data.url)) {
        track('checkout_error', { tier, code: 'invalid_destination' });
        setCheckoutError({ tier, message: 'Checkout could not start. Your membership was not changed.' });
        return;
      }
      track('checkout_redirect', { tier, mode: data.mode === 'test' ? 'test' : 'live' });
      window.location.assign(data.url);
    } catch {
      track('checkout_error', { tier, code: 'network' });
      setCheckoutError({ tier, message: 'Checkout could not start. Your membership was not changed.' });
    } finally {
      setCheckoutLoading(null);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      {/* Hero */}
      <section style={{ padding: '8rem 2rem 3rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1.5rem' }}>JOIN THE SOCIETY</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(28px, 5vw, 40px)', fontWeight: 400, fontStyle: 'italic', color: parchment, marginBottom: '1rem' }}>
            Where AI meets philosophy meets you.
          </h1>
          <p style={{ fontSize: '16px', color: ivory85, lineHeight: 1.7, maxWidth: '520px', margin: '0 auto' }}>
            Six thinkers. Seven-week salons. A Council that remembers your journey.
          </p>
          {checkoutIntent && (
            <p role="status" aria-live="polite" style={{ fontSize: '14px', color: gold, lineHeight: 1.6, maxWidth: '560px', margin: '1rem auto 0' }}>
              You are signed in. Review the {checkoutIntent} membership and choose it again when you are ready to open secure checkout.
            </p>
          )}
        </div>
      </section>

      {/* Pricing Grid */}
      <section aria-label="Membership tiers" style={{ padding: '0 2rem 4rem' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1px', background: `${gold}10` }}>
          {TIERS.map(t => (
            <div key={t.id} id={t.id} style={{
              background: '#0d0d0d', padding: '2rem 1.5rem', position: 'relative',
              border: t.featured ? `2px solid ${gold}` : `1px solid rgba(201,168,76,0.15)`,
              display: 'flex', flexDirection: 'column',
            }}>
              {t.badge && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: t.featured ? '2px' : 'auto', background: t.featured ? gold : 'transparent' }}>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.15em', color: gold, display: 'block', textAlign: 'center', padding: '4px 0' }}>{t.badge}</span>
                </div>
              )}
              <div style={{ marginTop: t.badge ? '20px' : '0' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.12em', color: gold, marginBottom: '4px' }}>{t.name.toUpperCase()}</div>
                <div style={{ fontSize: '14px', color: muted, marginBottom: '0.75rem' }}>{t.tagline}</div>
                <div style={{ marginBottom: '1.25rem' }}>
                  <span style={{ fontFamily: 'Playfair Display, serif', fontSize: '36px', color: parchment }}>{t.price}</span>
                  {t.period && <span style={{ fontSize: '14px', color: muted }}>{t.period}</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, marginBottom: '1.5rem' }}>
                  {t.features.map(f => (
                    <div key={f} style={{ fontSize: '13px', color: muted, lineHeight: 1.5, paddingLeft: '12px', position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 0, color: `${gold}66` }}>&middot;</span>
                      {f}
                    </div>
                  ))}
                </div>
                {t.note && <div style={{ fontSize: '11px', color: `${gold}88`, fontStyle: 'italic', marginBottom: '0.75rem' }}>{t.note}</div>}
                <button
                  onClick={() => t.ctaAction === 'oauth' ? startFree() : handleCheckout(t.id)}
                  disabled={checkoutLoading === t.id}
                  style={{
                    fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em',
                    color: '#0a0a0a', background: gold, border: 'none', height: '44px',
                    cursor: 'pointer', borderRadius: 0, width: '100%',
                    opacity: checkoutLoading === t.id ? 0.5 : 1,
                  }}
                >
                  {checkoutLoading === t.id ? 'REDIRECTING...' : t.cta}
                </button>
                {checkoutError?.tier === t.id && (
                  <p role="alert" aria-live="polite" style={{ color: '#d8a28f', fontSize: '12px', lineHeight: 1.5, margin: '0.75rem 0 0' }}>
                    {checkoutError.message}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section aria-label="Frequently asked questions" style={{ padding: '2rem 2rem 4rem' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, marginBottom: '1.5rem', textAlign: 'center' }}>FREQUENTLY ASKED</div>
          {FAQS.map((faq, i) => (
            <div key={i} style={{ borderBottom: `1px solid ${gold}08` }}>
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)} style={{
                width: '100%', background: 'none', border: 'none', padding: '16px 0',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
              }}>
                <span style={{ fontSize: '16px', color: parchment, textAlign: 'left', fontFamily: 'Cormorant Garamond, serif' }}>{faq.q}</span>
                <span style={{ color: gold, fontSize: '18px', flexShrink: 0, marginLeft: '12px' }}>{openFaq === i ? '-' : '+'}</span>
              </button>
              {openFaq === i && <p style={{ fontSize: '14px', color: muted, lineHeight: 1.7, padding: '0 0 16px' }}>{faq.a}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* Create your own */}
      <section style={{ padding: '2rem 2rem 4rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '480px', margin: '0 auto', padding: '2rem', border: `1px solid ${gold}15`, background: '#0d0d0d' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, marginBottom: '0.75rem' }}>OR</div>
          <h3 style={{ fontFamily: 'Playfair Display, serif', fontSize: '22px', fontWeight: 400, color: parchment, marginBottom: '0.5rem' }}>Create your own community</h3>
          <p style={{ fontSize: '14px', color: muted, lineHeight: 1.6, marginBottom: '1rem' }}>Build your own DAO-style intellectual community. AI thinkers guide you through every step.</p>
          <a href="/create-community" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: gold, border: `1px solid ${gold}44`, padding: '10px 24px', textDecoration: 'none' }}>CREATE COMMUNITY</a>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
