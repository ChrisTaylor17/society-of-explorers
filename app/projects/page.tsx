'use client';
import { useState, useEffect, useRef } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import ProjectProposalForm from '@/components/projects/ProjectProposalForm';
import { PROJECT_ID_PATTERN, type PublicProject } from '@/lib/projects/publicProject';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

function readProjectList(payload: unknown): PublicProject[] {
  if (!payload || typeof payload !== 'object' || !('projects' in payload) || !Array.isArray(payload.projects)) {
    throw new Error('Invalid project list');
  }
  const ids = new Set<string>();
  return payload.projects.map((value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('Invalid project');
    const project = value as Record<string, unknown>;
    if (
      typeof project.id !== 'string' || !PROJECT_ID_PATTERN.test(project.id) || ids.has(project.id.toLowerCase()) ||
      typeof project.title !== 'string' || !project.title.trim() ||
      (project.short_description !== null && typeof project.short_description !== 'string') ||
      typeof project.description !== 'string' || typeof project.category !== 'string' || typeof project.status !== 'string' ||
      !['funding_goal', 'amount_raised', 'backer_count'].every(key => typeof project[key] === 'number' && Number.isFinite(project[key]) && project[key] >= 0) ||
      !Number.isInteger(project.backer_count)
    ) throw new Error('Invalid project');
    ids.add(project.id.toLowerCase());
    return project as PublicProject;
  });
}

const STEPS = [
  { num: 1, title: 'Propose', desc: 'Any explorer can pitch a project. AI thinkers help refine your idea, challenge your assumptions, and sharpen your pitch.' },
  { num: 2, title: 'Pledge', desc: 'Members and patrons support specific work with clear goals, plain-language use of funds, and visible progress.' },
  { num: 3, title: 'Build', desc: 'The founder posts updates, blockers, and next milestones. The community can see whether the work is becoming real.' },
  { num: 4, title: 'Invite', desc: 'Successful projects become rituals, tools, artifacts, or physical experiences that strengthen the Society.' },
];

const CARDS = [
  { title: 'Patronage Model', body: 'Support the people, spaces, and tools you want to exist. The value is participation, recognition, and the thing being built.' },
  { title: 'Honest Signals', body: 'Pledges show where community energy is real. Projects with momentum earn more attention and deeper support.' },
  { title: 'Living Stories', body: 'Follow founders through updates, milestones, blockers, and rituals. The build becomes part of the Movement narrative.' },
];

const CATEGORIES: Record<string, string> = {
  general: 'GENERAL', physical: 'PHYSICAL', technology: 'TECHNOLOGY',
  education: 'EDUCATION', art: 'ART', community: 'COMMUNITY',
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<PublicProject[]>([]);
  const [projectState, setProjectState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [projectAttempt, setProjectAttempt] = useState(0);
  const projectRequestPending = useRef(true);


  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) (e.target as HTMLElement).style.opacity = '1'; });
    }, { threshold: 0.1 });
    document.querySelectorAll('[data-fade]').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [projects]);

  useEffect(() => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      document.querySelectorAll<HTMLElement>('[data-parallax]').forEach(el => {
        el.style.backgroundAttachment = 'scroll';
      });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const fail = () => {
      if (!active) return;
      active = false;
      projectRequestPending.current = false;
      setProjects([]);
      setProjectState('error');
    };
    const timeout = window.setTimeout(() => {
      fail();
      controller.abort();
    }, 10_000);

    async function loadProjects() {
      try {
        const response = await fetch('/api/projects', { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('Project request failed');
        const nextProjects = readProjectList(await response.json());
        if (!active) return;
        active = false;
        projectRequestPending.current = false;
        setProjects(nextProjects);
        setProjectState('ready');
      } catch {
        fail();
      } finally {
        window.clearTimeout(timeout);
      }
    }
    void loadProjects();
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [projectAttempt]);

  function retryProjects() {
    if (projectRequestPending.current) return;
    projectRequestPending.current = true;
    setProjects([]);
    setProjectState('loading');
    setProjectAttempt(attempt => attempt + 1);
  }


  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      {/* ═══ HERO ═══ */}
      <section
        data-parallax
        style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '8rem 2rem 6rem', position: 'relative',
          backgroundImage: 'radial-gradient(ellipse at 25% 15%, rgba(201,168,76,0.18), transparent 55%), linear-gradient(135deg, #111 0%, #0a0a0a 70%)',
          backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed',
        }}
      >
        <div style={{ maxWidth: '720px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1.5rem' }}>PROJECTS</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(36px, 7vw, 60px)', fontWeight: 400, lineHeight: 1.15, marginBottom: '1.5rem', color: parchment }}>
            Fund what matters.<br />Build what lasts.
          </h1>
          <p style={{ fontSize: '20px', color: ivory85, lineHeight: 1.8, maxWidth: '600px', margin: '0 auto 2.5rem' }}>
            A philosophical patronage platform where entrepreneurs find support, patrons find meaning, and the community can see what is becoming real.
          </p>
          <a href="#submit" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, padding: '0 28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '48px', borderRadius: 0 }}>SUBMIT A PROJECT</a>
        </div>
      </section>

      {/* ═══ ACTIVE PROJECTS ═══ */}
        <section id="project-list" aria-labelledby="project-list-heading" style={{ padding: '6rem 2rem', background: '#0a0a0a' }}>
          <div style={{ maxWidth: '960px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
              <h2 id="project-list-heading" style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', fontWeight: 400, letterSpacing: '0.2em', color: gold, marginBottom: '0.75rem' }}>ACTIVE PROJECTS</h2>
              <p role={projectState === 'error' ? 'alert' : 'status'} style={{ color: ivory85, fontSize: '18px', lineHeight: 1.7, marginBottom: '1rem' }}>
                {projectState === 'loading' ? 'Loading projects…' : projectState === 'error' ? 'We couldn’t load the projects. Please try again.' : projects.length === 0 ? 'No active projects are listed right now.' : `${projects.length} active project${projects.length === 1 ? '' : 's'}.`}
              </p>
              <button type="button" onClick={retryProjects} disabled={projectState === 'loading'} style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', color: gold, background: 'transparent', border: `1px solid ${gold}66`, padding: '12px 20px', minHeight: '44px', cursor: projectState === 'loading' ? 'wait' : 'pointer', opacity: projectState === 'loading' ? 0.6 : 1 }}>
                {projectState === 'loading' ? 'Loading projects…' : projectState === 'error' ? 'Retry projects' : 'Refresh projects'}
              </button>
            </div>
            <div aria-busy={projectState === 'loading'} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: '1px', background: `${gold}10` }}>
              {projects.map(p => {
                const pct = p.funding_goal > 0 ? Math.min((p.amount_raised / p.funding_goal) * 100, 100) : 0;
                return (
                  <div key={p.id} style={{ background: '#0d0d0d', padding: '2rem', border: `1px solid rgba(201,168,76,0.15)`, minWidth: 0, overflowWrap: 'anywhere' }}>
                    <div style={{ display: 'inline-block', maxWidth: '100%', marginBottom: '1rem', fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.12em', color: gold, border: `1px solid ${gold}44`, padding: '3px 10px', borderRadius: '10px' }}>
                      {CATEGORIES[p.category] || p.category.toUpperCase()}
                    </div>
                    <h3 style={{ fontFamily: 'Playfair Display, serif', fontSize: '24px', fontWeight: 400, color: parchment, marginBottom: '0.75rem' }}>{p.title}</h3>
                    <p style={{ fontSize: '16px', color: muted, lineHeight: 1.7, marginBottom: '1.5rem' }}>{p.short_description || p.description.slice(0, 120) + '...'}</p>
                    <div style={{ height: '6px', background: '#1a1a1a', borderRadius: '3px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: gold, borderRadius: '3px', transition: 'width 0.5s ease' }} />
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'space-between', fontSize: '13px', color: muted, marginBottom: '1.5rem' }}>
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

          <ProjectProposalForm />
        </div>
      </section>

      {/* ═══ INSPIRATION CARDS ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: '#0d0d0d', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '1px', background: `${gold}10` }}>
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
            The Movement brings it back with clear pledges, visible milestones, AI-assisted coordination, and philosophy strong enough to ask whether each thing is worth building.
          </p>
          <p style={{ fontSize: '20px', color: ivory85, lineHeight: 1.8 }}>
            Society of Explorers is where the world&apos;s most ambitious people compete to fund and build meaningful things.
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
            Whether you&apos;re proposing a project or funding one, you&apos;re part of something that matters.
          </p>
          <a href="/join" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, padding: '0 28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '48px', borderRadius: 0 }}>BECOME AN EXPLORER</a>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
