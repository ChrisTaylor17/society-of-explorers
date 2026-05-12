'use client';

import { useEffect, useState } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { getMemberSession } from '@/lib/auth/getSession';

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

export default function MovementPodPage() {
  const [stats, setStats] = useState<PodStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

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

      const res = await fetch('/api/movement/pod/stats', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || 'Unable to load pod stats.');
        return;
      }
      setStats(data.stats || null);
      if (showMessage) setMessage('Pod stats refreshed.');
    } catch (err) {
      console.error('[movement/pod] stats failed', err);
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
      const res = await fetch('/api/movement/pod/refresh', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || 'Pod refresh failed.');
        return;
      }
      setStats(data.stats || null);
      setMessage('Your encrypted pod was refreshed.');
    } catch (err) {
      console.error('[movement/pod] refresh failed', err);
      setMessage('Pod refresh failed.');
    } finally {
      setRefreshing(false);
    }
  }

  function exportPod() {
    window.location.href = '/api/movement/pod/export';
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
            Your daily practice and memory trail can be sealed into an encrypted pod. Society of Explorers stores ciphertext; the long-term direction is portable, client-keyed ownership.
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
                <button onClick={refreshPod} disabled={refreshing || signedIn !== true} style={buttonStyle('gold', refreshing || signedIn !== true)}>
                  {refreshing ? 'REFRESHING' : 'REFRESH POD'}
                </button>
                <button onClick={exportPod} disabled={!stats?.exists} style={buttonStyle('neutral', !stats?.exists)}>
                  EXPORT POD
                </button>
                <button onClick={() => loadStats(true)} disabled={loading || signedIn !== true} style={buttonStyle('neutral', loading || signedIn !== true)}>
                  VIEW POD STATS
                </button>
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
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
            <Stat label="POD SIZE" value={loading ? '...' : formatBytes(stats?.size_bytes || 0)} />
            <Stat label="RESPONSES" value={loading ? '...' : String(stats?.response_count || 0)} />
            <Stat label="VERSION" value={loading ? '...' : stats?.version ? `v${stats.version}` : 'Not built'} />
            <Stat label="UPDATED" value={loading ? '...' : formatDate(stats?.updated_at || null)} />
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
