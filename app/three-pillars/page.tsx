import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'The Three Pillars | Society of Explorers',
  description: 'One vision. Three vessels. A structure designed for convergence.',
};

export default function ThreePillars() {
  const gold = '#C5A55A';
  const purple = '#7B68EE';
  const warmGold = '#C9A94E';
  const text = '#E8DCC8';
  const muted = '#9a8f7a';
  const bg = '#0A0A0A';
  const bgCard = '#0d0d0d';
  const border = `${gold}22`;

  return (
    <div style={{ minHeight: '100vh', background: bg, color: text, fontFamily: 'Cormorant Garamond, serif', overflowX: 'hidden' }}>

      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to bottom, #000, transparent)' }}>
        <a href="/salon" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, textDecoration: 'none', opacity: 0.7 }}>&larr; RETURN TO THE SALON</a>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5 }}>SOCIETY OF EXPLORERS</div>
      </nav>

      {/* HERO */}
      <section style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '6rem 2rem 4rem', position: 'relative' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.5em', color: gold, opacity: 0.4, marginBottom: '2rem' }}>ORGANIZATIONAL ARCHITECTURE</div>
        <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(2.5rem, 7vw, 5rem)', fontWeight: 300, letterSpacing: '0.15em', lineHeight: 1.1, marginBottom: '1.5rem' }}>
          THE THREE PILLARS
        </h1>
        <p style={{ fontSize: '1.2rem', color: muted, fontStyle: 'italic', lineHeight: 1.8, maxWidth: '550px', marginBottom: '4rem' }}>
          One vision. Three vessels. A structure designed for convergence.
        </p>

        {/* CSS Tree Diagram */}
        <div style={{ position: 'relative', width: '320px', height: '220px' }}>
          {/* Trunk */}
          <div style={{ position: 'absolute', left: '50%', bottom: 0, width: '2px', height: '80px', background: gold, transform: 'translateX(-50%)' }} />
          {/* Left branch */}
          <div style={{ position: 'absolute', left: '50%', bottom: '80px', width: '130px', height: '2px', background: gold, transform: 'translateX(-100%)' }} />
          <div style={{ position: 'absolute', left: 'calc(50% - 130px)', bottom: '80px', width: '2px', height: '60px', background: gold }} />
          {/* Right branch */}
          <div style={{ position: 'absolute', left: '50%', bottom: '80px', width: '130px', height: '2px', background: gold }} />
          <div style={{ position: 'absolute', left: 'calc(50% + 130px)', bottom: '80px', width: '2px', height: '60px', background: gold }} />
          {/* Center branch */}
          <div style={{ position: 'absolute', left: '50%', bottom: '80px', width: '2px', height: '80px', background: gold, transform: 'translateX(-50%)' }} />
          {/* Labels */}
          <div style={{ position: 'absolute', left: 'calc(50% - 130px)', top: '0', transform: 'translateX(-50%)', fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, textAlign: 'center', width: '100px' }}>
            <div style={{ fontSize: '18px', marginBottom: '4px' }}>&#x2B21;</div>LLC
          </div>
          <div style={{ position: 'absolute', left: '50%', top: '0', transform: 'translateX(-50%)', fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: purple, textAlign: 'center', width: '100px' }}>
            <div style={{ fontSize: '18px', marginBottom: '4px' }}>◊</div>CONCILIENCE
          </div>
          <div style={{ position: 'absolute', left: 'calc(50% + 130px)', top: '0', transform: 'translateX(-50%)', fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: warmGold, textAlign: 'center', width: '100px' }}>
            <div style={{ fontSize: '18px', marginBottom: '4px' }}>△</div>NONPROFIT
          </div>
          {/* Root label */}
          <div style={{ position: 'absolute', left: '50%', bottom: '-30px', transform: 'translateX(-50%)', fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.2em', color: muted }}>THE VISION</div>
        </div>
      </section>

      {/* SECTION 1: THE NECESSITY */}
      <section style={{ padding: '8rem 2rem', maxWidth: '700px', margin: '0 auto' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem' }}>I.</div>
        <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '2rem', borderBottom: `1px solid ${border}`, paddingBottom: '1rem' }}>
          WHY THREE
        </h2>
        <p style={{ fontSize: '1.15rem', lineHeight: 1.9 }}>
          A single entity cannot hold what we are building. Commerce needs freedom to move. Vision needs freedom to think. Education needs freedom to give. If you collapse all three into one, the commercial pressures corrupt the vision, the vision delays the commerce, and the education becomes marketing. The three-pillar structure is not bureaucracy — it is architecture. Each entity exists to protect the others from its own temptations.
        </p>
      </section>

      {/* SECTION 2: THE THREE ENTITIES */}
      <section style={{ padding: '6rem 2rem', background: '#050505' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem', textAlign: 'center' }}>II.</div>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '4rem', textAlign: 'center', borderBottom: `1px solid ${border}`, paddingBottom: '1rem' }}>
            THE THREE ENTITIES
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1px', background: `${gold}12` }}>
            {[
              {
                symbol: '⬡', title: 'SOCIETY OF EXPLORERS LLC', subtitle: 'The Membership Community', accent: gold,
                desc: 'The living temple. This is where members gather, where the thinkers speak, where artifacts are forged and salons convene. The LLC holds the technology platform, the subscription revenue, the merch pipeline, and the physical space at 92B South St. It is the engine — built to sustain itself through membership dues, product sales, and the value it creates for its members. Revenue funds operations. Surplus flows to the nonprofit and to Concilience.',
                functions: ['Membership platform', 'AI thinker system', 'Great Books program', 'Merch and artifacts', 'Physical space operations', '$EXP token economy'],
              },
              {
                symbol: '◊', title: 'CONCILIENCE', subtitle: 'The Vision Entity', accent: purple,
                desc: 'The philosophical compass. Concilience exists to hold the long-term vision that no single product cycle can contain. It publishes the papers. It convenes the thinkers — not the AI ones, but the human ones. It asks the questions that take decades to answer: How should AI and humans co-create? What does sovereign identity mean in practice? How do we build technology that makes humans more human, not less? Concilience does not sell anything. It thinks, writes, and convenes.',
                functions: ['White papers and research', 'Philosophical framework', 'Advisory council', 'Long-term technology vision', 'Partnerships with universities and think tanks'],
              },
              {
                symbol: '△', title: 'SOE NONPROFIT', subtitle: 'The Educational Foundation', accent: warmGold,
                desc: "The gift. The nonprofit ensures that the Society's ideas reach people who cannot pay for them. It funds scholarships to the Great Books program. It runs free public salons. It creates educational content — the thinker guides, the onboarding paths, the philosophical curriculum. It accepts grants and donations and channels them into making philosophy and technology education accessible to anyone with the courage to think. The nonprofit is the Society's promise that this is not a gated garden.",
                functions: ['Scholarships and grants', 'Free educational content', 'Public salons and events', 'Curriculum development', 'Community outreach', 'Tax-deductible donations'],
              },
            ].map(entity => (
              <div key={entity.title} style={{ background: bgCard, padding: '3rem 2.5rem', borderTop: `3px solid ${entity.accent}` }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '2rem', color: entity.accent, opacity: 0.25, marginBottom: '1rem' }}>{entity.symbol}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.15em', color: entity.accent, marginBottom: '0.25rem' }}>{entity.title}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: muted, marginBottom: '1.5rem' }}>{entity.subtitle.toUpperCase()}</div>
                <p style={{ fontSize: '1rem', color: `${text}cc`, lineHeight: 1.9, marginBottom: '2rem' }}>{entity.desc}</p>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.2em', color: entity.accent, opacity: 0.6, marginBottom: '0.75rem' }}>KEY FUNCTIONS</div>
                {entity.functions.map((f, i) => (
                  <div key={i} style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.4rem', alignItems: 'flex-start' }}>
                    <div style={{ color: entity.accent, opacity: 0.4, marginTop: '3px', fontSize: '7px' }}>&#x2B21;</div>
                    <div style={{ fontSize: '0.9rem', color: muted, lineHeight: 1.5 }}>{f}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 3: THE CONVERGENCE */}
      <section style={{ padding: '8rem 2rem', maxWidth: '700px', margin: '0 auto' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem', textAlign: 'center' }}>III.</div>
        <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '3rem', textAlign: 'center', borderBottom: `1px solid ${border}`, paddingBottom: '1rem' }}>
          THE CONVERGENCE
        </h2>

        {/* Triangle diagram */}
        <div style={{ position: 'relative', width: '300px', height: '260px', margin: '0 auto 3rem' }}>
          {/* Three hexagons */}
          <div style={{ position: 'absolute', left: '50%', top: 0, transform: 'translateX(-50%)', width: '80px', height: '80px', border: `1px solid ${purple}`, display: 'flex', alignItems: 'center', justifyContent: 'center', clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }}>
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: purple }}>CONCILIENCE</span>
          </div>
          <div style={{ position: 'absolute', left: 0, bottom: 0, width: '80px', height: '80px', border: `1px solid ${gold}`, display: 'flex', alignItems: 'center', justifyContent: 'center', clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }}>
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: gold }}>LLC</span>
          </div>
          <div style={{ position: 'absolute', right: 0, bottom: 0, width: '80px', height: '80px', border: `1px solid ${warmGold}`, display: 'flex', alignItems: 'center', justifyContent: 'center', clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }}>
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: warmGold }}>NONPROFIT</span>
          </div>
          {/* Connecting lines */}
          <svg style={{ position: 'absolute', inset: 0 }} viewBox="0 0 300 260">
            <line x1="150" y1="70" x2="50" y2="180" stroke={gold} strokeWidth="0.5" opacity="0.3" />
            <line x1="150" y1="70" x2="250" y2="180" stroke={gold} strokeWidth="0.5" opacity="0.3" />
            <line x1="50" y1="200" x2="250" y2="200" stroke={gold} strokeWidth="0.5" opacity="0.3" />
          </svg>
          {/* Center label */}
          <div style={{ position: 'absolute', left: '50%', top: '55%', transform: 'translate(-50%, -50%)', fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.2em', color: muted }}>THE VISION</div>
        </div>

        {/* Flow descriptions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {[
            { from: 'LLC Revenue', arrow: '→', to: 'Nonprofit Grants', color: gold },
            { from: 'Concilience Vision', arrow: '→', to: 'LLC Product Direction', color: purple },
            { from: 'Nonprofit Education', arrow: '→', to: 'LLC Member Pipeline', color: warmGold },
          ].map((flow, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'center' }}>
              <span style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.1em', color: flow.color }}>{flow.from}</span>
              <span style={{ color: `${gold}40`, fontSize: '14px' }}>{flow.arrow}</span>
              <span style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.1em', color: muted }}>{flow.to}</span>
            </div>
          ))}
        </div>

        <p style={{ fontSize: '1.1rem', lineHeight: 1.9, marginTop: '3rem', textAlign: 'center', color: muted }}>
          Revenue from the LLC funds the nonprofit&apos;s educational mission. Research from Concilience guides the LLC&apos;s product direction. Education from the nonprofit creates the next generation of members. The three pillars are not separate organizations — they are one organism with three expressions.
        </p>
      </section>

      {/* SECTION 4: THE PAPERS */}
      <section style={{ padding: '6rem 2rem', background: '#050505' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem', textAlign: 'center' }}>IV.</div>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '0.75rem', textAlign: 'center', borderBottom: `1px solid ${border}`, paddingBottom: '1rem' }}>
            THE FOUNDING DOCUMENTS
          </h2>
          <p style={{ fontSize: '1rem', color: muted, fontStyle: 'italic', textAlign: 'center', marginBottom: '3rem' }}>
            Download the papers that define our vision, strategy, and structure.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1px', background: `${gold}12` }}>
            {[
              { title: 'WHITE PAPER', name: 'The Convergence Thesis', desc: 'The philosophical foundation. Why AI, blockchain, and ancient wisdom must converge. The Heidegger framework. The case for poiesis over Gestell.', url: 'https://woqvlkeluxkxplpgzdgv.supabase.co/storage/v1/object/public/papers/white-paper.pdf' },
              { title: 'BUSINESS PLAN', name: 'Society of Explorers — Business Plan', desc: 'Revenue model, growth strategy, membership tiers, technology roadmap, financial projections. The commercial engine.', url: 'https://woqvlkeluxkxplpgzdgv.supabase.co/storage/v1/object/public/papers/business-plan.pdf' },
              { title: 'GREEN PAPER', name: 'The Educational Framework', desc: 'The Great Books curriculum. The salon methodology. How AI thinkers facilitate philosophical education. The nonprofit\u2019s mission and programs.', url: 'https://woqvlkeluxkxplpgzdgv.supabase.co/storage/v1/object/public/papers/green-paper.pdf' },
              { title: 'BLACK PAPER', name: 'The Technical Architecture', desc: 'The data layer. Soulbound NFTs. Decentralized compute. $EXP tokenomics. ExploreOS. The full technical specification.', url: 'https://woqvlkeluxkxplpgzdgv.supabase.co/storage/v1/object/public/papers/black-paper.pdf' },
            ].map(paper => (
              <div key={paper.title} style={{ background: bgCard, padding: '2.5rem 2rem', position: 'relative' }}>
                <div style={{ position: 'absolute', top: '1rem', right: '1rem', fontFamily: 'Cinzel, serif', fontSize: '6px', letterSpacing: '0.15em', color: bgCard, background: gold, padding: '2px 8px' }}>DOWNLOAD PDF</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.25em', color: gold, opacity: 0.5, marginBottom: '0.75rem' }}>{paper.title}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '13px', letterSpacing: '0.08em', color: text, marginBottom: '1rem', lineHeight: 1.3 }}>{paper.name}</div>
                <p style={{ fontSize: '0.95rem', color: muted, lineHeight: 1.7, marginBottom: '1.5rem' }}>{paper.desc}</p>
                <a href={paper.url} target="_blank" rel="noopener noreferrer" download style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, textDecoration: 'none' }}>
                  DOWNLOAD PDF →
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <section style={{ padding: '6rem 2rem', textAlign: 'center' }}>
        <p style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.1em', color: gold, opacity: 0.4, maxWidth: '500px', margin: '0 auto 3rem', lineHeight: 1.8 }}>
          The structure exists to serve the vision. The vision exists to serve the human.
        </p>
        <div style={{ display: 'flex', gap: '2rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          {[
            { href: '/salon', label: 'THE SALON' },
            { href: '/great-books', label: 'GREAT BOOKS' },
            { href: '/data-layer', label: 'DATA LAYER' },
            { href: '/join', label: 'JOIN' },
          ].map(link => (
            <a key={link.href} href={link.href} style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, textDecoration: 'none', opacity: 0.5 }}>{link.label}</a>
          ))}
        </div>
        <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '12px', color: muted, opacity: 0.5 }}>chris@societyofexplorers.com</div>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, opacity: 0.3, marginTop: '0.75rem' }}>92B SOUTH ST &middot; DOWNTOWN BOSTON</div>
      </section>
    </div>
  );
}
