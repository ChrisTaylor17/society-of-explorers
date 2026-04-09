'use client';
import { useState, useEffect } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { getMemberSession } from '@/lib/auth/getSession';
import { useRouter } from 'next/navigation';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

const PRESETS = ['#c9a84c', '#DC143C', '#4169E1', '#2E8B57', '#7B68EE', '#A0A0A0'];

interface CustomThinker { key: string; name: string; avatar: string; color: string; mandate: string; lens: string; }

export default function CreateCommunityPage() {
  const router = useRouter();
  const [memberId, setMemberId] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [desc, setDesc] = useState('');
  const [color, setColor] = useState(gold);
  const [useDefaults, setUseDefaults] = useState(true);
  const [customThinkers, setCustomThinkers] = useState<CustomThinker[]>([]);
  const [tName, setTName] = useState('');
  const [tKey, setTKey] = useState('');
  const [tColor, setTColor] = useState(gold);
  const [tMandate, setTMandate] = useState('');
  const [tLens, setTLens] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getMemberSession().then(s => { if (s?.member) setMemberId(s.member.id); }).catch(() => {});
  }, []);

  useEffect(() => {
    setSlug(name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 50));
  }, [name]);

  function addThinker() {
    if (!tName || !tMandate || !tLens) return;
    const key = tKey || tName.toLowerCase().replace(/[^a-z0-9]/g, '');
    setCustomThinkers(prev => [...prev, { key, name: tName, avatar: tName.slice(0, 2).toUpperCase(), color: tColor, mandate: tMandate, lens: tLens }]);
    setTName(''); setTKey(''); setTMandate(''); setTLens('');
  }

  async function handleCreate() {
    if (!memberId || !name || !slug) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/communities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), slug, description: desc.trim(), primaryColor: color, theme: 'dark', memberId }),
      });
      const data = await res.json();
      if (data.community && !useDefaults && customThinkers.length >= 2) {
        for (const t of customThinkers) {
          await fetch(`/api/communities/${slug}/thinkers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ thinker_key: t.key, name: t.name, avatar: t.avatar, color: t.color, mandate: t.mandate, persona_lens: t.lens }),
          });
        }
      }
      if (data.community) router.push(`/c/${slug}`);
    } catch {}
    setSubmitting(false);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#111', border: `1px solid ${gold}22`, padding: '14px 16px',
    fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', color: parchment, outline: 'none', boxSizing: 'border-box',
  };

  if (!memberId) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
        <PublicNav />
        <div style={{ padding: '10rem 2rem', textAlign: 'center' }}>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '32px', fontWeight: 400, color: parchment, marginBottom: '1rem' }}>Sign in to create a community</h1>
          <a href="/login" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, padding: '0 28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '48px' }}>SIGN IN</a>
        </div>
        <PublicFooter />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      <section style={{ padding: '8rem 2rem 3rem', textAlign: 'center' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1rem' }}>CREATE YOUR COMMUNITY</div>
        <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 400, color: parchment, marginBottom: '0.75rem' }}>
          Build your own AI-powered council.
        </h1>
        <p style={{ fontSize: '18px', color: ivory85, maxWidth: '500px', margin: '0 auto' }}>Define your thinkers. Set your culture.</p>
      </section>

      <section style={{ padding: '0 2rem 4rem' }}>
        <div style={{ maxWidth: '560px', margin: '0 auto' }}>

          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, marginBottom: '0.5rem' }}>STEP 1: BASICS</div>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Community name" style={inputStyle} />
              <div>
                <input value={slug} onChange={e => setSlug(e.target.value)} placeholder="url-slug" style={inputStyle} />
                <span style={{ fontSize: '12px', color: muted, marginTop: '4px', display: 'block' }}>societyofexplorers.com/c/{slug || '...'}</span>
              </div>
              <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description (optional)" rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
              <div>
                <span style={{ fontSize: '13px', color: muted, marginBottom: '6px', display: 'block' }}>Primary color</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {PRESETS.map(c => (
                    <button key={c} onClick={() => setColor(c)} style={{ width: '32px', height: '32px', borderRadius: '50%', background: c, border: color === c ? '2px solid #fff' : '2px solid transparent', cursor: 'pointer' }} />
                  ))}
                </div>
              </div>
              <button onClick={() => setStep(1)} disabled={!name.trim()} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: '#0a0a0a', background: gold, border: 'none', height: '48px', cursor: 'pointer', borderRadius: 0, opacity: name.trim() ? 1 : 0.4, marginTop: '0.5rem' }}>NEXT: THINKERS</button>
            </div>
          )}

          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, marginBottom: '0.5rem' }}>STEP 2: THINKERS</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '16px', color: ivory85 }}>
                <input type="checkbox" checked={useDefaults} onChange={e => setUseDefaults(e.target.checked)} style={{ accentColor: gold }} />
                Use default Council (Socrates, Plato, Aurelius, Nietzsche, Einstein, Jobs)
              </label>

              {!useDefaults && (
                <div style={{ marginTop: '1rem' }}>
                  <div style={{ background: '#0d0d0d', border: `1px solid ${gold}15`, padding: '1.5rem', marginBottom: '1rem' }}>
                    <input value={tName} onChange={e => setTName(e.target.value)} placeholder="Thinker name" style={{ ...inputStyle, marginBottom: '8px' }} />
                    <textarea value={tMandate} onChange={e => setTMandate(e.target.value)} placeholder="Mandate: You are X — you do Y. While others..., you..." rows={3} style={{ ...inputStyle, resize: 'vertical', marginBottom: '8px' }} />
                    <textarea value={tLens} onChange={e => setTLens(e.target.value)} placeholder="Persona lens: You read facts looking for..." rows={2} style={{ ...inputStyle, resize: 'vertical', marginBottom: '8px' }} />
                    <button onClick={addThinker} disabled={!tName || !tMandate || !tLens} style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.12em', color: '#0a0a0a', background: gold, border: 'none', padding: '8px 20px', cursor: 'pointer', opacity: (!tName || !tMandate || !tLens) ? 0.4 : 1 }}>ADD THINKER</button>
                  </div>
                  {customThinkers.map((t, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#111', marginBottom: '4px', border: `1px solid ${t.color}33` }}>
                      <span style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', color: t.color }}>{t.name}</span>
                      <button onClick={() => setCustomThinkers(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer' }}>&times;</button>
                    </div>
                  ))}
                  {!useDefaults && customThinkers.length < 2 && (
                    <p style={{ fontSize: '13px', color: muted, marginTop: '0.5rem' }}>Add at least 2 thinkers to continue.</p>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', marginTop: '1rem' }}>
                <button onClick={() => setStep(0)} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', color: muted, background: 'none', border: `1px solid ${muted}44`, padding: '0 20px', height: '44px', cursor: 'pointer' }}>BACK</button>
                <button onClick={() => setStep(2)} disabled={!useDefaults && customThinkers.length < 2} style={{ flex: 1, fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: '#0a0a0a', background: gold, border: 'none', height: '44px', cursor: 'pointer', opacity: (!useDefaults && customThinkers.length < 2) ? 0.4 : 1 }}>REVIEW</button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, marginBottom: '1rem' }}>STEP 3: REVIEW</div>
              <div style={{ background: '#0d0d0d', border: `1px solid ${gold}15`, padding: '1.5rem', marginBottom: '1.5rem' }}>
                <p style={{ fontSize: '14px', color: muted, marginBottom: '4px' }}>Name</p>
                <p style={{ fontSize: '18px', color: parchment, marginBottom: '1rem' }}>{name}</p>
                <p style={{ fontSize: '14px', color: muted, marginBottom: '4px' }}>URL</p>
                <p style={{ fontSize: '15px', color: gold, marginBottom: '1rem' }}>societyofexplorers.com/c/{slug}</p>
                <p style={{ fontSize: '14px', color: muted, marginBottom: '4px' }}>Thinkers</p>
                <p style={{ fontSize: '15px', color: parchment }}>{useDefaults ? 'Default Council (6 thinkers)' : `${customThinkers.length} custom thinkers`}</p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setStep(1)} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', color: muted, background: 'none', border: `1px solid ${muted}44`, padding: '0 20px', height: '48px', cursor: 'pointer' }}>BACK</button>
                <button onClick={handleCreate} disabled={submitting} style={{ flex: 1, fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, border: 'none', height: '48px', cursor: 'pointer', opacity: submitting ? 0.5 : 1 }}>
                  {submitting ? 'CREATING...' : 'CREATE COMMUNITY'}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <section style={{ padding: '4rem 2rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '520px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, marginBottom: '1rem' }}>WHAT IS CONSILIENCE?</div>
          <p style={{ fontSize: '18px', color: ivory85, lineHeight: 1.8 }}>
            Consilience is the platform layer that powers intelligent communities. Society of Explorers is the first. Yours could be next.
          </p>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
