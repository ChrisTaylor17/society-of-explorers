'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

const SESSIONS = [
  { id: 'focus', name: 'FOCUS', desc: 'Sharpen your mind. Alpha waves for deep concentration.', icon: '◆', binaural: 10, color: '#4169E1' },
  { id: 'contemplation', name: 'CONTEMPLATION', desc: 'Slow down. Theta waves for philosophical reflection.', icon: '◇', binaural: 6, color: '#7B68EE' },
  { id: 'flow', name: 'FLOW', desc: 'Enter the zone. Beta-alpha bridge for creative work.', icon: '○', binaural: 12, color: gold },
  { id: 'stillness', name: 'STILLNESS', desc: 'Pure calm. Delta-theta for deep meditation.', icon: '●', binaural: 4, color: '#8B7355' },
];

const QUOTES = [
  { text: 'Music is the movement of sound to reach the soul for the education of its virtue.', author: 'Plato' },
  { text: 'Without music, life would be a mistake.', author: 'Nietzsche' },
  { text: 'The soul that hears music feels his solitude peopled at once.', author: 'Robert Browning' },
];

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function MusicTherapyPage() {
  const [activeSession, setActiveSession] = useState<typeof SESSIONS[0] | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [volume, setVolume] = useState(0.6);
  const [pulseScale, setPulseScale] = useState(1);
  const [iName, setIName] = useState('');
  const [iEmail, setIEmail] = useState('');
  const [hardware, setHardware] = useState('learn');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const nodesRef = useRef<{ master: GainNode; oscs: OscillatorNode[]; lfos: OscillatorNode[]; noise: AudioBufferSourceNode | null } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) (e.target as HTMLElement).style.opacity = '1'; });
    }, { threshold: 0.1 });
    document.querySelectorAll('[data-fade]').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [activeSession]);

  useEffect(() => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      document.querySelectorAll<HTMLElement>('[data-parallax]').forEach(el => {
        el.style.backgroundAttachment = 'scroll';
      });
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => { endSession(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startSession = useCallback((session: typeof SESSIONS[0]) => {
    endSession();
    setActiveSession(session);
    setElapsed(0);

    const ctx = new AudioContext();
    audioCtxRef.current = ctx;

    // iOS unlock
    if (ctx.state === 'suspended') ctx.resume();

    // Master chain: compressor → gain → destination
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;

    const master = ctx.createGain();
    master.gain.value = volume;
    master.connect(compressor);
    compressor.connect(ctx.destination);

    const oscs: OscillatorNode[] = [];
    const lfos: OscillatorNode[] = [];

    // Binaural beats: left ear base tone, right ear base+binaural
    const baseTone = 200;
    const merger = ctx.createChannelMerger(2);

    const oscL = ctx.createOscillator();
    oscL.type = 'sine';
    oscL.frequency.value = baseTone;
    const gainL = ctx.createGain();
    gainL.gain.value = 0.12;
    oscL.connect(gainL);
    gainL.connect(merger, 0, 0);
    oscL.start();
    oscs.push(oscL);

    const oscR = ctx.createOscillator();
    oscR.type = 'sine';
    oscR.frequency.value = baseTone + session.binaural;
    const gainR = ctx.createGain();
    gainR.gain.value = 0.12;
    oscR.connect(gainR);
    gainR.connect(merger, 0, 1);
    oscR.start();
    oscs.push(oscR);

    merger.connect(master);

    // Ambient pad: 3 detuned oscillators with LFO modulation
    const padFreqs = [130.81, 196.00, 261.63]; // C3, G3, C4
    padFreqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.detune.value = (i - 1) * 8;

      const padGain = ctx.createGain();
      padGain.gain.value = 0.06;

      // LFO for amplitude modulation
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.08 + i * 0.02;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.03;
      lfo.connect(lfoGain);
      lfoGain.connect(padGain.gain);
      lfo.start();
      lfos.push(lfo);

      osc.connect(padGain);
      padGain.connect(master);
      osc.start();
      oscs.push(osc);
    });

    // Filter sweep on pad
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 1;
    // Sweep 800-2000Hz over 30 seconds
    const sweepLfo = ctx.createOscillator();
    sweepLfo.type = 'sine';
    sweepLfo.frequency.value = 1 / 30;
    const sweepGain = ctx.createGain();
    sweepGain.gain.value = 600;
    sweepLfo.connect(sweepGain);
    sweepGain.connect(filter.frequency);
    filter.frequency.value = 1400;
    sweepLfo.start();
    lfos.push(sweepLfo);

    // Sub bass through filter
    const subOsc = ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.value = 65.41; // C2
    const subGain = ctx.createGain();
    subGain.gain.value = 0.08;
    subOsc.connect(filter);
    filter.connect(subGain);
    subGain.connect(master);
    subOsc.start();
    oscs.push(subOsc);

    // Brownian noise
    let noiseNode: AudioBufferSourceNode | null = null;
    try {
      const bufferSize = ctx.sampleRate * 4;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let lastOut = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        output[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = output[i];
        output[i] *= 3.5;
      }
      noiseNode = ctx.createBufferSource();
      noiseNode.buffer = noiseBuffer;
      noiseNode.loop = true;
      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0.04;
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.value = 400;
      noiseNode.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(master);
      noiseNode.start();
    } catch {}

    nodesRef.current = { master, oscs, lfos, noise: noiseNode };

    // Timer
    timerRef.current = setInterval(() => {
      setElapsed(prev => prev + 1);
    }, 1000);

    // Pulse animation (~0.1Hz breathing rate)
    let phase = 0;
    function animate() {
      phase += 0.002;
      setPulseScale(1 + 0.15 * Math.sin(phase * Math.PI * 2));
      animRef.current = requestAnimationFrame(animate);
    }
    animRef.current = requestAnimationFrame(animate);
  }, [volume]);

  function endSession() {
    if (nodesRef.current) {
      nodesRef.current.oscs.forEach(o => { try { o.stop(); o.disconnect(); } catch {} });
      nodesRef.current.lfos.forEach(o => { try { o.stop(); o.disconnect(); } catch {} });
      if (nodesRef.current.noise) { try { nodesRef.current.noise.stop(); nodesRef.current.noise.disconnect(); } catch {} }
      try { nodesRef.current.master.disconnect(); } catch {}
      nodesRef.current = null;
    }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch {}
      audioCtxRef.current = null;
    }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; }

    if (activeSession && elapsed > 0) {
      try {
        const history = JSON.parse(localStorage.getItem('soe_music_sessions') || '[]');
        history.push({ session: activeSession.id, duration: elapsed, date: new Date().toISOString() });
        localStorage.setItem('soe_music_sessions', JSON.stringify(history.slice(-50)));
      } catch {}
    }

    setActiveSession(null);
    setElapsed(0);
    setPulseScale(1);
  }

  // Volume changes
  useEffect(() => {
    if (nodesRef.current) {
      nodesRef.current.master.gain.value = volume;
    }
  }, [volume]);

  async function handleInterest(e: React.FormEvent) {
    e.preventDefault();
    if (!iName.trim() || !iEmail.trim()) return;
    setSubmitting(true);
    try {
      await fetch('/api/music-therapy/interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: iName.trim(), email: iEmail.trim(), hardware_status: hardware }),
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
          backgroundImage: 'linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url("/images/hero-music-dark.jpeg")',
          backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed',
        }}
      >
        <div style={{ maxWidth: '720px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: gold, marginBottom: '1.5rem' }}>MUSIC THERAPY</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(36px, 7vw, 56px)', fontWeight: 400, lineHeight: 1.15, marginBottom: '1.5rem', color: parchment }}>
            Sound as philosophy
          </h1>
          <p style={{ fontSize: '20px', color: ivory85, lineHeight: 1.8, maxWidth: '600px', margin: '0 auto 2.5rem' }}>
            AI-generated soundscapes tuned to your mental state. Choose a philosophical mode. Close your eyes. Let the sound reshape your thinking.
          </p>
          <a href="#sessions" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, padding: '0 28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', height: '48px', borderRadius: 0 }}>BEGIN A SESSION</a>
        </div>
      </section>

      {/* ═══ SESSION PLAYER ═══ */}
      {activeSession && (
        <section style={{ padding: '4rem 2rem', background: '#050505', textAlign: 'center', minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: activeSession.color, marginBottom: '2rem' }}>{activeSession.name}</div>

          {/* Pulsing circle */}
          <div style={{
            width: '160px', height: '160px', borderRadius: '50%', margin: '0 auto 2rem',
            border: `2px solid ${activeSession.color}44`,
            boxShadow: `0 0 ${40 * pulseScale}px ${activeSession.color}22, inset 0 0 ${30 * pulseScale}px ${activeSession.color}11`,
            transform: `scale(${pulseScale})`,
            transition: 'box-shadow 0.3s ease',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: '36px', color: activeSession.color, opacity: 0.4 }}>{activeSession.icon}</span>
          </div>

          {/* Timer */}
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '28px', color: parchment, letterSpacing: '0.1em', marginBottom: '2rem' }}>
            {formatTime(elapsed)}
          </div>

          {/* Volume */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '2rem' }}>
            <span style={{ fontSize: '12px', color: muted }}>VOL</span>
            <input
              type="range" min="0" max="1" step="0.01" value={volume}
              onChange={e => setVolume(parseFloat(e.target.value))}
              style={{ width: '160px', accentColor: gold }}
            />
          </div>

          {/* End */}
          <button onClick={endSession} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: gold, background: 'transparent', border: `1px solid ${gold}55`, padding: '0 28px', height: '44px', cursor: 'pointer', borderRadius: 0 }}>
            END SESSION
          </button>

          <p style={{ fontSize: '14px', color: muted, marginTop: '1.5rem', fontStyle: 'italic' }}>
            Use headphones for binaural beats. Close your eyes.
          </p>
        </section>
      )}

      {/* ═══ CHOOSE YOUR STATE ═══ */}
      {!activeSession && (
        <section id="sessions" data-fade style={{ padding: '6rem 2rem', background: '#0a0a0a', opacity: 0, transition: 'opacity 0.9s ease' }}>
          <div style={{ maxWidth: '720px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '0.75rem' }}>CHOOSE YOUR STATE</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1px', background: `${gold}10` }}>
              {SESSIONS.map(s => (
                <button
                  key={s.id}
                  onClick={() => startSession(s)}
                  style={{
                    background: '#0d0d0d', padding: '2.5rem 2rem', border: `1px solid rgba(201,168,76,0.15)`,
                    cursor: 'pointer', textAlign: 'left', display: 'block', width: '100%',
                    transition: 'box-shadow 0.3s ease',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.boxShadow = `0 0 30px ${s.color}15`)}
                  onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <span style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.15em', color: s.color }}>{s.name}</span>
                    <span style={{ fontSize: '20px', color: s.color, opacity: 0.4 }}>{s.icon}</span>
                  </div>
                  <p style={{ fontSize: '16px', color: muted, lineHeight: 1.7, fontFamily: 'Cormorant Garamond, serif' }}>{s.desc}</p>
                  <div style={{ fontSize: '11px', color: `${s.color}88`, fontFamily: 'Cinzel, serif', letterSpacing: '0.1em', marginTop: '1rem' }}>{s.binaural}Hz BINAURAL</div>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══ HARDWARE ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: '#0d0d0d', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '1rem' }}>COMING SOON: HARDWARE INTEGRATION</div>
            <p style={{ fontSize: '20px', color: ivory85, lineHeight: 1.8, maxWidth: '600px', margin: '0 auto 2.5rem' }}>
              Muse S EEG headband reads your brainwaves in real time. Polar H10 chest strap monitors heart rate variability. The soundscape adapts to YOUR nervous system — not a preset.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1px', background: `${gold}10` }}>
            <div style={{ background: '#0a0a0a', padding: '2.5rem 2rem', border: `1px solid rgba(201,168,76,0.15)` }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.15em', color: gold, marginBottom: '1rem' }}>MUSE S EEG</div>
              <p style={{ fontSize: '16px', color: muted, lineHeight: 1.8 }}>Real-time brainwave monitoring. Alpha, theta, delta, beta detection. The sound follows your mind.</p>
            </div>
            <div style={{ background: '#0a0a0a', padding: '2.5rem 2rem', border: `1px solid rgba(201,168,76,0.15)` }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.15em', color: gold, marginBottom: '1rem' }}>POLAR H10 HRV</div>
              <p style={{ fontSize: '16px', color: muted, lineHeight: 1.8 }}>Heart rate variability tracking. Coherence scoring. The rhythm follows your heart.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ INTEREST FORM ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: '#0a0a0a', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '480px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '1rem' }}>HARDWARE WAITLIST</div>
          <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 400, color: parchment, marginBottom: '2rem', lineHeight: 1.3 }}>
            Be first when hardware integration launches
          </h2>

          {submitted ? (
            <div style={{ padding: '2rem', border: `1px solid ${gold}33`, background: `${gold}08` }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.15em', color: gold, marginBottom: '0.75rem' }}>YOU'RE ON THE LIST</div>
              <p style={{ fontSize: '16px', color: ivory85, lineHeight: 1.7 }}>We'll notify you when hardware integration is ready.</p>
            </div>
          ) : (
            <form onSubmit={handleInterest} style={{ display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left' }}>
              <input value={iName} onChange={e => setIName(e.target.value)} placeholder="Your name" required style={inputStyle} />
              <input value={iEmail} onChange={e => setIEmail(e.target.value)} placeholder="Your email" type="email" required style={inputStyle} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px 0' }}>
                {[
                  { value: 'muse', label: 'I have a Muse S' },
                  { value: 'polar', label: 'I have a Polar H10' },
                  { value: 'both', label: 'I have both' },
                  { value: 'learn', label: 'I want to learn more' },
                ].map(opt => (
                  <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '15px', color: muted }}>
                    <input type="radio" name="hardware" value={opt.value} checked={hardware === opt.value} onChange={() => setHardware(opt.value)} style={{ accentColor: gold }} />
                    {opt.label}
                  </label>
                ))}
              </div>
              <button type="submit" disabled={submitting} style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: '#0a0a0a', background: gold, border: 'none', height: '48px', cursor: 'pointer', opacity: submitting ? 0.5 : 1, borderRadius: 0 }}>
                {submitting ? 'SUBMITTING...' : 'JOIN THE WAITLIST'}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* ═══ THINKER QUOTES ═══ */}
      <section data-fade style={{ padding: '6rem 2rem', background: '#0d0d0d', opacity: 0, transition: 'opacity 0.9s ease' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '3rem' }}>
          {QUOTES.map(q => (
            <div key={q.author} style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '20px', color: ivory85, lineHeight: 1.9, fontStyle: 'italic', marginBottom: '0.75rem' }}>
                &ldquo;{q.text}&rdquo;
              </p>
              <span style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold }}>— {q.author.toUpperCase()}</span>
            </div>
          ))}
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
