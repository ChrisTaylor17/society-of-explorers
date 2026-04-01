import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const { name, email, why } = await req.json();
  if (!name || !email) return NextResponse.json({ error: 'Name and email required' }, { status: 400 });

  const { error } = await supabase.from('founding_interest').insert({
    name: name.trim(),
    email: email.trim().toLowerCase(),
    why: why?.trim() || null,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error('founding_interest insert error:', error);
  }

  return NextResponse.json({ success: true });
}
