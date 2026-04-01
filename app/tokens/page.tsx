import { Metadata } from 'next';

export const metadata: Metadata = {
  title: '$SOE Token Rituals | Society of Explorers',
  description: 'The living uses of $SOE — burn, stake, offer, unlock. Tokens as ritual acts.',
};

export default function Tokens() {
  const gold = '#c9a84c';
  const dim = '#d4c9a8';
  const muted = '#9a8f7a';

  const rituals = [
    {
      cost: '50 $SOE',
      title: 'UNLOCK A SECRET PASSAGE',
      location: 'THE LABYRINTH',
      desc: 'Each room of the Labyrinth contains a hidden door — a passage only visible to those who burn 50 $SOE. What waits beyond is different in every room. A hidden text. A suppressed quote. A philosophical provocation that never appears in the public version.',
      type: 'BURN',
      icon: '⬡',
    },
    {
      cost: '200 $SOE',
      title: 'PRIVATE SESSION WITH A THINKER',
      location: 'THE SALON',
      desc: 'Burn 200 $SOE to unlock a private, uninterrupted 60-minute conversation with any thinker. No other members. No public log. Just you and Nietzsche, or you and Socrates — thinking together in the dark.',
      type: 'BURN',
      icon: 'Σ',
    },
    {
      cost: '25 $SOE',
      title: 'ACTIVATE A SOCIETY BOOK',
      location: 'THE ARTIFACT',
      desc: 'The first tap of any Society Book requires 25 $SOE as an activation offering. This is not a fee — it is a ritual. You are saying: I acknowledge this object as sacred. The network responds by registering your book on-chain and opening the micropayment stream.',
      type: 'BURN',
      icon: '◈',
    },
    {
      cost: '100 $SOE',
      title: 'MINT A RITUAL NFT',
      location: 'THE MARKET',
      desc: 'Any artifact you create — a text, an image, a philosophical argument — can be minted as a ritual NFT by burning 100 $SOE. The burn proves intention. The NFT proves authorship. The blockchain proves permanence.',
      type: 'BURN',
      icon: '◉',
    },
    {
      cost: '500 $SOE',
      title: 'STAKE FOR GOVERNANCE',
      location: 'THE COUNCIL',
      desc: "Stake 500 $SOE to earn a vote in the Society's governance. Which new thinkers join the Salon? Which rituals get built next? What does 92B South St become? Stakers decide. Tokens remain locked while you hold power.",
      type: 'STAKE',
      icon: 'Π',
    },
    {
      cost: '10 $SOE',
      title: 'MAKE AN OFFERING',
      location: 'THE TREASURY',
      desc: 'At any time, burn 10 $SOE as an offering to the community treasury. No reward. No recognition. Just the act of giving to something larger than yourself. The treasury records it. The community knows. The act matters.',
      type: 'BURN',
      icon: '↑',
    },
    {
      cost: '75 $SOE',
      title: 'COMMISSION A THINKER ARTIFACT',
      location: 'THE SALON',
      desc: 'Burn 75 $SOE to commission a thinker to write an artifact — a letter, a philosophical argument, a manifesto — addressed specifically to you, about your current situation. Delivered as a signed NFT to your wallet.',
      type: 'BURN',
      icon: 'N',
    },
    {
      cost: '150 $SOE',
      title: 'OPEN THE LABYRINTH FOR ANOTHER',
      location: 'THE LABYRINTH',
      desc: 'Burn 150 $SOE to gift a full Labyrinth access pass to someone who has not yet found the Society. The pass arrives as an NFT. They receive it anonymously — no sender, no obligation. A pure act of philosophical generosity.',
      type: 'BURN',
      icon: '→',
    },
  ];

  const earnings = [
    { action: 'Daily salon conversation', reward: '+5 $SOE', freq: 'Per session' },
    { action: 'Complete a Labyrinth room', reward: '+20 $SOE', freq: 'Once per room' },
    { action: 'Your Society Book gets tapped', reward: '+2 $SOE', freq: 'Per tap' },
    { action: 'Artifact sold in marketplace', reward: '+10% of sale', freq: 'Per transaction' },
    { action: 'Refer a new member', reward: '+100 $SOE', freq: 'On activation' },
    { action: 'Hold founding member status', reward: '+50 $SOE', freq: 'Per month' },
    { action: 'Merch product purchased', reward: '+15 $SOE', freq: 'Per sale' },
    { action: 'Make a governance vote', reward: '+5 $SOE', freq: 'Per proposal' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#000', color: '#fff', fontFamily: 'Cormorant Garamond, serif', overflowX: 'hidden' }}>

      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to bottom, #000, transparent)' }}>
        <a href="/salon" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, textDecoration: 'none', opacity: 0.7 }}>← RETURN TO THE SALON</a>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5 }}>SOCIETY OF EXPLORERS</div>
      </nav>

      {/* HERO */}
      <section style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(ellipse at center, #1a0d00 0%, #000 70%)', textAlign: 'center', padding: '6rem 2rem 4rem' }}>
        <div style={{ maxWidth: '800px' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.5em', color: gold, opacity: 0.5, marginBottom: '2rem' }}>THE RITUAL ECONOMY</div>
          <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(2.5rem, 8vw, 5.5rem)', fontWeight: 300, letterSpacing: '0.15em', lineHeight: 1.1, marginBottom: '2rem' }}>
            <span style={{ color: gold }}>$SOE</span><br />TOKEN RITUALS
          </h1>
          <div style={{ width: '60px', height: '1px', background: gold, margin: '0 auto 2rem', opacity: 0.4 }} />
          <p style={{ fontSize: '1.3rem', color: dim, lineHeight: 1.9, marginBottom: '1.5rem', maxWidth: '600px', margin: '0 auto 1.5rem' }}>
            $SOE is not a currency. It is a measure of participation, a proof of commitment, a ritual object. You cannot buy it. You earn it by exploring, creating, and contributing — and you burn it to do things that matter.
          </p>
          <p style={{ fontSize: '1.1rem', color: muted, fontStyle: 'italic', lineHeight: 1.8 }}>
            Every burn is an act of will. Every earn is an act of creation.
          </p>
        </div>
      </section>

      {/* RITUAL REGISTRY */}
      <section style={{ padding: '6rem 2rem', background: '#050505' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem', textAlign: 'center' }}>I.</div>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '4rem', textAlign: 'center', borderBottom: `1px solid ${gold}44`, paddingBottom: '1rem' }}>
            THE RITUAL REGISTRY
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1px', background: `${gold}11` }}>
            {rituals.map((ritual, i) => (
              <div key={i} style={{ background: '#0a0a0a', padding: '2.5rem', borderTop: `1px solid ${gold}${ritual.type === 'STAKE' ? '66' : '22'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '2rem', color: gold, opacity: 0.2 }}>{ritual.icon}</div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: ritual.type === 'STAKE' ? '#6090c0' : '#c05050', opacity: 0.8, marginBottom: '2px' }}>{ritual.type}</div>
                    <div style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', color: gold }}>{ritual.cost}</div>
                  </div>
                </div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: muted, marginBottom: '0.5rem', opacity: 0.6 }}>{ritual.location}</div>
                <h3 style={{ fontFamily: 'Cinzel, serif', fontSize: '1rem', fontWeight: 300, letterSpacing: '0.1em', color: gold, marginBottom: '1rem' }}>{ritual.title}</h3>
                <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '14px', color: dim, lineHeight: 1.8 }}>{ritual.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW TO EARN */}
      <section style={{ padding: '6rem 2rem', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem', textAlign: 'center' }}>II.</div>
        <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '3rem', textAlign: 'center', borderBottom: `1px solid ${gold}44`, paddingBottom: '1rem' }}>
          HOW TO EARN $SOE
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {earnings.map((item, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '2rem', alignItems: 'center', padding: '1.25rem 0', borderBottom: `1px solid ${gold}11` }}>
              <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: dim }}>{item.action}</div>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', color: gold, whiteSpace: 'nowrap' }}>{item.reward}</div>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.1em', color: muted, opacity: 0.6, whiteSpace: 'nowrap' }}>{item.freq}</div>
            </div>
          ))}
        </div>
      </section>

      {/* PHILOSOPHY OF TOKENS */}
      <section style={{ padding: '6rem 2rem', background: '#050505' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem', textAlign: 'center' }}>III.</div>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '2rem', textAlign: 'center', borderBottom: `1px solid ${gold}44`, paddingBottom: '1rem' }}>
            WHY $SOE IS DIFFERENT
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem' }}>
            <div>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: '#c05050', opacity: 0.8, marginBottom: '1rem' }}>MOST CRYPTO TOKENS</div>
              {['Designed for speculation', 'Transferable — you can buy status', 'Value from hype cycles', 'Extractive — early holders dump on late buyers', 'Disconnected from real activity'].map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.6rem' }}>
                  <div style={{ color: '#c05050', opacity: 0.5, flexShrink: 0 }}>✕</div>
                  <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '14px', color: muted }}>{item}</div>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, marginBottom: '1rem' }}>$SOE</div>
              {['Non-transferable — earned, not bought', 'Status = depth of participation', 'Value from real community activity', 'Burn mechanics create genuine scarcity', 'Every action on the platform generates tokens'].map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.6rem' }}>
                  <div style={{ color: gold, opacity: 0.6, flexShrink: 0 }}>⬡</div>
                  <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '14px', color: dim }}>{item}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section style={{ padding: '4rem 2rem', textAlign: 'center', borderTop: `1px solid ${gold}22` }}>
        <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.1rem', color: muted, fontStyle: 'italic', marginBottom: '2rem' }}>
          $SOE launches with Explorer OS. Founding members receive the first allocation.
        </p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="/join" style={{ fontFamily: 'Cinzel, serif', fontSize: '0.8rem', letterSpacing: '0.2em', color: '#000', background: gold, padding: '1rem 2.5rem', textDecoration: 'none', display: 'inline-block' }}>BECOME A FOUNDING MEMBER</a>
          <a href="/transparency" style={{ fontFamily: 'Cinzel, serif', fontSize: '0.8rem', letterSpacing: '0.2em', color: gold, border: `2px solid ${gold}`, padding: '1rem 2.5rem', textDecoration: 'none', display: 'inline-block' }}>VIEW TRANSPARENCY DASHBOARD</a>
        </div>
      </section>

      <footer style={{ padding: '3rem 2rem', borderTop: `1px solid ${gold}22`, textAlign: 'center' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, opacity: 0.4 }}>SOCIETY OF EXPLORERS · 92B SOUTH ST · SOCIETYOFEXPLORERS.COM</div>
      </footer>
    </div>
  );
}
