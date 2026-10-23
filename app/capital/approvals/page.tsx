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

type ItemStatus = 'ready' | 'needs_approval' | 'blocked' | 'manual' | 'already_available';
type LocalReviewStatus = 'not_reviewed' | 'reviewed_blocked' | 'ready_to_request' | 'approved_in_thread';

type ApprovalItem = {
  id: string;
  group: string;
  label: string;
  externalAction: string;
  status: ItemStatus;
  statusDetail: string;
  exactApprovalText: string;
  prerequisites: string[];
  verification: string[];
  allowedPrep: string[];
  stopRule: string;
  source: string;
};

type ApprovalChecklist = {
  generatedAt: string;
  storageKey: string;
  boundary: string;
  localStateWarning: string;
  readiness: {
    overallStatus: string;
    requiredEnvMissing: number;
    paymentWarnings: number;
    copyWarnings: number;
    blockers: string[];
  };
  prepReadiness: {
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
  summary: {
    total: number;
    blocked: number;
    needsApproval: number;
    ready: number;
    alreadyAvailable: number;
  };
  items: ApprovalItem[];
};

type LocalReview = {
  status: LocalReviewStatus;
  note: string;
  updatedAt: string;
};

type LocalReviewMap = Record<string, LocalReview>;

function labelize(value: string): string {
  return value.replace(/_/g, ' ').toUpperCase();
}

function statusColor(status: string): string {
  if (status === 'ready' || status === 'already_available' || status === 'approved_in_thread') return '#8fbf8f';
  if (status === 'blocked' || status === 'reviewed_blocked') return '#d17b7b';
  if (status === 'needs_approval' || status === 'manual' || status === 'ready_to_request') return gold;
  return muted;
}

function safeParseReview(value: string | null): LocalReviewMap {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as LocalReviewMap;
  } catch {
    return {};
  }
}

function defaultReview(): LocalReview {
  return {
    status: 'not_reviewed',
    note: '',
    updatedAt: '',
  };
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: panel, border, padding: '1rem', minHeight: '104px' }}>
      <div style={eyebrowStyle}>{label}</div>
      <div style={{ fontFamily: 'Cinzel, serif', fontSize: '27px', color: parchment }}>{value}</div>
      {sub && <div style={{ color: muted, fontSize: '13px', lineHeight: 1.5, marginTop: '0.45rem' }}>{sub}</div>}
    </div>
  );
}

function TinyList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div style={{ ...eyebrowStyle, marginBottom: '0.6rem' }}>{title}</div>
      {items.map((item) => (
        <p key={item} style={{ color: muted, fontSize: '13px', lineHeight: 1.55, margin: '0 0 0.45rem' }}>
          {item}
        </p>
      ))}
    </div>
  );
}

export default function CapitalApprovalsPage() {
  const [checklist, setChecklist] = useState<ApprovalChecklist | null>(null);
  const [reviews, setReviews] = useState<LocalReviewMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeGroup, setActiveGroup] = useState('all');

  useEffect(() => {
    async function load() {
      try {
        const token = await getSupabaseAccessToken();
        const res = await fetch('/api/admin/capital/approvals', {
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || 'Approval checklist unavailable');
        const nextChecklist = payload.checklist as ApprovalChecklist;
        setChecklist(nextChecklist);
        setReviews(safeParseReview(window.localStorage.getItem(nextChecklist.storageKey)));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Approval checklist unavailable');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (!checklist) return;
    window.localStorage.setItem(checklist.storageKey, JSON.stringify(reviews));
  }, [checklist, reviews]);

  const groups = useMemo(() => {
    if (!checklist) return ['all'];
    return ['all', ...Array.from(new Set(checklist.items.map((item) => item.group)))];
  }, [checklist]);

  const filteredItems = useMemo(() => {
    if (!checklist) return [];
    if (activeGroup === 'all') return checklist.items;
    return checklist.items.filter((item) => item.group === activeGroup);
  }, [activeGroup, checklist]);

  function updateReview(itemId: string, next: Partial<LocalReview>) {
    setReviews((current) => {
      const existing = current[itemId] || defaultReview();
      return {
        ...current,
        [itemId]: {
          ...existing,
          ...next,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  }

  function resetReviews() {
    if (!checklist) return;
    window.localStorage.removeItem(checklist.storageKey);
    setReviews({});
  }

  const reviewedCount = Object.values(reviews).filter((review) => review.status !== 'not_reviewed').length;

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      <main style={{ maxWidth: '1180px', margin: '0 auto', padding: '8rem 2rem 6rem' }}>
        <Link href="/capital" style={{ color: muted, fontSize: '14px', textDecoration: 'none' }}>
          Back to command center
        </Link>

        <header style={{ margin: '1.5rem 0 2rem' }}>
          <div style={eyebrowStyle}>PRIVATE APPROVALS</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(34px, 6vw, 58px)', fontWeight: 400, lineHeight: 1.1, margin: '0 0 1rem' }}>
            External action checklist.
          </h1>
          <p style={{ color: ivory85, fontSize: '19px', lineHeight: 1.8, maxWidth: '780px', margin: 0 }}>
            A local review board for the decisions that move 92B from preparation into real-world action. It stores only browser-local review marks.
          </p>
        </header>

        {loading && <div style={{ color: muted, fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em' }}>LOADING...</div>}

        {!loading && error && (
          <section style={sectionStyle}>
            <p style={{ color: muted, fontSize: '16px', lineHeight: 1.7, margin: 0 }}>
              {error}. Sign in as an approved admin account to view the approval checklist.
            </p>
          </section>
        )}

        {checklist && (
          <>
            <section style={{ ...sectionStyle, marginBottom: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '1.25rem', alignItems: 'start' }}>
                <div>
                  <div style={eyebrowStyle}>BOUNDARY</div>
                  <p style={{ color: ivory85, fontSize: '17px', lineHeight: 1.7, margin: '0 0 0.85rem' }}>{checklist.boundary}</p>
                  <p style={{ color: '#d17b7b', fontSize: '15px', lineHeight: 1.65, margin: '0 0 0.45rem' }}>
                    Checking an item here does not authorize external action.
                  </p>
                  <p style={{ color: '#d17b7b', fontSize: '15px', lineHeight: 1.65, margin: 0 }}>{checklist.localStateWarning}</p>
                </div>
                <div style={{ border: `1px solid ${gold}12`, background: '#0a0a0a', padding: '1rem' }}>
                  <div style={eyebrowStyle}>LOCAL STATE</div>
                  <div style={{ color: parchment, fontFamily: 'Cinzel, serif', fontSize: '24px', marginBottom: '0.45rem' }}>
                    {reviewedCount}/{checklist.summary.total}
                  </div>
                  <p style={{ color: muted, fontSize: '13px', lineHeight: 1.55, margin: '0 0 0.9rem' }}>
                    Reviewed in this browser only. Generated {new Date(checklist.generatedAt).toLocaleString()}.
                  </p>
                  <button type="button" onClick={resetReviews} style={ghostButtonStyle}>
                    RESET LOCAL MARKS
                  </button>
                </div>
                <div style={{ border: `1px solid ${gold}12`, background: '#0a0a0a', padding: '1rem' }}>
                  <div style={eyebrowStyle}>LAST PREP RECEIPT</div>
                  <p style={{ color: ivory85, fontSize: '14px', lineHeight: 1.55, margin: '0 0 0.65rem' }}>
                    {checklist.prepReceipt.detail}
                  </p>
                  <p style={{ color: '#d17b7b', fontSize: '13px', lineHeight: 1.5, margin: '0 0 0.65rem' }}>
                    External actions: {checklist.prepReadiness.externalActions.toUpperCase()} / Approval required: {checklist.prepReadiness.approvalRequiredBeforeExternalAction ? 'Yes' : 'No'}
                  </p>
                  <p style={{ color: muted, fontSize: '12px', lineHeight: 1.45, margin: 0 }}>
                    {checklist.prepReceipt.mode.replace(/_/g, ' ')} / {new Date(checklist.prepReceipt.generatedAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </section>

            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
              <Metric label="Total Items" value={String(checklist.summary.total)} />
              <Metric label="Blocked" value={String(checklist.summary.blocked)} />
              <Metric label="Need Approval" value={String(checklist.summary.needsApproval)} />
              <Metric label="Already Available" value={String(checklist.summary.alreadyAvailable)} />
              <Metric label="Missing Env" value={String(checklist.readiness.requiredEnvMissing)} />
              <Metric label="Payment Warnings" value={String(checklist.readiness.paymentWarnings)} />
            </section>

            {checklist.readiness.blockers.length > 0 && (
              <section style={{ ...sectionStyle, borderColor: 'rgba(209,123,123,0.35)', marginBottom: '1.25rem' }}>
                <div style={{ ...eyebrowStyle, color: '#d17b7b' }}>CURRENT BLOCKERS</div>
                {checklist.readiness.blockers.map((blocker) => (
                  <p key={blocker} style={{ color: '#d17b7b', fontSize: '14px', lineHeight: 1.6, margin: '0 0 0.4rem' }}>
                    {blocker}
                  </p>
                ))}
              </section>
            )}

            <section style={{ ...sectionStyle, marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                {groups.map((group) => (
                  <button
                    key={group}
                    type="button"
                    onClick={() => setActiveGroup(group)}
                    style={activeGroup === group ? activeFilterStyle : filterStyle}
                  >
                    {labelize(group)}
                  </button>
                ))}
              </div>
            </section>

            <section style={{ display: 'grid', gap: '1rem' }}>
              {filteredItems.map((item) => {
                const review = reviews[item.id] || defaultReview();
                return (
                  <article key={item.id} style={sectionStyle}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '1.25rem', alignItems: 'start' }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                          <div>
                            <div style={eyebrowStyle}>{labelize(item.group)}</div>
                            <h2 style={{ fontFamily: 'Playfair Display, serif', color: parchment, fontSize: '30px', fontWeight: 400, lineHeight: 1.15, margin: 0 }}>
                              {item.label}
                            </h2>
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={pillStyle(item.status)}>{labelize(item.status)}</span>
                            <span style={pillStyle(review.status)}>{labelize(review.status)}</span>
                          </div>
                        </div>
                        <p style={{ color: ivory85, fontSize: '16px', lineHeight: 1.65, margin: '0 0 0.75rem' }}>{item.externalAction}</p>
                        <p style={{ color: muted, fontSize: '14px', lineHeight: 1.6, margin: '0 0 1rem' }}>{item.statusDetail}</p>
                        <div style={{ border: `1px solid ${gold}14`, background: '#0a0a0a', padding: '1rem', marginBottom: '1rem' }}>
                          <div style={eyebrowStyle}>EXACT APPROVAL TEXT</div>
                          <p style={{ color: parchment, fontSize: '15px', lineHeight: 1.65, margin: 0 }}>{item.exactApprovalText}</p>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '1rem' }}>
                          <TinyList title="Prerequisites" items={item.prerequisites} />
                          <TinyList title="Verification" items={item.verification} />
                          <TinyList title="Allowed Prep" items={item.allowedPrep} />
                        </div>
                        <div style={{ borderTop: `1px solid ${gold}12`, marginTop: '1rem', paddingTop: '1rem' }}>
                          <div style={{ color: '#d17b7b', fontSize: '14px', lineHeight: 1.6 }}>{item.stopRule}</div>
                          <div style={{ color: muted, fontSize: '12px', lineHeight: 1.5, marginTop: '0.5rem', wordBreak: 'break-word' }}>Source: {item.source}</div>
                        </div>
                      </div>

                      <div style={{ border: `1px solid ${gold}12`, background: '#0a0a0a', padding: '1rem' }}>
                        <div style={eyebrowStyle}>LOCAL REVIEW</div>
                        <label style={labelStyle} htmlFor={`${item.id}-status`}>Review status</label>
                        <select
                          id={`${item.id}-status`}
                          value={review.status}
                          onChange={(event) => updateReview(item.id, { status: event.target.value as LocalReviewStatus })}
                          style={selectStyle}
                        >
                          <option value="not_reviewed">Not reviewed</option>
                          <option value="reviewed_blocked">Reviewed, blocked</option>
                          <option value="ready_to_request">Ready to request</option>
                          <option value="approved_in_thread">Approved in active thread</option>
                        </select>
                        <label style={labelStyle} htmlFor={`${item.id}-note`}>Private local note</label>
                        <textarea
                          id={`${item.id}-note`}
                          value={review.note}
                          onChange={(event) => updateReview(item.id, { note: event.target.value })}
                          placeholder="Local note only. Do not paste secrets or private relationship details."
                          style={textareaStyle}
                        />
                        {review.updatedAt && (
                          <p style={{ color: muted, fontSize: '12px', lineHeight: 1.5, margin: '0.75rem 0 0' }}>
                            Updated {new Date(review.updatedAt).toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
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

const eyebrowStyle: CSSProperties = {
  color: gold,
  fontFamily: 'Cinzel, serif',
  fontSize: '10px',
  letterSpacing: '0.18em',
  marginBottom: '0.65rem',
};

const labelStyle: CSSProperties = {
  display: 'block',
  color: muted,
  fontFamily: 'Cinzel, serif',
  fontSize: '9px',
  letterSpacing: '0.14em',
  margin: '0 0 0.45rem',
};

const selectStyle: CSSProperties = {
  width: '100%',
  background: '#0d0d0d',
  color: parchment,
  border: `1px solid ${gold}24`,
  padding: '0.75rem',
  marginBottom: '1rem',
  fontFamily: 'Cormorant Garamond, serif',
  fontSize: '15px',
};

const textareaStyle: CSSProperties = {
  width: '100%',
  minHeight: '130px',
  resize: 'vertical',
  background: '#0d0d0d',
  color: parchment,
  border: `1px solid ${gold}24`,
  padding: '0.75rem',
  fontFamily: 'Cormorant Garamond, serif',
  fontSize: '15px',
  lineHeight: 1.5,
};

const filterStyle: CSSProperties = {
  border: `1px solid ${gold}24`,
  background: '#0a0a0a',
  color: muted,
  padding: '0.65rem 0.8rem',
  fontFamily: 'Cinzel, serif',
  fontSize: '9px',
  letterSpacing: '0.14em',
  cursor: 'pointer',
};

const activeFilterStyle: CSSProperties = {
  ...filterStyle,
  background: gold,
  color: '#0a0a0a',
};

const ghostButtonStyle: CSSProperties = {
  border: `1px solid ${gold}24`,
  background: 'transparent',
  color: gold,
  padding: '0.75rem 0.85rem',
  fontFamily: 'Cinzel, serif',
  fontSize: '9px',
  letterSpacing: '0.14em',
  cursor: 'pointer',
  width: '100%',
};

function pillStyle(status: string): CSSProperties {
  return {
    border: `1px solid ${statusColor(status)}55`,
    color: statusColor(status),
    background: `${statusColor(status)}10`,
    padding: '0.35rem 0.5rem',
    fontFamily: 'Cinzel, serif',
    fontSize: '8px',
    letterSpacing: '0.12em',
    whiteSpace: 'nowrap',
  };
}
