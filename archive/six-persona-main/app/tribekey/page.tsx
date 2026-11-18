import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tribekey | Society of Explorers',
  description: 'The physical artifact that activates your Explorer OS. A key to a new kind of membership.',
};

export default function Tribekey() {
  const gold = '#c9a84c';
  const dim = '#d4c9a8';
  const muted = '#9a8f7a';
  const red = '#c0392b';

  return (
    <div style={{ minHeight: '100vh', background: '#000', color: '#fff', fontFamily: 'Cormorant Garamond, serif', overflowX: 'hidden' }}>

      {/* NAV */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to bottom, #000, transparent)' }}>
        <a href="/salon" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, textDecoration: 'none', opacity: 0.7 }}>← RETURN TO THE SALON</a>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5 }}>SOCIETY OF EXPLORERS</div>
      </nav>

      {/* HERO */}
      <section style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(ellipse at 50% 60%, #1a1200 0%, #000 65%)', textAlign: 'center', padding: '6rem 2rem 4rem' }}>
        <div style={{ maxWidth: '800px' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.5em', color: gold, opacity: 0.5, marginBottom: '2rem' }}>THE PHYSICAL ARTIFACT</div>
          <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(3rem, 10vw, 7rem)', fontWeight: 300, letterSpacing: '0.2em', lineHeight: 1.05, marginBottom: '2rem' }}>
            TRIBE<span style={{ color: gold }}>KEY</span>
          </h1>
          <div style={{ width: '60px', height: '1px', background: gold, margin: '0 auto 2rem', opacity: 0.4 }} />
          <p style={{ fontSize: '1.4rem', color: dim, lineHeight: 1.9, marginBottom: '1.5rem', maxWidth: '600px', margin: '0 auto 1.5rem' }}>
            A small crystal device. You hold it. You plug it in. The world changes.
          </p>
          <p style={{ fontSize: '1.1rem', color: muted, lineHeight: 1.8, marginBottom: '3rem', fontStyle: 'italic' }}>
            Not a password. Not an app. Not a subscription. A key.
          </p>
          <a href="#what-it-is" style={{ fontFamily: 'Cinzel, serif', fontSize: '0.8rem', letterSpacing: '0.25em', color: gold, border: `1px solid ${gold}`, padding: '1rem 3rem', textDecoration: 'none', display: 'inline-block' }}>
            UNDERSTAND THE ARTIFACT
          </a>
        </div>
      </section>

      {/* WHAT IT IS */}
      <section id="what-it-is" style={{ padding: '8rem 2rem', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem' }}>I.</div>
        <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.8rem, 4vw, 3rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '2rem', borderBottom: `1px solid ${gold}44`, paddingBottom: '1rem' }}>
          WHAT THE TRIBEKEY IS
        </h2>
        <p style={{ fontSize: '1.2rem', lineHeight: 2, color: dim, marginBottom: '2rem' }}>
          The Tribekey is a physical USB device — small enough to hold between your fingers, heavy enough to feel real. Inside it is a secure enclave containing your cryptographic identity: your membership in the Society of Explorers, your $EXP token balance, your on-chain history, your access to Explorer OS.
        </p>
        <p style={{ fontSize: '1.2rem', lineHeight: 2, color: dim, marginBottom: '2rem' }}>
          You plug it into any computer. Instantly, that machine becomes your personal Explorer OS terminal. The Salon opens. Your thinker agents are ready. Your tasks, your conversations, your artifacts — all there, all yours, all encrypted. When you unplug, you take everything with you. <strong style={{ color: '#e8e0d0' }}>The machine forgets you were ever there.</strong>
        </p>
        <p style={{ fontSize: '1.2rem', lineHeight: 2, color: dim }}>
          This is not a cloud login. This is not a browser extension. This is not an account. This is a key — to your own digital sovereignty.
        </p>
      </section>

      {/* THE RITUAL */}
      <section style={{ padding: '8rem 2rem', background: '#050505' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem' }}>II.</div>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.8rem, 4vw, 3rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '2rem', borderBottom: `1px solid ${gold}44`, paddingBottom: '1rem' }}>
            THE RITUAL OF ACTIVATION
          </h2>
          <p style={{ fontSize: '1.1rem', color: muted, fontStyle: 'italic', marginBottom: '3rem', lineHeight: 1.8 }}>
            The first 30 seconds determine whether someone sees magic or just sees tech.
          </p>

          {[
            {
              num: '01',
              title: 'You receive it',
              body: 'The Tribekey arrives as a founding member artifact — hand-delivered at the Society dinner, or shipped in black packaging with a wax seal. It feels like receiving something that matters. Because it does.',
            },
            {
              num: '02',
              title: 'You hold it',
              body: 'Crystal-clear housing over a matte black circuit. Small enough to lose — precious enough not to. Engraved with your founding member number. This is the physical proof that you were here at the beginning.',
            },
            {
              num: '03',
              title: 'You plug it in',
              body: 'The device mounts. A portal opens. Explorer OS initializes — your personal environment, your thinker agents, your salon, your task hub. The first time this happens, it should feel like stepping through a door.',
            },
            {
              num: '04',
              title: 'The machine forgets you',
              body: 'When you unplug, Explorer OS closes. Your session, your data, your identity — pulled back into the key. The host machine holds nothing. You are a ghost that was never there.',
            },
            {
              num: '05',
              title: 'You carry the world with you',
              body: 'Every computer in the world is now your computer. Every library, every caf\u00e9, every hotel. Your Tribekey is your membership card, your identity document, your digital home — all in one object small enough to wear around your neck.',
            },
          ].map(step => (
            <div key={step.num} style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '2rem', marginBottom: '3.5rem', paddingBottom: '3.5rem', borderBottom: `1px solid ${gold}11` }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '1.8rem', fontWeight: 300, color: gold, opacity: 0.25, paddingTop: '0.25rem' }}>{step.num}</div>
              <div>
                <h3 style={{ fontFamily: 'Cinzel, serif', fontSize: '1rem', fontWeight: 300, letterSpacing: '0.15em', color: gold, marginBottom: '0.75rem' }}>{step.title.toUpperCase()}</h3>
                <p style={{ fontSize: '1.15rem', lineHeight: 2, color: dim }}>{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* EXPLORER OS */}
      <section style={{ padding: '8rem 2rem', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem' }}>III.</div>
        <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.8rem, 4vw, 3rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '2rem', borderBottom: `1px solid ${gold}44`, paddingBottom: '1rem' }}>
          EXPLORER OS
        </h2>
        <p style={{ fontSize: '1.2rem', lineHeight: 2, color: dim, marginBottom: '2rem' }}>
          Explorer OS is not an operating system in the traditional sense. It does not replace Windows or macOS. It is a sovereign layer that runs on top — a portal to the Society of Explorers that activates when your Tribekey is present and disappears when it is removed.
        </p>
        <p style={{ fontSize: '1.2rem', lineHeight: 2, color: dim, marginBottom: '3rem' }}>
          Inside Explorer OS: your Salon, where the minds of history await. Your Productivity Hub, where Socrates helps you choose what matters. Your artifacts — books, merch, creations — all linked to your on-chain identity. Your $EXP balance, accumulating with every act of participation. The Labyrinth, always open.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: `${gold}22`, marginBottom: '3rem' }}>
          {[
            { label: 'THE SALON', desc: 'Six thinkers. Socrates, Plato, Nietzsche, Marcus Aurelius, Einstein, Jobs. Ready to counsel, challenge, and provoke.' },
            { label: 'THE HUB', desc: 'Your productivity kanban, guided by philosophical agents who tell you what actually matters.' },
            { label: 'THE ARTIFACTS', desc: 'Your books, merch, NFTs, and on-chain history — all accessible, all yours, all portable.' },
            { label: '$EXP TOKENS', desc: 'Non-transferable reputation. Earned by participating, creating, contributing. The measure of your Society standing.' },
            { label: 'THE LABYRINTH', desc: 'The philosophical foundation of the Society. Always accessible. Always deepening.' },
            { label: 'THE MARKET', desc: 'Society goods, ideas, and connections. Built for members who understand value.' },
          ].map(item => (
            <div key={item.label} style={{ background: '#0a0a0a', padding: '1.5rem' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, opacity: 0.7, marginBottom: '0.75rem' }}>{item.label}</div>
              <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '13px', color: muted, lineHeight: 1.7 }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* THE PHILOSOPHY */}
      <section style={{ padding: '8rem 2rem', background: '#050810' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem' }}>IV.</div>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.8rem, 4vw, 3rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '2rem', borderBottom: `1px solid ${gold}44`, paddingBottom: '1rem' }}>
            WHY A PHYSICAL KEY
          </h2>
          <p style={{ fontSize: '1.2rem', lineHeight: 2, color: dim, marginBottom: '2rem' }}>
            Heidegger warned that technology reduces everything to standing-reserve — resources waiting to be used. Every platform login you have is standing-reserve for a corporation. Your attention, your data, your identity — all stored on servers you don&apos;t own, governed by terms you didn&apos;t write, revocable at any moment.
          </p>
          <p style={{ fontSize: '1.2rem', lineHeight: 2, color: dim, marginBottom: '2rem' }}>
            The Tribekey is the counter-move. It is the <em>poiesis</em> — the bringing-forth of a new relationship between human and machine. When your identity lives in your hand rather than in a server farm, you are not standing-reserve. You are sovereign.
          </p>

          <blockquote style={{ margin: '3rem 0', padding: '1.5rem 2rem', borderLeft: `2px solid ${gold}`, background: '#0a0800', fontStyle: 'italic', fontSize: '1.15rem', color: dim, lineHeight: 1.8 }}>
            &ldquo;The saving power grows where the danger is.&rdquo;
            <div style={{ marginTop: '0.75rem', fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: gold, opacity: 0.7, fontStyle: 'normal' }}>— HEIDEGGER, CITING HÖLDERLIN</div>
          </blockquote>

          <p style={{ fontSize: '1.2rem', lineHeight: 2, color: dim }}>
            The danger is total digital dependency — identity as a service, existence contingent on platform survival. The saving power is this: a small crystal object in your pocket that contains everything you are in the digital world. Art first. Then technology. The Tribekey is both.
          </p>
        </div>
      </section>

      {/* FOUNDING MEMBERS */}
      <section style={{ padding: '8rem 2rem', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem' }}>V.</div>
        <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.8rem, 4vw, 3rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '2rem', borderBottom: `1px solid ${gold}44`, paddingBottom: '1rem' }}>
          THE FOUNDING MEMBERS
        </h2>
        <p style={{ fontSize: '1.2rem', lineHeight: 2, color: dim, marginBottom: '2rem' }}>
          The first Tribekeys go to founding members — the ten people who hold the Crystal Hub prototype at 92B South St and become the seed of everything that follows. Their founding member number is engraved on the device. Their names are written on-chain. They are not users. They are the origin.
        </p>
        <p style={{ fontSize: '1.2rem', lineHeight: 2, color: dim, marginBottom: '3rem' }}>
          Being a founding member means you were here when the Society was still a question. Before the product was finished. Before the community was built. Before the world knew what this was. You saw it, you held it, you chose it.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', background: `${gold}22`, marginBottom: '3rem' }}>
          {[
            { label: 'FOUNDING DINNER', desc: 'The first gathering at 92B South St. You receive your Tribekey in person. This moment is recorded on-chain.' },
            { label: 'ENGRAVED NUMBER', desc: 'Your founding member number is etched into the device. There are exactly 10 founding members. Then the list closes.' },
            { label: 'PERPETUAL $EXP', desc: 'Founding members earn $EXP at a multiplier that never diminishes. You were first. The network rewards that forever.' },
            { label: 'GOVERNANCE RIGHTS', desc: "Founding members vote on the Society's future. New thinkers, new artifacts, new initiatives — you decide." },
          ].map(item => (
            <div key={item.label} style={{ background: '#0a0a0a', padding: '2rem' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, opacity: 0.7, marginBottom: '0.75rem' }}>{item.label}</div>
              <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '14px', color: muted, lineHeight: 1.7 }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* TIMELINE */}
      <section style={{ padding: '8rem 2rem', background: '#050505' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem' }}>VI.</div>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.8rem, 4vw, 3rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '4rem', borderBottom: `1px solid ${gold}44`, paddingBottom: '1rem' }}>
            THE ROADMAP
          </h2>

          {[
            { phase: 'NOW', label: 'The Society Opens', desc: 'societyofexplorers.com is live. The Salon is open. The Labyrinth is navigable. The thinker agents are ready. Founding membership is available.' },
            { phase: 'NEXT', label: 'The Founding Dinner', desc: '92B South St. Ten founding members. The first Tribekey prototypes. The moment the Society stops being a website and becomes a place.' },
            { phase: 'SOON', label: 'Explorer OS Beta', desc: 'The Tribekey ships. Explorer OS launches. Members plug in and experience what digital sovereignty actually feels like for the first time.' },
            { phase: 'AHEAD', label: 'The Network Expands', desc: 'Every founding member becomes a node. Their referrals, their participation, their creations — all rewarded in $EXP. The Society grows by invitation, by merit, by proof of exploration.' },
            { phase: 'BEYOND', label: 'The Artifact Economy', desc: 'Books, merch, art — all as living blockchain artifacts. Every object a node. Every handoff a transaction. Every creator an owner. The new sharing economy is live.' },
          ].map((item) => (
            <div key={item.phase} style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '2rem', marginBottom: '3rem', position: 'relative' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: item.phase === 'NOW' ? gold : muted, opacity: item.phase === 'NOW' ? 1 : 0.6, paddingTop: '0.25rem' }}>{item.phase}</div>
              </div>
              <div style={{ borderLeft: `1px solid ${gold}33`, paddingLeft: '2rem', paddingBottom: '2rem' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.phase === 'NOW' ? gold : `${gold}44`, position: 'absolute', left: '107px', top: '4px' }} />
                <h3 style={{ fontFamily: 'Cinzel, serif', fontSize: '1rem', fontWeight: 300, letterSpacing: '0.15em', color: item.phase === 'NOW' ? gold : dim, marginBottom: '0.75rem' }}>{item.label.toUpperCase()}</h3>
                <p style={{ fontSize: '1.1rem', lineHeight: 1.9, color: muted }}>{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(ellipse at center, #1a1200 0%, #000 70%)', textAlign: 'center', padding: '4rem 2rem' }}>
        <div style={{ maxWidth: '700px' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.5em', color: gold, opacity: 0.5, marginBottom: '2rem' }}>THE INVITATION</div>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '2rem', lineHeight: 1.2 }}>
            TEN KEYS.<br />
            <span style={{ color: gold }}>TEN FOUNDING MEMBERS.</span><br />
            ONE BEGINNING.
          </h2>
          <p style={{ fontSize: '1.2rem', color: dim, lineHeight: 1.9, marginBottom: '1.5rem' }}>
            The founding dinner at 92B South St is coming. There are exactly ten seats. When you sit down, you receive your Tribekey. When you plug it in for the first time, the Society of Explorers becomes real.
          </p>
          <p style={{ fontSize: '1.1rem', color: muted, fontStyle: 'italic', lineHeight: 1.8, marginBottom: '3rem' }}>
            You don&apos;t apply. You recognize yourself as a founder and you claim your seat.
          </p>
          <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/join" style={{ fontFamily: 'Cinzel, serif', fontSize: '0.8rem', letterSpacing: '0.2em', color: '#000', background: gold, padding: '1.2rem 3rem', textDecoration: 'none', display: 'inline-block' }}>CLAIM YOUR SEAT</a>
            <a href="/labyrinth" style={{ fontFamily: 'Cinzel, serif', fontSize: '0.8rem', letterSpacing: '0.2em', color: gold, border: `2px solid ${gold}`, padding: '1.2rem 3rem', textDecoration: 'none', display: 'inline-block' }}>ENTER THE LABYRINTH</a>
          </div>
        </div>
      </section>

      <footer style={{ padding: '3rem 2rem', borderTop: `1px solid ${gold}22`, textAlign: 'center' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, opacity: 0.4 }}>SOCIETY OF EXPLORERS · 92B SOUTH ST · SOCIETYOFEXPLORERS.COM</div>
      </footer>

    </div>
  );
}
