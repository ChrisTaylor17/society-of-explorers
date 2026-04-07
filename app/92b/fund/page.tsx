'use client';
import { useState, useEffect } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

const TIERS = [
  {
    id: 'supporter', name: 'SUPPORTER', amount: 25,
    perks: ['Your name on the Founders Wall', 'Exclusive updates on construction', '50 $EXP tokens'],
  },
  {
    id: 'patron', name: 'PATRON', amount: 100,
    perks: ['Everything in Supporter', 'Invitation to the Grand Opening dinner', '1 month free Seeker membership', '200 $EXP tokens'],
  },
  {
    id: 'founder', name: 'RENAISSANCE FOUNDER', amount: 500,
    perks: ['Everything in Patron', 'Lifetime founding member status', 'Your name engraved on the building', 'Private Council Mode session with all 6 thinkers', '1,000 $EXP tokens', '1 year Philosopher membership'],
  },
];

export default function FundPage() {
  const [pledging, setPledging] = useState<string | null>(null);
  const [pledgeName, setPledgeName] = useState('');
  const [pledgeEmail, setPledgeEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

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

  async function handlePledge(e: React.FormEvent) {
    e.preventDefault();
    if (!pledgeName.trim() || !pledgeEmail.trim() || !pledging) return;
    const tier = TIERS.find(t => t.id === pledging);
    if (!tier) return;
    setSubmitting(true);
    try {
      await fetch('/api/92b/pledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: tier.name, amount: tier.amount, name: pledgeName.trim(), email: pledgeEmail.trim() }),
      });
      setSuccess(true);
    } catch {}
    setSubmitting(false);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#111', border: `1px solid ${gold}22`, padding: '14px 16px',
    fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', color: parchment,
    outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      {/* ═══ HERO ═══ */}
      <section
        data-parallax
        style={{
          minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '8rem 2rem 6rem', position: 'relative',
          backgroundImage: 'linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url("/images/hero-renaissance.jpeg")',
          backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed',
        }}
      >
        <div style={{ maxWidth: '720px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1.5rem' }}>FUND THE SALON</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(36px, 7vw, 56px)', fontWeight: 400, lineHeight: 1.15, marginBottom: '1.5rem', color: parchment }}>
            Help build the first Renaissance space
          </h1>
          <p style={{ fontSize: '20px', color: ivory85, lineHeight: 1.8, maxWidth: '600px', margin: '0 auto' }}>
            Every pledge brings 92B South St closer to opening. Choose your level and become a founding patron.
          </p>
        </div>
      </section>

      {/* ═══ PLEDGE TIERS ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: '#0a0a0a', opacity: 0, transition: 'opacity 0.9s ease' }}>
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
                  onClick={() => { setPledging(tier.id); setSuccess(false); }}
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
          onClick={() => { if (!submitting) setPledging(null); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: '#0d0d0d', border: `1px solid ${gold}33`, padding: '2.5rem', maxWidth: '420px', width: '100%' }}>
            {success ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.15em', color: gold, marginBottom: '1rem' }}>PLEDGE RECEIVED</div>
                <p style={{ fontSize: '18px', color: ivory85, lineHeight: 1.7, marginBottom: '1.5rem' }}>
                  Thank you for becoming a founding patron. We'll be in touch with next steps.
                </p>
                <button onClick={() => setPledging(null)} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, border: 'none', height: '48px', padding: '0 28px', cursor: 'pointer', borderRadius: 0 }}>CLOSE</button>
              </div>
            ) : (
              <form onSubmit={handlePledge}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.15em', color: gold, marginBottom: '0.5rem' }}>
                  {TIERS.find(t => t.id === pledging)?.name}
                </div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '24px', color: parchment, marginBottom: '1.5rem' }}>
                  ${TIERS.find(t => t.id === pledging)?.amount} Pledge
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '1.5rem' }}>
                  <input value={pledgeName} onChange={e => setPledgeName(e.target.value)} placeholder="Your name" required style={inputStyle} />
                  <input value={pledgeEmail} onChange={e => setPledgeEmail(e.target.value)} placeholder="Your email" type="email" required style={inputStyle} />
                </div>
                <p style={{ fontSize: '13px', color: muted, lineHeight: 1.6, marginBottom: '1.5rem' }}>
                  This records your pledge intent. Payment processing will be set up shortly — we'll email you when it's ready.
                </p>
                <button type="submit" disabled={submitting} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, border: 'none', height: '48px', cursor: 'pointer', borderRadius: 0, width: '100%', opacity: submitting ? 0.5 : 1 }}>
                  {submitting ? 'SUBMITTING...' : 'CONFIRM PLEDGE'}
                </button>
              </form>
            )}
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
            <div style={{ height: '100%', width: '0%', background: `linear-gradient(90deg, ${gold}, #d4b85a)`, borderRadius: '6px', transition: 'width 1s ease' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: '18px', color: parchment }}>$0 raised</span>
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: '18px', color: muted }}>$120,000 goal</span>
          </div>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <span style={{ fontSize: '14px', color: muted }}>0 backers</span>
          </div>
          <p style={{ fontSize: '16px', color: muted, lineHeight: 1.8, textAlign: 'center' }}>
            Funds will be held in transparent escrow. Milestone-based releases. Full accountability.
          </p>
        </div>
      </section>

      {/* ═══ CRYPTO ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: '#0a0a0a', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '1rem' }}>PAY WITH CRYPTO</div>
          <p style={{ fontSize: '18px', color: ivory85, lineHeight: 1.8, marginBottom: '2rem' }}>
            Send SOL, ETH, or USDC directly. All crypto pledges receive bonus $EXP.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ background: '#0d0d0d', border: `1px solid rgba(201,168,76,0.15)`, padding: '1.25rem' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: gold, marginBottom: '0.5rem' }}>ETH / BASE / USDC</div>
              <div style={{ fontSize: '13px', color: muted, wordBreak: 'break-all', fontFamily: 'monospace' }}>0x22fEA1dd7626f0eB50861daDC01F60f7336f135c</div>
            </div>
            <div style={{ background: '#0d0d0d', border: `1px solid rgba(201,168,76,0.15)`, padding: '1.25rem' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: gold, marginBottom: '0.5rem' }}>SOLANA</div>
              <div style={{ fontSize: '14px', color: muted, fontStyle: 'italic' }}>Address coming soon</div>
            </div>
          </div>
          <p style={{ fontSize: '14px', color: muted, marginTop: '1.5rem' }}>
            Contact <a href="mailto:chris@societyofexplorers.com" style={{ color: gold, textDecoration: 'none' }}>chris@societyofexplorers.com</a> for crypto pledges over $1,000
          </p>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
