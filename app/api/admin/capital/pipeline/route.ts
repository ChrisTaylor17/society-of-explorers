import { NextRequest } from 'next/server';
import {
  CAPITAL_PIPELINE_CHANNELS,
  CAPITAL_PIPELINE_DRAFTS,
  CAPITAL_PIPELINE_NO_SEND_BOUNDARY,
  CAPITAL_PIPELINE_SEGMENTS,
  CAPITAL_PIPELINE_STATUSES,
  CAPITAL_PLEDGE_STATUSES,
  normalizePipelineChannel,
  normalizePipelineDraft,
  normalizePipelineSegment,
  normalizePipelineStatus,
  normalizePledgeStatus,
} from '@/lib/capital/pipeline';
import { fetchCapitalPipeline, isMissingPipelineTable } from '@/lib/capital/pipelineStore';
import { buildCapitalPipelineReceipt } from '@/lib/capital/pipelineReceipts';
import { redactCapitalText, sanitizeCapitalLeadLabel } from '@/lib/capital/redaction';
import { requireCapitalAdmin } from '@/lib/capital/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { privateJson } from '@/lib/http/routeError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PipelineBody = {
  id?: string;
  displayLabel?: string;
  relationshipContext?: string;
  segment?: string;
  channel?: string;
  draftKey?: string;
  status?: string;
  pledgeStatus?: string;
  pledgeAmount?: number;
  objection?: string;
  nextActionAt?: string;
  sourceUtm?: string;
  notesRedacted?: string;
  eventNote?: string;
};

const PIPELINE_RESPONSE_HEADERS = {
  'cache-control': 'no-store',
} as const;

function pipelineJson(body: unknown, init: { status?: number; headers?: HeadersInit } = {}) {
  return privateJson(body, {
    ...init,
    headers: {
      ...PIPELINE_RESPONSE_HEADERS,
      ...init.headers,
    },
  });
}

function reportCapitalPipelineFailure(scope: string) {
  console.warn(`[capital/pipeline] ${scope} failed`);
}

async function readPipelineBody(req: NextRequest): Promise<PipelineBody | null> {
  try {
    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    return body as PipelineBody;
  } catch {
    return null;
  }
}

function dollarsToCents(value: unknown): number {
  return Math.max(0, Math.round(Number(value || 0) * 100));
}

function cleanText(value: unknown, fallback = ''): string {
  return String(value || fallback).trim();
}

function redactedText(value: unknown, fallback = ''): string {
  return redactCapitalText(value, fallback);
}

function timestampUpdates(status: string): Record<string, string> {
  const now = new Date().toISOString();
  if (status === 'approved') return { approved_at: now };
  if (status === 'sent') return { sent_at: now };
  if (status === 'responded') return { responded_at: now };
  if (status === 'closed') return { closed_at: now };
  return {};
}

async function recordPipelineEvent(
  leadId: string,
  eventType: string,
  eventNote: string | null,
  metadata: Record<string, unknown> = {},
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('capital_pipeline_events').insert({
    lead_id: leadId,
    event_type: eventType,
    event_note: eventNote,
    metadata,
  });

  if (error) {
    if (isMissingPipelineTable(error)) return true;
    reportCapitalPipelineFailure('event write');
    return false;
  }

  return true;
}

export async function GET(req: NextRequest) {
  try {
    const admin = await requireCapitalAdmin(req);
    if (!admin) return pipelineJson({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const pipeline = await fetchCapitalPipeline(supabase);

    return pipelineJson({
      ...pipeline,
      pipelineReceipt: buildCapitalPipelineReceipt({
        action: 'pipeline_loaded',
        databaseWrite: false,
        recordScope: 'capital_pipeline_leads redacted summary',
        detail: 'Loaded the private redacted capital pipeline. No lead was changed, and no outreach, contact import, checkout, payment, deploy, landlord contact, public post, or window action was triggered.',
      }),
      options: {
        statuses: CAPITAL_PIPELINE_STATUSES,
        segments: CAPITAL_PIPELINE_SEGMENTS,
        channels: CAPITAL_PIPELINE_CHANNELS,
        drafts: CAPITAL_PIPELINE_DRAFTS,
        pledgeStatuses: CAPITAL_PLEDGE_STATUSES,
      },
      boundary: CAPITAL_PIPELINE_NO_SEND_BOUNDARY,
    });
  } catch {
    reportCapitalPipelineFailure('load');
    return pipelineJson({ error: 'Capital pipeline unavailable' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireCapitalAdmin(req);
    if (!admin) return pipelineJson({ error: 'Unauthorized' }, { status: 401 });

    const body = await readPipelineBody(req);
    if (!body) return pipelineJson({ error: 'Invalid body' }, { status: 400 });

    const displayLabel = sanitizeCapitalLeadLabel(body.displayLabel);
    if (!displayLabel) {
      return pipelineJson({ error: 'Display label is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const insertPayload = {
      display_label: displayLabel,
      relationship_context: redactedText(body.relationshipContext) || null,
      segment: normalizePipelineSegment(body.segment),
      channel: normalizePipelineChannel(body.channel),
      draft_key: normalizePipelineDraft(body.draftKey),
      status: normalizePipelineStatus(body.status),
      pledge_status: normalizePledgeStatus(body.pledgeStatus),
      pledge_amount_cents: dollarsToCents(body.pledgeAmount),
      objection: redactedText(body.objection) || null,
      next_action_at: cleanText(body.nextActionAt) || null,
      source_utm: cleanText(body.sourceUtm) || null,
      notes_redacted: redactedText(body.notesRedacted) || null,
      metadata: {
        created_by_admin_method: admin.adminMethod,
        no_send_boundary: CAPITAL_PIPELINE_NO_SEND_BOUNDARY,
      },
    };

    const { data, error } = await supabase
      .from('capital_pipeline_leads')
      .insert(insertPayload)
      .select('id')
      .single();

    if (error) {
      if (isMissingPipelineTable(error)) {
        return pipelineJson(
          { error: 'Capital pipeline migration has not been applied yet' },
          { status: 409 },
        );
      }
      reportCapitalPipelineFailure('lead create');
      return pipelineJson({ error: 'Capital pipeline unavailable' }, { status: 500 });
    }

    const eventRecorded = await recordPipelineEvent(data.id, 'created', redactedText(body.eventNote) || null, {
      status: insertPayload.status,
      segment: insertPayload.segment,
    });
    if (!eventRecorded) return pipelineJson({ error: 'Capital pipeline unavailable' }, { status: 500 });

    const pipeline = await fetchCapitalPipeline(supabase);
    return pipelineJson({
      ok: true,
      id: data.id,
      ...pipeline,
      pipelineReceipt: buildCapitalPipelineReceipt({
        action: 'lead_created',
        databaseWrite: true,
        recordScope: 'capital_pipeline_leads and capital_pipeline_events redacted metadata',
        detail: 'Saved one private redacted pipeline lead. No message, contact import, checkout session, payment, deploy, landlord contact, public post, or window action was triggered.',
      }),
    });
  } catch {
    reportCapitalPipelineFailure('lead create');
    return pipelineJson({ error: 'Capital pipeline unavailable' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const admin = await requireCapitalAdmin(req);
    if (!admin) return pipelineJson({ error: 'Unauthorized' }, { status: 401 });

    const body = await readPipelineBody(req);
    if (!body) return pipelineJson({ error: 'Invalid body' }, { status: 400 });

    const id = cleanText(body.id);
    if (!id) return pipelineJson({ error: 'Lead id is required' }, { status: 400 });

    const status = body.status ? normalizePipelineStatus(body.status) : undefined;
    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.displayLabel !== undefined) updatePayload.display_label = sanitizeCapitalLeadLabel(body.displayLabel);
    if (body.relationshipContext !== undefined) updatePayload.relationship_context = redactedText(body.relationshipContext) || null;
    if (body.segment !== undefined) updatePayload.segment = normalizePipelineSegment(body.segment);
    if (body.channel !== undefined) updatePayload.channel = normalizePipelineChannel(body.channel);
    if (body.draftKey !== undefined) updatePayload.draft_key = normalizePipelineDraft(body.draftKey);
    if (status) Object.assign(updatePayload, { status }, timestampUpdates(status));
    if (body.pledgeStatus !== undefined) updatePayload.pledge_status = normalizePledgeStatus(body.pledgeStatus);
    if (body.pledgeAmount !== undefined) updatePayload.pledge_amount_cents = dollarsToCents(body.pledgeAmount);
    if (body.objection !== undefined) updatePayload.objection = redactedText(body.objection) || null;
    if (body.nextActionAt !== undefined) updatePayload.next_action_at = cleanText(body.nextActionAt) || null;
    if (body.sourceUtm !== undefined) updatePayload.source_utm = cleanText(body.sourceUtm) || null;
    if (body.notesRedacted !== undefined) updatePayload.notes_redacted = redactedText(body.notesRedacted) || null;

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('capital_pipeline_leads')
      .update(updatePayload)
      .eq('id', id);

    if (error) {
      if (isMissingPipelineTable(error)) {
        return pipelineJson(
          { error: 'Capital pipeline migration has not been applied yet' },
          { status: 409 },
        );
      }
      reportCapitalPipelineFailure('lead update');
      return pipelineJson({ error: 'Capital pipeline unavailable' }, { status: 500 });
    }

    const eventRecorded = await recordPipelineEvent(id, status ? `status:${status}` : 'updated', redactedText(body.eventNote) || null, {
      updated_by_admin_method: admin.adminMethod,
    });
    if (!eventRecorded) return pipelineJson({ error: 'Capital pipeline unavailable' }, { status: 500 });

    const pipeline = await fetchCapitalPipeline(supabase);
    return pipelineJson({
      ok: true,
      ...pipeline,
      pipelineReceipt: buildCapitalPipelineReceipt({
        action: 'lead_updated',
        databaseWrite: true,
        recordScope: 'capital_pipeline_leads and capital_pipeline_events redacted metadata',
        detail: 'Updated private redacted pipeline metadata. No message, contact import, checkout session, payment, deploy, landlord contact, public post, or window action was triggered.',
      }),
    });
  } catch {
    reportCapitalPipelineFailure('lead update');
    return pipelineJson({ error: 'Capital pipeline unavailable' }, { status: 500 });
  }
}
