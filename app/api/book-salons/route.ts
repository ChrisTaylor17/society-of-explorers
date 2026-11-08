import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { CIRCLE_BOOK_ID } from '@/lib/circles/path';
import { circleWriteOrigin, readCircleReviewJson } from '@/lib/circles/moderation-server';
import { isUuid } from '@/lib/ids/uuid';
import { BOOK_SALON_PAGE_SIZE, bookSalonListing, parseBookSalonOffset } from '@/lib/books/salon-discovery';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : null;
}

function safeKey(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const key = value.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 80);
  return key || fallback;
}

function safeMaxMembers(value: unknown): number {
  const maxMembers = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 8;
  return Math.max(2, Math.min(12, maxMembers));
}

export async function GET(req: NextRequest) {
  const query = new URL(req.url).searchParams;
  const offset = parseBookSalonOffset(query.get('offset'));
  if (offset === null || query.getAll('offset').length > 1) return privateJson({ error: 'Invalid page' }, { status: 400 });
  try {
    const { data, error, count } = await getSupabaseAdmin()
      .from('book_cohorts')
      .select('id,book_id,title,description,max_members,start_date,thinker_id,status,book_cohort_members(count)', { count: 'exact' })
      .neq('book_id', CIRCLE_BOOK_ID) // circles have their own discovery/access contract
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(offset, offset + BOOK_SALON_PAGE_SIZE - 1);
    if (error || !Array.isArray(data) || data.length > BOOK_SALON_PAGE_SIZE || !Number.isSafeInteger(count) || count === null || count < 0) throw Error('Unavailable');
    const cohorts = data.map(bookSalonListing);
    if (cohorts.some(row => row === null) || new Set(cohorts.map(row => row!.id)).size !== cohorts.length
      || (cohorts.length === 0 && offset < count) || (cohorts.length > 0 && offset + cohorts.length > count)) throw Error('Unavailable');
    return privateJson({ cohorts, page: { offset, limit: BOOK_SALON_PAGE_SIZE, total: count,
      nextOffset: offset + cohorts.length < count ? offset + cohorts.length : null } });
  } catch {
    return privateJson({ error: 'Book salon listings are temporarily unavailable' }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const originError = circleWriteOrigin(req);
  if (originError) return originError;
  const read = await readCircleReviewJson(req);
  if (!read.ok) return read.response;
  const body = read.value;
  if (!isRecord(body)) return privateJson({ error: 'Invalid body' }, { status: 400 });

  const bookId = safeKey(body.bookId, '');
  const title = boundedText(body.title, 160);
  if (!bookId || !title) return privateJson({ error: 'Missing fields' }, { status: 400 });
  if (bookId === CIRCLE_BOOK_ID) return privateJson({ error: 'Start circles from /circles/start' }, { status: 400 });
  if (!isUuid(body.requestId) || !isUuid(body.expectedMemberId)) {
    return privateJson({ error: 'Review the salon and try again' }, { status: 400 });
  }
  const requestId = body.requestId.toLowerCase();
  const startDate = boundedText(body.startDate, 40);
  if (body.startDate != null && (!startDate || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(startDate)
    || !Number.isFinite(Date.parse(startDate)) || new Date(startDate).toISOString().slice(0, 10) !== startDate.slice(0, 10))) {
    return privateJson({ error: 'Choose a valid start date' }, { status: 400 });
  }

  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });
  if (body.expectedMemberId.toLowerCase() !== auth.memberId.toLowerCase()) {
    return privateJson({ error: 'Your account changed. Reload before creating a salon.' }, { status: 409 });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin.rpc('soe_circle_legacy_salon_create', {
      p_actor: auth.memberId,
      p_request_id: requestId,
      p_input: {
        bookId, title, description: boundedText(body.description, 1_000),
        maxMembers: safeMaxMembers(body.maxMembers),
        // Keep a missing date stable across retries; SQL chooses it once.
        startDate: startDate ? new Date(startDate).toISOString() : null,
        thinkerId: safeKey(body.thinkerId, 'socrates'),
      },
    });
    if (error) {
      const status = ({ PT400: 400, PT403: 403, PT409: 409, PT410: 410 } as Record<string, number>)[error.code] || 503;
      const message = status === 400 ? 'Review the salon details and try again'
        : status === 403 ? 'This account cannot create a salon right now'
          : status === 409 || status === 410 ? 'The original request or salon changed. Reload to review it.'
            : 'Could not confirm creation. Retry without changing the form to check the same request.';
      return privateJson({ error: message }, { status });
    }
    if (!isRecord(data) || data.requestId !== requestId || data.creatorJoined !== true
      || typeof data.replayed !== 'boolean' || !isRecord(data.cohort)
      || !isUuid(data.cohort.id) || data.cohort.created_by !== auth.memberId.toLowerCase()) {
      return privateJson({ error: 'Could not confirm creation. Retry without changing the form to check the same request.' }, { status: 503 });
    }
    return privateJson({ cohort: { id: data.cohort.id, created_by: data.cohort.created_by },
      requestId, creatorJoined: true, replayed: data.replayed });
  } catch {
    return privateJson({ error: 'Could not confirm creation. Retry without changing the form to check the same request.' }, { status: 503 });
  }
}
