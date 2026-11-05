import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { GREAT_BOOKS, getBook } from '@/lib/books/catalog';
import { readBookEdition } from '@/lib/books/editions';
import { encodeBookmarkLocator } from '@/lib/books/bookmarks';
import { parseReadingProgressMutation, parseReadingProgressResponse, readingProgressFromRow,
  READING_PROGRESS_BODY_MAX_BYTES, READING_PROGRESS_SELECT, type ReadingProgressEdition } from '@/lib/books/reading-progress';
import { circleWriteOrigin } from '@/lib/circles/moderation-server';

const failure = (status: number, error: string) => privateJson({ error }, { status });
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
async function currentEdition(bookId: string): Promise<ReadingProgressEdition> {
  const source = await readBookEdition(bookId);
  if (!source) throw Error('Edition unavailable');
  return { editionId: source.edition.editionId, blockCount: source.edition.blockCount };
}

/** Bounds actual UTF-8 bytes and the entire streaming body, including a body
 * which never completes. No database write starts after the body deadline. */
async function mutationBody(req: NextRequest): Promise<{ value: unknown; response?: never } | { value?: never; response: Response }> {
  const length = req.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > READING_PROGRESS_BODY_MAX_BYTES)) return { response: failure(413, 'Saved reading action is too large') };
  const reader = req.body?.getReader();
  if (!reader) return { response: failure(400, 'Invalid saved reading action') };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectAbort: () => void = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(Error('interrupted'));
    timer = setTimeout(rejectAbort, 5000);
    req.signal.addEventListener('abort', rejectAbort, { once: true });
    if (req.signal.aborted) rejectAbort();
  });
  try {
    const parts: Uint8Array[] = []; let size = 0;
    while (true) {
      const next = await Promise.race([reader.read(), interrupted]);
      if (next.done) break;
      size += next.value.byteLength;
      if (size > READING_PROGRESS_BODY_MAX_BYTES) return { response: failure(413, 'Saved reading action is too large') };
      parts.push(next.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
    try { return { value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) }; }
    catch { return { response: failure(400, 'Invalid saved reading action') }; }
  } catch { return { response: failure(408, 'Saved reading action body was interrupted') }; }
  finally {
    clearTimeout(timer); req.signal.removeEventListener('abort', rejectAbort);
    void reader.cancel().catch(() => {});
  }
}

export async function GET(req: NextRequest) {
  let auth: Awaited<ReturnType<typeof getAuthenticatedMember>>;
  try { auth = await getAuthenticatedMember(req); }
  catch { return failure(503, 'Reading session could not be verified'); }
  if (!auth) return failure(401, 'Unauthorized');
  const params = new URL(req.url).searchParams;
  const bookId = params.get('bookId');
  if ([...params.keys()].some(key => key !== 'bookId') || params.getAll('bookId').length > 1 || bookId !== null && !getBook(bookId)) return failure(400, 'Invalid saved reading query');
  const books = bookId === null ? GREAT_BOOKS.map(book => book.id) : [bookId];
  try {
    let query = getSupabaseAdmin().from('reading_progress').select(READING_PROGRESS_SELECT).eq('member_id', auth.memberId);
    query = bookId === null ? query.in('book_id', books) : query.eq('book_id', bookId);
    const { data, error } = await query;
    if (error || !Array.isArray(data) || data.length > books.length) throw Error('Progress unavailable');
    const rows = new Map<string, unknown>();
    for (const row of data) {
      if (!record(row) || row.member_id !== auth.memberId || typeof row.book_id !== 'string' || !books.includes(row.book_id) || rows.has(row.book_id)) throw Error('Invalid progress owner or book');
      rows.set(row.book_id, row);
    }
    const progress = await Promise.all(books.map(async id => readingProgressFromRow(rows.get(id) ?? null, id, await currentEdition(id))));
    const response = parseReadingProgressResponse({ memberId: auth.memberId, progress }, bookId ?? undefined);
    if (!response) throw Error('Invalid progress');
    return privateJson(response);
  } catch { return failure(503, 'Failed to load saved reading'); }
}

export async function POST(req: NextRequest) {
  let auth: Awaited<ReturnType<typeof getAuthenticatedMember>>;
  try { auth = await getAuthenticatedMember(req); }
  catch { return failure(503, 'Reading session could not be verified'); }
  if (!auth) return failure(401, 'Unauthorized');
  const originFailure = circleWriteOrigin(req);
  if (originFailure) return originFailure;
  if (new URL(req.url).search !== '') return failure(400, 'Invalid saved reading query');
  const parsed = await mutationBody(req);
  if (parsed.response) return parsed.response;
  const body = parseReadingProgressMutation(parsed.value);
  if (!body) return failure(400, 'A reviewed revision-bound saved reading action is required');
  if (body.expectedMemberId !== auth.memberId.toLowerCase()) return failure(409, 'Reading account changed; load current state');
  try {
    const edition = await currentEdition(body.bookId);
    if (body.action === 'save') {
      if (body.editionId !== edition.editionId) return failure(409, 'Reading edition changed; review the current edition');
      if (body.blockIndex >= edition.blockCount) return failure(400, 'Invalid saved reading location');
    }
    const { data, error } = await getSupabaseAdmin().rpc('soe_reading_progress_update', {
      p_actor: auth.memberId, p_expected_revision: body.expectedRevision, p_book_id: body.bookId, p_action: body.action,
      p_edition_id: body.action === 'save' ? body.editionId : null,
      p_block_index: body.action === 'save' ? body.blockIndex : null,
      p_completed: body.action === 'save' ? body.completed : null,
    });
    if (error) return failure(error.code === 'PT409' ? 409 : error.code === 'PT400' ? 400 : 503,
      error.code === 'PT409' ? 'Saved reading changed; load current state before reviewing another action' : 'Failed to save reading progress');
    if (!record(data) || data.member_id !== auth.memberId) throw Error('Invalid saved reading owner');
    const state = readingProgressFromRow(data, body.bookId, edition);
    if (!state || state.revision < body.expectedRevision || state.revision > body.expectedRevision + 1
      || (body.action === 'remove' ? state.status !== 'removed' : state.status !== 'saved'
        || state.sectionId !== encodeBookmarkLocator(body.editionId, body.blockIndex) || state.paragraphIndex !== 0 || state.completed !== body.completed)) throw Error('Invalid saved reading receipt');
    const response = parseReadingProgressResponse({ memberId: auth.memberId, progress: [state] }, body.bookId);
    if (!response) throw Error('Invalid saved reading receipt');
    return privateJson(response);
  } catch { return failure(503, 'Failed to save reading progress'); }
}
