import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Transparency | Society of Explorers',
  description: 'How value flows through the Society of Explorers — radical transparency as a philosophical act.',
};

export default function Transparency() {
  const gold = '#c9a84c';
  const dim = '#d4c9a8';
  const muted = '#9a8f7a';

  const flows = [
    { from: 'MEMBERSHIP FEES', to: 'CREATOR ROYALTIES', pct: 35, color: '#c9a84c', desc: 'Every membership dollar seeds the creator economy. Writers, artists, builders — paid first.' },
    { from: 'RITUAL MARKETPLACE', to: 'COMMUNITY TREASURY', pct: 42, color: '#a07830', desc: 'Goods and services exchanged between members flow 42% into the shared treasury.' },
    { from: 'NFC BOOK TAPS', to: 'MEMBER ROYALTIES', pct: 100, color: '#c9a84c', desc: 'Every tap of a Society Book pays the original owner. Full circle, zero extraction.' },
    { from: 'ARTIFACT NFT SALES', to: 'ARTIST + PROTOCOL', pct: 85, color: '#d4a030', desc: '70% to the creator. 15% to protocol treasury. 15% burned as $SOE.' },
    { from: 'MERCH SALES', to: 'DESIGN FUND + OPS', pct: 60, color: '#a07830', desc: 'Physical goods fund ongoing operations and a rotating design grant.' },
    { from: '$SOE BURNS', to: 'TOKEN SCARCITY', pct: 100, color: '#c9a84c', desc: 'Every ritual burn permanently removes tokens. Participation creates value.' },
  ];

  const allocations = [
    { label: 'Creator Royalties', pct: 35, desc: 'Artists, writers, thinkers who contribute' },
    { label: 'Member Rewards ($EXP)', pct: 25, desc: 'Active participation and exploration' },
    { label: 'Community Treasury', pct: 20, desc: 'Governed by founding members' },
    { label: 'Operations', pct: 12, desc: '92B South St, infrastructure, builders' },
    { label: 'Token Burns', pct: 8, desc: 'Permanent scarcity via ritual mechanics' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#000', color: '#fff', fontFamily: 'Cormorant Garamond, serif', overflowX: 'hidden' }}>

      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to bottom, #000, transparent)' }}>
        <a href="/salon" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, textDecoration: 'none', opacity: 0.7 }}>← RETURN TO THE SALON</a>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5 }}>SOCIETY OF EXPLORERS</div>
      </nav>

      {/* HERO */}
      <section style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(ellipse at center, #0d0a00 0%, #000 70%)', textAlign: 'center', padding: '6rem 2rem 4rem' }}>
        <div style={{ maxWidth: '800px' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.5em', color: gold, opacity: 0.5, marginBottom: '2rem' }}>RADICAL TRANSPARENCY</div>
          <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(2.5rem, 7vw, 5rem)', fontWeight: 300, letterSpacing: '0.15em', lineHeight: 1.1, marginBottom: '2rem' }}>
            HOW VALUE<br /><span style={{ color: gold }}>FLOWS</span>
          </h1>
          <div style={{ width: '60px', height: '1px', background: gold, margin: '0 auto 2rem', opacity: 0.4 }} />
          <p style={{ fontSize: '1.3rem', color: dim, lineHeight: 1.9, marginBottom: '1.5rem', maxWidth: '600px', margin: '0 auto 1.5rem' }}>
            Heidegger warned that technology makes everything opaque — standing-reserve hidden behind interfaces. We refuse that. Every dollar, every token, every act of value creation is visible here.
          </p>
          <p style={{ fontSize: '1.1rem', color: gold, fontStyle: 'italic', lineHeight: 1.8 }}>
            &ldquo;Truth in beauty&rdquo; means financial truth too.
          </p>
        </div>
      </section>

      {/* THE SANKEY / FLOW DIAGRAM */}
      <section style={{ padding: '6rem 2rem', background: '#050505' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem', textAlign: 'center' }}>I.</div>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '4rem', textAlign: 'center', borderBottom: `1px solid ${gold}44`, paddingBottom: '1rem' }}>
            THE FLOW OF VALUE
          </h2>

          <div style={{ position: 'relative', padding: '2rem 0' }}>
            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', background: `linear-gradient(to bottom, transparent, ${gold}44, transparent)`, transform: 'translateX(-50%)' }} />

            {flows.map((flow, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr', gap: '0', marginBottom: '2px', alignItems: 'center' }}>
                <div style={{ textAlign: 'right', padding: '1.5rem 2rem' }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, opacity: 0.7, marginBottom: '0.4rem' }}>{flow.from}</div>
                  <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '12px', color: muted, lineHeight: 1.6, fontStyle: 'italic' }}>{flow.desc}</div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 2 }}>
                  <div style={{ width: '60px', height: '60px', borderRadius: '50%', border: `1px solid ${flow.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', flexDirection: 'column' }}>
                    <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', color: flow.color, lineHeight: 1 }}>{flow.pct}%</div>
                  </div>
                  <div style={{ position: 'absolute', left: '-100%', top: '50%', width: '100%', height: '1px', background: `linear-gradient(to right, transparent, ${flow.color}66)`, transform: 'translateY(-50%)' }} />
                  <div style={{ position: 'absolute', right: '-100%', top: '50%', width: '100%', height: '1px', background: `linear-gradient(to left, transparent, ${flow.color}66)`, transform: 'translateY(-50%)' }} />
                </div>

                <div style={{ padding: '1.5rem 2rem' }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: flow.color, marginBottom: '0.4rem' }}>&rarr; {flow.to}</div>
                  <div style={{ height: '4px', background: `linear-gradient(to right, ${flow.color}88, transparent)`, width: `${flow.pct}%`, maxWidth: '200px', borderRadius: '2px', marginTop: '6px' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ALLOCATION BREAKDOWN */}
      <section style={{ padding: '6rem 2rem', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem', textAlign: 'center' }}>II.</div>
        <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '3rem', textAlign: 'center', borderBottom: `1px solid ${gold}44`, paddingBottom: '1rem' }}>
          WHERE EVERY DOLLAR GOES
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {allocations.map((item, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '220px 1fr 60px', gap: '1.5rem', alignItems: 'center' }}>
              <div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: gold, opacity: 0.8, marginBottom: '3px' }}>{item.label.toUpperCase()}</div>
                <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '12px', color: muted, fontStyle: 'italic' }}>{item.desc}</div>
              </div>
              <div style={{ position: 'relative', height: '6px', background: '#111', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${item.pct}%`, background: `linear-gradient(to right, ${gold}, ${gold}88)`, borderRadius: '3px' }} />
              </div>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', color: gold, textAlign: 'right' }}>{item.pct}%</div>
            </div>
          ))}
        </div>

        <blockquote style={{ margin: '4rem 0 0', padding: '1.5rem 2rem', borderLeft: `2px solid ${gold}`, background: '#0a0800', fontStyle: 'italic', fontSize: '1.1rem', color: dim, lineHeight: 1.8 }}>
          &ldquo;We are not a corporation extracting value from a community. We are a community generating value for its members. Every flow visible above is a refusal of standing-reserve.&rdquo;
          <div style={{ marginTop: '0.75rem', fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: gold, opacity: 0.7, fontStyle: 'normal' }}>— SOCIETY OF EXPLORERS CHARTER</div>
        </blockquote>
      </section>

      {/* $SOE TOKEN ECONOMY */}
      <section style={{ padding: '6rem 2rem', background: '#050505' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem', textAlign: 'center' }}>III.</div>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '3rem', textAlign: 'center', borderBottom: `1px solid ${gold}44`, paddingBottom: '1rem' }}>
            THE $SOE TOKEN ECONOMY
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', background: `${gold}22` }}>
            {[
              { label: 'EARN', items: ['Participate in the Salon', 'Complete Labyrinth passages', 'Share a Society Book (NFC tap)', 'Contribute artifacts to the marketplace', 'Refer a new member', 'Hold founding member status'] },
              { label: 'BURN', items: ['Unlock secret Labyrinth passages', 'Request private thinker sessions', 'Activate a Society Book (first tap)', 'Mint a ritual NFT', 'Vote on governance proposals', 'Make an offering to the community treasury'] },
            ].map(col => (
              <div key={col.label} style={{ background: '#0a0a0a', padding: '2.5rem' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.3em', color: gold, marginBottom: '1.5rem' }}>{col.label} $SOE</div>
                {col.items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <div style={{ color: gold, opacity: 0.5, flexShrink: 0, marginTop: '2px', fontSize: '10px' }}>⬡</div>
                    <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '14px', color: dim, lineHeight: 1.6 }}>{item}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* USDC → $SOE CONVERSION */}
      <section style={{ padding: '6rem 2rem', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem', textAlign: 'center' }}>IV.</div>
        <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '2rem', textAlign: 'center', borderBottom: `1px solid ${gold}44`, paddingBottom: '1rem' }}>
          USDC &rarr; $SOE
        </h2>
        <p style={{ fontSize: '1.15rem', color: dim, lineHeight: 2, marginBottom: '2rem', textAlign: 'center', maxWidth: '700px', margin: '0 auto 2rem' }}>
          Real money enters as USDC (stable, transparent, on-chain). It converts to $SOE at the time of action. $SOE is non-transferable — it is reputation, not speculation. You cannot buy status here. You can only earn it.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: `${gold}22`, marginTop: '3rem' }}>
          {[
            { label: 'USDC IN', desc: 'Membership fees, marketplace transactions, artifact sales — all priced and settled in USDC. Transparent. Stable. Auditable.', icon: '→' },
            { label: '$SOE MINTED', desc: 'USDC inflows automatically mint $SOE for active participants. Non-transferable. Non-speculative. Pure reputation.', icon: '⬡' },
            { label: '$SOE BURNED', desc: 'Ritual actions burn tokens permanently. Every burn reduces supply. Participation creates scarcity. Scarcity creates meaning.', icon: '↑' },
          ].map(item => (
            <div key={item.label} style={{ background: '#0a0a0a', padding: '2rem', textAlign: 'center' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '1.5rem', color: gold, opacity: 0.4, marginBottom: '1rem' }}>{item.icon}</div>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, marginBottom: '0.75rem' }}>{item.label}</div>
              <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '13px', color: muted, lineHeight: 1.7 }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: '4rem 2rem', textAlign: 'center', borderTop: `1px solid ${gold}22` }}>
        <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.1rem', color: muted, fontStyle: 'italic', marginBottom: '2rem' }}>
          All flows are illustrative of the Society&apos;s design intent. Live on-chain data will be linked here as the protocol matures.
        </p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="/join" style={{ fontFamily: 'Cinzel, serif', fontSize: '0.8rem', letterSpacing: '0.2em', color: '#000', background: gold, padding: '1rem 2.5rem', textDecoration: 'none', display: 'inline-block' }}>JOIN THE SOCIETY</a>
          <a href="/labyrinth" style={{ fontFamily: 'Cinzel, serif', fontSize: '0.8rem', letterSpacing: '0.2em', color: gold, border: `2px solid ${gold}`, padding: '1rem 2.5rem', textDecoration: 'none', display: 'inline-block' }}>ENTER THE LABYRINTH</a>
        </div>
      </section>

      <footer style={{ padding: '3rem 2rem', borderTop: `1px solid ${gold}22`, textAlign: 'center' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, opacity: 0.4 }}>SOCIETY OF EXPLORERS · 92B SOUTH ST · SOCIETYOFEXPLORERS.COM</div>
      </footer>
    </div>
  );
}
