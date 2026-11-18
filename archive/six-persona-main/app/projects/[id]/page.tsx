'use client';
import { useState, useEffect, use } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { createClient } from '@/lib/supabase/client';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

interface Project {
  id: string;
  title: string;
  short_description: string | null;
  description: string;
  category: string;
  funding_goal: number;
  amount_raised: number;
  backer_count: number;
  proposer_name: string | null;
  milestones: { title: string; description: string; status: string }[];
  created_at: string;
}

const TIERS = [
  { name: 'SUPPORTER', amount: 25 },
  { name: 'PATRON', amount: 100 },
  { name: 'FOUNDER', amount: 500 },
];

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [pledging, setPledging] = useState<typeof TIERS[0] | null>(null);
  const [pledgeEmail, setPledgeEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('success=true')) {
      setIsSuccess(true);
    }
  }, []);

  useEffect(() => {
    async function loadEmail() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) setPledgeEmail(user.email);
      } catch {}
    }
    loadEmail();
  }, []);

  useEffect(() => {
    fetch(`/api/projects/${id}`)
      .then(r => r.json())
      .then(d => { if (d.project) setProject(d.project); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) (e.target as HTMLElement).style.opacity = '1'; });
    }, { threshold: 0.1 });
    document.querySelectorAll('[data-fade]').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [project]);

  async function handlePledge(e: React.FormEvent) {
    e.preventDefault();
    if (!pledgeEmail.trim() || !pledging) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${id}/pledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: pledging.name, amount: pledging.amount, email: pledgeEmail.trim() }),
      });
      const data = await res.json();
      if (data.url) { window.location.href = data.url; return; }
    } catch {}
    setSubmitting(false);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#111', border: `1px solid ${gold}22`, padding: '14px 16px',
    fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', color: parchment,
    outline: 'none', boxSizing: 'border-box',
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <PublicNav />
        <span style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.2em', color: muted }}>LOADING...</span>
      </div>
    );
  }

  if (!project) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem' }}>
        <PublicNav />
        <span style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', color: parchment }}>Project not found</span>
        <a href="/projects" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', color: gold, textDecoration: 'none' }}>&larr; All Projects</a>
      </div>
    );
  }

  const pct = project.funding_goal > 0 ? Math.min((project.amount_raised / project.funding_goal) * 100, 100) : 0;
  const milestones = Array.isArray(project.milestones) ? project.milestones : [];

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      {/* ═══ SUCCESS BANNER ═══ */}
      {isSuccess && (
        <div style={{ position: 'fixed', top: '56px', left: 0, right: 0, zIndex: 190, padding: '16px 2rem', background: `linear-gradient(90deg, rgba(201,168,76,0.15), rgba(201,168,76,0.08))`, borderBottom: `1px solid ${gold}33`, textAlign: 'center' }}>
          <span style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.15em', color: gold }}>
            Thank you! Your pledge has been received. You're a founding backer.
          </span>
        </div>
      )}

      {/* ═══ HEADER ═══ */}
      <section style={{ padding: isSuccess ? '10rem 2rem 3rem' : '8rem 2rem 3rem', background: '#0a0a0a' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <a href="/projects" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: gold, textDecoration: 'none', display: 'inline-block', marginBottom: '2rem' }}>&larr; ALL PROJECTS</a>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.12em', color: gold, border: `1px solid ${gold}44`, padding: '3px 10px', borderRadius: '10px', display: 'inline-block', marginBottom: '1rem', marginLeft: '1rem' }}>
            {(project.category || 'general').toUpperCase()}
          </div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(32px, 6vw, 52px)', fontWeight: 400, color: parchment, lineHeight: 1.2, marginBottom: '0.5rem' }}>{project.title}</h1>
          {project.proposer_name && (
            <p style={{ fontSize: '16px', color: muted }}>Proposed by {project.proposer_name}</p>
          )}
        </div>
      </section>

      {/* ═══ CONTENT ═══ */}
      <section style={{ padding: '0 2rem 6rem' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr', gap: '3rem' }}>

          {/* FUNDING CARD (mobile first) */}
          <div data-fade style={{ background: '#0d0d0d', border: `1px solid rgba(201,168,76,0.15)`, padding: '2rem', opacity: 0, transition: 'opacity 0.9s ease', order: -1 }}>
            <div style={{ height: '10px', background: '#1a1a1a', borderRadius: '5px', overflow: 'hidden', marginBottom: '1rem' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${gold}, #d4b85a)`, borderRadius: '5px', transition: 'width 1s ease' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span style={{ fontFamily: 'Cinzel, serif', fontSize: '22px', color: parchment }}>${project.amount_raised.toLocaleString()}</span>
              <span style={{ fontFamily: 'Cinzel, serif', fontSize: '16px', color: muted }}>${project.funding_goal.toLocaleString()} goal</span>
            </div>
            <div style={{ fontSize: '14px', color: muted, marginBottom: '1.5rem' }}>
              {project.backer_count} backer{project.backer_count !== 1 ? 's' : ''}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '1.5rem' }}>
              {TIERS.map(t => (
                <button
                  key={t.name}
                  onClick={() => setPledging(t)}
                  style={{
                    fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em',
                    color: '#0a0a0a', background: gold, border: 'none', height: '44px',
                    cursor: 'pointer', borderRadius: 0, width: '100%',
                  }}
                >
                  ${t.amount} {t.name}
                </button>
              ))}
            </div>
            <div style={{ borderTop: `1px solid ${gold}15`, paddingTop: '1.25rem' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: gold, marginBottom: '0.75rem' }}>PAY WITH CRYPTO</div>
              <div style={{ fontSize: '12px', color: muted, wordBreak: 'break-all', fontFamily: 'monospace' }}>0x22fEA1dd7626f0eB50861daDC01F60f7336f135c</div>
              <div style={{ fontSize: '11px', color: muted, marginTop: '0.5rem' }}>ETH / Base / USDC</div>
            </div>
          </div>

          {/* DESCRIPTION */}
          <div data-fade style={{ opacity: 0, transition: 'opacity 0.9s ease' }}>
            <p style={{ fontSize: '20px', color: ivory85, lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>{project.description}</p>

            {milestones.length > 0 && (
              <div style={{ marginTop: '3rem' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '1.5rem' }}>MILESTONES</div>
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '3px', top: '8px', bottom: '8px', width: '1px', background: `${gold}22` }} />
                  {milestones.map((m, i) => (
                    <div key={i} style={{ display: 'flex', gap: '1.5rem', marginBottom: i < milestones.length - 1 ? '2rem' : '0', position: 'relative' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: m.status === 'complete' ? '#4CAF50' : m.status === 'in_progress' ? '#FFA726' : muted, flexShrink: 0, marginTop: '8px', position: 'relative', zIndex: 1 }} />
                      <div>
                        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '13px', color: parchment, letterSpacing: '0.08em', marginBottom: '0.25rem' }}>{m.title}</div>
                        <p style={{ fontSize: '15px', color: muted, lineHeight: 1.7 }}>{m.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ═══ PLEDGE MODAL ═══ */}
      {pledging && (
        <div onClick={() => { if (!submitting) setPledging(null); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#0d0d0d', border: `1px solid ${gold}33`, padding: '2.5rem', maxWidth: '420px', width: '100%' }}>
            <form onSubmit={handlePledge}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.15em', color: gold, marginBottom: '0.5rem' }}>{pledging.name}</div>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '24px', color: parchment, marginBottom: '1.5rem' }}>${pledging.amount} Pledge</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '1.5rem' }}>
                <input value={pledgeEmail} onChange={e => setPledgeEmail(e.target.value)} placeholder="Your email" type="email" required style={inputStyle} />
              </div>
              <p style={{ fontSize: '13px', color: muted, lineHeight: 1.6, marginBottom: '1.5rem' }}>
                You'll be redirected to Stripe for secure payment.
              </p>
              <button type="submit" disabled={submitting} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, border: 'none', height: '48px', cursor: 'pointer', borderRadius: 0, width: '100%', opacity: submitting ? 0.5 : 1 }}>
                {submitting ? 'REDIRECTING...' : 'PAY WITH CARD'}
              </button>
            </form>
          </div>
        </div>
      )}

      <PublicFooter />

      <style>{`
        @media (min-width: 768px) {
          section:nth-of-type(3) > div { grid-template-columns: 1fr 380px !important; }
          section:nth-of-type(3) > div > div:first-child { order: 1 !important; position: sticky; top: 80px; align-self: start; }
        }
      `}</style>
    </div>
  );
}
