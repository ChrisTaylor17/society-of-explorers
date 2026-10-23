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

type GateStatus = 'ready' | 'needs_approval' | 'blocked' | 'manual';

type LaunchRoom = {
  generatedAt: string;
  status: string;
  statusLabel: string;
  summary: string;
  campaign: {
    name: string;
    goal: number;
    firstUseOfFunds: string;
    externalActionBoundary: string;
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
  readiness: {
    summary: {
      requiredEnvMissing: number;
      filesMissing: number;
      paymentWarnings: number;
      copyWarnings: number;
    };
    paymentSafety: {
      canRunStripeTests: boolean;
      stripeSecretMode: string;
      webhookConfigured: boolean;
      configuredPriceIds: number;
      warnings: string[];
    };
  };
  gates: Array<{
    id: string;
    label: string;
    status: GateStatus;
    detail: string;
    nextAction: string;
  }>;
  dryRunCommands: Array<{
    label: string;
    command: string;
    purpose: string;
  }>;
  approvals: Array<{
    label: string;
    status: string;
    detail: string;
    reference?: string;
    command?: string;
  }>;
  sevenDayLoop: Array<{
    day: string;
    focus: string;
    actions: string[];
  }>;
  safeNextMoves: string[];
  avoidForNow: string[];
};

function money(value: number): string {
  return `$${Math.round(value || 0).toLocaleString()}`;
}

function labelize(value: string): string {
  return value.replace(/_/g, ' ').toUpperCase();
}

function statusColor(status: string): string {
  if (status === 'ready' || status === 'ready_to_review' || status === 'ready_for_dry_run') return '#8fbf8f';
  if (status === 'blocked') return '#d17b7b';
  if (status === 'manual' || status === 'needs_approval') return gold;
  return muted;
}

export default function CapitalLaunchRoomPage() {
  const [room, setRoom] = useState<LaunchRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const token = await getSupabaseAccessToken();
        const res = await fetch('/api/admin/capital/launch-room', {
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || 'Launch room unavailable');
        setRoom(payload.launchRoom || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Launch room unavailable');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      <main style={{ maxWidth: '1180px', margin: '0 auto', padding: '8rem 2rem 6rem' }}>
        <Link href="/capital" style={{ color: muted, fontSize: '14px', textDecoration: 'none' }}>
          Back to command center
        </Link>

        <header style={{ margin: '1.5rem 0 2rem' }}>
          <div style={eyebrowStyle}>92B LAUNCH ROOM</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(34px, 6vw, 58px)', fontWeight: 400, lineHeight: 1.1, margin: '0 0 1rem' }}>
            Go/no-go for the patronage push.
          </h1>
          <p style={{ fontSize: '19px', color: ivory85, lineHeight: 1.8, maxWidth: '780px', margin: 0 }}>
            A private cockpit for the 30-day 92B campaign: local dry-runs, launch gates, approval packets, and the first seven-day operating loop.
          </p>
        </header>

        {loading && <div style={{ color: muted, fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em' }}>LOADING...</div>}

        {!loading && error && (
          <section style={sectionStyle}>
            <p style={{ color: muted, fontSize: '16px', lineHeight: 1.7, margin: 0 }}>
              {error}. Sign in as an approved admin account to view the Launch Room.
            </p>
          </section>
        )}

        {room && (
          <>
            <section style={{ ...sectionStyle, marginBottom: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '1rem', alignItems: 'start' }}>
                <div>
                  <div style={eyebrowStyle}>{room.campaign.name.toUpperCase()}</div>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '34px', color: parchment, marginBottom: '0.75rem' }}>
                    {money(room.campaign.goal)}
                  </div>
                  <p style={{ color: muted, fontSize: '15px', lineHeight: 1.65, margin: 0 }}>
                    {room.campaign.firstUseOfFunds}
                  </p>
                </div>
                <div>
                  <div style={eyebrowStyle}>CURRENT STATE</div>
                  <div style={{ color: statusColor(room.status), fontFamily: 'Cinzel, serif', fontSize: '14px', letterSpacing: '0.16em', marginBottom: '0.75rem' }}>
                    {room.statusLabel}
                  </div>
                  <p style={{ color: ivory85, fontSize: '16px', lineHeight: 1.65, margin: 0 }}>{room.summary}</p>
                  <p style={{ color: muted, fontSize: '13px', lineHeight: 1.55, margin: '0.75rem 0 0' }}>
                    Generated {new Date(room.generatedAt).toLocaleString()}
                  </p>
                </div>
                <div>
                  <div style={eyebrowStyle}>EXTERNAL BOUNDARY</div>
                  <p style={{ color: muted, fontSize: '15px', lineHeight: 1.65, margin: 0 }}>
                    {room.campaign.externalActionBoundary}
                  </p>
                </div>
              </div>
            </section>

            <section style={{ ...sectionStyle, marginBottom: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '1.25rem', alignItems: 'start' }}>
                <div>
                  <div style={eyebrowStyle}>CAPITAL PREP READINESS</div>
                  <p style={{ color: parchment, fontFamily: 'Cinzel, serif', fontSize: '18px', letterSpacing: '0.08em', margin: '0 0 0.6rem' }}>
                    {room.prepReadiness.mode.replace(/_/g, ' ')}
                  </p>
                  <p style={{ color: muted, fontSize: '14px', lineHeight: 1.6, margin: '0 0 0.55rem' }}>{room.prepReadiness.boundary}</p>
                  <p style={{ color: '#d17b7b', fontSize: '14px', lineHeight: 1.6, margin: 0 }}>
                    External actions: {room.prepReadiness.externalActions.toUpperCase()} / Approval required: {room.prepReadiness.approvalRequiredBeforeExternalAction ? 'Yes' : 'No'}
                  </p>
                </div>
                <div>
                  <div style={eyebrowStyle}>EXACT APPROVAL REQUIRED FOR</div>
                  {room.prepReadiness.exactApprovalRequiredFor.map((item) => (
                    <p key={item} style={{ color: muted, fontSize: '14px', lineHeight: 1.5, margin: '0 0 0.35rem' }}>
                      {item}
                    </p>
                  ))}
                </div>
                <div>
                  <div style={eyebrowStyle}>LAUNCH ROOM RECEIPT</div>
                  <p style={{ color: ivory85, fontSize: '14px', lineHeight: 1.55, margin: '0 0 0.45rem' }}>
                    {room.prepReceipt.detail}
                  </p>
                  <p style={{ color: muted, fontSize: '13px', lineHeight: 1.45, margin: 0 }}>
                    {room.prepReceipt.mode.replace(/_/g, ' ')} / {new Date(room.prepReceipt.generatedAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </section>

            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
              <Metric label="Missing Env" value={String(room.readiness.summary.requiredEnvMissing)} />
              <Metric label="Missing Files" value={String(room.readiness.summary.filesMissing)} />
              <Metric label="Payment Warnings" value={String(room.readiness.summary.paymentWarnings)} />
              <Metric label="Copy Warnings" value={String(room.readiness.summary.copyWarnings)} />
              <Metric label="Stripe Mode" value={room.readiness.paymentSafety.stripeSecretMode} />
              <Metric label="Price IDs" value={`${room.readiness.paymentSafety.configuredPriceIds}/4`} />
            </section>

            <section style={{ ...sectionStyle, marginBottom: '1.25rem' }}>
              <div style={eyebrowStyle}>LAUNCH GATES</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '1rem' }}>
                {room.gates.map((gate) => (
                  <article key={gate.id} style={{ border: `1px solid ${gold}12`, background: '#0a0a0a', padding: '1rem', minHeight: '190px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '0.8rem' }}>
                      <h2 style={{ color: parchment, fontFamily: 'Playfair Display, serif', fontSize: '24px', fontWeight: 400, lineHeight: 1.15, margin: 0 }}>
                        {gate.label}
                      </h2>
                      <span style={{ ...pillStyle(gate.status), flexShrink: 0 }}>{labelize(gate.status)}</span>
                    </div>
                    <p style={{ color: muted, fontSize: '14px', lineHeight: 1.6, margin: '0 0 0.7rem' }}>{gate.detail}</p>
                    <p style={{ color: ivory85, fontSize: '14px', lineHeight: 1.55, margin: 0 }}>{gate.nextAction}</p>
                  </article>
                ))}
              </div>
            </section>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: '1.25rem', alignItems: 'start' }}>
              <section style={sectionStyle}>
                <div style={eyebrowStyle}>DRY-RUN COMMANDS</div>
                <div style={{ display: 'grid', gap: '1rem' }}>
                  {room.dryRunCommands.map((item) => (
                    <article key={item.label} style={{ borderTop: `1px solid ${gold}12`, paddingTop: '1rem' }}>
                      <h2 style={{ color: parchment, fontSize: '18px', fontWeight: 400, margin: '0 0 0.5rem' }}>{item.label}</h2>
                      <pre style={codeStyle}>{item.command}</pre>
                      <p style={{ color: muted, fontSize: '14px', lineHeight: 1.55, margin: '0.5rem 0 0' }}>{item.purpose}</p>
                    </article>
                  ))}
                </div>
              </section>

              <section style={sectionStyle}>
                <div style={eyebrowStyle}>APPROVAL PACKET</div>
                <div style={{ display: 'grid', gap: '0.9rem' }}>
                  {room.approvals.map((approval) => (
                    <article key={approval.label} style={{ borderTop: `1px solid ${gold}12`, paddingTop: '0.9rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
                        <h2 style={{ color: parchment, fontSize: '17px', fontWeight: 400, margin: 0 }}>{approval.label}</h2>
                        <span style={pillStyle(approval.status)}>{labelize(approval.status)}</span>
                      </div>
                      <p style={{ color: muted, fontSize: '14px', lineHeight: 1.55, margin: 0 }}>{approval.detail}</p>
                      {approval.reference && (
                        <p style={{ color: ivory85, fontSize: '12px', lineHeight: 1.55, margin: '0.55rem 0 0', overflowWrap: 'anywhere' }}>
                          {approval.reference}
                        </p>
                      )}
                      {approval.command && <pre style={{ ...codeStyle, marginTop: '0.65rem' }}>{approval.command}</pre>}
                    </article>
                  ))}
                </div>
              </section>
            </div>

            <section style={{ ...sectionStyle, marginTop: '1.25rem' }}>
              <div style={eyebrowStyle}>FIRST SEVEN DAYS</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '1rem' }}>
                {room.sevenDayLoop.map((day) => (
                  <article key={day.day} style={{ border: `1px solid ${gold}12`, background: '#0a0a0a', padding: '1rem' }}>
                    <div style={{ fontFamily: 'Cinzel, serif', color: gold, fontSize: '10px', letterSpacing: '0.16em', marginBottom: '0.5rem' }}>{day.day.toUpperCase()}</div>
                    <h2 style={{ color: parchment, fontFamily: 'Playfair Display, serif', fontSize: '22px', fontWeight: 400, lineHeight: 1.2, margin: '0 0 0.8rem' }}>
                      {day.focus}
                    </h2>
                    {day.actions.map((action) => (
                      <p key={action} style={{ color: muted, fontSize: '14px', lineHeight: 1.5, margin: '0 0 0.45rem' }}>
                        {action}
                      </p>
                    ))}
                  </article>
                ))}
              </div>
            </section>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '1.25rem', marginTop: '1.25rem' }}>
              <ListPanel title="Safe Next Moves" items={room.safeNextMoves} />
              <ListPanel title="Avoid For Now" items={room.avoidForNow} danger />
            </div>
          </>
        )}
      </main>

      <PublicFooter />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: panel, border, padding: '1.15rem', minHeight: '108px' }}>
      <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.18em', color: muted, marginBottom: '0.5rem' }}>{label}</div>
      <div style={{ color: parchment, fontFamily: 'Cinzel, serif', fontSize: '24px', overflowWrap: 'anywhere' }}>{value}</div>
    </div>
  );
}

function ListPanel({ title, items, danger = false }: { title: string; items: string[]; danger?: boolean }) {
  return (
    <section style={sectionStyle}>
      <div style={{ ...eyebrowStyle, color: danger ? '#d17b7b' : gold }}>{title.toUpperCase()}</div>
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        {items.map((item) => (
          <p key={item} style={{ color: muted, fontSize: '15px', lineHeight: 1.6, margin: 0, borderTop: `1px solid ${gold}12`, paddingTop: '0.75rem' }}>
            {item}
          </p>
        ))}
      </div>
    </section>
  );
}

function pillStyle(status: string): CSSProperties {
  return {
    color: statusColor(status),
    border: `1px solid ${statusColor(status)}`,
    fontFamily: 'Cinzel, serif',
    fontSize: '8px',
    letterSpacing: '0.13em',
    padding: '0.35rem 0.5rem',
    whiteSpace: 'nowrap',
  };
}

const eyebrowStyle: CSSProperties = {
  fontFamily: 'Cinzel, serif',
  fontSize: '9px',
  letterSpacing: '0.22em',
  color: gold,
  marginBottom: '0.75rem',
};

const sectionStyle: CSSProperties = {
  background: panel,
  border,
  padding: '1.5rem',
};

const codeStyle: CSSProperties = {
  margin: 0,
  padding: '0.85rem',
  background: '#050505',
  border: `1px solid ${gold}12`,
  color: ivory85,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: '12px',
  lineHeight: 1.55,
  overflowX: 'auto',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
};
