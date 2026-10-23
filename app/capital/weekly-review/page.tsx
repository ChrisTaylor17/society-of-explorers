'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import PublicFooter from '@/components/PublicFooter';
import PublicNav from '@/components/PublicNav';
import { getSupabaseAccessToken } from '@/lib/auth/getSession';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';
const panel = '#0d0d0d';
const border = `1px solid ${gold}18`;

type ReviewMetric = {
  id: string;
  label: string;
  prompt: string;
  format: 'money' | 'count' | 'percent' | 'text';
};

type ReviewQuestion = {
  id: string;
  label: string;
  prompt: string;
};

type ReviewDecision = {
  id: string;
  label: string;
  meaning: string;
  requiresApproval: boolean;
};

type CapitalWeeklyReview = {
  generatedAt: string;
  storageKey: string;
  campaign: {
    name: string;
    goal: number;
    cadence: string;
    boundary: string;
  };
  metrics: ReviewMetric[];
  weeklyQuestions: ReviewQuestion[];
  decisions: ReviewDecision[];
  sevenDayLoop: string[];
  noGoRules: string[];
  readiness: {
    mode: 'draft_for_approval' | string;
    externalActions: 'none' | string;
    approvalRequiredBeforeExternalAction: boolean;
    receiptRequiredForPrep: boolean;
    exactApprovalRequiredFor: string[];
    localOnlySurfaces: string[];
    boundary: string;
  };
  prepReceipt: {
    action: string;
    generatedAt: string;
    mode: 'local_draft_only' | string;
    externalActions: 'none' | string;
    approvalRequiredBeforeExternalAction: boolean;
    allowedUse: string;
    blockedActions: string[];
    detail: string;
  };
};

type LocalReviewState = {
  weekOf: string;
  decisionId: string;
  metrics: Record<string, string>;
  questions: Record<string, string>;
};

function money(value: number): string {
  return `$${Math.round(value || 0).toLocaleString()}`;
}

function defaultWeekOf(): string {
  const now = new Date();
  now.setDate(now.getDate() - now.getDay() + 1);
  return now.toISOString().slice(0, 10);
}

function createInitialState(review: CapitalWeeklyReview): LocalReviewState {
  return {
    weekOf: defaultWeekOf(),
    decisionId: review.decisions[0]?.id || 'hold',
    metrics: Object.fromEntries(review.metrics.map((metric) => [metric.id, ''])),
    questions: Object.fromEntries(review.weeklyQuestions.map((question) => [question.id, ''])),
  };
}

function safeParse(value: string | null): LocalReviewState | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as LocalReviewState;
  } catch {
    return null;
  }
}

function Field({
  label,
  value,
  prompt,
  inputMode,
  onChange,
}: {
  label: string;
  value: string;
  prompt: string;
  inputMode?: 'decimal' | 'numeric' | 'text';
  onChange: (value: string) => void;
}) {
  return (
    <label style={fieldStyle}>
      <span style={eyebrowStyle}>{label}</span>
      <input
        value={value}
        inputMode={inputMode || 'text'}
        onChange={(event) => onChange(event.target.value)}
        placeholder={prompt}
        style={inputStyle}
      />
      <span style={hintStyle}>{prompt}</span>
    </label>
  );
}

function TextAreaField({
  label,
  value,
  prompt,
  onChange,
}: {
  label: string;
  value: string;
  prompt: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={fieldStyle}>
      <span style={eyebrowStyle}>{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={prompt}
        rows={4}
        style={{ ...inputStyle, minHeight: '118px', resize: 'vertical', lineHeight: 1.55 }}
      />
      <span style={hintStyle}>{prompt}</span>
    </label>
  );
}

function ListPanel({ title, items, danger }: { title: string; items: string[]; danger?: boolean }) {
  return (
    <section style={sectionStyle}>
      <div style={{ ...eyebrowStyle, color: danger ? '#d17b7b' : gold }}>{title}</div>
      {items.map((item) => (
        <p key={item} style={{ color: danger ? '#d17b7b' : muted, fontSize: '15px', lineHeight: 1.65, margin: '0 0 0.55rem' }}>
          {item}
        </p>
      ))}
    </section>
  );
}

function metricInputMode(format: ReviewMetric['format']): 'decimal' | 'numeric' | 'text' {
  if (format === 'money' || format === 'percent') return 'decimal';
  if (format === 'count') return 'numeric';
  return 'text';
}

export default function CapitalWeeklyReviewPage() {
  const [review, setReview] = useState<CapitalWeeklyReview | null>(null);
  const [localState, setLocalState] = useState<LocalReviewState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const token = await getSupabaseAccessToken();
        const res = await fetch('/api/admin/capital/weekly-review', {
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || 'Weekly review unavailable');
        const nextReview = payload.review as CapitalWeeklyReview;
        setReview(nextReview);
        setLocalState(safeParse(window.localStorage.getItem(nextReview.storageKey)) || createInitialState(nextReview));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Weekly review unavailable');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (!review || !localState) return;
    window.localStorage.setItem(review.storageKey, JSON.stringify(localState));
  }, [review, localState]);

  const activeDecision = useMemo(() => {
    if (!review || !localState) return null;
    return review.decisions.find((decision) => decision.id === localState.decisionId) || review.decisions[0] || null;
  }, [localState, review]);

  function updateMetric(id: string, value: string) {
    if (!localState) return;
    setLocalState({
      ...localState,
      metrics: {
        ...localState.metrics,
        [id]: value,
      },
    });
  }

  function updateQuestion(id: string, value: string) {
    if (!localState) return;
    setLocalState({
      ...localState,
      questions: {
        ...localState.questions,
        [id]: value,
      },
    });
  }

  function resetReview() {
    if (!review) return;
    window.localStorage.removeItem(review.storageKey);
    setLocalState(createInitialState(review));
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      <main style={{ maxWidth: '1180px', margin: '0 auto', padding: '8rem 2rem 6rem' }}>
        <Link href="/capital" style={{ color: muted, fontSize: '14px', textDecoration: 'none' }}>
          Back to command center
        </Link>

        <header style={{ margin: '1.5rem 0 2rem' }}>
          <div style={eyebrowStyle}>PRIVATE WEEKLY REVIEW</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(34px, 6vw, 58px)', fontWeight: 400, lineHeight: 1.1, margin: '0 0 1rem' }}>
            Decide the next capital sprint.
          </h1>
          <p style={{ color: ivory85, fontSize: '19px', lineHeight: 1.8, maxWidth: '780px', margin: 0 }}>
            A browser-local review for cash collected, committed pledges, strongest story, top objection, and the next ask. It is not a CRM, ledger, sender, deploy tool, or approval record.
          </p>
        </header>

        {loading && <div style={{ color: muted, fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em' }}>LOADING...</div>}

        {!loading && error && (
          <section style={sectionStyle}>
            <p style={{ color: muted, fontSize: '16px', lineHeight: 1.7, margin: 0 }}>
              {error}. Sign in as an approved admin account to view the weekly capital review.
            </p>
          </section>
        )}

        {review && localState && (
          <>
            <section style={{ ...sectionStyle, marginBottom: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '1rem', alignItems: 'start' }}>
                <div>
                  <div style={eyebrowStyle}>{review.campaign.name.toUpperCase()}</div>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '34px', color: parchment, marginBottom: '0.75rem' }}>{money(review.campaign.goal)}</div>
                  <p style={smallBodyStyle}>{review.campaign.cadence}</p>
                </div>
                <div>
                  <div style={eyebrowStyle}>BOUNDARY</div>
                  <p style={{ ...smallBodyStyle, color: '#d17b7b' }}>{review.campaign.boundary}</p>
                </div>
                <div>
                  <div style={eyebrowStyle}>GENERATED</div>
                  <p style={smallBodyStyle}>{new Date(review.generatedAt).toLocaleString()}</p>
                </div>
              </div>
            </section>

            <section style={{ ...sectionStyle, marginBottom: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '1.25rem', alignItems: 'start' }}>
                <div>
                  <div style={eyebrowStyle}>CAPITAL PREP READINESS</div>
                  <p style={{ color: parchment, fontFamily: 'Cinzel, serif', fontSize: '18px', letterSpacing: '0.08em', margin: '0 0 0.6rem' }}>
                    {review.readiness.mode.replace(/_/g, ' ')}
                  </p>
                  <p style={smallBodyStyle}>{review.readiness.boundary}</p>
                  <p style={{ ...smallBodyStyle, color: '#d17b7b', marginTop: '0.55rem' }}>
                    External actions: {review.readiness.externalActions.toUpperCase()} / Approval required: {review.readiness.approvalRequiredBeforeExternalAction ? 'Yes' : 'No'}
                  </p>
                </div>
                <div>
                  <div style={eyebrowStyle}>EXACT APPROVAL REQUIRED FOR</div>
                  {review.readiness.exactApprovalRequiredFor.map((item) => (
                    <p key={item} style={{ color: muted, fontSize: '14px', lineHeight: 1.5, margin: '0 0 0.35rem' }}>
                      {item}
                    </p>
                  ))}
                </div>
                <div>
                  <div style={eyebrowStyle}>LAST PREP RECEIPT</div>
                  <p style={{ color: ivory85, fontSize: '14px', lineHeight: 1.55, margin: '0 0 0.45rem' }}>
                    {review.prepReceipt.detail}
                  </p>
                  <p style={{ color: muted, fontSize: '13px', lineHeight: 1.45, margin: 0 }}>
                    {review.prepReceipt.mode.replace(/_/g, ' ')} / {new Date(review.prepReceipt.generatedAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </section>

            <section style={{ ...sectionStyle, marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                  <div style={eyebrowStyle}>LOCAL REVIEW FORM</div>
                  <p style={smallBodyStyle}>Saved only in this browser under {review.storageKey}. Use redacted summaries only.</p>
                </div>
                <button type="button" onClick={resetReview} style={secondaryButtonStyle}>
                  Reset local draft
                </button>
              </div>

              <label style={{ ...fieldStyle, marginBottom: '1rem' }}>
                <span style={eyebrowStyle}>Week of</span>
                <input
                  type="date"
                  value={localState.weekOf}
                  onChange={(event) => setLocalState({ ...localState, weekOf: event.target.value })}
                  style={inputStyle}
                />
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                {review.metrics.map((metric) => (
                  <Field
                    key={metric.id}
                    label={metric.label}
                    value={localState.metrics[metric.id] || ''}
                    prompt={metric.prompt}
                    inputMode={metricInputMode(metric.format)}
                    onChange={(value) => updateMetric(metric.id, value)}
                  />
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '1rem' }}>
                {review.weeklyQuestions.map((question) => (
                  <TextAreaField
                    key={question.id}
                    label={question.label}
                    value={localState.questions[question.id] || ''}
                    prompt={question.prompt}
                    onChange={(value) => updateQuestion(question.id, value)}
                  />
                ))}
              </div>
            </section>

            <section style={{ ...sectionStyle, marginBottom: '1.25rem' }}>
              <div style={eyebrowStyle}>SPRINT DECISION</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                {review.decisions.map((decision) => {
                  const active = decision.id === localState.decisionId;
                  return (
                    <button
                      key={decision.id}
                      type="button"
                      onClick={() => setLocalState({ ...localState, decisionId: decision.id })}
                      style={{
                        ...decisionButtonStyle,
                        borderColor: active ? gold : `${gold}18`,
                        color: active ? '#0a0a0a' : parchment,
                        background: active ? gold : '#0a0a0a',
                      }}
                    >
                      {decision.label}
                    </button>
                  );
                })}
              </div>
              {activeDecision && (
                <div style={innerPanelStyle}>
                  <div style={eyebrowStyle}>{activeDecision.requiresApproval ? 'APPROVAL REQUIRED' : 'LOCAL MOVE'}</div>
                  <p style={{ ...smallBodyStyle, color: activeDecision.requiresApproval ? '#d17b7b' : ivory85 }}>{activeDecision.meaning}</p>
                </div>
              )}
            </section>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 330px), 1fr))', gap: '1.25rem' }}>
              <ListPanel title="Seven-Day Loop" items={review.sevenDayLoop} />
              <ListPanel title="No-Go Rules" items={review.noGoRules} danger />
            </div>
          </>
        )}
      </main>

      <PublicFooter />
    </div>
  );
}

const sectionStyle: CSSProperties = {
  background: panel,
  border,
  padding: '1.25rem',
};

const innerPanelStyle: CSSProperties = {
  border: `1px solid ${gold}12`,
  background: '#0a0a0a',
  padding: '1rem',
};

const fieldStyle: CSSProperties = {
  display: 'grid',
  gap: '0.5rem',
};

const eyebrowStyle: CSSProperties = {
  color: gold,
  fontFamily: 'Cinzel, serif',
  fontSize: '10px',
  letterSpacing: '0.18em',
  marginBottom: '0.65rem',
};

const smallBodyStyle: CSSProperties = {
  color: muted,
  fontSize: '15px',
  lineHeight: 1.65,
  margin: 0,
};

const hintStyle: CSSProperties = {
  color: muted,
  fontSize: '12px',
  lineHeight: 1.45,
  opacity: 0.78,
};

const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: '#0a0a0a',
  border: `1px solid ${gold}24`,
  color: parchment,
  padding: '0.8rem 0.85rem',
  font: 'inherit',
  fontSize: '15px',
  outline: 'none',
};

const secondaryButtonStyle: CSSProperties = {
  border: `1px solid ${gold}33`,
  background: 'transparent',
  color: gold,
  padding: '0.85rem 1rem',
  fontFamily: 'Cinzel, serif',
  fontSize: '10px',
  letterSpacing: '0.14em',
  cursor: 'pointer',
};

const decisionButtonStyle: CSSProperties = {
  border: `1px solid ${gold}18`,
  background: '#0a0a0a',
  color: parchment,
  padding: '0.95rem',
  fontFamily: 'Cinzel, serif',
  fontSize: '10px',
  letterSpacing: '0.12em',
  cursor: 'pointer',
  minHeight: '54px',
};
