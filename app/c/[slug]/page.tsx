'use client';
import { useState, useEffect, use } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { getMemberSession } from '@/lib/auth/getSession';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

const TEMPLATE_LABELS: Record<string, string> = {
  'depin-sensor': 'DePIN Sensor Network',
  'citizen-bio': 'Citizen Bio Lab',
  'climate-grid': 'Climate Monitoring Grid',
  'open-hardware': 'Open Hardware Collective',
  'habit-layer': 'Habit / Research Layer',
  'custom': 'Custom DAO',
};

const DATA_METHOD_LABELS: Record<string, string> = {
  sensors: 'Sensor nodes',
  mobile: 'Mobile observations',
  'field-stations': 'Field stations',
  'lab-kits': 'Lab kits',
  'web-scrape': 'Web / satellite',
  survey: 'Structured surveys',
};

const VERIFICATION_LABELS: Record<string, string> = {
  'crypto-attest': 'Cryptographic attestation',
  'geo-photo': 'Geolocation + photo',
  'peer-review': 'Peer-review',
  oracle: 'Oracle / trusted third-party',
};

interface Product {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price_rep: number;
  is_token_gated: boolean;
  created_at: string;
}

export default function CommunityDashboard({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Store state
  const [products, setProducts] = useState<Product[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [pName, setPName] = useState('');
  const [pDesc, setPDesc] = useState('');
  const [pPrice, setPPrice] = useState(100);
  const [pImage, setPImage] = useState('');
  const [pTokenGated, setPTokenGated] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Purchase state
  const [repBalance, setRepBalance] = useState(0);
  const [buying, setBuying] = useState<string | null>(null);
  const [purchaseError, setPurchaseError] = useState<{ productId: string; message: string } | null>(null);
  const [purchaseSuccess, setPurchaseSuccess] = useState<string | null>(null);

  useEffect(() => {
    getMemberSession().then(s => { if (s?.member) setMemberId(s.member.id); }).catch(() => {});

    fetch(`/api/communities/${slug}`)
      .then(r => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then(d => {
        if (d) {
          setData(d);
          if (Array.isArray(d.products)) setProducts(d.products);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  // Fetch REP balance when member is known
  useEffect(() => {
    if (!memberId) { setRepBalance(0); return; }
    fetch(`/api/store/balance?memberId=${memberId}`)
      .then(r => r.json())
      .then(d => setRepBalance(Number(d.balance) || 0))
      .catch(() => {});
  }, [memberId]);

  async function handleBuy(productId: string) {
    if (!memberId) { window.location.href = '/login'; return; }
    setBuying(productId);
    setPurchaseError(null);
    try {
      const res = await fetch('/api/store/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, memberId, communitySlug: slug }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setPurchaseError({ productId, message: json.error || 'Purchase failed' });
      } else {
        if (typeof json.newBalance === 'number') setRepBalance(json.newBalance);
        setPurchaseSuccess(productId);
        setTimeout(() => setPurchaseSuccess(prev => (prev === productId ? null : prev)), 2000);
      }
    } catch (err: any) {
      setPurchaseError({ productId, message: err?.message || 'Network error' });
    }
    setBuying(null);
  }

  async function handleCreateProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!pName.trim() || !memberId) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch(`/api/communities/${slug}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: pName.trim(),
          description: pDesc.trim(),
          image_url: pImage.trim(),
          price_rep: pPrice,
          is_token_gated: pTokenGated,
          memberId,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.product) {
        setCreateError(json.error || 'Failed to create product');
      } else {
        setProducts(prev => [json.product, ...prev]);
        setPName(''); setPDesc(''); setPPrice(100); setPImage(''); setPTokenGated(false);
        setShowCreate(false);
      }
    } catch (err: any) {
      setCreateError(err?.message || 'Network error');
    }
    setCreating(false);
  }

  function handleInvite() {
    const url = `https://www.societyofexplorers.com/c/${slug}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <PublicNav />
        <span style={{ color: muted, fontFamily: 'Cinzel, serif', fontSize: '11px' }}>LOADING...</span>
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
        <PublicNav />
        <div style={{ padding: '10rem 2rem', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1rem' }}>DAO NOT FOUND</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '28px', fontWeight: 400, color: parchment, marginBottom: '1rem' }}>This DAO does not exist.</h1>
          <a href="/explore" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: gold, border: `1px solid ${gold}`, padding: '12px 28px', textDecoration: 'none' }}>EXPLORE DAOs</a>
        </div>
        <PublicFooter />
      </div>
    );
  }

  const community = data.community;
  const gov = data.contracts?.governance?.parameters || {};
  const infra = data.contracts?.infrastructure?.parameters || {};
  const memberCount = data.memberCount || 0;
  const members = data.members || [];
  const isOwner = !!(memberId && members.some((m: any) => m.member_id === memberId && m.role === 'owner'))
    || (memberId && community.owner_member_id === memberId);

  const templateLabel = TEMPLATE_LABELS[gov.template] || gov.template || 'DAO';
  const repSymbol = gov.reputation_token?.symbol || 'REP';
  const govSymbol = gov.governance_token?.symbol || 'GOV';
  const initialTreasury = gov.initial_treasury || 0;
  const rewards = gov.rewards || { contribution: 0, participation: 0, analysis: 0 };
  const dataMethods: string[] = infra.data_methods || [];
  const verification = infra.verification_method || '';
  const hardwareNeeded = infra.hardware_needed || '';
  const dataGoal = infra.data_goal || '';
  const problem = community.mission || infra.problem_statement || '';

  const cardStyle: React.CSSProperties = {
    background: '#0d0d0d', border: `1px solid ${gold}22`, padding: '1.75rem',
  };
  const cardLabelStyle: React.CSSProperties = {
    fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, marginBottom: '1rem',
  };
  const badgeStyle: React.CSSProperties = {
    fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.12em', color: muted,
    border: `1px solid ${muted}44`, padding: '3px 8px', display: 'inline-block',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      {/* Header */}
      <section style={{ padding: '7rem 2rem 2rem' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, border: `1px solid ${gold}`, padding: '3px 10px' }}>
              {templateLabel.toUpperCase()}
            </span>
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: '#4CAF50' }}>{'\u25cf'} LIVE</span>
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: muted }}>
              {memberCount} MEMBER{memberCount !== 1 ? 'S' : ''}
            </span>
          </div>

          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(28px, 5vw, 36px)', fontWeight: 400, color: parchment, marginBottom: '0.75rem', lineHeight: 1.2 }}>
            {community.name}
          </h1>

          {community.description && (
            <p style={{ fontSize: '17px', color: ivory85, lineHeight: 1.7, marginBottom: '0.75rem' }}>
              {community.description}
            </p>
          )}

          {problem && (
            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: `1px solid ${gold}15` }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, marginBottom: '0.5rem' }}>TARGET PROBLEM</div>
              <p style={{ fontSize: '15px', color: ivory85, lineHeight: 1.6, fontStyle: 'italic', margin: 0 }}>{problem}</p>
            </div>
          )}
        </div>
      </section>

      {/* Infrastructure Card */}
      <section style={{ padding: '1rem 2rem 1rem' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          <div style={cardStyle}>
            <div style={cardLabelStyle}>PHYSICAL INFRASTRUCTURE</div>

            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: muted, marginBottom: '0.5rem' }}>DATA COLLECTION METHODS</div>
              {dataMethods.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {dataMethods.map(m => (
                    <span key={m} style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.1em', color: gold, background: `${gold}10`, border: `1px solid ${gold}33`, padding: '4px 10px' }}>
                      {(DATA_METHOD_LABELS[m] || m).toUpperCase()}
                    </span>
                  ))}
                </div>
              ) : (
                <span style={{ fontSize: '14px', color: muted, fontStyle: 'italic' }}>Not yet configured</span>
              )}
            </div>

            <div style={{ marginBottom: hardwareNeeded || dataGoal ? '1.25rem' : 0 }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: muted, marginBottom: '0.5rem' }}>VERIFICATION METHOD</div>
              <p style={{ fontSize: '15px', color: parchment, margin: 0 }}>
                {verification ? (VERIFICATION_LABELS[verification] || verification) : <span style={{ color: muted, fontStyle: 'italic' }}>Not yet configured</span>}
              </p>
            </div>

            {hardwareNeeded && (
              <div style={{ marginBottom: dataGoal ? '1.25rem' : 0 }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: muted, marginBottom: '0.5rem' }}>HARDWARE SPEC</div>
                <p style={{ fontSize: '14px', color: ivory85, lineHeight: 1.6, margin: 0 }}>{hardwareNeeded}</p>
              </div>
            )}

            {dataGoal && (
              <div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: muted, marginBottom: '0.5rem' }}>TARGET DATASET / OUTCOME</div>
                <p style={{ fontSize: '14px', color: ivory85, lineHeight: 1.6, margin: 0 }}>{dataGoal}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Tokens & Rewards Card */}
      <section style={{ padding: '1rem 2rem 1rem' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          <div style={cardStyle}>
            <div style={cardLabelStyle}>TOKENS &amp; INCENTIVES</div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginBottom: '1.25rem' }}>
              <div style={{ background: '#111', border: `1px solid ${gold}15`, padding: '1rem' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: muted, marginBottom: '0.5rem' }}>REPUTATION TOKEN</div>
                <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '22px', color: gold, marginBottom: '0.5rem' }}>${repSymbol}</div>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  <span style={badgeStyle}>SOULBOUND</span>
                  <span style={badgeStyle}>NON-TRANSFERABLE</span>
                </div>
              </div>
              <div style={{ background: '#111', border: `1px solid ${gold}15`, padding: '1rem' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: muted, marginBottom: '0.5rem' }}>GOVERNANCE TOKEN</div>
                <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '22px', color: gold, marginBottom: '0.5rem' }}>${govSymbol}</div>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  <span style={badgeStyle}>VOTING</span>
                  <span style={badgeStyle}>TREASURY</span>
                </div>
              </div>
            </div>

            <div style={{ padding: '12px 14px', background: '#111', border: `1px solid ${gold}15`, marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: muted }}>INITIAL TREASURY</span>
                <span style={{ fontFamily: 'Playfair Display, serif', fontSize: '18px', color: parchment }}>
                  {initialTreasury.toLocaleString()} <span style={{ fontSize: '12px', color: gold }}>${repSymbol}</span>
                </span>
              </div>
            </div>

            <div>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: muted, marginBottom: '0.5rem' }}>REWARD RULES</div>
              {[
                { label: 'Per verified data contribution', value: rewards.contribution },
                { label: 'Per experiment participation', value: rewards.participation },
                { label: 'Per analysis / publication', value: rewards.analysis },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${gold}08` }}>
                  <span style={{ fontSize: '14px', color: ivory85 }}>{r.label}</span>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', color: gold }}>{r.value || 0} ${repSymbol}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* STORE */}
      <section id="store" style={{ padding: '1rem 2rem 1rem', scrollMarginTop: '80px' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={cardLabelStyle}>STORE</div>
              {isOwner && !showCreate && (
                <button onClick={() => { setShowCreate(true); setCreateError(null); }} style={{
                  fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: gold,
                  background: 'transparent', border: `1px solid ${gold}`, padding: '8px 16px', cursor: 'pointer',
                }}>+ CREATE PRODUCT</button>
              )}
            </div>

            {/* Create product form (owner only) */}
            {isOwner && showCreate && (
              <form onSubmit={handleCreateProduct} style={{ marginBottom: '1.5rem', padding: '1.25rem', background: '#111', border: `1px solid ${gold}33`, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, marginBottom: '0.25rem' }}>NEW PRODUCT</div>
                <input value={pName} onChange={e => setPName(e.target.value)} placeholder="Product name" required
                  style={{ background: '#0a0a0a', border: `1px solid ${gold}22`, padding: '12px 14px', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: parchment, outline: 'none', boxSizing: 'border-box' }} />
                <textarea value={pDesc} onChange={e => setPDesc(e.target.value)} placeholder="Description" rows={2}
                  style={{ background: '#0a0a0a', border: `1px solid ${gold}22`, padding: '12px 14px', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: parchment, outline: 'none', boxSizing: 'border-box', resize: 'none' }} />
                <input value={pImage} onChange={e => setPImage(e.target.value)} placeholder="Image URL (optional)"
                  style={{ background: '#0a0a0a', border: `1px solid ${gold}22`, padding: '12px 14px', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: parchment, outline: 'none', boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: muted }}>PRICE</span>
                  <input type="number" value={pPrice} onChange={e => setPPrice(parseInt(e.target.value) || 0)} min={0}
                    style={{ flex: 1, background: '#0a0a0a', border: `1px solid ${gold}22`, padding: '10px 14px', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: parchment, outline: 'none', boxSizing: 'border-box' }} />
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', color: gold, minWidth: '36px' }}>${repSymbol}</span>
                </div>
                {/* Token-gated toggle */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 2px' }}>
                  <div>
                    <div style={{ fontSize: '14px', color: parchment }}>Token-gated drop</div>
                    <div style={{ fontSize: '12px', color: muted }}>Only members holding ${repSymbol} can purchase.</div>
                  </div>
                  <button type="button" onClick={() => setPTokenGated(!pTokenGated)} style={{
                    width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                    background: pTokenGated ? gold : '#333', position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                  }}>
                    <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '3px', left: pTokenGated ? '23px' : '3px', transition: 'left 0.2s' }} />
                  </button>
                </div>
                {createError && (
                  <div style={{ fontSize: '12px', color: '#DC143C', padding: '6px 0' }}>{createError}</div>
                )}
                <div style={{ display: 'flex', gap: '8px', marginTop: '0.25rem' }}>
                  <button type="submit" disabled={creating} style={{ flex: 1, fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: '#0a0a0a', background: gold, border: 'none', height: '40px', cursor: 'pointer', opacity: creating ? 0.5 : 1 }}>{creating ? 'SAVING...' : 'SAVE PRODUCT'}</button>
                  <button type="button" onClick={() => { setShowCreate(false); setCreateError(null); }} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.1em', color: muted, background: 'none', border: `1px solid ${muted}44`, padding: '0 16px', height: '40px', cursor: 'pointer' }}>CANCEL</button>
                </div>
              </form>
            )}

            {/* Token-gated drop teaser */}
            <div style={{
              padding: '1rem 1.25rem', marginBottom: '1.5rem',
              background: `linear-gradient(135deg, ${gold}10, transparent)`,
              border: `1px solid ${gold}33`, borderLeft: `3px solid ${gold}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, marginBottom: '4px' }}>MEMBERS-ONLY DROPS</div>
                  <div style={{ fontSize: '15px', color: parchment, marginBottom: '2px' }}>Unlock with reputation.</div>
                  <div style={{ fontSize: '12px', color: muted }}>Token-gated drops will require ${repSymbol} balance to purchase.</div>
                </div>
                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: muted, border: `1px solid ${muted}44`, padding: '4px 10px' }}>COMING SOON</span>
              </div>
            </div>

            {/* Balance display */}
            {memberId && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', marginBottom: '12px', background: `${gold}08`, border: `1px solid ${gold}22` }}>
                <div>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: muted }}>YOUR BALANCE</div>
                  <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '20px', color: gold, lineHeight: 1.1, marginTop: '2px' }}>
                    {repBalance.toLocaleString()} <span style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', color: muted }}>${repSymbol}</span>
                  </div>
                </div>
                {repBalance === 0 && (
                  <div style={{ fontSize: '12px', color: muted, textAlign: 'right', maxWidth: '220px' }}>
                    Earn ${repSymbol} through Daily Practice and Salons.
                  </div>
                )}
              </div>
            )}

            {/* Product grid */}
            {products.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.5rem 1rem', border: `1px dashed ${gold}22` }}>
                <p style={{ fontSize: '15px', color: parchment, fontStyle: 'italic', margin: 0, marginBottom: '0.25rem' }}>
                  No products yet.
                </p>
                {isOwner && (
                  <p style={{ fontSize: '13px', color: muted, margin: 0 }}>
                    Create your first product to start building your DAO&apos;s storefront.
                  </p>
                )}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                {products.map(p => {
                  const price = Number(p.price_rep) || 0;
                  const affordable = repBalance >= price;
                  const gatedBlocked = p.is_token_gated && !affordable;
                  const isBuying = buying === p.id;
                  const showSuccess = purchaseSuccess === p.id;
                  const errForProduct = purchaseError?.productId === p.id ? purchaseError.message : null;

                  let buyLabel = 'BUY';
                  let buyDisabled = false;
                  let buyBg: string = gold;
                  let buyColor = '#0a0a0a';
                  let buyCursor: 'pointer' | 'not-allowed' = 'pointer';
                  let buyOpacity = 1;

                  if (!memberId) {
                    buyLabel = 'SIGN IN TO BUY';
                    buyBg = 'transparent';
                    buyColor = gold;
                  } else if (gatedBlocked) {
                    buyLabel = `REQUIRES ${price.toLocaleString()} $${repSymbol}`;
                    buyDisabled = true;
                    buyBg = 'transparent';
                    buyColor = muted;
                    buyCursor = 'not-allowed';
                    buyOpacity = 0.7;
                  } else if (!affordable) {
                    buyLabel = `INSUFFICIENT $${repSymbol}`;
                    buyDisabled = true;
                    buyBg = 'transparent';
                    buyColor = muted;
                    buyCursor = 'not-allowed';
                    buyOpacity = 0.7;
                  } else if (isBuying) {
                    buyLabel = 'BUYING...';
                    buyDisabled = true;
                    buyOpacity = 0.6;
                  } else if (showSuccess) {
                    buyLabel = 'PURCHASED';
                    buyDisabled = true;
                    buyBg = '#4CAF50';
                    buyColor = '#0a0a0a';
                  }

                  return (
                    <div key={p.id} style={{ background: '#111', border: `1px solid ${showSuccess ? '#4CAF50' : `${gold}15`}`, display: 'flex', flexDirection: 'column', transition: 'border-color 0.3s' }}>
                      <div style={{
                        width: '100%', aspectRatio: '1 / 1', background: '#1a1a1a',
                        backgroundImage: p.image_url ? `url(${p.image_url})` : undefined,
                        backgroundSize: 'cover', backgroundPosition: 'center',
                        borderBottom: `1px solid ${gold}10`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        position: 'relative',
                      }}>
                        {!p.image_url && <span style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: `${muted}88` }}>NO IMAGE</span>}
                        {p.is_token_gated && (
                          <span style={{ position: 'absolute', top: 6, right: 6, fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.15em', color: gold, background: 'rgba(10,10,10,0.85)', border: `1px solid ${gold}66`, padding: '2px 6px' }}>GATED</span>
                        )}
                      </div>
                      <div style={{ padding: '0.875rem 1rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.08em', color: parchment, marginBottom: '4px' }}>{p.name}</div>
                        {p.description && <p style={{ fontSize: '12px', color: muted, lineHeight: 1.4, margin: 0, marginBottom: '0.5rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.description}</p>}
                        <div style={{ marginTop: 'auto', paddingTop: '0.5rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
                            <span style={{ fontFamily: 'Playfair Display, serif', fontSize: '18px', color: gold }}>{price.toLocaleString()}</span>
                            <span style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', color: muted }}>${repSymbol}</span>
                          </div>
                          {!memberId ? (
                            <a href="/login" style={{
                              display: 'block', textAlign: 'center', textDecoration: 'none',
                              width: '100%', fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em',
                              color: gold, background: 'transparent', border: `1px solid ${gold}`,
                              padding: '8px', boxSizing: 'border-box',
                            }}>SIGN IN TO BUY</a>
                          ) : (
                            <button
                              onClick={() => !buyDisabled && handleBuy(p.id)}
                              disabled={buyDisabled}
                              style={{
                                width: '100%', fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em',
                                color: buyColor, background: buyBg,
                                border: buyBg === 'transparent' ? `1px solid ${buyColor}66` : 'none',
                                padding: '8px', cursor: buyCursor, opacity: buyOpacity,
                                transition: 'background 0.2s, color 0.2s',
                              }}
                            >{buyLabel}</button>
                          )}
                          {errForProduct && (
                            <div style={{ fontSize: '11px', color: '#DC143C', marginTop: '4px', lineHeight: 1.3 }}>{errForProduct}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Activity Feed */}
      <section style={{ padding: '1rem 2rem 1rem' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          <div style={cardStyle}>
            <div style={cardLabelStyle}>ACTIVITY FEED</div>
            <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
              <p style={{ fontSize: '15px', color: parchment, fontStyle: 'italic', margin: 0, marginBottom: '0.5rem' }}>
                No activity yet.
              </p>
              <p style={{ fontSize: '13px', color: muted, margin: 0 }}>
                Invite members to get started.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Members */}
      <section style={{ padding: '1rem 2rem 1rem' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          <div style={cardStyle}>
            <div style={cardLabelStyle}>MEMBERS</div>
            {members.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                <p style={{ fontSize: '15px', color: parchment, fontStyle: 'italic', margin: 0 }}>You&apos;re the first member.</p>
                <div style={{ marginTop: '0.75rem' }}>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, border: `1px solid ${gold}`, padding: '3px 10px' }}>FOUNDER</span>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {members.map((m: any) => (
                  <div key={m.member_id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: `1px solid ${gold}08` }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: `${gold}18`, border: `1px solid ${gold}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel, serif', fontSize: '10px', color: gold }}>
                      {(m.display_name || '?')[0].toUpperCase()}
                    </div>
                    <span style={{ flex: 1, fontSize: '15px', color: parchment }}>{m.display_name}</span>
                    <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.12em', color: m.role === 'owner' ? gold : muted }}>
                      {(m.role || 'member').toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Invite CTA */}
      <section style={{ padding: '2rem 2rem 5rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '480px', margin: '0 auto' }}>
          <div style={{ width: '60px', height: '1px', background: `${gold}4d`, margin: '0 auto 1.5rem' }} />
          <p style={{ fontSize: '14px', color: muted, marginBottom: '1rem' }}>Invite collaborators to contribute data and run experiments.</p>
          <button onClick={handleInvite}
            style={{
              fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em',
              color: '#0a0a0a', background: gold, border: 'none', padding: '0 32px',
              height: '52px', cursor: 'pointer', transition: 'opacity 0.2s',
            }}>
            {copied ? 'COPIED!' : 'INVITE MEMBERS'}
          </button>
          <p style={{ fontSize: '11px', color: `${muted}88`, marginTop: '0.75rem', fontFamily: 'Cinzel, serif', letterSpacing: '0.1em' }}>
            SOCIETYOFEXPLORERS.COM/C/{slug.toUpperCase()}
          </p>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
