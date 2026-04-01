import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'The Labyrinth of Becoming | Society of Explorers',
  description: 'A guide to existence, creation, and the future of being human. Step through the doors.',
};

export default function Labyrinth() {
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

      {/* ═══ ENTRY HALL ═══ */}
      <section style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', background: 'radial-gradient(ellipse at center, #0d0d2b 0%, #000 70%)' }}>
        <div style={{ textAlign: 'center', zIndex: 10, padding: '0 2rem', maxWidth: '800px' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, opacity: 0.6, marginBottom: '2rem' }}>A GUIDE TO EXISTENCE</div>
          <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(2.2rem, 7vw, 5.5rem)', fontWeight: 300, letterSpacing: '0.1em', lineHeight: 1.15, marginBottom: '2rem' }}>
            THE LABYRINTH<br />OF BECOMING
          </h1>
          <p style={{ fontSize: '1.4rem', color: gold, fontStyle: 'italic', marginBottom: '1.5rem', lineHeight: 1.7 }}>
            &ldquo;Why is there something rather than nothing?&rdquo;
          </p>
          <p style={{ fontSize: '1.1rem', color: muted, lineHeight: 1.8, marginBottom: '3rem' }}>
            This is not a website. It is a labyrinth — a series of rooms, each a door deeper into truth.<br />
            Walk through. Take what you need. Leave changed.
          </p>
          <a href="#room-origins" style={{ display: 'inline-block', fontFamily: 'Cinzel, serif', fontSize: '0.8rem', letterSpacing: '0.25em', color: gold, border: `1px solid ${gold}`, padding: '1rem 3rem', textDecoration: 'none' }}>
            OPEN THE FIRST DOOR
          </a>
        </div>
        <div style={{ position: 'absolute', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: muted, opacity: 0.4 }}>↓ SCROLL TO DESCEND ↓</div>
      </section>

      {/* ═══ ROOM I: THE QUESTION ═══ */}
      <section id="room-origins" style={{ padding: '8rem 2rem', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem' }}>ROOM I</div>
        <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.8rem, 4vw, 3.2rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '0.5rem', borderBottom: `1px solid ${gold}44`, paddingBottom: '1rem' }}>
          THE QUESTION THAT STARTS EVERYTHING
        </h2>
        <p style={{ fontSize: '0.9rem', color: muted, fontFamily: 'Cinzel, serif', letterSpacing: '0.1em', marginBottom: '3rem' }}>On existence, philosophy, and why it matters now</p>

        <p style={{ fontSize: '1.2rem', lineHeight: 2, color: dim, marginBottom: '2rem' }}>
          Martin Heidegger asked what most people never ask: <em>&ldquo;Why is there something rather than nothing?&rdquo;</em> Not as an academic exercise — as the root question underneath every other question. Before technology, before politics, before productivity: <strong>why does anything exist at all?</strong>
        </p>
        <p style={{ fontSize: '1.2rem', lineHeight: 2, color: dim, marginBottom: '2rem' }}>
          When you truly sit with that question, something breaks open. You stop treating existence as a given and start experiencing it as a gift — mysterious, fragile, worth protecting. This is the philosophical foundation of everything we build here.
        </p>

        <blockquote style={{ margin: '3rem 0', padding: '1.5rem 2rem', borderLeft: `2px solid ${gold}`, background: '#0d0d0a', fontStyle: 'italic', fontSize: '1.15rem', color: dim, lineHeight: 1.8 }}>
          &ldquo;The most thought-provoking thing in our thought-provoking time is that we are still not thinking.&rdquo;
          <div style={{ marginTop: '0.75rem', fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: gold, opacity: 0.7 }}>— MARTIN HEIDEGGER</div>
        </blockquote>

        <p style={{ fontSize: '1.2rem', lineHeight: 2, color: dim, marginBottom: '2rem' }}>
          The Society of Explorers begins here — not with an app, a token, or a product. With a question. Because only people who have genuinely wrestled with existence are equipped to build a future worth inhabiting.
        </p>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '2rem' }}>
          <a href="https://plato.stanford.edu/entries/heidegger/" target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, border: `1px solid ${gold}44`, padding: '0.6rem 1.2rem', textDecoration: 'none', opacity: 0.8 }}>READ: HEIDEGGER (STANFORD) ↗</a>
          <a href="https://www.amazon.com/Being-Time-Martin-Heidegger/dp/0061575593" target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, border: `1px solid ${gold}44`, padding: '0.6rem 1.2rem', textDecoration: 'none', opacity: 0.8 }}>READ: BEING &amp; TIME ↗</a>
        </div>
      </section>

      {/* ART WALL I */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2px', margin: '0 0 0 0' }}>
        {['Radioactive Rihanna', 'Prometheus', 'Little Wings'].map(title => (
          <div key={title} style={{ aspectRatio: '4/3', background: 'linear-gradient(135deg, #0d0d0a, #1a1505)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderTop: `1px solid ${gold}22`, borderBottom: `1px solid ${gold}22` }}>
            <div style={{ textAlign: 'center', padding: '1rem' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.2em', color: gold, opacity: 0.4, marginBottom: '0.5rem' }}>GIOVANNI DECUNTO · GOD SERIES</div>
              <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1rem', color: dim, fontStyle: 'italic' }}>{title}</div>
              <div style={{ marginTop: '0.75rem', fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: gold, opacity: 0.3 }}>116 SOUTH ST · BOSTON</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ textAlign: 'center', padding: '1rem', background: '#030303' }}>
        <a href="https://giovannidecunto.com" target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, opacity: 0.5, textDecoration: 'none' }}>VIEW GIOVANNI DECUNTO&apos;S WORK AT GIOVANNIDECUNTO.COM ↗</a>
      </div>

      {/* ═══ ROOM II: ENFRAMING ═══ */}
      <section style={{ padding: '8rem 2rem', background: '#07030a' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: red, opacity: 0.7, marginBottom: '1rem' }}>ROOM II</div>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.8rem, 4vw, 3.2rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '0.5rem', borderBottom: `1px solid ${red}44`, paddingBottom: '1rem', color: '#e8d0d0' }}>
            THE DANGER: ENFRAMING
          </h2>
          <p style={{ fontSize: '0.9rem', color: '#9a7a7a', fontFamily: 'Cinzel, serif', letterSpacing: '0.1em', marginBottom: '3rem' }}>Heidegger&apos;s warning, written in 1954 — and more true now than ever</p>

          <p style={{ fontSize: '1.2rem', lineHeight: 2, color: '#c9b8b8', marginBottom: '2rem' }}>
            In 1954, Heidegger wrote <em>The Question Concerning Technology</em>. His central warning: modern technology does not merely give us tools — it fundamentally changes how we <em>see</em> the world. Everything becomes <strong>Gestell</strong> — enframing — where the entire world is ordered as standing-reserve, waiting to be used.
          </p>
          <p style={{ fontSize: '1.2rem', lineHeight: 2, color: '#c9b8b8', marginBottom: '2rem' }}>
            The river becomes a hydroelectric resource. The forest becomes timber inventory. <strong>The human becomes a data point.</strong> In 2025, we are living the fulfillment of this prophecy. AI systems optimize our attention, monetize our behavior, and reduce our choices to the outputs of recommendation algorithms. We are the standing-reserve now.
          </p>

          <blockquote style={{ margin: '3rem 0', padding: '1.5rem 2rem', borderLeft: `2px solid ${red}`, background: '#110808', fontStyle: 'italic', fontSize: '1.15rem', color: '#c9b8b8', lineHeight: 1.8 }}>
            &ldquo;The saving power grows where the danger is.&rdquo;
            <div style={{ marginTop: '0.75rem', fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: red, opacity: 0.8 }}>— HEIDEGGER, CITING HÖLDERLIN</div>
          </blockquote>

          <p style={{ fontSize: '1.2rem', lineHeight: 2, color: '#c9b8b8', marginBottom: '2rem' }}>
            But Heidegger does not end in despair. He points to <strong>poiesis</strong> — the bringing-forth, the revealing. Art, poetry, craft — these are the counter-forces. They do not control the world; they <em>disclose</em> it. They reveal what technology conceals: that existence is wondrous, not merely useful.
          </p>
          <p style={{ fontSize: '1.2rem', lineHeight: 2, color: '#c9b8b8' }}>
            This is why we say: <strong>art first, then technology.</strong> Not as aesthetics — as resistance. As the only answer to Gestell that actually works.
          </p>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '3rem' }}>
            <a href="https://thenewatlantis.com/publications/understanding-heidegger-on-technology" target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: red, border: `1px solid ${red}44`, padding: '0.6rem 1.2rem', textDecoration: 'none', opacity: 0.8 }}>READ: THE NEW ATLANTIS ON HEIDEGGER ↗</a>
            <a href="https://www.amazon.com/Question-Concerning-Technology-Essays/dp/0062290703" target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: red, border: `1px solid ${red}44`, padding: '0.6rem 1.2rem', textDecoration: 'none', opacity: 0.8 }}>READ: THE QUESTION CONCERNING TECHNOLOGY ↗</a>
          </div>
        </div>
      </section>

      {/* ═══ ROOM III: ORIGINS — WHY WE CREATE ═══ */}
      <section style={{ padding: '8rem 2rem', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem' }}>ROOM III</div>
        <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.8rem, 4vw, 3.2rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '0.5rem', borderBottom: `1px solid ${gold}44`, paddingBottom: '1rem' }}>
          WHY WE CREATE
        </h2>
        <p style={{ fontSize: '0.9rem', color: muted, fontFamily: 'Cinzel, serif', letterSpacing: '0.1em', marginBottom: '3rem' }}>Plato, Genesis, and dharma — three traditions, one truth</p>

        <p style={{ fontSize: '1.2rem', lineHeight: 2, color: dim, marginBottom: '2rem' }}>
          Plato&apos;s <em>Timaeus</em> gives us the Demiurge — a benevolent craftsman who takes chaotic matter and shapes it into cosmos using eternal Forms as blueprints. The world is not random. It is an imperfect copy of perfect ideas: beauty, goodness, truth. <strong>We are mini-demiurges.</strong> We look at the Forms and build — cities, art, code, community.
        </p>
        <p style={{ fontSize: '1.2rem', lineHeight: 2, color: dim, marginBottom: '2rem' }}>
          Genesis 1:26: <em>&ldquo;Let us make man in our image.&rdquo;</em> <strong>Imago Dei</strong> — we are made in the image of the Creator, which means our deepest nature is to create. Not to consume. Not to optimize. To <em>bring forth</em>. Adam names the animals before the Fall; work is not punishment, it is vocation.
        </p>
        <p style={{ fontSize: '1.2rem', lineHeight: 2, color: dim, marginBottom: '2rem' }}>
          In Buddhism, <strong>dharma</strong> — right action flowing through you — is the path through samsara. Mindful work reduces suffering. Compassionate creation expands it. The overlap across all three traditions is impossible to ignore: <em>be in the world, act with intention, shape reality toward beauty.</em>
        </p>
        <p style={{ fontSize: '1.2rem', lineHeight: 2, color: dim }}>
          In the age of AI, machines generate — but they do not originate. They remix what humans have created. <strong>We are the source.</strong> The Society of Explorers exists to remind its members: you are not a user. You are a creator. That is your deepest nature, your highest calling, and in this moment of history, your most urgent responsibility.
        </p>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '3rem' }}>
          <a href="https://plato.stanford.edu/entries/plato-timaeus/" target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, border: `1px solid ${gold}44`, padding: '0.6rem 1.2rem', textDecoration: 'none', opacity: 0.8 }}>READ: PLATO&apos;S TIMAEUS ↗</a>
          <a href="https://www.biblegateway.com/passage/?search=Genesis+1%3A26-28&version=NIV" target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, border: `1px solid ${gold}44`, padding: '0.6rem 1.2rem', textDecoration: 'none', opacity: 0.8 }}>READ: GENESIS 1:26-28 ↗</a>
          <a href="https://www.amazon.com/Dhammapada-Easwaran-Nilgiri-Press/dp/1586380206" target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, border: `1px solid ${gold}44`, padding: '0.6rem 1.2rem', textDecoration: 'none', opacity: 0.8 }}>READ: THE DHAMMAPADA ↗</a>
        </div>
      </section>

      {/* ═══ ROOM IV: THE FOUNDER'S PATH ═══ */}
      <section style={{ padding: '8rem 2rem', background: '#050810' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem' }}>ROOM IV</div>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.8rem, 4vw, 3.2rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '0.5rem', borderBottom: `1px solid ${gold}44`, paddingBottom: '1rem' }}>
            THE FOUNDER&apos;S PATH
          </h2>
          <p style={{ fontSize: '0.9rem', color: muted, fontFamily: 'Cinzel, serif', letterSpacing: '0.1em', marginBottom: '3rem' }}>Where this comes from — and why it matters that it&apos;s real</p>

          <p style={{ fontSize: '1.2rem', lineHeight: 2, color: dim, marginBottom: '2rem' }}>
            Christopher Taylor studied the Great Books at Carthage College — the tradition of reading the foundational texts of Western civilization not as history, but as living questions. His primary mentor was <strong>Christopher Lynch</strong>, political scientist and guide through the ancients. His philosophy focus was shaped deeply by <strong>Professor Daniel Magurshak</strong>, under whom he engaged with Heidegger&apos;s most essential work.
          </p>
          <p style={{ fontSize: '1.2rem', lineHeight: 2, color: dim, marginBottom: '2rem' }}>
            In 2007, Taylor traveled with Professor Magurshak to a phenomenology and transhumanism conference in Pittsburgh — one of the first gatherings where continental philosophy met the emerging question of what humans might become. There he encountered thinkers wrestling with Heidegger&apos;s ontology alongside questions of mind uploading, longevity, and the post-human. <strong>He has been in this conversation ever since.</strong>
          </p>
          <p style={{ fontSize: '1.2rem', lineHeight: 2, color: dim, marginBottom: '2rem' }}>
            He later left Columbia&apos;s post-baccalaureate classics program — not because philosophy failed him, but because the world was becoming the lab. He moved into solar energy, battery systems, and crypto infrastructure. The question never changed: <em>how do we understand existence so we can transcend it?</em> The medium changed. The mission did not.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', margin: '3rem 0', border: `1px solid ${gold}22` }}>
            {[
              { year: '2007', event: 'Phenomenology & Transhumanism Conference, Pittsburgh' },
              { year: '2010s', event: 'Solar energy, battery systems, crypto infrastructure' },
              { year: '2024', event: 'Society of Explorers — the mission made visible' },
            ].map(({ year, event }) => (
              <div key={year} style={{ padding: '2rem', borderRight: `1px solid ${gold}22`, textAlign: 'center' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '1.4rem', color: gold, marginBottom: '0.5rem' }}>{year}</div>
                <div style={{ fontSize: '0.95rem', color: muted, lineHeight: 1.7 }}>{event}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '2rem' }}>
            <a href="https://en.wikipedia.org/wiki/Christopher_Lynch_(political_scientist)" target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, border: `1px solid ${gold}44`, padding: '0.6rem 1.2rem', textDecoration: 'none', opacity: 0.8 }}>READ: CHRISTOPHER LYNCH ↗</a>
            <a href="https://www.carthage.edu/live/profiles/1372-daniel-magurshak" target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, border: `1px solid ${gold}44`, padding: '0.6rem 1.2rem', textDecoration: 'none', opacity: 0.8 }}>READ: PROFESSOR MAGURSHAK ↗</a>
          </div>
        </div>
      </section>

      {/* ═══ ROOM V: THE THREE PILLARS ═══ */}
      <section style={{ padding: '8rem 2rem', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem' }}>ROOM V</div>
        <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.8rem, 4vw, 3.2rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '0.5rem', borderBottom: `1px solid ${gold}44`, paddingBottom: '1rem' }}>
          THE THREE PILLARS
        </h2>
        <p style={{ fontSize: '0.9rem', color: muted, fontFamily: 'Cinzel, serif', letterSpacing: '0.1em', marginBottom: '4rem' }}>Singularity · The Secret · Blockchain — the operating system of the future</p>

        <div style={{ marginBottom: '4rem' }}>
          <h3 style={{ fontFamily: 'Cinzel, serif', fontSize: '1.4rem', fontWeight: 300, letterSpacing: '0.15em', color: gold, marginBottom: '1.5rem' }}>I. THE SINGULARITY</h3>
          <p style={{ fontSize: '1.2rem', lineHeight: 2, color: dim, marginBottom: '1.5rem' }}>
            Heidegger said we are <strong>beings-toward-death</strong> — this awareness is what makes human existence meaningful. But for the first time in history, we have the tools to actually face that fact and do something about it. Biotech, longevity research, cognitive enhancement, digital consciousness — these are not science fiction. They are the frontier.
          </p>
          <p style={{ fontSize: '1.2rem', lineHeight: 2, color: dim }}>
            The Singularity is not something that happens <em>to</em> us. It is something we <em>manifest</em>. The Society of Explorers exists to gather the people who understand this and are building toward it — not with fear, but with the optimism of those who know progress is inevitable and intend to guide it.
          </p>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '2rem' }}>
            <a href="https://www.amazon.com/Singularity-Near-Humans-Transcend-Biology/dp/0143037889" target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, border: `1px solid ${gold}44`, padding: '0.6rem 1.2rem', textDecoration: 'none', opacity: 0.8 }}>READ: THE SINGULARITY IS NEAR ↗</a>
            <a href="https://humanityplus.org" target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, border: `1px solid ${gold}44`, padding: '0.6rem 1.2rem', textDecoration: 'none', opacity: 0.8 }}>EXPLORE: HUMANITY+ ↗</a>
          </div>
        </div>

        <div style={{ marginBottom: '4rem', paddingTop: '3rem', borderTop: `1px solid ${gold}22` }}>
          <h3 style={{ fontFamily: 'Cinzel, serif', fontSize: '1.4rem', fontWeight: 300, letterSpacing: '0.15em', color: gold, marginBottom: '1.5rem' }}>II. THE SECRET</h3>
          <p style={{ fontSize: '1.2rem', lineHeight: 2, color: dim, marginBottom: '1.5rem' }}>
            Focused intention shapes reality. This is not mysticism — it is the operating principle of every great builder in history. What you hold clearly in mind, you move toward. What the community holds together, it manifests collectively. In a world of distraction and algorithmic noise, <strong>clarity is the rarest resource.</strong>
          </p>
          <p style={{ fontSize: '1.2rem', lineHeight: 2, color: dim }}>
            The blockchain community already understands this — those who held conviction through the winters, who saw what others could not see yet, who wrote code and manifestos when the world laughed. The Secret is not about passivity. It is about disciplined, relentless focus on what you intend to bring into existence.
          </p>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '2rem' }}>
            <a href="https://www.amazon.com/Secret-Rhonda-Byrne/dp/1582701709" target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, border: `1px solid ${gold}44`, padding: '0.6rem 1.2rem', textDecoration: 'none', opacity: 0.8 }}>READ: THE SECRET ↗</a>
          </div>
        </div>

        <div style={{ paddingTop: '3rem', borderTop: `1px solid ${gold}22` }}>
          <h3 style={{ fontFamily: 'Cinzel, serif', fontSize: '1.4rem', fontWeight: 300, letterSpacing: '0.15em', color: gold, marginBottom: '1.5rem' }}>III. BLOCKCHAIN</h3>
          <p style={{ fontSize: '1.2rem', lineHeight: 2, color: dim, marginBottom: '1.5rem' }}>
            Decentralization is not a technical preference — it is a philosophical stance. It says: <em>power belongs to people, not to intermediaries.</em> It says: <em>trust should be verified, not assumed.</em> It says: <em>ownership is a human right, not a corporate permission.</em>
          </p>
          <p style={{ fontSize: '1.2rem', lineHeight: 2, color: dim }}>
            Those who have been in blockchain for a decade are not speculators. They are builders of a new social contract. The Society of Explorers sees blockchain as the infrastructure of the future we are manifesting — where value flows to creators, communities own their data, and no central authority can revoke what has been built.
          </p>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '2rem' }}>
            <a href="https://bitcoin.org/bitcoin.pdf" target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, border: `1px solid ${gold}44`, padding: '0.6rem 1.2rem', textDecoration: 'none', opacity: 0.8 }}>READ: BITCOIN WHITEPAPER ↗</a>
            <a href="https://ethereum.org/en/whitepaper/" target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, border: `1px solid ${gold}44`, padding: '0.6rem 1.2rem', textDecoration: 'none', opacity: 0.8 }}>READ: ETHEREUM WHITEPAPER ↗</a>
          </div>
        </div>
      </section>

      {/* ART WALL II */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2px' }}>
        {['The Covenant', 'Infinity Loop', 'Divine Geometry'].map(title => (
          <div key={title} style={{ aspectRatio: '4/3', background: 'linear-gradient(135deg, #050810, #0d0a1a)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${gold}11` }}>
            <div style={{ textAlign: 'center', padding: '1rem' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.2em', color: gold, opacity: 0.4, marginBottom: '0.5rem' }}>GIOVANNI DECUNTO · GOD SERIES</div>
              <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1rem', color: dim, fontStyle: 'italic' }}>{title}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ═══ ROOM VI: TRUTH IN BEAUTY ═══ */}
      <section style={{ padding: '8rem 2rem', background: '#050305' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1rem' }}>ROOM VI</div>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.8rem, 4vw, 3.2rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '0.5rem', borderBottom: `1px solid ${gold}44`, paddingBottom: '1rem' }}>
            TRUTH IN BEAUTY
          </h2>
          <p style={{ fontSize: '0.9rem', color: muted, fontFamily: 'Cinzel, serif', letterSpacing: '0.1em', marginBottom: '3rem' }}>Why we make things — and why they must be beautiful</p>

          <p style={{ fontSize: '1.2rem', lineHeight: 2, color: dim, marginBottom: '2rem' }}>
            Keats wrote: <em>&ldquo;Beauty is truth, truth beauty — that is all ye know on earth, and all ye need to know.&rdquo;</em> This is not decoration. It is epistemology. Beauty is not a feature added to truth — it is the <em>form</em> that truth takes when it is fully realized.
          </p>
          <p style={{ fontSize: '1.2rem', lineHeight: 2, color: dim, marginBottom: '2rem' }}>
            This is why the Society of Explorers approaches everything — products, language, design, community — through the lens of beauty first. A mug is not just a container. A shirt is not just fabric. When crafted with philosophical intention, they become <strong>talismans</strong> — objects that carry truth, that remind the wearer of who they are and what they are building toward.
          </p>
          <p style={{ fontSize: '1.2rem', lineHeight: 2, color: dim }}>
            Giovanni DeCunto understands this. His God Series paintings are not religious art in the traditional sense — they are confrontations with existence. Dramatic, layered, uncomfortable, transcendent. They belong on the walls of a space dedicated to the question of what it means to be alive and what we will make of that fact.
          </p>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '3rem' }}>
            <a href="https://giovannidecunto.com" target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, border: `1px solid ${gold}44`, padding: '0.6rem 1.2rem', textDecoration: 'none', opacity: 0.8 }}>EXPLORE: GIOVANNI DECUNTO ↗</a>
            <a href="https://www.poetryfoundation.org/poems/44477/ode-on-a-grecian-urn" target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, border: `1px solid ${gold}44`, padding: '0.6rem 1.2rem', textDecoration: 'none', opacity: 0.8 }}>READ: KEATS — ODE ON A GRECIAN URN ↗</a>
          </div>
        </div>
      </section>

      {/* ═══ EXIT PORTAL ═══ */}
      <section style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(ellipse at center, #0d0d2b 0%, #000 70%)', textAlign: 'center', padding: '4rem 2rem' }}>
        <div style={{ maxWidth: '700px' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '2rem' }}>THE PORTAL</div>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(2rem, 5vw, 4rem)', fontWeight: 300, letterSpacing: '0.1em', marginBottom: '2rem', lineHeight: 1.2 }}>
            SOLVE DEATH.<br />SHAPE ABUNDANCE.<br />FREE THE MIND.
          </h2>
          <p style={{ fontSize: '1.2rem', color: dim, lineHeight: 1.9, marginBottom: '1.5rem' }}>
            You have walked through the rooms. You have seen where this comes from and where it is going.
          </p>
          <p style={{ fontSize: '1.2rem', color: dim, lineHeight: 1.9, marginBottom: '3rem' }}>
            The Society of Explorers is not a product. It is a movement — built by people who have asked the deep questions and refused to stop at easy answers. The Singularity is coming. The Secret is real. Blockchain is the infrastructure of freedom. And beauty is the form that truth takes.
          </p>
          <p style={{ fontSize: '1.3rem', color: gold, fontStyle: 'italic', lineHeight: 1.9, marginBottom: '4rem' }}>
            &ldquo;We create because existence demands it. In God&apos;s image, Plato&apos;s craft, dharma&apos;s flow — we build futures worth living.&rdquo;
          </p>
          <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/salon" style={{ fontFamily: 'Cinzel, serif', fontSize: '0.8rem', letterSpacing: '0.2em', color: '#000', background: gold, padding: '1.2rem 3rem', textDecoration: 'none', display: 'inline-block' }}>ENTER THE SALON</a>
            <a href="/join" style={{ fontFamily: 'Cinzel, serif', fontSize: '0.8rem', letterSpacing: '0.2em', color: gold, border: `2px solid ${gold}`, padding: '1.2rem 3rem', textDecoration: 'none', display: 'inline-block' }}>JOIN THE SOCIETY</a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ padding: '3rem 2rem', borderTop: `1px solid ${gold}22`, textAlign: 'center' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, opacity: 0.4, marginBottom: '1rem' }}>SOCIETY OF EXPLORERS · 92B SOUTH ST · SOCIETYOFEXPLORERS.COM</div>
        <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '0.85rem', color: muted, opacity: 0.5, fontStyle: 'italic' }}>
          Art on these walls: Giovanni DeCunto, God Series. 116 South St, Boston. Contact giovannidecunto.com for licensing.
        </div>
      </footer>

    </div>
  );
}
