import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data: community } = await supabase.from('communities').select('id').eq('slug', slug).single();
  if (!community) return NextResponse.json({ error: 'Community not found' }, { status: 404 });

  const { data: thinkers } = await supabase
    .from('community_thinkers')
    .select('*')
    .eq('community_id', community.id)
    .eq('is_active', true)
    .order('sort_order');

  return NextResponse.json({ thinkers: thinkers || [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await req.json();

  const { data: community } = await supabase.from('communities').select('id').eq('slug', slug).single();
  if (!community) return NextResponse.json({ error: 'Community not found' }, { status: 404 });

  const { thinker_key, name, avatar, color, mandate, persona_lens } = body;
  if (!thinker_key || !name || !mandate || !persona_lens) {
    return NextResponse.json({ error: 'thinker_key, name, mandate, and persona_lens required' }, { status: 400 });
  }

  const { count } = await supabase.from('community_thinkers')
    .select('*', { count: 'exact', head: true })
    .eq('community_id', community.id)
    .eq('is_active', true);

  if ((count || 0) >= 8) return NextResponse.json({ error: 'Maximum 8 thinkers per community' }, { status: 400 });

  const { data: thinker, error } = await supabase.from('community_thinkers').insert({
    community_id: community.id,
    thinker_key: thinker_key.toLowerCase().replace(/[^a-z0-9-]/g, ''),
    name: name.trim(),
    avatar: (avatar || name.slice(0, 2)).toUpperCase().slice(0, 2),
    color: color || '#c9a84c',
    mandate: mandate.trim(),
    persona_lens: persona_lens.trim(),
    sort_order: count || 0,
  }).select().single();

  if (error) return NextResponse.json({ error: 'Failed to create thinker' }, { status: 500 });
  return NextResponse.json({ thinker });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await req.json();

  const { data: community } = await supabase.from('communities').select('id').eq('slug', slug).single();
  if (!community) return NextResponse.json({ error: 'Community not found' }, { status: 404 });

  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'Thinker id required' }, { status: 400 });

  const { data: thinker, error } = await supabase
    .from('community_thinkers')
    .update(updates)
    .eq('id', id)
    .eq('community_id', community.id)
    .select().single();

  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  return NextResponse.json({ thinker });
}
