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

export default function CommunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [community, setCommunity] = useState<Community | null>(null);
  const [thinkersList, setThinkersList] = useState<Thinker[]>([]);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMemberSession().then(s => { if (s?.member) setMemberId(s.member.id); }).catch(() => {});
    Promise.all([
      fetch(`/api/communities/${slug}/thinkers`).then(r => r.json()),
      fetch(`/api/communities?slug=${slug}`).then(r => r.json()),
    ]).then(([thinkersData]) => {
      setThinkersList(thinkersData.thinkers || []);
    }).catch(() => {}).finally(() => setLoading(false));

    // Get community info directly
    fetch(`/api/communities`).then(r => r.json()).then(d => {
      const all = [...(d.mine || []), ...(d.discover || [])];
      const match = all.find((c: any) => c.slug === slug);
      if (match) setCommunity(match);
    }).catch(() => {});
  }, [slug]);

  async function handleJoin() {
    if (!memberId) return;
    await fetch(`/api/communities/${slug}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId }),
    });
    setJoined(true);
  }

  const accent = community?.branding?.primaryColor || gold;

  if (loading) return <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><PublicNav /><span style={{ color: muted, fontFamily: 'Cinzel, serif', fontSize: '11px' }}>LOADING...</span></div>;

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      <section style={{ padding: '8rem 2rem 3rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: accent, marginBottom: '1.5rem' }}>COMMUNITY</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(32px, 6vw, 52px)', fontWeight: 400, color: parchment, marginBottom: '1rem' }}>
            {community?.name || slug}
          </h1>
          {community?.description && (
            <p style={{ fontSize: '20px', color: ivory85, lineHeight: 1.8, maxWidth: '560px', margin: '0 auto 2rem' }}>{community.description}</p>
          )}
        </div>
      </section>

      {thinkersList.length > 0 && (
        <section style={{ padding: '0 2rem 3rem' }}>
          <div style={{ maxWidth: '720px', margin: '0 auto' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: accent, marginBottom: '1.5rem', textAlign: 'center' }}>THE COUNCIL</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', flexWrap: 'wrap' }}>
              {thinkersList.map(t => (
                <div key={t.thinker_key} style={{ textAlign: 'center', padding: '1rem' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: `${t.color}22`, border: `2px solid ${t.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.5rem', fontFamily: 'Cinzel, serif', fontSize: '14px', color: t.color }}>{t.avatar}</div>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.1em', color: t.color }}>{t.name.toUpperCase()}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href={`/council?community=${slug}`} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: accent, padding: '0 28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '48px', borderRadius: 0 }}>ENTER COUNCIL</a>
          {memberId && !joined && (
            <button onClick={handleJoin} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: accent, background: 'transparent', border: `1px solid ${accent}`, padding: '0 28px', height: '48px', cursor: 'pointer', borderRadius: 0 }}>JOIN COMMUNITY</button>
          )}
          {joined && (
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.12em', color: accent, display: 'inline-flex', alignItems: 'center', height: '48px' }}>JOINED</span>
          )}
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
