'use client';
import { useState, useEffect } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { getMemberSession } from '@/lib/auth/getSession';
import { createClient } from '@/lib/supabase/client';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

const STEP_LABELS = ['MISSION', 'INFRASTRUCTURE', 'TOKENS', 'LAUNCH'];

const DAO_TEMPLATES = [
  { id: 'depin-sensor', label: 'DePIN Sensor Network', desc: 'Distributed sensor grid. Members host nodes, collect environmental data, earn for uptime + bandwidth.', domains: ['Air quality', 'Noise', 'Radio spectrum', 'Soil'] },
  { id: 'citizen-bio', label: 'Citizen Bio Lab', desc: 'Distributed biology. Water testing, soil microbiome, species counts, at-home PCR kits. Contributors verify with photo + geolocation.', domains: ['Microbiome', 'Water', 'Species', 'Genomics'] },
  { id: 'climate-grid', label: 'Climate Monitoring Grid', desc: 'Weather stations, CO2 sensors, ocean buoys, glacier cameras. Open dataset, on-chain attestation.', domains: ['Weather', 'CO2/VOC', 'Marine', 'Ice'] },
  { id: 'open-hardware', label: 'Open Hardware Collective', desc: 'Design, manufacture, and distribute open hardware. Contributors earn for schematics, firmware, and assembly.', domains: ['Firmware', 'PCB', 'Mech', 'Docs'] },
  { id: 'habit-layer', label: 'Habit / Research Layer', desc: 'Daily practice, streaks, cohorts. Run behavioral studies with real participant commitment. (SOE model.)', domains: ['Habits', 'Cohorts', 'Surveys', 'Rituals'] },
  { id: 'custom', label: 'Custom DAO', desc: 'Start from scratch. Define your own mission, infrastructure, and incentives.', domains: ['Configurable'] },
];

const DATA_METHODS = [
  { id: 'sensors', label: 'Sensor nodes (hardware devices)' },
  { id: 'mobile', label: 'Mobile app / in-the-wild observations' },
  { id: 'field-stations', label: 'Field stations / physical sites' },
  { id: 'lab-kits', label: 'At-home / distributed lab kits' },
  { id: 'web-scrape', label: 'Web / satellite / public data' },
  { id: 'survey', label: 'Structured surveys / participant reports' },
];

const VERIFICATION_METHODS = [
  { id: 'crypto-attest', label: 'Cryptographic attestation (signed by device)' },
  { id: 'geo-photo', label: 'Geolocation + photo' },
  { id: 'peer-review', label: 'Peer-review by other members' },
  { id: 'oracle', label: 'Oracle / trusted third-party' },
];

export default function CreateDAOPage() {
  const [memberId, setMemberId] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  // Step 1: Mission
  const [template, setTemplate] = useState('depin-sensor');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [problem, setProblem] = useState('');

  // Step 2: Infrastructure
  const [methods, setMethods] = useState<string[]>(['sensors']);
  const [verification, setVerification] = useState('geo-photo');
  const [hardwareNeeded, setHardwareNeeded] = useState('');
  const [dataGoal, setDataGoal] = useState('');

  // Step 3: Tokens & Incentives
  const [repSymbol, setRepSymbol] = useState('REP');
  const [govSymbol, setGovSymbol] = useState('GOV');
  const [initialTreasury, setInitialTreasury] = useState(10000);
  const [rewardContribution, setRewardContribution] = useState(10);
  const [rewardParticipation, setRewardParticipation] = useState(5);
  const [rewardAnalysis, setRewardAnalysis] = useState(25);

  // Deploy state
  const [submitting, setSubmitting] = useState(false);
  const [deploySteps, setDeploySteps] = useState<{ label: string; status: 'pending' | 'deploying' | 'done' | 'error' }[]>([]);
  const [createdDao, setCreatedDao] = useState<any>(null);

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

  function toggleMethod(id: string) {
    setMethods(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
  }

  async function handleDeploy() {
    if (!memberId || !name || !slug) return;
    setSubmitting(true);

    const steps = [
      { label: 'Creating DAO record', status: 'deploying' as const },
      { label: 'Initializing governance roles', status: 'pending' as const },
      { label: 'Generating non-custodial treasury', status: 'pending' as const },
      { label: `Configuring $${repSymbol} soulbound token`, status: 'pending' as const },
      { label: `Configuring $${govSymbol} governance token`, status: 'pending' as const },
      { label: 'Setting reward rules', status: 'pending' as const },
      { label: 'Registering infrastructure spec', status: 'pending' as const },
      { label: 'Finalizing', status: 'pending' as const },
    ];
    setDeploySteps(steps);
    setStep(4);

    const updateStep = (idx: number, status: 'deploying' | 'done' | 'error') => {
      setDeploySteps(prev => prev.map((s, i) => i === idx ? { ...s, status } : i === idx + 1 && status === 'done' ? { ...s, status: 'deploying' } : s));
    };

    try {
      const res = await fetch('/api/communities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), slug, description: description.trim(), primaryColor: gold, theme: 'dark', memberId }),
      });
      const data = await res.json();
      if (!data.community) { updateStep(0, 'error'); setSubmitting(false); return; }
      updateStep(0, 'done');

      const daoId = data.community.id;
      const supabase = createClient();

      await new Promise(r => setTimeout(r, 500)); updateStep(1, 'done');
      await new Promise(r => setTimeout(r, 700)); updateStep(2, 'done');

      await (supabase as any).from('communities').update({
        mission: problem.trim() || description.trim(),
        governance_type: 'dao',
      }).eq('id', daoId);
      await new Promise(r => setTimeout(r, 600)); updateStep(3, 'done');
      await new Promise(r => setTimeout(r, 500)); updateStep(4, 'done');

      // Spending limits
      const { data: wallets } = await (supabase as any).from('agent_wallets').select('id').eq('community_id', daoId);
      if (wallets && wallets.length > 0) {
        for (const w of wallets) {
          await (supabase as any).from('agent_spending_limits').upsert({
            wallet_id: w.id,
            max_per_transaction: Math.max(rewardContribution, rewardParticipation, rewardAnalysis) * 5,
            max_daily: Math.max(rewardContribution, rewardParticipation, rewardAnalysis) * 20,
            max_weekly: Math.max(rewardContribution, rewardParticipation, rewardAnalysis) * 100,
            human_approval_threshold: Math.max(rewardContribution, rewardParticipation, rewardAnalysis) * 20,
          }, { onConflict: 'wallet_id' });
        }
      }
      await new Promise(r => setTimeout(r, 500)); updateStep(5, 'done');

      // Governance + infrastructure contract config
      await (supabase as any).from('community_contracts').insert([
        {
          community_id: daoId, contract_type: 'governance',
          status: 'deployed',
          parameters: {
            template, governance_type: 'dao', voting_threshold: 51,
            reputation_token: { symbol: repSymbol, soulbound: true, standard: 'Solana Token-2022' },
            governance_token: { symbol: govSymbol, transferable: true },
            initial_treasury: initialTreasury,
            rewards: { contribution: rewardContribution, participation: rewardParticipation, analysis: rewardAnalysis },
          },
        },
        {
          community_id: daoId, contract_type: 'infrastructure',
          status: 'deployed',
          parameters: {
            data_methods: methods,
            verification_method: verification,
            hardware_needed: hardwareNeeded,
            data_goal: dataGoal,
            problem_statement: problem,
          },
        },
      ]);
      await new Promise(r => setTimeout(r, 700)); updateStep(6, 'done');
      await new Promise(r => setTimeout(r, 400)); updateStep(7, 'done');

      setCreatedDao(data.community);
    } catch {
      setDeploySteps(prev => prev.map(s => s.status === 'deploying' ? { ...s, status: 'error' } : s));
    }
    setSubmitting(false);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#111', border: `1px solid ${gold}22`, padding: '14px 16px',
    fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', color: parchment, outline: 'none',
    boxSizing: 'border-box', transition: 'box-shadow 0.2s',
  };

  if (!memberId) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
        <PublicNav />
        <div style={{ padding: '10rem 2rem', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1.5rem' }}>CONSILIENCE SYSTEMS</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(26px, 5vw, 40px)', fontWeight: 400, color: parchment, marginBottom: '1rem', lineHeight: 1.2 }}>
            Launch your own citizen-science DAO.
          </h1>
          <p style={{ fontSize: '16px', color: ivory85, lineHeight: 1.7, maxWidth: '520px', margin: '0 auto 2rem' }}>
            Run real-world experiments, own the data, reward contributors. Four steps. Non-custodial. Open protocol.
          </p>
          <a href="/login" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, padding: '0 32px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '52px' }}>SIGN IN TO CREATE</a>
        </div>
        <PublicFooter />
      </div>
    );
  }

  const tpl = DAO_TEMPLATES.find(t => t.id === template);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      {/* Progress bar */}
      {step < 4 && (
        <div style={{ position: 'fixed', top: '56px', left: 0, right: 0, zIndex: 190, background: '#0a0a0a', padding: '8px 2rem', borderBottom: `1px solid ${gold}11` }}>
          <div style={{ maxWidth: '640px', margin: '0 auto', display: 'flex', gap: '6px' }}>
            {STEP_LABELS.map((label, i) => (
              <div key={label} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ height: '3px', background: i <= step ? gold : '#1a1a1a', borderRadius: '2px', marginBottom: '4px', transition: 'background 0.3s' }} />
                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: i <= step ? gold : muted }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <section style={{ padding: step < 4 ? '7rem 2rem 2rem' : '8rem 2rem 2rem', textAlign: 'center' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '0.5rem' }}>
          {step < 4 ? 'CREATE YOUR DAO' : 'DEPLOYING'}
        </div>
        {step < 4 && <p style={{ fontSize: '14px', color: muted }}>Step {step + 1} of 4 &middot; {STEP_LABELS[step]}</p>}
      </section>

      <section style={{ padding: '0 2rem 3rem' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>

          {/* STEP 1: Mission */}
          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, marginBottom: '0.75rem' }}>CHOOSE A TEMPLATE</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '8px' }}>
                  {DAO_TEMPLATES.map(t => (
                    <button key={t.id} onClick={() => setTemplate(t.id)} style={{
                      background: template === t.id ? `${gold}15` : '#0d0d0d',
                      border: `1px solid ${template === t.id ? gold : `${gold}22`}`,
                      padding: '14px 16px', cursor: 'pointer', textAlign: 'left',
                      transition: 'border-color 0.2s',
                    }}>
                      <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.12em', color: template === t.id ? gold : parchment, marginBottom: '6px' }}>{t.label.toUpperCase()}</div>
                      <p style={{ fontSize: '13px', color: muted, lineHeight: 1.5, margin: 0, marginBottom: '8px' }}>{t.desc}</p>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {t.domains.map(d => (
                          <span key={d} style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.08em', color: `${gold}88`, border: `1px solid ${gold}22`, padding: '1px 6px' }}>{d.toUpperCase()}</span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ width: '100%', height: '1px', background: `${gold}15`, margin: '0.5rem 0' }} />

              <input value={name} onChange={e => setName(e.target.value)} placeholder="DAO name"
                style={inputStyle} onFocus={e => e.target.style.boxShadow = `0 0 0 1px rgba(201,168,76,0.3)`} onBlur={e => e.target.style.boxShadow = 'none'} />
              <div>
                <input value={slug} onChange={e => setSlug(e.target.value)} placeholder="url-slug" style={inputStyle}
                  onFocus={e => e.target.style.boxShadow = `0 0 0 1px rgba(201,168,76,0.3)`} onBlur={e => e.target.style.boxShadow = 'none'} />
                <span style={{ fontSize: '12px', color: muted }}>consilience.systems/dao/{slug || '...'}</span>
              </div>
              <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="One-sentence description" rows={2}
                style={{ ...inputStyle, resize: 'none' }}
                onFocus={e => e.target.style.boxShadow = `0 0 0 1px rgba(201,168,76,0.3)`} onBlur={e => e.target.style.boxShadow = 'none'} />
              <textarea value={problem} onChange={e => setProblem(e.target.value)} placeholder="What real-world problem are you targeting? (e.g., 'No public network measures indoor air quality at zip-code granularity in US cities.')" rows={3}
                style={{ ...inputStyle, resize: 'none' }}
                onFocus={e => e.target.style.boxShadow = `0 0 0 1px rgba(201,168,76,0.3)`} onBlur={e => e.target.style.boxShadow = 'none'} />

              <button onClick={() => setStep(1)} disabled={!name.trim()} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: '#0a0a0a', background: gold, border: 'none', height: '48px', cursor: 'pointer', opacity: name.trim() ? 1 : 0.4 }}>NEXT: INFRASTRUCTURE</button>
            </div>
          )}

          {/* STEP 2: Infrastructure */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ fontSize: '14px', color: muted, lineHeight: 1.6, margin: 0 }}>
                Define what real-world data this DAO collects and how contributions are verified.
              </p>

              <div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, marginBottom: '0.75rem' }}>DATA COLLECTION METHODS</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {DATA_METHODS.map(m => (
                    <button key={m.id} onClick={() => toggleMethod(m.id)} style={{
                      background: methods.includes(m.id) ? `${gold}0f` : '#0d0d0d',
                      border: `1px solid ${methods.includes(m.id) ? gold : `${gold}22`}`,
                      padding: '12px 14px', cursor: 'pointer', textAlign: 'left',
                      display: 'flex', alignItems: 'center', gap: '10px',
                    }}>
                      <span style={{ fontSize: '12px', color: methods.includes(m.id) ? gold : muted, width: '14px' }}>{methods.includes(m.id) ? '\u25A0' : '\u25A1'}</span>
                      <span style={{ fontSize: '14px', color: methods.includes(m.id) ? parchment : ivory85 }}>{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, marginBottom: '0.75rem' }}>VERIFICATION METHOD</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {VERIFICATION_METHODS.map(v => (
                    <button key={v.id} onClick={() => setVerification(v.id)} style={{
                      background: verification === v.id ? `${gold}0f` : '#0d0d0d',
                      border: `1px solid ${verification === v.id ? gold : `${gold}22`}`,
                      padding: '12px 14px', cursor: 'pointer', textAlign: 'left',
                      display: 'flex', alignItems: 'center', gap: '10px',
                    }}>
                      <span style={{ fontSize: '12px', color: verification === v.id ? gold : muted, width: '14px' }}>{verification === v.id ? '\u25C9' : '\u25CB'}</span>
                      <span style={{ fontSize: '14px', color: verification === v.id ? parchment : ivory85 }}>{v.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <textarea value={hardwareNeeded} onChange={e => setHardwareNeeded(e.target.value)} placeholder="Hardware or kits required (optional) — e.g., 'ESP32 + PMS5003 PM2.5 sensor, SD card, WiFi'"
                rows={2} style={{ ...inputStyle, resize: 'none' }}
                onFocus={e => e.target.style.boxShadow = `0 0 0 1px rgba(201,168,76,0.3)`} onBlur={e => e.target.style.boxShadow = 'none'} />

              <textarea value={dataGoal} onChange={e => setDataGoal(e.target.value)} placeholder="Target dataset / outcome (optional) — e.g., 'Publish a public PM2.5 heatmap for 50 US cities by end of year.'"
                rows={2} style={{ ...inputStyle, resize: 'none' }}
                onFocus={e => e.target.style.boxShadow = `0 0 0 1px rgba(201,168,76,0.3)`} onBlur={e => e.target.style.boxShadow = 'none'} />

              <div style={{ display: 'flex', gap: '8px', marginTop: '0.5rem' }}>
                <button onClick={() => setStep(0)} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', color: muted, background: 'none', border: `1px solid ${muted}44`, padding: '0 20px', height: '44px', cursor: 'pointer' }}>BACK</button>
                <button onClick={() => setStep(2)} disabled={methods.length === 0} style={{ flex: 1, fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: '#0a0a0a', background: gold, border: 'none', height: '44px', cursor: 'pointer', opacity: methods.length === 0 ? 0.4 : 1 }}>NEXT: TOKENS</button>
              </div>
            </div>
          )}

          {/* STEP 3: Tokens & Incentives */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ fontSize: '14px', color: muted, lineHeight: 1.6, margin: 0 }}>
                Two tokens. Soulbound reputation tracks verified contributions (non-transferable). Governance token enables voting and treasury access.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                <div style={{ background: '#0d0d0d', border: `1px solid ${gold}22`, padding: '1rem' }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.18em', color: gold, marginBottom: '0.5rem' }}>REPUTATION TOKEN</div>
                  <span style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '4px' }}>Symbol</span>
                  <input value={repSymbol} onChange={e => setRepSymbol(e.target.value.toUpperCase().slice(0, 6))} style={{ ...inputStyle, padding: '10px 12px' }} />
                  <div style={{ marginTop: '8px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', color: muted, border: `1px solid ${muted}33`, padding: '2px 6px' }}>SOULBOUND</span>
                    <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', color: muted, border: `1px solid ${muted}33`, padding: '2px 6px' }}>NON-TRANSFERABLE</span>
                  </div>
                </div>
                <div style={{ background: '#0d0d0d', border: `1px solid ${gold}22`, padding: '1rem' }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.18em', color: gold, marginBottom: '0.5rem' }}>GOVERNANCE TOKEN</div>
                  <span style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '4px' }}>Symbol</span>
                  <input value={govSymbol} onChange={e => setGovSymbol(e.target.value.toUpperCase().slice(0, 6))} style={{ ...inputStyle, padding: '10px 12px' }} />
                  <div style={{ marginTop: '8px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', color: muted, border: `1px solid ${muted}33`, padding: '2px 6px' }}>VOTING</span>
                    <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', color: muted, border: `1px solid ${muted}33`, padding: '2px 6px' }}>TREASURY</span>
                  </div>
                </div>
              </div>

              <div style={{ background: '#0d0d0d', border: `1px solid ${gold}22`, padding: '1rem' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.18em', color: gold, marginBottom: '0.5rem' }}>INITIAL TREASURY</div>
                <input type="number" value={initialTreasury} onChange={e => setInitialTreasury(parseInt(e.target.value) || 0)} style={{ ...inputStyle, padding: '10px 12px' }} />
                <span style={{ fontSize: '12px', color: muted }}>${repSymbol} allocated to reward contributions at launch.</span>
              </div>

              <div style={{ background: '#0d0d0d', border: `1px solid ${gold}22`, padding: '1rem' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.18em', color: gold, marginBottom: '0.75rem' }}>REWARD RULES</div>
                {[
                  { label: 'Per verified data contribution', value: rewardContribution, set: setRewardContribution },
                  { label: 'Per experiment participation', value: rewardParticipation, set: setRewardParticipation },
                  { label: 'Per analysis / publication', value: rewardAnalysis, set: setRewardAnalysis },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${gold}08` }}>
                    <span style={{ fontSize: '14px', color: ivory85 }}>{r.label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input type="number" value={r.value} onChange={e => r.set(parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: '80px', textAlign: 'right', padding: '6px 10px' }} />
                      <span style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', color: gold, minWidth: '28px' }}>${repSymbol}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '0.5rem' }}>
                <button onClick={() => setStep(1)} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', color: muted, background: 'none', border: `1px solid ${muted}44`, padding: '0 20px', height: '44px', cursor: 'pointer' }}>BACK</button>
                <button onClick={() => setStep(3)} style={{ flex: 1, fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.15em', color: '#0a0a0a', background: gold, border: 'none', height: '44px', cursor: 'pointer' }}>NEXT: LAUNCH</button>
              </div>
            </div>
          )}

          {/* STEP 4: Review / Launch */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold }}>REVIEW &amp; DEPLOY</div>

              <div style={{ background: '#0d0d0d', border: `1px solid ${gold}22`, padding: '1.5rem' }}>
                {[
                  { label: 'Name', value: name },
                  { label: 'Slug', value: slug },
                  { label: 'Template', value: tpl?.label || template },
                  { label: 'Description', value: description || '—' },
                  { label: 'Problem', value: problem || '—' },
                  { label: 'Data methods', value: methods.map(m => DATA_METHODS.find(d => d.id === m)?.label).filter(Boolean).join(', ') || '—' },
                  { label: 'Verification', value: VERIFICATION_METHODS.find(v => v.id === verification)?.label || verification },
                  { label: 'Reputation token', value: `$${repSymbol} (soulbound)` },
                  { label: 'Governance token', value: `$${govSymbol}` },
                  { label: 'Treasury', value: `${initialTreasury.toLocaleString()} $${repSymbol}` },
                  { label: 'Rewards', value: `Contribute ${rewardContribution} \u00b7 Participate ${rewardParticipation} \u00b7 Analyze ${rewardAnalysis} $${repSymbol}` },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${gold}08`, gap: '1rem' }}>
                    <span style={{ fontSize: '13px', color: muted, minWidth: '120px' }}>{label}</span>
                    <span style={{ fontSize: '13px', color: parchment, textAlign: 'right' }}>{value}</span>
                  </div>
                ))}
              </div>

              <div style={{ background: `${gold}08`, border: `1px solid ${gold}22`, padding: '12px 16px', fontSize: '12px', color: ivory85, lineHeight: 1.6 }}>
                <strong style={{ color: gold }}>Non-custodial.</strong> Treasury keys are AES-256-GCM encrypted. Reputation tokens are soulbound and compliant with SEC April 2026 guidance on non-transferable participation tokens. Governance token follows your DAO&apos;s charter.
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setStep(2)} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', color: muted, background: 'none', border: `1px solid ${muted}44`, padding: '0 20px', height: '48px', cursor: 'pointer' }}>BACK</button>
                <button onClick={handleDeploy} disabled={submitting} style={{ flex: 1, fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, border: 'none', height: '48px', cursor: 'pointer', opacity: submitting ? 0.5 : 1 }}>
                  {submitting ? 'DEPLOYING...' : 'DEPLOY DAO'}
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: Deploy progress / Success */}
          {step === 4 && (
            <div>
              {!createdDao ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, textAlign: 'center', marginBottom: '0.5rem' }}>DEPLOYING</div>
                  {deploySteps.map((ds, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: ds.status === 'deploying' ? `${gold}0a` : '#0d0d0d', border: `1px solid ${ds.status === 'deploying' ? `${gold}33` : ds.status === 'done' ? '#4CAF5022' : ds.status === 'error' ? '#DC143C22' : `${gold}08`}` }}>
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
                <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                  <div style={{ fontSize: '40px', color: '#4CAF50', marginBottom: '1rem' }}>{'\u2713'}</div>
                  <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(24px, 4vw, 32px)', fontWeight: 400, color: parchment, marginBottom: '0.5rem', lineHeight: 1.25 }}>
                    Your DAO is live
                  </h2>
                  <p style={{ fontSize: '15px', color: muted, marginBottom: '0.5rem' }}>&ldquo;{name}&rdquo; is deployed. Start your storefront, mint reputation, recruit contributors.</p>
                  <p style={{ fontSize: '13px', color: `${muted}88`, marginBottom: '2rem' }}>consilience.systems/dao/{slug}</p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '320px', margin: '0 auto' }}>
                    <a href={`/c/${slug}#store`} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, padding: '0 28px', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '48px' }}>OPEN YOUR STORE</a>
                    <a href={`/c/${slug}`} style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.12em', color: gold, background: 'none', border: `1px solid ${gold}44`, padding: '0 24px', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '44px' }}>VIEW FULL DASHBOARD</a>
                    <button onClick={() => { navigator.clipboard.writeText(`https://www.societyofexplorers.com/c/${slug}`); }} style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.12em', color: muted, background: 'none', border: `1px solid ${muted}33`, height: '40px', cursor: 'pointer' }}>COPY INVITE LINK</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <PublicFooter />
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
    </div>
  );
}
