import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function sumBalance(memberId: string): Promise<number> {
  const { data } = await supabase
    .from('exp_events')
    .select('amount')
    .eq('member_id', memberId);
  return (data || []).reduce((s, r: any) => s + (Number(r.amount) || 0), 0);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { productId, memberId, communitySlug } = body;

  if (!productId || !memberId || !communitySlug) {
    return NextResponse.json({ error: 'productId, memberId, and communitySlug are required' }, { status: 400 });
  }

  const { data: product, error: pErr } = await supabase
    .from('dao_products')
    .select('*')
    .eq('id', productId)
    .single();

  if (pErr || !product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }

  const { data: community, error: cErr } = await supabase
    .from('communities')
    .select('id')
    .eq('slug', communitySlug)
    .single();

  if (cErr || !community) {
    return NextResponse.json({ error: 'Community not found' }, { status: 404 });
  }

  if (product.community_id !== community.id) {
    return NextResponse.json({ error: 'Product does not belong to this community' }, { status: 400 });
  }

  const { data: govContract } = await supabase
    .from('community_contracts')
    .select('parameters')
    .eq('community_id', community.id)
    .eq('contract_type', 'governance')
    .maybeSingle();

  const repSymbol = govContract?.parameters?.reputation_token?.symbol || 'REP';
  const price = Number(product.price_rep) || 0;

  const balance = await sumBalance(memberId);

  if (product.is_token_gated && balance < price) {
    return NextResponse.json({ error: 'Insufficient reputation', balance, required: price }, { status: 403 });
  }
  if (balance < price) {
    return NextResponse.json({ error: `Insufficient $${repSymbol} balance`, balance, required: price }, { status: 400 });
  }

  // Deduct via negative exp_events row (schema has member_id, amount, reason)
  const { error: debitErr } = await supabase.from('exp_events').insert({
    member_id: memberId,
    amount: -price,
    reason: `Purchased: ${product.name} [store:${communitySlug}:${productId}]`,
  });

  if (debitErr) {
    return NextResponse.json({ error: `Debit failed: ${debitErr.message}` }, { status: 500 });
  }

  // Keep denormalized members.exp_tokens in sync when present
  const { data: m } = await supabase.from('members').select('exp_tokens').eq('id', memberId).single();
  if (m) {
    await supabase
      .from('members')
      .update({ exp_tokens: Math.max(0, (Number(m.exp_tokens) || 0) - price) })
      .eq('id', memberId);
  }

  const { data: order, error: oErr } = await supabase
    .from('dao_orders')
    .insert({
      community_id: community.id,
      product_id: productId,
      buyer_id: memberId,
      price_paid: price,
      token_symbol: repSymbol,
      status: 'completed',
    })
    .select()
    .single();

  if (oErr) {
    // Refund the debit so balance stays consistent
    await supabase.from('exp_events').insert({
      member_id: memberId,
      amount: price,
      reason: `Refund: order failed for ${product.name} [store:${communitySlug}:${productId}:refund]`,
    });
    if (m) {
      await supabase.from('members').update({ exp_tokens: Number(m.exp_tokens) || 0 }).eq('id', memberId);
    }
    return NextResponse.json({ error: `Order creation failed: ${oErr.message}` }, { status: 500 });
  }

  return NextResponse.json({ success: true, order, newBalance: balance - price });
}
