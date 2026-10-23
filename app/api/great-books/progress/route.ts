import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

type ReadingProgressBody = {
  bookId?: string;
  sectionId?: string | null;
  paragraphIndex?: number | null;
  completed?: boolean | null;
};

type ReadingProgressRow = {
  id: string;
  member_id: string;
  book_id: string;
  section_id: string | null;
  paragraph_index: number | null;
  completed: boolean | null;
  updated_at: string | null;
  [key: string]: unknown;
};

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  const bookId = req.nextUrl.searchParams.get('bookId');

  const supabase = getSupabaseAdmin();
  let query = supabase.from('reading_progress').select('*').eq('member_id', auth.memberId);
  if (bookId) query = query.eq('book_id', bookId);
  const { data, error } = await query;

  if (error) return privateJson({ error: 'Failed to load reading progress' }, { status: 500 });

  return privateJson({ progress: (data || []) as ReadingProgressRow[] });
}

export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json()) as ReadingProgressBody;
  const { bookId, sectionId, paragraphIndex, completed } = body;
  if (!bookId) return privateJson({ error: 'Missing fields' }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('reading_progress').upsert({
    member_id: auth.memberId,
    book_id: bookId,
    section_id: sectionId || null,
    paragraph_index: typeof paragraphIndex === 'number' ? paragraphIndex : 0,
    completed: Boolean(completed),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'member_id,book_id' });

  if (error) return privateJson({ error: 'Failed to save reading progress' }, { status: 500 });
  return privateJson({ ok: true });
}
