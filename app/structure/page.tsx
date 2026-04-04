'use client';
import { useEffect } from 'react';

const gold = '#c9a84c';
const text = '#E8DCC8';
const muted = '#9a8f7a';
const body = '#d4c9a8';

export default function StructurePage() {
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) (e.target as HTMLElement).style.opacity = '1'; });
    }, { threshold: 0.08 });
    document.querySelectorAll('[data-fade]').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#080808', color: text, fontFamily: 'Cormorant Garamond, serif', overflowX: 'hidden' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&display=swap');`}</style>

      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to bottom, #080808, transparent)' }}>
        <a href="/salon" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, textDecoration: 'none', opacity: 0.7 }}>← SALON</a>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.4 }}>SOCIETY OF EXPLORERS</div>
      </nav>

      {/* ═══ HERO ═══ */}
      <section style={{ minHeight: '90vh', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '8rem 2rem 6rem', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.03, pointerEvents: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='100' viewBox='0 0 56 100'%3E%3Cpath d='M28 66L0 50L0 16L28 0L56 16L56 50L28 66' fill='none' stroke='%23C9A84C' stroke-width='0.5'/%3E%3C/svg%3E")`, backgroundSize: '56px 100px' }} />
        <div style={{ maxWidth: '700px', position: 'relative', zIndex: 1 }}>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(2.5rem, 6vw, 4.5rem)', fontWeight: 400, letterSpacing: '0.05em', lineHeight: 1.15, marginBottom: '2rem' }}>
            Explorers Build Worlds
          </h1>
          <div style={{ width: '60px', height: '1px', background: gold, margin: '0 auto 2rem', opacity: 0.5 }} />
          <p style={{ fontSize: '1.2rem', color: muted, lineHeight: 1.9, fontStyle: 'italic', maxWidth: '560px', margin: '0 auto' }}>
            Society of Explorers stands on three pillars — each one a response to a failure of the old internet, each one a foundation for what comes next.
          </p>
        </div>
      </section>

      {/* ═══ PILLAR I ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', opacity: 0, transition: 'opacity 1s ease' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, opacity: 0.5, marginBottom: '1rem' }}>PILLAR I</div>
          <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', fontWeight: 400, marginBottom: '0.5rem', lineHeight: 1.2 }}>
            Data Sovereignty
          </h2>
          <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.1rem', color: gold, fontStyle: 'italic', marginBottom: '2.5rem' }}>
            Own Your Mind
          </div>

          <p style={{ fontSize: '1.15rem', lineHeight: 2, color: body, marginBottom: '1.5rem' }}>
            The most important asset is no longer land or machinery. It is data. And right now, you don&apos;t own yours. Every conversation you have with an AI, every preference you reveal, every pattern of attention you display — all of it is captured, stored, and monetized by platforms you don&apos;t control. Your digital self is tenant farming on someone else&apos;s servers.
          </p>
          <p style={{ fontSize: '1.15rem', lineHeight: 2, color: body, marginBottom: '1.5rem' }}>
            The lineage of resistance is long. Sandy Pentland at MIT proposed the Open Mustard Seed framework — personal data stores where individuals control their information. Christopher Allen codified self-sovereign identity: the principle that no external authority should be able to revoke your digital existence. Doc Searls imagined VRM — vendor relationship management, where customers hold the terms, not companies.
          </p>
          <p style={{ fontSize: '1.15rem', lineHeight: 2, color: body, marginBottom: '1.5rem' }}>
            All of these visions failed to achieve mass adoption. Solid, Tim Berners-Lee&apos;s personal data pod project, remains academic. CityDAO proved that decentralized ownership of physical assets creates legal nightmares without cultural infrastructure. The insight these projects missed: sovereignty requires not just technology but <em>community</em>. You need people who care about the same things protecting each other&apos;s data.
          </p>

          <div style={{ margin: '2.5rem 0', padding: '1.5rem 2rem', borderLeft: `2px solid ${gold}44`, background: '#0d0d0a' }}>
            <p style={{ fontSize: '1.05rem', lineHeight: 1.8, color: muted, fontStyle: 'italic' }}>
              In the 21st century, whoever owns the data owns the future — not the future of technology, but the future of humanity itself.
            </p>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, opacity: 0.6, marginTop: '0.75rem' }}>PARAPHRASED FROM YUVAL NOAH HARARI</div>
          </div>

          <p style={{ fontSize: '1.15rem', lineHeight: 2, color: body }}>
            Society of Explorers builds differently. Your salon conversations are stored in your private salon — accessible only by you and the thinkers you choose. Your artifacts live on-chain, owned by your wallet. Your reputation is soulbound: non-transferable $EXP tokens that prove participation without enabling speculation. The thinkers remember you across sessions because <em>you</em> hold the memory, not the platform.
          </p>

          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: muted, marginTop: '2rem', opacity: 0.6 }}>
            CITED: SANDY PENTLAND · CHRISTOPHER ALLEN · DOC SEARLS
          </div>
        </div>
      </section>

      {/* Divider */}
      <div style={{ width: '120px', height: '1px', background: `linear-gradient(90deg, transparent, ${gold}55, transparent)`, margin: '0 auto' }} />

      {/* ═══ PILLAR II ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', opacity: 0, transition: 'opacity 1s ease' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, opacity: 0.5, marginBottom: '1rem' }}>PILLAR II</div>
          <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', fontWeight: 400, marginBottom: '0.5rem', lineHeight: 1.2 }}>
            Local-First Intelligence
          </h2>
          <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.1rem', color: gold, fontStyle: 'italic', marginBottom: '2.5rem' }}>
            Think With Your Own Machine
          </div>

          <p style={{ fontSize: '1.15rem', lineHeight: 2, color: body, marginBottom: '1.5rem' }}>
            Cloud AI is a landlord. Local AI is a homestead. Every time you send a prompt to GPT-4 or Claude, you are paying rent on someone else&apos;s intelligence infrastructure. Your queries are logged. Your patterns are studied. Your dependence deepens with every conversation.
          </p>
          <p style={{ fontSize: '1.15rem', lineHeight: 2, color: body, marginBottom: '1.5rem' }}>
            Martin Kleppmann articulated the local-first software ideal: software that works on your device, syncs when convenient, and never requires permission from a server to function. Georgi Gerganov&apos;s llama.cpp made it real — running large language models on consumer hardware, no cloud required. Stanford&apos;s OpenJarvis research found that 88.7% of typical AI queries can be handled entirely on-device with models under 7 billion parameters.
          </p>
          <p style={{ fontSize: '1.15rem', lineHeight: 2, color: body, marginBottom: '1.5rem' }}>
            Ivan Illich wrote about convivial tools — technologies that serve their users rather than enslaving them to systems of production. James C. Scott warned about legibility: the state&apos;s impulse to make people readable, countable, controllable. Cloud AI is the ultimate legibility machine. Local AI is the forest that resists the map.
          </p>

          <div style={{ margin: '2.5rem 0', padding: '1.5rem 2rem', borderLeft: `2px solid ${gold}44`, background: '#0d0d0a' }}>
            <p style={{ fontSize: '1.05rem', lineHeight: 1.8, color: muted, fontStyle: 'italic' }}>
              Tools for conviviality are tools that give each person the greatest opportunity to enrich the environment with the fruits of their vision.
            </p>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, opacity: 0.6, marginTop: '0.75rem' }}>IVAN ILLICH, TOOLS FOR CONVIVIALITY (1973)</div>
          </div>

          <p style={{ fontSize: '1.15rem', lineHeight: 2, color: body }}>
            Society of Explorers previews local-first AI through its thinker memory system. Each thinker maintains a running summary of their relationship with each member — but the architecture is designed so that memory could live on the member&apos;s device instead of the server. The TribeKey hardware prototype is the next step: a physical device that carries your thinker relationships with you, running inference locally when possible, syncing to the cloud only when you choose.
          </p>

          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: muted, marginTop: '2rem', opacity: 0.6 }}>
            CITED: MARTIN KLEPPMANN · GEORGI GERGANOV · IVAN ILLICH · JAMES C. SCOTT
          </div>
        </div>
      </section>

      <div style={{ width: '120px', height: '1px', background: `linear-gradient(90deg, transparent, ${gold}55, transparent)`, margin: '0 auto' }} />

      {/* ═══ PILLAR III ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', opacity: 0, transition: 'opacity 1s ease' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, opacity: 0.5, marginBottom: '1rem' }}>PILLAR III</div>
          <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', fontWeight: 400, marginBottom: '0.5rem', lineHeight: 1.2 }}>
            Physical-Digital Convergence
          </h2>
          <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.1rem', color: gold, fontStyle: 'italic', marginBottom: '2.5rem' }}>
            The Clearing
          </div>

          <p style={{ fontSize: '1.15rem', lineHeight: 2, color: body, marginBottom: '1.5rem' }}>
            The dominant metaphor of crypto is the dark forest — a hostile environment where visibility is danger and every agent acts in self-interest. Ours is the clearing: a visible, inhabitable space where explorers gather not despite being seen, but because of it. Hannah Arendt called this the space of appearance — the place where people show up as themselves and create something that exists only through their being together.
          </p>
          <p style={{ fontSize: '1.15rem', lineHeight: 2, color: body, marginBottom: '1.5rem' }}>
            CabinDAO tried to build a decentralized city. It became a vacation club. Praxis promised a Mediterranean charter city. It became a social media account. CityDAO bought 40 acres in Wyoming. It became a legal morass. Zuzalu — Vitalik Buterin&apos;s pop-up city in Montenegro — came closest, but it was temporary by design. The pattern is clear: digital-only communities drift into abstraction; physical-only communities drift into real estate. The synthesis requires both, held in tension.
          </p>
          <p style={{ fontSize: '1.15rem', lineHeight: 2, color: body, marginBottom: '1.5rem' }}>
            92B South St in downtown Boston is the anchor. Not a co-working space. Not a co-living experiment. A salon — a place where people come to think together, with AI thinkers who know the space and its inhabitants. Elinor Ostrom showed that the commons can be governed without either state or market, but only when the community is small enough to know each other and committed enough to enforce norms. Christopher Alexander understood that great spaces emerge from patterns, not master plans. Buckminster Fuller insisted that you change systems by building new ones that make the old ones obsolete.
          </p>

          <div style={{ margin: '2.5rem 0', padding: '1.5rem 2rem', borderLeft: `2px solid ${gold}44`, background: '#0d0d0a' }}>
            <p style={{ fontSize: '1.05rem', lineHeight: 1.8, color: muted, fontStyle: 'italic' }}>
              Wherever people gather in the manner of speech and action, there is the space of appearance. It predates and precedes all formal constitution of the public realm.
            </p>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, opacity: 0.6, marginTop: '0.75rem' }}>HANNAH ARENDT, THE HUMAN CONDITION (1958)</div>
          </div>

          <p style={{ fontSize: '1.15rem', lineHeight: 2, color: body }}>
            The founding dinner — ten seats, the first TribeKeys, names recorded on-chain — is not a product launch. It is the constituting act. The moment ten people sit down together in a room they chose, with AI thinkers ready to listen, and decide that this is real. Everything else the Society builds flows from that moment.
          </p>

          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: muted, marginTop: '2rem', opacity: 0.6 }}>
            CITED: HANNAH ARENDT · ELINOR OSTROM · CHRISTOPHER ALEXANDER · BUCKMINSTER FULLER
          </div>
        </div>
      </section>

      <div style={{ width: '120px', height: '1px', background: `linear-gradient(90deg, transparent, ${gold}55, transparent)`, margin: '0 auto' }} />

      {/* ═══ CLOSING ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', opacity: 0, transition: 'opacity 1s ease' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(1.5rem, 3vw, 2.2rem)', fontWeight: 400, marginBottom: '2rem', lineHeight: 1.3 }}>
            The Synthesis That Doesn&apos;t Yet Exist
          </h2>
          <p style={{ fontSize: '1.15rem', lineHeight: 2, color: body, marginBottom: '2rem' }}>
            Every component has prior art. Personal data stores exist. Local LLMs exist. Crypto governance exists. Physical gathering spaces exist. AI assistants exist. What does not yet exist is the synthesis: a community that holds all five together in a single coherent structure — where your AI knows you because you own the relationship, where your reputation is earned and non-transferable, where your physical presence in a room amplifies your digital participation, where the thinkers remember not just what you said but why it mattered.
          </p>
          <p style={{ fontSize: '1.15rem', lineHeight: 2, color: body, marginBottom: '4rem' }}>
            That is what the Society of Explorers is building. Not a product. Not a platform. A world.
          </p>

          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <h3 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 400, color: text, lineHeight: 1.2 }}>
              Explorers build worlds.
            </h3>
          </div>
        </div>
      </section>

      {/* ═══ NAMING HERITAGE ═══ */}
      <section data-fade style={{ padding: '3rem 2rem 4rem', opacity: 0, transition: 'opacity 1s ease' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.3em', color: gold, opacity: 0.4, marginBottom: '1rem' }}>NAMING HERITAGE</div>
          <p style={{ fontSize: '0.95rem', lineHeight: 1.9, color: muted }}>
            The Society of Jesus (1534) was ten men in a room who decided the world needed changing and built an institution that lasted five centuries. The Royal Society (1660) adopted the motto <em>Nullius in verba</em> — take nobody&apos;s word for it. Both names carry the implication that a small group of people, bound by shared commitment, can build structures that outlast them. We inherit that ambition.
          </p>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer style={{ padding: '4rem 2rem', borderTop: `1px solid ${gold}15`, textAlign: 'center' }}>
        <div style={{ display: 'flex', gap: '2rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '2rem' }}>
          <a href="/join" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: '#000', background: gold, padding: '10px 28px', textDecoration: 'none' }}>JOIN THE SOCIETY</a>
          <a href="/twiddle" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, border: `1px solid ${gold}44`, padding: '10px 28px', textDecoration: 'none' }}>ENTER THE CLEARING</a>
        </div>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, opacity: 0.3 }}>CONSILIENCE SYSTEMS · 92B SOUTH ST · BOSTON</div>
      </footer>
    </div>
  );
}
