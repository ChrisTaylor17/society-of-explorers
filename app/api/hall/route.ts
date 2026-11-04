import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { privateJson } from '@/lib/http/routeError';
import { HALL_PAGE_LIMIT, PUBLIC_HALL_SELECT, parseHallQuery, parsePublicHallRow, type PublicHallPage } from '@/lib/hall/public';

export const dynamic = 'force-dynamic';
const unavailable = () => privateJson({ error: 'Hall unavailable.' }, { status: 503 });

export async function GET(request: Request) {
  const query = parseHallQuery(new URL(request.url).searchParams);
  if (!query) return privateJson({ error: 'Use a supported Hall filter.' }, { status: 400 });
  const controller = new AbortController();
  let active = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectAbort: (() => void) | undefined;
  const abort = () => controller.abort();
  try {
    if (request.signal.aborted) return unavailable();
    request.signal.addEventListener('abort', abort, { once: true });
    const stopped = new Promise<never>((_, reject) => {
      rejectAbort = () => reject(new Error('Hall unavailable'));
      controller.signal.addEventListener('abort', rejectAbort, { once: true });
    });
    timer = setTimeout(abort, 5000);
    const operation = (async (): Promise<PublicHallPage> => {
      let selection = getSupabaseAdmin().from('artifacts').select(PUBLIC_HALL_SELECT).eq('is_public', true);
      if (query.thinker) selection = selection.eq('thinker_id', query.thinker);
      const { data, error } = await selection
        .order('created_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false })
        .limit(HALL_PAGE_LIMIT + 1)
        .abortSignal(controller.signal);
      // Some transports ignore AbortSignal. A late result can never replace a
      // deadline/abort response or become a cached empty/successful fallback.
      if (!active || controller.signal.aborted || error || !Array.isArray(data) || data.length > HALL_PAGE_LIMIT + 1) {
        throw new Error('Hall unavailable');
      }
      const items = [], seen = new Set<string>();
      for (const row of data) {
        const item = parsePublicHallRow(row);
        if (!item || seen.has(item.id) || (query.thinker && item.thinker_id !== query.thinker)) throw new Error('Hall unavailable');
        seen.add(item.id); items.push(item);
      }
      return { items: items.slice(0, HALL_PAGE_LIMIT), page: { limit: HALL_PAGE_LIMIT, hasMore: items.length > HALL_PAGE_LIMIT } };
    })();
    const result = await Promise.race([operation, stopped]);
    if (!active || controller.signal.aborted) return unavailable();
    return privateJson(result);
  } catch {
    return unavailable();
  } finally {
    active = false;
    if (timer) clearTimeout(timer);
    request.signal.removeEventListener('abort', abort);
    if (rejectAbort) controller.signal.removeEventListener('abort', rejectAbort);
  }
}
