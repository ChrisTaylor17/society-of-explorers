'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { getSupabaseAccessToken } from '@/lib/auth/getSession';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';
const panel = '#0d0d0d';
const border = `1px solid ${gold}18`;

type CapabilityStatus = 'ready' | 'missing' | 'partial';

type AIStatus = {
  generatedAt: string;
  mode: string;
  gateway: {
    enabled: boolean;
    explicitlyDisabled: boolean;
    tokenPresent: boolean;
  };
  claudeModels: Array<{
    purpose: string;
    provider: string;
    model: string;
  }>;
  capabilities: Array<{
    id: string;
    label: string;
    status: CapabilityStatus;
    provider: string;
    model: string;
    detail: string;
    env: Array<{
      id: string;
      label: string;
      present: boolean;
      requiredFor: string;
    }>;
  }>;
  summary: {
    ready: number;
    partial: number;
    missing: number;
  };
  blockers: string[];
  warnings: string[];
  safety: {
    exposesSecretValues: boolean;
    externalActions: string;
    note: string;
  };
  receipt: {
    action: string;
    generatedAt: string;
    mode: 'read_only_status_probe' | string;
    externalActions: 'none' | string;
    providerCallsMade: boolean;
    secretValuesExposed: boolean;
    mutableSystemsTouched: boolean;
    allowedUse: string;
    detail: string;
  };
};

function statusColor(status: CapabilityStatus | string): string {
  if (status === 'ready') return '#8fbf8f';
  if (status === 'partial') return gold;
  if (status === 'missing') return '#d17b7b';
  return muted;
}

function labelize(value: string): string {
  return value.replace(/[-_]/g, ' ').toUpperCase();
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={metricStyle}>
      <div style={eyebrowStyle}>{label}</div>
      <div style={{ color: parchment, fontFamily: 'Cinzel, serif', fontSize: '24px', lineHeight: 1.2 }}>{value}</div>
      {sub && <p style={{ color: muted, fontSize: '13px', lineHeight: 1.5, margin: '0.5rem 0 0' }}>{sub}</p>}
    </div>
  );
}

export default function AIStatusPage() {
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const token = await getSupabaseAccessToken();
        const res = await fetch('/api/admin/ai/status', {
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || 'AI status unavailable');
        setStatus(payload.ai || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'AI status unavailable');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      <main style={{ maxWidth: '1120px', margin: '0 auto', padding: '8rem 2rem 6rem' }}>
        <Link href="/capital" style={{ color: muted, fontSize: '14px', textDecoration: 'none' }}>
          Back to command center
        </Link>

        <header style={{ margin: '1.5rem 0 2rem' }}>
          <div style={eyebrowStyle}>AI OPS STATUS</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(34px, 6vw, 58px)', fontWeight: 400, lineHeight: 1.1, margin: '0 0 1rem' }}>
            Provider readiness without secrets.
          </h1>
          <p style={{ fontSize: '19px', color: ivory85, lineHeight: 1.8, maxWidth: '760px', margin: 0 }}>
            Private status for Claude, Realtime voice, embeddings, and Supabase admin dependencies. This page reports presence and model names only.
          </p>
        </header>

        {loading && <div style={{ color: muted, fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em' }}>LOADING...</div>}

        {!loading && error && (
          <section style={sectionStyle}>
            <p style={{ color: muted, fontSize: '16px', lineHeight: 1.7, margin: 0 }}>
              {error}. Sign in as an approved admin account to view AI status.
            </p>
          </section>
        )}

        {status && (
          <>
            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
              <Metric label="Mode" value={labelize(status.mode)} sub={status.gateway.enabled ? 'Gateway selected' : 'Direct provider path'} />
              <Metric label="Ready" value={String(status.summary.ready)} sub="Configured capabilities" />
              <Metric label="Partial" value={String(status.summary.partial)} sub="Needs one dependency" />
              <Metric label="Missing" value={String(status.summary.missing)} sub="Blocked capabilities" />
              <Metric label="External Calls" value={labelize(status.safety.externalActions)} sub="Status route is read-only" />
            </section>

            <section style={{ ...sectionStyle, marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div>
                  <div style={eyebrowStyle}>SAFETY</div>
                  <p style={{ color: muted, fontSize: '15px', lineHeight: 1.65, margin: 0 }}>{status.safety.note}</p>
                </div>
                <div style={{ color: status.safety.exposesSecretValues ? '#d17b7b' : '#8fbf8f', fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.16em' }}>
                  {status.safety.exposesSecretValues ? 'SECRET LEAK RISK' : 'NO SECRET VALUES'}
                </div>
              </div>
              <p style={{ color: muted, fontSize: '13px', lineHeight: 1.55, margin: '0.8rem 0 0' }}>
                Generated {new Date(status.generatedAt).toLocaleString()}
              </p>
            </section>

            <section style={{ ...sectionStyle, marginBottom: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: '1rem', alignItems: 'start' }}>
                <div>
                  <div style={eyebrowStyle}>AI STATUS RECEIPT</div>
                  <p style={{ color: ivory85, fontSize: '14px', lineHeight: 1.55, margin: '0 0 0.45rem' }}>
                    {status.receipt.detail}
                  </p>
                  <p style={{ color: muted, fontSize: '13px', lineHeight: 1.45, margin: 0 }}>
                    {status.receipt.mode.replace(/_/g, ' ')} / {new Date(status.receipt.generatedAt).toLocaleString()}
                  </p>
                </div>
                <div>
                  <div style={eyebrowStyle}>READ-ONLY GUARANTEE</div>
                  <p style={{ color: muted, fontSize: '14px', lineHeight: 1.55, margin: '0 0 0.35rem' }}>
                    Provider calls: {status.receipt.providerCallsMade ? 'Yes' : 'No'}
                  </p>
                  <p style={{ color: muted, fontSize: '14px', lineHeight: 1.55, margin: '0 0 0.35rem' }}>
                    Secret values exposed: {status.receipt.secretValuesExposed ? 'Yes' : 'No'}
                  </p>
                  <p style={{ color: muted, fontSize: '14px', lineHeight: 1.55, margin: 0 }}>
                    Mutable systems touched: {status.receipt.mutableSystemsTouched ? 'Yes' : 'No'}
                  </p>
                </div>
                <div>
                  <div style={eyebrowStyle}>ALLOWED USE</div>
                  <p style={{ color: muted, fontSize: '14px', lineHeight: 1.55, margin: 0 }}>
                    {status.receipt.allowedUse}
                  </p>
                </div>
              </div>
            </section>

            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 310px), 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
              {status.capabilities.map((capability) => (
                <article key={capability.id} style={sectionStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '0.8rem' }}>
                    <h2 style={{ color: parchment, fontFamily: 'Playfair Display, serif', fontSize: '25px', fontWeight: 400, lineHeight: 1.15, margin: 0 }}>
                      {capability.label}
                    </h2>
                    <span style={{ ...pillStyle(capability.status), flexShrink: 0 }}>{labelize(capability.status)}</span>
                  </div>
                  <p style={{ color: muted, fontSize: '14px', lineHeight: 1.6, margin: '0 0 0.8rem' }}>{capability.detail}</p>
                  <div style={{ color: ivory85, fontSize: '14px', lineHeight: 1.6, marginBottom: '0.85rem' }}>
                    {capability.provider} / {capability.model}
                  </div>
                  <div style={{ display: 'grid', gap: '0.5rem' }}>
                    {capability.env.map((env) => (
                      <div key={`${capability.id}-${env.id}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', borderTop: `1px solid ${gold}10`, paddingTop: '0.5rem', color: muted }}>
                        <span>{env.label}</span>
                        <span style={{ color: env.present ? '#8fbf8f' : '#d17b7b' }}>{env.present ? 'set' : 'missing'}</span>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </section>

            <section style={{ ...sectionStyle, marginBottom: '1.25rem' }}>
              <div style={eyebrowStyle}>CLAUDE MODEL MAP</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: '0.75rem' }}>
                {status.claudeModels.map((model) => (
                  <div key={model.purpose} style={{ border: `1px solid ${gold}12`, padding: '0.85rem', background: '#0a0a0a' }}>
                    <div style={{ color: gold, fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.14em', marginBottom: '0.45rem' }}>{labelize(model.purpose)}</div>
                    <div style={{ color: ivory85, fontSize: '14px', lineHeight: 1.5 }}>{model.model}</div>
                    <div style={{ color: muted, fontSize: '12px', lineHeight: 1.5, marginTop: '0.25rem' }}>{model.provider}</div>
                  </div>
                ))}
              </div>
            </section>

            {(status.blockers.length > 0 || status.warnings.length > 0) && (
              <section style={sectionStyle}>
                <div style={eyebrowStyle}>ATTENTION</div>
                {[...status.blockers, ...status.warnings].map((item) => (
                  <p key={item} style={{ color: muted, fontSize: '15px', lineHeight: 1.65, margin: '0 0 0.55rem' }}>
                    {item}
                  </p>
                ))}
              </section>
            )}
          </>
        )}
      </main>

      <PublicFooter />
    </div>
  );
}

function pillStyle(status: CapabilityStatus): CSSProperties {
  return {
    border: `1px solid ${statusColor(status)}55`,
    color: statusColor(status),
    fontFamily: 'Cinzel, serif',
    fontSize: '8px',
    letterSpacing: '0.14em',
    padding: '0.35rem 0.5rem',
  };
}

const eyebrowStyle: CSSProperties = {
  fontFamily: 'Cinzel, serif',
  fontSize: '9px',
  letterSpacing: '0.18em',
  color: gold,
  marginBottom: '0.75rem',
};

const sectionStyle: CSSProperties = {
  background: panel,
  border,
  padding: '1.35rem',
};

const metricStyle: CSSProperties = {
  background: panel,
  border,
  padding: '1.15rem',
  minHeight: '116px',
};
