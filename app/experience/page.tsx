'use client';
import { useEffect } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

const amber = '#f59e0b';
const slate950 = '#020617';
const slate900 = '#0f172a';
const slate800 = '#1e293b';
const parchment = '#E8DCC8';
const muted = '#94a3b8';

const THINKERS = [
  { key: 'socrates', name: 'Socrates', icon: 'Σ', color: '#C9A94E', desc: 'Asks the question behind the question. Will not let you off easy.' },
  { key: 'plato', name: 'Plato', icon: '△', color: '#7B68EE', desc: 'Sees the form behind every instance. Builds toward the ideal.' },
  { key: 'nietzsche', name: 'Nietzsche', icon: '⚡', color: '#DC143C', desc: 'Destroys comfortable illusions. Creates from the rubble.' },
  { key: 'aurelius', name: 'Marcus Aurelius', icon: '🛡️', color: '#8B7355', desc: 'The emperor on the frontier. Stoic clarity under pressure.' },
  { key: 'einstein', name: 'Einstein', icon: '∞', color: '#4169E1', desc: 'Thought experiments over equations. Sees unity in complexity.' },
  { key: 'jobs', name: 'Steve Jobs', icon: '◉', color: '#A0A0A0', desc: 'Taste as strategy. Ships the thing that changes everything.' },
];

function ImagePlaceholder({ label, icon, height }: { label: string; icon: string; height?: string }) {
  return (
    <div style={{ background: slate800, minHeight: height || '220px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem', opacity: 0.15, marginBottom: '0.5rem' }}>{icon}</div>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.15em', color: muted, opacity: 0.3 }}>{label}</div>
      </div>
    </div>
  );
}

function SectionLabel({ tag, heading, sub }: { tag: string; heading: string; sub?: string }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
      <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: amber, opacity: 0.5, marginBottom: '0.75rem' }}>{tag}</div>
      <h2 style={{ fontFamily: 'Playfair Display, Cinzel, serif', fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)', fontWeight: 400, letterSpacing: '0.02em', color: '#f8fafc', marginBottom: sub ? '0.75rem' : 0 }}>{heading}</h2>
      {sub && <p style={{ fontSize: '1rem', color: muted, lineHeight: 1.8, maxWidth: '520px', margin: '0 auto' }}>{sub}</p>}
    </div>
  );
}

export default function ExperiencePage() {
  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) (e.target as HTMLElement).style.opacity = '1'; });
    }, { threshold: 0.1 });
    document.querySelectorAll('[data-fade]').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: slate950, color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      {/* ═══ HERO ═══ */}
      <section style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8rem 2rem 6rem', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.03, pointerEvents: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Ccircle cx='20' cy='20' r='1' fill='%23f59e0b'/%3E%3C/svg%3E")`, backgroundSize: '40px 40px' }} />
        <div style={{ maxWidth: '720px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.5em', color: amber, opacity: 0.6, marginBottom: '1.5rem' }}>EXPLORER COMMONS</div>
          <h1 style={{ fontFamily: 'Playfair Display, Cinzel, serif', fontSize: 'clamp(2.4rem, 6vw, 4.5rem)', fontWeight: 400, letterSpacing: '0.02em', lineHeight: 1.15, color: '#f8fafc', marginBottom: '1.5rem' }}>
            What Happens Here
          </h1>
          <p style={{ fontSize: '1.2rem', color: muted, lineHeight: 1.8, maxWidth: '580px', margin: '0 auto' }}>
            Philosophy. Music. Biofeedback. Salt therapy. Sovereign infrastructure. A blank-slate commons where any subject plugs in.
          </p>
        </div>
      </section>

      {/* ═══ 1. AI THINKERS ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: slate900, opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <SectionLabel tag="AI THINKERS" heading="Six Minds. Always Available." sub="They remember you. They push back. They help you build." />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1px', background: `${amber}10`, marginBottom: '2rem' }}>
            {THINKERS.map(t => (
              <div key={t.key} style={{ background: slate950, padding: '1.75rem 1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.75rem' }}>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '1.25rem', color: t.color, opacity: 0.6 }}>{t.icon}</span>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.1em', color: '#f8fafc' }}>{t.name.toUpperCase()}</span>
                </div>
                <p style={{ fontSize: '14px', color: muted, lineHeight: 1.7 }}>{t.desc}</p>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
            {[
              { label: 'Voice Mode', desc: 'Speak out loud. Hear them respond. Conversations feel real.' },
              { label: 'Persistent Memory', desc: 'They remember your projects, your questions, your growth.' },
              { label: 'Agentic Actions', desc: 'They can create artifacts, suggest books, award $EXP, trigger rituals.' },
            ].map(f => (
              <div key={f.label} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: amber, marginBottom: '0.35rem' }}>{f.label.toUpperCase()}</div>
                <p style={{ fontSize: '13px', color: muted, lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ 2. THE SALON ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1px', background: `${amber}10` }}>
            <ImagePlaceholder label="92B SOUTH ST · BOSTON" icon="🏛️" height="320px" />
            <div style={{ background: slate900, padding: '3rem 2.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: amber, opacity: 0.5, marginBottom: '1rem' }}>THE SALON</div>
              <h2 style={{ fontFamily: 'Playfair Display, Cinzel, serif', fontSize: 'clamp(1.4rem, 2.5vw, 1.8rem)', fontWeight: 400, letterSpacing: '0.02em', color: '#f8fafc', marginBottom: '1rem', lineHeight: 1.3 }}>
                Where ideas become real.
              </h2>
              <p style={{ fontSize: '15px', color: muted, lineHeight: 1.8, marginBottom: '1.5rem' }}>
                In-person at 92B South St, downtown Boston. Great Books 8-week reading cycles. Philosophy circles. Music jams. Monthly evening events for Scholar and Philosopher members.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {['Great Books', '8-Week Cycles', 'Philosophy Circles', 'Music Jams', 'Monthly Evenings'].map(tag => (
                  <span key={tag} style={{ padding: '3px 10px', fontSize: '10px', fontFamily: 'Cinzel, serif', letterSpacing: '0.06em', color: amber, border: `1px solid ${amber}33`, background: `${amber}06` }}>{tag}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 3. TWIDDLETWATTLE ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: slate900, opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1px', background: `${amber}10` }}>
            <div style={{ background: slate950, padding: '3rem 2.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: amber, opacity: 0.5, marginBottom: '1rem' }}>TWIDDLETWATTLE</div>
              <h2 style={{ fontFamily: 'Playfair Display, Cinzel, serif', fontSize: 'clamp(1.4rem, 2.5vw, 1.8rem)', fontWeight: 400, letterSpacing: '0.02em', color: '#f8fafc', marginBottom: '1rem', lineHeight: 1.3 }}>
                Ideas that grow.
              </h2>
              <p style={{ fontSize: '15px', color: muted, lineHeight: 1.8, marginBottom: '1.5rem' }}>
                Post an idea. Tag a thinker. Watch it branch into threads, remixes, and weaves. The Constellation maps your intellectual journey — every question, every connection, every insight charted over time.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {['Post & Branch', 'Tag Thinkers', 'Constellation Map', 'Collaborative Threads'].map(tag => (
                  <span key={tag} style={{ padding: '3px 10px', fontSize: '10px', fontFamily: 'Cinzel, serif', letterSpacing: '0.06em', color: amber, border: `1px solid ${amber}33`, background: `${amber}06` }}>{tag}</span>
                ))}
              </div>
            </div>
            <ImagePlaceholder label="CONSTELLATION · IDEA GRAPH" icon="🌿" height="280px" />
          </div>
        </div>
      </section>

      {/* ═══ 4. SoE WORLD ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1px', background: `${amber}10` }}>
            <ImagePlaceholder label="LIDAR SCAN · WORLD LAYER" icon="📸" height="280px" />
            <div style={{ background: slate900, padding: '3rem 2.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: amber, opacity: 0.5, marginBottom: '1rem' }}>SoE WORLD</div>
              <h2 style={{ fontFamily: 'Playfair Display, Cinzel, serif', fontSize: 'clamp(1.4rem, 2.5vw, 1.8rem)', fontWeight: 400, letterSpacing: '0.02em', color: '#f8fafc', marginBottom: '1rem', lineHeight: 1.3 }}>
                Scan the real world. Build the next one.
              </h2>
              <p style={{ fontSize: '15px', color: muted, lineHeight: 1.8, marginBottom: '1.5rem' }}>
                Point your iPhone LiDAR at a space. Upload the scan. Earn $EXP based on quality. Leave AR annotations with the White Knight Pen. Every scan contributes to a member-driven spatial layer — a metaverse built from real places, not game engines.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {['iPhone LiDAR', 'Scan-to-Earn', 'White Knight Pen', 'AR Annotations'].map(tag => (
                  <span key={tag} style={{ padding: '3px 10px', fontSize: '10px', fontFamily: 'Cinzel, serif', letterSpacing: '0.06em', color: amber, border: `1px solid ${amber}33`, background: `${amber}06` }}>{tag}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 5. BIOFEEDBACK CIRCLES ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: slate900, opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1px', background: `${amber}10` }}>
            <div style={{ background: slate950, padding: '3rem 2.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: amber, opacity: 0.5, marginBottom: '1rem' }}>BIOFEEDBACK CIRCLES</div>
              <h2 style={{ fontFamily: 'Playfair Display, Cinzel, serif', fontSize: 'clamp(1.4rem, 2.5vw, 1.8rem)', fontWeight: 400, letterSpacing: '0.02em', color: '#f8fafc', marginBottom: '1rem', lineHeight: 1.3 }}>
                The room breathes together.
              </h2>
              <p style={{ fontSize: '15px', color: muted, lineHeight: 1.8, marginBottom: '1.5rem' }}>
                Muse S Athena EEG headbands measure focus. Polar H10 chest straps track HRV. The AI reads group coherence in real time and adapts the session — guiding breath, music, and conversation toward collective resonance. 10 $EXP per circle.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {['Muse S Athena EEG', 'Polar H10 HRV', 'Group Coherence', 'AI-Adapted Sessions'].map(tag => (
                  <span key={tag} style={{ padding: '3px 10px', fontSize: '10px', fontFamily: 'Cinzel, serif', letterSpacing: '0.06em', color: amber, border: `1px solid ${amber}33`, background: `${amber}06` }}>{tag}</span>
                ))}
              </div>
            </div>
            <ImagePlaceholder label="COHERENCE CIRCLE · BIOFEEDBACK" icon="💓" height="280px" />
          </div>
        </div>
      </section>

      {/* ═══ 6. MUSIC THERAPY ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1px', background: `${amber}10` }}>
            <ImagePlaceholder label="MUSIC SESSION · LOGIC PRO + SUNO" icon="🎵" height="280px" />
            <div style={{ background: slate900, padding: '3rem 2.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: amber, opacity: 0.5, marginBottom: '1rem' }}>MUSIC THERAPY</div>
              <h2 style={{ fontFamily: 'Playfair Display, Cinzel, serif', fontSize: 'clamp(1.4rem, 2.5vw, 1.8rem)', fontWeight: 400, letterSpacing: '0.02em', color: '#f8fafc', marginBottom: '1rem', lineHeight: 1.3 }}>
                Strangers jam. Something real happens.
              </h2>
              <p style={{ fontSize: '15px', color: muted, lineHeight: 1.8, marginBottom: '1.5rem' }}>
                Logic Pro 12 AI and Suno V5 lower the floor. Absolute beginners sit next to trained musicians. The AI bridges the gap. Best moments are minted as NFTs on Solana via Nina Protocol — shared royalties, permanent record. 12 $EXP per session.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {['Logic Pro 12 AI', 'Suno V5', 'NFT Minting', 'Nina Protocol'].map(tag => (
                  <span key={tag} style={{ padding: '3px 10px', fontSize: '10px', fontFamily: 'Cinzel, serif', letterSpacing: '0.06em', color: amber, border: `1px solid ${amber}33`, background: `${amber}06` }}>{tag}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 7. SOVEREIGN TRAVEL ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: slate900, opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1px', background: `${amber}10` }}>
            <div style={{ background: slate950, padding: '3rem 2.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: amber, opacity: 0.5, marginBottom: '1rem' }}>SOVEREIGN TRAVEL</div>
              <h2 style={{ fontFamily: 'Playfair Display, Cinzel, serif', fontSize: 'clamp(1.4rem, 2.5vw, 1.8rem)', fontWeight: 400, letterSpacing: '0.02em', color: '#f8fafc', marginBottom: '1rem', lineHeight: 1.3 }}>
                Travel as transformation.
              </h2>
              <p style={{ fontSize: '15px', color: muted, lineHeight: 1.8, marginBottom: '1.5rem' }}>
                Book crypto stays via Travala and Dtravel. Scan the rooms you stay in. Earn $EXP. Find resonant explorers through frequency matching. Collect soulbound passport stamps — proof of experience, not tourism.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {['Travala', 'Dtravel', 'Frequency Matching', 'Passport Stamps'].map(tag => (
                  <span key={tag} style={{ padding: '3px 10px', fontSize: '10px', fontFamily: 'Cinzel, serif', letterSpacing: '0.06em', color: amber, border: `1px solid ${amber}33`, background: `${amber}06` }}>{tag}</span>
                ))}
              </div>
            </div>
            <ImagePlaceholder label="EXPLORER PASSPORT · SOULBOUND" icon="🧭" height="280px" />
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', textAlign: 'center', opacity: 0, transition: 'opacity 0.8s ease' }}>
        <div style={{ maxWidth: '480px', margin: '0 auto' }}>
          <h2 style={{ fontFamily: 'Playfair Display, Cinzel, serif', fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', fontWeight: 400, letterSpacing: '0.02em', color: '#f8fafc', marginBottom: '1.5rem' }}>
            Ready?
          </h2>
          <a href="/join" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: slate950, background: amber, padding: '14px 36px', textDecoration: 'none', display: 'inline-block' }}>Choose Your Path →</a>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
