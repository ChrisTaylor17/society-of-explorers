export const CAPITAL_PIPELINE_STATUSES = [
  'candidate',
  'drafted',
  'approved',
  'sent',
  'responded',
  'call',
  'pledged',
  'closed',
] as const;

export const CAPITAL_PIPELINE_SEGMENTS = [
  'warm_believer',
  'boston_local',
  'operator_builder',
  'creator_philosopher',
  'past_lead',
  'partner',
] as const;

export const CAPITAL_PIPELINE_CHANNELS = ['email', 'text', 'dm', 'call', 'in_person', 'other'] as const;

export const CAPITAL_PIPELINE_DRAFTS = [
  'architect_patron',
  'builder_operator',
  'creator_philosopher',
  'boston_local',
  'follow_up',
] as const;

export const CAPITAL_PLEDGE_STATUSES = ['none', 'interested', 'committed', 'paid', 'deferred'] as const;

export type CapitalPipelineStatus = (typeof CAPITAL_PIPELINE_STATUSES)[number];
export type CapitalPipelineSegment = (typeof CAPITAL_PIPELINE_SEGMENTS)[number];
export type CapitalPipelineChannel = (typeof CAPITAL_PIPELINE_CHANNELS)[number];
export type CapitalPipelineDraft = (typeof CAPITAL_PIPELINE_DRAFTS)[number];
export type CapitalPledgeStatus = (typeof CAPITAL_PLEDGE_STATUSES)[number];

export type CapitalPipelineLead = {
  id: string;
  display_label: string;
  relationship_context: string | null;
  segment: CapitalPipelineSegment;
  channel: CapitalPipelineChannel;
  draft_key: CapitalPipelineDraft;
  status: CapitalPipelineStatus;
  pledge_status: CapitalPledgeStatus;
  pledge_amount_cents: number;
  objection: string | null;
  next_action_at: string | null;
  source_utm: string | null;
  notes_redacted: string | null;
  approved_at: string | null;
  sent_at: string | null;
  responded_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CapitalPipelineSummary = {
  available: boolean;
  total: number;
  byStatus: Record<string, number>;
  bySegment: Record<string, number>;
  pledgeIntentCents: number;
  nextActions: CapitalPipelineLead[];
  noSendBoundary: string;
};

export const CAPITAL_PIPELINE_NO_SEND_BOUNDARY =
  'This pipeline prepares and tracks outreach only. It does not send email, text, DMs, calls, posts, imports contacts, or contact the landlord.';

export const CAPITAL_PIPELINE_UTM_LINKS = {
  warmDirect: 'https://www.societyofexplorers.com/92b/fund?utm_source=warm_outreach&utm_medium=direct&utm_campaign=92b_founding_node',
  bostonLocal: 'https://www.societyofexplorers.com/92b/fund?utm_source=boston_warm&utm_medium=direct&utm_campaign=92b_founding_node',
  creatorReferral: 'https://www.societyofexplorers.com/92b/fund?utm_source=creator_referral&utm_medium=direct&utm_campaign=92b_founding_node',
  windowQr: 'https://www.societyofexplorers.com/92b/fund?utm_source=92b_window&utm_medium=qr&utm_campaign=92b_founding_node',
} as const;

export const CAPITAL_PIPELINE_DRAFT_LABELS: Record<CapitalPipelineDraft, string> = {
  architect_patron: 'Architect Patron',
  builder_operator: 'Builder / Operator',
  creator_philosopher: 'Creator / Philosopher',
  boston_local: 'Boston / Local',
  follow_up: 'Follow-Up',
};

export const CAPITAL_PIPELINE_SEGMENT_LABELS: Record<CapitalPipelineSegment, string> = {
  warm_believer: 'Warm Believer',
  boston_local: 'Boston Local',
  operator_builder: 'Operator / Builder',
  creator_philosopher: 'Creator / Philosopher',
  past_lead: 'Past Lead',
  partner: 'Partner',
};

export function normalizePipelineStatus(value: unknown): CapitalPipelineStatus {
  const status = String(value || 'candidate');
  return CAPITAL_PIPELINE_STATUSES.includes(status as CapitalPipelineStatus)
    ? (status as CapitalPipelineStatus)
    : 'candidate';
}

export function normalizePipelineSegment(value: unknown): CapitalPipelineSegment {
  const segment = String(value || 'warm_believer');
  return CAPITAL_PIPELINE_SEGMENTS.includes(segment as CapitalPipelineSegment)
    ? (segment as CapitalPipelineSegment)
    : 'warm_believer';
}

export function normalizePipelineChannel(value: unknown): CapitalPipelineChannel {
  const channel = String(value || 'email');
  return CAPITAL_PIPELINE_CHANNELS.includes(channel as CapitalPipelineChannel)
    ? (channel as CapitalPipelineChannel)
    : 'email';
}

export function normalizePipelineDraft(value: unknown): CapitalPipelineDraft {
  const draft = String(value || 'architect_patron');
  return CAPITAL_PIPELINE_DRAFTS.includes(draft as CapitalPipelineDraft)
    ? (draft as CapitalPipelineDraft)
    : 'architect_patron';
}

export function normalizePledgeStatus(value: unknown): CapitalPledgeStatus {
  const status = String(value || 'none');
  return CAPITAL_PLEDGE_STATUSES.includes(status as CapitalPledgeStatus)
    ? (status as CapitalPledgeStatus)
    : 'none';
}

export function summarizePipeline(leads: CapitalPipelineLead[], available: boolean): CapitalPipelineSummary {
  const byStatus: Record<string, number> = {};
  const bySegment: Record<string, number> = {};
  let pledgeIntentCents = 0;

  for (const lead of leads) {
    byStatus[lead.status] = (byStatus[lead.status] || 0) + 1;
    bySegment[lead.segment] = (bySegment[lead.segment] || 0) + 1;
    if (lead.pledge_status === 'committed' || lead.pledge_status === 'paid') {
      pledgeIntentCents += Number(lead.pledge_amount_cents || 0);
    }
  }

  const nextActions = [...leads]
    .filter((lead) => !['closed', 'paid'].includes(lead.pledge_status) && lead.status !== 'closed')
    .sort((a, b) => {
      const aTime = a.next_action_at ? new Date(a.next_action_at).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.next_action_at ? new Date(b.next_action_at).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    })
    .slice(0, 8);

  return {
    available,
    total: leads.length,
    byStatus,
    bySegment,
    pledgeIntentCents,
    nextActions,
    noSendBoundary: CAPITAL_PIPELINE_NO_SEND_BOUNDARY,
  };
}
