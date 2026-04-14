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
  description: string;
  price: number;
  tokenSymbol: string;
  imageUrl: string;
  createdAt: string;
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
  const [pToken, setPToken] = useState<'REP' | 'GOV'>('REP');
  const [pImage, setPImage] = useState('');

  useEffect(() => {
    getMemberSession().then(s => { if (s?.member) setMemberId(s.member.id); }).catch(() => {});

    fetch(`/api/communities/${slug}`)
      .then(r => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then(d => { if (d) setData(d); })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));

    // Load products from localStorage (UI prototype — no DB schema yet)
    try {
      const stored = localStorage.getItem(`soe_dao_products_${slug}`);
      if (stored) setProducts(JSON.parse(stored));
    } catch {}
  }, [slug]);

  function saveProducts(next: Product[]) {
    setProducts(next);
    try { localStorage.setItem(`soe_dao_products_${slug}`, JSON.stringify(next)); } catch {}
  }

  function handleCreateProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!pName.trim()) return;
    const newProduct: Product = {
      id: `p_${Date.now()}`,
      name: pName.trim(),
      description: pDesc.trim(),
      price: pPrice,
      tokenSymbol: pToken,
      imageUrl: pImage.trim(),
      createdAt: new Date().toISOString(),
    };
    saveProducts([...products, newProduct]);
    setPName(''); setPDesc(''); setPPrice(100); setPToken('REP'); setPImage('');
    setShowCreate(false);
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
                <button onClick={() => setShowCreate(true)} style={{
                  fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: gold,
                  background: 'transparent', border: `1px solid ${gold}`, padding: '8px 16px', cursor: 'pointer',
                }}>+ CREATE PRODUCT</button>
              )}
            </div>

            {/* Create product form */}
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
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {(['REP', 'GOV'] as const).map(t => (
                      <button key={t} type="button" onClick={() => setPToken(t)} style={{
                        fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.1em',
                        color: pToken === t ? '#0a0a0a' : gold,
                        background: pToken === t ? gold : 'transparent',
                        border: `1px solid ${gold}44`, padding: '8px 12px', cursor: 'pointer',
                      }}>${t}</button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '0.25rem' }}>
                  <button type="submit" style={{ flex: 1, fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: '#0a0a0a', background: gold, border: 'none', height: '40px', cursor: 'pointer' }}>SAVE PRODUCT</button>
                  <button type="button" onClick={() => setShowCreate(false)} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.1em', color: muted, background: 'none', border: `1px solid ${muted}44`, padding: '0 16px', height: '40px', cursor: 'pointer' }}>CANCEL</button>
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
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, marginBottom: '4px' }}>MEMBERS-ONLY DROP</div>
                  <div style={{ fontSize: '15px', color: parchment, marginBottom: '2px' }}>Unlock with reputation.</div>
                  <div style={{ fontSize: '12px', color: muted }}>Token-gated drops require ${repSymbol} balance to purchase.</div>
                </div>
                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: muted, border: `1px solid ${muted}44`, padding: '4px 10px' }}>COMING SOON</span>
              </div>
            </div>

            {/* Product grid */}
            {products.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.5rem 1rem', border: `1px dashed ${gold}22` }}>
                <p style={{ fontSize: '15px', color: parchment, fontStyle: 'italic', margin: 0, marginBottom: '0.25rem' }}>
                  No products yet.
                </p>
                <p style={{ fontSize: '13px', color: muted, margin: 0 }}>
                  {isOwner ? 'Create your first product to start building your DAO\u2019s storefront.' : 'The DAO owner hasn\u2019t added products yet.'}
                </p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                {products.map(p => (
                  <div key={p.id} style={{ background: '#111', border: `1px solid ${gold}15`, display: 'flex', flexDirection: 'column' }}>
                    <div style={{
                      width: '100%', aspectRatio: '1 / 1', background: '#0a0a0a',
                      backgroundImage: p.imageUrl ? `url(${p.imageUrl})` : undefined,
                      backgroundSize: 'cover', backgroundPosition: 'center',
                      borderBottom: `1px solid ${gold}10`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {!p.imageUrl && <span style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: `${muted}88` }}>NO IMAGE</span>}
                    </div>
                    <div style={{ padding: '0.875rem 1rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
                      <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.08em', color: parchment, marginBottom: '4px' }}>{p.name}</div>
                      {p.description && <p style={{ fontSize: '12px', color: muted, lineHeight: 1.4, margin: 0, marginBottom: '0.5rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.description}</p>}
                      <div style={{ marginTop: 'auto', paddingTop: '0.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
                          <span style={{ fontFamily: 'Playfair Display, serif', fontSize: '18px', color: gold }}>{p.price.toLocaleString()}</span>
                          <span style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', color: muted }}>${p.tokenSymbol}</span>
                        </div>
                        <button disabled style={{
                          width: '100%', fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em',
                          color: gold, background: 'transparent', border: `1px solid ${gold}33`,
                          padding: '8px', cursor: 'not-allowed', opacity: 0.7,
                        }}>BUY WITH TOKENS</button>
                        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.12em', color: `${muted}88`, textAlign: 'center', marginTop: '4px' }}>COMING SOON \u00b7 PHYSICAL FULFILLMENT</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Quick Actions */}
      <section style={{ padding: '1rem 2rem 1rem' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, marginBottom: '1rem' }}>QUICK ACTIONS</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
            {[
              { label: 'Log Data Contribution', note: 'coming soon' },
              { label: 'Join Experiment', note: 'coming soon' },
              { label: 'View Open Dataset', note: 'coming soon' },
              { label: 'Governance Vote', note: 'coming soon' },
            ].map(a => (
              <button key={a.label} disabled
                style={{
                  background: '#0d0d0d', border: `1px solid ${gold}15`, padding: '1rem',
                  cursor: 'not-allowed', textAlign: 'left', opacity: 0.6,
                }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.12em', color: parchment, marginBottom: '4px' }}>
                  {a.label.toUpperCase()}
                </div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.15em', color: muted }}>{a.note.toUpperCase()}</div>
              </button>
            ))}
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
