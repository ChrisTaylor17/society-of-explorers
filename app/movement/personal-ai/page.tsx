'use client';

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import PublicFooter from '@/components/PublicFooter';
import PublicNav from '@/components/PublicNav';

const CINZEL = 'Cinzel, serif';
const CORMORANT = 'Cormorant Garamond, serif';
const PLAYFAIR = 'Playfair Display, serif';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const muted = '#9a8f7a';
const border = '1px solid rgba(200,168,75,0.15)';
const threshold = 30;

interface MirrorMessage {
  role: 'user' | 'assistant';
  content: string;
}

type MirrorState = 'loading' | 'not-ready' | 'ready' | 'signed-out' | 'error';

function remaining(count: number): number {
  return Math.max(0, threshold - count);
}

export default function MovementPersonalAiPage() {
  const [state, setState] = useState<MirrorState>('loading');
  const [responseCount, setResponseCount] = useState(0);
  const [messages, setMessages] = useState<MirrorMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [statusText, setStatusText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function rebuild() {
      try {
        const res = await fetch('/api/movement/personal-ai/rebuild', {
          method: 'POST',
          cache: 'no-store',
        });

        if (cancelled) return;
        if (res.status === 401) {
          setState('signed-out');
          return;
        }

        const data = await res.json();
        if (!res.ok) {
          setStatusText(data.error || 'The mirror is quiet right now.');
          setState('error');
          return;
        }

        if (data.ready === false) {
          setResponseCount(typeof data.responseCount === 'number' ? data.responseCount : 0);
          setState('not-ready');
          return;
        }

        setState('ready');
        if (typeof data.manifest?.opening_line === 'string') {
          setMessages((current) =>
            current.length === 0 ? [{ role: 'assistant', content: data.manifest.opening_line }] : current,
          );
        }
      } catch {
        if (!cancelled) {
          setStatusText('The mirror is quiet right now.');
          setState('error');
        }
      }
    }

    rebuild();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, streaming]);

  async function submit() {
    const text = draft.trim();
    if (!text || streaming || state !== 'ready') return;

    const userMessage: MirrorMessage = { role: 'user', content: text };
    const baseMessages = [...messages, userMessage];
    setMessages([...baseMessages, { role: 'assistant', content: '' }]);
    setDraft('');
    setStreaming(true);
    setStatusText('');

    try {
      const res = await fetch('/api/movement/personal-ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: messages.slice(-10),
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !res.body || contentType.includes('application/json')) {
        const data = await res.json().catch(() => ({}));
        if (data.ready === false) {
          setResponseCount(typeof data.responseCount === 'number' ? data.responseCount : 0);
          setState('not-ready');
          setMessages(baseMessages);
          return;
        }
        throw new Error(typeof data.error === 'string' ? data.error : 'Mirror failed.');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (typeof evt.delta === 'string') {
              accumulated += evt.delta;
              setMessages([...baseMessages, { role: 'assistant', content: accumulated }]);
            }
            if (typeof evt.error === 'string') throw new Error(evt.error);
          } catch (error) {
            if (error instanceof Error) throw error;
          }
        }
      }
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : 'Mirror failed.');
      setMessages(baseMessages);
    } finally {
      setStreaming(false);
      textareaRef.current?.focus();
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  const moreNeeded = remaining(responseCount);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: CORMORANT }}>
      <PublicNav />
      <main>
        <style>{`
          .personal-ai-shell {
            max-width: 720px;
            margin: 0 auto;
            padding: 96px 24px 64px;
          }
          .personal-ai-textarea::placeholder {
            color: #78716c;
            font-style: italic;
            opacity: 1;
          }
          @media (max-width: 768px) {
            .personal-ai-shell { padding: 64px 16px 48px; }
          }
        `}</style>

        <section className="personal-ai-shell">
          <header style={{ textAlign: 'center', marginBottom: '40px' }}>
            <div style={{ fontFamily: CINZEL, fontSize: '10px', letterSpacing: '0.25em', color: gold, marginBottom: '18px' }}>
              YOUR MIRROR
            </div>
            <h1
              style={{
                fontFamily: PLAYFAIR,
                fontStyle: 'italic',
                fontSize: 'clamp(28px, 4.5vw, 40px)',
                color: parchment,
                textAlign: 'center',
                fontWeight: 400,
                lineHeight: 1.2,
                margin: 0,
              }}
            >
              A voice that knows your voice.
            </h1>
            <div style={{ width: '40px', height: '1px', background: gold, opacity: 0.4, margin: '28px auto 22px' }} />
            <p style={{ fontFamily: CORMORANT, fontStyle: 'italic', fontSize: '16px', color: muted, textAlign: 'center', margin: 0 }}>
              {state === 'ready' ? 'Speak. It will reflect.' : 'Keep practicing. Your mirror is listening.'}
            </p>
          </header>

          {state === 'loading' && (
            <div style={{ minHeight: '280px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: muted, fontStyle: 'italic' }}>
              listening for your pattern...
            </div>
          )}

          {state === 'signed-out' && (
            <ProgressPanel
              label="SIGN IN REQUIRED"
              body="Your mirror needs your private practice history before it can reflect anything real."
              actionHref="/login"
              actionText="→ SIGN IN"
            />
          )}

          {state === 'error' && (
            <ProgressPanel
              label="MIRROR QUIET"
              body={statusText || 'The mirror is quiet right now.'}
              actionHref="/practice"
              actionText="→ TODAY'S QUESTION"
            />
          )}

          {state === 'not-ready' && (
            <ProgressPanel
              label={`${responseCount} / ${threshold} responses`}
              body={`Your mirror needs ${moreNeeded} more reflections before it can speak in your voice.`}
              actionHref="/practice"
              actionText="→ TODAY'S QUESTION"
            />
          )}

          {state === 'ready' && (
            <section style={{ border, padding: '32px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', minHeight: '300px', marginBottom: '32px' }}>
                {messages.map((message, index) => (
                  <p
                    key={`${message.role}-${index}`}
                    style={{
                      margin: 0,
                      marginLeft: message.role === 'user' ? 'auto' : 0,
                      maxWidth: '88%',
                      fontSize: '18px',
                      lineHeight: 1.7,
                      color: message.role === 'user' ? parchment : 'rgba(245,240,232,0.74)',
                      fontStyle: message.role === 'assistant' ? 'italic' : 'normal',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {message.content || (streaming && index === messages.length - 1 ? '...' : '')}
                  </p>
                ))}
                <div ref={bottomRef} />
              </div>

              <form onSubmit={onSubmit}>
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Say something to your mirror…"
                  rows={3}
                  className="personal-ai-textarea"
                  style={{
                    width: '100%',
                    backgroundColor: 'rgba(28, 25, 23, 0.5)',
                    border,
                    color: '#fef3c7',
                    fontFamily: CORMORANT,
                    fontSize: '18px',
                    lineHeight: 1.6,
                    padding: '18px',
                    outline: 'none',
                    resize: 'vertical',
                    marginBottom: '14px',
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <p style={{ margin: 0, color: muted, fontSize: '14px', fontStyle: 'italic' }}>
                    {statusText || 'Press Enter to reflect. Shift+Enter adds a line.'}
                  </p>
                  <button
                    type="submit"
                    disabled={!draft.trim() || streaming}
                    style={{
                      height: '42px',
                      border: 'none',
                      background: gold,
                      color: '#0a0a0a',
                      fontFamily: CINZEL,
                      fontSize: '10px',
                      letterSpacing: '0.18em',
                      padding: '0 22px',
                      cursor: !draft.trim() || streaming ? 'not-allowed' : 'pointer',
                      opacity: !draft.trim() || streaming ? 0.45 : 1,
                    }}
                  >
                    {streaming ? 'REFLECTING' : 'REFLECT'}
                  </button>
                </div>
              </form>
            </section>
          )}
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

function ProgressPanel({
  label,
  body,
  actionHref,
  actionText,
}: {
  label: string;
  body: string;
  actionHref: string;
  actionText: string;
}) {
  return (
    <section style={{ border, padding: '40px 32px', textAlign: 'center' }}>
      <div style={{ fontFamily: CINZEL, fontSize: '10px', letterSpacing: '0.25em', color: gold, marginBottom: '20px', textTransform: 'uppercase' }}>
        {label}
      </div>
      <p style={{ fontFamily: CORMORANT, fontStyle: 'italic', fontSize: '18px', lineHeight: 1.7, color: muted, maxWidth: '460px', margin: '0 auto 28px' }}>
        {body}
      </p>
      <Link
        href={actionHref}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          height: '44px',
          border,
          color: gold,
          fontFamily: CINZEL,
          fontSize: '10px',
          letterSpacing: '0.18em',
          padding: '0 20px',
          textDecoration: 'none',
        }}
      >
        {actionText}
      </Link>
    </section>
  );
}
