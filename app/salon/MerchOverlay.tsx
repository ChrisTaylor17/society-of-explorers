'use client';
import { useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Product {
  id: string;
  thinker: string;
  symbol: string;
  accent: string;
  type: string;
  name: string;
  tagline: string;
  price: number;
  // Set these once you create the products in your Printful store:
  // Printful → Dashboard → Stores → your store → Sync products → variant ID
  printfulVariantId: number | null;
}

interface ShippingForm {
  name:         string;
  email:        string;
  address1:     string;
  city:         string;
  state_code:   string;
  country_code: string;
  zip:          string;
}

// ── Products ───────────────────────────────────────────────────────────────────
// printfulVariantId: fill in once products are synced in Printful dashboard.
const PRODUCTS: Product[] = [
  {
    id: 'socrates-journal', thinker: 'Socrates', symbol: 'Σ', accent: '#C9A84C',
    type: 'Journal', name: 'The Examined Life',
    tagline: 'Know thyself — 160 pages, lay-flat binding, dark linen cover.',
    price: 24.99, printfulVariantId: null,
  },
  {
    id: 'plato-poster', thinker: 'Plato', symbol: 'Π', accent: '#7B9FD4',
    type: 'Art Print', name: 'Allegory of the Cave',
    tagline: 'Archival-quality 18×24 print on 100lb matte stock.',
    price: 19.99, printfulVariantId: null,
  },
  {
    id: 'nietzsche-mug', thinker: 'Nietzsche', symbol: 'N', accent: '#C0392B',
    type: 'Mug', name: 'Will to Power',
    tagline: '15oz ceramic, dishwasher safe. Become who you are.',
    price: 18.99, printfulVariantId: null,
  },
  {
    id: 'aurelius-notebook', thinker: 'Marcus Aurelius', symbol: 'M', accent: '#8E7CC3',
    type: 'Notebook', name: 'Meditations',
    tagline: 'Stoic hardcover, 200 ruled pages. The obstacle is the way.',
    price: 22.99, printfulVariantId: null,
  },
  {
    id: 'einstein-tote', thinker: 'Einstein', symbol: 'E', accent: '#5DADE2',
    type: 'Tote Bag', name: 'Thought Experiment',
    tagline: 'Heavy cotton canvas, 15×16". Carry your relativity daily.',
    price: 16.99, printfulVariantId: null,
  },
  {
    id: 'jobs-poster', thinker: 'Steve Jobs', symbol: 'J', accent: '#ABEBC6',
    type: 'Art Print', name: 'Think Different',
    tagline: 'Minimalist 12×18 foil print on premium paper.',
    price: 21.99, printfulVariantId: null,
  },
];

// ── SVG Mockup ────────────────────────────────────────────────────────────────
function ProductMockup({ product }: { product: Product }) {
  const { symbol, accent, type, id } = product;
  return (
    <svg viewBox="0 0 240 240" width="100%" style={{ display: 'block' }} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id={`bg-${id}`} cx="50%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#1a1209" />
          <stop offset="100%" stopColor="#080808" />
        </radialGradient>
      </defs>
      <rect width="240" height="240" fill={`url(#bg-${id})`} />
      <rect x="8" y="8" width="224" height="224" rx="3" fill="none" stroke={accent} strokeWidth="0.8" opacity="0.5" />
      <line x1="8" y1="28" x2="8" y2="8" stroke={accent} strokeWidth="1.5" opacity="0.7" />
      <line x1="8" y1="8" x2="28" y2="8" stroke={accent} strokeWidth="1.5" opacity="0.7" />
      <line x1="232" y1="28" x2="232" y2="8" stroke={accent} strokeWidth="1.5" opacity="0.7" />
      <line x1="232" y1="8" x2="212" y2="8" stroke={accent} strokeWidth="1.5" opacity="0.7" />
      <line x1="8" y1="212" x2="8" y2="232" stroke={accent} strokeWidth="1.5" opacity="0.7" />
      <line x1="8" y1="232" x2="28" y2="232" stroke={accent} strokeWidth="1.5" opacity="0.7" />
      <line x1="232" y1="212" x2="232" y2="232" stroke={accent} strokeWidth="1.5" opacity="0.7" />
      <line x1="232" y1="232" x2="212" y2="232" stroke={accent} strokeWidth="1.5" opacity="0.7" />
      <circle cx="120" cy="112" r="60" fill={accent} opacity="0.04" />
      <circle cx="120" cy="112" r="36" fill={accent} opacity="0.06" />
      <text x="120" y="135" fontFamily="Georgia,serif" fontSize="72" textAnchor="middle" dominantBaseline="middle" fill={accent} opacity="0.92">{symbol}</text>
      <line x1="36" y1="163" x2="204" y2="163" stroke={accent} strokeWidth="0.5" opacity="0.4" />
      <text x="120" y="180" fontFamily="Courier New,monospace" fontSize="8" letterSpacing="3" textAnchor="middle" fill={accent} opacity="0.5">{type.toUpperCase()}</text>
      <text x="120" y="216" fontFamily="Georgia,serif" fontSize="7" letterSpacing="3" textAnchor="middle" fill={accent} opacity="0.3">SOCIETY OF EXPLORERS</text>
    </svg>
  );
}

// ── Checkout Drawer ───────────────────────────────────────────────────────────
function CheckoutDrawer({
  product,
  onClose,
}: {
  product: Product;
  onClose: () => void;
}) {
  const [form, setForm] = useState<ShippingForm>({
    name: '', email: '', address1: '', city: '',
    state_code: '', country_code: 'US', zip: '',
  });
  const [loading,   setLoading]   = useState(false);
  const [orderId,   setOrderId]   = useState<number | null>(null);
  const [orderCost, setOrderCost] = useState<Record<string, string> | null>(null);
  const [error,     setError]     = useState('');

  const accent = product.accent;

  function field(label: string, key: keyof ShippingForm, placeholder = '') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontFamily: 'Cinzel,serif', fontSize: '9px', letterSpacing: '0.1em', color: accent, opacity: 0.7 }}>
          {label}
        </label>
        <input
          value={form[key]}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          placeholder={placeholder}
          style={{
            background: '#0d0d0d', border: `1px solid ${accent}33`,
            borderRadius: '2px', padding: '8px 10px',
            color: 'var(--ivory)', fontSize: '13px',
            fontFamily: 'Cormorant Garamond,serif',
            outline: 'none', width: '100%', boxSizing: 'border-box',
          }}
        />
      </div>
    );
  }

  async function submitOrder() {
    if (!form.name || !form.email || !form.address1 || !form.city || !form.zip || !form.state_code) {
      setError('Please fill in all fields.');
      return;
    }
    if (!product.printfulVariantId) {
      setError('This product is not yet linked to Printful. Variant ID pending.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/merch/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variantId: product.printfulVariantId,
          quantity: 1,
          recipient: {
            name:         form.name,
            email:        form.email,
            address1:     form.address1,
            city:         form.city,
            state_code:   form.state_code,
            country_code: form.country_code,
            zip:          form.zip,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Order failed'); return; }
      setOrderId(data.orderId);
      setOrderCost(data.costs);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    /* Backdrop */
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Drawer */}
      <div style={{
        width: '420px', maxWidth: '100vw', height: '100%',
        background: 'var(--bg-deep)', borderLeft: `1px solid ${accent}33`,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Drawer header */}
        <div style={{
          padding: '16px 20px', borderBottom: `1px solid ${accent}22`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontFamily: 'Cinzel,serif', fontSize: '11px', color: accent, letterSpacing: '0.12em' }}>
              ORDER — {product.type.toUpperCase()}
            </div>
            <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: '16px', color: 'var(--gold-light)', marginTop: '2px' }}>
              {product.name}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--gold-dim)', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>✕</button>
        </div>

        {orderId ? (
          /* ── Success ── */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 28px', gap: '16px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'Cinzel,serif', fontSize: '32px', color: accent }}>⬡</div>
            <div style={{ fontFamily: 'Cinzel,serif', fontSize: '13px', color: 'var(--gold-light)', letterSpacing: '0.1em' }}>ORDER PLACED</div>
            <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: '13px', color: 'var(--ivory-muted)', fontStyle: 'italic' }}>
              Draft #{orderId} created in Printful.
            </div>
            {orderCost && (
              <div style={{ background: '#0d0d0d', border: `1px solid ${accent}22`, borderRadius: '4px', padding: '14px 18px', width: '100%', textAlign: 'left' }}>
                {Object.entries(orderCost).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'Cormorant Garamond,serif', fontSize: '13px', color: 'var(--ivory-muted)', marginBottom: '4px' }}>
                    <span style={{ textTransform: 'capitalize' }}>{k}</span>
                    <span style={{ color: k === 'total' ? accent : undefined }}>{v}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: '12px', color: 'var(--ivory-muted)', fontStyle: 'italic', lineHeight: 1.6 }}>
              Review and confirm this order in your Printful dashboard to begin fulfillment.
            </div>
            <button onClick={onClose} style={{ marginTop: '8px', background: 'none', border: `1px solid ${accent}55`, color: accent, fontFamily: 'Cinzel,serif', fontSize: '10px', letterSpacing: '0.12em', padding: '8px 20px', cursor: 'pointer', borderRadius: '2px' }}>
              CLOSE
            </button>
          </div>
        ) : (
          /* ── Form ── */
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {/* Product summary */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#0d0d0d', border: `1px solid ${accent}22`, borderRadius: '4px', padding: '10px 12px', marginBottom: '6px' }}>
                <div style={{ width: '48px', flexShrink: 0 }}>
                  <ProductMockup product={product} />
                </div>
                <div>
                  <div style={{ fontFamily: 'Cinzel,serif', fontSize: '11px', color: 'var(--gold-light)' }}>{product.name}</div>
                  <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: '13px', color: accent, marginTop: '2px' }}>${product.price.toFixed(2)} + shipping</div>
                </div>
              </div>

              {!product.printfulVariantId && (
                <div style={{ background: '#1a0f00', border: '1px solid #c9a84c44', borderRadius: '4px', padding: '10px 14px', fontFamily: 'Cormorant Garamond,serif', fontSize: '13px', color: '#c9a84c', fontStyle: 'italic', lineHeight: 1.5 }}>
                  This product's Printful variant ID is not yet set. Add it to PRODUCTS in MerchOverlay.tsx after creating the product in your Printful store.
                </div>
              )}

              <div style={{ fontFamily: 'Cinzel,serif', fontSize: '9px', color: 'var(--gold-dim)', letterSpacing: '0.15em', marginTop: '4px' }}>SHIPPING ADDRESS</div>

              {field('FULL NAME', 'name', 'Jane Explorer')}
              {field('EMAIL', 'email', 'jane@example.com')}
              {field('ADDRESS', 'address1', '123 Main St')}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontFamily: 'Cinzel,serif', fontSize: '9px', letterSpacing: '0.1em', color: accent, opacity: 0.7 }}>CITY</label>
                  <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="Austin"
                    style={{ background: '#0d0d0d', border: `1px solid ${accent}33`, borderRadius: '2px', padding: '8px 10px', color: 'var(--ivory)', fontSize: '13px', fontFamily: 'Cormorant Garamond,serif', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontFamily: 'Cinzel,serif', fontSize: '9px', letterSpacing: '0.1em', color: accent, opacity: 0.7 }}>STATE</label>
                  <input value={form.state_code} onChange={e => setForm(f => ({ ...f, state_code: e.target.value.toUpperCase() }))} placeholder="TX" maxLength={2}
                    style={{ background: '#0d0d0d', border: `1px solid ${accent}33`, borderRadius: '2px', padding: '8px 10px', color: 'var(--ivory)', fontSize: '13px', fontFamily: 'Cormorant Garamond,serif', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontFamily: 'Cinzel,serif', fontSize: '9px', letterSpacing: '0.1em', color: accent, opacity: 0.7 }}>ZIP</label>
                  <input value={form.zip} onChange={e => setForm(f => ({ ...f, zip: e.target.value }))} placeholder="78701"
                    style={{ background: '#0d0d0d', border: `1px solid ${accent}33`, borderRadius: '2px', padding: '8px 10px', color: 'var(--ivory)', fontSize: '13px', fontFamily: 'Cormorant Garamond,serif', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontFamily: 'Cinzel,serif', fontSize: '9px', letterSpacing: '0.1em', color: accent, opacity: 0.7 }}>COUNTRY</label>
                  <input value={form.country_code} onChange={e => setForm(f => ({ ...f, country_code: e.target.value.toUpperCase() }))} placeholder="US" maxLength={2}
                    style={{ background: '#0d0d0d', border: `1px solid ${accent}33`, borderRadius: '2px', padding: '8px 10px', color: 'var(--ivory)', fontSize: '13px', fontFamily: 'Cormorant Garamond,serif', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
                </div>
              </div>

              {error && (
                <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: '13px', color: '#e07070', fontStyle: 'italic' }}>
                  {error}
                </div>
              )}
            </div>
          </div>
        )}

        {!orderId && (
          <div style={{ padding: '16px 20px', borderTop: `1px solid ${accent}22`, flexShrink: 0 }}>
            <button
              onClick={submitOrder}
              disabled={loading}
              style={{
                width: '100%',
                background: loading ? 'transparent' : `linear-gradient(135deg,#1c1500,#2a1e00)`,
                border: `1px solid ${accent}${loading ? '44' : '88'}`,
                color: accent, opacity: loading ? 0.5 : 1,
                fontFamily: 'Cinzel,serif', fontSize: '11px', letterSpacing: '0.15em',
                padding: '12px 0', cursor: loading ? 'not-allowed' : 'pointer', borderRadius: '2px',
              }}
            >
              {loading ? 'PLACING ORDER...' : `⬡ PLACE ORDER — $${product.price.toFixed(2)}`}
            </button>
            <div style={{ marginTop: '8px', fontFamily: 'Cormorant Garamond,serif', fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', fontStyle: 'italic' }}>
              Draft order — reviewed in Printful before shipping
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Overlay ──────────────────────────────────────────────────────────────
export default function MerchOverlay({ onClose }: { onClose: () => void }) {
  const [checkoutProduct, setCheckoutProduct] = useState<Product | null>(null);

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
        <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--gold-dim)', fontSize: '10px', fontFamily: 'Cinzel,serif', letterSpacing: '0.08em', padding: '3px 8px', cursor: 'pointer', borderRadius: '2px' }}>
          CLOSE
        </button>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '20px' }}>
          {PRODUCTS.map(product => (
            <div
              key={product.id}
              style={{ background: 'var(--bg-elevated)', border: `1px solid ${product.accent}33`, borderRadius: '4px', overflow: 'hidden', display: 'flex', flexDirection: 'column', transition: 'border-color 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = product.accent + '77')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = product.accent + '33')}
            >
              <div style={{ aspectRatio: '1', background: '#080808' }}>
                <ProductMockup product={product} />
              </div>
              <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ fontFamily: 'Cinzel,serif', fontSize: '9px', letterSpacing: '0.12em', color: product.accent, border: `1px solid ${product.accent}55`, padding: '2px 6px', borderRadius: '2px' }}>
                    {product.type.toUpperCase()}
                  </span>
                  <span style={{ fontFamily: 'Cinzel,serif', fontSize: '14px', color: 'var(--gold)' }}>
                    ${product.price.toFixed(2)}
                  </span>
                </div>
                <div style={{ fontFamily: 'Cinzel,serif', fontSize: '13px', color: 'var(--gold-light)', letterSpacing: '0.05em' }}>{product.name}</div>
                <div style={{ fontFamily: 'Cinzel,serif', fontSize: '9px', color: product.accent, letterSpacing: '0.1em', opacity: 0.7 }}>by {product.thinker.toUpperCase()}</div>
                <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: '13px', color: 'var(--ivory-muted)', fontStyle: 'italic', lineHeight: 1.5 }}>{product.tagline}</div>
              </div>
              <div style={{ padding: '0 16px 16px' }}>
                <button
                  onClick={() => setCheckoutProduct(product)}
                  style={{ width: '100%', background: 'linear-gradient(135deg,#1c1500,#2a1e00)', border: `1px solid ${product.accent}66`, color: product.accent, fontFamily: 'Cinzel,serif', fontSize: '10px', letterSpacing: '0.15em', padding: '8px 0', cursor: 'pointer', borderRadius: '2px', transition: 'all 0.2s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg,#2a1e00,#3a2c00)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg,#1c1500,#2a1e00)'; }}
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
          Print-on-demand via Printful · Ships worldwide · No inventory risk · Draft orders reviewed before fulfillment
        </div>
      </div>

      {/* Checkout Drawer */}
      {checkoutProduct && (
        <CheckoutDrawer product={checkoutProduct} onClose={() => setCheckoutProduct(null)} />
      )}
    </div>
  );
}
