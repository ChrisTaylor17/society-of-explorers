import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type CapitalPipelineLead,
  type CapitalPipelineSummary,
  normalizePipelineChannel,
  normalizePipelineDraft,
  normalizePipelineSegment,
  normalizePipelineStatus,
  normalizePledgeStatus,
  summarizePipeline,
} from '@/lib/capital/pipeline';

type PipelineLeadRow = {
  id?: string;
  display_label?: string | null;
  relationship_context?: string | null;
  segment?: string | null;
  channel?: string | null;
  draft_key?: string | null;
  status?: string | null;
  pledge_status?: string | null;
  pledge_amount_cents?: number | string | null;
  objection?: string | null;
  next_action_at?: string | null;
  source_utm?: string | null;
  notes_redacted?: string | null;
  approved_at?: string | null;
  sent_at?: string | null;
  responded_at?: string | null;
  closed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type PipelineFetchResult = {
  available: boolean;
  leads: CapitalPipelineLead[];
  summary: CapitalPipelineSummary;
};

export function isMissingPipelineTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42P01' || /capital_pipeline_/i.test(error.message || '');
}

function toLead(row: PipelineLeadRow): CapitalPipelineLead {
  return {
    id: String(row.id || ''),
    display_label: String(row.display_label || 'Unnamed lead'),
    relationship_context: row.relationship_context || null,
    segment: normalizePipelineSegment(row.segment),
    channel: normalizePipelineChannel(row.channel),
    draft_key: normalizePipelineDraft(row.draft_key),
    status: normalizePipelineStatus(row.status),
    pledge_status: normalizePledgeStatus(row.pledge_status),
    pledge_amount_cents: Number(row.pledge_amount_cents || 0),
    objection: row.objection || null,
    next_action_at: row.next_action_at || null,
    source_utm: row.source_utm || null,
    notes_redacted: row.notes_redacted || null,
    approved_at: row.approved_at || null,
    sent_at: row.sent_at || null,
    responded_at: row.responded_at || null,
    closed_at: row.closed_at || null,
    created_at: row.created_at || '',
    updated_at: row.updated_at || '',
  };
}

export async function fetchCapitalPipeline(supabase: SupabaseClient): Promise<PipelineFetchResult> {
  const { data, error } = await supabase
    .from('capital_pipeline_leads')
    .select(`
      id,
      display_label,
      relationship_context,
      segment,
      channel,
      draft_key,
      status,
      pledge_status,
      pledge_amount_cents,
      objection,
      next_action_at,
      source_utm,
      notes_redacted,
      approved_at,
      sent_at,
      responded_at,
      closed_at,
      created_at,
      updated_at
    `)
    .order('next_action_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    if (isMissingPipelineTable(error)) {
      return { available: false, leads: [], summary: summarizePipeline([], false) };
    }
    throw error;
  }

  const leads = ((data || []) as PipelineLeadRow[]).map(toLead);
  return { available: true, leads, summary: summarizePipeline(leads, true) };
}
