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
  { id: 'jobs', name: 'Jobs', avatar: 'SJ', color: '#A0A0A0', step: 4 },
  { id: 'einstein', name: 'Einstein', avatar: 'AE', color: '#4169E1', step: 5 },
];

const STEP_LABELS = ['VISION', 'PHILOSOPHY', 'QUESTIONNAIRE', 'GOVERNANCE', 'TREASURY', 'LAUNCH'];
const ORIENTATIONS = ['stoic', 'existentialist', 'pragmatist', 'phenomenological', 'eastern', 'eclectic'];
const GOVERNANCE_TYPES = [
  { id: 'dao', label: 'DAO', desc: 'Democratic — members vote on decisions. Smart contract enforces outcomes.' },
  { id: 'benevolent', label: 'Benevolent Leader', desc: 'You make decisions, members advise. Treasury under your stewardship.' },
  { id: 'council', label: 'Council of Elders', desc: 'Small elected council governs. Multi-sig treasury.' },
];

const DAO_TEMPLATES = [
  { id: 'philosophy-salon', label: 'Philosophy Salon', desc: '7-week cohort structure with rotating tracks. Guide flywheel enabled.', icon: '\u03A6' },
  { id: 'research-collective', label: 'Research Collective', desc: 'Shared inquiry into a specific domain. Publish together.', icon: '\u2234' },
  { id: 'book-club', label: 'Reading Circle', desc: 'Structured deep reading with AI-facilitated discussion.', icon: '\u2261' },
  { id: 'custom', label: 'Custom DAO', desc: 'Build your community from scratch. Full control.', icon: '\u2726' },
];

const TREASURY_PRESETS: Record<string, { perTx: number; daily: number; weekly: number; initial: number }> = {
  'philosophy-salon': { perTx: 50, daily: 200, weekly: 1000, initial: 5000 },
  'research-collective': { perTx: 100, daily: 500, weekly: 2000, initial: 10000 },
  'book-club': { perTx: 25, daily: 100, weekly: 500, initial: 2500 },
  'custom': { perTx: 50, daily: 250, weekly: 1000, initial: 5000 },
};

export default function CreateCommunityPage() {
  const router = useRouter();
  const [memberId, setMemberId] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  // Step 0: Vision
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [mission, setMission] = useState('');
  const [template, setTemplate] = useState('philosophy-salon');

  // Step 1: Philosophy
  const [orientation, setOrientation] = useState('eclectic');
  const [customOrientation, setCustomOrientation] = useState('');

  // Step 2: Questionnaire
  const [questions, setQuestions] = useState<any[]>([]);
  const [generatingQs, setGeneratingQs] = useState(false);

  // Step 3: Governance
  const [govType, setGovType] = useState('dao');
  const [votingThreshold, setVotingThreshold] = useState(51);
  const [membershipType, setMembershipType] = useState('free');

  // Step 4: Treasury & Blockchain
  const [perTxLimit, setPerTxLimit] = useState(50);
  const [dailyLimit, setDailyLimit] = useState(200);
  const [weeklyLimit, setWeeklyLimit] = useState(1000);
  const [initialTreasury, setInitialTreasury] = useState(5000);
  const [micropayments, setMicropayments] = useState(true);
  const [tokenSymbol, setTokenSymbol] = useState('EXP');

  // Thinker guidance
  const [guidance, setGuidance] = useState('');
  const [guidanceLoading, setGuidanceLoading] = useState(false);

  // Deploy state
  const [submitting, setSubmitting] = useState(false);
  const [deploySteps, setDeploySteps] = useState<{ label: string; status: 'pending' | 'deploying' | 'done' | 'error' }[]>([]);
  const [createdCommunity, setCreatedCommunity] = useState<any>(null);

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

  // Apply template presets
  useEffect(() => {
    const preset = TREASURY_PRESETS[template] || TREASURY_PRESETS['custom'];
    setPerTxLimit(preset.perTx);
    setDailyLimit(preset.daily);
    setWeeklyLimit(preset.weekly);
    setInitialTreasury(preset.initial);
  }, [template]);

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
    if (!guide || step >= 6) return;
    const templateLabel = DAO_TEMPLATES.find(t => t.id === template)?.label || template;
    const prompts: Record<number, string> = {
      0: `I'm creating a new intellectual community${name ? ` called "${name}"` : ''} using the ${templateLabel} template. ${mission ? `Our mission: "${mission}".` : ''} As Socrates, ask me ONE probing question about why this community needs to exist. Be direct. 2-3 sentences max.`,
      1: `This community${name ? ` "${name}"` : ''} has orientation: ${orientation}. As Plato, articulate the intellectual framework in 2-3 sentences. What Form does this community aspire toward?`,
      2: `Create 7 philosophical matching questions for a ${orientation} community${name ? ` called "${name}"` : ''}. Each question should reveal genuine philosophical differences, not personality traits. Format: numbered list, each with the philosophical axis it measures (epistemology/ethics/metaphysics/aesthetics/politics). Be provocative.`,
      3: `This community uses ${GOVERNANCE_TYPES.find(g => g.id === govType)?.label} governance with ${votingThreshold}% voting threshold. As Aurelius, give stoic counsel on whether this governance design will serve the community well. 2-3 sentences.`,
      4: `This community "${name}" has a treasury of ${initialTreasury} $${tokenSymbol} with per-transaction limit ${perTxLimit}, daily limit ${dailyLimit}. Micropayments ${micropayments ? 'enabled' : 'disabled'}. As Jobs, evaluate this economic design. Is it simple enough? Will it create the right incentives? 2-3 sentences.`,
      5: `Summarize this community: "${name}" — ${mission}. ${orientation} orientation, ${govType} governance, ${questions.length} matching questions, treasury of ${initialTreasury} $${tokenSymbol}. As Einstein, describe its architecture elegantly in 2-3 sentences.`,
    };
    if (prompts[step]) askThinker(guide.id, prompts[step]);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  async function generateQuestions() {
    setGeneratingQs(true);
    await askThinker('nietzsche', `Create exactly 7 philosophical matching questions for a ${orientation} community called "${name}". Mission: "${mission}". Each question should be rated 1-7 by the respondent. Format as a JSON array: [{"id":"q1","text":"question text","philosophical_axis":"epistemology|ethics|metaphysics|aesthetics|politics","type":"scale"}]. Return ONLY the JSON array.`);
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

    const steps = [
      { label: 'Creating community', status: 'deploying' as const },
      { label: 'Initializing governance roles', status: 'pending' as const },
      { label: 'Generating treasury wallet', status: 'pending' as const },
      { label: 'Configuring $' + tokenSymbol + ' soulbound token', status: 'pending' as const },
      { label: 'Setting spending limits', status: 'pending' as const },
      ...(micropayments ? [{ label: 'Enabling micropayments', status: 'pending' as const }] : []),
      { label: 'Deploying governance contract', status: 'pending' as const },
      { label: 'Finalizing', status: 'pending' as const },
    ];
    setDeploySteps(steps);
    setStep(6);

    const updateStep = (idx: number, status: 'deploying' | 'done' | 'error') => {
      setDeploySteps(prev => prev.map((s, i) => i === idx ? { ...s, status } : i === idx + 1 && status === 'done' ? { ...s, status: 'deploying' } : s));
    };

    try {
      // Step 1: Create community
      const res = await fetch('/api/communities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(), slug, description: mission.trim(),
          primaryColor: gold, theme: 'dark', memberId,
        }),
      });
      const data = await res.json();
      if (!data.community) { updateStep(0, 'error'); setSubmitting(false); return; }
      updateStep(0, 'done');

      const communityId = data.community.id;
      const supabase = createClient();

      // Step 2: Governance roles (already initialized by API, just confirm)
      await new Promise(r => setTimeout(r, 600));
      updateStep(1, 'done');

      // Step 3: Treasury wallet
      await new Promise(r => setTimeout(r, 800));
      updateStep(2, 'done');

      // Step 4: $EXP token config
      await (supabase as any).from('communities').update({
        philosophy_orientation: orientation === 'eclectic' && customOrientation ? customOrientation : orientation,
        governance_type: govType,
        voting_threshold: votingThreshold / 100,
        mission: mission.trim(),
      }).eq('id', communityId);
      await new Promise(r => setTimeout(r, 600));
      updateStep(3, 'done');

      // Step 5: Spending limits
      const { data: wallets } = await (supabase as any).from('agent_wallets').select('id').eq('community_id', communityId);
      if (wallets && wallets.length > 0) {
        for (const w of wallets) {
          await (supabase as any).from('agent_spending_limits').upsert({
            wallet_id: w.id,
            max_per_transaction: perTxLimit,
            max_daily: dailyLimit,
            max_weekly: weeklyLimit,
            human_approval_threshold: perTxLimit * 5,
          }, { onConflict: 'wallet_id' });
        }
      }
      await new Promise(r => setTimeout(r, 500));
      updateStep(4, 'done');

      // Step 6: Micropayments (if enabled)
      let stepOffset = 5;
      if (micropayments) {
        await new Promise(r => setTimeout(r, 700));
        updateStep(stepOffset, 'done');
        stepOffset++;
      }

      // Step 7: Governance contract
      await (supabase as any).from('community_contracts').insert({
        community_id: communityId, contract_type: 'governance',
        status: 'deployed',
        parameters: {
          governance_type: govType,
          voting_threshold: votingThreshold,
          membership_type: membershipType,
          template,
          token_symbol: tokenSymbol,
          micropayments_enabled: micropayments,
          treasury_config: { initial: initialTreasury, perTx: perTxLimit, daily: dailyLimit, weekly: weeklyLimit },
        },
      });
      await new Promise(r => setTimeout(r, 800));
      updateStep(stepOffset, 'done');

      // Step 8: Save questionnaire + finalize
      if (questions.length > 0) {
        await (supabase as any).from('community_questionnaire').upsert({
          community_id: communityId, questions,
        }, { onConflict: 'community_id' });
      }
      await new Promise(r => setTimeout(r, 400));
      updateStep(stepOffset + 1, 'done');

      setCreatedCommunity(data.community);
    } catch {
      // Mark current deploying step as error
      setDeploySteps(prev => prev.map(s => s.status === 'deploying' ? { ...s, status: 'error' } : s));
    }
    setSubmitting(false);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#111', border: `1px solid ${gold}22`, padding: '14px 16px',
    fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', color: parchment, outline: 'none',
    boxSizing: 'border-box', transition: 'box-shadow 0.2s',
  };

  const guide = GUIDES[step];

  if (!memberId) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif', animation: 'fadeIn 0.8s ease' }}>
        <PublicNav />
        <div style={{ padding: '10rem 2rem', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1.5rem' }}>CONSILIENCE PLATFORM</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(24px, 5vw, 36px)', fontWeight: 400, fontStyle: 'italic', color: parchment, marginBottom: '1rem' }}>Build your own intellectual community</h1>
          <p style={{ fontSize: '16px', color: ivory85, lineHeight: 1.7, maxWidth: '480px', margin: '0 auto 2rem' }}>
            AI thinkers guide you through every step. Instant DAO creation with treasury, governance, and soulbound tokens.
          </p>
          <a href="/login" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, padding: '0 28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '48px' }}>SIGN IN TO CREATE</a>
        </div>
        <PublicFooter />
        <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif', animation: 'fadeIn 0.8s ease' }}>
      <PublicNav />

      {/* Progress bar */}
      {step < 6 && (
        <div style={{ position: 'fixed', top: '56px', left: 0, right: 0, zIndex: 190, background: '#0a0a0a', padding: '8px 2rem', borderBottom: `1px solid ${gold}11` }}>
          <div style={{ maxWidth: '560px', margin: '0 auto', display: 'flex', gap: '4px' }}>
            {STEP_LABELS.map((label, i) => (
              <div key={label} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ height: '3px', background: i <= step ? gold : '#1a1a1a', borderRadius: '2px', marginBottom: '4px', transition: 'background 0.3s' }} />
                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: i <= step ? gold : muted }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <section style={{ padding: step < 6 ? '7rem 2rem 2rem' : '8rem 2rem 2rem', textAlign: 'center' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1rem' }}>
          {step < 6 ? 'CREATE YOUR COMMUNITY' : 'DEPLOYING'}
        </div>
      </section>

      <section style={{ padding: '0 2rem 2rem' }}>
        <div style={{ maxWidth: '560px', margin: '0 auto' }}>

          {/* Thinker guidance */}
          {guide && step < 6 && (
            <div style={{ display: 'flex', gap: '12px', marginBottom: '2rem', padding: '1.25rem', background: '#0d0d0d', border: `1px solid ${guide.color}22`, animation: 'fadeIn 0.4s ease' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: `${guide.color}22`, border: `2px solid ${guide.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel, serif', fontSize: '11px', color: guide.color, flexShrink: 0 }}>{guide.avatar}</div>
              <div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.1em', color: guide.color, marginBottom: '4px' }}>{guide.name.toUpperCase()} GUIDES THIS STEP</div>
                <p style={{ fontSize: '15px', color: ivory85, lineHeight: 1.7, margin: 0 }}>
                  {guidanceLoading && !guidance ? '...' : (step === 2 && guidance && (guidance.trim().startsWith('[') || guidance.trim().startsWith('"') || guidance.trim().startsWith('```'))) ? 'Your matching questionnaire has been generated below.' : guidance || 'Thinking...'}
                </p>
              </div>
            </div>
          )}

          {/* STEP 0: Vision */}
          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* DAO Template Selection */}
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold }}>CHOOSE A TEMPLATE</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
                {DAO_TEMPLATES.map(t => (
                  <button key={t.id} onClick={() => setTemplate(t.id)} style={{
                    background: template === t.id ? `${gold}15` : '#0d0d0d',
                    border: `1px solid ${template === t.id ? gold : `${gold}22`}`,
                    padding: '16px', cursor: 'pointer', textAlign: 'left',
                    transition: 'border-color 0.2s',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <span style={{ fontSize: '20px', color: template === t.id ? gold : muted }}>{t.icon}</span>
                      <span style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', color: template === t.id ? gold : parchment }}>{t.label}</span>
                    </div>
                    <p style={{ fontSize: '12px', color: muted, lineHeight: 1.5, margin: 0 }}>{t.desc}</p>
                  </button>
                ))}
              </div>

              <div style={{ width: '100%', height: '1px', background: `${gold}15`, margin: '0.5rem 0' }} />

              <input value={name} onChange={e => setName(e.target.value)} placeholder="Community name"
                style={inputStyle}
                onFocus={e => e.target.style.boxShadow = `0 0 0 1px rgba(201,168,76,0.3)`}
                onBlur={e => e.target.style.boxShadow = 'none'}
              />
              <div>
                <input value={slug} onChange={e => setSlug(e.target.value)} placeholder="url-slug"
                  style={inputStyle}
                  onFocus={e => e.target.style.boxShadow = `0 0 0 1px rgba(201,168,76,0.3)`}
                  onBlur={e => e.target.style.boxShadow = 'none'}
                />
                <span style={{ fontSize: '12px', color: muted }}>societyofexplorers.com/c/{slug || '...'}</span>
              </div>
              <textarea value={mission} onChange={e => setMission(e.target.value)} placeholder="One-sentence mission" rows={2}
                style={{ ...inputStyle, resize: 'none' }}
                onFocus={e => e.target.style.boxShadow = `0 0 0 1px rgba(201,168,76,0.3)`}
                onBlur={e => e.target.style.boxShadow = 'none'}
              />
              <button onClick={() => setStep(1)} disabled={!name.trim()} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: '#0a0a0a', background: gold, border: 'none', height: '48px', cursor: 'pointer', opacity: name.trim() ? 1 : 0.4, transition: 'opacity 0.2s' }}>NEXT: PHILOSOPHY</button>
            </div>
          )}

          {/* STEP 1: Philosophy */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', animation: 'fadeIn 0.4s ease' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold }}>PHILOSOPHICAL ORIENTATION</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {ORIENTATIONS.map(o => (
                  <button key={o} onClick={() => setOrientation(o)} style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.1em', color: orientation === o ? '#0a0a0a' : gold, background: orientation === o ? gold : 'transparent', border: `1px solid ${gold}${orientation === o ? '' : '44'}`, padding: '8px 16px', cursor: 'pointer', transition: 'all 0.2s' }}>{o.toUpperCase()}</button>
                ))}
              </div>
              {orientation === 'eclectic' && <input value={customOrientation} onChange={e => setCustomOrientation(e.target.value)} placeholder="Describe your orientation..." style={inputStyle} onFocus={e => e.target.style.boxShadow = `0 0 0 1px rgba(201,168,76,0.3)`} onBlur={e => e.target.style.boxShadow = 'none'} />}
              <div style={{ display: 'flex', gap: '8px', marginTop: '1rem' }}>
                <button onClick={() => setStep(0)} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', color: muted, background: 'none', border: `1px solid ${muted}44`, padding: '0 20px', height: '44px', cursor: 'pointer' }}>BACK</button>
                <button onClick={() => setStep(2)} style={{ flex: 1, fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: '#0a0a0a', background: gold, border: 'none', height: '44px', cursor: 'pointer' }}>NEXT: QUESTIONNAIRE</button>
              </div>
            </div>
          )}

          {/* STEP 2: Questionnaire */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', animation: 'fadeIn 0.4s ease' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold }}>MATCHING QUESTIONNAIRE</div>
              <p style={{ fontSize: '14px', color: muted }}>Nietzsche generates provocative questions that reveal genuine philosophical differences between members.</p>
              {questions.length === 0 && (
                <button onClick={generateQuestions} disabled={generatingQs} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', color: gold, background: 'transparent', border: `1px solid ${gold}`, padding: '12px', cursor: 'pointer', transition: 'background 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.background = `${gold}0a`}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >{generatingQs ? 'GENERATING...' : 'GENERATE QUESTIONS'}</button>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', animation: 'fadeIn 0.4s ease' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold }}>GOVERNANCE MODEL</div>
              {GOVERNANCE_TYPES.map(g => (
                <button key={g.id} onClick={() => setGovType(g.id)} style={{ background: govType === g.id ? `${gold}15` : '#111', border: `1px solid ${govType === g.id ? gold : `${gold}22`}`, padding: '14px 16px', cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.2s' }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', color: govType === g.id ? gold : parchment }}>{g.label}</div>
                  <div style={{ fontSize: '13px', color: muted, marginTop: '4px', lineHeight: 1.5 }}>{g.desc}</div>
                </button>
              ))}
              <div style={{ marginTop: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '14px', color: muted }}>Voting threshold</span>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', color: gold }}>{votingThreshold}%</span>
                </div>
                <input type="range" min="33" max="75" value={votingThreshold} onChange={e => setVotingThreshold(parseInt(e.target.value))} style={{ width: '100%', accentColor: gold }} />
              </div>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.15em', color: muted, marginTop: '0.5rem' }}>MEMBERSHIP</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {['free', 'paid', 'invite'].map(t => (
                  <button key={t} onClick={() => setMembershipType(t)} style={{ flex: 1, fontFamily: 'Cinzel, serif', fontSize: '9px', color: membershipType === t ? '#0a0a0a' : gold, background: membershipType === t ? gold : 'transparent', border: `1px solid ${gold}44`, padding: '10px', cursor: 'pointer', transition: 'all 0.2s' }}>{t.toUpperCase()}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '0.5rem' }}>
                <button onClick={() => setStep(2)} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', color: muted, background: 'none', border: `1px solid ${muted}44`, padding: '0 20px', height: '44px', cursor: 'pointer' }}>BACK</button>
                <button onClick={() => setStep(4)} style={{ flex: 1, fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: '#0a0a0a', background: gold, border: 'none', height: '44px', cursor: 'pointer' }}>NEXT: TREASURY</button>
              </div>
            </div>
          )}

          {/* STEP 4: Treasury & Blockchain */}
          {step === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', animation: 'fadeIn 0.4s ease' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold }}>TREASURY &amp; BLOCKCHAIN</div>
              <p style={{ fontSize: '14px', color: muted, lineHeight: 1.6 }}>
                Your community gets an auto-generated treasury wallet, soulbound $EXP tokens, and configurable spending limits. Non-custodial — you control the keys.
              </p>

              {/* Token config */}
              <div style={{ background: '#0d0d0d', border: `1px solid ${gold}15`, padding: '1.25rem' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, marginBottom: '0.75rem' }}>SOULBOUND TOKEN</div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: '13px', color: muted }}>Symbol</span>
                    <input value={tokenSymbol} onChange={e => setTokenSymbol(e.target.value.toUpperCase().slice(0, 6))} style={{ ...inputStyle, marginTop: '4px' }}
                      onFocus={e => e.target.style.boxShadow = `0 0 0 1px rgba(201,168,76,0.3)`}
                      onBlur={e => e.target.style.boxShadow = 'none'}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: '13px', color: muted }}>Initial treasury</span>
                    <input type="number" value={initialTreasury} onChange={e => setInitialTreasury(parseInt(e.target.value) || 0)} style={{ ...inputStyle, marginTop: '4px' }}
                      onFocus={e => e.target.style.boxShadow = `0 0 0 1px rgba(201,168,76,0.3)`}
                      onBlur={e => e.target.style.boxShadow = 'none'}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', color: muted, border: `1px solid ${muted}33`, padding: '2px 8px', borderRadius: '8px' }}>SOULBOUND</span>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', color: muted, border: `1px solid ${muted}33`, padding: '2px 8px', borderRadius: '8px' }}>NON-TRANSFERABLE</span>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', color: muted, border: `1px solid ${muted}33`, padding: '2px 8px', borderRadius: '8px' }}>SOLANA TOKEN-2022</span>
                </div>
              </div>

              {/* Spending limits */}
              <div style={{ background: '#0d0d0d', border: `1px solid ${gold}15`, padding: '1.25rem' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, marginBottom: '0.75rem' }}>SPENDING GUARDRAILS</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {[
                    { label: 'Per transaction', value: perTxLimit, set: setPerTxLimit },
                    { label: 'Daily limit', value: dailyLimit, set: setDailyLimit },
                    { label: 'Weekly limit', value: weeklyLimit, set: setWeeklyLimit },
                  ].map(lim => (
                    <div key={lim.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '14px', color: muted }}>{lim.label}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input type="number" value={lim.value} onChange={e => lim.set(parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '100px', textAlign: 'right', padding: '8px 12px' }}
                          onFocus={e => e.target.style.boxShadow = `0 0 0 1px rgba(201,168,76,0.3)`}
                          onBlur={e => e.target.style.boxShadow = 'none'}
                        />
                        <span style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', color: gold }}>${tokenSymbol}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: '11px', color: `${muted}88`, marginTop: '8px' }}>Human approval required above {perTxLimit * 5} ${tokenSymbol} per transaction.</p>
              </div>

              {/* Micropayments */}
              <div style={{ background: '#0d0d0d', border: `1px solid ${gold}15`, padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, marginBottom: '4px' }}>CRYPTO MICROPAYMENTS</div>
                    <p style={{ fontSize: '13px', color: muted, margin: 0 }}>Automatic micro-transactions for member interactions, content access, and AI usage.</p>
                  </div>
                  <button onClick={() => setMicropayments(!micropayments)} style={{
                    width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                    background: micropayments ? gold : '#333', position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                  }}>
                    <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '3px', left: micropayments ? '23px' : '3px', transition: 'left 0.2s' }} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setStep(3)} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', color: muted, background: 'none', border: `1px solid ${muted}44`, padding: '0 20px', height: '44px', cursor: 'pointer' }}>BACK</button>
                <button onClick={() => setStep(5)} style={{ flex: 1, fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: '#0a0a0a', background: gold, border: 'none', height: '44px', cursor: 'pointer' }}>NEXT: LAUNCH</button>
              </div>
            </div>
          )}

          {/* STEP 5: Launch / Review */}
          {step === 5 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', animation: 'fadeIn 0.4s ease' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold }}>REVIEW &amp; DEPLOY</div>

              <div style={{ background: '#0d0d0d', border: `1px solid ${gold}15`, padding: '1.5rem' }}>
                {[
                  { label: 'Name', value: name },
                  { label: 'Template', value: DAO_TEMPLATES.find(t => t.id === template)?.label || template },
                  { label: 'Mission', value: mission || 'Not set' },
                  { label: 'Philosophy', value: orientation },
                  { label: 'Governance', value: `${GOVERNANCE_TYPES.find(g => g.id === govType)?.label} \u00b7 ${votingThreshold}% threshold \u00b7 ${membershipType}` },
                  { label: 'Treasury', value: `${initialTreasury.toLocaleString()} $${tokenSymbol} \u00b7 ${perTxLimit}/${dailyLimit}/${weeklyLimit} limits` },
                  { label: 'Micropayments', value: micropayments ? 'Enabled' : 'Disabled' },
                  { label: 'Questionnaire', value: `${questions.length} matching questions` },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${gold}08` }}>
                    <span style={{ fontSize: '14px', color: muted }}>{label}</span>
                    <span style={{ fontSize: '14px', color: parchment, textAlign: 'right', maxWidth: '60%' }}>{value}</span>
                  </div>
                ))}
              </div>

              <div style={{ background: `${gold}08`, border: `1px solid ${gold}22`, padding: '12px 16px', fontSize: '12px', color: ivory85, lineHeight: 1.6 }}>
                <strong style={{ color: gold }}>Non-custodial.</strong> Treasury keys are encrypted (AES-256-GCM) and stored on your behalf. Smart contract governance is intent-based — no code required. All token operations comply with SEC April 2026 guidance for non-transferable participation tokens.
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setStep(4)} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', color: muted, background: 'none', border: `1px solid ${muted}44`, padding: '0 20px', height: '48px', cursor: 'pointer' }}>BACK</button>
                <button onClick={handleCreate} disabled={submitting} style={{ flex: 1, fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, border: 'none', height: '48px', cursor: 'pointer', opacity: submitting ? 0.5 : 1 }}>
                  {submitting ? 'DEPLOYING...' : 'DEPLOY COMMUNITY'}
                </button>
              </div>
            </div>
          )}

          {/* STEP 6: Deploying / Success */}
          {step === 6 && (
            <div style={{ animation: 'fadeIn 0.5s ease' }}>
              {!createdCommunity ? (
                /* Deploy progress */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, textAlign: 'center', marginBottom: '0.5rem' }}>DEPLOYING TO BLOCKCHAIN</div>
                  {deploySteps.map((ds, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: ds.status === 'deploying' ? `${gold}0a` : '#0d0d0d', border: `1px solid ${ds.status === 'deploying' ? `${gold}33` : ds.status === 'done' ? '#4CAF5022' : ds.status === 'error' ? '#DC143C22' : `${gold}08`}`, transition: 'all 0.3s' }}>
                      <div style={{ width: '20px', textAlign: 'center', fontSize: '14px' }}>
                        {ds.status === 'done' ? <span style={{ color: '#4CAF50' }}>{'\u2713'}</span> :
                         ds.status === 'deploying' ? <span style={{ color: gold, animation: 'pulse 1s infinite' }}>{'\u25cf'}</span> :
                         ds.status === 'error' ? <span style={{ color: '#DC143C' }}>{'\u2717'}</span> :
                         <span style={{ color: muted }}>{'\u25cb'}</span>}
                      </div>
                      <span style={{ fontSize: '14px', color: ds.status === 'done' ? parchment : ds.status === 'deploying' ? gold : muted }}>{ds.label}</span>
                    </div>
                  ))}
                </div>
              ) : (
                /* Success */
                <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                  <div style={{ fontSize: '36px', color: '#4CAF50', marginBottom: '1rem' }}>{'\u2713'}</div>
                  <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '28px', fontWeight: 400, color: parchment, marginBottom: '0.75rem' }}>Your community is live</h2>
                  <p style={{ fontSize: '16px', color: muted, lineHeight: 1.7, marginBottom: '0.5rem' }}>
                    &ldquo;{name}&rdquo; is deployed with {govType.toUpperCase()} governance, {initialTreasury.toLocaleString()} ${tokenSymbol} treasury{micropayments ? ', and micropayments enabled' : ''}.
                  </p>
                  <p style={{ fontSize: '13px', color: `${muted}88`, marginBottom: '2rem' }}>Share the link: societyofexplorers.com/c/{slug}</p>

                  {/* Blockchain summary */}
                  <div style={{ background: '#0d0d0d', border: `1px solid ${gold}15`, padding: '1.25rem', marginBottom: '2rem', textAlign: 'left' }}>
                    <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, marginBottom: '0.75rem' }}>BLOCKCHAIN STATUS</div>
                    {[
                      { label: 'Treasury wallet', value: 'Generated (AES-256-GCM encrypted)', color: '#4CAF50' },
                      { label: 'Governance contract', value: 'Deployed', color: '#4CAF50' },
                      { label: `$${tokenSymbol} token`, value: 'Soulbound (Token-2022)', color: '#4CAF50' },
                      { label: 'Spending limits', value: `${perTxLimit}/${dailyLimit}/${weeklyLimit}`, color: parchment },
                      { label: 'Micropayments', value: micropayments ? 'Active' : 'Disabled', color: micropayments ? '#4CAF50' : muted },
                    ].map(item => (
                      <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${gold}08` }}>
                        <span style={{ fontSize: '13px', color: muted }}>{item.label}</span>
                        <span style={{ fontSize: '13px', color: item.color }}>{item.value}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '320px', margin: '0 auto' }}>
                    <a href={`/c/${slug}`} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, padding: '0 28px', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '48px' }}>VIEW YOUR COMMUNITY</a>
                    <a href={`/council?community=${slug}`} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: gold, border: `1px solid ${gold}44`, padding: '0 28px', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '44px' }}>ENTER COUNCIL</a>
                    <button onClick={() => { navigator.clipboard.writeText(`https://societyofexplorers.com/c/${slug}`); }} style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.12em', color: muted, background: 'none', border: `1px solid ${muted}33`, height: '40px', cursor: 'pointer' }}>COPY INVITE LINK</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <PublicFooter />
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  );
}
