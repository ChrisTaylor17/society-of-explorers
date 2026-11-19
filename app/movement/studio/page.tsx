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
  performance?: Record<string, unknown> | null;
  created_at: string;
  daily_questions?: QuestionSummary | null;
}

interface CreatorOps {
  generatedAt: string;
  latestQuestion: {
    id: string;
    question_text: string | null;
    date: string | null;
    thinker_id: string | null;
  } | null;
  counts: {
    total: number;
    byStatus: Record<string, number>;
    byPlatform: Record<string, number>;
    latestQuestionScripts: number;
    latestQuestionPlatforms: number;
    approvedLatest: number;
    publishedWithoutNotes: number;
  };
  checklist: Array<{
    id: string;
    label: string;
    status: 'ready' | 'partial' | 'todo' | 'blocked';
    detail: string;
  }>;
  nextActions: string[];
  readiness: {
    mode: 'draft_only' | string;
    externalActions: 'none' | string;
    publishBlockedWithoutApproval: boolean;
    receiptRequiredForLocalMutations: boolean;
    approvalRequirement: string;
    allowedLocalActions: string[];
  };
  externalActionBoundary: string;
}

interface CreatorReceipt {
  action: 'generate_drafts' | 'status_change' | 'performance_note' | string;
  generatedAt: string;
  writeMode: 'local_metadata_only' | string;
  externalActions: 'none' | string;
  publishTriggered: false;
  approvalRequiredBeforePublishing: boolean;
  recordScope: string;
  itemCount: number;
  detail: string;
}

interface PerformanceDraft {
  audience: string;
  channel: string;
  owner: string;
  experimentHypothesis: string;
  resultNotes: string;
  views: string;
  clicks: string;
  saves: string;
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

function formatReceiptAction(action: string): string {
  return action.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function reportMovementStudioClientFailure(scope: string) {
  console.warn(`[movement/studio] ${scope} failed`);
}

export default function MovementStudioPage() {
  const [scripts, setScripts] = useState<StudioScript[]>([]);
  const [ops, setOps] = useState<CreatorOps | null>(null);
  const [status, setStatus] = useState<QueueStatus>('draft');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [questionId, setQuestionId] = useState('');
  const [generatingMode, setGeneratingMode] = useState<'manual' | 'latest' | null>(null);
  const [editingPerformanceId, setEditingPerformanceId] = useState<string | null>(null);
  const [lastCreatorReceipt, setLastCreatorReceipt] = useState<CreatorReceipt | null>(null);
  const [performanceDraft, setPerformanceDraft] = useState<PerformanceDraft>({
    audience: '',
    channel: '',
    owner: '',
    experimentHypothesis: '',
    resultNotes: '',
    views: '',
    clicks: '',
    saves: '',
  });

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

      const [queueRes, opsRes] = await Promise.all([
        fetch(`/api/movement/scripts?status=${nextStatus}`, { cache: 'no-store' }),
        fetch('/api/movement/scripts/ops', { cache: 'no-store' }),
      ]);

      const data = await queueRes.json().catch(() => ({}));
      const opsData = await opsRes.json().catch(() => ({}));
      if (!queueRes.ok) {
        reportMovementStudioClientFailure('load');
        setMessage('Unable to load Movement scripts.');
        setScripts([]);
        return;
      }
      setScripts(Array.isArray(data.scripts) ? data.scripts : []);
      if (opsRes.ok) {
        setOps(opsData.ops || null);
      }
    } catch {
      reportMovementStudioClientFailure('load');
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
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        reportMovementStudioClientFailure('status');
        setMessage('Status update failed.');
        return;
      }
      if (data.creatorReceipt) setLastCreatorReceipt(data.creatorReceipt as CreatorReceipt);
      setScripts((current) => current.filter((script) => script.id !== scriptId));
      setMessage(data.creatorReceipt?.detail || `Marked ${nextStatus}.`);
    } catch {
      reportMovementStudioClientFailure('status');
      setMessage('Status update failed.');
    }
  }

  async function copyScript(script: StudioScript) {
    try {
      await navigator.clipboard.writeText(scriptCopy(script));
      setMessage('Copied script.');
    } catch {
      reportMovementStudioClientFailure('copy');
      setMessage('Copy failed.');
    }
  }

  function startPerformanceEdit(script: StudioScript) {
    const performance = creatorOpsPerformance(script);
    const metrics = objectRecord(performance.metrics);
    setEditingPerformanceId(script.id);
    setPerformanceDraft({
      audience: readString(performance.audience),
      channel: readString(performance.channel || script.platform),
      owner: readString(performance.owner),
      experimentHypothesis: readString(performance.experiment_hypothesis),
      resultNotes: readString(performance.result_notes),
      views: readNumberString(metrics.views),
      clicks: readNumberString(metrics.clicks),
      saves: readNumberString(metrics.saves),
    });
  }

  async function savePerformance(scriptId: string) {
    setMessage('');
    try {
      const res = await fetch(`/api/movement/scripts/performance/${scriptId}`, {
        method: 'PATCH',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(performanceDraft),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        reportMovementStudioClientFailure('performance');
        setMessage('Performance notes failed.');
        return;
      }
      setScripts((current) =>
        current.map((script) => (script.id === scriptId && data.script ? data.script : script)),
      );
      if (data.creatorReceipt) setLastCreatorReceipt(data.creatorReceipt as CreatorReceipt);
      setEditingPerformanceId(null);
      await loadQueue(status);
      setMessage(data.creatorReceipt?.detail || 'Performance notes saved locally.');
    } catch {
      reportMovementStudioClientFailure('performance');
      setMessage('Performance notes failed.');
    }
  }

  async function generateForQuestion(useLatest = false) {
    const id = questionId.trim();
    if ((!id && !useLatest) || generatingMode) return;
    setGeneratingMode(useLatest ? 'latest' : 'manual');
    setMessage('');
    try {
      const res = await fetch('/api/movement/scripts/generate', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(useLatest ? { latest: true } : { questionId: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        reportMovementStudioClientFailure('generation');
        setMessage('Generation failed.');
        return;
      }
      setQuestionId('');
      setStatus('draft');
      await loadQueue('draft');
      if (data.creatorReceipt) setLastCreatorReceipt(data.creatorReceipt as CreatorReceipt);
      setMessage(data.creatorReceipt?.detail || `Generated ${Array.isArray(data.scripts) ? data.scripts.length : 0} drafts${data.questionId ? ` for ${data.questionId}` : ''}.`);
    } catch {
      reportMovementStudioClientFailure('generation');
      setMessage('Generation failed.');
    } finally {
      setGeneratingMode(null);
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
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={questionId}
              onChange={(event) => setQuestionId(event.target.value)}
              placeholder="daily_questions.id"
              disabled={Boolean(generatingMode)}
              style={{
                flex: '1 1 260px',
                minWidth: '180px',
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
              onClick={() => generateForQuestion(false)}
              disabled={!questionId.trim() || Boolean(generatingMode)}
              style={{
                height: '44px',
                border: 'none',
                background: gold,
                color: '#0a0a0a',
                fontFamily: 'Cinzel, serif',
                fontSize: '9px',
                letterSpacing: '0.16em',
                padding: '0 18px',
                cursor: questionId.trim() && !generatingMode ? 'pointer' : 'not-allowed',
                opacity: questionId.trim() && !generatingMode ? 1 : 0.45,
              }}
            >
              {generatingMode === 'manual' ? 'GENERATING' : 'GENERATE'}
            </button>
            <button
              onClick={() => generateForQuestion(true)}
              disabled={Boolean(generatingMode)}
              style={{
                height: '44px',
                border,
                background: 'transparent',
                color: gold,
                fontFamily: 'Cinzel, serif',
                fontSize: '9px',
                letterSpacing: '0.16em',
                padding: '0 18px',
                cursor: generatingMode ? 'not-allowed' : 'pointer',
                opacity: generatingMode ? 0.45 : 1,
              }}
            >
              {generatingMode === 'latest' ? 'GENERATING' : 'LATEST'}
            </button>
          </div>
        </section>

        {ops && (
          <section style={{ background: card, border, padding: '1.25rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, marginBottom: '0.45rem' }}>
                  DAILY CREATOR OPS
                </div>
                <p style={{ color: muted, fontSize: '14px', lineHeight: 1.55, margin: 0 }}>
                  {ops.externalActionBoundary}
                </p>
              </div>
              <div style={{ color: muted, fontSize: '13px', lineHeight: 1.5 }}>
                Updated {new Date(ops.generatedAt).toLocaleString()}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
              <OpsMetric label="Total" value={String(ops.counts.total)} />
              <OpsMetric label="Latest Drafts" value={`${ops.counts.latestQuestionPlatforms}/3`} />
              <OpsMetric label="Approved" value={String(ops.counts.approvedLatest)} />
              <OpsMetric label="Needs Notes" value={String(ops.counts.publishedWithoutNotes)} />
              <OpsMetric label="Mode" value={ops.readiness.mode.replace(/_/g, ' ')} />
              <OpsMetric label="External" value={ops.readiness.externalActions.toUpperCase()} />
            </div>

            <div style={{ borderTop: border, paddingTop: '0.9rem', marginBottom: '0.9rem' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.16em', color: gold, marginBottom: '0.4rem' }}>
                CREATOR READINESS
              </div>
              <p style={{ color: muted, fontSize: '14px', lineHeight: 1.55, margin: 0 }}>
                {ops.readiness.approvalRequirement}
              </p>
              <p style={{ color: 'rgba(245,240,232,0.55)', fontSize: '13px', lineHeight: 1.55, margin: '0.45rem 0 0' }}>
                Local receipts required: {ops.readiness.receiptRequiredForLocalMutations ? 'Yes' : 'No'} / Publish blocked without approval: {ops.readiness.publishBlockedWithoutApproval ? 'Yes' : 'No'}
              </p>
            </div>

            {ops.latestQuestion && (
              <div style={{ borderTop: border, paddingTop: '0.9rem', marginBottom: '0.9rem' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.16em', color: gold, marginBottom: '0.4rem' }}>
                  LATEST QUESTION
                </div>
                <p style={{ color: ivory85, fontSize: '16px', lineHeight: 1.6, margin: 0 }}>
                  {ops.latestQuestion.question_text}
                </p>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
              {ops.checklist.map((item) => (
                <article key={item.id} style={{ border: '1px solid rgba(201,168,76,0.12)', padding: '0.85rem', background: '#0a0a0a' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <h2 style={{ color: parchment, fontFamily: 'Playfair Display, serif', fontSize: '20px', fontWeight: 400, lineHeight: 1.2, margin: 0 }}>
                      {item.label}
                    </h2>
                    <span style={{ fontFamily: 'Cinzel, serif', fontSize: '7px', letterSpacing: '0.12em', color: opsStatusColor(item.status), border: `1px solid ${opsStatusColor(item.status)}55`, padding: '4px 6px' }}>
                      {item.status.toUpperCase()}
                    </span>
                  </div>
                  <p style={{ color: muted, fontSize: '13px', lineHeight: 1.5, margin: 0 }}>{item.detail}</p>
                </article>
              ))}
            </div>

            <div style={{ borderTop: border, paddingTop: '0.9rem' }}>
              {ops.nextActions.map((action) => (
                <p key={action} style={{ color: muted, fontSize: '14px', lineHeight: 1.55, margin: '0 0 0.4rem' }}>
                  {action}
                </p>
              ))}
            </div>
          </section>
        )}

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

        {lastCreatorReceipt && (
          <section style={{ background: card, border, padding: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, marginBottom: '0.55rem' }}>
              LAST CREATOR RECEIPT
            </div>
            <p style={{ color: ivory85, fontSize: '15px', lineHeight: 1.55, margin: 0 }}>
              {formatReceiptAction(lastCreatorReceipt.action)} / {lastCreatorReceipt.recordScope} / {lastCreatorReceipt.detail}
            </p>
            <p style={{ color: 'rgba(245,240,232,0.55)', fontSize: '13px', lineHeight: 1.55, margin: '0.55rem 0 0' }}>
              External actions: {lastCreatorReceipt.externalActions.toUpperCase()} / Publish triggered: {lastCreatorReceipt.publishTriggered ? 'Yes' : 'No'} / Approval required: {lastCreatorReceipt.approvalRequiredBeforePublishing ? 'Yes' : 'No'}
            </p>
          </section>
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

                <PerformancePanel
                  script={script}
                  editing={editingPerformanceId === script.id}
                  draft={performanceDraft}
                  setDraft={setPerformanceDraft}
                  onEdit={() => startPerformanceEdit(script)}
                  onCancel={() => setEditingPerformanceId(null)}
                  onSave={() => savePerformance(script.id)}
                />

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

function objectRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function creatorOpsPerformance(script: StudioScript): Record<string, unknown> {
  const performance = objectRecord(script.performance);
  const creatorOps = objectRecord(performance.creator_ops);
  return Object.keys(creatorOps).length > 0 ? creatorOps : {};
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readNumberString(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function PerformancePanel({
  script,
  editing,
  draft,
  setDraft,
  onEdit,
  onCancel,
  onSave,
}: {
  script: StudioScript;
  editing: boolean;
  draft: PerformanceDraft;
  setDraft: (draft: PerformanceDraft | ((current: PerformanceDraft) => PerformanceDraft)) => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const performance = creatorOpsPerformance(script);
  const metrics = objectRecord(performance.metrics);
  const hasNotes = Object.keys(performance).length > 0;

  return (
    <div style={{ borderTop: border, paddingTop: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.16em', color: gold }}>
          PERFORMANCE
        </div>
        {!editing && <button onClick={onEdit} style={buttonStyle('neutral')}>{hasNotes ? 'EDIT NOTES' : 'ADD NOTES'}</button>}
      </div>

      {editing ? (
        <div style={{ display: 'grid', gap: '0.65rem' }}>
          <input
            value={draft.audience}
            onChange={(event) => setDraft((current) => ({ ...current, audience: event.target.value }))}
            placeholder="Audience"
            style={inputStyle}
          />
          <input
            value={draft.channel}
            onChange={(event) => setDraft((current) => ({ ...current, channel: event.target.value }))}
            placeholder="Channel"
            style={inputStyle}
          />
          <input
            value={draft.owner}
            onChange={(event) => setDraft((current) => ({ ...current, owner: event.target.value }))}
            placeholder="Owner"
            style={inputStyle}
          />
          <textarea
            value={draft.experimentHypothesis}
            onChange={(event) => setDraft((current) => ({ ...current, experimentHypothesis: event.target.value }))}
            placeholder="Experiment hypothesis"
            style={textareaStyle}
          />
          <textarea
            value={draft.resultNotes}
            onChange={(event) => setDraft((current) => ({ ...current, resultNotes: event.target.value }))}
            placeholder="Result notes"
            style={textareaStyle}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.5rem' }}>
            <input
              value={draft.views}
              onChange={(event) => setDraft((current) => ({ ...current, views: event.target.value }))}
              placeholder="Views"
              inputMode="numeric"
              style={inputStyle}
            />
            <input
              value={draft.clicks}
              onChange={(event) => setDraft((current) => ({ ...current, clicks: event.target.value }))}
              placeholder="Clicks"
              inputMode="numeric"
              style={inputStyle}
            />
            <input
              value={draft.saves}
              onChange={(event) => setDraft((current) => ({ ...current, saves: event.target.value }))}
              placeholder="Saves"
              inputMode="numeric"
              style={inputStyle}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button onClick={onSave} style={buttonStyle('gold')}>SAVE NOTES</button>
            <button onClick={onCancel} style={buttonStyle('neutral')}>CANCEL</button>
          </div>
        </div>
      ) : hasNotes ? (
        <div style={{ display: 'grid', gap: '0.45rem' }}>
          <p style={performanceLineStyle}>Audience: {readString(performance.audience) || 'Unassigned'}</p>
          <p style={performanceLineStyle}>Channel: {readString(performance.channel) || script.platform}</p>
          <p style={performanceLineStyle}>Owner: {readString(performance.owner) || 'Unassigned'}</p>
          <p style={performanceLineStyle}>Hypothesis: {readString(performance.experiment_hypothesis) || 'Not recorded'}</p>
          <p style={performanceLineStyle}>Notes: {readString(performance.result_notes) || 'Not recorded'}</p>
          <p style={performanceLineStyle}>
            Metrics: {readNumberString(metrics.views) || '0'} views / {readNumberString(metrics.clicks) || '0'} clicks / {readNumberString(metrics.saves) || '0'} saves
          </p>
        </div>
      ) : (
        <p style={{ color: muted, fontSize: '14px', lineHeight: 1.5, margin: 0, fontStyle: 'italic' }}>
          No local performance notes yet.
        </p>
      )}
    </div>
  );
}

function OpsMetric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: '1px solid rgba(201,168,76,0.12)', background: '#0a0a0a', padding: '0.85rem' }}>
      <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.16em', color: muted, marginBottom: '0.35rem' }}>
        {label.toUpperCase()}
      </div>
      <div style={{ color: parchment, fontFamily: 'Cinzel, serif', fontSize: '22px' }}>{value}</div>
    </div>
  );
}

function opsStatusColor(status: CreatorOps['checklist'][number]['status']): string {
  if (status === 'ready') return '#8fbf8f';
  if (status === 'partial') return gold;
  if (status === 'blocked') return '#d17b7b';
  return muted;
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

const inputStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  height: '38px',
  background: '#111',
  border,
  color: parchment,
  fontFamily: 'Cormorant Garamond, serif',
  fontSize: '15px',
  padding: '0 10px',
  outline: 'none',
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  height: '76px',
  padding: '9px 10px',
  resize: 'vertical',
  lineHeight: 1.45,
};

const performanceLineStyle: React.CSSProperties = {
  color: muted,
  fontSize: '13px',
  lineHeight: 1.45,
  margin: 0,
  overflowWrap: 'anywhere',
};
