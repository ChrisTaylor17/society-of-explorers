'use client';

import { useEffect, useState } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { getMemberSession } from '@/lib/auth/getSession';
import {
  getOrCreateWalletPodDeviceId,
  sealPayloadWithWalletPodKey,
  walletPodProviderAvailable,
} from '@/lib/movement/walletPodCrypto';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#888';
const card = '#0d0d0d';
const border = '1px solid rgba(201,168,76,0.15)';

interface PodStats {
  exists: boolean;
  size_bytes: number;
  response_count: number;
  last_commitment_hash: string | null;
  last_committed_at: string | null;
  updated_at: string | null;
  version: number | null;
  sync_version: number | null;
  sync_device_id: string | null;
  sync_client_updated_at: string | null;
  sync_status: string | null;
  sync_conflict_count: number;
  key_mode: 'not_built' | 'server_derived' | 'client_local' | 'client_wallet_derived' | 'unknown';
  custody_status: string;
  sovereignty_status: string;
  custody_verification: 'none' | 'server_generated' | 'client_attested' | 'wallet_signature_attested' | 'unknown';
  custody_note: string;
}

interface PodPayloadResponse {
  payload?: unknown;
  stats?: PodStats;
  member?: {
    id?: string;
    walletAddress?: string | null;
  };
  error?: string;
}

interface PodExportManifest {
  generatedAt: string;
  pod: {
    exists: boolean;
    encryptedSizeBytes: number;
    version: number | null;
    updatedAt: string | null;
    lastCommitmentHash: string | null;
    lastCommittedAt: string | null;
    syncVersion: number | null;
    syncStatus: string | null;
    syncConflictCount: number;
    keyMode: PodStats['key_mode'];
    custodyStatus: string;
    sovereigntyStatus: string;
    custodyVerification: PodStats['custody_verification'];
  };
  sourceSnapshot: {
    generatedAt: string;
    estimatedPlaintextBytes: number;
    sections: Array<{
      id: string;
      label: string;
      count: number;
    }>;
  };
  memoryConsent: {
    stateColumnsEnabled: boolean;
    writeMode: string;
    featureFlag: string;
    activeReadFilter: string;
    migrationReadFilter: string;
    exportScope: string;
    activeFactsIncluded: boolean;
    suppressedOrExpiredFactsIncluded: boolean;
    rawMemoryContentIncludedInManifest: boolean;
  };
  exportSafety: {
    rawPayloadIncluded: boolean;
    ciphertextIncluded: boolean;
    rawMemberIdIncluded: boolean;
    rawWalletAddressIncluded: boolean;
    rawWalletSignatureIncluded: boolean;
    externalActions: string;
    note: string;
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

function consentModeLabel(value: string | undefined): string {
  if (value === 'explicit_state_columns') return 'Explicit states';
  if (value === 'legacy_schema_fallback') return 'Legacy fallback';
  return 'Legacy safe';
}

function reportPodClientFailure(scope: string) {
  console.warn(`[movement/pod] ${scope} failed`);
}

export default function MovementPodPage() {
  const [stats, setStats] = useState<PodStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [walletSealing, setWalletSealing] = useState(false);
  const [message, setMessage] = useState('');
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [manifest, setManifest] = useState<PodExportManifest | null>(null);

  async function loadStats(showMessage = false) {
    setLoading(true);
    try {
      const session = await getMemberSession();
      if (!session?.member) {
        setSignedIn(false);
        setStats(null);
        return;
      }
      setSignedIn(true);

      const [statsRes, manifestRes] = await Promise.all([
        fetch('/api/movement/pod/stats', { cache: 'no-store' }),
        fetch('/api/movement/pod/manifest', { cache: 'no-store' }),
      ]);
      const data = await statsRes.json();
      const manifestData = await manifestRes.json().catch(() => ({}));
      if (!statsRes.ok) {
        setMessage(data.error || 'Unable to load pod stats.');
        return;
      }
      setStats(data.stats || null);
      if (manifestRes.ok) {
        setManifest(manifestData.manifest || null);
      }
      if (showMessage) setMessage('Pod stats refreshed.');
    } catch {
      reportPodClientFailure('stats');
      setMessage('Unable to load pod stats.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStats();
  }, []);

  async function refreshPod() {
    setRefreshing(true);
    setMessage('');
    try {
      const res = await fetch('/api/movement/pod/refresh', {
        method: 'POST',
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || 'Pod refresh failed.');
        return;
      }
      setStats(data.stats || null);
      setMessage('Your encrypted pod was refreshed.');
    } catch {
      reportPodClientFailure('refresh');
      setMessage('Pod refresh failed.');
    } finally {
      setRefreshing(false);
    }
  }

  async function sealWithWallet() {
    setWalletSealing(true);
    setMessage('');
    try {
      const session = await getMemberSession();
      if (!session?.member) {
        setSignedIn(false);
        setMessage('Sign in before sealing your pod.');
        return;
      }
      setSignedIn(true);

      if (!walletPodProviderAvailable()) {
        setMessage('Open this page in a browser with an Ethereum wallet to seal with wallet custody.');
        return;
      }

      const payloadRes = await fetch('/api/movement/pod/payload', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const payloadData = (await payloadRes.json().catch(() => ({}))) as PodPayloadResponse;
      if (!payloadRes.ok || !payloadData.payload || !payloadData.member?.id) {
        setMessage(payloadData.error || 'Unable to prepare pod payload.');
        return;
      }

      const baseSyncVersion = Number(payloadData.stats?.sync_version ?? stats?.sync_version ?? 0);
      const sealed = await sealPayloadWithWalletPodKey({
        payload: payloadData.payload,
        memberId: payloadData.member.id,
        baseSyncVersion: Number.isFinite(baseSyncVersion) ? baseSyncVersion : 0,
        deviceId: getOrCreateWalletPodDeviceId(),
        clientUpdatedAt: new Date().toISOString(),
        origin: window.location.origin,
      });

      const syncRes = await fetch('/api/movement/pod/sync', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(sealed.envelope),
      });
      const syncData = await syncRes.json().catch(() => ({}));
      if (!syncRes.ok || syncData?.ok === false) {
        const syncNotice =
          typeof syncData?.error === 'string'
            ? syncData.error
            : 'Wallet-sealed pod sync was not accepted.';
        setMessage(syncNotice);
        return;
      }

      await loadStats();
      setMessage(`Your pod was sealed with wallet custody (${shortAddress(sealed.address)}); only hash attestations were stored.`);
    } catch {
      reportPodClientFailure('wallet seal');
      setMessage('Wallet seal failed. No pod data was synced.');
    } finally {
      setWalletSealing(false);
    }
  }

  function exportPod() {
    const confirmed = window.confirm(
      `Export encrypted pod?\n\nThis downloads ciphertext plus verification metadata. It does not export plaintext from this route.\n\nManifest sections: ${
        manifest?.sourceSnapshot.sections.map((section) => `${section.label}: ${section.count}`).join(', ') || 'not loaded'
      }`,
    );
    if (!confirmed) return;
    window.location.href = '/api/movement/pod/export';
  }

  function exportReceipt() {
    window.location.href = '/api/movement/pod/receipt';
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      <main style={{ maxWidth: '820px', margin: '0 auto', padding: '8rem 2rem 6rem' }}>
        <header style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.3em', color: gold, marginBottom: '1.25rem' }}>
            SOVEREIGN DATA POD
          </div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(32px, 6vw, 52px)', fontStyle: 'italic', fontWeight: 400, lineHeight: 1.12, margin: '0 0 1.25rem' }}>
            Your data, encrypted and yours.
          </h1>
          <p style={{ fontSize: '18px', lineHeight: 1.75, color: ivory85, maxWidth: '600px', margin: '0 auto' }}>
            Your daily practice and memory trail can be sealed into an encrypted pod snapshot. Society of Explorers stores ciphertext and commitments; the long-term direction is portable, client-keyed ownership.
          </p>
        </header>

        <section style={{ background: card, border, padding: '1.5rem', marginBottom: '1.5rem' }}>
          {signedIn === false ? (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              <p style={{ color: muted, fontSize: '16px', fontStyle: 'italic', margin: '0 0 1.5rem' }}>
                Sign in to refresh or export your pod.
              </p>
              <a href="/login" style={linkButtonStyle}>
                SIGN IN
              </a>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: message ? '1.25rem' : 0 }}>
                <button onClick={sealWithWallet} disabled={walletSealing || refreshing || signedIn !== true} style={buttonStyle('gold', walletSealing || refreshing || signedIn !== true)}>
                  {walletSealing ? 'SEALING' : 'SEAL WITH WALLET'}
                </button>
                <button onClick={refreshPod} disabled={refreshing || walletSealing || signedIn !== true} style={buttonStyle('neutral', refreshing || walletSealing || signedIn !== true)}>
                  {refreshing ? 'REFRESHING' : 'SERVER REFRESH'}
                </button>
                <button onClick={exportPod} disabled={!stats?.exists} style={buttonStyle('neutral', !stats?.exists)}>
                  EXPORT POD
                </button>
                <button onClick={exportReceipt} disabled={!stats?.exists} style={buttonStyle('neutral', !stats?.exists)}>
                  EXPORT RECEIPT
                </button>
                <button onClick={() => loadStats(true)} disabled={loading || signedIn !== true} style={buttonStyle('neutral', loading || signedIn !== true)}>
                  VIEW POD STATS
                </button>
                <a href="/movement/sovereignty" style={smallLinkButtonStyle}>
                  PASSPORT
                </a>
                <a href="/movement/pod/verify" style={smallLinkButtonStyle}>
                  VERIFY EXPORT
                </a>
                <a href="/movement/memory" style={smallLinkButtonStyle}>
                  MEMORY CONSENT
                </a>
              </div>
              {message && (
                <p style={{ color: muted, textAlign: 'center', fontSize: '15px', fontStyle: 'italic', margin: 0 }}>
                  {message}
                </p>
              )}
            </>
          )}
        </section>

        {signedIn !== false && (
          <section style={{ marginTop: '1rem', background: '#111', border, padding: '1.25rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.22em', color: gold, marginBottom: '0.75rem' }}>
              EXPORT MANIFEST
            </div>
            {!manifest ? (
              <p style={{ color: muted, fontSize: '14px', lineHeight: 1.6, margin: 0 }}>
                {loading ? 'Loading manifest...' : 'Manifest unavailable.'}
              </p>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                  <Stat label="ENCRYPTED" value={formatBytes(manifest.pod.encryptedSizeBytes || 0)} />
                  <Stat label="PLAINTEXT EST." value={formatBytes(manifest.sourceSnapshot.estimatedPlaintextBytes || 0)} />
                  <Stat label="SECTIONS" value={String(manifest.sourceSnapshot.sections.length)} />
                  <Stat label="CONSENT" value={consentModeLabel(manifest.memoryConsent.writeMode)} />
                  <Stat label="ACTIONS" value={manifest.exportSafety.externalActions.toUpperCase()} />
                </div>
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  {manifest.sourceSnapshot.sections.map((section) => (
                    <div key={section.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', borderTop: border, paddingTop: '0.5rem', color: muted, fontSize: '14px' }}>
                      <span>{section.label}</span>
                      <span style={{ color: parchment }}>{section.count}</span>
                    </div>
                  ))}
                </div>
                <div style={{ borderTop: border, marginTop: '0.9rem', paddingTop: '0.75rem', display: 'grid', gap: '0.4rem', color: muted, fontSize: '14px', lineHeight: 1.55 }}>
                  <div>Memory consent: {consentModeLabel(manifest.memoryConsent.writeMode)}</div>
                  <div>Export scope: {manifest.memoryConsent.exportScope}</div>
                  <div>Suppressed or expired facts included: {manifest.memoryConsent.suppressedOrExpiredFactsIncluded ? 'Yes' : 'No'}</div>
                </div>
                <p style={{ color: 'rgba(245,240,232,0.55)', fontSize: '13px', lineHeight: 1.55, margin: '0.9rem 0 0' }}>
                  {manifest.exportSafety.note}
                </p>
              </>
            )}
          </section>
        )}

        {signedIn !== false && (
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
            <Stat label="POD SIZE" value={loading ? '...' : formatBytes(stats?.size_bytes || 0)} />
            <Stat label="RESPONSES" value={loading ? '...' : String(stats?.response_count || 0)} />
            <Stat label="VERSION" value={loading ? '...' : stats?.version ? `v${stats.version}` : 'Not built'} />
            <Stat label="UPDATED" value={loading ? '...' : formatDate(stats?.updated_at || null)} />
            <Stat label="SYNC" value={loading ? '...' : stats?.sync_status || 'Local'} />
            <Stat label="CONFLICTS" value={loading ? '...' : String(stats?.sync_conflict_count || 0)} />
            <Stat label="KEY MODE" value={loading ? '...' : keyModeLabel(stats?.key_mode || 'not_built')} />
            <Stat label="CUSTODY" value={loading ? '...' : stats?.sovereignty_status || 'Ready'} />
            <Stat label="VERIFICATION" value={loading ? '...' : verificationLabel(stats?.custody_verification || 'none')} />
          </section>
        )}

        {signedIn !== false && (
          <section style={{ marginTop: '1rem', background: '#111', border, padding: '1.25rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.22em', color: gold, marginBottom: '0.75rem' }}>
              LAST COMMITMENT HASH
            </div>
            <p style={{ color: muted, fontSize: '14px', lineHeight: 1.6, overflowWrap: 'anywhere', margin: 0 }}>
              {loading ? '...' : stats?.last_commitment_hash || 'Not committed yet'}
            </p>
            <p style={{ color: 'rgba(245,240,232,0.55)', fontSize: '13px', fontStyle: 'italic', margin: '0.75rem 0 0' }}>
              {loading ? '' : `Committed: ${formatDate(stats?.last_committed_at || null)}`}
            </p>
          </section>
        )}

        {signedIn !== false && (
          <section style={{ marginTop: '1rem', background: '#111', border, padding: '1.25rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.22em', color: gold, marginBottom: '0.75rem' }}>
              KEY CUSTODY
            </div>
            <p style={{ color: ivory85, fontSize: '16px', lineHeight: 1.65, margin: 0 }}>
              {loading
                ? '...'
                : `${stats?.custody_status || 'No pod built yet'} - ${stats?.sovereignty_status || 'Ready to initialize'}`}
            </p>
            {!loading && (
              <>
                <p style={{ color: muted, fontSize: '14px', lineHeight: 1.65, margin: '0.75rem 0 0' }}>
                  {stats?.custody_note || 'No custody metadata has been recorded yet.'}
                </p>
                <p style={{ color: 'rgba(245,240,232,0.55)', fontSize: '13px', lineHeight: 1.55, margin: '0.75rem 0 0' }}>
                  Wallet sealing protects the pod snapshot. Source practice data still remains in the app systems until local-first capture is implemented.
                </p>
                <p style={{ color: 'rgba(245,240,232,0.55)', fontSize: '13px', lineHeight: 1.55, margin: '0.75rem 0 0' }}>
                  Export receipt creates a proof artifact without ciphertext, plaintext, raw wallet address, raw wallet signature, or raw member identifier.
                </p>
              </>
            )}
          </section>
        )}
      </main>

      <PublicFooter />
    </div>
  );
}

function keyModeLabel(value: PodStats['key_mode']): string {
  switch (value) {
    case 'client_wallet_derived':
      return 'Wallet';
    case 'client_local':
      return 'Client';
    case 'server_derived':
      return 'Server';
    case 'unknown':
      return 'Review';
    default:
      return 'Not built';
  }
}

function verificationLabel(value: PodStats['custody_verification']): string {
  switch (value) {
    case 'wallet_signature_attested':
      return 'Wallet attested';
    case 'client_attested':
      return 'Client attested';
    case 'server_generated':
      return 'Server generated';
    case 'unknown':
      return 'Needs review';
    default:
      return 'Not built';
  }
}

function shortAddress(value: string): string {
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: card, border, padding: '1.25rem', minHeight: '112px' }}>
      <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.2em', color: gold, marginBottom: '0.8rem' }}>
        {label}
      </div>
      <div style={{ color: parchment, fontFamily: 'Playfair Display, serif', fontSize: '24px', lineHeight: 1.2 }}>
        {value}
      </div>
    </div>
  );
}

function buttonStyle(kind: 'gold' | 'neutral', disabled: boolean): React.CSSProperties {
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

const linkButtonStyle: React.CSSProperties = {
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

const smallLinkButtonStyle: React.CSSProperties = {
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
