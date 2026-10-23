'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#888';
const card = '#0d0d0d';
const border = '1px solid rgba(201,168,76,0.15)';

interface PassportAction {
  label: string;
  href: string;
  status: 'ready' | 'recommended' | 'complete' | 'needs_review';
  detail: string;
}

interface SovereigntyPassport {
  generated_at: string;
  member: {
    display_name: string | null;
    tier: string | null;
    member_id_hash: string;
    wallet_connected: boolean;
    wallet_address_hash: string | null;
  };
  score: {
    value: number;
    label: string;
    summary: string;
  };
  pod: {
    exists: boolean;
    size_bytes: number;
    response_count: number;
    last_commitment_hash: string | null;
    last_committed_at: string | null;
    updated_at: string | null;
    version: number | null;
    sync_version: number | null;
    sync_status: string | null;
    sync_conflict_count: number;
    key_mode: string;
    custody_status: string;
    sovereignty_status: string;
    custody_verification: string;
    custody_note: string;
    attestation: string | null;
    key_derivation: string | null;
    server_can_decrypt_pod: boolean | null;
    wallet_signature_stored: boolean | null;
  };
  receipt: {
    available: boolean;
    receipt_hash: string | null;
    issued_at: string | null;
    member_id_hash: string | null;
    wallet_address_hash: string | null;
    privacy_flags: Record<string, boolean> | null;
  };
  memory: {
    active_fact_count: number;
    episode_count: number;
    category_counts: Record<string, number>;
    profile_updated_at: string | null;
    last_session_at: string | null;
    active_goal_count: number;
    pending_commitment_count: number;
    consent: {
      stateColumnsEnabled: boolean;
      writeMode: string;
      featureFlag: string;
      activeReadFilter: string;
      migrationReadFilter: string;
      exportScope: string;
      active_facts_included: boolean;
      suppressed_or_expired_facts_included: boolean;
      raw_memory_content_included: boolean;
    };
  };
  mirror: {
    built: boolean;
    version: number | null;
    last_built_at: string | null;
    response_count_at_build: number | null;
  };
  workflows: {
    proactive_trigger_count: number;
    pending_trigger_count: number;
  };
  custody_chain: Array<{
    label: string;
    value: string;
    state: 'complete' | 'ready' | 'needs_review' | 'missing';
  }>;
  actions: PassportAction[];
  privacy_notes: string[];
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

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function shortHash(value: string | null): string {
  if (!value) return 'Not recorded';
  return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-8)}` : value;
}

function labelize(value: string): string {
  return value
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function consentModeLabel(value: string | undefined): string {
  if (value === 'explicit_state_columns') return 'Explicit states';
  if (value === 'legacy_schema_fallback') return 'Legacy fallback';
  return 'Legacy safe';
}

function reportSovereigntyClientFailure(scope: string) {
  console.warn(`[movement/sovereignty] ${scope} failed`);
}

export default function SovereigntyPassportPage() {
  const [passport, setPassport] = useState<SovereigntyPassport | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [message, setMessage] = useState('');

  const loadPassport = useCallback(async (showMessage = false) => {
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/movement/sovereignty/passport', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setSignedIn(false);
        setPassport(null);
        return;
      }
      if (!res.ok) {
        setMessage(typeof data.error === 'string' ? data.error : 'Unable to load sovereignty passport.');
        return;
      }
      setSignedIn(true);
      setPassport(data.passport || null);
      if (showMessage) setMessage('Sovereignty passport refreshed.');
    } catch {
      reportSovereigntyClientFailure('passport');
      setMessage('Unable to load sovereignty passport.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPassport();
  }, [loadPassport]);

  const categoryEntries = useMemo(
    () =>
      Object.entries(passport?.memory.category_counts || {}).sort(([, left], [, right]) => right - left),
    [passport?.memory.category_counts],
  );

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      <main style={{ maxWidth: '1120px', margin: '0 auto', padding: '8rem 2rem 6rem' }}>
        <header style={{ marginBottom: '2rem', display: 'grid', gap: '1.25rem' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.3em', color: gold }}>
            SOVEREIGNTY PASSPORT
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '1.5rem', alignItems: 'end' }}>
            <div>
              <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '52px', fontStyle: 'italic', fontWeight: 400, lineHeight: 1.05, margin: '0 0 1rem' }}>
                Your custody trail at a glance.
              </h1>
              <p style={{ color: ivory85, fontSize: '18px', lineHeight: 1.75, maxWidth: '720px', margin: 0 }}>
                A private status page for the member-owned parts of the Movement: wallet custody, encrypted pod commitments, portable receipts, memory consent, and the personal mirror.
              </p>
            </div>
            <section style={{ background: card, border, padding: '1.5rem' }}>
              <div style={eyebrowStyle}>PASSPORT SCORE</div>
              <div style={{ color: parchment, fontFamily: 'Playfair Display, serif', fontSize: '44px', lineHeight: 1, marginBottom: '0.5rem' }}>
                {loading ? '...' : passport ? `${passport.score.value}` : '--'}
              </div>
              <div style={{ color: gold, fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', marginBottom: '0.75rem' }}>
                {loading ? 'LOADING' : passport?.score.label.toUpperCase() || 'LOCKED'}
              </div>
              <p style={{ color: muted, fontSize: '15px', lineHeight: 1.6, margin: 0 }}>
                {loading ? 'Reading private custody state...' : passport?.score.summary || 'Sign in to view private custody state.'}
              </p>
            </section>
          </div>
        </header>

        {signedIn === false ? (
          <section style={{ background: card, border, padding: '2rem', textAlign: 'center' }}>
            <p style={{ color: muted, fontSize: '16px', fontStyle: 'italic', margin: '0 0 1.5rem' }}>
              Sign in to view your sovereignty passport.
            </p>
            <a href="/login" style={goldLinkStyle}>
              SIGN IN
            </a>
          </section>
        ) : (
          <>
            <section style={{ background: card, border, padding: '1.25rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <div style={eyebrowStyle}>PRIVATE MEMBER SURFACE</div>
                  <p style={{ color: muted, fontSize: '15px', lineHeight: 1.6, margin: 0 }}>
                    {passport
                      ? `${passport.member.display_name || 'Explorer'} / ${passport.member.tier || 'member'} / ${formatDate(passport.generated_at)}`
                      : 'No raw wallet signature, plaintext memory, or ciphertext is shown here.'}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button onClick={() => loadPassport(true)} disabled={loading} style={buttonStyle(loading)}>
                    REFRESH
                  </button>
                  <a href="/api/movement/pod/receipt" style={smallLinkButtonStyle}>
                    EXPORT RECEIPT
                  </a>
                  <a href="/movement/pod/verify" style={smallLinkButtonStyle}>
                    VERIFY
                  </a>
                </div>
              </div>
              {message && (
                <p style={{ color: muted, fontSize: '15px', fontStyle: 'italic', margin: '1rem 0 0' }}>
                  {message}
                </p>
              )}
            </section>

            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
              <Stat label="KEY MODE" value={loading ? '...' : labelize(passport?.pod.key_mode || 'not_built')} />
              <Stat label="CUSTODY" value={loading ? '...' : passport?.pod.sovereignty_status || 'Ready'} />
              <Stat label="POD SIZE" value={loading ? '...' : formatBytes(passport?.pod.size_bytes || 0)} />
              <Stat label="RESPONSES" value={loading ? '...' : String(passport?.pod.response_count || 0)} />
              <Stat label="MEMORY FACTS" value={loading ? '...' : String(passport?.memory.active_fact_count || 0)} />
              <Stat label="CONSENT" value={loading ? '...' : consentModeLabel(passport?.memory.consent.writeMode)} />
              <Stat label="MIRROR" value={loading ? '...' : passport?.mirror.built ? `v${passport.mirror.version || 1}` : 'Not built'} />
            </section>

            {passport && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '1.25rem', alignItems: 'start' }}>
                  <section style={{ background: card, border, padding: '1.5rem' }}>
                    <div style={eyebrowStyle}>CUSTODY CHAIN</div>
                    <div style={{ display: 'grid', gap: '0.85rem', marginTop: '1rem' }}>
                      {passport.custody_chain.map((item) => (
                        <div key={item.label} style={{ borderTop: border, paddingTop: '0.85rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: '0.75rem', alignItems: 'center' }}>
                          <div style={{ color: 'rgba(245,240,232,0.62)', fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.14em' }}>
                            {item.label.toUpperCase()}
                          </div>
                          <div style={{ color: ivory85, fontSize: '15px', overflowWrap: 'anywhere' }}>{item.value}</div>
                          <div style={statePillStyle(item.state)}>{labelize(item.state)}</div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section style={{ background: card, border, padding: '1.5rem' }}>
                    <div style={eyebrowStyle}>PASSPORT ID</div>
                    <Detail label="Member hash" value={shortHash(passport.member.member_id_hash)} />
                    <Detail label="Wallet hash" value={shortHash(passport.member.wallet_address_hash)} />
                    <Detail label="Receipt hash" value={shortHash(passport.receipt.receipt_hash)} />
                    <Detail label="Commitment" value={shortHash(passport.pod.last_commitment_hash)} />
                    <Detail label="Committed" value={formatDate(passport.pod.last_committed_at)} />
                  </section>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '1.25rem', marginTop: '1.25rem', alignItems: 'start' }}>
                  <section style={{ background: card, border, padding: '1.5rem' }}>
                    <div style={eyebrowStyle}>MEMORY CONSENT</div>
                    <Detail label="Active facts" value={String(passport.memory.active_fact_count)} />
                    <Detail label="Episodes" value={String(passport.memory.episode_count)} />
                    <Detail label="Goals" value={String(passport.memory.active_goal_count)} />
                    <Detail label="Pending commitments" value={String(passport.memory.pending_commitment_count)} />
                    <Detail label="Profile updated" value={formatDate(passport.memory.profile_updated_at)} />
                    <Detail label="Consent mode" value={consentModeLabel(passport.memory.consent.writeMode)} />
                    <Detail label="Export scope" value={passport.memory.consent.exportScope} />
                    <Detail label="Suppressed included" value={passport.memory.consent.suppressed_or_expired_facts_included ? 'Yes' : 'No'} />
                    {categoryEntries.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem' }}>
                        {categoryEntries.slice(0, 8).map(([category, count]) => (
                          <span key={category} style={categoryPillStyle}>
                            {category} {count}
                          </span>
                        ))}
                      </div>
                    )}
                  </section>

                  <section style={{ background: card, border, padding: '1.5rem' }}>
                    <div style={eyebrowStyle}>PERSONAL MIRROR</div>
                    <Detail label="Built" value={passport.mirror.built ? 'Yes' : 'Not yet'} />
                    <Detail label="Version" value={passport.mirror.version ? `v${passport.mirror.version}` : 'Not built'} />
                    <Detail label="Last built" value={formatDate(passport.mirror.last_built_at)} />
                    <Detail label="Responses at build" value={passport.mirror.response_count_at_build === null ? 'Not recorded' : String(passport.mirror.response_count_at_build)} />
                    <Detail label="Pending triggers" value={String(passport.workflows.pending_trigger_count)} />
                  </section>

                  <section style={{ background: card, border, padding: '1.5rem' }}>
                    <div style={eyebrowStyle}>PRIVACY FLAGS</div>
                    {passport.receipt.privacy_flags ? (
                      Object.entries(passport.receipt.privacy_flags).map(([key, value]) => (
                        <Detail key={key} label={labelize(key.replace('includes_', ''))} value={value ? 'Included' : 'Excluded'} />
                      ))
                    ) : (
                      <p style={emptyStyle}>No receipt available yet.</p>
                    )}
                  </section>
                </div>

                <section style={{ marginTop: '1.25rem', background: card, border, padding: '1.5rem' }}>
                  <div style={eyebrowStyle}>NEXT MOVES</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '1rem', marginTop: '1rem' }}>
                    {passport.actions.map((action) => (
                      <a key={`${action.label}-${action.href}`} href={action.href} style={actionCardStyle}>
                        <div style={{ ...statePillStyle(action.status), width: 'fit-content', marginBottom: '0.85rem' }}>
                          {labelize(action.status)}
                        </div>
                        <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '23px', fontWeight: 400, lineHeight: 1.15, color: parchment, margin: '0 0 0.75rem' }}>
                          {action.label}
                        </h2>
                        <p style={{ color: muted, fontSize: '15px', lineHeight: 1.55, margin: 0 }}>{action.detail}</p>
                      </a>
                    ))}
                  </div>
                </section>

                <section style={{ marginTop: '1.25rem', borderTop: border, paddingTop: '1.5rem' }}>
                  {passport.privacy_notes.map((note) => (
                    <p key={note} style={{ color: 'rgba(245,240,232,0.58)', fontSize: '14px', lineHeight: 1.6, margin: '0 0 0.5rem' }}>
                      {note}
                    </p>
                  ))}
                </section>
              </>
            )}
          </>
        )}
      </main>

      <PublicFooter />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: card, border, padding: '1.25rem', minHeight: '112px' }}>
      <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, marginBottom: '0.8rem' }}>
        {label}
      </div>
      <div style={{ color: parchment, fontFamily: 'Playfair Display, serif', fontSize: '24px', lineHeight: 1.15, overflowWrap: 'anywhere' }}>
        {value}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ borderTop: border, paddingTop: '0.75rem', marginTop: '0.75rem' }}>
      <div style={{ color: 'rgba(245,240,232,0.54)', fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.16em', marginBottom: '0.35rem' }}>
        {label.toUpperCase()}
      </div>
      <div style={{ color: ivory85, fontSize: '15px', lineHeight: 1.45, overflowWrap: 'anywhere' }}>{value}</div>
    </div>
  );
}

function statePillStyle(state: string): CSSProperties {
  const color = state === 'complete' ? '#9ecf9e' : state === 'recommended' || state === 'ready' ? gold : '#d58b8b';
  return {
    border: `1px solid ${color}`,
    color,
    fontFamily: 'Cinzel, serif',
    fontSize: '8px',
    letterSpacing: '0.14em',
    padding: '0.35rem 0.5rem',
    textAlign: 'center',
    whiteSpace: 'nowrap',
  };
}

function buttonStyle(disabled: boolean): CSSProperties {
  return {
    height: '44px',
    border,
    background: 'transparent',
    color: gold,
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
  fontSize: '9px',
  letterSpacing: '0.22em',
  color: gold,
  marginBottom: '0.75rem',
};

const goldLinkStyle: CSSProperties = {
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
  height: '44px',
  border,
  background: 'transparent',
  color: gold,
  fontFamily: 'Cinzel, serif',
  fontSize: '9px',
  letterSpacing: '0.16em',
  padding: '0 16px',
  textDecoration: 'none',
};

const categoryPillStyle: CSSProperties = {
  border,
  color: ivory85,
  fontSize: '13px',
  padding: '0.35rem 0.55rem',
};

const actionCardStyle: CSSProperties = {
  border,
  background: '#111',
  padding: '1.1rem',
  minHeight: '180px',
  textDecoration: 'none',
  display: 'block',
};

const emptyStyle: CSSProperties = {
  color: muted,
  fontSize: '15px',
  lineHeight: 1.6,
  margin: 0,
};
