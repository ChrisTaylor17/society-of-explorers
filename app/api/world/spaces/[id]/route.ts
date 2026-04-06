import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const { data: space, error } = await supabaseAdmin
      .from('spaces')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });

    const { data: scans } = await supabaseAdmin
      .from('scan_uploads')
      .select('*')
      .eq('space_id', id)
      .order('created_at', { ascending: false });

    const { data: annotations } = await supabaseAdmin
      .from('spatial_annotations')
      .select('*')
      .eq('space_id', id)
      .order('created_at', { ascending: false });

    return NextResponse.json({ space, scans: scans || [], annotations: annotations || [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { hostId, name, description, address, city, country, lat, lng, status, coverUrl } = body;

    if (!hostId) return NextResponse.json({ error: 'Missing hostId' }, { status: 400 });

    // Verify caller is the host
    const { data: space } = await supabaseAdmin
      .from('spaces')
      .select('host_id')
      .eq('id', id)
      .single();

    if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });
    if (space.host_id !== hostId) return NextResponse.json({ error: 'Not authorized — host only' }, { status: 403 });

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (address !== undefined) updates.address = address;
    if (city !== undefined) updates.city = city;
    if (country !== undefined) updates.country = country;
    if (lat !== undefined) updates.lat = lat;
    if (lng !== undefined) updates.lng = lng;
    if (status !== undefined) updates.status = status;
    if (coverUrl !== undefined) updates.cover_url = coverUrl;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data: updated, error } = await supabaseAdmin
      .from('spaces')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ space: updated });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { searchParams } = req.nextUrl;
    const hostId = searchParams.get('hostId');

    if (!hostId) return NextResponse.json({ error: 'Missing hostId' }, { status: 400 });

    // Verify caller is the host
    const { data: space } = await supabaseAdmin
      .from('spaces')
      .select('host_id')
      .eq('id', id)
      .single();

    if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });
    if (space.host_id !== hostId) return NextResponse.json({ error: 'Not authorized — host only' }, { status: 403 });

    // Full cascade: delete annotations, quality logs, scans, then space
    const { data: scans } = await supabaseAdmin
      .from('scan_uploads')
      .select('id')
      .eq('space_id', id);

    if (scans && scans.length > 0) {
      const scanIds = scans.map(s => s.id);
      await supabaseAdmin.from('scan_quality_log').delete().in('scan_id', scanIds);
      await supabaseAdmin.from('spatial_annotations').delete().eq('space_id', id);
      await supabaseAdmin.from('scan_uploads').delete().eq('space_id', id);
    } else {
      await supabaseAdmin.from('spatial_annotations').delete().eq('space_id', id);
    }

    const { error } = await supabaseAdmin.from('spaces').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, deleted: id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
