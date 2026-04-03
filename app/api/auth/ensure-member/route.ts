import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { supabaseAuthId, displayName, email } = await req.json();
    if (!supabaseAuthId) return NextResponse.json({ error: 'Missing auth ID' }, { status: 400 });

    // Check if member exists
    const { data: existing } = await supabaseAdmin
      .from('members')
      .select('*')
      .eq('supabase_auth_id', supabaseAuthId)
      .single();

    if (existing) return NextResponse.json({ member: existing, created: false });

    // Create new member from Google/OAuth data
    const { data: member, error } = await supabaseAdmin
      .from('members')
      .insert({
        supabase_auth_id: supabaseAuthId,
        display_name: displayName || email?.split('@')[0] || 'Explorer',
        exp_tokens: 0,
        tier: 'free',
      })
      .select()
      .single();

    if (error) {
      console.error('Member creation failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ member, created: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
