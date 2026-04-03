import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const memberId = req.nextUrl.searchParams.get('memberId');
  const bookId = req.nextUrl.searchParams.get('bookId');
  if (!memberId) return NextResponse.json({ error: 'memberId required' }, { status: 400 });

  let query = supabaseAdmin.from('reading_progress').select('*').eq('member_id', memberId);
  if (bookId) query = query.eq('book_id', bookId);
  const { data } = await query;
  return NextResponse.json({ progress: data || [] });
}

export async function POST(req: NextRequest) {
  const { memberId, bookId, sectionId, paragraphIndex, completed } = await req.json();
  if (!memberId || !bookId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  const { error } = await supabaseAdmin.from('reading_progress').upsert({
    member_id: memberId,
    book_id: bookId,
    section_id: sectionId || null,
    paragraph_index: paragraphIndex || 0,
    completed: completed || false,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'member_id,book_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
