export default function Book() {
  return (
    <div style={{ minHeight: '100vh', background: '#111', color: '#eee', fontFamily: 'Cormorant Garamond, serif', padding: '4rem 2rem', textAlign: 'center' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: '3.8rem', letterSpacing: '0.2em', color: '#c9a84c', marginBottom: '1rem' }}>THE SOCIETY ARTIFACT</h1>
        <p style={{ fontSize: '1.4rem', lineHeight: 1.7, maxWidth: '700px', margin: '0 auto 3rem' }}>
          Physical books and talismans that bring the entire economy onto the blockchain.
        </p>

        <div style={{ background: '#1a1a1a', border: '3px solid #c9a84c', borderRadius: '12px', padding: '3rem 2rem', marginBottom: '4rem' }}>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: '2rem', color: '#c9a84c', marginBottom: '1.5rem' }}>How it works</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', textAlign: 'left' }}>
            <div>
              <div style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>1. Your Physical Book</div>
              <p style={{ fontSize: '1.05rem', color: '#ccc' }}>Every copy contains an embedded NFC chip and a unique QR code sticker.</p>
            </div>
            <div>
              <div style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>2. Tap or Scan</div>
              <p style={{ fontSize: '1.05rem', color: '#ccc' }}>Tap the book on your phone or scan the QR → instant crypto micropayment + NFT mint.</p>
            </div>
            <div>
              <div style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>3. You Own the Network</div>
              <p style={{ fontSize: '1.05rem', color: '#ccc' }}>You become a verified member. The book is now a living on-chain artifact. Every future reader pays you micro-royalties in $SOE.</p>
            </div>
          </div>
        </div>

        <p style={{ fontSize: '1.3rem', lineHeight: 1.8, maxWidth: '700px', margin: '0 auto 3rem', color: '#ddd' }}>
          This is how we shift the whole economy onto the blockchain.<br />
          Start with your books. AI + crypto + physical objects = the new renaissance.
        </p>

        <a href="/salon" style={{ 
          display: 'inline-block', 
          padding: '1.2rem 3rem', 
          border: '2px solid #c9a84c', 
          color: '#c9a84c', 
          fontSize: '1.2rem', 
          fontFamily: 'Cinzel, serif',
          letterSpacing: '0.1em',
          textDecoration: 'none',
          borderRadius: '4px',
          transition: 'all 0.3s'
        }}>
          ← RETURN TO THE SALON
        </a>
      </div>
    </div>
  );
}
