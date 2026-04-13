import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ salonId: string }> }) {
  const { salonId } = await params;
  const { data } = await supabase.from('salon_sessions').select('*').eq('salon_id', salonId).order('session_date', { ascending: true });
  return NextResponse.json({ sessions: data || [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ salonId: string }> }) {
  const { salonId } = await params;
  const { session_date, topic, track, led_by_member_id } = await req.json();
  const { data, error } = await supabase.from('salon_sessions').insert({
    salon_id: salonId, session_date, topic, track, led_by_member_id,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ session: data });
}

export async function PATCH(req: NextRequest) {
  const { session_id, transcript_summary, status, exp_awarded_total } = await req.json();
  if (!session_id) return NextResponse.json({ error: 'session_id required' }, { status: 400 });
  const updates: any = {};
  if (transcript_summary !== undefined) updates.transcript_summary = transcript_summary;
  if (status) updates.status = status;
  if (exp_awarded_total !== undefined) updates.exp_awarded_total = exp_awarded_total;
  const { data, error } = await supabase.from('salon_sessions').update(updates).eq('id', session_id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ session: data });
}
