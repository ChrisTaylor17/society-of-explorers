import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const { data: community, error } = await supabase
    .from('communities')
    .select('id')
    .eq('slug', slug)
    .single();

  if (error || !community) {
    return NextResponse.json({ error: 'DAO not found' }, { status: 404 });
  }

  const { data: products } = await supabase
    .from('dao_products')
    .select('*')
    .eq('community_id', community.id)
    .order('created_at', { ascending: false });

  return NextResponse.json({ products: products || [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await req.json();
  const { name, description, image_url, price_rep, is_token_gated, memberId } = body;

  if (!memberId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'Product name required' }, { status: 400 });
  }

  const { data: community, error: cErr } = await supabase
    .from('communities')
    .select('id, owner_member_id')
    .eq('slug', slug)
    .single();

  if (cErr || !community) {
    return NextResponse.json({ error: 'DAO not found' }, { status: 404 });
  }

  if (community.owner_member_id !== memberId) {
    return NextResponse.json({ error: 'Only the DAO owner can create products' }, { status: 403 });
  }

  const { data: product, error: insErr } = await supabase
    .from('dao_products')
    .insert({
      community_id: community.id,
      name: name.trim(),
      description: description?.trim() || null,
      image_url: image_url?.trim() || null,
      price_rep: Math.max(0, parseInt(price_rep) || 0),
      is_token_gated: !!is_token_gated,
      created_by: memberId,
    })
    .select()
    .single();

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ product });
}
