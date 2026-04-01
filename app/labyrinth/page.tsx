import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'The Labyrinth of Becoming | Society of Explorers',
  description: 'Truth hides in beauty. Art discloses. We create.',
};

export default function Labyrinth() {
  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden" style={{ fontFamily: 'Cormorant Garamond, serif' }}>

      {/* Entry Hall */}
      <section className="h-screen flex items-center justify-center relative bg-gradient-to-b from-black to-indigo-950">
        <div className="max-w-3xl text-center z-10 px-8 relative">
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.3em', color: '#c9a84c', marginBottom: '2rem', opacity: 0.7 }}>SOCIETY OF EXPLORERS</div>
          <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(2rem, 6vw, 5rem)', fontWeight: 300, letterSpacing: '0.15em', marginBottom: '1.5rem', lineHeight: 1.2 }}>
            THE LABYRINTH<br />OF BECOMING
          </h1>
          <p className="text-2xl mb-12 italic" style={{ color: '#c9a84c' }}>
            Step through — truth hides in beauty.
          </p>
          <a href="#room-origins" style={{ display: 'inline-block', padding: '1.2rem 3rem', border: '1px solid #c9a84c', color: '#c9a84c', fontFamily: 'Cinzel, serif', fontSize: '0.85rem', letterSpacing: '0.2em', textDecoration: 'none' }}>
            OPEN THE FIRST DOOR
          </a>
        </div>
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, #1a1a3e 0%, #000 70%)', opacity: 0.6 }} />
      </section>

      {/* Room 1: Origins */}
      <section id="room-origins" style={{ padding: '7rem 2rem', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.25em', color: '#c9a84c', opacity: 0.6, marginBottom: '1rem' }}>ROOM I</div>
        <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 4vw, 3rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '1.5rem', borderBottom: '1px solid #c9a84c44', paddingBottom: '1rem' }}>
          ROOM OF ORIGINS
        </h2>
        <p style={{ fontSize: '1.2rem', lineHeight: 2, color: '#d4c9a8' }}>
          We create because existence demands it. Plato&apos;s Demiurge shapes chaos into cosmos. Genesis tells us we are made in the image of God — co-creators, imago Dei. Dharma flows through mindful work. In the age of AI, we are not standing-reserve — Heidegger&apos;s Gestell, the enframing that reduces all being to resource. We are the poets who reveal truth in beauty. Art first. Then technology. Always in that order.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginTop: '3rem' }}>
          {[
            { title: 'Radioactive Rihanna', subtitle: 'God Series' },
            { title: 'Prometheus', subtitle: 'God Series' },
            { title: 'Little Wings', subtitle: 'God Series' },
          ].map(({ title, subtitle }) => (
            <div key={title} style={{ aspectRatio: '3/2', background: 'linear-gradient(135deg, #111, #1a1a0a)', border: '1px solid #c9a84c33', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: '#c9a84c', opacity: 0.5, marginBottom: '0.5rem' }}>GIOVANNI DECUNTO</div>
                <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '0.9rem', color: '#d4c9a8', fontStyle: 'italic' }}>{title}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: '#c9a84c', opacity: 0.4, marginTop: '0.5rem' }}>{subtitle}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Room 2: Enframing */}
      <section style={{ padding: '7rem 2rem', background: '#0a0a0a' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.25em', color: '#c0392b', opacity: 0.6, marginBottom: '1rem' }}>ROOM II</div>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 4vw, 3rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '1.5rem', borderBottom: '1px solid #c0392b44', paddingBottom: '1rem', color: '#e8d5d5' }}>
            CHAMBER OF ENFRAMING
          </h2>
          <p style={{ fontSize: '1.2rem', lineHeight: 2, color: '#c9b8b8' }}>
            Heidegger&apos;s <em>The Question Concerning Technology</em> (1954): modern technology turns everything into standing-reserve — forests into fuel, rivers into power sources, humans into data, Being itself into exploitable resource. We have lived inside this danger. The smartphone is Gestell made glass. The algorithm is Gestell made code. The Society of Explorers exists to interrupt this enframing — to reclaim the poetic, the revealing, the aletheia that technology conceals.
          </p>
          <blockquote style={{ margin: '3rem 0', padding: '1.5rem 2rem', borderLeft: '2px solid #c0392b', background: '#110808', fontStyle: 'italic', fontSize: '1.1rem', color: '#c9b8b8', lineHeight: 1.8 }}>
            &ldquo;The saving power grows where the danger is.&rdquo; — Heidegger, citing Hölderlin
          </blockquote>
        </div>
      </section>

      {/* Room 3: Founder Story */}
      <section style={{ padding: '7rem 2rem', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.25em', color: '#c9a84c', opacity: 0.6, marginBottom: '1rem' }}>ROOM III</div>
        <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 4vw, 3rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '1.5rem', borderBottom: '1px solid #c9a84c44', paddingBottom: '1rem' }}>
          THE FOUNDER&apos;S PATH
        </h2>
        <p style={{ fontSize: '1.2rem', lineHeight: 2, color: '#d4c9a8' }}>
          Christopher Taylor studied the Great Books at Carthage College under primary mentor Christopher Lynch — political scientist, student of the ancients — and focused deeply on Martin Heidegger under Professor Daniel Magurshak. Heidegger&apos;s essential question — <em>&ldquo;Why is there something rather than nothing?&rdquo;</em> — and the poetry in his thinking guided him toward the divine.
        </p>
        <p style={{ fontSize: '1.2rem', lineHeight: 2, color: '#d4c9a8', marginTop: '1.5rem' }}>
          In 2007 he traveled with Professor Magurshak to the phenomenology and transhumanism conference in Pittsburgh — where philosophy met its future, and he first glimpsed what it meant to think at the edge of the human. He later left Columbia&apos;s post-baccalaureate classics program to build in the real world: solar energy, battery systems, crypto infrastructure. From Heidegger&apos;s forests to blockchain horizons, the same quest has never changed — understand existence so we can transcend it.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginTop: '3rem', textAlign: 'center' }}>
          {[
            { label: 'THE ANCHOR', value: 'Great Books\nCarthage College' },
            { label: 'THE PIVOT', value: '2007 Pittsburgh\nPhenomenology Conference' },
            { label: 'THE FRONTIER', value: 'Energy · Crypto\nSociety of Explorers' },
          ].map(item => (
            <div key={item.label} style={{ padding: '1.5rem', border: '1px solid #c9a84c22', background: '#0d0d00' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: '#c9a84c', opacity: 0.6, marginBottom: '0.75rem' }}>{item.label}</div>
              <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1rem', color: '#d4c9a8', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{item.value}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Room 4: Manifestation */}
      <section style={{ padding: '7rem 2rem', background: '#000', textAlign: 'center' }}>
        <div style={{ maxWidth: '700px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.25em', color: '#c9a84c', opacity: 0.6, marginBottom: '1rem' }}>ROOM IV</div>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 4vw, 3rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '2rem', color: '#c9a84c' }}>
            HALL OF MANIFESTATION
          </h2>
          <p style={{ fontSize: '1.2rem', lineHeight: 2, color: '#d4c9a8' }}>
            Our products are not commodities. They are talismans — beautiful objects that carry truth. Mugs that question. Shirts that ascend. Journals that remind you: you are co-creator, not standing-reserve. Every object a door. Every door a room.
          </p>
          <a href="/salon" style={{ display: 'inline-block', marginTop: '2.5rem', padding: '1rem 2.5rem', border: '1px solid #c9a84c', color: '#c9a84c', fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', textDecoration: 'none' }}>
            ⬡ ENTER THE SALON
          </a>
        </div>
      </section>

      {/* Exit Portal */}
      <section style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(to bottom, #0d0d2b, #000)', textAlign: 'center', padding: '2rem' }}>
        <div>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.25em', color: '#c9a84c', opacity: 0.6, marginBottom: '2rem' }}>THE THREE PILLARS</div>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 5vw, 4rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '1.5rem', lineHeight: 1.3 }}>
            SOLVE DEATH.<br />SHAPE ABUNDANCE.<br />FREE THE MIND.
          </h2>
          <p style={{ fontSize: '1.2rem', color: '#c9a84c', fontStyle: 'italic', marginBottom: '3rem', lineHeight: 1.8 }}>
            Singularity clarified. The Secret deployed.<br />Blockchain unlocked. The universe awaits.
          </p>
          <a href="/salon" style={{ display: 'inline-block', padding: '1.2rem 3rem', border: '2px solid #fff', color: '#fff', fontFamily: 'Cinzel, serif', fontSize: '0.85rem', letterSpacing: '0.2em', textDecoration: 'none' }}>
            RETURN TO THE WORLD — MANIFEST NOW
          </a>
        </div>
      </section>
    </div>
  );
}
