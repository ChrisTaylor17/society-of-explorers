import { Metadata } from 'next';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

export const metadata: Metadata = {
  title: 'The Three Pillars | Society of Explorers',
  description: 'Consilience Systems LLC, Society of Explorers, and the SOE Nonprofit — the organizational architecture.',
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

      <PublicNav />

      {/* HERO */}
      <section style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '6rem 2rem 4rem', position: 'relative' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.5em', color: gold, opacity: 0.4, marginBottom: '2rem' }}>ORGANIZATIONAL ARCHITECTURE</div>
        <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(2.5rem, 7vw, 5rem)', fontWeight: 300, letterSpacing: '0.15em', lineHeight: 1.1, marginBottom: '1.5rem' }}>
          THE THREE PILLARS
        </h1>
        <p style={{ fontSize: '1.2rem', color: muted, fontStyle: 'italic', lineHeight: 1.8, maxWidth: '550px', marginBottom: '4rem' }}>
          How the Society is organized — the legal and corporate architecture.
        </p>

        {/* Hierarchy Tree — Consilience at top, branching down */}
        <div style={{ position: 'relative', width: '340px', height: '200px' }}>
          {/* Root: Consilience */}
          <div style={{ position: 'absolute', left: '50%', top: 0, transform: 'translateX(-50%)', textAlign: 'center' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '18px', color: purple, marginBottom: '4px' }}>◊</div>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: purple }}>CONSILIENCE</div>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '6px', letterSpacing: '0.1em', color: muted, marginTop: '2px' }}>PARENT DAC</div>
          </div>
          {/* Trunk down from Consilience */}
          <div style={{ position: 'absolute', left: '50%', top: '55px', width: '2px', height: '40px', background: gold, transform: 'translateX(-50%)' }} />
          {/* Horizontal bar */}
          <div style={{ position: 'absolute', left: 'calc(50% - 120px)', top: '95px', width: '240px', height: '2px', background: gold }} />
          {/* Left branch down to SoE LLC */}
          <div style={{ position: 'absolute', left: 'calc(50% - 120px)', top: '95px', width: '2px', height: '40px', background: gold }} />
          {/* Right branch down to Nonprofit */}
          <div style={{ position: 'absolute', left: 'calc(50% + 120px)', top: '95px', width: '2px', height: '40px', background: gold }} />
          {/* SoE LLC label */}
          <div style={{ position: 'absolute', left: 'calc(50% - 120px)', top: '140px', transform: 'translateX(-50%)', textAlign: 'center' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '16px', color: gold, marginBottom: '4px' }}>⬡</div>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.12em', color: gold }}>SOE LLC</div>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '6px', letterSpacing: '0.1em', color: muted, marginTop: '2px' }}>DAO / COMMUNITY</div>
          </div>
          {/* Nonprofit label */}
          <div style={{ position: 'absolute', left: 'calc(50% + 120px)', top: '140px', transform: 'translateX(-50%)', textAlign: 'center' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '16px', color: warmGold, marginBottom: '4px' }}>△</div>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.12em', color: warmGold }}>SOE NONPROFIT</div>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '6px', letterSpacing: '0.1em', color: muted, marginTop: '2px' }}>501(c)(3)</div>
          </div>
        </div>
      </section>

      {/* SECTION 1: THE NECESSITY */}
      <section style={{ padding: '8rem 2rem', maxWidth: '700px', margin: '0 auto' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem' }}>I.</div>
        <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '2rem', borderBottom: `1px solid ${border}`, paddingBottom: '1rem' }}>
          WHY THIS STRUCTURE
        </h2>
        <p style={{ fontSize: '1.15rem', lineHeight: 1.9, marginBottom: '2rem' }}>
          A single entity cannot hold what we are building. Infrastructure needs freedom to build. Community needs freedom to gather. Education needs freedom to give. Consilience Systems is the root — the decentralized autonomous corporation that builds the technology backbone. From it, two branches extend: the Society of Explorers LLC, which runs the community and membership experience, and the SOE Nonprofit, which ensures the mission reaches everyone.
        </p>
        <p style={{ fontSize: '1.15rem', lineHeight: 1.9, color: muted }}>
          The hierarchy is intentional. Consilience holds the IP, the infrastructure, and the long-term vision. The Society operates as a DAO under Consilience, running the salon, the thinkers, and the membership tiers. The nonprofit channels the educational mission — free salons, scholarships, and the Living Archive as a public good. Each pillar protects the others from its own temptations.
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
            {/* Consilience — Parent */}
            <div style={{ background: bgCard, padding: '3rem 2.5rem', borderTop: `3px solid ${purple}` }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '2rem', color: purple, opacity: 0.25, marginBottom: '1rem' }}>◊</div>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.15em', color: purple, marginBottom: '0.25rem' }}>CONSILIENCE SYSTEMS LLC</div>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: muted, marginBottom: '1.5rem' }}>THE PARENT DAC — TECHNOLOGY BACKBONE</div>
              <p style={{ fontSize: '1rem', color: `${text}cc`, lineHeight: 1.9, marginBottom: '2rem' }}>
                The Decentralized Autonomous Corporation. Consilience builds the infrastructure that everything else runs on — blockchain systems, AI platforms, data sovereignty tools, the Living Archive (planned), TwiddleTwattle, ExploreOS (in development). Located at 92B South St in downtown Boston. It provides services, IP licensing, and technical infrastructure to the Society of Explorers and the Nonprofit. Consilience is the root. It asks the questions that take decades to answer and builds the tools that make the answers possible.
              </p>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.2em', color: purple, opacity: 0.6, marginBottom: '0.75rem' }}>KEY FUNCTIONS</div>
              {['Blockchain and AI infrastructure', 'Living Archive (planned)', 'ExploreOS (in development)', 'TwiddleTwattle social layer', 'IP licensing and services', 'Data sovereignty tools', '92B South St operations'].map((f, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.4rem', alignItems: 'flex-start' }}>
                  <div style={{ color: purple, opacity: 0.4, marginTop: '3px', fontSize: '7px' }}>⬡</div>
                  <div style={{ fontSize: '0.9rem', color: muted, lineHeight: 1.5 }}>{f}</div>
                </div>
              ))}
            </div>

            {/* Society of Explorers LLC — Subsidiary */}
            <div style={{ background: bgCard, padding: '3rem 2.5rem', borderTop: `3px solid ${gold}` }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '2rem', color: gold, opacity: 0.25, marginBottom: '1rem' }}>⬡</div>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.15em', color: gold, marginBottom: '0.25rem' }}>SOCIETY OF EXPLORERS LLC</div>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: muted, marginBottom: '1.5rem' }}>SUBSIDIARY DAO — COMMUNITY + MEMBERSHIP</div>
              <p style={{ fontSize: '1rem', color: `${text}cc`, lineHeight: 1.9, marginBottom: '2rem' }}>
                The living temple. The front-end community where members gather, thinkers speak, artifacts are forged, and salons convene. Functions as a DAO with tiered memberships — $9.99/mo Digital, $99/mo Salon, $499 one-time Founding. Managed under the Consilience umbrella. Revenue from membership dues, product sales, and the $EXP token economy funds operations. Surplus flows to the nonprofit.
              </p>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.2em', color: gold, opacity: 0.6, marginBottom: '0.75rem' }}>KEY FUNCTIONS</div>
              {['Membership platform and DAO governance', 'AI thinker salon', 'Great Books reading program', 'Merch and artifact marketplace', '$EXP token economy', 'Events and salon evenings', 'Book salons and cohorts'].map((f, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.4rem', alignItems: 'flex-start' }}>
                  <div style={{ color: gold, opacity: 0.4, marginTop: '3px', fontSize: '7px' }}>⬡</div>
                  <div style={{ fontSize: '0.9rem', color: muted, lineHeight: 1.5 }}>{f}</div>
                </div>
              ))}
            </div>

            {/* SOE Nonprofit — 501(c)(3) */}
            <div style={{ background: bgCard, padding: '3rem 2.5rem', borderTop: `3px solid ${warmGold}` }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '2rem', color: warmGold, opacity: 0.25, marginBottom: '1rem' }}>△</div>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.15em', color: warmGold, marginBottom: '0.25rem' }}>SOE NONPROFIT</div>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: muted, marginBottom: '1.5rem' }}>501(c)(3) — EDUCATIONAL FOUNDATION</div>
              <p style={{ fontSize: '1rem', color: `${text}cc`, lineHeight: 1.9, marginBottom: '2rem' }}>
                The gift. The nonprofit ensures the Society&apos;s ideas reach people who cannot pay for them. It maintains the Living Archive as a public-good resource. It funds scholarships to the Great Books program, runs free public salons, and creates educational content. It accepts grants and donations and channels them into making philosophy and technology education accessible to anyone with the courage to think. The nonprofit is the promise that this is not a gated garden.
              </p>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.2em', color: warmGold, opacity: 0.6, marginBottom: '0.75rem' }}>KEY FUNCTIONS</div>
              {['Living Archive as public resource', 'Scholarships and grants', 'Free educational content', 'Public salons and events', 'Curriculum development', 'Community outreach', 'Tax-deductible donations'].map((f, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.4rem', alignItems: 'flex-start' }}>
                  <div style={{ color: warmGold, opacity: 0.4, marginTop: '3px', fontSize: '7px' }}>⬡</div>
                  <div style={{ fontSize: '0.9rem', color: muted, lineHeight: 1.5 }}>{f}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: THE CONVERGENCE */}
      <section style={{ padding: '8rem 2rem', maxWidth: '700px', margin: '0 auto' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem', textAlign: 'center' }}>III.</div>
        <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '3rem', textAlign: 'center', borderBottom: `1px solid ${border}`, paddingBottom: '1rem' }}>
          HOW THEY CONNECT
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '3rem' }}>
          {[
            { from: 'Consilience Infrastructure', arrow: '→', to: 'SoE LLC Platform + Nonprofit Tools', color: purple },
            { from: 'SoE LLC Revenue', arrow: '→', to: 'Nonprofit Grants + Consilience R&D', color: gold },
            { from: 'Nonprofit Education', arrow: '→', to: 'SoE LLC Member Pipeline', color: warmGold },
            { from: 'Consilience IP', arrow: '→', to: 'Licensed to Both Subsidiaries', color: purple },
          ].map((flow, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'center' }}>
              <span style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.1em', color: flow.color, minWidth: '180px', textAlign: 'right' }}>{flow.from}</span>
              <span style={{ color: `${gold}40`, fontSize: '14px' }}>{flow.arrow}</span>
              <span style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.1em', color: muted, minWidth: '180px' }}>{flow.to}</span>
            </div>
          ))}
        </div>

        <p style={{ fontSize: '1.1rem', lineHeight: 1.9, textAlign: 'center', color: muted }}>
          Consilience builds the infrastructure that powers everything. The Society of Explorers LLC operates the community experience on that infrastructure. The Nonprofit ensures the mission reaches beyond paying members. Revenue flows up to fund R&D; technology flows down to power the community; education flows outward to grow the network. Three pillars, one organism.
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
              { title: 'BUSINESS PLAN', name: 'Consilience Systems — Business Plan', desc: 'Revenue model, growth strategy, membership tiers, technology roadmap, financial projections. The commercial engine.', url: 'https://woqvlkeluxkxplpgzdgv.supabase.co/storage/v1/object/public/papers/business-plan.pdf' },
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

      <PublicFooter />
    </div>
  );
}
