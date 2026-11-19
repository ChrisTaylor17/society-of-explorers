import { PRIVACY_CONTACT, PRIVACY_POLICY_PATH } from '@/lib/account/privacy-policy';

const gold = '#c9a84c';
const muted = '#9a8f7a';

export default function PublicFooter() {
  return (
    <footer style={{ padding: '3rem 2rem', borderTop: `1px solid ${gold}11`, background: '#0a0a0a' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: gold }}>SOCIETY OF EXPLORERS</div>
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          {[{ l: 'About', h: '/soe' }, { l: 'Fellowship', h: '/fellowship' }, { l: 'Reading', h: '/great-books' }, { l: 'Salons', h: '/salons/pilot' }].map(lk => (
            <a key={lk.h} href={lk.h} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: muted, textDecoration: 'none' }}>{lk.l.toUpperCase()}</a>
          ))}
          <a href={PRIVACY_POLICY_PATH} style={{ color: muted }}>Privacy policy</a>
        </div>
        <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '13px', color: muted }}>{PRIVACY_CONTACT}</div>
      </div>
      <div style={{ textAlign: 'center', marginTop: '1.5rem', fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: gold, opacity: 0.8 }}>SHARED READING · FELLOWSHIP · HONEST INQUIRY</div>
    </footer>
  );
}
