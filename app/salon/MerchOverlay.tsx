'use client';
import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

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
// printfulVariantId: replace with real IDs from Printful Dashboard →
//   Stores → your store → Sync products → click product → variant ID column.
const PRODUCTS: Product[] = [
  {
    id: 'socrates-journal', thinker: 'Socrates', symbol: 'Σ', accent: '#C9A84C',
    type: 'Journal', name: 'The Examined Life',
    tagline: 'Know thyself — 160 pages, lay-flat binding, dark linen cover.',
    price: 24.99, printfulVariantId: 12345678, // ← replace with real variant ID
  },
  {
    id: 'plato-poster', thinker: 'Plato', symbol: 'Π', accent: '#7B9FD4',
    type: 'Art Print', name: 'Allegory of the Cave',
    tagline: 'Archival-quality 18×24 print on 100lb matte stock.',
    price: 19.99, printfulVariantId: 12345679, // ← replace with real variant ID
  },
  {
    id: 'nietzsche-mug', thinker: 'Nietzsche', symbol: 'N', accent: '#C0392B',
    type: 'Mug', name: 'Will to Power',
    tagline: '15oz ceramic, dishwasher safe. Become who you are.',
    price: 18.99, printfulVariantId: 12345680, // ← replace with real variant ID
  },
  {
    id: 'aurelius-notebook', thinker: 'Marcus Aurelius', symbol: 'M', accent: '#8E7CC3',
    type: 'Notebook', name: 'Meditations',
    tagline: 'Stoic hardcover, 200 ruled pages. The obstacle is the way.',
    price: 22.99, printfulVariantId: 12345681, // ← replace with real variant ID
  },
  {
    id: 'einstein-tote', thinker: 'Einstein', symbol: 'E', accent: '#5DADE2',
    type: 'Tote Bag', name: 'Thought Experiment',
    tagline: 'Heavy cotton canvas, 15×16". Carry your relativity daily.',
    price: 16.99, printfulVariantId: 12345682, // ← replace with real variant ID
  },
  {
    id: 'jobs-poster', thinker: 'Steve Jobs', symbol: 'J', accent: '#ABEBC6',
    type: 'Art Print', name: 'Think Different',
    tagline: 'Minimalist 12×18 foil print on premium paper.',
    price: 21.99, printfulVariantId: 12345683, // ← replace with real variant ID
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

// ── AI Suggestion Panel ───────────────────────────────────────────────────────
const SUGGEST_THINKERS = [
  { id: 'socrates',  name: 'Socrates',        accent: '#C9A84C' },
  { id: 'nietzsche', name: 'Nietzsche',       accent: '#C0392B' },
  { id: 'jobs',      name: 'Steve Jobs',      accent: '#ABEBC6' },
  { id: 'aurelius',  name: 'Marcus Aurelius', accent: '#8E7CC3' },
  { id: 'einstein',  name: 'Einstein',        accent: '#5DADE2' },
  { id: 'plato',     name: 'Plato',           accent: '#7B9FD4' },
];

function AISuggestPanel({ onClose }: { onClose: () => void }) {
  const supabase = createClient();
  const [thinker,       setThinker]       = useState(SUGGEST_THINKERS[0]);
  const [suggestion,    setSuggestion]    = useState('');
  const [mockupBrief,   setMockupBrief]   = useState('');
  const [loading,       setLoading]       = useState(false);
  const [mockupLoading,  setMockupLoading]  = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [saved,          setSaved]          = useState(false);
  const [saveError,      setSaveError]      = useState('');
  const [savedId,        setSavedId]        = useState<string | null>(null);
  const abortRef       = useRef<AbortController | null>(null);
  const mockupAbortRef = useRef<AbortController | null>(null);

  async function streamFrom(prompt: string, onDelta: (d: string) => void, abortCtrl: AbortController) {
    const res = await fetch('/api/thinker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: abortCtrl.signal,
      body: JSON.stringify({ thinkerId: thinker.id, message: prompt, history: [], isReaction: false, maxTokens: 800 }),
    });
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try { const evt = JSON.parse(line.slice(6)); if (evt.delta) onDelta(evt.delta); } catch {}
      }
    }
  }

  async function generate() {
    setLoading(true);
    setSuggestion('');
    setMockupBrief('');
    setSaved(false);
    setSaveError('');
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    try {
      await streamFrom(
        'Suggest 3 new Society of Explorers merchandise product ideas. For each give: product type (mug/poster/shirt/tote/etc), a name, a tagline (one sentence), and a price in USD. Be specific to your philosophy and era. Format as a numbered list.',
        d => setSuggestion(prev => prev + d),
        abortRef.current,
      );
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') setSuggestion('Generation failed — try again.');
    } finally {
      setLoading(false);
    }
  }

  async function generateMockup() {
    if (!suggestion || loading) return;
    setMockupLoading(true);
    setMockupBrief('');
    mockupAbortRef.current?.abort();
    mockupAbortRef.current = new AbortController();
    try {
      await streamFrom(
        `Based on these product ideas:\n\n${suggestion}\n\nWrite a visual design brief for a product mockup in the Society of Explorers aesthetic. Include: color palette (dark/gold), central symbol or imagery, typography style, background treatment, and mood. One paragraph per product. This brief will be sent to an image generation model.`,
        d => setMockupBrief(prev => prev + d),
        mockupAbortRef.current,
      );
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') setMockupBrief('Mockup generation failed.');
    } finally {
      setMockupLoading(false);
    }
  }

  async function saveToStore() {
    if (!suggestion) return;
    setSaving(true);
    setSaveError('');
    const { data, error } = await supabase.from('merch_suggestions').insert({
      thinker_id:     thinker.id,
      product_type:   'ai-generated',
      name:           (() => {
        // Skip intro lines ("Here are 3 ideas..."), find first numbered/bulleted product line
        const lines = suggestion.split('\n').map(l => l.trim()).filter(Boolean);
        const productLine = lines.find(l => /^[1-9*•\-]/.test(l)) ?? lines[0] ?? '';
        return productLine.replace(/^[0-9.\-*•\s]+/, '').replace(/[:—–].+$/, '').trim().slice(0, 120) || 'AI Suggestion';
      })(),
      tagline:        suggestion.slice(0, 200),
      price:          0,
      raw_suggestion: suggestion,
      mockup_prompt:  mockupBrief || null,
      status:         'pending',
      suggested_by:   'ai',
    }).select('id').single();
    setSaving(false);
    if (error) { setSaveError(error.message); return; }
    setSaved(true);
    setSavedId(data?.id ?? null);
  }

  const done = !loading && !!suggestion;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) { abortRef.current?.abort(); mockupAbortRef.current?.abort(); onClose(); } }}
    >
      <div style={{ width: '500px', maxWidth: '100vw', height: '100%', background: 'var(--bg-deep)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: 'Cinzel,serif', fontSize: '11px', color: 'var(--gold-dim)', letterSpacing: '0.12em' }}>AI PRODUCT GENERATOR</div>
            <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: '15px', color: 'var(--gold-light)', marginTop: '2px' }}>Let a thinker design your next product</div>
          </div>
          <button onClick={() => { abortRef.current?.abort(); mockupAbortRef.current?.abort(); onClose(); }} style={{ background: 'none', border: 'none', color: 'var(--gold-dim)', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>✕</button>
        </div>

        {/* Thinker selector */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontFamily: 'Cinzel,serif', fontSize: '9px', color: 'var(--gold-dim)', letterSpacing: '0.12em', marginBottom: '10px' }}>SELECT MIND</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {SUGGEST_THINKERS.map(t => (
              <button key={t.id} onClick={() => { setThinker(t); setSuggestion(''); setMockupBrief(''); setSaved(false); }}
                style={{ background: thinker.id === t.id ? 'var(--glow)' : 'transparent', border: `1px solid ${thinker.id === t.id ? t.accent : 'var(--border)'}`, color: thinker.id === t.id ? t.accent : 'var(--gold-dim)', fontFamily: 'Cinzel,serif', fontSize: '9px', letterSpacing: '0.08em', padding: '4px 10px', cursor: 'pointer', borderRadius: '2px' }}>
                {t.name.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Output */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {suggestion ? (
            <>
              {/* Product ideas */}
              <div>
                <div style={{ fontFamily: 'Cinzel,serif', fontSize: '9px', color: thinker.accent, letterSpacing: '0.12em', marginBottom: '8px', opacity: 0.7 }}>PRODUCT IDEAS</div>
                <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: '15px', color: 'var(--ivory)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                  {suggestion}
                  {loading && <span style={{ color: thinker.accent }}>▍</span>}
                </div>
              </div>

              {/* Mockup brief (if generated) */}
              {mockupBrief && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                  <div style={{ fontFamily: 'Cinzel,serif', fontSize: '9px', color: thinker.accent, letterSpacing: '0.12em', marginBottom: '8px', opacity: 0.7 }}>VISUAL BRIEF</div>
                  <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: '14px', color: 'var(--ivory-muted)', lineHeight: 1.7, whiteSpace: 'pre-wrap', fontStyle: 'italic' }}>
                    {mockupBrief}
                    {mockupLoading && <span style={{ color: thinker.accent }}>▍</span>}
                  </div>
                </div>
              )}

              {/* Save status */}
              {saved && (
                <div style={{ background: '#0d1a0d', border: '1px solid #4a8a4a55', borderRadius: '4px', padding: '10px 14px', fontFamily: 'Cormorant Garamond,serif', fontSize: '13px', color: '#7fc87f', fontStyle: 'italic' }}>
                  ⬡ Saved to merch_suggestions — review in REVIEW panel to approve and publish.
                </div>
              )}
              {saveError && (
                <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: '13px', color: '#e07070', fontStyle: 'italic' }}>
                  Save failed: {saveError}
                </div>
              )}

            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'Cinzel,serif', fontSize: '32px', color: thinker.accent, opacity: 0.4 }}>⬡</div>
              <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: '14px', color: 'var(--ivory-muted)', fontStyle: 'italic', lineHeight: 1.6 }}>
                {thinker.name} will propose 3 product ideas<br />drawn from their philosophy.
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Secondary actions — visible after generation */}
          {done && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                onClick={generateMockup}
                disabled={mockupLoading}
                style={{ background: 'transparent', border: `1px solid ${thinker.accent}55`, color: thinker.accent, opacity: mockupLoading ? 0.5 : 1, fontFamily: 'Cinzel,serif', fontSize: '9px', letterSpacing: '0.12em', padding: '8px 0', cursor: mockupLoading ? 'not-allowed' : 'pointer', borderRadius: '2px' }}
              >
                {mockupLoading ? 'GENERATING...' : '⬡ GENERATE MOCKUP BRIEF'}
              </button>
              <button
                onClick={saveToStore}
                disabled={saving || saved}
                style={{ background: saved ? 'var(--glow)' : 'transparent', border: `1px solid ${saved ? thinker.accent : thinker.accent + '55'}`, color: thinker.accent, opacity: saving ? 0.5 : 1, fontFamily: 'Cinzel,serif', fontSize: '9px', letterSpacing: '0.12em', padding: '8px 0', cursor: saving || saved ? 'not-allowed' : 'pointer', borderRadius: '2px' }}
              >
                {saved ? '⬡ SAVED TO STORE' : saving ? 'SAVING...' : '⬡ SAVE TO STORE'}
              </button>
            </div>
          )}

          {/* Primary generate button */}
          <button
            onClick={generate}
            disabled={loading}
            style={{ width: '100%', background: loading ? 'transparent' : `linear-gradient(135deg,#1c1500,#2a1e00)`, border: `1px solid ${thinker.accent}${loading ? '44' : '88'}`, color: thinker.accent, opacity: loading ? 0.6 : 1, fontFamily: 'Cinzel,serif', fontSize: '11px', letterSpacing: '0.15em', padding: '12px 0', cursor: loading ? 'not-allowed' : 'pointer', borderRadius: '2px' }}
          >
            {loading ? `${thinker.name.toUpperCase()} IS THINKING...` : done ? `⬡ REGENERATE` : `⬡ ASK ${thinker.name.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Review Panel ──────────────────────────────────────────────────────────────
type SuggestionStatus = 'pending' | 'approved' | 'rejected' | 'live';

interface MerchSuggestion {
  id: string;
  thinker_id: string;
  name: string;
  product_type: string | null;
  price: number;
  raw_suggestion: string | null;
  mockup_prompt: string | null;
  status: SuggestionStatus;
  printful_product_id: number | null;
  created_at: string;
}

const STATUS_FILTERS: { label: string; value: SuggestionStatus | 'all' }[] = [
  { label: 'PENDING',  value: 'pending'  },
  { label: 'APPROVED', value: 'approved' },
  { label: 'LIVE',     value: 'live'     },
  { label: 'REJECTED', value: 'rejected' },
  { label: 'ALL',      value: 'all'      },
];

const THINKER_ACCENT: Record<string, string> = {
  socrates: '#C9A84C', plato: '#7B9FD4', nietzsche: '#C0392B',
  aurelius: '#8E7CC3', einstein: '#5DADE2', jobs: '#ABEBC6',
};

function ReviewPanel({ onClose }: { onClose: () => void }) {
  const supabase = createClient();
  const [rows,        setRows]        = useState<MerchSuggestion[]>([]);
  const [filter,      setFilter]      = useState<SuggestionStatus | 'all'>('pending');
  const [loading,     setLoading]     = useState(true);
  const [expanded,    setExpanded]    = useState<string | null>(null);
  const [updating,    setUpdating]    = useState<string | null>(null);
  const [publishErr,  setPublishErr]  = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    const q = supabase
      .from('merch_suggestions')
      .select('id,thinker_id,name,product_type,price,raw_suggestion,mockup_prompt,status,printful_product_id,created_at')
      .order('created_at', { ascending: false });
    const { data, error } = filter === 'all' ? await q : await q.eq('status', filter);
    if (!error) setRows((data as MerchSuggestion[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [filter]);

  async function setStatus(id: string, status: SuggestionStatus) {
    setUpdating(id);
    await supabase.from('merch_suggestions').update({ status }).eq('id', id);
    setUpdating(null);
    setRows(prev => prev.map(r => r.id === id ? { ...r, status } : r).filter(r => filter === 'all' || r.status === filter));
  }

  async function approveAndPublish(row: MerchSuggestion) {
    setUpdating(row.id);
    setPublishErr(prev => { const n = {...prev}; delete n[row.id]; return n; });
    try {
      const res = await fetch('/api/merch/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suggestionId: row.id,
          name:         row.name,
          tagline:      row.raw_suggestion?.slice(0, 200) ?? '',
          price:        row.price || 24.99,
          thinker_id:   row.thinker_id,
          product_type: row.product_type ?? 'poster',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPublishErr(prev => ({ ...prev, [row.id]: data.error ?? 'Publish failed' }));
        // Still mark approved in Supabase even if Printful isn't ready yet
        await setStatus(row.id, 'approved');
        return;
      }
      // Success: mark live in the local list
      setRows(prev =>
        prev.map(r => r.id === row.id ? { ...r, status: 'live' as const, printful_product_id: data.printful_product_id as number } : r)
            .filter(r => filter === 'all' || r.status === filter),
      );
    } catch {
      setPublishErr(prev => ({ ...prev, [row.id]: 'Network error — check Printful config' }));
      await setStatus(row.id, 'approved');
    } finally {
      setUpdating(null);
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: '540px', maxWidth: '100vw', height: '100%', background: 'var(--bg-deep)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: 'Cinzel,serif', fontSize: '11px', color: 'var(--gold-dim)', letterSpacing: '0.12em' }}>AI ARMY — REVIEW QUEUE</div>
            <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: '15px', color: 'var(--gold-light)', marginTop: '2px' }}>Approve ideas to publish them to the store</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--gold-dim)', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>✕</button>
        </div>

        {/* Filter tabs */}
        <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '6px', flexShrink: 0 }}>
          {STATUS_FILTERS.map(f => (
            <button key={f.value} onClick={() => setFilter(f.value)}
              style={{ background: filter === f.value ? 'var(--glow)' : 'transparent', border: `1px solid ${filter === f.value ? 'var(--gold)' : 'var(--border)'}`, color: filter === f.value ? 'var(--gold)' : 'var(--gold-dim)', fontFamily: 'Cinzel,serif', fontSize: '9px', letterSpacing: '0.1em', padding: '4px 10px', cursor: 'pointer', borderRadius: '2px' }}>
              {f.label}
            </button>
          ))}
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {loading ? (
            <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: '14px', color: 'var(--ivory-muted)', fontStyle: 'italic', textAlign: 'center', paddingTop: '40px' }}>
              Loading suggestions...
            </div>
          ) : rows.length === 0 ? (
            <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: '14px', color: 'var(--ivory-muted)', fontStyle: 'italic', textAlign: 'center', paddingTop: '40px', lineHeight: 1.7 }}>
              No {filter === 'all' ? '' : filter} suggestions yet.<br />
              <span style={{ fontSize: '12px', color: 'var(--gold-dim)' }}>Generate ideas in the AI IDEAS panel first.</span>
            </div>
          ) : rows.map(row => {
            const accent = THINKER_ACCENT[row.thinker_id] ?? '#C9A84C';
            const isExpanded = expanded === row.id;
            const isUpdating = updating === row.id;
            const statusColor = row.status === 'approved' ? '#7fc87f' : row.status === 'rejected' ? '#e07070' : accent;
            return (
              <div key={row.id} style={{ background: 'var(--bg-elevated)', border: `1px solid ${accent}22`, borderRadius: '4px', overflow: 'hidden' }}>
                {/* Row header */}
                <div style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontFamily: 'Cinzel,serif', fontSize: '9px', letterSpacing: '0.1em', color: accent, border: `1px solid ${accent}44`, padding: '1px 6px', borderRadius: '2px', flexShrink: 0 }}>
                        {row.thinker_id.toUpperCase()}
                      </span>
                      <span style={{ fontFamily: 'Cinzel,serif', fontSize: '9px', letterSpacing: '0.08em', color: statusColor, opacity: 0.8 }}>
                        {row.status.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: '14px', color: 'var(--ivory)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.name}
                    </div>
                    <div style={{ fontFamily: 'Cinzel,serif', fontSize: '9px', color: 'var(--text-muted)', marginTop: '4px', letterSpacing: '0.05em' }}>
                      {new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <button
                    onClick={() => setExpanded(isExpanded ? null : row.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--gold-dim)', cursor: 'pointer', fontSize: '12px', padding: '2px 6px', flexShrink: 0 }}
                  >
                    {isExpanded ? '▲' : '▼'}
                  </button>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {row.raw_suggestion && (
                      <div style={{ background: '#0d0d0d', border: `1px solid ${accent}18`, borderRadius: '3px', padding: '10px 12px' }}>
                        <div style={{ fontFamily: 'Cinzel,serif', fontSize: '8px', color: accent, letterSpacing: '0.1em', opacity: 0.6, marginBottom: '6px' }}>FULL SUGGESTION</div>
                        <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: '13px', color: 'var(--ivory-muted)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                          {row.raw_suggestion}
                        </div>
                      </div>
                    )}
                    {row.mockup_prompt && (
                      <div style={{ background: '#0d0d0d', border: `1px solid ${accent}18`, borderRadius: '3px', padding: '10px 12px' }}>
                        <div style={{ fontFamily: 'Cinzel,serif', fontSize: '8px', color: accent, letterSpacing: '0.1em', opacity: 0.6, marginBottom: '6px' }}>VISUAL BRIEF</div>
                        <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: '13px', color: 'var(--ivory-muted)', lineHeight: 1.7, fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>
                          {row.mockup_prompt}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Publish error */}
                {publishErr[row.id] && (
                  <div style={{ padding: '8px 14px', background: '#1a0808', borderTop: `1px solid #e0707022` }}>
                    <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: '12px', color: '#e07070', fontStyle: 'italic', lineHeight: 1.5 }}>
                      Printful: {publishErr[row.id]}
                    </div>
                    <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '2px' }}>
                      Marked approved — fix variant IDs then retry.
                    </div>
                  </div>
                )}

                {/* Action bar */}
                {row.status === 'pending' && (
                  <div style={{ borderTop: `1px solid ${accent}18`, display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                    <button
                      onClick={() => approveAndPublish(row)}
                      disabled={isUpdating}
                      style={{ background: 'transparent', border: 'none', borderRight: `1px solid ${accent}18`, color: '#7fc87f', fontFamily: 'Cinzel,serif', fontSize: '9px', letterSpacing: '0.12em', padding: '10px 0', cursor: isUpdating ? 'not-allowed' : 'pointer', opacity: isUpdating ? 0.5 : 1 }}
                    >
                      {isUpdating ? 'PUBLISHING...' : '⬡ APPROVE & PUBLISH'}
                    </button>
                    <button
                      onClick={() => setStatus(row.id, 'rejected')}
                      disabled={isUpdating}
                      style={{ background: 'transparent', border: 'none', color: '#e07070', fontFamily: 'Cinzel,serif', fontSize: '9px', letterSpacing: '0.12em', padding: '10px 0', cursor: isUpdating ? 'not-allowed' : 'pointer', opacity: isUpdating ? 0.5 : 0.7 }}
                    >
                      REJECT
                    </button>
                  </div>
                )}
                {(row.status === 'approved') && (
                  <div style={{ borderTop: `1px solid ${accent}18`, display: 'flex' }}>
                    <button
                      onClick={() => setStatus(row.id, 'pending')}
                      disabled={isUpdating}
                      style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--gold-dim)', fontFamily: 'Cinzel,serif', fontSize: '9px', letterSpacing: '0.1em', padding: '10px 0', cursor: isUpdating ? 'not-allowed' : 'pointer', opacity: isUpdating ? 0.5 : 0.6 }}
                    >
                      MOVE BACK TO PENDING
                    </button>
                  </div>
                )}
                {row.status === 'live' && (
                  <div style={{ borderTop: `1px solid ${accent}18`, padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: 'Cinzel,serif', fontSize: '9px', color: '#7fc87f', letterSpacing: '0.1em' }}>
                      ⬡ LIVE IN PRINTFUL {row.printful_product_id ? `· #${row.printful_product_id}` : ''}
                    </span>
                    <a href={row.printful_product_id ? `https://www.printful.com/dashboard/products/${row.printful_product_id}` : 'https://www.printful.com/dashboard/products'} target="_blank" rel="noopener noreferrer"
                      style={{ fontFamily: 'Cinzel,serif', fontSize: '8px', color: accent, letterSpacing: '0.08em', textDecoration: 'none', opacity: 0.7 }}>
                      VIEW IN PRINTFUL ↗
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg-deep)', flexShrink: 0 }}>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', textAlign: 'center' }}>
            Approved ideas → next step: auto-create as Printful products via API
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Overlay ──────────────────────────────────────────────────────────────
export default function MerchOverlay({ onClose }: { onClose: () => void }) {
  const [checkoutProduct, setCheckoutProduct] = useState<Product | null>(null);
  const [showAISuggest,   setShowAISuggest]   = useState(false);
  const [showReview,      setShowReview]      = useState(false);

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
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setShowAISuggest(true)}
            style={{ background: 'linear-gradient(135deg,#1c1500,#2a1e00)', border: '1px solid var(--gold-dim)', color: 'var(--gold)', fontSize: '10px', fontFamily: 'Cinzel,serif', letterSpacing: '0.08em', padding: '3px 10px', cursor: 'pointer', borderRadius: '2px' }}
          >
            ⬡ AI IDEAS
          </button>
          <button
            onClick={() => setShowReview(true)}
            style={{ background: 'none', border: '1px solid var(--gold-dim)', color: 'var(--gold-dim)', fontSize: '10px', fontFamily: 'Cinzel,serif', letterSpacing: '0.08em', padding: '3px 10px', cursor: 'pointer', borderRadius: '2px' }}
          >
            REVIEW
          </button>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--gold-dim)', fontSize: '10px', fontFamily: 'Cinzel,serif', letterSpacing: '0.08em', padding: '3px 8px', cursor: 'pointer', borderRadius: '2px' }}>
            CLOSE
          </button>
        </div>
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

      {/* AI Suggest Panel */}
      {showAISuggest && (
        <AISuggestPanel onClose={() => setShowAISuggest(false)} />
      )}

      {/* Review Panel */}
      {showReview && (
        <ReviewPanel onClose={() => setShowReview(false)} />
      )}
    </div>
  );
}
