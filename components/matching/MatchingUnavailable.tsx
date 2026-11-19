import Link from 'next/link';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

export default function MatchingUnavailable() {
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#f5f0e8' }}>
      <PublicNav />
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '8rem 24px 5rem' }}>
        <p style={{ color: '#c9a84c', letterSpacing: '0.12em', fontSize: 13 }}>MEET EXPLORERS</p>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(30px, 6vw, 48px)', lineHeight: 1.2 }}>
          Start with a shared interest.
        </h1>
        <p style={{ fontSize: 19, lineHeight: 1.7 }}>
          Explore profiles people choose to publish, or join a salon around a shared reading.
          You decide who to approach and which conversations to join.
        </p>
        <p style={{ fontSize: 17, lineHeight: 1.7, color: '#b9b0a0' }}>
          Scored matching is not available in this release. Any future recommendations
          will need a separate choice about participating and a clear explanation of
          the information they use.
        </p>
        <nav aria-label="Ways to meet explorers" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 28 }}>
          <Link href="/members" prefetch={false} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 48, padding: '12px 20px', background: '#c9a84c', color: '#0a0a0a', borderRadius: 4 }}>
            Find people
          </Link>
          <Link href="/book-salons" prefetch={false} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 48, padding: '12px 20px', border: '1px solid #c9a84c', color: '#f5f0e8', borderRadius: 4 }}>
            Explore salons
          </Link>
        </nav>
      </main>
      <PublicFooter />
    </div>
  );
}
