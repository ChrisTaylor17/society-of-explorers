'use client';
import { useState, useEffect, useRef, useCallback } from 'react';

import { hasAccess } from '@/lib/auth/checkAccess';
import { getMemberSession, getSupabaseAccessToken } from '@/lib/auth/getSession';
import { ThinkerRewardNotice, useThinkerRewards } from '@/components/ThinkerRewardNotice';
import { readGuideReply, guideReplyNotice } from '@/lib/claude/guideReply';
import { useGuideRequest } from '@/lib/claude/useGuideRequest';
import { subscribeAuthProviderChanges } from '@/lib/auth/providerSelection';
import CopyWaddleButton from './CopyWaddleButton';

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

type WaddleFeedItem = {
  id: string;
  audio_url?: string | null;
  transcription?: string | null;
  thinker_id?: string | null;
  thinker_reaction?: string | null;
  created_at: string;
};

type WaddleMember = {
  id: string;
  tier?: string | null;
};

export default function WaddleForge() {
  const reward = useThinkerRewards();
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [transcription, setTranscription] = useState('');
  const [transcribing, setTranscribing] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState('');
  const [selectedThinker, setSelectedThinker] = useState('socrates');
  const [thinkerReaction, setThinkerReaction] = useState('');
  const [reacting, setReacting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [publishError, setPublishError] = useState('');
  const [cardStatus, setCardStatus] = useState<'idle' | 'generating' | 'done'>('idle');
  const [feed, setFeed] = useState<WaddleFeedItem[]>([]);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [memberTier, setMemberTier] = useState('free');
  const [reactionComplete, setReactionComplete] = useState(false);
  const [reactionNotice, setReactionNotice] = useState('');
  const [reactionThinker, setReactionThinker] = useState('socrates');
  const retireGuide = useCallback(() => {
    setThinkerReaction(''); setReactionComplete(false); setReacting(false);
    setMemberId(null); setMemberTier('free');
    setReactionNotice('Account changed. Sign in again before asking for a reaction.');
  }, []);
  const { begin: beginGuide, owns: ownsGuide, finish: finishGuide, cancel: cancelGuide } = useGuideRequest(retireGuide);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const MAX_SECONDS = 15;

  // Load member + feed
  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeAuthProviderChanges(() => { active = false; });
    getMemberSession().then(s => {
      const member = s?.member as WaddleMember | undefined;
      if (active && member?.id) {
        setMemberId(member.id);
        setMemberTier(member.tier || 'free');
      }
    });
    fetch('/api/waddle', { cache: 'no-store' })
      .then(r => r.json())
      .then((d: { waddles?: WaddleFeedItem[] }) => setFeed(d.waddles || []))
      .catch(() => {});
    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    if (audioUrl) return () => URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  async function startRecording() {
    chunksRef.current = [];
    setElapsed(0); setAudioBlob(null); setAudioUrl(''); setTranscription(''); setThinkerReaction(''); setSaved(false);
    setTranscriptionError(''); setPublishError('');
    setReactionComplete(false); setReactionNotice('');

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

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.onstop = () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      setAudioBlob(blob);
      setAudioUrl(URL.createObjectURL(blob));
      setIsRecording(false);
    };
    recorder.stop();
  }

  async function transcribeWaddle() {
    if (!audioBlob || transcribing) return;
    setTranscribing(true);
    setTranscriptionError('');
    try {
      const fd = new FormData();
      fd.append('audio', audioBlob, 'waddle.webm');
      fd.append('consentToTranscription', 'true');
      const accessToken = await getSupabaseAccessToken();
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        body: fd,
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        cache: 'no-store',
        redirect: 'error',
      });
      if (!res.ok) throw new Error('Transcription unavailable');
      const data = await res.json();
      if (typeof data?.text !== 'string' || !data.text.trim()) throw new Error('Transcription was empty');
      setTranscription(data.text);
    } catch {
      setTranscriptionError('Could not transcribe this recording. Try again or make a new recording.');
    } finally {
      setTranscribing(false);
    }
  }

  async function getThinkerReaction() {
    if (!memberId || !transcription) return;
    const controller = beginGuide();
    if (!controller) return;
    const requestId = reward.begin(THINKERS.find(thinker => thinker.id === selectedThinker)?.name ?? 'Thinker');
    if (!requestId) { finishGuide(controller); return; }
    setReacting(true); setThinkerReaction(''); setReactionComplete(false); setReactionNotice(''); setReactionThinker(selectedThinker);
    try {
      const accessToken = await getSupabaseAccessToken();
      if (!ownsGuide(controller)) return;
      if (controller.signal.aborted) { setReactionNotice(guideReplyNotice('cancelled')); return; }
      const res = await fetch('/api/thinker', {
        method: 'POST', signal: controller.signal,
        credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        body: JSON.stringify({ requestId, thinkerId: selectedThinker, salonId: `private-${memberId}`,
          message: `A member recorded a 15-second Waddle. Here is what they said: "${transcription}". Respond in 1-2 sentences. Be sharp and in character.`, history: [] }),
      });
      const reply = await readGuideReply(res, { signal: controller.signal,
        onText: text => { if (ownsGuide(controller)) setThinkerReaction(text); } });
      if (!ownsGuide(controller)) return;
      setThinkerReaction(reply.text); setReactionNotice(guideReplyNotice(reply.status));
      setReactionComplete(reply.status === 'complete');
      if (reply.status === 'complete') reward.observe(requestId, reply.reward);
    } catch {
      if (ownsGuide(controller)) setReactionNotice(guideReplyNotice(controller.signal.aborted ? 'cancelled' : 'interrupted'));
    } finally {
      reward.finish(requestId);
      if (ownsGuide(controller)) setReacting(false);
      finishGuide(controller);
    }
  }

  async function publishWaddle() {
    if (!memberId || !audioBlob || !transcription || reacting) return;
    setSaving(true);
    setPublishError('');
    try {
      const fd = new FormData();
      fd.append('audio', audioBlob, 'waddle.webm');
      fd.append('transcription', transcription);
      fd.append('expectedMemberId', memberId);
      fd.append('publishPublicly', 'true');
      if (reactionComplete && thinkerReaction) { fd.append('thinkerReaction', thinkerReaction); fd.append('thinkerId', reactionThinker); }
      const accessToken = await getSupabaseAccessToken();
      const res = await fetch('/api/waddle', {
        method: 'POST',
        cache: 'no-store',
        redirect: 'error',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        body: fd,
      });
      if (!res.ok) throw new Error('Publication unavailable');
      setSaved(true);
      fetch('/api/waddle', { cache: 'no-store' })
        .then(r => r.json())
        .then((d: { waddles?: WaddleFeedItem[] }) => setFeed(d.waddles || []))
        .catch(() => {});
    } catch {
      setPublishError('Could not confirm publication. Check your account and the public feed.');
    } finally {
      setSaving(false);
    }
  }

  function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, maxW: number, lineH: number, maxLines: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width > maxW && current) {
        lines.push(current);
        current = word;
        if (lines.length >= maxLines) { lines[lines.length - 1] += '...'; current = ''; break; }
      } else { current = test; }
    }
    if (current && lines.length < maxLines) lines.push(current);
    return lines;
  }

  function drawHexagon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      if (i === 0) ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
      else ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    ctx.closePath();
  }

  async function generateCard(mode: 'download' | 'clipboard') {
    if (!reactionComplete || !thinkerReaction) return;
    setCardStatus('generating');
    const W = 1080, H = 1080;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    // Background
    ctx.fillStyle = '#0A0A0A';
    ctx.fillRect(0, 0, W, H);

    // Gold border
    ctx.strokeStyle = gold;
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 20, W - 40, H - 40);

    // Corner hexagons
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = gold;
    ctx.lineWidth = 1;
    for (const [cx, cy] of [[60, 60], [W - 60, 60], [60, H - 60], [W - 60, H - 60]]) {
      drawHexagon(ctx, cx, cy, 25);
      ctx.stroke();
      drawHexagon(ctx, cx, cy, 40);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Header
    ctx.fillStyle = gold;
    ctx.font = '600 20px serif';
    ctx.textAlign = 'center';
    ctx.letterSpacing = '6px';
    ctx.fillText('SOCIETY OF EXPLORERS', W / 2, 100);
    ctx.letterSpacing = '0px';

    // Transcription
    ctx.fillStyle = '#E8DCC8';
    ctx.font = '36px serif';
    const transLines = wrapText(ctx, `"${transcription}"`, W / 2, W - 160, 48, 4);
    const transY = 300 - (transLines.length * 48) / 2;
    transLines.forEach((line, i) => ctx.fillText(line, W / 2, transY + i * 48));

    // Gold rule
    const ruleY = transY + transLines.length * 48 + 40;
    ctx.strokeStyle = gold;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W / 2 - 100, ruleY); ctx.lineTo(W / 2 + 100, ruleY); ctx.stroke();
    ctx.globalAlpha = 1;

    // Thinker reaction
    if (thinkerReaction) {
      ctx.fillStyle = '#9a8f7a';
      ctx.font = 'italic 28px serif';
      const reactLines = wrapText(ctx, thinkerReaction, W / 2, W - 180, 40, 4);
      const reactY = ruleY + 50;
      reactLines.forEach((line, i) => ctx.fillText(line, W / 2, reactY + i * 40));

      // Thinker name
      const nameY = reactY + reactLines.length * 40 + 40;
      ctx.fillStyle = gold;
      ctx.font = '600 18px serif';
      ctx.fillText(`${activeThinker.symbol}  ${activeThinker.name.toUpperCase()}`, W / 2, nameY);
    }

    // Footer
    ctx.fillStyle = gold;
    ctx.globalAlpha = 0.4;
    ctx.font = '16px serif';
    ctx.fillText('societyofexplorers.com/waddle', W / 2, H - 50);
    ctx.globalAlpha = 1;

    // Export
    canvas.toBlob(async (blob) => {
      if (!blob) { setCardStatus('idle'); return; }
      if (mode === 'download') {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `waddle-${Date.now()}.png`; a.click();
        URL.revokeObjectURL(url);
      } else {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        } catch { /* fallback: download instead */
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = `waddle-${Date.now()}.png`; a.click();
          URL.revokeObjectURL(url);
        }
      }
      setCardStatus('done');
      setTimeout(() => setCardStatus('idle'), 2000);
    }, 'image/png');
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
          Record a short thought. Listen before choosing to send it for transcription or publish it to the public feed.
        </p>
      </div>

      {/* Recorder */}
      <div style={{ maxWidth: '500px', margin: '0 auto', padding: '0 2rem 4rem', textAlign: 'center' }}>
        <ThinkerRewardNotice reward={reward} />
        {!hasAccess(memberTier, 'seeker') && !transcription && (
          <div style={{ padding: '2rem', border: `1px solid ${gold}22`, background: '#0d0d0d', marginBottom: '2rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '1.5rem', color: gold, opacity: 0.2, marginBottom: '1rem' }}>⬡</div>
            <p style={{ fontSize: '1rem', color: muted, marginBottom: '1rem' }}>Recording requires a membership.</p>
            <a href="/join" style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: '#000', background: gold, padding: '8px 20px', textDecoration: 'none' }}>UPGRADE TO RECORD</a>
          </div>
        )}
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
            disabled={transcribing || saving || reacting}
            onMouseDown={() => hasAccess(memberTier, 'seeker') && startRecording()} onMouseUp={() => isRecording && stopRecording()}
            onTouchStart={() => hasAccess(memberTier, 'seeker') && startRecording()} onTouchEnd={() => isRecording && stopRecording()}
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

        {audioUrl && !transcription && (
          <div style={{ border: `1px solid ${gold}22`, padding: '1.5rem', marginBottom: '1.5rem' }}>
            <audio controls src={audioUrl} style={{ width: '100%' }} />
            <p style={{ color: parchment }}>This sends the recording to OpenAI to turn it into text.</p>
            <button type="button" onClick={transcribeWaddle} disabled={transcribing}
              style={{ padding: '10px 18px', background: gold, color: '#000', border: 'none' }}>
              {transcribing ? 'Transcribing…' : 'Transcribe with OpenAI'}
            </button>
            {transcriptionError && <p role="alert" style={{ color: parchment }}>{transcriptionError}</p>}
          </div>
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
            {(!thinkerReaction || reactionNotice) && !reacting && (
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
            {reactionNotice && <p role="alert" style={{ color: parchment, lineHeight: 1.5 }}>{reactionNotice} Incomplete reactions are excluded from publishing and cards.</p>}
            {reacting && <button type="button" onClick={cancelGuide} style={{ minHeight: 44, padding: '8px 12px' }}>Stop reaction</button>}
            {reacting && <div style={{ fontSize: '13px', color: muted, fontStyle: 'italic' }}>{activeThinker.name} is listening...</div>}
            {thinkerReaction && (
              <div style={{ borderLeft: `2px solid ${gold}33`, paddingLeft: '12px', marginBottom: '1rem' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', color: gold, opacity: 0.6, marginBottom: '0.25rem' }}>{THINKERS.find(t => t.id === reactionThinker)?.name.toUpperCase()}</div>
                <p style={{ fontSize: '14px', color: parchment, lineHeight: 1.7, fontStyle: 'italic' }}>{thinkerReaction}</p>
              </div>
            )}

            {/* Actions */}
            <p style={{ color: parchment }}>Anyone can listen to the recording and read the transcript after you publish it.</p>
            {publishError && <p role="alert" style={{ color: parchment }}>{publishError}</p>}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button type="button" onClick={publishWaddle} disabled={saving || saved || reacting} style={{
                fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em',
                color: saved ? '#6B9E6B' : '#000', background: saved ? 'transparent' : gold,
                border: saved ? `1px solid #6B9E6B` : 'none', padding: '8px 16px', cursor: 'pointer',
              }}>
                {saved ? 'Published' : saving ? 'Publishing…' : 'Publish recording and transcript'}
              </button>
              <CopyWaddleButton key={transcription} transcription={transcription} />
              {reactionComplete && thinkerReaction && (
                <>
                  <button onClick={() => generateCard('download')} disabled={cardStatus === 'generating'} style={{
                    fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em',
                    color: cardStatus === 'done' ? '#6B9E6B' : gold, background: 'none',
                    border: `1px solid ${cardStatus === 'done' ? '#6B9E6B' : gold}33`, padding: '8px 16px', cursor: 'pointer',
                  }}>
                    {cardStatus === 'generating' ? '⬡ CREATING...' : cardStatus === 'done' ? '⬡ DOWNLOADED!' : '⬡ CREATE CARD'}
                  </button>
                  <button onClick={() => generateCard('clipboard')} style={{
                    fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em',
                    color: muted, background: 'none', border: `1px solid ${gold}15`, padding: '8px 16px', cursor: 'pointer',
                  }}>⬡ COPY IMAGE</button>
                </>
              )}
            </div>
          </div>
        )}

        {/* New Waddle button */}
        {transcription && !transcribing && (
          <button disabled={saving || reacting} onClick={() => {
            setTranscription(''); setAudioBlob(null); setAudioUrl(''); setThinkerReaction(''); setSaved(false); setElapsed(0); setPublishError(''); setReactionComplete(false); setReactionNotice('');
          }}
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
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.1em', color: gold }}>Explorer</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', color: muted }}>{new Date(w.created_at).toLocaleDateString()}</div>
              </div>
              <p style={{ fontSize: '14px', color: parchment, lineHeight: 1.7, marginBottom: '0.75rem' }}>
                {(w.transcription || '').slice(0, 200)}{(w.transcription || '').length > 200 ? '...' : ''}
              </p>
              {w.audio_url && (
                <audio controls preload="none" src={w.audio_url} style={{ width: '100%', height: '32px', marginBottom: '0.5rem', filter: 'invert(0.8) sepia(0.5) hue-rotate(10deg)' }} />
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
