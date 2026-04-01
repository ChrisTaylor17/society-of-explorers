export default function Book() {
  return (
    <div style={{ minHeight: '100vh', background: '#111', color: '#eee', fontFamily: 'Cormorant Garamond, serif', padding: '4rem 2rem', textAlign: 'center' }}>
      <div style={{ maxWidth: '960px', margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: '3.8rem', letterSpacing: '0.25em', color: '#c9a84c', marginBottom: '1.5rem' }}>THE SOCIETY ARTIFACT</h1>
        <p style={{ fontSize: '1.45rem', lineHeight: 1.7, maxWidth: '720px', margin: '0 auto 4rem', color: '#ddd' }}>
          Physical books and talismans that bring the entire economy onto the blockchain.
        </p>

        <div style={{ background: '#1a1a1a', border: '3px solid #c9a84c', borderRadius: '12px', padding: '3rem 2.5rem', marginBottom: '4rem' }}>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: '2.1rem', color: '#c9a84c', marginBottom: '2rem' }}>How It Works</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2.5rem', textAlign: 'left' }}>
            <div>
              <div style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.8rem' }}>1. Your Physical Book</div>
              <p style={{ fontSize: '1.1rem', color: '#ccc' }}>Every copy contains an embedded NFC chip and a unique QR code sticker. This is your personal key to the movement.</p>
            </div>
            <div>
              <div style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.8rem' }}>2. Tap or Scan</div>
              <p style={{ fontSize: '1.1rem', color: '#ccc' }}>Hold the book to your phone or scan the QR. Instant crypto micropayment mints your NFT and adds you to the network.</p>
            </div>
            <div>
              <div style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.8rem' }}>3. You Own the Network</div>
              <p style={{ fontSize: '1.1rem', color: '#ccc' }}>You become a verified member. The book is now a living on-chain artifact. Every future reader pays you micro-royalties in $SOE.</p>
            </div>
          </div>
        </div>

        <p style={{ fontSize: '1.35rem', lineHeight: 1.8, maxWidth: '720px', margin: '0 auto 4rem', color: '#ddd' }}>
          This is how we shift the whole economy onto the blockchain.<br />
          Start with your books. AI + crypto + physical objects = the new renaissance.
        </p>

        <a href="/salon" style={{ 
          display: 'inline-block', 
          padding: '1.25rem 3rem', 
          border: '2px solid #c9a84c', 
          color: '#c9a84c', 
          fontSize: '1.25rem', 
          fontFamily: 'Cinzel, serif',
          letterSpacing: '0.15em',
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
