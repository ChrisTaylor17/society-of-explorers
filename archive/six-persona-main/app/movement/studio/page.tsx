'use client';

import { useEffect, useMemo, useState } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { getMemberSession } from '@/lib/auth/getSession';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#888';
const border = '1px solid rgba(201,168,76,0.15)';
const card = '#0d0d0d';

type QueueStatus = 'draft' | 'approved' | 'published' | 'archived';
type Platform = 'tiktok' | 'reels' | 'shorts';

interface QuestionSummary {
  question_text?: string;
  date?: string;
  thinker_id?: string;
}

interface StudioScript {
  id: string;
  question_id: string;
  platform: Platform;
  hook: string;
  script: string;
  visual_treatment: string | null;
  cta: string | null;
  duration_seconds: number | null;
  status: QueueStatus;
  created_at: string;
  daily_questions?: QuestionSummary | null;
}

function scriptCopy(script: StudioScript): string {
  return [
    `${script.platform.toUpperCase()} · ${script.duration_seconds || 60}s`,
    `Hook: ${script.hook}`,
    '',
    script.script,
    '',
    `Visual: ${script.visual_treatment || 'Open on the question, then cut to the speaker.'}`,
    `CTA: ${script.cta || '/practice'}`,
  ].join('\n');
}

export default function MovementStudioPage() {
  const [scripts, setScripts] = useState<StudioScript[]>([]);
  const [status, setStatus] = useState<QueueStatus>('draft');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [questionId, setQuestionId] = useState('');
  const [generating, setGenerating] = useState(false);

  const statusLabel = useMemo(() => status.toUpperCase(), [status]);

  async function loadQueue(nextStatus = status) {
    setLoading(true);
    setMessage('');
    try {
      const session = await getMemberSession();
      if (!session?.member) {
        setMessage('Sign in with an Oracle or founder account.');
        setScripts([]);
        return;
      }

      const res = await fetch(`/api/movement/scripts?status=${nextStatus}`);
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || 'Unable to load Movement scripts.');
        setScripts([]);
        return;
      }
      setScripts(Array.isArray(data.scripts) ? data.scripts : []);
    } catch (err) {
      console.error('[movement/studio] load failed', err);
      setMessage('Unable to load Movement scripts.');
      setScripts([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadQueue('draft');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function updateStatus(scriptId: string, nextStatus: QueueStatus) {
    setMessage('');
    try {
      const res = await fetch(`/api/movement/scripts/status/${scriptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || 'Status update failed.');
        return;
      }
      setScripts((current) => current.filter((script) => script.id !== scriptId));
      setMessage(`Marked ${nextStatus}.`);
    } catch (err) {
      console.error('[movement/studio] status failed', err);
      setMessage('Status update failed.');
    }
  }

  async function copyScript(script: StudioScript) {
    try {
      await navigator.clipboard.writeText(scriptCopy(script));
      setMessage('Copied script.');
    } catch (err) {
      console.error('[movement/studio] copy failed', err);
      setMessage('Copy failed.');
    }
  }

  async function generateForQuestion() {
    const id = questionId.trim();
    if (!id || generating) return;
    setGenerating(true);
    setMessage('');
    try {
      const res = await fetch('/api/movement/scripts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || 'Generation failed.');
        return;
      }
      setQuestionId('');
      setStatus('draft');
      await loadQueue('draft');
      setMessage(`Generated ${Array.isArray(data.scripts) ? data.scripts.length : 0} drafts.`);
    } catch (err) {
      console.error('[movement/studio] generation failed', err);
      setMessage('Generation failed.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      <main style={{ maxWidth: '1080px', margin: '0 auto', padding: '8rem 2rem 6rem' }}>
        <header style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.3em', color: gold, marginBottom: '1rem' }}>
            MOVEMENT STUDIO
          </div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(30px, 5vw, 46px)', fontWeight: 400, fontStyle: 'italic', lineHeight: 1.15, margin: 0 }}>
            Script queue.
          </h1>
        </header>

        <section style={{ background: card, border, padding: '1.25rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '0.75rem', alignItems: 'center' }}>
            <input
              value={questionId}
              onChange={(event) => setQuestionId(event.target.value)}
              placeholder="daily_questions.id"
              style={{
                minWidth: 0,
                background: '#111',
                border,
                color: parchment,
                fontFamily: 'Cormorant Garamond, serif',
                fontSize: '16px',
                padding: '0 14px',
                height: '44px',
                outline: 'none',
              }}
            />
            <button
              onClick={generateForQuestion}
              disabled={!questionId.trim() || generating}
              style={{
                height: '44px',
                border: 'none',
                background: gold,
                color: '#0a0a0a',
                fontFamily: 'Cinzel, serif',
                fontSize: '9px',
                letterSpacing: '0.16em',
                padding: '0 18px',
                cursor: questionId.trim() && !generating ? 'pointer' : 'not-allowed',
                opacity: questionId.trim() && !generating ? 1 : 0.45,
              }}
            >
              {generating ? 'GENERATING' : 'GENERATE'}
            </button>
          </div>
        </section>

        <section style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.24em', color: gold }}>
            {statusLabel} · {scripts.length}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {(['draft', 'approved', 'published', 'archived'] as QueueStatus[]).map((item) => (
              <button
                key={item}
                onClick={() => {
                  setStatus(item);
                  loadQueue(item);
                }}
                style={{
                  border,
                  background: item === status ? `${gold}22` : 'transparent',
                  color: item === status ? gold : muted,
                  fontFamily: 'Cinzel, serif',
                  fontSize: '8px',
                  letterSpacing: '0.14em',
                  height: '32px',
                  padding: '0 10px',
                  cursor: 'pointer',
                }}
              >
                {item.toUpperCase()}
              </button>
            ))}
          </div>
        </section>

        {message && (
          <p style={{ color: muted, fontSize: '15px', fontStyle: 'italic', margin: '0 0 1.5rem', textAlign: 'center' }}>
            {message}
          </p>
        )}

        {loading ? (
          <div style={{ color: muted, textAlign: 'center', padding: '4rem 0', fontStyle: 'italic' }}>
            loading scripts...
          </div>
        ) : scripts.length === 0 ? (
          <div style={{ border, background: card, padding: '3rem 1.5rem', color: muted, textAlign: 'center', fontStyle: 'italic' }}>
            No {status} scripts.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            {scripts.map((script) => (
              <article key={script.id} style={{ background: card, border, padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, marginBottom: '0.45rem' }}>
                      {script.platform.toUpperCase()} · {script.duration_seconds || 60}S
                    </div>
                    <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '23px', fontWeight: 400, lineHeight: 1.2, margin: 0, color: parchment }}>
                      {script.hook}
                    </h2>
                  </div>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.12em', color: muted, border, padding: '4px 7px' }}>
                    {script.status.toUpperCase()}
                  </span>
                </div>

                {script.daily_questions?.question_text && (
                  <p style={{ color: muted, fontSize: '14px', lineHeight: 1.5, margin: 0, fontStyle: 'italic' }}>
                    {script.daily_questions.question_text}
                  </p>
                )}

                <p style={{ color: ivory85, fontSize: '16px', lineHeight: 1.65, margin: 0 }}>
                  {script.script}
                </p>

                <div style={{ borderTop: border, paddingTop: '1rem' }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.16em', color: gold, marginBottom: '0.45rem' }}>
                    VISUAL
                  </div>
                  <p style={{ color: muted, fontSize: '14px', lineHeight: 1.5, margin: 0 }}>
                    {script.visual_treatment}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: 'auto' }}>
                  <button onClick={() => copyScript(script)} style={buttonStyle('neutral')}>COPY</button>
                  {script.status === 'draft' && <button onClick={() => updateStatus(script.id, 'approved')} style={buttonStyle('gold')}>APPROVE</button>}
                  {script.status !== 'archived' && <button onClick={() => updateStatus(script.id, 'archived')} style={buttonStyle('neutral')}>ARCHIVE</button>}
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      <PublicFooter />
    </div>
  );
}

function buttonStyle(kind: 'gold' | 'neutral'): React.CSSProperties {
  return {
    border: kind === 'gold' ? 'none' : border,
    background: kind === 'gold' ? gold : 'transparent',
    color: kind === 'gold' ? '#0a0a0a' : gold,
    fontFamily: 'Cinzel, serif',
    fontSize: '8px',
    letterSpacing: '0.14em',
    height: '34px',
    padding: '0 12px',
    cursor: 'pointer',
  };
}
