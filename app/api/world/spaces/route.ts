import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const city = searchParams.get('city');
    const status = searchParams.get('status') || 'active';

    let query = supabaseAdmin
      .from('spaces')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (city) query = query.ilike('city', `%${city}%`);

    const { data: spaces, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ spaces });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, slug, description, address, city, country, lat, lng, spaceType, hostId, memberId } = body;

    if (!name || !slug || !memberId) {
      return NextResponse.json({ error: 'Missing required fields: name, slug, memberId' }, { status: 400 });
    }

    // Check slug uniqueness
    const { data: existing } = await supabaseAdmin
      .from('spaces')
      .select('id')
      .eq('slug', slug)
      .single();

    if (existing) return NextResponse.json({ error: 'Slug already in use' }, { status: 409 });

    const { data: space, error } = await supabaseAdmin
      .from('spaces')
      .insert({
        name,
        slug,
        description: description || null,
        address: address || null,
        city: city || null,
        country: country || null,
        lat: lat || null,
        lng: lng || null,
        space_type: spaceType || 'waypoint',
        host_id: hostId || null,
        status: 'active',
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Award 15 EXP for creating a space
    await supabaseAdmin.from('exp_events').insert({
      member_id: memberId,
      amount: 15,
      reason: 'space_created',
      metadata: JSON.stringify({ spaceId: space.id, spaceName: name }),
    });

    const { data: member } = await supabaseAdmin
      .from('members')
      .select('exp_tokens')
      .eq('id', memberId)
      .single();

    const newTotal = (member?.exp_tokens || 0) + 15;
    await supabaseAdmin.from('members').update({ exp_tokens: newTotal }).eq('id', memberId);

    return NextResponse.json({ space, expAwarded: 15, newTotal });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
