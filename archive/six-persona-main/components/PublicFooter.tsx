const gold = '#c9a84c';
const muted = '#9a8f7a';

export default function PublicFooter() {
  return (
    <footer style={{ padding: '3rem 2rem', borderTop: `1px solid ${gold}11`, background: '#0a0a0a' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, opacity: 0.3 }}>SOCIETY OF EXPLORERS · CONSILIENCE SYSTEMS</div>
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          {[{ l: 'Council', h: '/council' }, { l: 'Practice', h: '/practice' }, { l: 'Roadmap', h: '/roadmap' }, { l: 'Live', h: '/live' }, { l: 'Join', h: '/join' }].map(lk => (
            <a key={lk.h} href={lk.h} style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.15em', color: muted, textDecoration: 'none', opacity: 0.5 }}>{lk.l.toUpperCase()}</a>
          ))}
        </div>
        <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '11px', color: muted, opacity: 0.4 }}>chris@societyofexplorers.com</div>
      </div>
      <div style={{ textAlign: 'center', marginTop: '1.5rem', fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.15em', color: gold, opacity: 0.2 }}>92B SOUTH ST · DOWNTOWN BOSTON · CONSILIENCE SYSTEMS</div>
    </footer>
  );
}
