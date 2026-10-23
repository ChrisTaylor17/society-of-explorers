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

type PatronBrief = {
  generatedAt: string;
  campaign: {
    name: string;
    goal: number;
    stance: string;
    coreLink: string;
    useOfFunds: Array<{
      label: string;
      amount: number;
      summary: string;
    }>;
    boundary: string;
  };
  story: {
    oneLine: string;
    short: string;
    callOpening: string;
    close: string;
  };
  askLadder: Array<{
    id: string;
    label: string;
    amount: string;
    bestFor: string;
    value: string;
    askLine: string;
  }>;
  callFlow: Array<{
    step: string;
    prompt: string;
  }>;
  objections: Array<{
    id: string;
    objection: string;
    response: string;
    followUp: string;
  }>;
  proofPoints: string[];
  followUpTemplates: Array<{
    id: string;
    label: string;
    body: string;
  }>;
  noGoLanguage: string[];
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

function ListBlock({ title, items, danger }: { title: string; items: string[]; danger?: boolean }) {
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

export default function CapitalPatronBriefPage() {
  const [brief, setBrief] = useState<PatronBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const token = await getSupabaseAccessToken();
        const res = await fetch('/api/admin/capital/patron-brief', {
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || 'Patron brief unavailable');
        setBrief(payload.brief || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Patron brief unavailable');
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
          <div style={eyebrowStyle}>PRIVATE PATRON BRIEF</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(34px, 6vw, 58px)', fontWeight: 400, lineHeight: 1.1, margin: '0 0 1rem' }}>
            The fundraising conversation.
          </h1>
          <p style={{ color: ivory85, fontSize: '19px', lineHeight: 1.8, maxWidth: '780px', margin: 0 }}>
            A private call guide for explaining the 92B patronage push clearly, conditionally, and without investment language.
          </p>
          <p style={{ color: '#d17b7b', fontSize: '15px', lineHeight: 1.65, maxWidth: '760px', margin: '0.85rem 0 0' }}>
            Draft only: exact approval is required before any outbound action.
          </p>
        </header>

        {loading && <div style={{ color: muted, fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em' }}>LOADING...</div>}

        {!loading && error && (
          <section style={sectionStyle}>
            <p style={{ color: muted, fontSize: '16px', lineHeight: 1.7, margin: 0 }}>
              {error}. Sign in as an approved admin account to view the patron brief.
            </p>
          </section>
        )}

        {brief && (
          <>
            <section style={{ ...sectionStyle, marginBottom: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '1.25rem', alignItems: 'start' }}>
                <div>
                  <div style={eyebrowStyle}>{brief.campaign.name.toUpperCase()}</div>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '34px', color: parchment, marginBottom: '0.75rem' }}>
                    {money(brief.campaign.goal)}
                  </div>
                  <p style={{ color: muted, fontSize: '15px', lineHeight: 1.65, margin: 0 }}>{brief.campaign.stance}</p>
                </div>
                <div>
                  <div style={eyebrowStyle}>BOUNDARY</div>
                  <p style={{ color: '#d17b7b', fontSize: '15px', lineHeight: 1.65, margin: 0 }}>{brief.campaign.boundary}</p>
                </div>
                <div>
                  <div style={eyebrowStyle}>CORE LINK</div>
                  <p style={{ color: muted, fontSize: '13px', lineHeight: 1.55, margin: 0, overflowWrap: 'anywhere' }}>{brief.campaign.coreLink}</p>
                  <p style={{ color: muted, fontSize: '12px', lineHeight: 1.5, margin: '0.65rem 0 0' }}>
                    Generated {new Date(brief.generatedAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </section>

            <section style={{ ...sectionStyle, marginBottom: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '1.25rem', alignItems: 'start' }}>
                <div>
                  <div style={eyebrowStyle}>CAPITAL PREP READINESS</div>
                  <p style={{ color: parchment, fontFamily: 'Cinzel, serif', fontSize: '18px', letterSpacing: '0.08em', margin: '0 0 0.6rem' }}>
                    {brief.readiness.mode.replace(/_/g, ' ')}
                  </p>
                  <p style={smallBodyStyle}>{brief.readiness.boundary}</p>
                  <p style={{ ...smallBodyStyle, color: '#d17b7b', marginBottom: 0 }}>
                    External actions: {brief.readiness.externalActions.toUpperCase()} / Approval required: {brief.readiness.approvalRequiredBeforeExternalAction ? 'Yes' : 'No'}
                  </p>
                </div>
                <div>
                  <div style={eyebrowStyle}>EXACT APPROVAL REQUIRED FOR</div>
                  {brief.readiness.exactApprovalRequiredFor.map((item) => (
                    <p key={item} style={{ color: muted, fontSize: '14px', lineHeight: 1.5, margin: '0 0 0.35rem' }}>
                      {item}
                    </p>
                  ))}
                </div>
                <div>
                  <div style={eyebrowStyle}>LAST PREP RECEIPT</div>
                  <p style={{ color: ivory85, fontSize: '14px', lineHeight: 1.55, margin: '0 0 0.45rem' }}>
                    {brief.prepReceipt.detail}
                  </p>
                  <p style={{ color: muted, fontSize: '13px', lineHeight: 1.45, margin: 0 }}>
                    {brief.prepReceipt.mode.replace(/_/g, ' ')} / {new Date(brief.prepReceipt.generatedAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </section>

            <section style={{ ...sectionStyle, marginBottom: '1.25rem' }}>
              <div style={eyebrowStyle}>CORE STORY</div>
              <h2 style={h2Style}>{brief.story.oneLine}</h2>
              <p style={bodyStyle}>{brief.story.short}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '1rem', marginTop: '1.25rem' }}>
                <div style={innerPanelStyle}>
                  <div style={eyebrowStyle}>CALL OPENING</div>
                  <p style={bodyStyle}>{brief.story.callOpening}</p>
                </div>
                <div style={innerPanelStyle}>
                  <div style={eyebrowStyle}>CLOSE</div>
                  <p style={bodyStyle}>{brief.story.close}</p>
                </div>
              </div>
            </section>

            <section style={{ ...sectionStyle, marginBottom: '1.25rem' }}>
              <div style={eyebrowStyle}>ASK LADDER</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: '1rem' }}>
                {brief.askLadder.map((ask) => (
                  <article key={ask.id} style={innerPanelStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '0.65rem' }}>
                      <h2 style={{ ...h2Style, fontSize: '23px', margin: 0 }}>{ask.label}</h2>
                      <span style={pillStyle}>{ask.amount}</span>
                    </div>
                    <p style={smallBodyStyle}>{ask.bestFor}</p>
                    <p style={smallBodyStyle}>{ask.value}</p>
                    <p style={{ ...smallBodyStyle, color: ivory85, marginBottom: 0 }}>{ask.askLine}</p>
                  </article>
                ))}
              </div>
            </section>

            <section style={{ ...sectionStyle, marginBottom: '1.25rem' }}>
              <div style={eyebrowStyle}>USE OF FUNDS</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: '1rem' }}>
                {brief.campaign.useOfFunds.map((item) => (
                  <article key={item.label} style={innerPanelStyle}>
                    <div style={pillStyle}>{money(item.amount)}</div>
                    <h2 style={{ ...h2Style, fontSize: '22px', margin: '0.7rem 0 0.55rem' }}>{item.label}</h2>
                    <p style={smallBodyStyle}>{item.summary}</p>
                  </article>
                ))}
              </div>
            </section>

            <section style={{ ...sectionStyle, marginBottom: '1.25rem' }}>
              <div style={eyebrowStyle}>CALL FLOW</div>
              <div style={{ display: 'grid', gap: '0.85rem' }}>
                {brief.callFlow.map((step, index) => (
                  <article key={step.step} style={innerPanelStyle}>
                    <div style={eyebrowStyle}>STEP {index + 1}</div>
                    <h2 style={{ ...h2Style, fontSize: '24px', marginBottom: '0.5rem' }}>{step.step}</h2>
                    <p style={smallBodyStyle}>{step.prompt}</p>
                  </article>
                ))}
              </div>
            </section>

            <section style={{ ...sectionStyle, marginBottom: '1.25rem' }}>
              <div style={eyebrowStyle}>OBJECTIONS</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '1rem' }}>
                {brief.objections.map((item) => (
                  <article key={item.id} style={innerPanelStyle}>
                    <h2 style={{ ...h2Style, fontSize: '24px', marginBottom: '0.65rem' }}>{item.objection}</h2>
                    <p style={smallBodyStyle}>{item.response}</p>
                    <p style={{ ...smallBodyStyle, color: ivory85, marginBottom: 0 }}>{item.followUp}</p>
                  </article>
                ))}
              </div>
            </section>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 330px), 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
              <ListBlock title="Proof Points" items={brief.proofPoints} />
              <ListBlock title="No-Go Language" items={brief.noGoLanguage} danger />
            </div>

            <section style={sectionStyle}>
              <div style={eyebrowStyle}>FOLLOW-UP DRAFTS</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '1rem' }}>
                {brief.followUpTemplates.map((template) => (
                  <article key={template.id} style={innerPanelStyle}>
                    <h2 style={{ ...h2Style, fontSize: '23px', marginBottom: '0.65rem' }}>{template.label}</h2>
                    <p style={smallBodyStyle}>{template.body}</p>
                  </article>
                ))}
              </div>
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
  fontSize: '30px',
  fontWeight: 400,
  lineHeight: 1.18,
  margin: '0 0 0.85rem',
};

const bodyStyle: CSSProperties = {
  color: muted,
  fontSize: '16px',
  lineHeight: 1.7,
  margin: 0,
};

const smallBodyStyle: CSSProperties = {
  color: muted,
  fontSize: '14px',
  lineHeight: 1.6,
  margin: '0 0 0.65rem',
};

const pillStyle: CSSProperties = {
  border: `1px solid ${gold}55`,
  color: gold,
  background: `${gold}10`,
  padding: '0.35rem 0.5rem',
  fontFamily: 'Cinzel, serif',
  fontSize: '10px',
  letterSpacing: '0.12em',
  whiteSpace: 'nowrap',
};
