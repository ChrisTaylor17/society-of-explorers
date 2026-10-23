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

type Segment = {
  id: string;
  label: string;
  priority: number;
  whyItMatters: string;
  bestAsk: string;
  recommendedDraftId: string;
  utmLink: string;
};

type Draft = {
  id: string;
  label: string;
  subject: string;
  body: string;
  bestFor: string;
  riskCheck: string;
};

type BatchTemplate = {
  id: string;
  label: string;
  segmentId: string;
  draftId: string;
  targetSlots: number;
  ask: string;
  approvalText: string;
};

type OutreachLab = {
  generatedAt: string;
  storageKey: string;
  campaignLink: string;
  boundary: string;
  localStateWarning: string;
  segments: Segment[];
  drafts: Draft[];
  batchTemplates: BatchTemplate[];
  dailyReview: string[];
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

type SlotStatus = 'empty' | 'candidate' | 'ready_for_chris' | 'approved_elsewhere' | 'deferred';

type LocalSlot = {
  label: string;
  channel: string;
  status: SlotStatus;
  note: string;
};

type LocalState = {
  activeBatchId: string;
  slots: Record<string, LocalSlot[]>;
};

function emptySlot(): LocalSlot {
  return {
    label: '',
    channel: 'email',
    status: 'empty',
    note: '',
  };
}

function safeParse(value: string | null): LocalState | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as LocalState;
  } catch {
    return null;
  }
}

function createInitialState(lab: OutreachLab): LocalState {
  const activeBatchId = lab.batchTemplates[0]?.id || '';
  return {
    activeBatchId,
    slots: Object.fromEntries(
      lab.batchTemplates.map((batch) => [
        batch.id,
        Array.from({ length: batch.targetSlots }, emptySlot),
      ]),
    ),
  };
}

function statusColor(status: string): string {
  if (status === 'approved_elsewhere') return '#8fbf8f';
  if (status === 'ready_for_chris') return gold;
  if (status === 'deferred') return '#d17b7b';
  return muted;
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

export default function CapitalOutreachLabPage() {
  const [lab, setLab] = useState<OutreachLab | null>(null);
  const [localState, setLocalState] = useState<LocalState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeDraftId, setActiveDraftId] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const token = await getSupabaseAccessToken();
        const res = await fetch('/api/admin/capital/outreach-lab', {
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || 'Outreach lab unavailable');
        const nextLab = payload.lab as OutreachLab;
        setLab(nextLab);
        setActiveDraftId(nextLab.drafts[0]?.id || '');
        setLocalState(safeParse(window.localStorage.getItem(nextLab.storageKey)) || createInitialState(nextLab));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Outreach lab unavailable');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (!lab || !localState) return;
    window.localStorage.setItem(lab.storageKey, JSON.stringify(localState));
  }, [lab, localState]);

  const activeBatch = useMemo(() => {
    if (!lab || !localState) return null;
    return lab.batchTemplates.find((batch) => batch.id === localState.activeBatchId) || lab.batchTemplates[0] || null;
  }, [lab, localState]);

  const activeDraft = useMemo(() => {
    if (!lab) return null;
    return lab.drafts.find((draft) => draft.id === activeDraftId) || lab.drafts[0] || null;
  }, [activeDraftId, lab]);

  const readyCount = useMemo(() => {
    if (!localState || !activeBatch) return 0;
    return (localState.slots[activeBatch.id] || []).filter((slot) => slot.status === 'ready_for_chris').length;
  }, [activeBatch, localState]);

  function selectBatch(batchId: string) {
    if (!lab || !localState) return;
    const batch = lab.batchTemplates.find((item) => item.id === batchId);
    if (!batch) return;
    setLocalState({
      ...localState,
      activeBatchId: batchId,
      slots: {
        ...localState.slots,
        [batchId]: localState.slots[batchId] || Array.from({ length: batch.targetSlots }, emptySlot),
      },
    });
    setActiveDraftId(batch.draftId);
  }

  function updateSlot(index: number, next: Partial<LocalSlot>) {
    if (!localState || !activeBatch) return;
    const currentSlots = localState.slots[activeBatch.id] || [];
    const slots = currentSlots.map((slot, slotIndex) => (
      slotIndex === index ? { ...slot, ...next } : slot
    ));
    setLocalState({
      ...localState,
      slots: {
        ...localState.slots,
        [activeBatch.id]: slots,
      },
    });
  }

  function resetLocalState() {
    if (!lab) return;
    window.localStorage.removeItem(lab.storageKey);
    setLocalState(createInitialState(lab));
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      <main style={{ maxWidth: '1180px', margin: '0 auto', padding: '8rem 2rem 6rem' }}>
        <Link href="/capital" style={{ color: muted, fontSize: '14px', textDecoration: 'none' }}>
          Back to command center
        </Link>

        <header style={{ margin: '1.5rem 0 2rem' }}>
          <div style={eyebrowStyle}>PRIVATE OUTREACH LAB</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(34px, 6vw, 58px)', fontWeight: 400, lineHeight: 1.1, margin: '0 0 1rem' }}>
            Draft batches before anything leaves the room.
          </h1>
          <p style={{ color: ivory85, fontSize: '19px', lineHeight: 1.8, maxWidth: '780px', margin: 0 }}>
            A local-only place to choose outreach segments, review drafts, and prepare redacted recipient slots for Chris approval.
          </p>
        </header>

        {loading && <div style={{ color: muted, fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em' }}>LOADING...</div>}

        {!loading && error && (
          <section style={sectionStyle}>
            <p style={{ color: muted, fontSize: '16px', lineHeight: 1.7, margin: 0 }}>
              {error}. Sign in as an approved admin account to view the Outreach Lab.
            </p>
          </section>
        )}

        {lab && localState && (
          <>
            <section style={{ ...sectionStyle, marginBottom: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '1.25rem', alignItems: 'start' }}>
                <div>
                  <div style={eyebrowStyle}>BOUNDARY</div>
                  <p style={{ color: '#d17b7b', fontSize: '15px', lineHeight: 1.65, margin: '0 0 0.65rem' }}>{lab.boundary}</p>
                  <p style={{ color: muted, fontSize: '14px', lineHeight: 1.6, margin: 0 }}>{lab.localStateWarning}</p>
                </div>
                <div>
                  <div style={eyebrowStyle}>CAMPAIGN LINK</div>
                  <p style={{ color: muted, fontSize: '13px', lineHeight: 1.55, overflowWrap: 'anywhere', margin: 0 }}>{lab.campaignLink}</p>
                </div>
                <div>
                  <div style={eyebrowStyle}>LOCAL STATE</div>
                  <p style={{ color: parchment, fontFamily: 'Cinzel, serif', fontSize: '24px', margin: '0 0 0.5rem' }}>{readyCount} ready</p>
                  <button type="button" onClick={resetLocalState} style={ghostButtonStyle}>RESET LOCAL SLOTS</button>
                </div>
              </div>
            </section>

            <section style={{ ...sectionStyle, marginBottom: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '1.25rem', alignItems: 'start' }}>
                <div>
                  <div style={eyebrowStyle}>CAPITAL PREP READINESS</div>
                  <p style={{ color: parchment, fontFamily: 'Cinzel, serif', fontSize: '18px', letterSpacing: '0.08em', margin: '0 0 0.6rem' }}>
                    {lab.readiness.mode.replace(/_/g, ' ')}
                  </p>
                  <p style={smallBodyStyle}>{lab.readiness.boundary}</p>
                  <p style={{ ...smallBodyStyle, color: '#d17b7b', marginBottom: 0 }}>
                    External actions: {lab.readiness.externalActions.toUpperCase()} / Approval required: {lab.readiness.approvalRequiredBeforeExternalAction ? 'Yes' : 'No'}
                  </p>
                </div>
                <div>
                  <div style={eyebrowStyle}>EXACT APPROVAL REQUIRED FOR</div>
                  {lab.readiness.exactApprovalRequiredFor.map((item) => (
                    <p key={item} style={{ color: muted, fontSize: '14px', lineHeight: 1.5, margin: '0 0 0.35rem' }}>
                      {item}
                    </p>
                  ))}
                </div>
                <div>
                  <div style={eyebrowStyle}>LAST PREP RECEIPT</div>
                  <p style={{ color: ivory85, fontSize: '14px', lineHeight: 1.55, margin: '0 0 0.45rem' }}>
                    {lab.prepReceipt.detail}
                  </p>
                  <p style={{ color: muted, fontSize: '13px', lineHeight: 1.45, margin: 0 }}>
                    {lab.prepReceipt.mode.replace(/_/g, ' ')} / {new Date(lab.prepReceipt.generatedAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </section>

            <section style={{ ...sectionStyle, marginBottom: '1.25rem' }}>
              <div style={eyebrowStyle}>BATCH TEMPLATES</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '1rem' }}>
                {lab.batchTemplates.map((batch) => (
                  <button key={batch.id} type="button" onClick={() => selectBatch(batch.id)} style={batch.id === localState.activeBatchId ? activeBatchStyle : batchStyle}>
                    <span style={eyebrowStyle}>{batch.targetSlots} SLOTS</span>
                    <span style={{ color: parchment, fontFamily: 'Playfair Display, serif', fontSize: '23px', lineHeight: 1.15 }}>{batch.label}</span>
                    <span style={{ color: muted, fontSize: '13px', lineHeight: 1.45, marginTop: '0.6rem' }}>{batch.ask}</span>
                  </button>
                ))}
              </div>
            </section>

            {activeBatch && (
              <section style={{ ...sectionStyle, marginBottom: '1.25rem' }}>
                <div style={eyebrowStyle}>ACTIVE BATCH</div>
                <h2 style={h2Style}>{activeBatch.label}</h2>
                <p style={smallBodyStyle}>{activeBatch.ask}</p>
                <div style={innerPanelStyle}>
                  <div style={eyebrowStyle}>EXACT APPROVAL TEXT</div>
                  <p style={{ color: parchment, fontSize: '15px', lineHeight: 1.6, margin: 0 }}>{activeBatch.approvalText}</p>
                </div>
                <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>
                  {(localState.slots[activeBatch.id] || []).map((slot, index) => (
                    <div key={`${activeBatch.id}-${index}`} style={slotStyle}>
                      <div style={{ color: gold, fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.12em' }}>#{index + 1}</div>
                      <input
                        value={slot.label}
                        onChange={(event) => updateSlot(index, { label: event.target.value })}
                        placeholder="Redacted recipient label only"
                        style={inputStyle}
                      />
                      <select value={slot.channel} onChange={(event) => updateSlot(index, { channel: event.target.value })} style={selectStyle}>
                        <option value="email">Email</option>
                        <option value="text">Text</option>
                        <option value="dm">DM</option>
                        <option value="call">Call</option>
                        <option value="intro">Intro request</option>
                      </select>
                      <select value={slot.status} onChange={(event) => updateSlot(index, { status: event.target.value as SlotStatus })} style={{ ...selectStyle, color: statusColor(slot.status) }}>
                        <option value="empty">Empty</option>
                        <option value="candidate">Candidate</option>
                        <option value="ready_for_chris">Ready for Chris</option>
                        <option value="approved_elsewhere">Approved elsewhere</option>
                        <option value="deferred">Deferred</option>
                      </select>
                      <input
                        value={slot.note}
                        onChange={(event) => updateSlot(index, { note: event.target.value })}
                        placeholder="Local note, no private contact details"
                        style={inputStyle}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section style={{ ...sectionStyle, marginBottom: '1.25rem' }}>
              <div style={eyebrowStyle}>SEGMENTS</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: '1rem' }}>
                {lab.segments.map((segment) => (
                  <article key={segment.id} style={innerPanelStyle}>
                    <div style={eyebrowStyle}>PRIORITY {segment.priority}</div>
                    <h2 style={h2Style}>{segment.label}</h2>
                    <p style={smallBodyStyle}>{segment.whyItMatters}</p>
                    <p style={{ ...smallBodyStyle, color: ivory85 }}>{segment.bestAsk}</p>
                    <p style={{ ...smallBodyStyle, overflowWrap: 'anywhere' }}>{segment.utmLink}</p>
                  </article>
                ))}
              </div>
            </section>

            <section style={{ ...sectionStyle, marginBottom: '1.25rem' }}>
              <div style={eyebrowStyle}>DRAFT LIBRARY</div>
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                {lab.drafts.map((draft) => (
                  <button key={draft.id} type="button" onClick={() => setActiveDraftId(draft.id)} style={draft.id === activeDraftId ? activeFilterStyle : filterStyle}>
                    {draft.label.toUpperCase()}
                  </button>
                ))}
              </div>
              {activeDraft && (
                <article style={innerPanelStyle}>
                  <h2 style={h2Style}>{activeDraft.label}</h2>
                  <p style={smallBodyStyle}>{activeDraft.bestFor}</p>
                  <p style={{ ...smallBodyStyle, color: '#d17b7b' }}>{activeDraft.riskCheck}</p>
                  <div style={eyebrowStyle}>SUBJECT</div>
                  <p style={{ color: parchment, fontSize: '17px', lineHeight: 1.5, margin: '0 0 1rem' }}>{activeDraft.subject}</p>
                  <div style={eyebrowStyle}>BODY</div>
                  <pre style={preStyle}>{activeDraft.body}</pre>
                </article>
              )}
            </section>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 330px), 1fr))', gap: '1.25rem' }}>
              <ListPanel title="Daily Review" items={lab.dailyReview} />
              <ListPanel title="No-Go Rules" items={lab.noGoRules} danger />
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

const slotStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',
  gap: '0.5rem',
  alignItems: 'center',
  border: `1px solid ${gold}12`,
  background: '#0a0a0a',
  padding: '0.65rem',
};

const eyebrowStyle: CSSProperties = {
  color: gold,
  fontFamily: 'Cinzel, serif',
  fontSize: '10px',
  letterSpacing: '0.18em',
  marginBottom: '0.65rem',
};

const h2Style: CSSProperties = {
  color: parchment,
  fontFamily: 'Playfair Display, serif',
  fontSize: '26px',
  fontWeight: 400,
  lineHeight: 1.18,
  margin: '0 0 0.7rem',
};

const smallBodyStyle: CSSProperties = {
  color: muted,
  fontSize: '14px',
  lineHeight: 1.6,
  margin: '0 0 0.55rem',
};

const inputStyle: CSSProperties = {
  minWidth: 0,
  background: '#0d0d0d',
  color: parchment,
  border: `1px solid ${gold}24`,
  padding: '0.65rem',
  fontFamily: 'Cormorant Garamond, serif',
  fontSize: '14px',
};

const selectStyle: CSSProperties = {
  minWidth: 0,
  background: '#0d0d0d',
  color: parchment,
  border: `1px solid ${gold}24`,
  padding: '0.65rem',
  fontFamily: 'Cormorant Garamond, serif',
  fontSize: '14px',
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

const batchStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  textAlign: 'left',
  border: `1px solid ${gold}18`,
  background: '#0a0a0a',
  padding: '1rem',
  cursor: 'pointer',
};

const activeBatchStyle: CSSProperties = {
  ...batchStyle,
  border: `1px solid ${gold}66`,
  background: `${gold}08`,
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

const preStyle: CSSProperties = {
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  color: muted,
  border: `1px solid ${gold}12`,
  background: panel,
  padding: '1rem',
  fontFamily: 'Cormorant Garamond, serif',
  fontSize: '15px',
  lineHeight: 1.65,
  margin: 0,
};
