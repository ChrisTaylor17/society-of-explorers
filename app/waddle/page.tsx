'use client';
import { useState, useEffect, useRef } from 'react';

const gold = '#C5A55A';
const parchment = '#E8DCC8';
const muted = '#9a8f7a';

const THINKERS = [
  { id: 'socrates', symbol: 'Σ', name: 'Socrates' },
  { id: 'plato', symbol: 'Π', name: 'Plato' },
  { id: 'nietzsche', symbol: 'N', name: 'Nietzsche' },
  { id: 'aurelius', symbol: 'M', name: 'Aurelius' },
  { id: 'einstein', symbol: 'E', name: 'Einstein' },
  { id: 'jobs', symbol: 'J', name: 'Jobs' },
];

export default function WaddleForge() {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [transcription, setTranscription] = useState('');
  const [transcribing, setTranscribing] = useState(false);
  const [selectedThinker, setSelectedThinker] = useState('socrates');
  const [thinkerReaction, setThinkerReaction] = useState('');
  const [reacting, setReacting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [feed, setFeed] = useState<any[]>([]);
  const [memberId, setMemberId] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const MAX_SECONDS = 15;

  // Load member + feed
  useEffect(() => {
    import('@/lib/auth/getSession').then(({ getMemberSession }) => {
      getMemberSession().then(s => { if (s?.member?.id) setMemberId(s.member.id); });
    });
    fetch('/api/waddle').then(r => r.json()).then(d => setFeed(d.waddles || [])).catch(() => {});
  }, []);

  async function startRecording() {
    chunksRef.current = [];
    setElapsed(0); setAudioBlob(null); setAudioUrl(''); setTranscription(''); setThinkerReaction(''); setSaved(false);

    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    streamRef.current = stream;
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;
    recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.start(100);
    setIsRecording(true);

    // Timer
    let sec = 0;
    timerRef.current = setInterval(() => {
      sec++;
      setElapsed(sec);
      if (sec >= MAX_SECONDS) stopRecording();
    }, 1000);
  }

  async function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);

    return new Promise<void>(resolve => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === 'inactive') { resolve(); return; }
      recorder.onstop = async () => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        // Transcribe
        setTranscribing(true);
        try {
          const fd = new FormData();
          fd.append('audio', blob, 'waddle.webm');
          const res = await fetch('/api/transcribe', { method: 'POST', body: fd });
          const data = await res.json();
          setTranscription(data.text || '');
        } catch { setTranscription('[transcription failed]'); }
        setTranscribing(false);
        resolve();
      };
      recorder.stop();
    });
  }

  async function getThinkerReaction() {
    if (!transcription) return;
    setReacting(true);
    try {
      const res = await fetch('/api/thinker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thinkerId: selectedThinker,
          message: `A member recorded a 15-second Waddle. Here is what they said: "${transcription}". Respond in 1-2 sentences. Be sharp and in character.`,
          history: [], walletMemberId: memberId,
        }),
      });
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = '', full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.delta) { full += evt.delta; setThinkerReaction(full); }
          } catch {}
        }
      }
    } catch {}
    setReacting(false);
  }

  async function saveWaddle() {
    if (!audioBlob || !transcription) return;
    setSaving(true);
    const fd = new FormData();
    fd.append('audio', audioBlob, 'waddle.webm');
    fd.append('transcription', transcription);
    if (memberId) fd.append('memberId', memberId);
    if (thinkerReaction) { fd.append('thinkerReaction', thinkerReaction); fd.append('thinkerId', selectedThinker); }
    await fetch('/api/waddle', { method: 'POST', body: fd }).catch(() => {});
    setSaving(false); setSaved(true);
    // Refresh feed
    fetch('/api/waddle').then(r => r.json()).then(d => setFeed(d.waddles || [])).catch(() => {});
  }

  const progressPct = (elapsed / MAX_SECONDS) * 100;
  const activeThinker = THINKERS.find(t => t.id === selectedThinker) || THINKERS[0];

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to bottom, #000, transparent)' }}>
        <a href="/salon" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, textDecoration: 'none', opacity: 0.7 }}>← RETURN TO THE SALON</a>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5 }}>SOCIETY OF EXPLORERS</div>
      </nav>

      {/* Header */}
      <div style={{ textAlign: 'center', padding: '80px 2rem 40px' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.5em', color: gold, opacity: 0.5, marginBottom: '1.5rem' }}>TWIDDLETWATTLE</div>
        <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 300, letterSpacing: '0.15em', color: parchment, marginBottom: '1rem' }}>
          THE WADDLE FORGE
        </h1>
        <p style={{ fontSize: '1.1rem', color: muted, fontStyle: 'italic', maxWidth: '500px', margin: '0 auto', lineHeight: 1.8 }}>
          Record 15 seconds. Own it forever. A Waddle is a thought made permanent — your voice, transcribed, stored, yours.
        </p>
      </div>

      {/* Recorder */}
      <div style={{ maxWidth: '500px', margin: '0 auto', padding: '0 2rem 4rem', textAlign: 'center' }}>
        {/* Record button with progress ring */}
        <div style={{ position: 'relative', width: '120px', height: '120px', margin: '2rem auto' }}>
          <svg width="120" height="120" viewBox="0 0 120 120" style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)' }}>
            <circle cx="60" cy="60" r="54" fill="none" stroke={`${gold}22`} strokeWidth="3" />
            <circle cx="60" cy="60" r="54" fill="none" stroke={isRecording ? '#BF4040' : gold} strokeWidth="3"
              strokeDasharray={`${2 * Math.PI * 54}`}
              strokeDashoffset={`${2 * Math.PI * 54 * (1 - progressPct / 100)}`}
              style={{ transition: 'stroke-dashoffset 0.3s' }} />
          </svg>
          <button
            onMouseDown={startRecording} onMouseUp={() => isRecording && stopRecording()}
            onTouchStart={startRecording} onTouchEnd={() => isRecording && stopRecording()}
            style={{
              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              width: '80px', height: '80px', borderRadius: '50%',
              background: isRecording ? 'rgba(191,64,64,0.3)' : `${gold}15`,
              border: `2px solid ${isRecording ? '#BF4040' : gold}`,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em',
              color: isRecording ? '#BF4040' : gold,
            }}
          >
            {isRecording ? `${MAX_SECONDS - elapsed}s` : 'HOLD'}
          </button>
        </div>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: muted, marginBottom: '2rem' }}>
          {isRecording ? 'RECORDING...' : 'HOLD TO RECORD · 15 SECONDS MAX'}
        </div>

        {/* Transcribing */}
        {transcribing && (
          <div style={{ padding: '1.5rem', color: muted, fontStyle: 'italic' }}>Transcribing your Waddle...</div>
        )}

        {/* Result */}
        {transcription && !transcribing && (
          <div style={{ border: `1px solid ${gold}22`, background: '#0d0d0d', padding: '2rem', marginBottom: '1.5rem', textAlign: 'left' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, opacity: 0.5, marginBottom: '1rem' }}>YOUR WADDLE</div>
            <p style={{ fontSize: '16px', color: parchment, lineHeight: 1.8, marginBottom: '1rem' }}>{transcription}</p>

            {audioUrl && (
              <audio controls src={audioUrl} style={{ width: '100%', marginBottom: '1rem', filter: 'invert(0.8) sepia(0.5) hue-rotate(10deg)' }} />
            )}

            {/* Thinker reaction */}
            {!thinkerReaction && !reacting && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.15em', color: muted, marginBottom: '0.5rem' }}>GET A THINKER REACTION</div>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '0.5rem' }}>
                  {THINKERS.map(t => (
                    <button key={t.id} onClick={() => setSelectedThinker(t.id)} style={{
                      fontFamily: 'Cinzel, serif', fontSize: '12px',
                      color: selectedThinker === t.id ? gold : `${parchment}30`,
                      background: selectedThinker === t.id ? `${gold}15` : 'none',
                      border: selectedThinker === t.id ? `1px solid ${gold}44` : '1px solid transparent',
                      width: '28px', height: '28px', cursor: 'pointer',
                    }}>{t.symbol}</button>
                  ))}
                </div>
                <button onClick={getThinkerReaction} style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, background: 'none', border: `1px solid ${gold}33`, padding: '6px 14px', cursor: 'pointer' }}>
                  ASK {activeThinker.name.toUpperCase()}
                </button>
              </div>
            )}
            {reacting && <div style={{ fontSize: '13px', color: muted, fontStyle: 'italic' }}>{activeThinker.name} is listening...</div>}
            {thinkerReaction && (
              <div style={{ borderLeft: `2px solid ${gold}33`, paddingLeft: '12px', marginBottom: '1rem' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, opacity: 0.6, marginBottom: '0.25rem' }}>{activeThinker.symbol} {activeThinker.name.toUpperCase()}</div>
                <p style={{ fontSize: '14px', color: parchment, lineHeight: 1.7, fontStyle: 'italic' }}>{thinkerReaction}</p>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button onClick={saveWaddle} disabled={saving || saved} style={{
                fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em',
                color: saved ? '#6B9E6B' : '#000', background: saved ? 'transparent' : gold,
                border: saved ? `1px solid #6B9E6B` : 'none', padding: '8px 16px', cursor: 'pointer',
              }}>
                {saved ? '✓ SAVED' : saving ? 'SAVING...' : '⬡ SAVE TO ARCHIVE'}
              </button>
              <button onClick={() => { navigator.clipboard.writeText(`"${transcription}" — recorded at the Waddle Forge, societyofexplorers.com/waddle`); }} style={{
                fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, background: 'none', border: `1px solid ${gold}33`, padding: '8px 16px', cursor: 'pointer',
              }}>⬡ SHARE</button>
              <button style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: muted, background: 'none', border: `1px solid ${gold}15`, padding: '8px 16px', cursor: 'default', opacity: 0.5 }}>
                ⬡ MINT NFT (SOON)
              </button>
            </div>
          </div>
        )}

        {/* New Waddle button */}
        {transcription && !transcribing && (
          <button onClick={() => { setTranscription(''); setAudioBlob(null); setAudioUrl(''); setThinkerReaction(''); setSaved(false); setElapsed(0); }}
            style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: muted, background: 'none', border: 'none', cursor: 'pointer', marginBottom: '3rem' }}>
            RECORD ANOTHER WADDLE
          </button>
        )}
      </div>

      {/* Feed */}
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '0 2rem 4rem' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.3em', color: gold, opacity: 0.5, marginBottom: '1.5rem' }}>RECENT WADDLES</div>
        {feed.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem', color: muted, fontStyle: 'italic', opacity: 0.5 }}>
            No Waddles yet. Be the first to speak.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: `${gold}12` }}>
          {feed.map(w => (
            <div key={w.id} style={{ background: '#0d0d0d', padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.1em', color: gold }}>{w.members?.display_name || 'Explorer'}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', color: muted }}>{new Date(w.created_at).toLocaleDateString()}</div>
              </div>
              <p style={{ fontSize: '14px', color: parchment, lineHeight: 1.7, marginBottom: '0.75rem' }}>
                {w.transcription?.slice(0, 200)}{w.transcription?.length > 200 ? '...' : ''}
              </p>
              {w.audio_url && (
                <audio controls src={w.audio_url} style={{ width: '100%', height: '32px', marginBottom: '0.5rem', filter: 'invert(0.8) sepia(0.5) hue-rotate(10deg)' }} />
              )}
              {w.thinker_reaction && (
                <div style={{ borderLeft: `2px solid ${gold}22`, paddingLeft: '10px', marginTop: '0.5rem' }}>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.1em', color: gold, opacity: 0.5 }}>{(w.thinker_id || '').toUpperCase()}</span>
                  <p style={{ fontSize: '12px', color: muted, fontStyle: 'italic', lineHeight: 1.6 }}>{w.thinker_reaction}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <footer style={{ padding: '3rem 2rem', borderTop: `1px solid ${gold}22`, textAlign: 'center' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: gold, opacity: 0.4 }}>SOCIETY OF EXPLORERS · THE WADDLE FORGE</div>
      </footer>
    </div>
  );
}
