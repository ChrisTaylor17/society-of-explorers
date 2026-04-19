import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

export const metadata = {
  title: 'Our Vision — Society of Explorers',
  description:
    'A new data economy where AI guides humans toward meaningful work, and that work is rewarded in crypto.',
};

export default function VisionPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      {/* HERO */}
      <section style={{ padding: '8rem 2rem 3rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '680px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1.5rem' }}>
            SOCIETY OF EXPLORERS
          </div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(36px, 7vw, 58px)', fontWeight: 400, fontStyle: 'italic', lineHeight: 1.15, marginBottom: '1.25rem', color: parchment }}>
            Our Vision
          </h1>
          <div style={{ width: '60px', height: '1px', background: `${gold}4d`, margin: '2rem auto 0' }} />
        </div>
      </section>

      {/* BODY */}
      <section style={{ padding: '0 2rem 3rem' }}>
        <article style={{ maxWidth: '640px', margin: '0 auto', fontFamily: 'Cormorant Garamond, serif', fontSize: '18px', lineHeight: 1.8, color: ivory85 }}>
          <p style={{ marginBottom: '1.5rem' }}>
            I didn&apos;t build this to give you daily journaling prompts.
          </p>

          <p style={{ marginBottom: '1.5rem' }}>
            I built it because I believe we&apos;re heading into a world where AI can guide humans toward meaningful work — and those humans should be rewarded in crypto for doing it.
          </p>

          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.3em', color: gold, marginTop: '2.5rem', marginBottom: '1.25rem' }}>
            HERE&apos;S HOW IT ACTUALLY WORKS
          </div>

          <p style={{ marginBottom: '1.5rem' }}>
            Every day the AI gives you a real task.
            <br />
            <span style={{ color: muted, fontStyle: 'italic' }}>Not a reflection. A task.</span>
            <br />
            Something you can actually do in the real world.
          </p>

          <p style={{ marginBottom: '1.5rem' }}>
            When you complete it and report back, you earn utility tokens.
          </p>

          <p style={{ marginBottom: '1.5rem' }}>
            Those tokens come from people and organizations who need real work done — not from thin air.
          </p>

          <p style={{ marginBottom: '1.5rem' }}>
            Over time, the AI learns what you&apos;re good at, what you care about, and starts giving you better tasks that line up with bigger visions.
          </p>

          <div style={{ borderLeft: `2px solid ${gold}4d`, paddingLeft: '1.25rem', margin: '2rem 0', fontStyle: 'italic', color: muted }}>
            The daily practice you see on the homepage is just the on-ramp.
            <br />
            The real system is what comes after.
          </div>

          <p style={{ marginBottom: '1.5rem' }}>
            This is how we build a new kind of data economy — one where your personal memory, wisdom, and effort have real value.
          </p>

          <p style={{ marginBottom: 0, color: parchment }}>
            If that future excites you, start with today&apos;s question.
          </p>
        </article>

        {/* CTA */}
        <div style={{ maxWidth: '640px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ width: '60px', height: '1px', background: `${gold}4d`, margin: '3rem auto 2rem' }} />
          <a
            href="/practice"
            style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.2em', color: '#0a0a0a', background: gold, padding: '0 32px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '52px' }}
          >
            BEGIN THE DAILY PRACTICE →
          </a>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
