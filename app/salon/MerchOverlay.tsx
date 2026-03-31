'use client';

interface Product {
  id: string;
  thinker: string;
  symbol: string;
  accent: string;
  type: string;
  name: string;
  tagline: string;
  price: number;
}

const PRODUCTS: Product[] = [
  {
    id: 'socrates-journal',
    thinker: 'Socrates',
    symbol: 'Σ',
    accent: '#C9A84C',
    type: 'Journal',
    name: 'The Examined Life',
    tagline: 'Know thyself — 160 pages, lay-flat binding, dark linen cover.',
    price: 24.99,
  },
  {
    id: 'plato-poster',
    thinker: 'Plato',
    symbol: 'Π',
    accent: '#7B9FD4',
    type: 'Art Print',
    name: 'Allegory of the Cave',
    tagline: 'Archival-quality 18×24 print on 100lb matte stock.',
    price: 19.99,
  },
  {
    id: 'nietzsche-mug',
    thinker: 'Nietzsche',
    symbol: 'N',
    accent: '#C0392B',
    type: 'Mug',
    name: 'Will to Power',
    tagline: '15oz ceramic, dishwasher safe. Become who you are.',
    price: 18.99,
  },
  {
    id: 'aurelius-notebook',
    thinker: 'Marcus Aurelius',
    symbol: 'M',
    accent: '#8E7CC3',
    type: 'Notebook',
    name: 'Meditations',
    tagline: 'Stoic hardcover, 200 ruled pages. The obstacle is the way.',
    price: 22.99,
  },
  {
    id: 'einstein-tote',
    thinker: 'Einstein',
    symbol: 'E',
    accent: '#5DADE2',
    type: 'Tote Bag',
    name: 'Thought Experiment',
    tagline: 'Heavy cotton canvas, 15×16". Carry your relativity daily.',
    price: 16.99,
  },
  {
    id: 'jobs-poster',
    thinker: 'Steve Jobs',
    symbol: 'J',
    accent: '#ABEBC6',
    type: 'Art Print',
    name: 'Think Different',
    tagline: 'Minimalist 12×18 foil print on premium paper.',
    price: 21.99,
  },
];

function ProductMockup({ product }: { product: Product }) {
  const { symbol, accent, type } = product;
  const typeLabel = type.toUpperCase().replace(' ', '\n');
  return (
    <svg viewBox="0 0 240 240" width="100%" style={{ display: 'block' }} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id={`bg-${product.id}`} cx="50%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#1a1209" />
          <stop offset="100%" stopColor="#080808" />
        </radialGradient>
      </defs>
      <rect width="240" height="240" fill={`url(#bg-${product.id})`} />
      {/* border */}
      <rect x="8" y="8" width="224" height="224" rx="3" fill="none" stroke={accent} strokeWidth="0.8" opacity="0.5" />
      {/* corner accents */}
      <line x1="8" y1="28" x2="8" y2="8" stroke={accent} strokeWidth="1.5" opacity="0.7" />
      <line x1="8" y1="8" x2="28" y2="8" stroke={accent} strokeWidth="1.5" opacity="0.7" />
      <line x1="232" y1="28" x2="232" y2="8" stroke={accent} strokeWidth="1.5" opacity="0.7" />
      <line x1="232" y1="8" x2="212" y2="8" stroke={accent} strokeWidth="1.5" opacity="0.7" />
      <line x1="8" y1="212" x2="8" y2="232" stroke={accent} strokeWidth="1.5" opacity="0.7" />
      <line x1="8" y1="232" x2="28" y2="232" stroke={accent} strokeWidth="1.5" opacity="0.7" />
      <line x1="232" y1="212" x2="232" y2="232" stroke={accent} strokeWidth="1.5" opacity="0.7" />
      <line x1="232" y1="232" x2="212" y2="232" stroke={accent} strokeWidth="1.5" opacity="0.7" />
      {/* glow circles */}
      <circle cx="120" cy="112" r="60" fill={accent} opacity="0.04" />
      <circle cx="120" cy="112" r="36" fill={accent} opacity="0.06" />
      {/* symbol */}
      <text x="120" y="135" fontFamily="Georgia,serif" fontSize="72" textAnchor="middle" dominantBaseline="middle" fill={accent} opacity="0.92">{symbol}</text>
      {/* divider */}
      <line x1="36" y1="163" x2="204" y2="163" stroke={accent} strokeWidth="0.5" opacity="0.4" />
      {/* type badge */}
      <text x="120" y="180" fontFamily="Courier New,monospace" fontSize="8" letterSpacing="3" textAnchor="middle" fill={accent} opacity="0.5">{typeLabel}</text>
      {/* society label */}
      <text x="120" y="216" fontFamily="Georgia,serif" fontSize="7" letterSpacing="3" textAnchor="middle" fill={accent} opacity="0.3">SOCIETY OF EXPLORERS</text>
    </svg>
  );
}

export default function MerchOverlay({ onClose }: { onClose: () => void }) {
  function handleBuy(product: Product) {
    alert(`${product.name} — Printful checkout coming soon!\n\nWe're wiring the store now. Check back in 24h.`);
  }

  return (
    <div style={{
      position: 'absolute', inset: 0, top: '52px',
      background: 'var(--bg-void)', zIndex: 30,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'var(--bg-deep)', flexShrink: 0,
      }}>
        <div>
          <div style={{ fontFamily: 'Cinzel,serif', fontSize: '13px', color: 'var(--gold-light)', letterSpacing: '0.12em' }}>
            Society Merch
          </div>
          <div style={{ fontSize: '11px', color: 'var(--ivory-muted)', fontStyle: 'italic', marginTop: '1px', fontFamily: 'Cormorant Garamond,serif' }}>
            Artifacts for the physical realm · Designed by the minds of history
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: '1px solid var(--border)',
            color: 'var(--gold-dim)', fontSize: '10px', fontFamily: 'Cinzel,serif',
            letterSpacing: '0.08em', padding: '3px 8px', cursor: 'pointer', borderRadius: '2px',
          }}
        >
          CLOSE
        </button>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: '20px',
        }}>
          {PRODUCTS.map(product => (
            <div
              key={product.id}
              style={{
                background: 'var(--bg-elevated)',
                border: `1px solid ${product.accent}33`,
                borderRadius: '4px', overflow: 'hidden',
                display: 'flex', flexDirection: 'column',
                transition: 'border-color 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = product.accent + '77')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = product.accent + '33')}
            >
              {/* Mockup */}
              <div style={{ aspectRatio: '1', background: '#080808' }}>
                <ProductMockup product={product} />
              </div>

              {/* Info */}
              <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{
                    fontFamily: 'Cinzel,serif', fontSize: '9px', letterSpacing: '0.12em',
                    color: product.accent, border: `1px solid ${product.accent}55`,
                    padding: '2px 6px', borderRadius: '2px',
                  }}>
                    {product.type.toUpperCase()}
                  </span>
                  <span style={{ fontFamily: 'Cinzel,serif', fontSize: '14px', color: 'var(--gold)' }}>
                    ${product.price.toFixed(2)}
                  </span>
                </div>

                <div style={{ fontFamily: 'Cinzel,serif', fontSize: '13px', color: 'var(--gold-light)', letterSpacing: '0.05em' }}>
                  {product.name}
                </div>
                <div style={{ fontFamily: 'Cinzel,serif', fontSize: '9px', color: product.accent, letterSpacing: '0.1em', opacity: 0.7 }}>
                  by {product.thinker.toUpperCase()}
                </div>
                <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: '13px', color: 'var(--ivory-muted)', fontStyle: 'italic', lineHeight: 1.5 }}>
                  {product.tagline}
                </div>
              </div>

              {/* CTA */}
              <div style={{ padding: '0 16px 16px' }}>
                <button
                  onClick={() => handleBuy(product)}
                  style={{
                    width: '100%',
                    background: 'linear-gradient(135deg,#1c1500,#2a1e00)',
                    border: `1px solid ${product.accent}66`,
                    color: product.accent,
                    fontFamily: 'Cinzel,serif', fontSize: '10px', letterSpacing: '0.15em',
                    padding: '8px 0', cursor: 'pointer', borderRadius: '2px',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg,#2a1e00,#3a2c00)';
                    (e.currentTarget as HTMLButtonElement).style.borderColor = product.accent + 'aa';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg,#1c1500,#2a1e00)';
                    (e.currentTarget as HTMLButtonElement).style.borderColor = product.accent + '66';
                  }}
                >
                  ⬡ ORDER NOW
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-deep)', flexShrink: 0 }}>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', textAlign: 'center', lineHeight: 1.6 }}>
          Print-on-demand via Printful · Ships worldwide · No inventory risk · 100% designed by AI thinkers
        </div>
      </div>
    </div>
  );
}
