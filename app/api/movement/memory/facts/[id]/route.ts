import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  buildMemoryFactExpirationPayload,
  buildMemoryConsentReceipt,
  buildMemoryReplacementInsertPayload,
  memoryConsentStateColumnsEnabled,
  memoryConsentStateSchemaError,
  type MemoryConsentAction,
} from '@/lib/memory/consentActions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteParams = {
  params: Promise<{ id: string }>;
};

const validCategories = new Set([
  'identity',
  'goal',
  'challenge',
  'value',
  'preference',
  'relationship',
  'emotional_pattern',
  'milestone',
  'commitment',
]);

type MemoryFactRow = {
  id: string;
  category: string;
  key: string;
  value: string;
  confidence: number | null;
  valid_from: string | null;
  updated_at: string | null;
  version?: number | null;
};

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  if (!cleaned) return null;
  return cleaned.slice(0, max);
}

function formatFact(row: MemoryFactRow) {
  return {
    id: row.id,
    category: row.category,
    key: row.key,
    value: row.value,
    confidence: typeof row.confidence === 'number' ? row.confidence : null,
    validFrom: row.valid_from || null,
    updatedAt: row.updated_at || null,
  };
}

function reportMemoryFactFailure(scope: string) {
  console.warn(`[movement/memory] ${scope} failed`);
}

function isPatchMemoryAction(action: string | null): action is Extract<MemoryConsentAction, 'correct' | 'retract' | 'do_not_use'> {
  return action === 'correct' || action === 'retract' || action === 'do_not_use';
}

async function readJson(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function DELETE(req: NextRequest, ctx: RouteParams) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  if (!id) return privateJson({ error: 'Memory fact id required' }, { status: 400 });

  const now = new Date().toISOString();
  const includeStateColumns = memoryConsentStateColumnsEnabled();
  const supabaseAdmin = getSupabaseAdmin();
  let usedSchemaFallback = false;
  let result = await supabaseAdmin
    .from('user_semantic_memory')
    .update(buildMemoryFactExpirationPayload({ action: 'forget', now, includeStateColumns }))
    .eq('id', id)
    .eq('member_id', auth.memberId)
    .is('valid_until', null)
    .select('id')
    .maybeSingle();

  if (result.error && includeStateColumns && memoryConsentStateSchemaError(result.error)) {
    usedSchemaFallback = true;
    result = await supabaseAdmin
      .from('user_semantic_memory')
      .update(buildMemoryFactExpirationPayload({ action: 'forget', now, includeStateColumns: false }))
      .eq('id', id)
      .eq('member_id', auth.memberId)
      .is('valid_until', null)
      .select('id')
      .maybeSingle();
  }

  const { data, error } = result;

  if (error) {
    reportMemoryFactFailure('fact delete');
    return privateJson({ error: 'Unable to forget memory fact' }, { status: 500 });
  }

  if (!data) {
    return privateJson({ error: 'Memory fact not found' }, { status: 404 });
  }

  return privateJson({
    ok: true,
    id,
    consentReceipt: buildMemoryConsentReceipt({
      action: 'forget',
      now,
      includeStateColumns,
      usedSchemaFallback,
    }),
  });
}

export async function PATCH(req: NextRequest, ctx: RouteParams) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  if (!id) return privateJson({ error: 'Memory fact id required' }, { status: 400 });

  const body = await readJson(req);
  if (!body) return privateJson({ error: 'Invalid memory action payload' }, { status: 400 });

  const action = cleanText(body.action, 40);
  if (!isPatchMemoryAction(action)) {
    return privateJson({ error: 'Unsupported memory action' }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: existing, error: lookupError } = await supabaseAdmin
    .from('user_semantic_memory')
    .select('id, category, key, value, confidence, valid_from, updated_at, version')
    .eq('id', id)
    .eq('member_id', auth.memberId)
    .is('valid_until', null)
    .maybeSingle();

  if (lookupError) {
    reportMemoryFactFailure('fact lookup');
    return privateJson({ error: 'Unable to inspect memory fact' }, { status: 500 });
  }

  if (!existing) {
    return privateJson({ error: 'Memory fact not found' }, { status: 404 });
  }

  const now = new Date().toISOString();
  const includeStateColumns = memoryConsentStateColumnsEnabled();
  const note = cleanText(body.note, 500);

  if (action === 'correct') {
    const replacementInput = body.replacement;
    if (!replacementInput || typeof replacementInput !== 'object' || Array.isArray(replacementInput)) {
      return privateJson({ error: 'Replacement memory is required' }, { status: 400 });
    }

    const replacement = replacementInput as Record<string, unknown>;
    const category = cleanText(replacement.category, 80);
    const key = cleanText(replacement.key, 100);
    const value = cleanText(replacement.value, 500);

    if (!category || !validCategories.has(category)) {
      return privateJson({ error: 'Replacement category is invalid' }, { status: 400 });
    }
    if (!key || !value) {
      return privateJson({ error: 'Replacement key and value are required' }, { status: 400 });
    }

    const version = Math.max(1, Number((existing as MemoryFactRow).version || 1) + 1);
    let usedSchemaFallback = false;
    let insertResult = await supabaseAdmin
      .from('user_semantic_memory')
      .insert(buildMemoryReplacementInsertPayload({
        memberId: auth.memberId,
        category,
        key,
        value,
        confidence: 1,
        version,
        now,
        includeStateColumns,
      }))
      .select('id, category, key, value, confidence, valid_from, updated_at')
      .single();

    let stateColumnsAvailable = includeStateColumns;
    if (insertResult.error && includeStateColumns && memoryConsentStateSchemaError(insertResult.error)) {
      stateColumnsAvailable = false;
      usedSchemaFallback = true;
      insertResult = await supabaseAdmin
        .from('user_semantic_memory')
        .insert(buildMemoryReplacementInsertPayload({
          memberId: auth.memberId,
          category,
          key,
          value,
          confidence: 1,
          version,
          now,
          includeStateColumns: false,
        }))
        .select('id, category, key, value, confidence, valid_from, updated_at')
        .single();
    }

    const { data: inserted, error: insertError } = insertResult;

    if (insertError || !inserted) {
      reportMemoryFactFailure('correction insert');
      return privateJson({ error: 'Unable to create corrected memory' }, { status: 500 });
    }

    const replacementFactId = (inserted as MemoryFactRow).id;
    let expireResult = await supabaseAdmin
      .from('user_semantic_memory')
      .update(buildMemoryFactExpirationPayload({
        action: 'correct',
        now,
        note,
        replacementFactId,
        includeStateColumns: stateColumnsAvailable,
      }))
      .eq('id', id)
      .eq('member_id', auth.memberId)
      .is('valid_until', null)
      .select('id')
      .maybeSingle();

    if (expireResult.error && stateColumnsAvailable && memoryConsentStateSchemaError(expireResult.error)) {
      usedSchemaFallback = true;
      expireResult = await supabaseAdmin
        .from('user_semantic_memory')
        .update(buildMemoryFactExpirationPayload({ action: 'correct', now, includeStateColumns: false }))
        .eq('id', id)
        .eq('member_id', auth.memberId)
        .is('valid_until', null)
        .select('id')
        .maybeSingle();
    }

    const { data: expired, error: expireError } = expireResult;

    if (expireError || !expired) {
      reportMemoryFactFailure('correction expire');
      await supabaseAdmin
        .from('user_semantic_memory')
        .delete()
        .eq('id', (inserted as MemoryFactRow).id)
        .eq('member_id', auth.memberId);
      return privateJson({ error: 'Unable to replace memory safely' }, { status: 500 });
    }

    return privateJson({
      ok: true,
      action,
      id,
      replacementFact: formatFact(inserted as MemoryFactRow),
      consentReceipt: buildMemoryConsentReceipt({
        action,
        now,
        note,
        replacementFactId,
        includeStateColumns,
        usedSchemaFallback,
      }),
    });
  }

  let usedSchemaFallback = false;
  let result = await supabaseAdmin
    .from('user_semantic_memory')
    .update(buildMemoryFactExpirationPayload({ action, now, note, includeStateColumns }))
    .eq('id', id)
    .eq('member_id', auth.memberId)
    .is('valid_until', null)
    .select('id')
    .maybeSingle();

  if (result.error && includeStateColumns && memoryConsentStateSchemaError(result.error)) {
    usedSchemaFallback = true;
    result = await supabaseAdmin
      .from('user_semantic_memory')
      .update(buildMemoryFactExpirationPayload({ action, now, includeStateColumns: false }))
      .eq('id', id)
      .eq('member_id', auth.memberId)
      .is('valid_until', null)
      .select('id')
      .maybeSingle();
  }

  const { data, error } = result;

  if (error) {
    reportMemoryFactFailure('fact suppression');
    return privateJson({ error: 'Unable to update memory consent' }, { status: 500 });
  }

  if (!data) {
    return privateJson({ error: 'Memory fact not found' }, { status: 404 });
  }

  return privateJson({
    ok: true,
    action,
    id,
    consentReceipt: buildMemoryConsentReceipt({
      action,
      now,
      note,
      includeStateColumns,
      usedSchemaFallback,
    }),
  });
}
