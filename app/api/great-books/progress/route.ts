import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { GREAT_BOOKS, getBook } from '@/lib/books/catalog';
import { readBookEdition } from '@/lib/books/editions';
import { encodeBookmarkLocator, interpretBookmark } from '@/lib/books/bookmarks';
import { circleWriteOrigin, readCircleReviewJson } from '@/lib/circles/moderation-server';

type ProgressRow = { book_id: string; section_id: string | null; paragraph_index: number | null; completed: boolean | null; updated_at: string | null };
const SELECT = 'book_id,section_id,paragraph_index,completed,updated_at';

export async function GET(req: NextRequest) {
  let auth: Awaited<ReturnType<typeof getAuthenticatedMember>>;
  try { auth = await getAuthenticatedMember(req); }
  catch { return privateJson({ error: 'Reading session could not be verified' }, { status: 503 }); }
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });
  const bookId = req.nextUrl.searchParams.get('bookId');
  if (bookId !== null && !getBook(bookId)) return privateJson({ error: 'Unknown book' }, { status: 400 });
  try {
    let query = getSupabaseAdmin().from('reading_progress').select(SELECT).eq('member_id', auth.memberId);
    query = bookId ? query.eq('book_id', bookId) : query.in('book_id', GREAT_BOOKS.map(book => book.id));
    const { data, error } = await query;
    if (error || !Array.isArray(data) || data.length > GREAT_BOOKS.length) throw new Error('Progress unavailable');
    const progress = await Promise.all(data.map(async (value: unknown) => {
      if (!value || typeof value !== 'object') throw new Error('Invalid progress');
      const row = value as ProgressRow;
      if (!getBook(row.book_id) || (row.section_id !== null && (typeof row.section_id !== 'string' || row.section_id.length > 150))
        || (row.paragraph_index !== null && (!Number.isSafeInteger(row.paragraph_index) || row.paragraph_index < 0))
        || (row.completed !== null && typeof row.completed !== 'boolean')
        || (row.updated_at !== null && (typeof row.updated_at !== 'string' || row.updated_at.length > 50))) throw new Error('Invalid progress');
      const edition = await readBookEdition(row.book_id);
      if (!edition) throw new Error('Edition unavailable');
      // Old numeric ordinals remain visible as legacy metadata, never silently
      // converted into locations in a different full HTML edition.
      return { book_id: row.book_id, section_id: row.section_id, paragraph_index: row.paragraph_index,
        completed: row.completed, updated_at: row.updated_at,
        bookmark: interpretBookmark(row.section_id, edition.edition.editionId, edition.edition.blockCount) };
    }));
    if (new Set(progress.map(row => row.book_id)).size !== progress.length) throw new Error('Invalid progress');
    return privateJson({ progress });
  } catch { return privateJson({ error: 'Failed to load reading progress' }, { status: 503 }); }
}

export async function POST(req: NextRequest) {
  let auth: Awaited<ReturnType<typeof getAuthenticatedMember>>;
  try { auth = await getAuthenticatedMember(req); }
  catch { return privateJson({ error: 'Reading session could not be verified' }, { status: 503 }); }
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });
  const originFailure = circleWriteOrigin(req);
  if (originFailure) return originFailure;
  const parsed = await readCircleReviewJson(req);
  if (!parsed.ok) return parsed.response;
  if (!parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) return privateJson({ error: 'Invalid bookmark' }, { status: 400 });
  const body = parsed.value as Record<string, unknown>;
  if (body.memberId !== undefined && body.memberId !== auth.memberId) return privateJson({ error: 'Cannot save another member bookmark' }, { status: 403 });
  if (Object.keys(body).some(key => !['bookId', 'editionId', 'blockIndex', 'completed', 'memberId'].includes(key))
    || typeof body.bookId !== 'string' || !getBook(body.bookId) || typeof body.editionId !== 'string'
    || !Number.isSafeInteger(body.blockIndex) || Number(body.blockIndex) < 0
    || (body.completed !== undefined && typeof body.completed !== 'boolean')) return privateJson({ error: 'Invalid bookmark' }, { status: 400 });
  try {
    const edition = await readBookEdition(body.bookId);
    if (!edition) return privateJson({ error: 'Unknown book' }, { status: 400 });
    if (body.editionId !== edition.edition.editionId) return privateJson({ error: 'Reading edition changed; review your location before saving' }, { status: 409 });
    const blockIndex = Number(body.blockIndex);
    if (blockIndex >= edition.edition.blockCount) return privateJson({ error: 'Invalid bookmark location' }, { status: 400 });
    const sectionId = encodeBookmarkLocator(edition.edition.editionId, blockIndex);
    const { error } = await getSupabaseAdmin().from('reading_progress').upsert({
      member_id: auth.memberId, book_id: body.bookId, section_id: sectionId,
      paragraph_index: 0, completed: body.completed === true, updated_at: new Date().toISOString(),
    }, { onConflict: 'member_id,book_id' });
    if (error) throw new Error('Progress unavailable');
    return privateJson({ ok: true, bookmark: { status: 'current', editionId: edition.edition.editionId, blockIndex } });
  } catch { return privateJson({ error: 'Failed to save reading progress' }, { status: 503 }); }
}
