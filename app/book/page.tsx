export default function Book() {
  return (
    <div style={{ minHeight: '100vh', background: '#111', color: '#eee', fontFamily: 'Cormorant Garamond, serif', padding: '5rem 2rem', textAlign: 'center' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: '4.2rem', letterSpacing: '0.3em', color: '#c9a84c', marginBottom: '1rem' }}>THE SOCIETY ARTIFACT</h1>
        <p style={{ fontSize: '1.5rem', lineHeight: 1.7, maxWidth: '800px', margin: '0 auto 4rem', color: '#ddd' }}>
          Physical books and talismans that bring the entire economy onto the blockchain.
        </p>

        <div style={{ background: '#1a1a1a', border: '3px solid #c9a84c', borderRadius: '16px', padding: '3.5rem 3rem', marginBottom: '5rem' }}>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: '2.4rem', color: '#c9a84c', marginBottom: '2.5rem' }}>How It Works</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '3rem', textAlign: 'left' }}>
            <div>
              <div style={{ fontSize: '1.3rem', fontWeight: 600, marginBottom: '1rem' }}>1. Your Physical Book</div>
              <p style={{ fontSize: '1.15rem', color: '#ccc', lineHeight: 1.7 }}>Every copy contains an embedded NFC chip and a unique QR code sticker. This is your personal key to the movement — a living talisman that connects you to the Society.</p>
            </div>
            <div>
              <div style={{ fontSize: '1.3rem', fontWeight: 600, marginBottom: '1rem' }}>2. Tap or Scan</div>
              <p style={{ fontSize: '1.15rem', color: '#ccc', lineHeight: 1.7 }}>Hold the book to your phone or scan the QR. Instant crypto micropayment mints your NFT and adds you to the network. The ritual is complete.</p>
            </div>
            <div>
              <div style={{ fontSize: '1.3rem', fontWeight: 600, marginBottom: '1rem' }}>3. You Own the Network</div>
              <p style={{ fontSize: '1.15rem', color: '#ccc', lineHeight: 1.7 }}>You become a verified founding member. The book is now a living on-chain artifact. Every future reader who taps or scans it pays you micro-royalties in $SOE — forever.</p>
            </div>
          </div>
        </div>

        <p style={{ fontSize: '1.4rem', lineHeight: 1.9, maxWidth: '820px', margin: '0 auto 4rem', color: '#ddd' }}>
          This is how we shift the whole economy onto the blockchain.<br />
          Start with your books. AI + crypto + physical objects = the new renaissance.
        </p>

        <div style={{ background: '#1a1a1a', border: '1px solid #c9a84c22', borderRadius: '12px', padding: '2rem', maxWidth: '700px', margin: '0 auto 4rem' }}>
          <p style={{ fontStyle: 'italic', fontSize: '1.25rem', color: '#c9a84c' }}>
            “Beauty is the form that truth takes when fully realized.”<br />
            — Giovanni DeCunto, God Series
          </p>
        </div>

        <a href="/salon" style={{ 
          display: 'inline-block', 
          padding: '1.4rem 3.5rem', 
          border: '2px solid #c9a84c', 
          color: '#c9a84c', 
          fontSize: '1.3rem', 
          fontFamily: 'Cinzel, serif',
          letterSpacing: '0.2em',
          textDecoration: 'none',
          borderRadius: '6px',
          transition: 'all 0.3s'
        }}>
          ← RETURN TO THE SALON
        </a>
      </div>
    </div>
  );
}
