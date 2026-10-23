'use client';

import { useEffect, useState, type CSSProperties } from 'react';
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

type CapitalScenarioPlanner = {
  generatedAt: string;
  campaign: {
    name: string;
    goal: number;
    boundary: string;
    physicalNodeCondition: string;
  };
  tierReference: Array<{
    id: string;
    label: string;
    amount: number;
  }>;
  paceTargets: Array<{
    days: number;
    dailyTarget: number;
    weeklyTarget: number;
    architectEquivalentPerWeek: number;
    founderEquivalentPerWeek: number;
  }>;
  milestones: Array<{
    label: string;
    amount: number;
    purpose: string;
    status: string;
  }>;
  scenarios: Array<{
    id: string;
    label: string;
    thesis: string;
    total: number;
    surplus: number;
    patrons: number;
    averagePledge: number;
    mix: Array<{
      tierId: string;
      label: string;
      amount: number;
      count: number;
      total: number;
      shareOfGoal: number;
    }>;
    operatorNote: string;
  }>;
  nextOperatorMoves: string[];
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

function money(value: number): string {
  return `$${Math.round(value || 0).toLocaleString()}`;
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

export default function CapitalScenariosPage() {
  const [planner, setPlanner] = useState<CapitalScenarioPlanner | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const token = await getSupabaseAccessToken();
        const res = await fetch('/api/admin/capital/scenarios', {
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || 'Scenario planner unavailable');
        setPlanner(payload.planner || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Scenario planner unavailable');
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
          <div style={eyebrowStyle}>PRIVATE CAPITAL SCENARIOS</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(34px, 6vw, 58px)', fontWeight: 400, lineHeight: 1.1, margin: '0 0 1rem' }}>
            Patron math for the 92B push.
          </h1>
          <p style={{ color: ivory85, fontSize: '19px', lineHeight: 1.8, maxWidth: '780px', margin: 0 }}>
            A private planner for turning the $120k goal into tier mixes, pace targets, and decision milestones. It is planning math, not pledged revenue.
          </p>
        </header>

        {loading && <div style={{ color: muted, fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em' }}>LOADING...</div>}

        {!loading && error && (
          <section style={sectionStyle}>
            <p style={{ color: muted, fontSize: '16px', lineHeight: 1.7, margin: 0 }}>
              {error}. Sign in as an approved admin account to view the scenario planner.
            </p>
          </section>
        )}

        {planner && (
          <>
            <section style={{ ...sectionStyle, marginBottom: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '1.25rem', alignItems: 'start' }}>
                <div>
                  <div style={eyebrowStyle}>{planner.campaign.name.toUpperCase()}</div>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '34px', color: parchment, marginBottom: '0.75rem' }}>{money(planner.campaign.goal)}</div>
                  <p style={{ color: muted, fontSize: '15px', lineHeight: 1.65, margin: 0 }}>{planner.campaign.physicalNodeCondition}</p>
                </div>
                <div>
                  <div style={eyebrowStyle}>BOUNDARY</div>
                  <p style={{ color: '#d17b7b', fontSize: '15px', lineHeight: 1.65, margin: 0 }}>{planner.campaign.boundary}</p>
                </div>
                <div>
                  <div style={eyebrowStyle}>GENERATED</div>
                  <p style={{ color: muted, fontSize: '14px', lineHeight: 1.55, margin: 0 }}>{new Date(planner.generatedAt).toLocaleString()}</p>
                </div>
              </div>
            </section>

            <section style={{ ...sectionStyle, marginBottom: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '1.25rem', alignItems: 'start' }}>
                <div>
                  <div style={eyebrowStyle}>CAPITAL PREP READINESS</div>
                  <p style={{ color: parchment, fontFamily: 'Cinzel, serif', fontSize: '18px', letterSpacing: '0.08em', margin: '0 0 0.6rem' }}>
                    {planner.readiness.mode.replace(/_/g, ' ')}
                  </p>
                  <p style={smallBodyStyle}>{planner.readiness.boundary}</p>
                  <p style={{ ...smallBodyStyle, color: '#d17b7b', marginTop: '0.55rem' }}>
                    External actions: {planner.readiness.externalActions.toUpperCase()} / Approval required: {planner.readiness.approvalRequiredBeforeExternalAction ? 'Yes' : 'No'}
                  </p>
                </div>
                <div>
                  <div style={eyebrowStyle}>EXACT APPROVAL REQUIRED FOR</div>
                  {planner.readiness.exactApprovalRequiredFor.map((item) => (
                    <p key={item} style={{ color: muted, fontSize: '14px', lineHeight: 1.5, margin: '0 0 0.35rem' }}>
                      {item}
                    </p>
                  ))}
                </div>
                <div>
                  <div style={eyebrowStyle}>LAST PREP RECEIPT</div>
                  <p style={{ color: ivory85, fontSize: '14px', lineHeight: 1.55, margin: '0 0 0.45rem' }}>
                    {planner.prepReceipt.detail}
                  </p>
                  <p style={{ color: muted, fontSize: '13px', lineHeight: 1.45, margin: 0 }}>
                    {planner.prepReceipt.mode.replace(/_/g, ' ')} / {new Date(planner.prepReceipt.generatedAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </section>

            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
              {planner.tierReference.map((tier) => (
                <Metric key={tier.id} label={tier.label} value={money(tier.amount)} />
              ))}
            </section>

            <section style={{ ...sectionStyle, marginBottom: '1.25rem' }}>
              <div style={eyebrowStyle}>PACE TARGETS</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '1rem' }}>
                {planner.paceTargets.map((pace) => (
                  <article key={pace.days} style={innerPanelStyle}>
                    <h2 style={h2Style}>{pace.days} days</h2>
                    <p style={smallBodyStyle}>{money(pace.dailyTarget)} per day</p>
                    <p style={smallBodyStyle}>{money(pace.weeklyTarget)} per week</p>
                    <p style={{ ...smallBodyStyle, color: ivory85 }}>{pace.architectEquivalentPerWeek} Architect Patrons/week or {pace.founderEquivalentPerWeek} Renaissance Founders/week</p>
                  </article>
                ))}
              </div>
            </section>

            <section style={{ ...sectionStyle, marginBottom: '1.25rem' }}>
              <div style={eyebrowStyle}>SCENARIOS</div>
              <div style={{ display: 'grid', gap: '1rem' }}>
                {planner.scenarios.map((scenario) => (
                  <article key={scenario.id} style={innerPanelStyle}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: '1rem', alignItems: 'start' }}>
                      <div>
                        <h2 style={h2Style}>{scenario.label}</h2>
                        <p style={smallBodyStyle}>{scenario.thesis}</p>
                        <p style={{ ...smallBodyStyle, color: ivory85 }}>{scenario.operatorNote}</p>
                      </div>
                      <Metric label="Scenario Total" value={money(scenario.total)} sub={`${scenario.surplus >= 0 ? '+' : ''}${money(scenario.surplus)} vs goal`} />
                      <Metric label="Patrons" value={String(scenario.patrons)} sub={`${money(scenario.averagePledge)} average pledge`} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: '0.75rem', marginTop: '1rem' }}>
                      {scenario.mix.map((item) => (
                        <div key={item.tierId} style={{ border: `1px solid ${gold}12`, padding: '0.85rem', background: panel }}>
                          <div style={eyebrowStyle}>{item.label}</div>
                          <div style={{ color: parchment, fontFamily: 'Cinzel, serif', fontSize: '22px' }}>{item.count}</div>
                          <p style={smallBodyStyle}>{money(item.total)} at {money(item.amount)} each</p>
                          <div style={{ height: '6px', background: '#1a1a1a', overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(item.shareOfGoal * 100, 100)}%`, height: '100%', background: gold }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section style={{ ...sectionStyle, marginBottom: '1.25rem' }}>
              <div style={eyebrowStyle}>MILESTONES</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: '1rem' }}>
                {planner.milestones.map((milestone) => (
                  <article key={milestone.label} style={innerPanelStyle}>
                    <div style={eyebrowStyle}>{milestone.label}</div>
                    <h2 style={h2Style}>{money(milestone.amount)}</h2>
                    <p style={smallBodyStyle}>{milestone.purpose}</p>
                  </article>
                ))}
              </div>
            </section>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 330px), 1fr))', gap: '1.25rem' }}>
              <ListPanel title="Next Operator Moves" items={planner.nextOperatorMoves} />
              <ListPanel title="No-Go Rules" items={planner.noGoRules} danger />
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
