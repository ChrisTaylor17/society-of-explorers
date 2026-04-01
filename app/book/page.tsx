export default function Book() {
  return (
    <div style={{ minHeight: '100vh', background: '#111', color: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cormorant Garamond, serif', padding: '2rem', textAlign: 'center' }}>
      <div style={{ maxWidth: '720px' }}>
        <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: '3.5rem', letterSpacing: '0.15em', marginBottom: '1.5rem', color: '#c9a84c' }}>THE BOOK</h1>
        <p style={{ fontSize: '1.35rem', lineHeight: 1.8, color: '#ddd' }}>
          The Book of the Society of Explorers is being written right now — by every ritual, every act of creation, every explorer who joins the path.
        </p>
        <a href="/salon" style={{ marginTop: '4rem', display: 'inline-block', padding: '1rem 2.5rem', border: '1px solid #c9a84c', color: '#c9a84c', textDecoration: 'none', fontSize: '1.1rem' }}>
          ← RETURN TO THE SALON
        </a>
      </div>
    </div>
  );
}
