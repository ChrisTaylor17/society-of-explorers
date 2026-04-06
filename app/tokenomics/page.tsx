'use client';
import { useState, useEffect } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

const amber = '#f59e0b';
const slate950 = '#020617';
const slate900 = '#0f172a';
const slate800 = '#1e293b';
const parchment = '#E8DCC8';
const muted = '#94a3b8';

const EARN_METHODS = [
  { action: 'Node Hosting', exp: 'Variable', icon: '🖥️', desc: 'Run an AI thinker node. Rewards scale with uptime and query volume.' },
  { action: 'Space Scanning', exp: '10–50', icon: '📸', desc: 'Photograph or 3D-scan real spaces. Quality tier determines reward.' },
  { action: 'Salon Attendance', exp: '8', icon: '🏛️', desc: 'Attend a live salon gathering — in-person or virtual.' },
  { action: 'Great Books Discussion', exp: '5', icon: '📖', desc: 'Contribute to a Great Books seminar or reading group.' },
  { action: 'Music Collaboration', exp: '12', icon: '🎵', desc: 'Co-create in a music session — composition, performance, or remix.' },
  { action: 'Biofeedback Circle', exp: '10', icon: '💓', desc: 'Participate in a coherence circle with EEG/HRV data.' },
  { action: 'Hosting Travelers', exp: '15', icon: '🏡', desc: 'Host an explorer at your space via Dtravel. Per booking.' },
  { action: 'Annotations', exp: '3', icon: '🖊️', desc: 'Leave a spatial annotation (White Knight Pen) on a scanned space.' },
];

const BURN_USES = [
  { use: 'Premium Mesh Access', icon: '🌐', desc: 'Unlock priority bandwidth on the decentralized thinker mesh network.' },
  { use: 'Extended AI Thinker Sessions', icon: 'Σ', desc: 'Longer, deeper conversations with philosophical AI beyond standard limits.' },
  { use: 'VR/AR Unlocks', icon: '🥽', desc: 'Access immersive spatial experiences of scanned explorer spaces.' },
  { use: 'Governance Weight', icon: '⚖️', desc: 'Burn $EXP to increase your vote weight on Commons proposals.' },
  { use: 'Priority Commons Booking', icon: '📅', desc: 'Reserve time-slots at physical salons and pop-up spaces first.' },
];

const FAQS = [
  {
    q: 'Can I sell $EXP?',
    a: 'No. $EXP is soulbound — minted to your wallet using Solana Token-2022 NonTransferable extension. It cannot be listed, transferred, or traded on any marketplace. This is by design: reputation should be earned, not bought.',
  },
  {
    q: 'How do Commons Shares work?',
    a: 'Commons Shares are soulbound NFTs that represent fractional ownership in a specific city expansion. They are issued when the community funds a new physical space via Realms governance. Shares entitle holders to booking priority and governance votes for that location — but cannot be sold or transferred.',
  },
  {
    q: 'What blockchain?',
    a: 'Solana, using the Token-2022 program. We chose Solana for sub-second finality, negligible fees, and native support for the NonTransferable extension — no custom smart contract needed for soulbound logic.',
  },
  {
    q: 'Is this a security?',
    a: '$EXP is not a security. It has no monetary value, cannot be exchanged for currency, and confers no equity or profit-sharing. It is a non-transferable reputation token — closer to a library card than a stock certificate. Commons Shares similarly represent governance rights, not financial instruments.',
  },
];

const MOCK_STATS = [
  { label: 'Total $EXP Minted', value: '184,720' },
  { label: 'Active Earners', value: '342' },
  { label: 'Spaces Scanned', value: '47' },
  { label: 'Nodes Online', value: '12' },
];

export default function TokenomicsPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) (e.target as HTMLElement).style.opacity = '1'; });
    }, { threshold: 0.1 });
    document.querySelectorAll('[data-fade]').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: slate950, color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      {/* ═══ HERO ═══ */}
      <section style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8rem 2rem 6rem', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.03, pointerEvents: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'%3E%3Cpath d='M30 5L55 20V40L30 55L5 40V20Z' fill='none' stroke='%23f59e0b' stroke-width='0.3'/%3E%3C/svg%3E")`, backgroundSize: '60px 60px' }} />
        <div style={{ maxWidth: '720px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.5em', color: amber, opacity: 0.6, marginBottom: '1.5rem' }}>EXPLORER COMMONS · TOKEN MODEL</div>
          <h1 style={{ fontFamily: 'Playfair Display, Cinzel, serif', fontSize: 'clamp(2.4rem, 6vw, 4.5rem)', fontWeight: 400, letterSpacing: '0.02em', lineHeight: 1.15, color: '#f8fafc', marginBottom: '1.5rem' }}>
            $EXP — Sovereign<br />Reputation
          </h1>
          <p style={{ fontSize: '1.3rem', color: muted, lineHeight: 1.7, maxWidth: '480px', margin: '0 auto 2rem' }}>
            Earned. Soulbound. Non-transferable.
          </p>
          <p style={{ fontSize: '1rem', color: `${muted}cc`, lineHeight: 1.8, maxWidth: '520px', margin: '0 auto' }}>
            $EXP is the reputation token of the Explorer Commons. You earn it by contributing — scanning spaces, attending salons, hosting travelers, running nodes. You can never buy it, sell it, or transfer it. It is proof of participation, not speculation.
          </p>
        </div>
      </section>

      {/* ═══ HOW YOU EARN ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: slate900, opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: amber, opacity: 0.5, marginBottom: '0.75rem' }}>EARNING</div>
            <h2 style={{ fontFamily: 'Playfair Display, Cinzel, serif', fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)', fontWeight: 400, letterSpacing: '0.02em', color: '#f8fafc' }}>How You Earn $EXP</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1px', background: `${amber}10` }}>
            {EARN_METHODS.map(m => (
              <div key={m.action} style={{ background: slate950, padding: '1.75rem 1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>{m.icon}</span>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', color: amber }}>{m.exp}</span>
                </div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.08em', color: '#f8fafc', marginBottom: '0.5rem' }}>{m.action}</div>
                <p style={{ fontSize: '13px', color: muted, lineHeight: 1.7 }}>{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ HOW YOU BURN ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: amber, opacity: 0.5, marginBottom: '0.75rem' }}>BURNING</div>
            <h2 style={{ fontFamily: 'Playfair Display, Cinzel, serif', fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)', fontWeight: 400, letterSpacing: '0.02em', color: '#f8fafc' }}>How You Burn $EXP</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1px', background: `${amber}10` }}>
            {BURN_USES.map(b => (
              <div key={b.use} style={{ background: slate900, padding: '2rem 1.5rem' }}>
                <div style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>{b.icon}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.08em', color: '#f8fafc', marginBottom: '0.5rem' }}>{b.use}</div>
                <p style={{ fontSize: '13px', color: muted, lineHeight: 1.7 }}>{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ THE SOULBOUND PROMISE ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: slate900, opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: amber, opacity: 0.5, marginBottom: '0.75rem' }}>SOULBOUND</div>
          <h2 style={{ fontFamily: 'Playfair Display, Cinzel, serif', fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)', fontWeight: 400, letterSpacing: '0.02em', color: '#f8fafc', marginBottom: '1.5rem' }}>The Soulbound Promise</h2>

          <div style={{ background: slate950, border: `1px solid ${amber}22`, padding: '2.5rem 2rem', textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem', paddingBottom: '1.5rem', borderBottom: `1px solid ${amber}12` }}>
              <div style={{ width: '48px', height: '48px', background: `${amber}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel, serif', fontSize: '20px', color: amber }}>⬡</div>
              <div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.1em', color: '#f8fafc' }}>Solana Token-2022</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.15em', color: muted }}>NONTRANSFERABLE EXTENSION</div>
              </div>
            </div>

            {[
              { label: 'Cannot be sold', desc: 'No marketplace listing, no OTC deals. The token program itself rejects transfer instructions.' },
              { label: 'Cannot be transferred', desc: 'Minted directly to your wallet. The NonTransferable extension makes movement between wallets impossible at the protocol level.' },
              { label: 'Proof of participation', desc: 'Your $EXP balance is a living résumé — it reflects what you have actually done in the Commons, not what you paid.' },
              { label: 'Not speculation', desc: 'There is no price, no liquidity pool, no exchange. $EXP exists outside the financialisation loop entirely.' },
            ].map((item, i) => (
              <div key={i} style={{ marginBottom: i < 3 ? '1.25rem' : 0 }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.08em', color: amber, marginBottom: '0.35rem' }}>{item.label}</div>
                <p style={{ fontSize: '14px', color: muted, lineHeight: 1.8 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ COMMONS SHARES ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: amber, opacity: 0.5, marginBottom: '0.75rem' }}>GOVERNANCE</div>
            <h2 style={{ fontFamily: 'Playfair Display, Cinzel, serif', fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)', fontWeight: 400, letterSpacing: '0.02em', color: '#f8fafc', marginBottom: '0.75rem' }}>Commons Shares</h2>
            <p style={{ fontSize: '1rem', color: muted, lineHeight: 1.8, maxWidth: '520px', margin: '0 auto' }}>
              Soulbound NFTs that fund and govern real-world expansions of the Explorer Commons.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1px', background: `${amber}10`, marginBottom: '2rem' }}>
            {[
              { title: 'City Expansions', icon: '🏙️', desc: 'When the community votes to open a new physical salon, Commons Shares fund the buildout. Each share is a soulbound NFT tied to that specific location.' },
              { title: 'Realms Governance', icon: '🗳️', desc: 'Proposals, votes, and treasury management happen on Realms — Solana-native DAO tooling. Your $EXP and Commons Shares determine your voting weight.' },
              { title: 'Squads Multisig', icon: '🔐', desc: 'Treasury funds are held in a Squads multisig. No single person can move funds. Execution requires threshold approval from elected stewards.' },
            ].map(card => (
              <div key={card.title} style={{ background: slate900, padding: '2rem 1.5rem' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>{card.icon}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.08em', color: '#f8fafc', marginBottom: '0.5rem' }}>{card.title}</div>
                <p style={{ fontSize: '13px', color: muted, lineHeight: 1.8 }}>{card.desc}</p>
              </div>
            ))}
          </div>

          <div style={{ textAlign: 'center', fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.15em', color: muted, opacity: 0.5 }}>
            COMMONS SHARES ARE NON-TRANSFERABLE · NO SECONDARY MARKET · GOVERNANCE RIGHTS ONLY
          </div>
        </div>
      </section>

      {/* ═══ LIVE STATS ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: slate900, opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: amber, opacity: 0.5, marginBottom: '0.75rem' }}>NETWORK</div>
            <h2 style={{ fontFamily: 'Playfair Display, Cinzel, serif', fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)', fontWeight: 400, letterSpacing: '0.02em', color: '#f8fafc' }}>Live Stats</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1px', background: `${amber}12` }}>
            {MOCK_STATS.map(stat => (
              <div key={stat.label} style={{ background: slate950, padding: '2rem 1rem', textAlign: 'center' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 3.5vw, 2.5rem)', color: amber, marginBottom: '0.35rem' }}>{stat.value}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.15em', color: muted }}>{stat.label.toUpperCase()}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FAQ ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: amber, opacity: 0.5, marginBottom: '0.75rem' }}>QUESTIONS</div>
            <h2 style={{ fontFamily: 'Playfair Display, Cinzel, serif', fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)', fontWeight: 400, letterSpacing: '0.02em', color: '#f8fafc' }}>Frequently Asked</h2>
          </div>
          <div>
            {FAQS.map((faq, i) => (
              <div key={i} style={{ borderBottom: i < FAQS.length - 1 ? `1px solid ${amber}12` : 'none' }}>
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  style={{
                    width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
                    padding: '1.25rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}
                >
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.06em', color: '#f8fafc' }}>{faq.q}</span>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '16px', color: amber, opacity: 0.5, transform: openFaq === i ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s' }}>+</span>
                </button>
                {openFaq === i && (
                  <div style={{ paddingBottom: '1.25rem' }}>
                    <p style={{ fontSize: '14px', color: muted, lineHeight: 1.8 }}>{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: slate900, textAlign: 'center', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '480px', margin: '0 auto' }}>
          <h2 style={{ fontFamily: 'Playfair Display, Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2.2rem)', fontWeight: 400, letterSpacing: '0.02em', color: '#f8fafc', marginBottom: '1rem' }}>Start earning $EXP</h2>
          <p style={{ fontSize: '1rem', color: muted, lineHeight: 1.8, marginBottom: '2rem' }}>Join the Society. Scan a space. Attend a salon. Your reputation begins with a single action.</p>
          <a href="/join" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: slate950, background: amber, padding: '14px 36px', textDecoration: 'none', display: 'inline-block' }}>Join the Society →</a>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
