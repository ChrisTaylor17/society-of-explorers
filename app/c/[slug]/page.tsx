'use client';
import { useState, useEffect, use } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { getMemberSession } from '@/lib/auth/getSession';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

interface Thinker { thinker_key: string; name: string; avatar: string; color: string; }
interface Community { id: string; slug: string; name: string; description: string | null; branding: any; }

const ROLE_COLORS: Record<string, string> = { owner: '#DC143C', admin: '#7B68EE', moderator: '#4169E1', member: '#9a8f7a' };

export default function CommunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [community, setCommunity] = useState<Community | null>(null);
  const [thinkersList, setThinkersList] = useState<Thinker[]>([]);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'about' | 'thinkers' | 'governance'>('about');
  const [governance, setGovernance] = useState<any>(null);
  const [assigningRole, setAssigningRole] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    getMemberSession().then(s => { if (s?.member) setMemberId(s.member.id); }).catch(() => {});
    fetch(`/api/communities/${slug}/thinkers`).then(r => r.json()).then(d => setThinkersList(d.thinkers || [])).catch(() => {});
    fetch(`/api/communities`).then(r => r.json()).then(d => {
      const all = [...(d.mine || []), ...(d.discover || [])];
      const match = all.find((c: any) => c.slug === slug);
      if (match) setCommunity(match);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (activeTab === 'governance') {
      fetch(`/api/communities/${slug}/governance`).then(r => r.json()).then(setGovernance).catch(() => {});
    }
  }, [activeTab, slug]);

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); } }, [toast]);

  async function handleJoin() {
    if (!memberId) return;
    await fetch(`/api/communities/${slug}/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId }) });
    setJoined(true);
  }

  async function handleAssignRole(targetMemberId: string, roleKey: string) {
    if (!memberId) return;
    setAssigningRole(targetMemberId);
    const res = await fetch(`/api/communities/${slug}/governance`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorMemberId: memberId, targetMemberId, roleKey }),
    });
    const data = await res.json();
    if (data.success) {
      setToast('Role updated');
      fetch(`/api/communities/${slug}/governance`).then(r => r.json()).then(setGovernance).catch(() => {});
    } else {
      setToast(data.error || 'Failed');
    }
    setAssigningRole(null);
  }

  const accent = community?.branding?.primaryColor || gold;
  const isOwner = governance?.members?.find((m: any) => m.member_id === memberId)?.role_key === 'owner';
  const tabStyle = (t: string) => ({
    fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: activeTab === t ? accent : muted,
    background: 'none', border: 'none', borderBottom: activeTab === t ? `2px solid ${accent}` : '2px solid transparent',
    padding: '8px 16px', cursor: 'pointer',
  });

  if (loading) return <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><PublicNav /><span style={{ color: muted, fontFamily: 'Cinzel, serif', fontSize: '11px' }}>LOADING...</span></div>;

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      <section style={{ padding: '8rem 2rem 1.5rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: accent, marginBottom: '1.5rem' }}>COMMUNITY</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(32px, 6vw, 52px)', fontWeight: 400, color: parchment, marginBottom: '1rem' }}>{community?.name || slug}</h1>
          {community?.description && <p style={{ fontSize: '20px', color: ivory85, lineHeight: 1.8, maxWidth: '560px', margin: '0 auto 1.5rem' }}>{community.description}</p>}

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <a href={`/council?community=${slug}`} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: accent, padding: '0 28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '48px' }}>ENTER COUNCIL</a>
            {memberId && !joined && <button onClick={handleJoin} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: accent, background: 'transparent', border: `1px solid ${accent}`, padding: '0 28px', height: '48px', cursor: 'pointer' }}>JOIN</button>}
            {joined && <span style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', color: accent, display: 'inline-flex', alignItems: 'center', height: '48px' }}>JOINED</span>}
          </div>
        </div>
      </section>

      {/* Tabs */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', padding: '0 2rem 2rem' }}>
        <button onClick={() => setActiveTab('about')} style={tabStyle('about')}>ABOUT</button>
        <button onClick={() => setActiveTab('thinkers')} style={tabStyle('thinkers')}>THINKERS</button>
        <button onClick={() => setActiveTab('governance')} style={tabStyle('governance')}>GOVERNANCE</button>
      </div>

      {/* About Tab */}
      {activeTab === 'about' && community?.description && (
        <section style={{ padding: '0 2rem 4rem' }}>
          <div style={{ maxWidth: '640px', margin: '0 auto' }}>
            <p style={{ fontSize: '18px', color: ivory85, lineHeight: 1.8 }}>{community.description}</p>
          </div>
        </section>
      )}

      {/* Thinkers Tab */}
      {activeTab === 'thinkers' && thinkersList.length > 0 && (
        <section style={{ padding: '0 2rem 4rem' }}>
          <div style={{ maxWidth: '720px', margin: '0 auto', display: 'flex', justifyContent: 'center', gap: '16px', flexWrap: 'wrap' }}>
            {thinkersList.map(t => (
              <div key={t.thinker_key} style={{ textAlign: 'center', padding: '1rem' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: `${t.color}22`, border: `2px solid ${t.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.5rem', fontFamily: 'Cinzel, serif', fontSize: '14px', color: t.color }}>{t.avatar}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.1em', color: t.color }}>{t.name.toUpperCase()}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Governance Tab */}
      {activeTab === 'governance' && governance && (
        <section style={{ padding: '0 2rem 4rem' }}>
          <div style={{ maxWidth: '640px', margin: '0 auto' }}>
            {/* Mode badge */}
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.12em', color: governance.governance_mode === 'onchain' ? '#4CAF50' : '#FFA726', border: `1px solid ${governance.governance_mode === 'onchain' ? '#4CAF5044' : '#FFA72644'}`, padding: '4px 12px', borderRadius: '10px' }}>
                {governance.governance_mode === 'onchain' ? 'ON-CHAIN' : 'OFF-CHAIN'}
              </span>
            </div>

            {/* Role tree */}
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: accent, marginBottom: '1.5rem' }}>ROLE HIERARCHY</div>
            {governance.roles.map((role: any, i: number) => {
              const holders = governance.members.filter((m: any) => m.role_key === role.role_key);
              return (
                <div key={role.id} style={{ marginLeft: i * 20, marginBottom: '8px', background: '#0d0d0d', border: `1px solid ${ROLE_COLORS[role.role_key] || accent}22`, padding: '12px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', color: ROLE_COLORS[role.role_key] || accent }}>{role.display_name.toUpperCase()}</span>
                    <span style={{ fontSize: '12px', color: muted }}>{holders.length} holder{holders.length !== 1 ? 's' : ''} &middot; {role.permissions.length} permissions</span>
                  </div>
                </div>
              );
            })}

            {/* Members list */}
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: accent, margin: '2rem 0 1rem' }}>MEMBERS</div>
            {governance.members.map((m: any) => (
              <div key={m.member_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: `1px solid ${accent}08` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: `${ROLE_COLORS[m.role_key] || accent}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel, serif', fontSize: '9px', color: ROLE_COLORS[m.role_key] || accent }}>{(m.display_name || '?')[0].toUpperCase()}</div>
                  <span style={{ fontSize: '15px', color: parchment }}>{m.display_name}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {isOwner && m.member_id !== memberId ? (
                    <select
                      value={m.role_key}
                      onChange={e => handleAssignRole(m.member_id, e.target.value)}
                      disabled={assigningRole === m.member_id}
                      style={{ background: '#111', border: `1px solid ${accent}22`, color: parchment, fontFamily: 'Cinzel, serif', fontSize: '9px', padding: '4px 8px' }}
                    >
                      {governance.roles.map((r: any) => <option key={r.role_key} value={r.role_key}>{r.display_name}</option>)}
                    </select>
                  ) : (
                    <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.1em', color: ROLE_COLORS[m.role_key] || muted }}>{m.display_role}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', background: `${accent}22`, border: `1px solid ${accent}44`, padding: '10px 20px', borderRadius: '4px', zIndex: 500 }}>
          <span style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.1em', color: accent }}>{toast}</span>
        </div>
      )}

      <PublicFooter />
    </div>
  );
}
