// Pure browser/server contract. Public text never carries member identity,
// creation prompts, conversation context, media locations or internal dates.
export const HALL_THINKERS = ['socrates', 'plato', 'nietzsche', 'aurelius', 'einstein', 'jobs'] as const;
export type HallThinker = typeof HALL_THINKERS[number];
export const HALL_PAGE_LIMIT = 48 as const;
export const PUBLIC_HALL_SELECT = 'id,thinker_id,title,description,philosophical_note,is_public';
export type PublicHallItem = { id: string; thinker_id: string; title: string; description: string | null; philosophical_note: string | null };
export type PublicHallPage = { items: PublicHallItem[]; page: { limit: 48; hasMore: boolean } };

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function plain(value: unknown, limit: number, singleLine = false): value is string {
  return typeof value === 'string' && value.length <= limit &&
    !(singleLine ? /[\u0000-\u001f\u007f]/ : /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/).test(value) &&
    !/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(value);
}
function parseItem(value: unknown): PublicHallItem | null {
  if (!record(value) || typeof value.id !== 'string' || !UUID.test(value.id) ||
      !plain(value.thinker_id, 100, true) || !value.thinker_id.trim() ||
      !plain(value.title, 200, true) || !value.title.trim() ||
      (value.description !== null && !plain(value.description, 2000)) ||
      (value.philosophical_note !== null && !plain(value.philosophical_note, 2000))) return null;
  return { id: value.id.toLowerCase(), thinker_id: value.thinker_id, title: value.title,
    description: value.description, philosophical_note: value.philosophical_note };
}

/** The selected flag is proof only; missing/null/truthy values never publish. */
export function parsePublicHallRow(value: unknown): PublicHallItem | null {
  return record(value) && value.is_public === true ? parseItem(value) : null;
}

/** Reconstruct the same text-only DTO when receiving an untrusted HTTP body. */
export function parsePublicHallPage(value: unknown): PublicHallPage | null {
  if (!record(value) || !Array.isArray(value.items) || value.items.length > HALL_PAGE_LIMIT ||
      !record(value.page) || value.page.limit !== HALL_PAGE_LIMIT || typeof value.page.hasMore !== 'boolean' ||
      (value.page.hasMore && value.items.length !== HALL_PAGE_LIMIT)) return null;
  const items: PublicHallItem[] = [], seen = new Set<string>();
  for (const row of value.items) {
    const item = parseItem(row);
    if (!item || seen.has(item.id)) return null;
    seen.add(item.id); items.push(item);
  }
  return { items, page: { limit: HALL_PAGE_LIMIT, hasMore: value.page.hasMore } };
}

export function parseHallQuery(params: URLSearchParams): { thinker: HallThinker | null } | null {
  if ([...params.keys()].some(key => key !== 'thinker')) return null;
  const values = params.getAll('thinker');
  if (!values.length) return { thinker: null };
  return values.length === 1 && (HALL_THINKERS as readonly string[]).includes(values[0])
    ? { thinker: values[0] as HallThinker } : null;
}
