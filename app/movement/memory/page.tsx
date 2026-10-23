'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { getMemberSession } from '@/lib/auth/getSession';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#888';
const card = '#0d0d0d';
const border = '1px solid rgba(201,168,76,0.15)';

interface MemoryFact {
  id: string;
  category: string;
  key: string;
  value: string;
  confidence: number | null;
  validFrom: string | null;
  updatedAt: string | null;
}

interface ConsentReceipt {
  action: 'forget' | 'correct' | 'retract' | 'do_not_use' | string;
  writeMode: 'legacy_valid_until' | 'explicit_state_columns' | 'legacy_schema_fallback' | string;
  activeRecallRemoved: boolean;
  explicitStateRecorded: boolean;
  retrievalEffect: string;
  memberReviewedAt: string;
  replacementFactId?: string | null;
  noteStored: boolean;
}

interface RecentEpisode {
  id: string;
  thinkerId: string | null;
  role: string | null;
  summary: string | null;
  emotionalTone: string | null;
  significanceScore: number | null;
  createdAt: string | null;
}

interface Trigger {
  id: string;
  type: string | null;
  suggestedThinker: string | null;
  contextSummary: string | null;
  scheduledFor: string | null;
  status: string | null;
  deliveredAt: string | null;
}

interface MemoryOverview {
  member: {
    displayName: string | null;
  };
  summary: {
    activeFactCount: number;
    episodeCount: number;
    categoryCounts: Record<string, number>;
    profileUpdatedAt: string | null;
    personalAiBuiltAt: string | null;
    podUpdatedAt: string | null;
  };
  consentReadiness: {
    stateColumnsEnabled: boolean;
    writeMode: 'legacy_valid_until' | 'explicit_state_columns' | string;
    featureFlag: string;
    activeReadFilter: string;
    migrationReadFilter: string;
  };
  facts: MemoryFact[];
  profile: {
    summary: string | null;
    activeGoals: unknown[];
    pendingCommitments: unknown[];
    currentEmotionalState: string | null;
    lastSessionAt: string | null;
    updatedAt: string | null;
  } | null;
  recentEpisodes: RecentEpisode[];
  triggers: Trigger[];
  personalAi: {
    response_count_at_build?: number;
    last_built_at?: string | null;
    version?: number | null;
  } | null;
  pod: {
    exists: boolean;
    size_bytes: number;
    response_count: number;
    updated_at: string | null;
    sync_status: string | null;
    sync_conflict_count: number;
  } | null;
}

function formatDate(value: string | null): string {
  if (!value) return 'Not yet';
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatConfidence(value: number | null): string {
  if (typeof value !== 'number') return 'Unscored';
  return `${Math.round(value * 100)}%`;
}

function formatWriteMode(value: string | undefined): string {
  if (value === 'explicit_state_columns') return 'Explicit states';
  if (value === 'legacy_schema_fallback') return 'Legacy fallback';
  return 'Legacy safe';
}

function formatAction(value: string): string {
  if (value === 'do_not_use') return 'Do not use';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function describeItem(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  const firstText = record.goal || record.commitment || record.value || record.summary || record.status;
  if (typeof firstText === 'string') return firstText;
  return JSON.stringify(record).slice(0, 220);
}

function reportMemoryClientFailure(scope: string) {
  console.warn(`[movement/memory] ${scope} failed`);
}

export default function MovementMemoryPage() {
  const [overview, setOverview] = useState<MemoryOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [message, setMessage] = useState('');
  const [lastConsentReceipt, setLastConsentReceipt] = useState<ConsentReceipt | null>(null);
  const [forgettingId, setForgettingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const loadOverview = useCallback(async (showMessage = false) => {
    setLoading(true);
    try {
      const session = await getMemberSession();
      if (!session?.member) {
        setSignedIn(false);
        setOverview(null);
        return;
      }

      setSignedIn(true);
      const res = await fetch('/api/movement/memory/overview', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || 'Unable to load memory overview.');
        return;
      }
      setOverview(data);
      if (showMessage) setMessage('Memory overview refreshed.');
    } catch {
      reportMemoryClientFailure('overview');
      setMessage('Unable to load memory overview.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const groupedFacts = useMemo(() => {
    const groups = new Map<string, MemoryFact[]>();
    for (const fact of overview?.facts || []) {
      const category = fact.category || 'uncategorized';
      groups.set(category, [...(groups.get(category) || []), fact]);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [overview?.facts]);

  async function forgetFact(fact: MemoryFact) {
    const confirmed = window.confirm(`Forget this memory?\n\n${fact.key}: ${fact.value}`);
    if (!confirmed) return;

    setForgettingId(fact.id);
    setMessage('');
    try {
      const res = await fetch(`/api/movement/memory/facts/${fact.id}`, {
        method: 'DELETE',
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || 'Unable to forget memory.');
        return;
      }
      if (data.consentReceipt) setLastConsentReceipt(data.consentReceipt as ConsentReceipt);
      setOverview((current) =>
        current
          ? {
              ...current,
              facts: current.facts.filter((item) => item.id !== fact.id),
              summary: {
                ...current.summary,
                activeFactCount: Math.max(0, current.summary.activeFactCount - 1),
              },
            }
          : current,
      );
      setMessage(data.consentReceipt?.retrievalEffect || 'Memory forgotten from active recall.');
    } catch {
      reportMemoryClientFailure('forget');
      setMessage('Unable to forget memory.');
    } finally {
      setForgettingId(null);
    }
  }

  async function suppressFact(fact: MemoryFact, action: 'retract' | 'do_not_use') {
    const label = action === 'retract' ? 'mark this memory as wrong' : 'stop the AI from using this memory';
    const confirmed = window.confirm(`Do you want to ${label}?\n\n${fact.key}: ${fact.value}`);
    if (!confirmed) return;

    setEditingId(fact.id);
    setMessage('');
    try {
      const res = await fetch(`/api/movement/memory/facts/${fact.id}`, {
        method: 'PATCH',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || 'Unable to update memory consent.');
        return;
      }
      if (data.consentReceipt) setLastConsentReceipt(data.consentReceipt as ConsentReceipt);
      setOverview((current) =>
        current
          ? {
              ...current,
              facts: current.facts.filter((item) => item.id !== fact.id),
              summary: {
                ...current.summary,
                activeFactCount: Math.max(0, current.summary.activeFactCount - 1),
              },
            }
          : current,
      );
      setMessage(data.consentReceipt?.retrievalEffect || (action === 'retract' ? 'Memory removed from active recall.' : 'Memory excluded from active AI use.'));
    } catch {
      reportMemoryClientFailure('suppression');
      setMessage('Unable to update memory consent.');
    } finally {
      setEditingId(null);
    }
  }

  async function correctFact(fact: MemoryFact) {
    const category = window.prompt('Category', fact.category)?.trim();
    if (!category) return;

    const key = window.prompt('Memory key', fact.key)?.trim();
    if (!key) return;

    const value = window.prompt('Corrected memory', fact.value)?.trim();
    if (!value) return;

    setEditingId(fact.id);
    setMessage('');
    try {
      const res = await fetch(`/api/movement/memory/facts/${fact.id}`, {
        method: 'PATCH',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'correct',
          replacement: { category, key, value },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || 'Unable to correct memory.');
        return;
      }
      if (data.consentReceipt) setLastConsentReceipt(data.consentReceipt as ConsentReceipt);

      const replacement = data.replacementFact as MemoryFact | undefined;
      setOverview((current) =>
        current && replacement
          ? {
              ...current,
              facts: current.facts.map((item) => (item.id === fact.id ? replacement : item)),
            }
          : current,
      );
      setMessage(data.consentReceipt?.retrievalEffect || 'Memory corrected for active recall.');
    } catch {
      reportMemoryClientFailure('correction');
      setMessage('Unable to correct memory.');
    } finally {
      setEditingId(null);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      <main style={{ maxWidth: '1040px', margin: '0 auto', padding: '8rem 2rem 6rem' }}>
        <header style={{ marginBottom: '2rem' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.3em', color: gold, marginBottom: '1rem' }}>
            MEMORY CONSENT
          </div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(32px, 6vw, 54px)', fontStyle: 'italic', fontWeight: 400, lineHeight: 1.12, margin: '0 0 1rem' }}>
            See what the Movement remembers.
          </h1>
          <p style={{ fontSize: '18px', lineHeight: 1.7, color: ivory85, maxWidth: '720px', margin: 0 }}>
            Active recall is separate from raw history: the Council can use these facts to continue a relationship, and you can remove anything that no longer belongs.
          </p>
        </header>

        {signedIn === false ? (
          <section style={{ background: card, border, padding: '2rem', textAlign: 'center' }}>
            <p style={{ color: muted, fontSize: '16px', fontStyle: 'italic', margin: '0 0 1.5rem' }}>
              Sign in to review memory and consent.
            </p>
            <a href="/login" style={linkButtonStyle}>
              SIGN IN
            </a>
          </section>
        ) : (
          <>
            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
              <Stat label="ACTIVE FACTS" value={loading ? '...' : String(overview?.summary.activeFactCount || 0)} />
              <Stat label="EPISODES" value={loading ? '...' : String(overview?.summary.episodeCount || 0)} />
              <Stat label="CONSENT MODE" value={loading ? '...' : formatWriteMode(overview?.consentReadiness.writeMode)} />
              <Stat label="MIRROR BUILD" value={loading ? '...' : formatDate(overview?.summary.personalAiBuiltAt || null)} />
              <Stat label="POD UPDATE" value={loading ? '...' : formatDate(overview?.summary.podUpdatedAt || null)} />
            </section>

            <section style={{ background: card, border, padding: '1.25rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <div style={eyebrowStyle}>CONTROL SURFACE</div>
                  <p style={{ color: muted, fontSize: '15px', lineHeight: 1.6, margin: 0 }}>
                    No embeddings, raw messages, or encrypted pod contents are exposed here.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button onClick={() => loadOverview(true)} disabled={loading} style={buttonStyle('neutral', loading)}>
                    REFRESH
                  </button>
                  <a href="/movement/pod" style={smallLinkButtonStyle}>
                    DATA POD
                  </a>
                  <a href="/movement/personal-ai" style={smallLinkButtonStyle}>
                    MIRROR
                  </a>
                </div>
              </div>
              <div style={{ borderTop: border, marginTop: '1rem', paddingTop: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem' }}>
                <ReadinessDetail
                  label="Write mode"
                  value={formatWriteMode(overview?.consentReadiness.writeMode)}
                />
                <ReadinessDetail
                  label="Flag"
                  value={overview?.consentReadiness.stateColumnsEnabled ? 'Enabled' : 'Off until migration'}
                />
                <ReadinessDetail
                  label="Active filter"
                  value={overview?.consentReadiness.stateColumnsEnabled ? overview.consentReadiness.migrationReadFilter : overview?.consentReadiness.activeReadFilter || 'valid_until is null'}
                />
              </div>
              {message && (
                <p style={{ color: muted, fontSize: '15px', fontStyle: 'italic', margin: '1rem 0 0' }}>
                  {message}
                </p>
              )}
              {lastConsentReceipt && (
                <div style={{ borderTop: border, marginTop: '1rem', paddingTop: '1rem' }}>
                  <div style={eyebrowStyle}>LAST CONSENT RECEIPT</div>
                  <p style={{ color: ivory85, fontSize: '15px', lineHeight: 1.6, margin: 0 }}>
                    {formatAction(lastConsentReceipt.action)} / {formatWriteMode(lastConsentReceipt.writeMode)} / {lastConsentReceipt.retrievalEffect}
                  </p>
                  <p style={factMetaStyle}>
                    Reviewed {formatDate(lastConsentReceipt.memberReviewedAt)} / Explicit state {lastConsentReceipt.explicitStateRecorded ? 'recorded' : 'not recorded yet'}
                  </p>
                </div>
              )}
            </section>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '1.25rem', alignItems: 'start' }}>
              <section style={{ background: card, border, padding: '1.25rem' }}>
                <div style={eyebrowStyle}>REMEMBERED FACTS</div>
                {loading ? (
                  <p style={emptyStyle}>Loading active memory...</p>
                ) : groupedFacts.length === 0 ? (
                  <p style={emptyStyle}>No active semantic facts yet.</p>
                ) : (
                  <div style={{ display: 'grid', gap: '1.25rem' }}>
                    {groupedFacts.map(([category, facts]) => (
                      <div key={category}>
                        <div style={{ ...eyebrowStyle, color: 'rgba(245,240,232,0.6)', marginBottom: '0.65rem' }}>
                          {category.toUpperCase()} ({facts.length})
                        </div>
                        <div style={{ display: 'grid', gap: '0.75rem' }}>
                          {facts.map((fact) => (
                            <article key={fact.id} style={factRowStyle}>
                              <div>
                                <h2 style={factTitleStyle}>{fact.key}</h2>
                                <p style={factValueStyle}>{fact.value}</p>
                                <p style={factMetaStyle}>
                                  Confidence {formatConfidence(fact.confidence)} / Updated {formatDate(fact.updatedAt)}
                                </p>
                              </div>
                              <div style={factActionStyle}>
                                <button
                                  onClick={() => correctFact(fact)}
                                  disabled={editingId === fact.id || forgettingId === fact.id}
                                  style={buttonStyle('gold', editingId === fact.id)}
                                >
                                  CORRECT
                                </button>
                                <button
                                  onClick={() => suppressFact(fact, 'do_not_use')}
                                  disabled={editingId === fact.id || forgettingId === fact.id}
                                  style={buttonStyle('neutral', editingId === fact.id)}
                                >
                                  DO NOT USE
                                </button>
                                <button
                                  onClick={() => suppressFact(fact, 'retract')}
                                  disabled={editingId === fact.id || forgettingId === fact.id}
                                  style={buttonStyle('neutral', editingId === fact.id)}
                                >
                                  WRONG
                                </button>
                                <button
                                  onClick={() => forgetFact(fact)}
                                  disabled={forgettingId === fact.id || editingId === fact.id}
                                  style={buttonStyle('neutral', forgettingId === fact.id)}
                                >
                                  {forgettingId === fact.id ? 'FORGETTING' : 'FORGET'}
                                </button>
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <aside style={{ display: 'grid', gap: '1.25rem' }}>
                <section style={{ background: card, border, padding: '1.25rem' }}>
                  <div style={eyebrowStyle}>PROFILE SUMMARY</div>
                  <p style={{ color: ivory85, fontSize: '16px', lineHeight: 1.7, margin: 0 }}>
                    {loading ? 'Loading...' : overview?.profile?.summary || 'No profile summary yet.'}
                  </p>
                  <Detail label="Emotional state" value={overview?.profile?.currentEmotionalState || 'Unknown'} />
                  <Detail label="Last session" value={formatDate(overview?.profile?.lastSessionAt || null)} />
                </section>

                <section style={{ background: card, border, padding: '1.25rem' }}>
                  <div style={eyebrowStyle}>GOALS & COMMITMENTS</div>
                  <CompactList items={overview?.profile?.activeGoals || []} empty="No active goals yet." />
                  <div style={{ height: '1rem' }} />
                  <CompactList items={overview?.profile?.pendingCommitments || []} empty="No pending commitments yet." />
                </section>

                <section style={{ background: card, border, padding: '1.25rem' }}>
                  <div style={eyebrowStyle}>RECENT EPISODES</div>
                  {(overview?.recentEpisodes || []).length === 0 ? (
                    <p style={emptyStyle}>No recent episodes yet.</p>
                  ) : (
                    <div style={{ display: 'grid', gap: '0.85rem' }}>
                      {overview?.recentEpisodes.map((episode) => (
                        <div key={episode.id} style={{ borderTop: border, paddingTop: '0.85rem' }}>
                          <p style={{ color: ivory85, fontSize: '15px', lineHeight: 1.55, margin: 0 }}>
                            {episode.summary || `${episode.role || 'Message'} with ${episode.thinkerId || 'the Council'}`}
                          </p>
                          <p style={factMetaStyle}>{formatDate(episode.createdAt)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section style={{ background: card, border, padding: '1.25rem' }}>
                  <div style={eyebrowStyle}>CHECK-INS</div>
                  {(overview?.triggers || []).length === 0 ? (
                    <p style={emptyStyle}>No scheduled check-ins.</p>
                  ) : (
                    <div style={{ display: 'grid', gap: '0.85rem' }}>
                      {overview?.triggers.map((trigger) => (
                        <div key={trigger.id} style={{ borderTop: border, paddingTop: '0.85rem' }}>
                          <p style={{ color: ivory85, fontSize: '15px', lineHeight: 1.55, margin: 0 }}>
                            {trigger.contextSummary || trigger.type || 'Check-in'}
                          </p>
                          <p style={factMetaStyle}>
                            {trigger.suggestedThinker || 'Council'} / {trigger.status || 'pending'} / {formatDate(trigger.scheduledFor)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </aside>
            </div>
          </>
        )}
      </main>

      <PublicFooter />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: card, border, padding: '1.15rem', minHeight: '112px' }}>
      <div style={eyebrowStyle}>{label}</div>
      <div style={{ color: parchment, fontFamily: 'Playfair Display, serif', fontSize: '22px', lineHeight: 1.2 }}>
        {value}
      </div>
    </div>
  );
}

function ReadinessDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ ...eyebrowStyle, color: 'rgba(245,240,232,0.55)', marginBottom: '0.35rem' }}>{label.toUpperCase()}</div>
      <p style={{ color: ivory85, fontSize: '14px', lineHeight: 1.45, margin: 0, overflowWrap: 'anywhere' }}>{value}</p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ borderTop: border, paddingTop: '0.85rem', marginTop: '0.85rem' }}>
      <div style={{ ...eyebrowStyle, color: 'rgba(245,240,232,0.55)', marginBottom: '0.35rem' }}>{label.toUpperCase()}</div>
      <p style={{ color: muted, fontSize: '15px', lineHeight: 1.5, margin: 0 }}>{value}</p>
    </div>
  );
}

function CompactList({ items, empty }: { items: unknown[]; empty: string }) {
  const visible = items.map(describeItem).filter(Boolean).slice(0, 4);
  if (visible.length === 0) return <p style={emptyStyle}>{empty}</p>;
  return (
    <div style={{ display: 'grid', gap: '0.65rem' }}>
      {visible.map((item, index) => (
        <p key={`${item}-${index}`} style={{ color: ivory85, fontSize: '15px', lineHeight: 1.5, margin: 0, borderTop: border, paddingTop: '0.65rem' }}>
          {item}
        </p>
      ))}
    </div>
  );
}

function buttonStyle(kind: 'gold' | 'neutral', disabled: boolean): CSSProperties {
  return {
    height: '40px',
    border: kind === 'gold' ? 'none' : border,
    background: kind === 'gold' ? gold : 'transparent',
    color: kind === 'gold' ? '#0a0a0a' : gold,
    fontFamily: 'Cinzel, serif',
    fontSize: '9px',
    letterSpacing: '0.15em',
    padding: '0 14px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    whiteSpace: 'nowrap',
  };
}

const eyebrowStyle: CSSProperties = {
  fontFamily: 'Cinzel, serif',
  fontSize: '8px',
  letterSpacing: '0.2em',
  color: gold,
  marginBottom: '0.75rem',
};

const emptyStyle: CSSProperties = {
  color: muted,
  fontSize: '15px',
  lineHeight: 1.6,
  fontStyle: 'italic',
  margin: 0,
};

const factRowStyle: CSSProperties = {
  border: '1px solid rgba(201,168,76,0.12)',
  padding: '1rem',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: '1rem',
  alignItems: 'start',
};

const factActionStyle: CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
  flexWrap: 'wrap',
};

const factTitleStyle: CSSProperties = {
  color: parchment,
  fontFamily: 'Playfair Display, serif',
  fontSize: '21px',
  fontWeight: 400,
  lineHeight: 1.2,
  margin: '0 0 0.35rem',
};

const factValueStyle: CSSProperties = {
  color: ivory85,
  fontSize: '16px',
  lineHeight: 1.6,
  margin: 0,
  overflowWrap: 'anywhere',
};

const factMetaStyle: CSSProperties = {
  color: 'rgba(245,240,232,0.5)',
  fontSize: '13px',
  lineHeight: 1.5,
  fontStyle: 'italic',
  margin: '0.65rem 0 0',
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

const smallLinkButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: '40px',
  border,
  background: 'transparent',
  color: gold,
  fontFamily: 'Cinzel, serif',
  fontSize: '9px',
  letterSpacing: '0.15em',
  padding: '0 14px',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
};
