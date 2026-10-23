'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { getSupabaseAccessToken } from '@/lib/auth/getSession';
import {
  CAPITAL_PIPELINE_DRAFT_LABELS,
  CAPITAL_PIPELINE_SEGMENT_LABELS,
  CAPITAL_PIPELINE_STATUSES,
  type CapitalPipelineLead,
} from '@/lib/capital/pipeline';
import { hasCapitalPrivateIdentifier, redactCapitalText, sanitizeCapitalLeadLabel } from '@/lib/capital/redaction';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';

type PipelineData = {
  available: boolean;
  leads: CapitalPipelineLead[];
  summary: {
    total: number;
    byStatus: Record<string, number>;
    bySegment: Record<string, number>;
    pledgeIntentCents: number;
    noSendBoundary: string;
  };
  boundary: string;
  pipelineReceipt: {
    action: 'pipeline_loaded' | 'lead_created' | 'lead_updated' | string;
    generatedAt: string;
    writeMode: 'private_redacted_pipeline_metadata' | string;
    databaseWrite: boolean;
    redactionApplied: true;
    externalOutreachTriggered: false;
    paymentTriggered: false;
    contactImportTriggered: false;
    publicActionTriggered: false;
    approvalRequiredBeforeOutreach: boolean;
    recordScope: string;
    detail: string;
  };
};

type LeadForm = {
  displayLabel: string;
  relationshipContext: string;
  segment: string;
  channel: string;
  draftKey: string;
  pledgeStatus: string;
  pledgeAmount: string;
  nextActionAt: string;
  notesRedacted: string;
};

type RedactionPreview = {
  label: string;
  redacted: string;
};

const emptyLeadForm: LeadForm = {
  displayLabel: '',
  relationshipContext: '',
  segment: 'warm_believer',
  channel: 'email',
  draftKey: 'architect_patron',
  pledgeStatus: 'none',
  pledgeAmount: '',
  nextActionAt: '',
  notesRedacted: '',
};

function moneyFromCents(cents: number): string {
  return `$${Math.round(Number(cents || 0) / 100).toLocaleString()}`;
}

function statusColor(status: string): string {
  if (status === 'approved' || status === 'pledged') return '#8fbf8f';
  if (status === 'closed') return '#d17b7b';
  if (status === 'sent' || status === 'responded' || status === 'call') return '#d4b85a';
  return muted;
}

function stageLabel(status: string): string {
  return status.replace('_', ' ').toUpperCase();
}

function fieldStyle(): React.CSSProperties {
  return {
    width: '100%',
    minHeight: '44px',
    background: '#0a0a0a',
    border: `1px solid ${gold}22`,
    color: parchment,
    padding: '0.75rem',
    fontFamily: 'inherit',
    fontSize: '15px',
    boxSizing: 'border-box',
  };
}

function buildRedactionPreview(form: LeadForm): RedactionPreview[] {
  const previews: RedactionPreview[] = [];
  const rawDisplayLabel = form.displayLabel.trim();
  const safeDisplayLabel = sanitizeCapitalLeadLabel(form.displayLabel);

  if (rawDisplayLabel && rawDisplayLabel !== safeDisplayLabel) {
    previews.push({ label: 'Display label', redacted: safeDisplayLabel });
  }

  previews.push(...[
    { label: 'Relationship context', value: form.relationshipContext },
    { label: 'Notes', value: form.notesRedacted },
  ]
    .filter((item) => hasCapitalPrivateIdentifier(item.value))
    .map((item) => ({
      label: item.label,
      redacted: redactCapitalText(item.value),
    })));

  return previews;
}

export default function CapitalPipelinePage() {
  const [data, setData] = useState<PipelineData | null>(null);
  const [form, setForm] = useState<LeadForm>(emptyLeadForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [updatingLeadId, setUpdatingLeadId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    setError('');
    try {
      const token = await getSupabaseAccessToken();
      const res = await fetch('/api/admin/capital/pipeline', {
        cache: 'no-store',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Capital pipeline unavailable');
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Capital pipeline unavailable');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const leadsByStatus = useMemo(() => {
    const groups: Record<string, CapitalPipelineLead[]> = {};
    for (const status of CAPITAL_PIPELINE_STATUSES) groups[status] = [];
    for (const lead of data?.leads || []) {
      const group = groups[lead.status] || [];
      group.push(lead);
      groups[lead.status] = group;
    }
    return groups;
  }, [data?.leads]);

  const redactionPreview = useMemo(() => buildRedactionPreview(form), [form]);

  async function handleCreateLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setNotice('');

    try {
      const token = await getSupabaseAccessToken();
      const res = await fetch('/api/admin/capital/pipeline', {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          ...form,
          pledgeAmount: form.pledgeAmount ? Number(form.pledgeAmount) : 0,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not add lead');
      setData(payload);
      setForm(emptyLeadForm);
      setNotice(payload.pipelineReceipt?.detail || 'Lead added to the private redacted approval pipeline.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add lead');
    } finally {
      setSubmitting(false);
    }
  }

  async function patchLead(id: string, updates: Record<string, unknown>, eventNote: string) {
    setUpdatingLeadId(id);
    setError('');
    setNotice('');

    try {
      const token = await getSupabaseAccessToken();
      const res = await fetch('/api/admin/capital/pipeline', {
        method: 'PATCH',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ id, ...updates, eventNote }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not update lead');
      setData(payload);
      setNotice(payload.pipelineReceipt?.detail || 'Pipeline updated. No message was sent by this app.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update lead');
    } finally {
      setUpdatingLeadId(null);
    }
  }

  function leadActions(lead: CapitalPipelineLead): Array<{ label: string; updates: Record<string, unknown>; note: string }> {
    const actions: Array<{ label: string; updates: Record<string, unknown>; note: string }> = [];
    if (lead.status === 'candidate') actions.push({ label: 'Draft', updates: { status: 'drafted' }, note: 'Marked as drafted locally.' });
    if (lead.status === 'drafted') actions.push({ label: 'Approve', updates: { status: 'approved' }, note: 'Approved locally. No outreach sent.' });
    if (lead.status === 'approved') actions.push({ label: 'Mark Sent', updates: { status: 'sent' }, note: 'Marked as manually sent outside the app.' });
    if (lead.status === 'sent') actions.push({ label: 'Responded', updates: { status: 'responded' }, note: 'Marked as responded.' });
    if (lead.status === 'responded' || lead.status === 'sent') actions.push({ label: 'Call', updates: { status: 'call' }, note: 'Moved to call stage.' });
    if (lead.status === 'responded' || lead.status === 'call') {
      actions.push({
        label: 'Pledged',
        updates: { status: 'pledged', pledgeStatus: lead.pledge_status === 'none' ? 'committed' : lead.pledge_status },
        note: 'Marked as pledged or committed locally.',
      });
    }
    if (lead.pledge_status === 'none') actions.push({ label: 'Interested', updates: { pledgeStatus: 'interested' }, note: 'Marked as interested.' });
    if (!['closed', 'pledged'].includes(lead.status)) actions.push({ label: 'Close', updates: { status: 'closed' }, note: 'Closed locally.' });
    return actions;
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      <section style={{ padding: '8rem 2rem 3rem' }}>
        <div style={{ maxWidth: '1180px', margin: '0 auto' }}>
          <Link href="/capital" style={{ color: muted, fontSize: '14px', textDecoration: 'none' }}>Back to command center</Link>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em', color: gold, margin: '1.5rem 0 1rem' }}>PRIVATE CAPITAL PIPELINE</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(34px, 6vw, 58px)', fontWeight: 400, lineHeight: 1.1, margin: '0 0 1rem' }}>
            Outreach without accidental outreach
          </h1>
          <p style={{ fontSize: '19px', color: ivory85, lineHeight: 1.8, maxWidth: '760px' }}>
            Track redacted leads, approvals, pledge intent, and next actions for the 92B patronage campaign. This screen prepares work. It does not send messages or contact anyone.
          </p>
        </div>
      </section>

      <section style={{ padding: '0 2rem 5rem' }}>
        <div style={{ maxWidth: '1180px', margin: '0 auto' }}>
          {loading && <div style={{ color: muted, fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em' }}>LOADING...</div>}

          {!loading && error && (
            <div style={{ border: `1px solid rgba(209,123,123,0.35)`, background: 'rgba(209,123,123,0.06)', padding: '1rem', color: '#d17b7b', marginBottom: '1rem' }}>
              {error}. Sign in as an approved admin account to view the capital pipeline.
            </div>
          )}

          {notice && (
            <div style={{ border: `1px solid rgba(143,191,143,0.35)`, background: 'rgba(143,191,143,0.06)', padding: '1rem', color: '#8fbf8f', marginBottom: '1rem' }}>
              {notice}
            </div>
          )}

          {data && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px', marginBottom: '2rem' }}>
                <div style={{ background: '#0d0d0d', border: `1px solid ${gold}18`, padding: '1.25rem' }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.18em', color: muted, marginBottom: '0.5rem' }}>PIPELINE</div>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '24px', color: parchment }}>{data.available ? 'ACTIVE' : 'MISSING'}</div>
                  <div style={{ fontSize: '13px', color: muted, marginTop: '0.5rem', lineHeight: 1.5 }}>{data.available ? 'Migration reachable' : 'Migration not applied yet'}</div>
                </div>
                <div style={{ background: '#0d0d0d', border: `1px solid ${gold}18`, padding: '1.25rem' }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.18em', color: muted, marginBottom: '0.5rem' }}>LEADS</div>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '24px', color: parchment }}>{data.summary.total}</div>
                  <div style={{ fontSize: '13px', color: muted, marginTop: '0.5rem', lineHeight: 1.5 }}>Private approval queue</div>
                </div>
                <div style={{ background: '#0d0d0d', border: `1px solid ${gold}18`, padding: '1.25rem' }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.18em', color: muted, marginBottom: '0.5rem' }}>PLEDGE INTENT</div>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '24px', color: parchment }}>{moneyFromCents(data.summary.pledgeIntentCents)}</div>
                  <div style={{ fontSize: '13px', color: muted, marginTop: '0.5rem', lineHeight: 1.5 }}>Committed or paid</div>
                </div>
              </div>

              <div style={{ border: `1px solid ${gold}18`, background: '#0d0d0d', padding: '1.5rem', marginBottom: '2rem' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, marginBottom: '0.75rem' }}>NO-SEND BOUNDARY</div>
                <p style={{ color: muted, fontSize: '16px', lineHeight: 1.8, margin: 0 }}>{data.boundary}</p>
              </div>

              <div style={{ border: `1px solid ${gold}18`, background: '#0d0d0d', padding: '1.5rem', marginBottom: '2rem' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, marginBottom: '0.75rem' }}>PIPELINE RECEIPT</div>
                <p style={{ color: ivory85, fontSize: '15px', lineHeight: 1.65, margin: '0 0 0.75rem' }}>{data.pipelineReceipt.detail}</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
                  <div style={{ color: muted, fontSize: '13px', lineHeight: 1.5 }}>
                    Write mode: {data.pipelineReceipt.writeMode.replace(/_/g, ' ')}
                  </div>
                  <div style={{ color: data.pipelineReceipt.databaseWrite ? '#d4b85a' : muted, fontSize: '13px', lineHeight: 1.5 }}>
                    Database write: {data.pipelineReceipt.databaseWrite ? 'Yes' : 'No'}
                  </div>
                  <div style={{ color: '#8fbf8f', fontSize: '13px', lineHeight: 1.5 }}>
                    Redaction applied: {data.pipelineReceipt.redactionApplied ? 'Yes' : 'No'}
                  </div>
                  <div style={{ color: '#d17b7b', fontSize: '13px', lineHeight: 1.5 }}>
                    External outreach: {data.pipelineReceipt.externalOutreachTriggered ? 'Yes' : 'No'}
                  </div>
                </div>
                <p style={{ color: muted, fontSize: '12px', lineHeight: 1.45, margin: '0.75rem 0 0' }}>
                  {data.pipelineReceipt.recordScope} / {new Date(data.pipelineReceipt.generatedAt).toLocaleString()}
                </p>
              </div>

              <form onSubmit={handleCreateLead} style={{ border: `1px solid ${gold}18`, background: '#0d0d0d', padding: '1.5rem', marginBottom: '2rem' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: gold, marginBottom: '1rem' }}>ADD REDACTED LEAD</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                  <input value={form.displayLabel} onChange={(event) => setForm({ ...form, displayLabel: event.target.value })} placeholder="Alias label, not a full name or contact detail" required style={fieldStyle()} />
                  <select value={form.segment} onChange={(event) => setForm({ ...form, segment: event.target.value })} style={fieldStyle()}>
                    {Object.entries(CAPITAL_PIPELINE_SEGMENT_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                  <select value={form.draftKey} onChange={(event) => setForm({ ...form, draftKey: event.target.value })} style={fieldStyle()}>
                    {Object.entries(CAPITAL_PIPELINE_DRAFT_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                  <select value={form.channel} onChange={(event) => setForm({ ...form, channel: event.target.value })} style={fieldStyle()}>
                    <option value="email">Email</option>
                    <option value="text">Text</option>
                    <option value="dm">DM</option>
                    <option value="call">Call</option>
                    <option value="in_person">In person</option>
                    <option value="other">Other</option>
                  </select>
                  <select value={form.pledgeStatus} onChange={(event) => setForm({ ...form, pledgeStatus: event.target.value })} style={fieldStyle()}>
                    <option value="none">No pledge status</option>
                    <option value="interested">Interested</option>
                    <option value="committed">Committed</option>
                    <option value="paid">Paid</option>
                    <option value="deferred">Deferred</option>
                  </select>
                  <input value={form.pledgeAmount} onChange={(event) => setForm({ ...form, pledgeAmount: event.target.value })} placeholder="Potential pledge amount" inputMode="numeric" style={fieldStyle()} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px', marginTop: '12px' }}>
                  <textarea value={form.relationshipContext} onChange={(event) => setForm({ ...form, relationshipContext: event.target.value })} placeholder="Relationship context, redacted" style={{ ...fieldStyle(), minHeight: '92px', resize: 'vertical' }} />
                  <textarea value={form.notesRedacted} onChange={(event) => setForm({ ...form, notesRedacted: event.target.value })} placeholder="Notes safe for AI/operator view" style={{ ...fieldStyle(), minHeight: '92px', resize: 'vertical' }} />
                </div>
                <div style={{ border: `1px solid ${redactionPreview.length ? 'rgba(212,184,90,0.35)' : `${gold}12`}`, background: redactionPreview.length ? 'rgba(212,184,90,0.06)' : '#0a0a0a', padding: '1rem', marginTop: '12px' }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.16em', color: redactionPreview.length ? '#d4b85a' : gold, marginBottom: '0.55rem' }}>REDACTION PREVIEW</div>
                  {redactionPreview.length === 0 ? (
                    <p style={{ color: muted, fontSize: '14px', lineHeight: 1.6, margin: 0 }}>
                      No email, phone, wallet, or Stripe id patterns detected in the draft fields. Human names still need manual redaction.
                      Use role or source aliases for labels; likely raw full names store as Private lead.
                    </p>
                  ) : (
                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                      {redactionPreview.map((item) => (
                        <div key={item.label} style={{ borderTop: `1px solid ${gold}10`, paddingTop: '0.65rem' }}>
                          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.14em', color: '#d4b85a', marginBottom: '0.35rem' }}>{item.label.toUpperCase()} WILL STORE AS</div>
                          <div style={{ color: ivory85, fontSize: '14px', lineHeight: 1.55, wordBreak: 'break-word' }}>{item.redacted}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button type="submit" disabled={submitting || !data.available} style={{ marginTop: '1rem', fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.16em', color: '#0a0a0a', background: gold, border: 'none', padding: '0.95rem 1.25rem', opacity: submitting || !data.available ? 0.5 : 1, cursor: submitting || !data.available ? 'not-allowed' : 'pointer' }}>
                  {data.available ? (submitting ? 'ADDING...' : 'ADD TO PIPELINE') : 'MIGRATION REQUIRED'}
                </button>
              </form>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
                {CAPITAL_PIPELINE_STATUSES.map((status) => (
                  <div key={status} style={{ border: `1px solid ${gold}14`, background: '#0d0d0d', minHeight: '180px' }}>
                    <div style={{ borderBottom: `1px solid ${gold}12`, padding: '0.9rem 1rem', display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                      <span style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.14em', color: statusColor(status) }}>{stageLabel(status)}</span>
                      <span style={{ color: muted, fontSize: '13px' }}>{leadsByStatus[status]?.length || 0}</span>
                    </div>
                    <div style={{ padding: '0.85rem', display: 'grid', gap: '0.75rem' }}>
                      {(leadsByStatus[status] || []).map((lead) => (
                        <div key={lead.id} style={{ border: `1px solid ${gold}12`, padding: '0.85rem', background: '#0a0a0a' }}>
                          <div style={{ color: parchment, fontSize: '16px', lineHeight: 1.35, marginBottom: '0.45rem' }}>{lead.display_label}</div>
                          <div style={{ color: muted, fontSize: '13px', lineHeight: 1.55 }}>{CAPITAL_PIPELINE_SEGMENT_LABELS[lead.segment]}</div>
                          <div style={{ color: muted, fontSize: '13px', lineHeight: 1.55 }}>{CAPITAL_PIPELINE_DRAFT_LABELS[lead.draft_key]}</div>
                          {lead.relationship_context && (
                            <div style={{ color: muted, fontSize: '13px', lineHeight: 1.55, marginTop: '0.45rem' }}>{lead.relationship_context}</div>
                          )}
                          {lead.pledge_amount_cents > 0 && (
                            <div style={{ color: ivory85, fontSize: '13px', marginTop: '0.45rem' }}>{moneyFromCents(lead.pledge_amount_cents)} {lead.pledge_status}</div>
                          )}
                          {lead.pledge_status !== 'none' && lead.pledge_amount_cents === 0 && (
                            <div style={{ color: ivory85, fontSize: '13px', marginTop: '0.45rem' }}>{lead.pledge_status}</div>
                          )}
                          {lead.next_action_at && (
                            <div style={{ color: muted, fontSize: '12px', marginTop: '0.45rem' }}>Next: {new Date(lead.next_action_at).toLocaleDateString()}</div>
                          )}
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                            {leadActions(lead).map((action) => (
                              <button
                                key={action.label}
                                type="button"
                                disabled={updatingLeadId === lead.id}
                                onClick={() => patchLead(lead.id, action.updates, action.note)}
                                style={{
                                  border: `1px solid ${gold}22`,
                                  background: action.label === 'Close' ? 'transparent' : `${gold}12`,
                                  color: action.label === 'Close' ? muted : parchment,
                                  padding: '0.45rem 0.55rem',
                                  fontFamily: 'Cinzel, serif',
                                  fontSize: '8px',
                                  letterSpacing: '0.11em',
                                  cursor: updatingLeadId === lead.id ? 'wait' : 'pointer',
                                  opacity: updatingLeadId === lead.id ? 0.5 : 1,
                                }}
                              >
                                {action.label.toUpperCase()}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
