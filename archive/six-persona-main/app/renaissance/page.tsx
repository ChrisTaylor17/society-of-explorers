'use client';
import { useEffect } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

const GUILD_CARDS = [
  { title: 'Philosophy', body: 'Socrates, Nietzsche, Aurelius, Plato, Einstein, Jobs. Not chatbots — intellectual relationships that grow over time.' },
  { title: 'Technology', body: 'AI thinkers, blockchain reputation, soulbound tokens, LiDAR scanning, Explorer Nodes. Tools for sovereignty.' },
  { title: 'Art & Music', body: 'AI-composed soundscapes. Brainwave-tuned therapy. Creative artifacts. The Renaissance was aesthetic — so are we.' },
  { title: 'Travel & Action', body: 'The Grand Tour reimagined. Crypto bookings, scan-to-earn, frequency-matched travel companions. Philosophy in motion.' },
];

export default function RenaissancePage() {
  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) (e.target as HTMLElement).style.opacity = '1'; });
    }, { threshold: 0.1 });
    document.querySelectorAll('[data-fade]').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      document.querySelectorAll<HTMLElement>('[data-parallax]').forEach(el => {
        el.style.backgroundAttachment = 'scroll';
      });
    }
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      {/* ═══ HERO ═══ */}
      <section
        data-parallax
        style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '8rem 2rem 6rem', position: 'relative',
          backgroundImage: 'linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url("/images/hero-renaissance.jpeg")',
          backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed',
        }}
      >
        <div style={{ maxWidth: '720px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1.5rem' }}>
            THE NEW RENAISSANCE
          </div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(36px, 7vw, 56px)', fontWeight: 400, lineHeight: 1.2, color: parchment }}>
            Why now. Why you. Why this.
          </h1>
        </div>
      </section>

      {/* ═══ THE HISTORICAL PARALLEL ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: '#0a0a0a', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '680px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '2.5rem' }}>THE HISTORICAL PARALLEL</div>

          <p style={{ fontSize: '20px', color: ivory85, lineHeight: 1.9, marginBottom: '2rem' }}>
            In 1400, Florence was a banking town. By 1500, it had produced Leonardo, Michelangelo, Machiavelli, and Botticelli. What changed? A small group of patrons, thinkers, and makers decided that human excellence was worth funding, practicing, and celebrating. They built guilds. They hosted salons. They trained polymaths.
          </p>
          <p style={{ fontSize: '20px', color: ivory85, lineHeight: 1.9, marginBottom: '2rem' }}>
            Today, the same ingredients exist — but scattered. AI gives us access to the greatest teachers in history. Blockchain gives us transparent, trustless coordination. Philosophy gives us the framework to ask what's worth building. Music, travel, and community give us the soil.
          </p>
          <p style={{ fontSize: '20px', color: ivory85, lineHeight: 1.9, marginBottom: '2rem' }}>
            What's missing is the guild. The place where these threads come together. The institution that takes becoming a complete human being as seriously as universities take specialization.
          </p>
          <p style={{ fontSize: '20px', color: parchment, lineHeight: 1.9, fontWeight: 500 }}>
            That's Society of Explorers.
          </p>
        </div>
      </section>

      {/* ═══ THE RENAISSANCE HUMAN ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: '#0d0d0d', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '680px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '2rem' }}>THE RENAISSANCE HUMAN</div>

          <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(26px, 4vw, 38px)', fontWeight: 400, fontStyle: 'italic', lineHeight: 1.3, color: parchment, marginBottom: '2rem' }}>
            A Renaissance Human is someone who refuses to be one thing.
          </h2>

          <p style={{ fontSize: '20px', color: ivory85, lineHeight: 1.9, marginBottom: '2rem' }}>
            They think philosophically. They build with technology. They move through the world with sovereignty. They create art, fund projects, challenge ideas, and grow — not in one direction, but in all directions simultaneously.
          </p>
          <p style={{ fontSize: '20px', color: ivory85, lineHeight: 1.9 }}>
            Council Mode is the training ground. Six thinkers. Persistent memory. Real disagreement. Every conversation makes you sharper, broader, more dangerous.
          </p>
        </div>
      </section>

      {/* ═══ THE MODERN GUILD ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: '#0a0a0a', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold }}>THE MODERN GUILD</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1px', background: `${gold}10` }}>
            {GUILD_CARDS.map(card => (
              <div key={card.title} style={{ background: '#0d0d0d', padding: '2.5rem 2rem', border: `1px solid rgba(201,168,76,0.15)` }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.15em', color: gold, marginBottom: '1rem' }}>
                  {card.title.toUpperCase()}
                </div>
                <p style={{ fontSize: '16px', color: muted, lineHeight: 1.8 }}>{card.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: '#0d0d0d', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 400, fontStyle: 'italic', lineHeight: 1.3, color: parchment, marginBottom: '1.5rem' }}>
            This is an invitation.
          </h2>
          <p style={{ fontSize: '20px', color: ivory85, lineHeight: 1.9, marginBottom: '2.5rem' }}>
            The Renaissance didn't happen to everyone. It happened to the people who showed up. The salon is open. The thinkers are waiting. The guild is forming.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a
              href="/salon"
              style={{
                fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em',
                color: '#0a0a0a', background: gold, padding: '0 28px',
                textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
                height: '48px', borderRadius: 0,
              }}
            >
              ENTER THE SALON
            </a>
            <a
              href="/join"
              style={{
                fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em',
                color: gold, background: 'transparent', border: `1px solid ${gold}`,
                padding: '0 28px', textDecoration: 'none', display: 'inline-flex',
                alignItems: 'center', height: '48px', borderRadius: 0,
              }}
            >
              BECOME AN EXPLORER
            </a>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
