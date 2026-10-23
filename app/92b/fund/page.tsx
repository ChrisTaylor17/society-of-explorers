'use client';
import { useState, useEffect, useRef } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { getMemberSession } from '@/lib/auth/getSession';
import { CAPITAL_CAMPAIGN_GOAL_DOLLARS, CAPITAL_USE_OF_FUNDS, NINETY_TWO_B_TIERS } from '@/lib/capital/campaign';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

const TIERS = NINETY_TWO_B_TIERS;
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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

function campaignAttribution(search: string) {
  const params = new URLSearchParams(search);
  return Object.fromEntries(
    UTM_KEYS.flatMap((key) => {
      const value = params.get(key)?.trim().slice(0, 120);
      return value ? [[key, value]] : [];
    }),
  );
}

function nonNegativeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

export default function FundPage() {
  const [isSuccess, setIsSuccess] = useState(false);
  const [pledging, setPledging] = useState<string | null>(null);
  const [pledgeEmail, setPledgeEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [totalRaised, setTotalRaised] = useState(0);
  const [backerCount, setBackerCount] = useState(0);
  const [goal] = useState(CAPITAL_CAMPAIGN_GOAL_DOLLARS);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const pledgeOpenerRef = useRef<HTMLButtonElement | null>(null);
  const selectedTier = TIERS.find((tier) => tier.id === pledging) || null;

  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) (e.target as HTMLElement).style.opacity = '1'; });
    }, { threshold: 0.1 });
    document.querySelectorAll('[data-fade]').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      document.querySelectorAll<HTMLElement>('[data-parallax]').forEach(el => {
        el.style.backgroundAttachment = 'scroll';
      });
    }
  }, []);

  // Check for success param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      const timer = window.setTimeout(() => setIsSuccess(true), 0);
      return () => window.clearTimeout(timer);
    }
  }, []);

  // Pre-fill email from Supabase session
  useEffect(() => {
    async function loadEmail() {
      try {
        const session = await getMemberSession();
        if (session?.member?.email) setPledgeEmail(session.member.email);
      } catch {}
    }
    loadEmail();
  }, []);

  // Fetch live progress
  useEffect(() => {
    let active = true;

    fetch('/api/92b/progress', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return null;
        const data: unknown = await response.json();
        return isRecord(data) ? data : null;
      })
      .then((data) => {
        if (!active || !data) return;
        setTotalRaised(nonNegativeNumber(data.totalRaised));
        setBackerCount(Math.trunc(nonNegativeNumber(data.backerCount)));
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!pledging) return;

    const focusTimer = window.setTimeout(() => emailInputRef.current?.focus(), 0);
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || submitting) return;
      setPledging(null);
      setCheckoutError(null);
      window.setTimeout(() => pledgeOpenerRef.current?.focus(), 0);
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [pledging, submitting]);

  function openPledgeModal(tierId: string, opener: HTMLButtonElement) {
    pledgeOpenerRef.current = opener;
    setCheckoutError(null);
    setPledging(tierId);
  }

  function closePledgeModal() {
    if (submitting) return;
    setPledging(null);
    setCheckoutError(null);
    window.setTimeout(() => pledgeOpenerRef.current?.focus(), 0);
  }

  async function handlePledge(e: React.FormEvent) {
    e.preventDefault();
    if (!pledgeEmail.trim() || !pledging) return;
    const tier = TIERS.find(t => t.id === pledging);
    if (!tier) return;
    setCheckoutError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/92b/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tierId: tier.id,
          email: pledgeEmail.trim(),
          utm: campaignAttribution(window.location.search),
        }),
      });

      const data: unknown = await res.json().catch(() => null);
      if (!res.ok || !isRecord(data) || !isStripeCheckoutUrl(data.url)) {
        setCheckoutError('Checkout could not start. Please review your email and try again.');
        return;
      }

      window.location.assign(data.url);
    } catch {
      setCheckoutError('Checkout could not start. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#111', border: `1px solid ${gold}22`, padding: '14px 16px',
    fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', color: parchment,
    outline: 'none', boxSizing: 'border-box',
  };

  const progressPct = goal > 0 ? Math.min((totalRaised / goal) * 100, 100) : 0;

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      {/* ═══ SUCCESS BANNER ═══ */}
      {isSuccess && (
        <div role="status" aria-live="polite" style={{ position: 'fixed', top: '56px', left: 0, right: 0, zIndex: 190, padding: '16px 2rem', background: `linear-gradient(90deg, rgba(201,168,76,0.15), rgba(201,168,76,0.08))`, borderBottom: `1px solid ${gold}33`, textAlign: 'center' }}>
          <span style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.15em', color: gold }}>
            Stripe returned you to the campaign. Payment confirmation may take a moment; fulfilled benefits follow the verified payment event.
          </span>
        </div>
      )}

      {/* ═══ HERO ═══ */}
      <section
        data-parallax
        style={{
          minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: isSuccess ? '10rem 2rem 6rem' : '8rem 2rem 6rem', position: 'relative',
          backgroundImage: 'linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url("/images/hero-renaissance.jpeg")',
          backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed',
        }}
      >
        <div style={{ maxWidth: '720px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1.5rem' }}>FUND THE SALON</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(36px, 7vw, 56px)', fontWeight: 400, lineHeight: 1.15, marginBottom: '1.5rem', color: parchment }}>
            Help fund the first physical node
          </h1>
          <p style={{ fontSize: '20px', color: ivory85, lineHeight: 1.8, maxWidth: '600px', margin: '0 auto' }}>
            We are raising $120,000 to pursue a Boston physical node responsibly: due diligence, viable terms, repairs, and a privacy-first room if access and landlord alignment come together.
          </p>
          <a
            href="#pledge-tiers"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              minHeight: '50px', marginTop: '2rem', padding: '0 1.75rem',
              background: gold, color: '#0a0a0a', textDecoration: 'none',
              fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em',
            }}
          >
            PLEDGE FROM $25
          </a>
          <p style={{ fontSize: '12px', color: muted, lineHeight: 1.6, margin: '1rem auto 0', maxWidth: '520px' }}>
            Stripe card checkout. No equity or financial return. Patron benefits follow verified payment.
          </p>
        </div>
      </section>

      {/* ═══ CONDITIONAL PHYSICAL NODE ═══ */}
      <section data-fade style={{ padding: '5rem 2rem', background: '#0d0d0d', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '840px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1px', background: `${gold}10` }}>
          <div style={{ background: '#0d0d0d', padding: '2rem', border: `1px solid rgba(201,168,76,0.15)` }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.25em', color: gold, marginBottom: '1rem' }}>THE ANCHOR</div>
            <p style={{ fontSize: '17px', color: ivory85, lineHeight: 1.8 }}>
              The first target is a prominent Boston retail location connected to Society history. It is not presented as secured. It is the intended first physical node if the campaign, lease status, repairs, and landlord conversation make the path viable.
            </p>
          </div>
          <div style={{ background: '#0d0d0d', padding: '2rem', border: `1px solid rgba(201,168,76,0.15)` }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.25em', color: gold, marginBottom: '1rem' }}>FIRST USE OF FUNDS</div>
            <p style={{ fontSize: '17px', color: ivory85, lineHeight: 1.8 }}>
              Funds first support due diligence, securing the location if terms work, code-ready buildout planning, founder wall materials, and a simple window activation that invites Boston into the movement.
            </p>
          </div>
          <div style={{ background: '#0d0d0d', padding: '2rem', border: `1px solid rgba(201,168,76,0.15)` }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.25em', color: gold, marginBottom: '1rem' }}>THE PROMISE</div>
            <p style={{ fontSize: '17px', color: ivory85, lineHeight: 1.8 }}>
              Patronage gives recognition, access, ritual priority, and community artifacts. It is not equity, debt, a security, or a promise of financial return.
            </p>
          </div>
        </div>
      </section>

      {/* ═══ USE OF FUNDS ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: '#0a0a0a', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '1rem' }}>USE OF FUNDS</div>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(30px, 5vw, 44px)', fontWeight: 400, lineHeight: 1.2, margin: '0 0 1rem', color: parchment }}>
              What the first $120,000 makes possible
            </h2>
            <p style={{ fontSize: '17px', color: muted, lineHeight: 1.8, maxWidth: '680px', margin: '0 auto' }}>
              This is a working allocation, not a promise that the location is secured or that buildout will proceed. The first decision is whether the Boston physical-node path becomes responsible.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1px', background: `${gold}10` }}>
            {CAPITAL_USE_OF_FUNDS.map((item) => (
              <div key={item.label} style={{ background: '#0d0d0d', padding: '2rem', border: `1px solid rgba(201,168,76,0.15)` }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '24px', color: parchment, marginBottom: '0.75rem' }}>${item.amount.toLocaleString()}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.16em', color: gold, marginBottom: '0.75rem' }}>{item.label}</div>
                <p style={{ fontSize: '15px', color: muted, lineHeight: 1.7, margin: 0 }}>{item.summary}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ PLEDGE TIERS ═══ */}
      <section id="pledge-tiers" data-fade style={{ padding: '6rem 2rem', background: '#0a0a0a', opacity: 0, transition: 'opacity 0.9s ease', scrollMarginTop: '72px' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1px', background: `${gold}10` }}>
            {TIERS.map(tier => (
              <div key={tier.id} style={{ background: '#0d0d0d', padding: '2.5rem 2rem', border: `1px solid rgba(201,168,76,0.15)`, display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.15em', color: gold, marginBottom: '0.5rem' }}>{tier.name}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '32px', color: parchment, marginBottom: '1.5rem' }}>${tier.amount}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, marginBottom: '1.5rem' }}>
                  {tier.perks.map(p => (
                    <div key={p} style={{ fontSize: '14px', color: muted, lineHeight: 1.6, paddingLeft: '14px', position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 0, color: `${gold}66` }}>&middot;</span>
                      {p}
                    </div>
                  ))}
                </div>
                <button
                  onClick={(event) => openPledgeModal(tier.id, event.currentTarget)}
                  style={{
                    fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em',
                    color: '#0a0a0a', background: gold, border: 'none', height: '48px',
                    cursor: 'pointer', borderRadius: 0, width: '100%',
                  }}
                >
                  PLEDGE ${tier.amount}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ PLEDGE MODAL ═══ */}
      {pledging && (
        <div
          onClick={closePledgeModal}
          role="presentation"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pledge-dialog-title"
            aria-describedby="pledge-dialog-description"
            style={{ background: '#0d0d0d', border: `1px solid ${gold}33`, padding: '2.5rem', maxWidth: '420px', width: '100%', position: 'relative' }}
          >
            <button
              type="button"
              onClick={closePledgeModal}
              disabled={submitting}
              aria-label="Close pledge dialog"
              style={{ position: 'absolute', top: '14px', right: '14px', border: 0, background: 'transparent', color: muted, fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.12em', cursor: submitting ? 'default' : 'pointer' }}
            >
              CLOSE
            </button>
            <form onSubmit={handlePledge}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.15em', color: gold, marginBottom: '0.5rem' }}>
                {selectedTier?.name}
              </div>
              <div id="pledge-dialog-title" style={{ fontFamily: 'Cinzel, serif', fontSize: '24px', color: parchment, marginBottom: '1.5rem' }}>
                ${selectedTier?.amount} Pledge
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '1.5rem' }}>
                <label htmlFor="pledge-email" style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.14em', color: gold }}>
                  EMAIL FOR RECEIPT AND FULFILLMENT
                </label>
                <input ref={emailInputRef} id="pledge-email" value={pledgeEmail} onChange={e => setPledgeEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" type="email" required maxLength={254} style={inputStyle} />
              </div>
              <p id="pledge-dialog-description" style={{ fontSize: '13px', color: muted, lineHeight: 1.6, marginBottom: '1.5rem' }}>
                You will be redirected to Stripe for secure card payment. The selected tier includes the benefits listed on this page. Society records only the minimum information needed to reconcile and fulfill the pledge.
              </p>
              <button type="submit" disabled={submitting} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, border: 'none', height: '48px', cursor: 'pointer', borderRadius: 0, width: '100%', opacity: submitting ? 0.5 : 1 }}>
                {submitting ? 'REDIRECTING TO STRIPE...' : 'PAY WITH CARD'}
              </button>
              {checkoutError && (
                <p role="alert" aria-live="polite" style={{ color: '#d8a28f', fontSize: '13px', lineHeight: 1.5, margin: '1rem 0 0' }}>
                  {checkoutError}
                </p>
              )}
            </form>
          </div>
        </div>
      )}

      {/* ═══ PROGRESS ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: '#0d0d0d', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '1rem' }}>FUNDING PROGRESS</div>
          </div>
          <div style={{ height: '12px', background: '#1a1a1a', borderRadius: '6px', overflow: 'hidden', marginBottom: '1rem' }}>
            <div style={{ height: '100%', width: `${progressPct}%`, background: `linear-gradient(90deg, ${gold}, #d4b85a)`, borderRadius: '6px', transition: 'width 1s ease' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: '18px', color: parchment }}>${totalRaised.toLocaleString()} raised</span>
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: '18px', color: muted }}>${goal.toLocaleString()} goal</span>
          </div>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <span style={{ fontSize: '14px', color: muted }}>{backerCount} backer{backerCount !== 1 ? 's' : ''}</span>
          </div>
          <p style={{ fontSize: '16px', color: muted, lineHeight: 1.8, textAlign: 'center' }}>
            Progress is tracked from paid pledge events. Public updates should show what has been collected, what is being considered, and what decisions remain before any physical buildout begins.
          </p>
        </div>
      </section>

      {/* ═══ PAYMENT BOUNDARY ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: '#0a0a0a', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '1rem' }}>TRACKED PAYMENTS ONLY</div>
          <p style={{ fontSize: '18px', color: ivory85, lineHeight: 1.8, marginBottom: '2rem' }}>
            Crypto pledging is not enabled. Please do not send funds directly to a wallet. Card checkout keeps every pledge tied to a receipt, a verified payment event, and the correct patron benefits.
          </p>
          <p style={{ fontSize: '14px', color: muted, margin: 0 }}>
            This protects patron sovereignty: no ambiguous transfer, no missing attribution, and no benefit decision based on an unverified wallet payment.
          </p>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
