'use client';
import { useState, useEffect, useCallback } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { getMemberSession } from '@/lib/auth/getSession';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

const GUIDES = [
  { id: 'socrates', name: 'Socrates', avatar: 'SO', color: '#C9A94E', step: 0 },
  { id: 'plato', name: 'Plato', avatar: 'PL', color: '#7B68EE', step: 1 },
  { id: 'nietzsche', name: 'Nietzsche', avatar: 'FN', color: '#DC143C', step: 2 },
  { id: 'aurelius', name: 'Aurelius', avatar: 'MA', color: '#8B7355', step: 3 },
  { id: 'einstein', name: 'Einstein', avatar: 'AE', color: '#4169E1', step: 4 },
];

const STEP_LABELS = ['VISION', 'PHILOSOPHY', 'QUESTIONNAIRE', 'GOVERNANCE', 'LAUNCH'];
const ORIENTATIONS = ['stoic', 'existentialist', 'pragmatist', 'phenomenological', 'eastern', 'eclectic'];
const GOVERNANCE_TYPES = [
  { id: 'dao', label: 'DAO', desc: 'Democratic — members vote on decisions' },
  { id: 'benevolent', label: 'Benevolent Leader', desc: 'You make decisions, members advise' },
  { id: 'council', label: 'Council of Elders', desc: 'Small elected council governs' },
];

export default function CreateCommunityPage() {
  const router = useRouter();
  const [memberId, setMemberId] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  // Step 1: Vision
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [mission, setMission] = useState('');

  // Step 2: Philosophy
  const [orientation, setOrientation] = useState('eclectic');
  const [customOrientation, setCustomOrientation] = useState('');

  // Step 3: Questionnaire
  const [questions, setQuestions] = useState<any[]>([]);
  const [generatingQs, setGeneratingQs] = useState(false);

  // Step 4: Governance
  const [govType, setGovType] = useState('dao');
  const [votingThreshold, setVotingThreshold] = useState(51);
  const [membershipType, setMembershipType] = useState('free');

  // Thinker guidance
  const [guidance, setGuidance] = useState('');
  const [guidanceLoading, setGuidanceLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      const session = await getMemberSession();
      if (session?.member) setMemberId(session.member.id);
      const supabase = createClient();
      const { data: { session: auth } } = await supabase.auth.getSession();
      if (auth?.access_token) setAuthToken(auth.access_token);
    }
    load().catch(() => {});
  }, []);

  useEffect(() => {
    setSlug(name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 50));
  }, [name]);

  const askThinker = useCallback(async (thinkerId: string, prompt: string) => {
    setGuidanceLoading(true);
    setGuidance('');
    try {
      const res = await fetch('/api/thinker', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          thinkerId, message: prompt, memberId, isCouncilMode: true,
          salonId: 'community-architect',
        }),
      });
      if (!res.ok) { setGuidance(''); setGuidanceLoading(false); return; }
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let text = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value, { stream: true }).split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.delta) { text += evt.delta; setGuidance(text); }
            if (evt.done && evt.response) { text = evt.response.split('|||ACTIONS|||')[0].trim(); setGuidance(text); }
          } catch {}
        }
      }
    } catch {}
    setGuidanceLoading(false);
  }, [authToken, memberId]);

  // Trigger thinker guidance on step change
  useEffect(() => {
    const guide = GUIDES[step];
    if (!guide) return;
    const prompts: Record<number, string> = {
      0: `I'm creating a new intellectual community${name ? ` called "${name}"` : ''}. ${mission ? `Our mission: "${mission}".` : ''} As Socrates, ask me ONE probing question about why this community needs to exist. Be direct.`,
      1: `This community${name ? ` "${name}"` : ''} has orientation: ${orientation}. As Plato, help articulate the intellectual framework in 2-3 sentences. What Form does this community aspire toward?`,
      2: `Create 7 philosophical matching questions for a ${orientation} community${name ? ` called "${name}"` : ''}. Each question should reveal genuine philosophical differences, not personality traits. Format: numbered list, each with the philosophical axis it measures (epistemology/ethics/metaphysics/aesthetics/politics). Be provocative.`,
      3: `This community uses ${GOVERNANCE_TYPES.find(g => g.id === govType)?.label} governance with ${votingThreshold}% voting threshold. As Aurelius, give stoic counsel on whether this governance design will serve the community well. 2-3 sentences.`,
      4: `Summarize this community: "${name}" — ${mission}. ${orientation} orientation, ${govType} governance, ${questions.length} matching questions. As Einstein, describe its intellectual architecture elegantly in 2-3 sentences.`,
    };
    if (prompts[step]) askThinker(guide.id, prompts[step]);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  async function generateQuestions() {
    setGeneratingQs(true);
    await askThinker('nietzsche', `Create exactly 7 philosophical matching questions for a ${orientation} community called "${name}". Mission: "${mission}". Each question should be rated 1-7 by the respondent. Format as a JSON array: [{"id":"q1","text":"question text","philosophical_axis":"epistemology|ethics|metaphysics|aesthetics|politics","type":"scale"}]. Return ONLY the JSON array.`);
    // Try to parse questions from guidance
    try {
      const match = guidance.match(/\[[\s\S]*\]/);
      if (match) setQuestions(JSON.parse(match[0]));
    } catch {}
    setGeneratingQs(false);
  }

  // Parse questions from guidance when it changes (for step 2)
  useEffect(() => {
    if (step === 2 && guidance) {
      try {
        const match = guidance.match(/\[[\s\S]*\]/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].text) setQuestions(parsed);
        }
      } catch {}
    }
  }, [guidance, step]);

  async function handleCreate() {
    if (!memberId || !name || !slug) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/communities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(), slug, description: mission.trim(),
          primaryColor: gold, theme: 'dark', memberId,
        }),
      });
      const data = await res.json();
      if (data.community) {
        // Save extended fields
        const supabase = createClient();
        await (supabase as any).from('communities').update({
          philosophy_orientation: orientation === 'eclectic' && customOrientation ? customOrientation : orientation,
          governance_type: govType, voting_threshold: votingThreshold / 100,
          mission: mission.trim(),
        }).eq('id', data.community.id);

        // Save questionnaire
        if (questions.length > 0) {
          await (supabase as any).from('community_questionnaire').upsert({
            community_id: data.community.id, questions,
          }, { onConflict: 'community_id' });
        }

        // Save governance contract (draft)
        await (supabase as any).from('community_contracts').insert({
          community_id: data.community.id, contract_type: 'governance',
          parameters: { governance_type: govType, voting_threshold: votingThreshold, membership_type: membershipType },
        });

        router.push(`/c/${slug}`);
      }
    } catch {}
    setSubmitting(false);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#111', border: `1px solid ${gold}22`, padding: '14px 16px',
    fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', color: parchment, outline: 'none', boxSizing: 'border-box',
  };

  const guide = GUIDES[step];

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

      {/* Progress bar */}
      <div style={{ position: 'fixed', top: '56px', left: 0, right: 0, zIndex: 190, background: '#0a0a0a', padding: '8px 2rem', borderBottom: `1px solid ${gold}11` }}>
        <div style={{ maxWidth: '560px', margin: '0 auto', display: 'flex', gap: '4px' }}>
          {STEP_LABELS.map((label, i) => (
            <div key={label} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ height: '3px', background: i <= step ? gold : '#1a1a1a', borderRadius: '2px', marginBottom: '4px' }} />
              <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: i <= step ? gold : muted }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      <section style={{ padding: '7rem 2rem 2rem', textAlign: 'center' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1rem' }}>CREATE YOUR COMMUNITY</div>
      </section>

      <section style={{ padding: '0 2rem 2rem' }}>
        <div style={{ maxWidth: '560px', margin: '0 auto' }}>

          {/* Thinker guidance */}
          {guide && (
            <div style={{ display: 'flex', gap: '12px', marginBottom: '2rem', padding: '1.25rem', background: '#0d0d0d', border: `1px solid ${guide.color}22` }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: `${guide.color}22`, border: `2px solid ${guide.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel, serif', fontSize: '11px', color: guide.color, flexShrink: 0 }}>{guide.avatar}</div>
              <div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.1em', color: guide.color, marginBottom: '4px' }}>{guide.name.toUpperCase()} GUIDES THIS STEP</div>
                <p style={{ fontSize: '15px', color: ivory85, lineHeight: 1.7, margin: 0 }}>
                  {guidanceLoading && !guidance ? '...' : guidance || 'Thinking...'}
                </p>
              </div>
            </div>
          )}

          {/* STEP 0: Vision */}
          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Community name" style={inputStyle} />
              <div><input value={slug} onChange={e => setSlug(e.target.value)} placeholder="url-slug" style={inputStyle} /><span style={{ fontSize: '12px', color: muted }}>societyofexplorers.com/c/{slug || '...'}</span></div>
              <textarea value={mission} onChange={e => setMission(e.target.value)} placeholder="One-sentence mission" rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
              <button onClick={() => setStep(1)} disabled={!name.trim()} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: '#0a0a0a', background: gold, border: 'none', height: '48px', cursor: 'pointer', opacity: name.trim() ? 1 : 0.4 }}>NEXT: PHILOSOPHY</button>
            </div>
          )}

          {/* STEP 1: Philosophy */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold }}>PHILOSOPHICAL ORIENTATION</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {ORIENTATIONS.map(o => (
                  <button key={o} onClick={() => setOrientation(o)} style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.1em', color: orientation === o ? '#0a0a0a' : gold, background: orientation === o ? gold : 'transparent', border: `1px solid ${gold}${orientation === o ? '' : '44'}`, padding: '8px 16px', cursor: 'pointer' }}>{o.toUpperCase()}</button>
                ))}
              </div>
              {orientation === 'eclectic' && <input value={customOrientation} onChange={e => setCustomOrientation(e.target.value)} placeholder="Describe your orientation..." style={inputStyle} />}
              <div style={{ display: 'flex', gap: '8px', marginTop: '1rem' }}>
                <button onClick={() => setStep(0)} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', color: muted, background: 'none', border: `1px solid ${muted}44`, padding: '0 20px', height: '44px', cursor: 'pointer' }}>BACK</button>
                <button onClick={() => setStep(2)} style={{ flex: 1, fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: '#0a0a0a', background: gold, border: 'none', height: '44px', cursor: 'pointer' }}>NEXT: QUESTIONNAIRE</button>
              </div>
            </div>
          )}

          {/* STEP 2: Questionnaire */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold }}>MATCHING QUESTIONNAIRE</div>
              <p style={{ fontSize: '14px', color: muted }}>Nietzsche will generate provocative questions that reveal genuine philosophical differences.</p>
              {questions.length === 0 && (
                <button onClick={generateQuestions} disabled={generatingQs} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', color: gold, background: 'transparent', border: `1px solid ${gold}`, padding: '12px', cursor: 'pointer' }}>{generatingQs ? 'GENERATING...' : 'GENERATE QUESTIONS'}</button>
              )}
              {questions.map((q, i) => (
                <div key={q.id || i} style={{ background: '#111', border: `1px solid ${gold}15`, padding: '12px' }}>
                  <div style={{ fontSize: '14px', color: parchment, marginBottom: '4px' }}>{i + 1}. {q.text}</div>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', color: `${gold}88` }}>{q.philosophical_axis?.toUpperCase()}</span>
                </div>
              ))}
              <div style={{ display: 'flex', gap: '8px', marginTop: '0.5rem' }}>
                <button onClick={() => setStep(1)} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', color: muted, background: 'none', border: `1px solid ${muted}44`, padding: '0 20px', height: '44px', cursor: 'pointer' }}>BACK</button>
                <button onClick={() => setStep(3)} style={{ flex: 1, fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: '#0a0a0a', background: gold, border: 'none', height: '44px', cursor: 'pointer' }}>NEXT: GOVERNANCE</button>
              </div>
            </div>
          )}

          {/* STEP 3: Governance */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold }}>GOVERNANCE</div>
              {GOVERNANCE_TYPES.map(g => (
                <button key={g.id} onClick={() => setGovType(g.id)} style={{ background: govType === g.id ? `${gold}15` : '#111', border: `1px solid ${govType === g.id ? gold : `${gold}22`}`, padding: '12px 16px', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', color: govType === g.id ? gold : parchment }}>{g.label}</div>
                  <div style={{ fontSize: '13px', color: muted, marginTop: '2px' }}>{g.desc}</div>
                </button>
              ))}
              <div>
                <span style={{ fontSize: '14px', color: muted }}>Voting threshold: {votingThreshold}%</span>
                <input type="range" min="33" max="75" value={votingThreshold} onChange={e => setVotingThreshold(parseInt(e.target.value))} style={{ width: '100%', accentColor: gold }} />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {['free', 'paid', 'invite'].map(t => (
                  <button key={t} onClick={() => setMembershipType(t)} style={{ flex: 1, fontFamily: 'Cinzel, serif', fontSize: '9px', color: membershipType === t ? '#0a0a0a' : gold, background: membershipType === t ? gold : 'transparent', border: `1px solid ${gold}44`, padding: '8px', cursor: 'pointer' }}>{t.toUpperCase()}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '0.5rem' }}>
                <button onClick={() => setStep(2)} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', color: muted, background: 'none', border: `1px solid ${muted}44`, padding: '0 20px', height: '44px', cursor: 'pointer' }}>BACK</button>
                <button onClick={() => setStep(4)} style={{ flex: 1, fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: '#0a0a0a', background: gold, border: 'none', height: '44px', cursor: 'pointer' }}>NEXT: LAUNCH</button>
              </div>
            </div>
          )}

          {/* STEP 4: Launch */}
          {step === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold }}>REVIEW &amp; LAUNCH</div>
              <div style={{ background: '#0d0d0d', border: `1px solid ${gold}15`, padding: '1.5rem' }}>
                <p style={{ fontSize: '14px', color: muted, marginBottom: '4px' }}>Name</p>
                <p style={{ fontSize: '18px', color: parchment, marginBottom: '1rem' }}>{name}</p>
                <p style={{ fontSize: '14px', color: muted, marginBottom: '4px' }}>Mission</p>
                <p style={{ fontSize: '15px', color: parchment, marginBottom: '1rem' }}>{mission || 'Not set'}</p>
                <p style={{ fontSize: '14px', color: muted, marginBottom: '4px' }}>Philosophy</p>
                <p style={{ fontSize: '15px', color: parchment, marginBottom: '1rem' }}>{orientation}</p>
                <p style={{ fontSize: '14px', color: muted, marginBottom: '4px' }}>Governance</p>
                <p style={{ fontSize: '15px', color: parchment, marginBottom: '1rem' }}>{GOVERNANCE_TYPES.find(g => g.id === govType)?.label} · {votingThreshold}% threshold · {membershipType}</p>
                <p style={{ fontSize: '14px', color: muted, marginBottom: '4px' }}>Questionnaire</p>
                <p style={{ fontSize: '15px', color: parchment }}>{questions.length} matching questions</p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setStep(3)} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', color: muted, background: 'none', border: `1px solid ${muted}44`, padding: '0 20px', height: '48px', cursor: 'pointer' }}>BACK</button>
                <button onClick={handleCreate} disabled={submitting} style={{ flex: 1, fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, border: 'none', height: '48px', cursor: 'pointer', opacity: submitting ? 0.5 : 1 }}>
                  {submitting ? 'CREATING...' : 'LAUNCH COMMUNITY'}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
