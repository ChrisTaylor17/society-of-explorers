import { Metadata } from 'next';
import Link from 'next/link';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

export const metadata: Metadata = {
  title: 'The Data Layer',
  description: 'Research directions for data control, identity, compute and AI governance, distinguished from the current public reading experience.',
};

export default function DataLayer() {
  const gold = '#C5A55A';
  const text = '#E8DCC8';
  const muted = '#9a8f7a';
  const bg = '#0A0A0A';
  const bgCard = '#0d0d0d';
  const border = `${gold}22`;

  return (
    <div className="soe-data-layer" style={{ minHeight: '100vh', background: bg, color: text, fontFamily: 'Cormorant Garamond, serif' }}>
      <style>{`.soe-data-layer * { box-sizing: border-box; } .soe-data-layer a:focus-visible { outline: 3px solid #e8cf83; outline-offset: 4px; } .soe-data-layer p { overflow-wrap: anywhere; }`}</style>

      {/* NAV */}
      <PublicNav />

      <main id="main" tabIndex={-1}>
      {/* HERO */}
      <section style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', textAlign: 'center', padding: '6rem 2rem 4rem' }}>
        {/* Hexagonal grid pattern */}
        <div style={{ position: 'absolute', inset: 0, opacity: 0.03, pointerEvents: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='100' viewBox='0 0 56 100'%3E%3Cpath d='M28 66L0 50L0 16L28 0L56 16L56 50L28 66L28 100' fill='none' stroke='%23C5A55A' stroke-width='1'/%3E%3Cpath d='M28 0L28 34L0 50L0 84L28 100L56 84L56 50L28 34' fill='none' stroke='%23C5A55A' stroke-width='1'/%3E%3C/svg%3E")`, backgroundSize: '56px 100px' }} />
        <div style={{ maxWidth: '700px', position: 'relative', zIndex: 1 }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.5em', color: gold, marginBottom: '2rem' }}>RESEARCH DIRECTION</div>
          <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(2.5rem, 7vw, 5rem)', fontWeight: 300, letterSpacing: '0.15em', lineHeight: 1.1, marginBottom: '2rem' }}>
            THE DATA LAYER
          </h1>
          <div style={{ width: '60px', height: '1px', background: gold, margin: '0 auto 2rem', opacity: 0.4 }} />
          <p style={{ fontSize: '1.3rem', color: muted, lineHeight: 1.9, fontStyle: 'italic' }}>
            Exploring infrastructure that gives people more choice over their data
          </p>
          <p style={{ fontSize: '1.05rem', lineHeight: 1.7, color: text, marginTop: '1.5rem' }}>Proposed architecture. The current public experience provides readings and planning tools; it does not establish decentralized custody, token rewards or property access.</p>
        </div>
      </section>

      {/* SECTION 1: THE THESIS */}
      <section style={{ padding: '8rem 2rem', maxWidth: '680px', margin: '0 auto' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.3em', color: gold, marginBottom: '1rem' }}>I.</div>
        <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '2rem', borderBottom: `1px solid ${border}`, paddingBottom: '1rem' }}>
          THE PROBLEM
        </h2>
        <p style={{ fontSize: '1.15rem', lineHeight: 2, marginBottom: '2rem' }}>
          Many online services make it hard to understand where information goes, move it elsewhere or decide how it is used. We want tools that explain those choices clearly and let people exercise meaningful control. That is a design goal to test, not a claim that every part of it has been achieved.
        </p>
        <p style={{ fontSize: '1.15rem', lineHeight: 2 }}>
          Society of Explorers is a community and product, with a possible role as an incubator. The longer-term data vision includes portable records, explicit sharing choices and tools directed by their users. Private conversations should not become a contribution score or an AI input merely because they happen in the app.
        </p>
        <div style={{ width: '100px', height: '1px', background: gold, margin: '4rem auto', opacity: 0.3 }} />
      </section>

      {/* SECTION 2: THE ARCHITECTURE */}
      <section style={{ padding: '6rem 2rem', background: '#050505' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.3em', color: gold, marginBottom: '1rem', textAlign: 'center' }}>II.</div>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '4rem', textAlign: 'center', borderBottom: `1px solid ${border}`, paddingBottom: '1rem' }}>
            THREE LAYERS
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '1px', background: `${gold}15` }}>
            {[
              {
                icon: '⬡',
                title: 'SOVEREIGN IDENTITY',
                body: 'TribeKey explores portable identity and physical access. Wallet credentials, device access and a possible on-chain membership record are distinct proposals. They do not establish current self-custody, universal encryption or an account that cannot be removed. Recovery, consent and practical portability must be demonstrated.',
              },
              {
                icon: '◇',
                title: 'DECENTRALIZED COMPUTE',
                body: 'ExploreOS is a research direction for running selected AI work on distributed or locally controlled infrastructure. A community-operated inference network has not been established here. Any experiment must compare privacy, reliability, energy use and operating cost with simpler hosted or local alternatives.',
              },
              {
                icon: '◎',
                title: 'AI ORCHESTRATION',
                body: 'The thinker-persona work explores AI assistance inspired by historical figures. Availability depends on the configured provider and the feature being used. Future local models or community governance remain options to evaluate; people remain responsible for permissions, sources, decisions and corrections.',
              },
            ].map(col => (
              <div key={col.title} style={{ background: bgCard, padding: '3rem 2.5rem' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '2rem', color: gold, opacity: 0.2, marginBottom: '1.5rem' }}>{col.icon}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.2em', color: gold, marginBottom: '1.5rem' }}>{col.title}</div>
                <p style={{ fontSize: '1.05rem', color: muted, lineHeight: 1.9 }}>{col.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 3: THE STACK */}
      <section style={{ padding: '8rem 2rem', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.3em', color: gold, marginBottom: '1rem' }}>III.</div>
        <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '3rem', borderBottom: `1px solid ${border}`, paddingBottom: '1rem' }}>
          ARCHITECTURE OPTIONS TO EVALUATE
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {[
            { label: 'CONTRIBUTIONS', components: 'Recognition and compensation choices · Non-token alternatives · Clear contributor terms', accent: gold },
            { label: 'DATA CONTROL', components: 'Explicit sharing · Export and recovery · Storage choices · Verified access rules', accent: '#6B9E6B' },
            { label: 'COMPUTE', components: 'Hosted or local inference · Measured cost and privacy · Distributed-node research', accent: '#7C9EBF' },
            { label: 'IDENTITY', components: 'Accounts and recovery · Optional wallet or device credentials · Independent proof before claims', accent: '#BF8040' },
          ].map(layer => (
            <div key={layer.label} style={{ background: bgCard, padding: '1.5rem 2rem', borderLeft: `3px solid ${layer.accent}`, display: 'flex', alignItems: 'center', gap: '2rem', flexWrap: 'wrap' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.2em', color: layer.accent, minWidth: '120px', flexShrink: 0 }}>{layer.label}</div>
              <div style={{ fontSize: '0.95rem', color: muted, letterSpacing: '0.02em' }}>{layer.components}</div>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 4: THE ECONOMICS */}
      <section style={{ padding: '6rem 2rem', background: '#050505' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.3em', color: gold, marginBottom: '1rem', textAlign: 'center' }}>IV.</div>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '2rem', textAlign: 'center', borderBottom: `1px solid ${border}`, paddingBottom: '1rem' }}>
            CONTRIBUTIONS AND GOVERNANCE
          </h2>
          <p style={{ fontSize: '1.15rem', lineHeight: 2, textAlign: 'center', maxWidth: '680px', margin: '0 auto 3rem', color: muted }}>
            Contribution recognition, compensation and governance need clear terms and evidence of value. EXP-style points, tokens and community treasuries remain research ideas. This page offers no earnings, staking, redemption, voting right or investment. Legal, tax, securities and custody questions require qualified review before any such offer.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '1px', background: `${gold}15` }}>
            {[
              { title: 'RECOGNIZE', items: ['Ask contributors how they want credit', 'Distinguish voluntary help from paid work', 'Keep private reading and conversation out of public rankings'] },
              { title: 'COMPARE', items: ['Ordinary payment and written agreements', 'Optional nonfinancial recognition', 'A token only if it solves a demonstrated problem'] },
              { title: 'DECIDE', items: ['Who owns an asset or contribution', 'Who can authorize costs and changes', 'How conflicts and appeals are handled', 'What evidence an experiment must produce'] },
            ].map(card => (
              <div key={card.title} style={{ background: bgCard, padding: '2.5rem 2rem' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.25em', color: gold, marginBottom: '1.5rem' }}>{card.title}</div>
                {card.items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.6rem', alignItems: 'flex-start' }}>
                    <div style={{ color: gold, flexShrink: 0, marginTop: '4px', fontSize: '12px' }}>&#x2B21;</div>
                    <div style={{ fontSize: '0.95rem', color: muted, lineHeight: 1.6 }}>{item}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 5: ROBOTICS */}
      <section style={{ padding: '8rem 2rem', maxWidth: '680px', margin: '0 auto' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.3em', color: gold, marginBottom: '1rem' }}>V.</div>
        <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '2rem', borderBottom: `1px solid ${border}`, paddingBottom: '1rem' }}>
          BEYOND THE SCREEN
        </h2>
        <p style={{ fontSize: '1.15rem', lineHeight: 2, marginBottom: '2rem' }}>
          TribeKey and Crystal Hub explore physical interaction with identity, AI and shared spaces. Device integration, access permissions and support need independent verification. The earlier 92B South St proposal does not establish an operating Society venue or a right to enter a property.
        </p>
        <p style={{ fontSize: '1.15rem', lineHeight: 2, color: muted }}>
          A useful physical pilot would begin with a specific human need, an accountable host, permission to use the space and tested equipment. Automatic identification, biometric processing and location sharing would need separate choices; they are not assumed benefits of membership.
        </p>
      </section>

      {/* SECTION 6: GET INVOLVED */}
      <section style={{ padding: '6rem 2rem', background: '#050505' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.3em', color: gold, marginBottom: '1rem', textAlign: 'center' }}>VI.</div>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '3rem', textAlign: 'center', borderBottom: `1px solid ${border}`, paddingBottom: '1rem' }}>
            BUILD WITH US
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '1px', background: `${gold}15` }}>
            <a href="/try" style={{ background: bgCard, padding: '2.5rem 2rem', textDecoration: 'none', display: 'block' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.2em', color: gold, marginBottom: '1rem' }}>TRY THE PUBLIC READINGS</div>
              <p style={{ fontSize: '0.95rem', color: muted, lineHeight: 1.7 }}>Read a complete text, compare Scripture in context and explore the existing salon plan without an account or payment.</p>
            </a>
            <div style={{ background: bgCard, padding: '2.5rem 2rem', position: 'relative' }}>

              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.2em', color: gold, marginBottom: '1rem' }}>EXPLORE THE DATA VISION</div>
              <p style={{ fontSize: '0.95rem', color: muted, lineHeight: 1.7 }}>Local and distributed compute remain research options. No node installation, hosting service or daily reward is offered here.</p>
            </div>
            <Link href="/salons/pilot" prefetch={false} style={{ background: bgCard, padding: '2.5rem 2rem', textDecoration: 'none', display: 'block' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.2em', color: gold, marginBottom: '1rem' }}>PLAN A CONVERSATION</div>
              <p style={{ fontSize: '0.95rem', color: muted, lineHeight: 1.7 }}>Use the existing readings and host guide. Society-led sessions still need a confirmed host and dates.</p>
            </Link>
          </div>

          <p style={{ fontSize: '1.1rem', color: gold, fontStyle: 'italic', textAlign: 'center', marginTop: '3rem', lineHeight: 1.8 }}>
            The aim is useful tools and real fellowship. The organizational and ownership model remains under review.
          </p>
        </div>
      </section>

      </main>
      {/* FOOTER */}
      <PublicFooter />
    </div>
  );
}
