'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { getMemberSession } from '@/lib/auth/getSession';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#888';
const card = '#0d0d0d';
const border = '1px solid rgba(201,168,76,0.15)';

const thinkers = [
  { id: 'socrates', name: 'Socrates', line: 'Questions assumptions.' },
  { id: 'aurelius', name: 'Aurelius', line: 'Finds the next action.' },
  { id: 'jobs', name: 'Jobs', line: 'Sharpens taste and focus.' },
] as const;

type ThinkerId = (typeof thinkers)[number]['id'];
type SessionStatus = 'idle' | 'checking' | 'connecting' | 'connected' | 'error';

const genericVoiceSessionFailure = 'Unable to open voice session. Check sign-in, microphone permission, and try again.';

function reportVoiceCouncilClientFailure(scope: string) {
  console.warn(`[movement/voice-council] ${scope} failed`);
}

export default function VoiceCouncilPage() {
  const [selectedThinker, setSelectedThinker] = useState<ThinkerId>('socrates');
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [message, setMessage] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  const [transcriptRetention, setTranscriptRetention] = useState(false);
  const [memoryExtraction, setMemoryExtraction] = useState(false);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const mediaRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopSession = useCallback(() => {
    channelRef.current?.close();
    pcRef.current?.close();
    mediaRef.current?.getTracks().forEach((track) => track.stop());
    channelRef.current = null;
    pcRef.current = null;
    mediaRef.current = null;
    setStatus('idle');
  }, []);

  useEffect(() => {
    async function checkSession() {
      setStatus('checking');
      const session = await getMemberSession().catch(() => null);
      setSignedIn(Boolean(session?.member));
      setStatus('idle');
    }

    checkSession();
    return () => stopSession();
  }, [stopSession]);

  async function startSession() {
    setMessage('');
    setEvents([]);

    if (signedIn === false) {
      setMessage('Sign in before opening a voice session.');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage('This browser does not expose microphone access.');
      setStatus('error');
      return;
    }

    stopSession();
    setStatus('connecting');

    try {
      const tokenResponse = await fetch('/api/movement/realtime/session', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thinkerId: selectedThinker,
          consent: {
            transcriptRetention,
            memoryExtraction,
          },
        }),
      });
      const tokenData = await tokenResponse.json().catch(() => null);
      if (!tokenResponse.ok) throw new Error('realtime-token-failed');

      const ephemeralKey =
        tokenData && typeof tokenData.value === 'string'
          ? tokenData.value
          : tokenData && typeof tokenData.client_secret?.value === 'string'
            ? tokenData.client_secret.value
            : null;
      if (!ephemeralKey) throw new Error('realtime-token-missing');

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      pc.ontrack = (event) => {
        if (audioRef.current) {
          audioRef.current.srcObject = event.streams[0];
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') setStatus('connected');
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setStatus('error');
          setMessage('Voice session disconnected.');
        }
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRef.current = mediaStream;
      mediaStream.getAudioTracks().forEach((track) => pc.addTrack(track, mediaStream));

      const channel = pc.createDataChannel('oai-events');
      channelRef.current = channel;
      channel.addEventListener('open', () => {
        setEvents((current) => ['channel.open', ...current].slice(0, 8));
      });
      channel.addEventListener('message', (event) => {
        try {
          const payload = JSON.parse(event.data);
          const type = typeof payload.type === 'string' ? payload.type : 'event';
          setEvents((current) => [type, ...current].slice(0, 8));
        } catch {
          setEvents((current) => ['event', ...current].slice(0, 8));
        }
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          'Content-Type': 'application/sdp',
        },
      });

      if (!sdpResponse.ok) {
        throw new Error('realtime-call-failed');
      }

      const answer: RTCSessionDescriptionInit = {
        type: 'answer',
        sdp: await sdpResponse.text(),
      };
      await pc.setRemoteDescription(answer);
    } catch {
      reportVoiceCouncilClientFailure('start');
      stopSession();
      setStatus('error');
      setMessage(genericVoiceSessionFailure);
    }
  }

  const connected = status === 'connected';
  const connecting = status === 'connecting' || status === 'checking';

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      <main style={{ maxWidth: '980px', margin: '0 auto', padding: '8rem 2rem 6rem' }}>
        <header style={{ marginBottom: '2rem' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.3em', color: gold, marginBottom: '1rem' }}>
            LIVE COUNCIL
          </div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(32px, 6vw, 54px)', fontStyle: 'italic', fontWeight: 400, lineHeight: 1.12, margin: '0 0 1rem' }}>
            Speak with a thinker.
          </h1>
          <p style={{ fontSize: '18px', lineHeight: 1.7, color: ivory85, maxWidth: '700px', margin: 0 }}>
            A short-lived voice session for testing live philosophical practice. The main API key stays server-side; the browser receives only a temporary Realtime client secret.
          </p>
        </header>

        {signedIn === false ? (
          <section style={{ background: card, border, padding: '2rem', textAlign: 'center' }}>
            <p style={{ color: muted, fontSize: '16px', fontStyle: 'italic', margin: '0 0 1.5rem' }}>
              Sign in to open the live Council.
            </p>
            <a href="/login" style={linkButtonStyle}>
              SIGN IN
            </a>
          </section>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '1.25rem', alignItems: 'start' }}>
            <section style={{ background: card, border, padding: '1.5rem' }}>
              <div style={eyebrowStyle}>THINKER</div>
              <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '1.25rem' }}>
                {thinkers.map((thinker) => (
                  <button
                    key={thinker.id}
                    onClick={() => setSelectedThinker(thinker.id)}
                    disabled={connected || connecting}
                    style={thinkerButtonStyle(selectedThinker === thinker.id, connected || connecting)}
                  >
                    <span style={{ fontFamily: 'Playfair Display, serif', fontSize: '22px', lineHeight: 1.1 }}>
                      {thinker.name}
                    </span>
                    <span style={{ color: muted, fontSize: '14px', lineHeight: 1.4 }}>{thinker.line}</span>
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button onClick={startSession} disabled={connected || connecting} style={buttonStyle('gold', connected || connecting)}>
                  {connecting ? 'OPENING' : 'START VOICE'}
                </button>
                <button onClick={stopSession} disabled={!connected && status !== 'error'} style={buttonStyle('neutral', !connected && status !== 'error')}>
                  STOP
                </button>
              </div>

              {message && (
                <p style={{ color: muted, fontSize: '15px', fontStyle: 'italic', lineHeight: 1.6, margin: '1rem 0 0' }}>
                  {message}
                </p>
              )}
            </section>

            <section style={{ background: card, border, padding: '1.5rem' }}>
              <div style={eyebrowStyle}>CONSENT</div>
              <div style={{ display: 'grid', gap: '0.85rem' }}>
                <ConsentToggle
                  label="Retain transcript"
                  description="Allow this prototype to treat the session transcript as retainable after the call."
                  checked={transcriptRetention}
                  disabled={connected || connecting}
                  onChange={setTranscriptRetention}
                />
                <ConsentToggle
                  label="Extract memory"
                  description="Allow this session to produce proposed memory after explicit review."
                  checked={memoryExtraction}
                  disabled={connected || connecting}
                  onChange={setMemoryExtraction}
                />
              </div>
              <p style={{ color: muted, fontSize: '14px', lineHeight: 1.55, margin: '1rem 0 0' }}>
                Both controls start off. The current local prototype does not write voice transcripts or memories from this page.
              </p>
            </section>

            <section style={{ background: card, border, padding: '1.5rem' }}>
              <div style={eyebrowStyle}>SESSION</div>
              <div style={{ display: 'grid', gap: '1rem' }}>
                <Status label="State" value={status.toUpperCase()} />
                <Status label="Selected thinker" value={thinkers.find((thinker) => thinker.id === selectedThinker)?.name || selectedThinker} />
                <Status label="Transport" value="WebRTC audio + data channel" />
                <Status label="Transcript" value={transcriptRetention ? 'Opted in for this session' : 'Off by default'} />
                <Status label="Memory" value={memoryExtraction ? 'Opted in for this session' : 'Off by default'} />
              </div>
              <audio ref={audioRef} autoPlay />
            </section>

            <section style={{ background: card, border, padding: '1.5rem' }}>
              <div style={eyebrowStyle}>EVENT TRACE</div>
              {events.length === 0 ? (
                <p style={{ color: muted, fontSize: '15px', lineHeight: 1.6, fontStyle: 'italic', margin: 0 }}>
                  Events appear after the data channel opens.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: '0.65rem' }}>
                  {events.map((event, index) => (
                    <div key={`${event}-${index}`} style={{ color: ivory85, fontSize: '14px', borderTop: border, paddingTop: '0.65rem' }}>
                      {event}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      <PublicFooter />
    </div>
  );
}

function Status({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ borderTop: border, paddingTop: '0.85rem' }}>
      <div style={{ ...eyebrowStyle, color: 'rgba(245,240,232,0.55)', marginBottom: '0.35rem' }}>
        {label.toUpperCase()}
      </div>
      <p style={{ color: ivory85, fontSize: '16px', lineHeight: 1.45, margin: 0 }}>{value}</p>
    </div>
  );
}

function ConsentToggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label style={consentToggleStyle(disabled)}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
        style={{ accentColor: gold }}
      />
      <span>
        <span style={{ color: parchment, fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.14em', display: 'block' }}>
          {label.toUpperCase()}
        </span>
        <span style={{ color: muted, fontSize: '14px', lineHeight: 1.45, display: 'block', marginTop: '0.25rem' }}>
          {description}
        </span>
      </span>
    </label>
  );
}

function thinkerButtonStyle(active: boolean, disabled: boolean): CSSProperties {
  return {
    border: active ? '1px solid rgba(201,168,76,0.8)' : border,
    background: active ? 'rgba(201,168,76,0.1)' : 'transparent',
    color: parchment,
    padding: '1rem',
    textAlign: 'left',
    display: 'grid',
    gap: '0.35rem',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled && !active ? 0.45 : 1,
  };
}

function consentToggleStyle(disabled: boolean): CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: '18px minmax(0, 1fr)',
    gap: '0.75rem',
    alignItems: 'start',
    borderTop: border,
    paddingTop: '0.85rem',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
  };
}

function buttonStyle(kind: 'gold' | 'neutral', disabled: boolean): CSSProperties {
  return {
    height: '44px',
    border: kind === 'gold' ? 'none' : border,
    background: kind === 'gold' ? gold : 'transparent',
    color: kind === 'gold' ? '#0a0a0a' : gold,
    fontFamily: 'Cinzel, serif',
    fontSize: '9px',
    letterSpacing: '0.16em',
    padding: '0 16px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
  };
}

const eyebrowStyle: CSSProperties = {
  fontFamily: 'Cinzel, serif',
  fontSize: '8px',
  letterSpacing: '0.2em',
  color: gold,
  marginBottom: '0.75rem',
};

const linkButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: '44px',
  background: gold,
  color: '#0a0a0a',
  fontFamily: 'Cinzel, serif',
  fontSize: '9px',
  letterSpacing: '0.16em',
  padding: '0 18px',
  textDecoration: 'none',
};
