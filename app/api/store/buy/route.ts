import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMMUNITY_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,119}$/i;
const PRODUCT_SELECT = 'id, community_id, name, price_rep, is_token_gated';
const ORDER_RECEIPT_SELECT = 'id, product_id, price_paid, token_symbol, status, fulfillment_status, created_at';
const MAX_PRODUCT_NAME_LENGTH = 120;

type ExpAmountRow = {
  amount: number | string | null;
};

type ProductRow = {
  id: string;
  community_id: string;
  name: string | null;
  price_rep: number | string | null;
  is_token_gated: boolean | null;
};

type CommunityRow = {
  id: string;
};

type GovernanceContractRow = {
  parameters: {
    reputation_token?: {
      symbol?: unknown;
    };
  } | null;
};

type StorePurchaseBody = {
  productId?: string;
  communitySlug?: string;
};

async function safeRequestJson(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    return body as StorePurchaseBody;
  } catch {
    return null;
  }
}

function normalizeProductId(value: unknown) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  return UUID_PATTERN.test(trimmed) ? trimmed : null;
}

function normalizeCommunitySlug(value: unknown) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim().toLowerCase();
  return COMMUNITY_SLUG_PATTERN.test(trimmed) ? trimmed : null;
}

function boundedText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  return trimmed.slice(0, maxLength);
}

function reputationSymbol(parameters: GovernanceContractRow['parameters']) {
  return boundedText(parameters?.reputation_token?.symbol, 24) || 'REP';
}

async function sumBalance(supabase: ReturnType<typeof getSupabaseAdmin>, memberId: string): Promise<number> {
  const { data } = await supabase
    .from('exp_events')
    .select('amount')
    .eq('member_id', memberId);
  const rows = (data || []) as ExpAmountRow[];
  return rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
}

export async function POST(req: NextRequest) {
  try {
    const body = await safeRequestJson(req);
    const productId = normalizeProductId(body?.productId);
    const communitySlug = normalizeCommunitySlug(body?.communitySlug);

    if (!productId || !communitySlug) {
      return privateJson({ error: 'productId and communitySlug are required' }, { status: 400 });
    }

    const auth = await getAuthenticatedMember(req);
    if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

    const buyerId = auth.memberId;
    const supabase = getSupabaseAdmin();

    const { data: product, error: pErr } = await supabase
      .from('dao_products')
      .select(PRODUCT_SELECT)
      .eq('id', productId)
      .single();

    if (pErr || !product) {
      return privateJson({ error: 'Product not found' }, { status: 404 });
    }

    const { data: community, error: cErr } = await supabase
      .from('communities')
      .select('id')
      .eq('slug', communitySlug)
      .single();

    if (cErr || !community) {
      return privateJson({ error: 'Community not found' }, { status: 404 });
    }

    const productRow = product as ProductRow;
    const communityRow = community as CommunityRow;
    if (productRow.community_id !== communityRow.id) {
      return privateJson({ error: 'Product does not belong to this community' }, { status: 400 });
    }

    const { data: govContract } = await supabase
      .from('community_contracts')
      .select('parameters')
      .eq('community_id', community.id)
      .eq('contract_type', 'governance')
      .maybeSingle();

    const govContractRow = govContract as GovernanceContractRow | null;
    const repSymbol = reputationSymbol(govContractRow?.parameters || null);
    const price = Math.max(0, Number(productRow.price_rep) || 0);
    const productName = boundedText(productRow.name, MAX_PRODUCT_NAME_LENGTH) || 'Product';

    const balance = await sumBalance(supabase, buyerId);

    if (productRow.is_token_gated && balance < price) {
      return privateJson({ error: 'Insufficient reputation', balance, required: price }, { status: 403 });
    }
    if (balance < price) {
      return privateJson({ error: `Insufficient $${repSymbol} balance`, balance, required: price }, { status: 400 });
    }

    // Deduct via negative exp_events row (schema has member_id, amount, reason)
    const { error: debitErr } = await supabase.from('exp_events').insert({
      member_id: buyerId,
      amount: -price,
      reason: `Purchased: ${productName} [store:${communitySlug}:${productId}]`,
    });

    if (debitErr) {
      return privateJson({ error: 'Debit failed' }, { status: 500 });
    }

    // Keep denormalized members.exp_tokens in sync when present
    const { data: m } = await supabase.from('members').select('exp_tokens').eq('id', buyerId).single();
    if (m) {
      await supabase
        .from('members')
        .update({ exp_tokens: Math.max(0, (Number(m.exp_tokens) || 0) - price) })
        .eq('id', buyerId);
    }

    const { data: order, error: oErr } = await supabase
      .from('dao_orders')
      .insert({
        community_id: communityRow.id,
        product_id: productId,
        buyer_id: buyerId,
        price_paid: price,
        token_symbol: repSymbol,
        status: 'completed',
      })
      .select(ORDER_RECEIPT_SELECT)
      .single();

    if (oErr) {
      // Refund the debit so balance stays consistent
      await supabase.from('exp_events').insert({
        member_id: buyerId,
        amount: price,
        reason: `Refund: order failed for ${productName} [store:${communitySlug}:${productId}:refund]`,
      });
      if (m) {
        await supabase.from('members').update({ exp_tokens: Number(m.exp_tokens) || 0 }).eq('id', buyerId);
      }
      return privateJson({ error: 'Order creation failed' }, { status: 500 });
    }

    return privateJson({ success: true, order, newBalance: balance - price });
  } catch {
    return privateJson({ error: 'Purchase failed' }, { status: 500 });
  }
}
