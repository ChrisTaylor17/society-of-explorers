'use client';
import { useState, useEffect } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

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
  status: string;
}

const STEPS = [
  { num: 1, title: 'Propose', desc: 'Any explorer can pitch a project. AI thinkers help refine your idea, challenge your assumptions, and sharpen your pitch.' },
  { num: 2, title: 'Fund', desc: 'Members pledge capital. Smart contracts hold funds in escrow. No middlemen, no banks, no gatekeepers.' },
  { num: 3, title: 'Build', desc: 'Milestone-based releases. The community tracks progress. Thinkers serve as advisors. Full transparency on-chain.' },
  { num: 4, title: 'Return', desc: 'Profits split automatically via smart contracts. Investors see their capital working in real time. Money stays in the ecosystem.' },
];

const CARDS = [
  { title: 'Kiva Model', body: 'Micro-investment with personal connection. See exactly where your money goes. Get it back when the project succeeds.' },
  { title: 'Prediction Markets', body: 'Stake on outcomes. Skin in the game creates honest signals about which projects will actually succeed.' },
  { title: 'Living Stories', body: 'Follow founders like a show. Video updates, milestone celebrations, real-time progress. Not boring status reports — compelling narratives.' },
];

const CATEGORIES: Record<string, string> = {
  general: 'GENERAL', physical: 'PHYSICAL', technology: 'TECHNOLOGY',
  education: 'EDUCATION', art: 'ART', community: 'COMMUNITY',
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [title, setTitle] = useState('');
  const [shortDesc, setShortDesc] = useState('');
  const [desc, setDesc] = useState('');
  const [category, setCategory] = useState('general');
  const [fundingGoal, setFundingGoal] = useState('10000');
  const [pName, setPName] = useState('');
  const [pEmail, setPEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) (e.target as HTMLElement).style.opacity = '1'; });
    }, { threshold: 0.1 });
    document.querySelectorAll('[data-fade]').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      document.querySelectorAll<HTMLElement>('[data-parallax]').forEach(el => {
        el.style.backgroundAttachment = 'scroll';
      });
    }
  }, []);

  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then(d => setProjects(d.projects || []))
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !desc.trim() || !pName.trim() || !pEmail.trim()) return;
    setSubmitting(true);
    try {
      await fetch('/api/projects/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(), short_description: shortDesc.trim(), description: desc.trim(),
          category, funding_goal: fundingGoal, name: pName.trim(), email: pEmail.trim(),
        }),
      });
      setSubmitted(true);
    } catch {}
    setSubmitting(false);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#111', border: `1px solid ${gold}22`, padding: '14px 16px',
    fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', color: parchment,
    outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      {/* ═══ HERO ═══ */}
      <section
        data-parallax
        style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '8rem 2rem 6rem', position: 'relative',
          backgroundImage: 'linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url("/images/hero-council.jpeg")',
          backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed',
        }}
      >
        <div style={{ maxWidth: '720px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1.5rem' }}>PROJECTS</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(36px, 7vw, 60px)', fontWeight: 400, lineHeight: 1.15, marginBottom: '1.5rem', color: parchment }}>
            Fund what matters.<br />Build what lasts.
          </h1>
          <p style={{ fontSize: '20px', color: ivory85, lineHeight: 1.8, maxWidth: '600px', margin: '0 auto 2.5rem' }}>
            A philosophical funding platform where entrepreneurs find capital, investors find meaning, and smart contracts ensure accountability.
          </p>
          <a href="#submit" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, padding: '0 28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '48px', borderRadius: 0 }}>SUBMIT A PROJECT</a>
        </div>
      </section>

      {/* ═══ ACTIVE PROJECTS ═══ */}
      {projects.length > 0 && (
        <section data-fade style={{ padding: '6rem 2rem', background: '#0a0a0a', opacity: 0, transition: 'opacity 0.9s ease' }}>
          <div style={{ maxWidth: '960px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '0.75rem' }}>ACTIVE PROJECTS</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1px', background: `${gold}10` }}>
              {projects.map(p => {
                const pct = p.funding_goal > 0 ? Math.min((p.amount_raised / p.funding_goal) * 100, 100) : 0;
                return (
                  <div key={p.id} style={{ background: '#0d0d0d', padding: '2rem', border: `1px solid rgba(201,168,76,0.15)`, position: 'relative' }}>
                    <div style={{ position: 'absolute', top: '1rem', right: '1rem', fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.12em', color: gold, border: `1px solid ${gold}44`, padding: '3px 10px', borderRadius: '10px' }}>
                      {CATEGORIES[p.category] || p.category.toUpperCase()}
                    </div>
                    <h3 style={{ fontFamily: 'Playfair Display, serif', fontSize: '24px', fontWeight: 400, color: parchment, marginBottom: '0.75rem', paddingRight: '80px' }}>{p.title}</h3>
                    <p style={{ fontSize: '16px', color: muted, lineHeight: 1.7, marginBottom: '1.5rem' }}>{p.short_description || p.description.slice(0, 120) + '...'}</p>
                    <div style={{ height: '6px', background: '#1a1a1a', borderRadius: '3px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: gold, borderRadius: '3px', transition: 'width 0.5s ease' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: muted, marginBottom: '1.5rem' }}>
                      <span>${p.amount_raised.toLocaleString()} of ${p.funding_goal.toLocaleString()}</span>
                      <span>{p.backer_count} backer{p.backer_count !== 1 ? 's' : ''}</span>
                    </div>
                    <a href={`/projects/${p.id}`} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, padding: '0 28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '40px', borderRadius: 0 }}>VIEW PROJECT</a>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ═══ HOW IT WORKS ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: '#0d0d0d', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '0.75rem' }}>HOW IT WORKS</div>
          </div>
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: '19px', top: '8px', bottom: '8px', width: '1px', background: `${gold}22` }} />
            {STEPS.map((item, i) => (
              <div key={item.num} style={{ display: 'flex', gap: '1.5rem', marginBottom: i < STEPS.length - 1 ? '2.5rem' : '0', position: 'relative' }}>
                <div style={{ width: '40px', height: '40px', flexShrink: 0, background: '#0d0d0d', border: `1px solid ${gold}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel, serif', fontSize: '12px', color: gold, position: 'relative', zIndex: 1 }}>{item.num}</div>
                <div style={{ paddingTop: '4px' }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', color: parchment, marginBottom: '0.35rem', letterSpacing: '0.08em' }}>{item.title.toUpperCase()}</div>
                  <p style={{ fontSize: '16px', color: muted, lineHeight: 1.8 }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ SUBMIT YOUR PROJECT ═══ */}
      <section id="submit" data-fade style={{ padding: '6rem 2rem', background: '#0a0a0a', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '520px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '1rem' }}>SUBMIT YOUR PROJECT</div>
          <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 400, color: parchment, marginBottom: '2rem', lineHeight: 1.3 }}>
            Have something worth building?
          </h2>

          {submitted ? (
            <div style={{ padding: '2rem', border: `1px solid ${gold}33`, background: `${gold}08` }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.15em', color: gold, marginBottom: '0.75rem' }}>SUBMISSION RECEIVED</div>
              <p style={{ fontSize: '16px', color: ivory85, lineHeight: 1.7 }}>Your project has been submitted for review. We'll be in touch.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left' }}>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Project title" required style={inputStyle} />
              <input value={shortDesc} onChange={e => setShortDesc(e.target.value)} placeholder="One-line description" style={inputStyle} />
              <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Full description" required rows={4} style={{ ...inputStyle, resize: 'vertical' }} />
              <select value={category} onChange={e => setCategory(e.target.value)} style={{ ...inputStyle, appearance: 'auto' }}>
                <option value="general">General</option>
                <option value="physical">Physical Space</option>
                <option value="technology">Technology</option>
                <option value="education">Education</option>
                <option value="art">Art</option>
                <option value="community">Community</option>
              </select>
              <input value={fundingGoal} onChange={e => setFundingGoal(e.target.value)} placeholder="Funding goal ($)" type="number" style={inputStyle} />
              <input value={pName} onChange={e => setPName(e.target.value)} placeholder="Your name" required style={inputStyle} />
              <input value={pEmail} onChange={e => setPEmail(e.target.value)} placeholder="Your email" type="email" required style={inputStyle} />
              <button type="submit" disabled={submitting} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, border: 'none', height: '48px', cursor: 'pointer', opacity: submitting ? 0.5 : 1, borderRadius: 0 }}>
                {submitting ? 'SUBMITTING...' : 'SUBMIT PROJECT PROPOSAL'}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* ═══ INSPIRATION CARDS ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: '#0d0d0d', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1px', background: `${gold}10` }}>
            {CARDS.map(card => (
              <div key={card.title} style={{ background: '#0d0d0d', padding: '2.5rem 2rem', border: `1px solid rgba(201,168,76,0.15)` }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.15em', color: gold, marginBottom: '1rem' }}>{card.title.toUpperCase()}</div>
                <p style={{ fontSize: '16px', color: muted, lineHeight: 1.8 }}>{card.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ WHY THIS MATTERS ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: '#0a0a0a', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '680px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '2rem' }}>WHY THIS MATTERS</div>
          <p style={{ fontSize: '22px', color: parchment, lineHeight: 1.8, fontStyle: 'italic', marginBottom: '2rem' }}>
            We lost the ability to build great things together. Cathedrals took generations. The pyramids coordinated thousands. Modern bureaucracy killed that spirit.
          </p>
          <p style={{ fontSize: '20px', color: ivory85, lineHeight: 1.8, marginBottom: '2rem' }}>
            Blockchain brings it back. Instant, secure, transparent capital flows. AI coordinates the work. Philosophy ensures we build things worth building.
          </p>
          <p style={{ fontSize: '20px', color: ivory85, lineHeight: 1.8 }}>
            Society of Explorers is where the world's most ambitious people compete to fund and build meaningful things.
          </p>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: '#0d0d0d', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 400, fontStyle: 'italic', lineHeight: 1.3, color: parchment, marginBottom: '1.5rem' }}>
            The Renaissance needs builders.
          </h2>
          <p style={{ fontSize: '20px', color: ivory85, lineHeight: 1.9, marginBottom: '2.5rem' }}>
            Whether you're proposing a project or funding one, you're part of something that matters.
          </p>
          <a href="/join" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, padding: '0 28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '48px', borderRadius: 0 }}>BECOME AN EXPLORER</a>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
