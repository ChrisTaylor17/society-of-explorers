'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { getSupabaseAccessToken } from '@/lib/auth/getSession';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

interface CapitalData {
  campaign: {
    name: string;
    goal: number;
    stance: string;
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
  metrics: {
    membersTotal: number;
    paidMembers: number;
    tierCounts: Record<string, number>;
    foundingInterestCount: number;
    leadBuckets: Record<string, number>;
    projectsTotal: number;
    activeProjects: number;
    projectRaised: number;
    pledgeLedgerAvailable: boolean;
    pledgeLedgerRaised: number;
    pledgeLedgerByType: Record<string, number>;
    movementScripts: Record<string, number>;
    pipelineTotal: number;
    pipelinePledgeIntent: number;
  };
  projects: Array<{
    id: string;
    title: string;
    status: string;
    fundingGoal: number;
    amountRaised: number;
    backerCount: number;
    hasUseOfFunds: boolean;
    updateCount: number;
  }>;
  operations: {
    launchChecks: Array<{
      id: string;
      label: string;
      status: 'ready' | 'needs_approval' | 'blocked' | 'manual';
      detail: string;
      nextAction: string;
    }>;
    readiness: {
      generatedAt: string;
      overallStatus: 'ready' | 'needs_approval' | 'blocked' | 'manual';
      blockers: string[];
      approvalsRequired: string[];
      env: Array<{
        id: string;
        label: string;
        required: boolean;
        present: boolean;
        detail: string;
      }>;
      files: Array<{
        id: string;
        label: string;
        path: string;
        present: boolean;
      }>;
      paymentSafety: {
        stripeSecretMode: 'missing' | 'test' | 'live' | 'unknown';
        webhookConfigured: boolean;
        configuredPriceIds: number;
        missingPriceIds: string[];
        canRunStripeTests: boolean;
        warnings: string[];
      };
      copyRiskFindings: Array<{
        file: string;
        line: number;
        term: string;
        text: string;
      }>;
      summary: {
        requiredEnvMissing: number;
        filesMissing: number;
        paymentWarnings: number;
        copyWarnings: number;
      };
    };
    pipeline: {
      available: boolean;
      summary: {
        total: number;
        byStatus: Record<string, number>;
        bySegment: Record<string, number>;
        pledgeIntentCents: number;
        noSendBoundary: string;
      };
      nextActions: Array<{
        id: string;
        display_label: string;
        segment: string;
        status: string;
        pledge_status: string;
        pledge_amount_cents: number;
        next_action_at: string | null;
      }>;
    };
    nextActions: string[];
    draftMaterials: string[];
  };
}

function money(value: number): string {
  return `$${Math.round(value || 0).toLocaleString()}`;
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: '#0d0d0d', border: `1px solid ${gold}18`, padding: '1.25rem' }}>
      <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.18em', color: muted, marginBottom: '0.5rem' }}>{label}</div>
      <div style={{ fontFamily: 'Cinzel, serif', fontSize: '24px', color: parchment }}>{value}</div>
      {sub && <div style={{ fontSize: '13px', color: muted, marginTop: '0.5rem', lineHeight: 1.5 }}>{sub}</div>}
    </div>
  );
}

function statusColor(status: CapitalData['operations']['launchChecks'][number]['status']): string {
  if (status === 'ready') return '#8fbf8f';
  if (status === 'blocked') return '#d17b7b';
  if (status === 'manual') return '#c9a84c';
  return '#d4b85a';
}

function statusLabel(status: CapitalData['operations']['launchChecks'][number]['status']): string {
  return status.replace('_', ' ').toUpperCase();
}

export default function CapitalCommandCenterPage() {
  const [data, setData] = useState<CapitalData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const token = await getSupabaseAccessToken();
        const res = await fetch('/api/admin/capital', {
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || 'Capital command center unavailable');
        setData(payload);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Capital command center unavailable');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      <section style={{ padding: '8rem 2rem 4rem' }}>
        <div style={{ maxWidth: '1120px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, marginBottom: '1rem' }}>PRIVATE COMMAND CENTER</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(34px, 6vw, 58px)', fontWeight: 400, lineHeight: 1.1, margin: '0 0 1rem' }}>
            Capital engine
          </h1>
          <p style={{ fontSize: '19px', color: ivory85, lineHeight: 1.8, maxWidth: '720px' }}>
            A private operating view for the $120k 92B patronage push. It intentionally avoids exposing donor emails, private lead notes, or relationship data.
          </p>
        </div>
      </section>

      <section style={{ padding: '0 2rem 5rem' }}>
        <div style={{ maxWidth: '1120px', margin: '0 auto' }}>
          {loading && <div style={{ color: muted, fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em' }}>LOADING...</div>}

          {!loading && error && (
            <div style={{ border: `1px solid ${gold}22`, background: '#0d0d0d', padding: '2rem', color: muted }}>
              {error}. Sign in as an approved admin account to view this page.
            </div>
          )}

          {data && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px', marginBottom: '2rem' }}>
                <Metric label="Campaign Goal" value={money(data.campaign.goal)} sub={data.campaign.stance} />
                <Metric label="Ledger Raised" value={money(data.metrics.pledgeLedgerRaised)} sub={data.metrics.pledgeLedgerAvailable ? 'Durable pledge ledger active' : 'Migration not applied yet'} />
                <Metric label="Project Raised" value={money(data.metrics.projectRaised)} sub={`${data.metrics.activeProjects} active projects`} />
                <Metric label="Members" value={`${data.metrics.membersTotal}`} sub={`${data.metrics.paidMembers} paid`} />
                <Metric label="Founding Leads" value={`${data.metrics.foundingInterestCount}`} sub="Aggregated only, no PII shown" />
                <Metric label="Movement Scripts" value={`${data.metrics.movementScripts.draft || 0}`} sub={`${data.metrics.movementScripts.published || 0} published`} />
                <Metric label="Pipeline Leads" value={`${data.metrics.pipelineTotal}`} sub={`${money(data.metrics.pipelinePledgeIntent)} committed or paid intent`} />
              </div>

              <div style={{ background: '#0d0d0d', border: `1px solid ${gold}18`, padding: '1.5rem', marginBottom: '2rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '1.25rem', alignItems: 'start' }}>
                  <div>
                    <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, marginBottom: '0.75rem' }}>CAPITAL PREP READINESS</div>
                    <p style={{ color: parchment, fontFamily: 'Cinzel, serif', fontSize: '18px', letterSpacing: '0.08em', margin: '0 0 0.6rem' }}>
                      {data.prepReadiness.mode.replace(/_/g, ' ')}
                    </p>
                    <p style={{ color: muted, fontSize: '14px', lineHeight: 1.6, margin: '0 0 0.55rem' }}>{data.prepReadiness.boundary}</p>
                    <p style={{ color: '#d17b7b', fontSize: '14px', lineHeight: 1.6, margin: 0 }}>
                      External actions: {data.prepReadiness.externalActions.toUpperCase()} / Approval required: {data.prepReadiness.approvalRequiredBeforeExternalAction ? 'Yes' : 'No'}
                    </p>
                  </div>
                  <div>
                    <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, marginBottom: '0.75rem' }}>EXACT APPROVAL REQUIRED FOR</div>
                    {data.prepReadiness.exactApprovalRequiredFor.map((item) => (
                      <p key={item} style={{ color: muted, fontSize: '14px', lineHeight: 1.5, margin: '0 0 0.35rem' }}>
                        {item}
                      </p>
                    ))}
                  </div>
                  <div>
                    <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, marginBottom: '0.75rem' }}>COMMAND CENTER RECEIPT</div>
                    <p style={{ color: ivory85, fontSize: '14px', lineHeight: 1.55, margin: '0 0 0.45rem' }}>
                      {data.prepReceipt.detail}
                    </p>
                    <p style={{ color: muted, fontSize: '13px', lineHeight: 1.45, margin: 0 }}>
                      {data.prepReceipt.mode.replace(/_/g, ' ')} / {new Date(data.prepReceipt.generatedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1px', background: `${gold}10`, marginBottom: '2rem' }}>
                <div style={{ background: '#0d0d0d', padding: '2rem', border: `1px solid ${gold}18` }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, marginBottom: '1rem' }}>LEAD BUCKETS</div>
                  {Object.entries(data.metrics.leadBuckets).map(([key, value]) => (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${gold}10`, padding: '0.65rem 0', color: muted }}>
                      <span style={{ textTransform: 'capitalize' }}>{key}</span>
                      <span>{value}</span>
                    </div>
                  ))}
                </div>
                <div style={{ background: '#0d0d0d', padding: '2rem', border: `1px solid ${gold}18` }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, marginBottom: '1rem' }}>MEMBER TIERS</div>
                  {Object.entries(data.metrics.tierCounts).map(([key, value]) => (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${gold}10`, padding: '0.65rem 0', color: muted }}>
                      <span style={{ textTransform: 'capitalize' }}>{key}</span>
                      <span>{value}</span>
                    </div>
                  ))}
                </div>
                <div style={{ background: '#0d0d0d', padding: '2rem', border: `1px solid ${gold}18` }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, marginBottom: '1rem' }}>OPERATING RULE</div>
                  <p style={{ fontSize: '16px', color: muted, lineHeight: 1.8 }}>
                    {data.campaign.externalActionBoundary}. No outbound messages, landlord contact, public launch, or deployment from this screen.
                  </p>
                </div>
              </div>

              <div style={{ background: '#0d0d0d', border: `1px solid ${gold}18`, padding: '2rem', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                  <div>
                    <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, marginBottom: '0.45rem' }}>CAPITAL PIPELINE</div>
                    <div style={{ fontSize: '14px', color: muted, lineHeight: 1.6 }}>{data.operations.pipeline.summary.noSendBoundary}</div>
                  </div>
                  <Link href="/capital/pipeline" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.16em', color: '#0a0a0a', background: gold, padding: '0.85rem 1rem', textDecoration: 'none', alignSelf: 'flex-start' }}>
                    OPEN PIPELINE
                  </Link>
                  <Link href="/capital/launch-room" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.16em', color: '#0a0a0a', background: gold, padding: '0.85rem 1rem', textDecoration: 'none', alignSelf: 'flex-start' }}>
                    LAUNCH ROOM
                  </Link>
                  <Link href="/capital/approvals" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.16em', color: '#0a0a0a', background: gold, padding: '0.85rem 1rem', textDecoration: 'none', alignSelf: 'flex-start' }}>
                    APPROVALS
                  </Link>
                  <Link href="/capital/patron-brief" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.16em', color: gold, border: `1px solid ${gold}33`, padding: '0.85rem 1rem', textDecoration: 'none', alignSelf: 'flex-start' }}>
                    PATRON BRIEF
                  </Link>
                  <Link href="/capital/scenarios" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.16em', color: gold, border: `1px solid ${gold}33`, padding: '0.85rem 1rem', textDecoration: 'none', alignSelf: 'flex-start' }}>
                    SCENARIOS
                  </Link>
                  <Link href="/capital/outreach-lab" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.16em', color: gold, border: `1px solid ${gold}33`, padding: '0.85rem 1rem', textDecoration: 'none', alignSelf: 'flex-start' }}>
                    OUTREACH LAB
                  </Link>
                  <Link href="/capital/weekly-review" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.16em', color: gold, border: `1px solid ${gold}33`, padding: '0.85rem 1rem', textDecoration: 'none', alignSelf: 'flex-start' }}>
                    WEEKLY REVIEW
                  </Link>
                  <Link href="/capital/window-kit" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.16em', color: gold, border: `1px solid ${gold}33`, padding: '0.85rem 1rem', textDecoration: 'none', alignSelf: 'flex-start' }}>
                    WINDOW KIT
                  </Link>
                  <Link href="/capital/ai-status" style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.16em', color: gold, border: `1px solid ${gold}33`, padding: '0.85rem 1rem', textDecoration: 'none', alignSelf: 'flex-start' }}>
                    AI STATUS
                  </Link>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '1rem' }}>
                  <Metric label="Pipeline Status" value={data.operations.pipeline.available ? 'Active' : 'Missing'} sub={data.operations.pipeline.available ? 'Migration reachable' : 'Migration not applied'} />
                  <Metric label="Tracked Leads" value={`${data.operations.pipeline.summary.total}`} sub="Private approval queue" />
                  <Metric label="Pledge Intent" value={money(data.operations.pipeline.summary.pledgeIntentCents / 100)} sub="Committed or paid" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                  {Object.entries(data.operations.pipeline.summary.byStatus).slice(0, 6).map(([status, count]) => (
                    <div key={status} style={{ border: `1px solid ${gold}12`, padding: '0.85rem', color: muted }}>
                      <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.14em', color: gold, marginBottom: '0.35rem' }}>{status.replace('_', ' ').toUpperCase()}</div>
                      <div style={{ fontSize: '22px', color: parchment }}>{count}</div>
                    </div>
                  ))}
                  {data.operations.pipeline.summary.total === 0 && (
                    <div style={{ border: `1px solid ${gold}12`, padding: '0.85rem', color: muted, lineHeight: 1.6 }}>
                      No pipeline leads yet. Add only redacted labels until a recipient batch is approved.
                    </div>
                  )}
                </div>
              </div>

              <div style={{ background: '#0d0d0d', border: `1px solid ${gold}18`, padding: '2rem', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                  <div>
                    <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, marginBottom: '0.45rem' }}>READINESS SCAN</div>
                    <div style={{ fontSize: '13px', color: muted }}>Generated {new Date(data.operations.readiness.generatedAt).toLocaleString()}</div>
                  </div>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.14em', color: statusColor(data.operations.readiness.overallStatus) }}>
                    {statusLabel(data.operations.readiness.overallStatus)}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '1.5rem' }}>
                  <Metric label="Missing Env" value={`${data.operations.readiness.summary.requiredEnvMissing}`} sub="Required variables only" />
                  <Metric label="Missing Files" value={`${data.operations.readiness.summary.filesMissing}`} sub="Local launch assets" />
                  <Metric label="Payment Warnings" value={`${data.operations.readiness.summary.paymentWarnings}`} sub={data.operations.readiness.paymentSafety.canRunStripeTests ? 'Test checkout safe' : 'Payment test gate closed'} />
                  <Metric label="Copy Warnings" value={`${data.operations.readiness.summary.copyWarnings}`} sub="Financial or location risk terms" />
                </div>

                {data.operations.readiness.blockers.length > 0 && (
                  <div style={{ border: `1px solid rgba(209,123,123,0.35)`, background: 'rgba(209,123,123,0.06)', padding: '1rem', marginBottom: '1.5rem' }}>
                    {data.operations.readiness.blockers.map((blocker) => (
                      <div key={blocker} style={{ color: '#d17b7b', fontSize: '14px', lineHeight: 1.7 }}>{blocker}</div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
                  <div style={{ border: `1px solid ${gold}12`, padding: '1rem', background: '#0a0a0a' }}>
                    <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.18em', color: gold, marginBottom: '0.75rem' }}>ENVIRONMENT</div>
                    {data.operations.readiness.env.map((check) => (
                      <div key={check.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', borderBottom: `1px solid ${gold}10`, padding: '0.55rem 0', color: muted }}>
                        <span>{check.label}{check.required ? '' : ' (optional)'}</span>
                        <span style={{ color: check.present ? '#8fbf8f' : '#d17b7b' }}>{check.present ? 'set' : 'missing'}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ border: `1px solid ${gold}12`, padding: '1rem', background: '#0a0a0a' }}>
                    <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.18em', color: gold, marginBottom: '0.75rem' }}>PAYMENT SAFETY</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', borderBottom: `1px solid ${gold}10`, padding: '0.55rem 0', color: muted }}>
                      <span>Stripe mode</span>
                      <span style={{ color: data.operations.readiness.paymentSafety.stripeSecretMode === 'test' ? '#8fbf8f' : '#d17b7b' }}>{data.operations.readiness.paymentSafety.stripeSecretMode}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', borderBottom: `1px solid ${gold}10`, padding: '0.55rem 0', color: muted }}>
                      <span>Webhook secret</span>
                      <span style={{ color: data.operations.readiness.paymentSafety.webhookConfigured ? '#8fbf8f' : '#d17b7b' }}>{data.operations.readiness.paymentSafety.webhookConfigured ? 'set' : 'missing'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', borderBottom: `1px solid ${gold}10`, padding: '0.55rem 0', color: muted }}>
                      <span>Price ids</span>
                      <span style={{ color: data.operations.readiness.paymentSafety.configuredPriceIds === 4 ? '#8fbf8f' : '#d17b7b' }}>{data.operations.readiness.paymentSafety.configuredPriceIds}/4</span>
                    </div>
                    {data.operations.readiness.paymentSafety.warnings.map((warning) => (
                      <div key={warning} style={{ color: '#d17b7b', fontSize: '13px', lineHeight: 1.55, paddingTop: '0.6rem' }}>{warning}</div>
                    ))}
                  </div>
                  <div style={{ border: `1px solid ${gold}12`, padding: '1rem', background: '#0a0a0a' }}>
                    <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.18em', color: gold, marginBottom: '0.75rem' }}>LOCAL ASSETS</div>
                    {data.operations.readiness.files.map((file) => (
                      <div key={file.id} style={{ borderBottom: `1px solid ${gold}10`, padding: '0.55rem 0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', color: muted }}>
                          <span>{file.label}</span>
                          <span style={{ color: file.present ? '#8fbf8f' : '#d17b7b' }}>{file.present ? 'present' : 'missing'}</span>
                        </div>
                        <div style={{ color: muted, opacity: 0.75, fontSize: '12px', marginTop: '0.25rem', wordBreak: 'break-word' }}>{file.path}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {data.operations.readiness.copyRiskFindings.length > 0 && (
                  <div style={{ borderTop: `1px solid ${gold}12`, marginTop: '1.5rem', paddingTop: '1.5rem' }}>
                    <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.18em', color: gold, marginBottom: '0.75rem' }}>COPY FINDINGS</div>
                    {data.operations.readiness.copyRiskFindings.slice(0, 8).map((finding) => (
                      <div key={`${finding.file}:${finding.line}:${finding.term}`} style={{ color: muted, fontSize: '13px', lineHeight: 1.7, padding: '0.4rem 0' }}>
                        {finding.file}:{finding.line} contains &quot;{finding.term}&quot; - {finding.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ background: '#0d0d0d', border: `1px solid ${gold}18`, padding: '2rem', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold }}>LAUNCH GATES</div>
                  <div style={{ fontSize: '13px', color: muted }}>Draft-for-approval operating mode</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
                  {data.operations.launchChecks.map((check) => (
                    <div key={check.id} style={{ border: `1px solid ${gold}12`, padding: '1rem', background: '#0a0a0a' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <div style={{ fontSize: '17px', color: parchment, lineHeight: 1.3 }}>{check.label}</div>
                        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.14em', color: statusColor(check.status), whiteSpace: 'nowrap' }}>
                          {statusLabel(check.status)}
                        </div>
                      </div>
                      <p style={{ fontSize: '14px', color: muted, lineHeight: 1.65, margin: '0 0 0.75rem' }}>{check.detail}</p>
                      <p style={{ fontSize: '13px', color: ivory85, lineHeight: 1.6, margin: 0 }}>{check.nextAction}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: '#0d0d0d', border: `1px solid ${gold}18`, padding: '2rem', marginBottom: '2rem' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, marginBottom: '1rem' }}>ACTIVE PROJECTS</div>
                <div style={{ display: 'grid', gap: '12px' }}>
                  {data.projects.map((project) => {
                    const pct = project.fundingGoal > 0 ? Math.min((project.amountRaised / project.fundingGoal) * 100, 100) : 0;
                    return (
                      <div key={project.id} style={{ border: `1px solid ${gold}12`, padding: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                          <span style={{ fontSize: '17px', color: parchment }}>{project.title}</span>
                          <span style={{ fontFamily: 'Cinzel, serif', fontSize: '11px', color: muted }}>{money(project.amountRaised)} / {money(project.fundingGoal)}</span>
                        </div>
                        <div style={{ height: '6px', background: '#1a1a1a', overflow: 'hidden', marginBottom: '0.65rem' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: gold }} />
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '13px', color: muted }}>
                          <span>{project.backerCount} backers</span>
                          <span>{project.hasUseOfFunds ? 'Use of funds present' : 'Needs use of funds'}</span>
                          <span>{project.updateCount} updates</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ background: '#0d0d0d', border: `1px solid ${gold}18`, padding: '2rem' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, marginBottom: '1rem' }}>NEXT ACTIONS</div>
                {data.operations.nextActions.map((action) => (
                  <div key={action} style={{ fontSize: '16px', color: muted, lineHeight: 1.8, padding: '0.35rem 0' }}>{action}</div>
                ))}
                <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: `1px solid ${gold}12` }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.18em', color: gold, marginBottom: '0.75rem' }}>LOCAL DRAFT MATERIALS</div>
                  <Link href="/capital/launch-room" style={{ color: gold, fontSize: '14px', textDecoration: 'none', display: 'inline-block', marginRight: '1rem', marginBottom: '0.75rem' }}>
                    Open private Launch Room
                  </Link>
                  <Link href="/capital/approvals" style={{ color: gold, fontSize: '14px', textDecoration: 'none', display: 'inline-block', marginRight: '1rem', marginBottom: '0.75rem' }}>
                    Open private Approvals
                  </Link>
                  <Link href="/capital/patron-brief" style={{ color: gold, fontSize: '14px', textDecoration: 'none', display: 'inline-block', marginRight: '1rem', marginBottom: '0.75rem' }}>
                    Open private Patron Brief
                  </Link>
                  <Link href="/capital/scenarios" style={{ color: gold, fontSize: '14px', textDecoration: 'none', display: 'inline-block', marginRight: '1rem', marginBottom: '0.75rem' }}>
                    Open private Scenarios
                  </Link>
                  <Link href="/capital/outreach-lab" style={{ color: gold, fontSize: '14px', textDecoration: 'none', display: 'inline-block', marginRight: '1rem', marginBottom: '0.75rem' }}>
                    Open private Outreach Lab
                  </Link>
                  <Link href="/capital/weekly-review" style={{ color: gold, fontSize: '14px', textDecoration: 'none', display: 'inline-block', marginRight: '1rem', marginBottom: '0.75rem' }}>
                    Open private Weekly Review
                  </Link>
                  <Link href="/capital/window-kit" style={{ color: gold, fontSize: '14px', textDecoration: 'none', display: 'inline-block', marginRight: '1rem', marginBottom: '0.75rem' }}>
                    Open private 92B Window Kit
                  </Link>
                  <Link href="/capital/ai-status" style={{ color: gold, fontSize: '14px', textDecoration: 'none', display: 'inline-block', marginBottom: '0.75rem' }}>
                    Open private AI Status
                  </Link>
                  {data.operations.draftMaterials.map((material) => (
                    <div key={material} style={{ fontSize: '13px', color: muted, lineHeight: 1.8, wordBreak: 'break-word' }}>{material}</div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
