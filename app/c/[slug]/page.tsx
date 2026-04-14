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

export default function CommunityDashboard({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
  }, [slug]);

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
