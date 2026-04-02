import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { salon_id, sender_type, sender_name, content, thinker_id } = body;

    if (!content) {
      return NextResponse.json({ error: 'Content required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from('salon_messages').insert({
      salon_id: salon_id || 'general',
      sender_type: sender_type || 'member',
      sender_name: sender_name || 'Explorer',
      thinker_id: thinker_id || null,
      content,
    });

    if (error) {
      console.error('salon_message insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('salon-message API error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
