import { NextRequest } from 'next/server';
import { privateJson } from '@/lib/http/routeError';
import { getMovementAccess } from '@/lib/movement/access';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const SUGGESTION_STATUSES = ['pending', 'approved', 'rejected', 'live'] as const;

type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

type SuggestionRow = {
  id: string;
  thinker_id: string;
  name: string;
  product_type: string | null;
  tagline: string | null;
  price: number | string | null;
  raw_suggestion: string | null;
  mockup_prompt: string | null;
  status: SuggestionStatus;
  printful_product_id: number | null;
  created_at: string;
};

function isSuggestionStatus(value: string | null): value is SuggestionStatus {
  return !!value && SUGGESTION_STATUSES.includes(value as SuggestionStatus);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function safeRequestJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : null;
}

function safeKey(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const key = value.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 80);
  return key || fallback;
}

function safePrice(value: unknown): number {
  const price = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(1_000, Math.round(price * 100) / 100));
}

function normalizeSuggestion(row: SuggestionRow) {
  return {
    ...row,
    price: Number(row.price || 0),
  };
}

export async function GET(req: NextRequest) {
  const access = await getMovementAccess(req);
  if (!access) return privateJson({ error: 'Unauthorized' }, { status: 401 });
  if (!access.canManage) return privateJson({ error: 'Oracle or founder access required' }, { status: 403 });

  const statusParam = req.nextUrl.searchParams.get('status');
  const status = statusParam === 'all' ? null : isSuggestionStatus(statusParam) ? statusParam : 'pending';
  const supabaseAdmin = getSupabaseAdmin();

  let query = supabaseAdmin
    .from('merch_suggestions')
    .select('id,thinker_id,name,product_type,tagline,price,raw_suggestion,mockup_prompt,status,printful_product_id,created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (status) query = query.eq('status', status);

  const { data, error } = await query.returns<SuggestionRow[]>();
  if (error) return privateJson({ error: 'Failed to load merch suggestions' }, { status: 500 });

  return privateJson({ suggestions: (data || []).map(normalizeSuggestion) });
}

export async function POST(req: NextRequest) {
  const access = await getMovementAccess(req);
  if (!access) return privateJson({ error: 'Unauthorized' }, { status: 401 });
  if (!access.canManage) return privateJson({ error: 'Oracle or founder access required' }, { status: 403 });

  const parsed = await safeRequestJson(req);
  if (!isRecord(parsed)) return privateJson({ error: 'Invalid body' }, { status: 400 });

  const name = boundedText(parsed.name, 160);
  if (!name) return privateJson({ error: 'Product name required' }, { status: 400 });

  const productType = safeKey(parsed.productType, 'poster');
  const rawSuggestion = boundedText(parsed.rawSuggestion, 1_000);
  const imageUrl = boundedText(parsed.imageUrl, 1_000);
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from('merch_suggestions')
    .insert({
      thinker_id: safeKey(parsed.thinkerId, 'socrates'),
      product_type: productType,
      name,
      tagline: boundedText(parsed.tagline, 220) || '',
      price: safePrice(parsed.price),
      raw_suggestion: rawSuggestion,
      image_url: imageUrl,
      status: 'pending',
      suggested_by: access.memberId,
    })
    .select('id')
    .single();

  if (error || !data) return privateJson({ error: 'Failed to save merch suggestion' }, { status: 500 });

  return privateJson({ suggestion: data });
}
