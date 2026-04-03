'use client';
import { useState } from 'react';

export default function JoinPage() {
  const FOUNDING = 'https://buy.stripe.com/7sY7sE0Ic3lQ1wifXC9oc00';
  const SALON    = 'https://buy.stripe.com/00w9AM62w8Gaej49ze9oc01';
  const DIGITAL  = 'https://buy.stripe.com/9B6fZabmQ3lQ0sebHm9oc02';

  const gold    = '#c9a84c';
  const dim     = '#d4c9a8';
  const muted   = '#9a8f7a';
  const bg      = '#000';
  const bgCard  = '#0a0a0a';
  const border  = 'rgba(201,168,76,0.2)';

  const [interestName,  setInterestName]  = useState('');
  const [interestEmail, setInterestEmail] = useState('');
  const [interestWhy,   setInterestWhy]   = useState('');
  const [submitted,     setSubmitted]     = useState(false);
  const [submitting,    setSubmitting]    = useState(false);

  async function submitInterest(e: React.FormEvent) {
    e.preventDefault();
    if (!interestName || !interestEmail) return;
    setSubmitting(true);
    try {
      await fetch('/api/founding-interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: interestName, email: interestEmail, why: interestWhy }),
      });
      setSubmitted(true);
    } catch {
      setSubmitted(true);
    }
    setSubmitting(false);
  }

  return (
    <div style={{ minHeight: '100vh', background: bg, color: '#fff', fontFamily: 'Cormorant Garamond, serif', overflowX: 'hidden' }}>

      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to bottom, #000, transparent)' }}>
        <a href="/salon" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, textDecoration: 'none', opacity: 0.7 }}>← RETURN TO THE SALON</a>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5 }}>SOCIETY OF EXPLORERS</div>
      </nav>

      {/* HERO */}
      <section style={{ minHeight: '85vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(ellipse at center, #0d0a00 0%, #000 70%)', textAlign: 'center', padding: '7rem 2rem 4rem' }}>
        <div style={{ maxWidth: '780px' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.5em', color: gold, opacity: 0.5, marginBottom: '2rem' }}>THE SACRED INVITATION</div>
          <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(2.8rem, 8vw, 5.5rem)', fontWeight: 300, letterSpacing: '0.15em', lineHeight: 1.1, marginBottom: '2rem' }}>
            JOIN THE<br /><span style={{ color: gold }}>SOCIETY</span>
          </h1>
          <div style={{ width: '60px', height: '1px', background: gold, margin: '0 auto 2.5rem', opacity: 0.4 }} />
          <p style={{ fontSize: '1.35rem', color: dim, lineHeight: 1.9, marginBottom: '1.5rem', maxWidth: '600px', margin: '0 auto 1.5rem' }}>
            A private salon where the greatest minds of history help you build the future. Beauty and the pursuit of truth — in Boston and online.
          </p>
          <p style={{ fontSize: '1.1rem', color: muted, fontStyle: 'italic', lineHeight: 1.8 }}>
            You don&apos;t subscribe to the Society of Explorers. You are initiated into it.
          </p>
        </div>
      </section>

      {/* FOUNDING MEMBER — FRONT AND CENTER */}
      <section style={{ padding: '6rem 2rem', background: 'radial-gradient(ellipse at center, #1a1200 0%, #050505 60%)' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.4em', color: gold, opacity: 0.6, marginBottom: '1rem' }}>TEN SEATS. ONE PRICE. NEVER AGAIN.</div>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 300, letterSpacing: '0.12em', color: gold, marginBottom: '1.5rem', lineHeight: 1.2 }}>
            FOUNDING MEMBER
          </h2>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(3rem, 8vw, 6rem)', color: gold, lineHeight: 1, marginBottom: '0.5rem' }}>$499</div>
          <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1rem', color: muted, fontStyle: 'italic', marginBottom: '2.5rem' }}>one time · lifetime · the price never returns</div>

          <p style={{ fontSize: '1.2rem', color: dim, lineHeight: 1.9, marginBottom: '2rem', maxWidth: '640px', margin: '0 auto 2rem' }}>
            You were here at the beginning. Before the product was finished. Before the world knew what this was. You saw it, you held it, you chose it. The blockchain records your name. The network rewards you forever.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1px', background: `${gold}22`, margin: '2.5rem 0', textAlign: 'left' }}>
            {[
              { label: 'LIFETIME ACCESS', desc: 'Physical space at 92B South St. Digital platform. All thinkers. Everything, forever.' },
              { label: 'FOUNDING DINNER', desc: 'You receive your Tribekey in person. This moment is recorded on-chain. You become origin.' },
              { label: 'YOUR NAME ON THE WALL', desc: 'Engraved at 92B South St. And on the blockchain, permanently.' },
              { label: 'FOUNDING $EXP STAKE', desc: 'Maximum earning multiplier. Every act of participation rewards you at the founding rate — forever.' },
              { label: 'HARDWARE PRIORITY', desc: 'First in line for Tribekey + Crystal Hub. You are the prototype generation.' },
              { label: 'GOVERNANCE RIGHTS', desc: "You decide the Society's future. New thinkers, new rituals, new initiatives — you vote." },
            ].map(item => (
              <div key={item.label} style={{ background: '#0a0a0a', padding: '1.5rem 2rem' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, opacity: 0.8, marginBottom: '0.5rem' }}>{item.label}</div>
                <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '13px', color: muted, lineHeight: 1.6 }}>{item.desc}</p>
              </div>
            ))}
          </div>

          <a href={FOUNDING} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', fontFamily: 'Cinzel, serif', fontSize: '0.9rem', letterSpacing: '0.2em', color: '#000', background: gold, padding: '1.2rem 4rem', textDecoration: 'none', marginTop: '1rem' }}>
            CLAIM YOUR FOUNDING SEAT — $499
          </a>
          <div style={{ marginTop: '1rem', fontFamily: 'Cormorant Garamond, serif', fontSize: '12px', color: muted, fontStyle: 'italic' }}>
            10 seats total. When they&apos;re gone, this tier closes permanently.
          </div>
        </div>
      </section>

      {/* DIVIDER */}
      <div style={{ textAlign: 'center', padding: '3rem 2rem', borderTop: `1px solid ${border}`, borderBottom: `1px solid ${border}` }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: muted, opacity: 0.6 }}>OR BEGIN YOUR INITIATION WITH A MEMBERSHIP</div>
      </div>

      {/* DIGITAL + SALON TIERS */}
      <section style={{ padding: '6rem 2rem', background: '#050505' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', background: border }}>

            {/* DIGITAL */}
            <div style={{ background: bgCard, padding: '3rem 2.5rem' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.3em', color: muted, opacity: 0.7, marginBottom: '1rem' }}>THE DIGITAL INITIATION</div>
              <h3 style={{ fontFamily: 'Cinzel, serif', fontSize: '1.8rem', fontWeight: 300, letterSpacing: '0.12em', color: dim, marginBottom: '0.5rem' }}>DIGITAL</h3>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '2.5rem', color: dim, lineHeight: 1, marginBottom: '0.25rem' }}>$9.99</div>
              <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '12px', color: muted, fontStyle: 'italic', marginBottom: '2rem' }}>per month · cancel anytime</div>
              <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '14px', color: muted, lineHeight: 1.7, marginBottom: '2rem', fontStyle: 'italic' }}>
                Full access to the digital salon from anywhere in the world. The Labyrinth. The thinkers. The community.
              </p>
              <div style={{ marginBottom: '2.5rem' }}>
                {[
                  'All 6 thinker agents — Socrates, Nietzsche, Jobs and more',
                  'Productivity Hub with AI-guided task management',
                  'Full Labyrinth access — all 6 rooms',
                  'Great Books program — read with the thinkers',
                  'Member directory + messaging',
                  '$EXP token earning',
                  'Salon conversation history',
                ].map((f, i) => (
                  <div key={i} style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.6rem', alignItems: 'flex-start' }}>
                    <div style={{ color: gold, opacity: 0.4, flexShrink: 0, marginTop: '3px', fontSize: '8px' }}>⬡</div>
                    <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '14px', color: dim, lineHeight: 1.5 }}>{f}</div>
                  </div>
                ))}
              </div>
              <a href={DIGITAL} target="_blank" rel="noopener noreferrer" style={{ display: 'block', fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, border: `1px solid ${gold}`, padding: '1rem', textDecoration: 'none', textAlign: 'center' }}>
                BEGIN YOUR INITIATION
              </a>
            </div>

            {/* SALON */}
            <div style={{ background: bgCard, padding: '3rem 2.5rem', borderLeft: `1px solid ${border}` }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.3em', color: gold, opacity: 0.7, marginBottom: '1rem' }}>THE FULL EXPERIENCE</div>
              <h3 style={{ fontFamily: 'Cinzel, serif', fontSize: '1.8rem', fontWeight: 300, letterSpacing: '0.12em', color: gold, marginBottom: '0.5rem' }}>SALON</h3>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '2.5rem', color: gold, lineHeight: 1, marginBottom: '0.25rem' }}>$99</div>
              <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '12px', color: muted, fontStyle: 'italic', marginBottom: '2rem' }}>per month · the full Society experience</div>
              <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '14px', color: dim, lineHeight: 1.7, marginBottom: '2rem', fontStyle: 'italic' }}>
                Physical space and digital platform. 92B South St, downtown Boston. Monthly salon evenings. The complete life of the Society.
              </p>
              <div style={{ marginBottom: '2.5rem' }}>
                {[
                  'Physical access to 92B South St, Boston',
                  'Everything in Digital, included',
                  'Monthly salon evenings and workshops',
                  'AI matchmaking priority for deep connections',
                  'Event priority access',
                  'Higher $EXP earning multiplier',
                ].map((f, i) => (
                  <div key={i} style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.6rem', alignItems: 'flex-start' }}>
                    <div style={{ color: gold, opacity: 0.6, flexShrink: 0, marginTop: '3px', fontSize: '8px' }}>⬡</div>
                    <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '14px', color: dim, lineHeight: 1.5 }}>{f}</div>
                  </div>
                ))}
              </div>
              <a href={SALON} target="_blank" rel="noopener noreferrer" style={{ display: 'block', fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: '#000', background: gold, padding: '1rem', textDecoration: 'none', textAlign: 'center' }}>
                JOIN THE SALON
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* FOUNDING DINNER INTEREST FORM */}
      <section style={{ padding: '8rem 2rem', background: 'radial-gradient(ellipse at center, #0d0800 0%, #000 70%)' }}>
        <div style={{ maxWidth: '680px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, opacity: 0.5, marginBottom: '1.5rem' }}>THE FOUNDING DINNER</div>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.8rem, 4vw, 3rem)', fontWeight: 300, letterSpacing: '0.12em', marginBottom: '1.5rem', lineHeight: 1.2 }}>
            RESERVE YOUR SEAT<br />AT 92B SOUTH ST
          </h2>
          <div style={{ width: '40px', height: '1px', background: gold, margin: '0 auto 2rem', opacity: 0.4 }} />
          <p style={{ fontSize: '1.15rem', color: dim, lineHeight: 1.9, marginBottom: '3rem', maxWidth: '560px', margin: '0 auto 3rem' }}>
            Ten founding members. One dinner. The moment the Society of Explorers stops being a website and becomes a place. If you know you belong here, leave your name.
          </p>

          {submitted ? (
            <div style={{ padding: '3rem', border: `1px solid ${gold}44`, background: '#0a0800' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '1.5rem', color: gold, marginBottom: '1rem' }}>⬡</div>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.3em', color: gold, marginBottom: '1rem' }}>YOUR SEAT IS NOTED</div>
              <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.1rem', color: dim, lineHeight: 1.8, fontStyle: 'italic' }}>
                We will be in touch directly. The founding dinner is coming. You will hear from us before anyone else.
              </p>
            </div>
          ) : (
            <form onSubmit={submitInterest} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'left' }}>
              <div>
                <label style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, opacity: 0.7, display: 'block', marginBottom: '0.5rem' }}>YOUR NAME</label>
                <input
                  value={interestName}
                  onChange={e => setInterestName(e.target.value)}
                  required
                  placeholder="Christopher Taylor"
                  style={{ width: '100%', background: '#0a0a0a', border: `1px solid ${border}`, padding: '0.9rem 1rem', fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', color: dim, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, opacity: 0.7, display: 'block', marginBottom: '0.5rem' }}>YOUR EMAIL</label>
                <input
                  type="email"
                  value={interestEmail}
                  onChange={e => setInterestEmail(e.target.value)}
                  required
                  placeholder="you@domain.com"
                  style={{ width: '100%', background: '#0a0a0a', border: `1px solid ${border}`, padding: '0.9rem 1rem', fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', color: dim, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, opacity: 0.7, display: 'block', marginBottom: '0.5rem' }}>WHY ARE YOU AN EXPLORER? <span style={{ opacity: 0.4 }}>(OPTIONAL)</span></label>
                <textarea
                  value={interestWhy}
                  onChange={e => setInterestWhy(e.target.value)}
                  rows={4}
                  placeholder="What brought you here. What you are building. What question you can't stop asking."
                  style={{ width: '100%', background: '#0a0a0a', border: `1px solid ${border}`, padding: '0.9rem 1rem', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: dim, outline: 'none', resize: 'vertical', lineHeight: 1.7, boxSizing: 'border-box' }}
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.25em', color: '#000', background: submitting ? `${gold}88` : gold, border: 'none', padding: '1.1rem 2rem', cursor: submitting ? 'not-allowed' : 'pointer', marginTop: '0.5rem' }}
              >
                {submitting ? 'NOTING YOUR SEAT...' : 'I AM IN — RESERVE MY SEAT'}
              </button>
              <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '12px', color: muted, fontStyle: 'italic', textAlign: 'center', opacity: 0.7 }}>
                This does not obligate you to purchase. We will reach out directly with details.
              </p>
            </form>
          )}
        </div>
      </section>

      {/* WHAT YOU ARE JOINING */}
      <section style={{ padding: '6rem 2rem', background: '#050505' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, opacity: 0.5, marginBottom: '2rem' }}>WHAT YOU ARE JOINING</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: border }}>
            {[
              { symbol: 'Σ', label: 'THE SALON', desc: 'Six thinkers from history, ready to counsel you. Socrates. Nietzsche. Einstein. Jobs. Not chatbots — philosophical agents built to provoke, challenge, and reveal.' },
              { symbol: '⬡', label: 'THE LABYRINTH', desc: 'A guided journey through existence, creation, technology, and beauty. Rooms that open into rooms. Secret passages for those who are ready.' },
              { symbol: '◈', label: 'THE GREAT BOOKS', desc: 'Read Plato, Nietzsche, Homer, and Shakespeare alongside AI thinkers who annotate in the margin. Highlight any passage — a mind responds.' },
            ].map(item => (
              <div key={item.label} style={{ background: bgCard, padding: '2.5rem 2rem', textAlign: 'center' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '2rem', color: gold, opacity: 0.3, marginBottom: '1rem' }}>{item.symbol}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, marginBottom: '1rem' }}>{item.label}</div>
                <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '13px', color: muted, lineHeight: 1.7 }}>{item.desc}</p>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: '2rem' }}>
            <a href="/three-pillars" style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, textDecoration: 'none', opacity: 0.6 }}>
              READ ABOUT OUR THREE-PILLAR STRUCTURE &rarr;
            </a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <div style={{ textAlign: 'center', padding: '3rem 2rem', borderTop: `1px solid ${border}` }}>
        <div style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', fontSize: '14px', color: muted, lineHeight: 1.8, marginBottom: '0.5rem' }}>
          Questions? Email <span style={{ color: gold }}>chris@societyofexplorers.com</span>
        </div>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, opacity: 0.4 }}>
          92B SOUTH ST · DOWNTOWN BOSTON · SOCIETYOFEXPLORERS.COM
        </div>
      </div>
    </div>
  );
}
