// G20: public discovery/query and service-RPC wire behavior. All members and
// rows are fictional; actual SQL completeness/snapshot tests live at root.
import { beforeEach, describe, expect, test } from 'bun:test';
import { ADA, db, FakeDb, installMocks, makeReq, resetDb } from '../security/fakes';

installMocks();
const { installCircleMembershipRpc } = await import('./fixtures/circle-membership-rpc');
const { CIRCLE_BOOK_ID } = await import('../../lib/circles/path');
const { todayIn } = await import('../../lib/circles/schedule');
const { resetCircleSchemaCache, toPublicCircle } = await import('../../lib/circles/server');
const { DEFAULT_DISCOVERY_QUERY, parseDiscoveryQuery, discoverySearchParams, discoverCircles } = await import('../../lib/circles/discovery');
const route = await import('../../app/api/circles/route');
type CircleRow = import('../../lib/circles/server').CircleRow;
type PublicCircle = import('../../lib/circles/server').PublicCircle;
type DiscoveryQuery = import('../../lib/circles/discovery').DiscoveryQuery;

const NOW = new Date('2026-10-27T16:00:00Z');
const id = (n: number) => `33333333-3333-4333-8333-${String(n).padStart(12, '0')}`;
function row(n = 1, extra: Partial<CircleRow> = {}) {
  return {
    id: id(n), book_id: CIRCLE_BOOK_ID, title: 'Tuesday Readers', description: 'An open, welcoming discussion', max_members: 8,
    start_date: '2026-10-27', status: 'forming', created_by: ADA, created_at: '2026-10-01T00:00:00Z',
    circle_format: 'hybrid', circle_city: 'Montréal', circle_region: 'Québec', circle_venue_name: 'Main Library',
    circle_venue_type: 'library', circle_weekday: 2, circle_time: '19:00', circle_timezone: 'America/New_York',
    circle_hidden: false, ...extra,
  };
}
function circle(n = 1, extra: Partial<PublicCircle> = {}): PublicCircle {
  return { ...toPublicCircle(row(n), { memberCount: 1, hostName: 'Adèle' }, NOW), ...extra };
}
const query = (extra: Partial<DiscoveryQuery> = {}): DiscoveryQuery => ({ ...DEFAULT_DISCOVERY_QUERY, ...extra });
function seed(rows = [row()]) {
  resetCircleSchemaCache();
  const today = todayIn('America/New_York');
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const fixture = resetDb({
    members: [{ id: ADA, display_name: 'Adèle' }],
    book_cohorts: rows.map((r) => ({ ...r, start_date: today, circle_weekday: weekday })),
    book_cohort_members: [{ cohort_id: id(1), member_id: ADA }],
    circle_private: [{ cohort_id: id(1), online_url: 'https://meet.example.test/private-link' }],
    circle_rsvps: [], circle_reports: [],
  });
  installCircleMembershipRpc(fixture);
  return fixture;
}
const get = (params = '') => route.GET(makeReq(undefined, { url: `http://localhost/api/circles${params ? `?${params}` : ''}` }));

describe('discovery query URLs', () => {
  test('normalizes lengths, controls, whitespace and unsupported options', () => {
    expect(parseDiscoveryQuery(new URLSearchParams('q=+Plato%00++Tuesday+&city=+Montreal+&format=hybrid&open=true&sort=unknown'))).toEqual(query({ q: 'Plato Tuesday', city: 'Montreal' }));
    const parsed = parseDiscoveryQuery(new URLSearchParams({ q: 'a'.repeat(200), city: 'b'.repeat(100), open: '1', sort: 'title', format: 'online' }));
    expect(parsed.q.length).toBe(160); expect(parsed.city.length).toBe(80);
    expect(parsed.open).toBe(true); expect(parsed.sort).toBe('title'); expect(parsed.format).toBe('online');
  });
  test('round trips reserved literal text without leaking unrelated URL data', () => {
    const original = query({ q: 'Plato & 100% [wisdom]', city: 'Montréal', open: true, format: 'in_person', sort: 'title' });
    const params = discoverySearchParams(original);
    expect(parseDiscoveryQuery(params)).toEqual(original);
    expect(params.get('q')).toBe('Plato & 100% [wisdom]');
    expect(discoverySearchParams(query()).toString()).toBe('');
  });
});

describe('public discovery matching and order', () => {
  test('finds each public field and requires all literal terms across fields', () => {
    const sample = circle();
    for (const q of ['Tuesday', 'welcoming', 'Adele', 'Genesis', 'King James', 'chapters', 'Tuesday Genesis Adèle']) {
      expect(discoverCircles([sample], query({ q })).map((c) => c.id)).toEqual([id(1)]);
    }
    expect(discoverCircles([sample], query({ q: 'Tuesday impossible' }))).toEqual([]);
    expect(discoverCircles([sample], query({ q: '.*' }))).toEqual([]);
    expect(discoverCircles([sample], query({ q: '%' }))).toEqual([]);
    expect(discoverCircles([sample], query({ q: 'Main Library' }))).toEqual([]);
  });
  test('city and region match with case and accents ignored and all terms required', () => {
    const sample = circle();
    expect(discoverCircles([sample], query({ city: 'QUEBEC montreal' }))).toEqual([sample]);
    expect(discoverCircles([sample], query({ city: 'Boston' }))).toEqual([]);
  });
  test('hybrid is available in both formats; open seats exclude full circles', () => {
    const samples = [circle(1, { format: 'hybrid' }), circle(2, { format: 'online' }), circle(3, { format: 'in_person', spots_left: 0 })];
    expect(discoverCircles(samples, query({ format: 'online' })).map((c) => c.id)).toEqual([id(1), id(2)]);
    expect(discoverCircles(samples, query({ format: 'in_person' })).map((c) => c.id)).toEqual([id(1), id(3)]);
    expect(discoverCircles(samples, query({ format: 'in_person', open: true })).map((c) => c.id)).toEqual([id(1)]);
  });
  test('sorts meeting dates then folded titles and ids, without mutating input', () => {
    const samples = [circle(3, { title: 'Zulu', next_meeting: '2026-11-01' }), circle(2, { title: 'Álpha', next_meeting: '2026-11-03' }), circle(1, { title: 'alpha', next_meeting: '2026-11-03' })];
    expect(discoverCircles(samples, query()).map((c) => c.id)).toEqual([id(3), id(1), id(2)]);
    expect(discoverCircles(samples, query({ sort: 'title' })).map((c) => c.id)).toEqual([id(1), id(2), id(3)]);
    expect(samples.map((c) => c.id)).toEqual([id(3), id(2), id(1)]);
  });
  test('missing reading and optional public fields remain searchable by title', () => {
    const sample = circle(1, { reading: null, description: null, city: null, region: null });
    expect(discoverCircles([sample], query({ q: 'Tuesday' }))).toEqual([sample]);
    expect(discoverCircles([sample], query({ q: 'Plato' }))).toEqual([]);
  });
});

describe('discovery API through the service-RPC wire adapter', () => {
  beforeEach(() => { seed(); });

  test('combines public literal filters and verified seats in one RPC, without table scans or private fields', async () => {
    const response = await get('q=chapters+Adele&city=montreal+quebec&format=online&open=1');
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.circles.map((c: PublicCircle) => c.id)).toEqual([id(1)]);
    expect(result.circles[0].member_count).toBe(1);
    expect(result.page.limit).toBe(25); expect(result.page.nextCursor).toBeNull();
    expect(result.inventory).toBeUndefined(); expect(result.circles[0].phase).toMatch(/^(upcoming|in_progress)$/);
    expect(JSON.stringify(result)).not.toContain('private-link'); expect(JSON.stringify(result)).not.toContain(ADA);
    expect(db.log).toEqual([]); expect(response.headers.get('cache-control')).toContain('no-store');
  });
  test('never searches private links or an email-shaped host label', async () => {
    db.rows('members')[0].display_name = 'not-public@example.test';
    expect((await (await get('q=not-public')).json()).circles).toEqual([]);
    expect((await (await get('q=private-link')).json()).circles).toEqual([]);
    expect((await (await get()).json()).circles[0].host_name).toBe('An explorer');
  });
  test('the former 201st match is searchable and every matching row is reachable through keyset pages', async () => {
    seed(Array.from({ length: 201 }, (_, n) => row(n + 1, { title: n === 200 ? 'Beyond boundary' : `Readers ${String(n).padStart(3, '0')}` })).reverse());
    const filtered = await (await get('q=Beyond')).json();
    expect(filtered.circles.map((c: PublicCircle) => c.id)).toEqual([id(201)]);
    expect(filtered.page.nextCursor).toBeNull();
    let page = await (await get()).json(); const seen = new Set<string>(); let pages = 0;
    while (true) {
      pages++; for (const circle of page.circles) { expect(seen.has(circle.id)).toBe(false); seen.add(circle.id); }
      if (!page.page.nextCursor) break;
      page = await (await get(new URLSearchParams({ cursor: page.page.nextCursor }).toString())).json();
    }
    expect(pages).toBe(9); expect(seen.size).toBe(201);
  });
  test('cursor identity binds filters and page size instead of silently broadening or restarting', async () => {
    seed([row(), row(2)]);
    const first = await (await get('limit=1')).json(); expect(first.page.nextCursor).toBeTruthy();
    expect((await get(new URLSearchParams({ limit: '1', q: 'changed', cursor: first.page.nextCursor }).toString())).status).toBe(400);
    expect((await get(new URLSearchParams({ limit: '2', cursor: first.page.nextCursor }).toString())).status).toBe(400);
  });
  test('strict duplicate, unknown, malformed page and unsupported filter URLs refuse before RPC', async () => {
    let calls = 0; Reflect.set(db, 'rpc', async () => { calls++; return { data: null, error: null }; });
    for (const params of ['q=a&q=b', 'unknown=1', 'limit=0', 'limit=26', 'limit=01', 'cursor=invalid', 'format=hybrid', 'open=true', 'sort=unknown', 'book=apology']) {
      expect((await get(params)).status).toBe(400);
    }
    expect(calls).toBe(0);
  });
  test('missing new schema is explicitly opening soon, while permission or transport errors are generic unavailable', async () => {
    for (const code of ['PGRST202', '42883', '42P01']) {
      Reflect.set(db, 'rpc', async () => ({ data: null, error: { code, message: 'private database detail' } }));
      const response = await get(); expect(response.status).toBe(200); expect(await response.json()).toEqual({ ready: false, circles: [] });
    }
    for (const code of ['42501', 'XX000']) {
      Reflect.set(db, 'rpc', async () => ({ data: null, error: { code, message: 'private database detail' } }));
      const response = await get(); expect(response.status).toBe(503); expect(JSON.stringify(await response.json())).not.toContain('private database detail');
    }
  });
  test('calendar changes require an explicit restart rather than returning an empty successful page', async () => {
    seed([row(), row(2)]); const first = await (await get('limit=1')).json();
    const cursor = JSON.parse(Buffer.from(first.page.nextCursor, 'base64url').toString('utf8')); cursor.calendarKey = '0'.repeat(64);
    const response = await get(new URLSearchParams({ limit: '1', cursor: Buffer.from(JSON.stringify(cursor)).toString('base64url') }).toString());
    expect(response.status).toBe(409); expect((await response.json()).restart_required).toBe(true);
  });
  test('malformed service counts/calendar cannot establish public seats or absence', async () => {
    const original = db.rpc.bind(db);
    Reflect.set(db, 'rpc', async (name: string, args: Record<string, unknown>) => {
      const result = await original(name, args) as { data: any; error: unknown };
      return { ...result, data: { ...result.data, items: result.data.items.map((item: any) => ({ ...item, memberCount: -1 })) } };
    });
    const response = await get('open=1'); expect(response.status).toBe(503); expect((await response.json()).circles).toEqual([]);
  });
  test('hidden, explicitly completed and unrelated salon rows stay out of discovery', async () => {
    db.rows('book_cohorts').push(row(2, { circle_hidden: true }), row(3, { status: 'completed' }), { ...row(4), book_id: 'republic' });
    expect((await (await get()).json()).circles.map((c: PublicCircle) => c.id)).toEqual([id(1)]);
  });
});

test('FakeDb preserves range offsets, primary/secondary order and exact pre-limit counts', async () => {
  const fake = new FakeDb({ sample: [{ group: 2, id: 1 }, { group: 1, id: 3 }, { group: 1, id: 2 }, { group: 2, id: 0 }] });
  const result = await fake.from('sample').select('id', { count: 'exact' }).order('group').order('id').range(1, 2);
  expect(result.data).toEqual([{ group: 1, id: 3 }, { group: 2, id: 0 }]);
  expect(result.count).toBe(4);
});
