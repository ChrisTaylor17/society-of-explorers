import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const { city, name, email } = await req.json();
  if (!city || !name || !email) return NextResponse.json({ error: 'City, name, and email required' }, { status: 400 });

  const { error } = await supabase.from('founding_interest').insert({
    name: name.trim(),
    email: email.trim().toLowerCase(),
    why: `[Salon Support] ${city.trim()}`,
    created_at: new Date().toISOString(),
  });

  if (error) console.error('Salon support error:', error);

  return NextResponse.json({ success: true });
}
