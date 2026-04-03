import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'The Data Layer | Society of Explorers',
  description: 'Building the decentralized infrastructure for human sovereignty.',
};

export default function DataLayer() {
  const gold = '#C5A55A';
  const text = '#E8DCC8';
  const muted = '#9a8f7a';
  const bg = '#0A0A0A';
  const bgCard = '#0d0d0d';
  const border = `${gold}22`;

  return (
    <div style={{ minHeight: '100vh', background: bg, color: text, fontFamily: 'Cormorant Garamond, serif', overflowX: 'hidden' }}>

      {/* NAV */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to bottom, #000, transparent)' }}>
        <a href="/salon" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, textDecoration: 'none', opacity: 0.7 }}>&larr; RETURN TO THE SALON</a>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5 }}>SOCIETY OF EXPLORERS</div>
      </nav>

      {/* HERO */}
      <section style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', textAlign: 'center', padding: '6rem 2rem 4rem' }}>
        {/* Hexagonal grid pattern */}
        <div style={{ position: 'absolute', inset: 0, opacity: 0.03, pointerEvents: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='100' viewBox='0 0 56 100'%3E%3Cpath d='M28 66L0 50L0 16L28 0L56 16L56 50L28 66L28 100' fill='none' stroke='%23C5A55A' stroke-width='1'/%3E%3Cpath d='M28 0L28 34L0 50L0 84L28 100L56 84L56 50L28 34' fill='none' stroke='%23C5A55A' stroke-width='1'/%3E%3C/svg%3E")`, backgroundSize: '56px 100px' }} />
        <div style={{ maxWidth: '700px', position: 'relative', zIndex: 1 }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.5em', color: gold, opacity: 0.4, marginBottom: '2rem' }}>TECHNICAL MANIFESTO</div>
          <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(2.5rem, 7vw, 5rem)', fontWeight: 300, letterSpacing: '0.15em', lineHeight: 1.1, marginBottom: '2rem' }}>
            THE DATA LAYER
          </h1>
          <div style={{ width: '60px', height: '1px', background: gold, margin: '0 auto 2rem', opacity: 0.4 }} />
          <p style={{ fontSize: '1.3rem', color: muted, lineHeight: 1.9, fontStyle: 'italic' }}>
            Building the decentralized infrastructure for human sovereignty
          </p>
        </div>
      </section>

      {/* SECTION 1: THE THESIS */}
      <section style={{ padding: '8rem 2rem', maxWidth: '680px', margin: '0 auto' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem' }}>I.</div>
        <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '2rem', borderBottom: `1px solid ${border}`, paddingBottom: '1rem' }}>
          THE PROBLEM
        </h2>
        <p style={{ fontSize: '1.15rem', lineHeight: 2, marginBottom: '2rem' }}>
          Your data is not yours. Your identity is rented from platforms that sell your attention. Your compute runs on servers owned by five companies. Your AI serves their objectives, not yours. The current architecture of the internet treats humans as resources — what Heidegger called standing-reserve. We are building the counter-architecture.
        </p>
        <p style={{ fontSize: '1.15rem', lineHeight: 2 }}>
          The Society of Explorers is not a product. It is the first node in a decentralized network where identity, data, compute, and AI are owned by the people who use them. Every membership, every conversation, every artifact created in the Salon is a data point in a system designed to return value to its participants — not extract it.
        </p>
        <div style={{ width: '100px', height: '1px', background: gold, margin: '4rem auto', opacity: 0.3 }} />
      </section>

      {/* SECTION 2: THE ARCHITECTURE */}
      <section style={{ padding: '6rem 2rem', background: '#050505' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem', textAlign: 'center' }}>II.</div>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '4rem', textAlign: 'center', borderBottom: `1px solid ${border}`, paddingBottom: '1rem' }}>
            THREE LAYERS
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1px', background: `${gold}15` }}>
            {[
              {
                icon: '⬡',
                title: 'SOVEREIGN IDENTITY',
                body: 'TribeKey: Your identity belongs to you. A soulbound NFT on Base that proves membership without exposing data. No platform owns your login. No company can delete your account. Your philosophical profile, your reading history, your thinker conversations — encrypted, portable, yours.',
              },
              {
                icon: '◇',
                title: 'DECENTRALIZED COMPUTE',
                body: 'ExploreOS: A decentralized operating system where AI agents run on distributed infrastructure. The thinkers don\u2019t live on Anthropic\u2019s servers alone — they live on a network owned by the community. Your conversations are processed by nodes you help run. Compute as a commons.',
              },
              {
                icon: '◎',
                title: 'AI ORCHESTRATION',
                body: 'The six thinkers are the first citizens of this network. Today they run on centralized APIs. Tomorrow they run on decentralized inference — models fine-tuned by the community, served by community nodes, governed by community consensus. AI that serves humans because humans own the infrastructure.',
              },
            ].map(col => (
              <div key={col.title} style={{ background: bgCard, padding: '3rem 2.5rem' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '2rem', color: gold, opacity: 0.2, marginBottom: '1.5rem' }}>{col.icon}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, marginBottom: '1.5rem' }}>{col.title}</div>
                <p style={{ fontSize: '1.05rem', color: muted, lineHeight: 1.9 }}>{col.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 3: THE STACK */}
      <section style={{ padding: '8rem 2rem', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem' }}>III.</div>
        <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '3rem', borderBottom: `1px solid ${border}`, paddingBottom: '1rem' }}>
          HOW WE BUILD IT
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {[
            { label: 'VALUE LAYER', components: '$EXP Token  \u2192  Staking  \u2192  Governance  \u2192  Community Treasury', accent: gold },
            { label: 'DATA LAYER', components: 'IPFS / Arweave  \u2192  Encrypted Storage  \u2192  Member-Owned Data  \u2192  Portable Identity', accent: '#6B9E6B' },
            { label: 'COMPUTE LAYER', components: 'Distributed Nodes  \u2192  ExploreOS  \u2192  AI Inference  \u2192  Thinker Agents', accent: '#7C9EBF' },
            { label: 'IDENTITY LAYER', components: 'Base Blockchain  \u2192  Soulbound NFTs  \u2192  TribeKey  \u2192  Member Profiles', accent: '#BF8040' },
          ].map(layer => (
            <div key={layer.label} style={{ background: bgCard, padding: '1.5rem 2rem', borderLeft: `3px solid ${layer.accent}`, display: 'flex', alignItems: 'center', gap: '2rem' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: layer.accent, minWidth: '120px', flexShrink: 0 }}>{layer.label}</div>
              <div style={{ fontSize: '0.95rem', color: muted, letterSpacing: '0.02em' }}>{layer.components}</div>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 4: THE ECONOMICS */}
      <section style={{ padding: '6rem 2rem', background: '#050505' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem', textAlign: 'center' }}>IV.</div>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '2rem', textAlign: 'center', borderBottom: `1px solid ${border}`, paddingBottom: '1rem' }}>
            CRYPTO-ECONOMICS
          </h2>
          <p style={{ fontSize: '1.15rem', lineHeight: 2, textAlign: 'center', maxWidth: '680px', margin: '0 auto 3rem', color: muted }}>
            $EXP is not a speculative token. It is a unit of contribution. You earn it by reading, thinking, creating, and running infrastructure. You spend it on access, governance votes, and community resources.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1px', background: `${gold}15` }}>
            {[
              { title: 'EARN', items: ['Read a Great Book section (+5 EXP)', 'Complete a reflection (+10 EXP)', 'Run a node (+50 EXP/day)', 'Create an artifact (+15 EXP)', 'Lead a salon (+20 EXP)'] },
              { title: 'SPEND', items: ['Mint an artifact NFT (10 EXP)', 'Vote on curriculum (1 EXP)', 'Access premium thinker modes (5 EXP)', 'Reserve a founding dinner seat (100 EXP)'] },
              { title: 'GOVERN', items: ['Which books enter the canon', 'Which thinkers get new capabilities', 'How the treasury is allocated', 'Infrastructure decisions'] },
            ].map(card => (
              <div key={card.title} style={{ background: bgCard, padding: '2.5rem 2rem' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.25em', color: gold, marginBottom: '1.5rem' }}>{card.title}</div>
                {card.items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.6rem', alignItems: 'flex-start' }}>
                    <div style={{ color: gold, opacity: 0.4, flexShrink: 0, marginTop: '4px', fontSize: '8px' }}>&#x2B21;</div>
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
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem' }}>V.</div>
        <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '2rem', borderBottom: `1px solid ${border}`, paddingBottom: '1rem' }}>
          BEYOND THE SCREEN
        </h2>
        <p style={{ fontSize: '1.15rem', lineHeight: 2, marginBottom: '2rem' }}>
          The thinkers will not stay digital. TribeKey becomes a physical device — an RFID-enabled key that unlocks physical spaces, identifies you to robotic systems, and carries your sovereign identity into the material world. The temple at 92B South St is the first node. The network grows from there.
        </p>
        <p style={{ fontSize: '1.15rem', lineHeight: 2, color: muted }}>
          When you walk into the temple, your TribeKey authenticates you. The thinkers know who you are. The space responds to your presence. This is not science fiction — it is the convergence of NFC, blockchain identity, and AI agents that already exists in prototype at the Society. The question is not whether this will happen. The question is who builds it — platforms that extract, or communities that own.
        </p>
      </section>

      {/* SECTION 6: GET INVOLVED */}
      <section style={{ padding: '6rem 2rem', background: '#050505' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem', textAlign: 'center' }}>VI.</div>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '3rem', textAlign: 'center', borderBottom: `1px solid ${border}`, paddingBottom: '1rem' }}>
            BUILD WITH US
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1px', background: `${gold}15` }}>
            <a href="/join" style={{ background: bgCard, padding: '2.5rem 2rem', textDecoration: 'none', display: 'block' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, marginBottom: '1rem' }}>SET UP YOUR IDENTITY</div>
              <p style={{ fontSize: '0.95rem', color: muted, lineHeight: 1.7 }}>Mint your soulbound membership NFT and claim your sovereign identity.</p>
            </a>
            <div style={{ background: bgCard, padding: '2.5rem 2rem', position: 'relative' }}>
              <div style={{ position: 'absolute', top: '1rem', right: '1rem', fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.15em', color: bgCard, background: gold, padding: '2px 8px', opacity: 0.7 }}>COMING SOON</div>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, marginBottom: '1rem' }}>RUN A NODE</div>
              <p style={{ fontSize: '0.95rem', color: muted, lineHeight: 1.7 }}>Host thinker inference on your hardware. Earn $EXP daily.</p>
            </div>
            <a href="/book-salons" style={{ background: bgCard, padding: '2.5rem 2rem', textDecoration: 'none', display: 'block' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, marginBottom: '1rem' }}>JOIN A SALON</div>
              <p style={{ fontSize: '0.95rem', color: muted, lineHeight: 1.7 }}>Read the Great Books with 7 others. The curriculum is the foundation.</p>
            </a>
          </div>

          <p style={{ fontSize: '1.1rem', color: gold, fontStyle: 'italic', textAlign: 'center', marginTop: '3rem', opacity: 0.6, lineHeight: 1.8 }}>
            The Society of Explorers is not a company. It is infrastructure for human flourishing.
          </p>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ padding: '4rem 2rem', borderTop: `1px solid ${border}`, textAlign: 'center' }}>
        <div style={{ display: 'flex', gap: '2rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          <a href="/salon" style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, textDecoration: 'none', opacity: 0.5 }}>THE SALON</a>
          <a href="/great-books" style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, textDecoration: 'none', opacity: 0.5 }}>GREAT BOOKS</a>
          <a href="/join" style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, textDecoration: 'none', opacity: 0.5 }}>JOIN</a>
          <a href="/labyrinth" style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, textDecoration: 'none', opacity: 0.5 }}>LABYRINTH</a>
        </div>
        <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '12px', color: muted, opacity: 0.5 }}>chris@societyofexplorers.com</div>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, opacity: 0.3, marginTop: '0.75rem' }}>92B SOUTH ST &middot; DOWNTOWN BOSTON</div>
      </footer>
    </div>
  );
}
