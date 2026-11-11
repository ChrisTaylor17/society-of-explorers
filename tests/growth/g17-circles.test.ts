// G17: SoE Circles. Pure schedule/validation helpers, the 12-week path data, the
// circle API routes against the offline FakeDb, and the page conventions
// (12px minimum text, no site-name suffix in titles). No network.
import { describe, expect, test, beforeEach } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { installMocks, resetDb, makeReq, db, ADA, JULES, walletCookie } from '../security/fakes';
import { selectedCookies } from '../security/auth-request';
import { installCircleMembershipRpc } from './fixtures/circle-membership-rpc';

process.env.NEXTAUTH_SECRET = 's'.repeat(48);
installMocks();

const schedule = await import('../../lib/circles/schedule.ts');
const { CIRCLE_PATH, CIRCLE_BOOK_ID, getReading, WEEKLY_LOOP } = await import('../../lib/circles/path.ts');
const server = await import('../../lib/circles/server.ts');
const list = await import('../../app/api/circles/route.ts');
const one = await import('../../app/api/circles/[circleId]/route.ts');
const rsvp = await import('../../app/api/circles/[circleId]/rsvp/route.ts');
const report = await import('../../app/api/circles/report/route.ts');
const salons = await import('../../app/api/book-salons/route.ts');

const root = join(import.meta.dir, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const NOW = new Date('2026-10-27T16:00:00Z'); // a Tuesday, 12:00 ET
const CIRCLE = '33333333-3333-4333-8333-333333333333';
const BOB = '44444444-4444-4444-8444-444444444444';
const CARA = '55555555-5555-4555-8555-555555555555';

const base = {
  title: 'Tuesday Readers', format: 'in_person', venueType: 'library', city: 'Boston', venueName: 'Main Library',
  weekday: 2, time: '19:00', timezone: 'America/New_York', startDate: '2026-11-03', maxMembers: 8,
};

describe('validateCircleInput', () => {
  const v = (o: Record<string, unknown>) => schedule.validateCircleInput({ ...base, ...o }, NOW);
  test('accepts a valid in-person circle', () => {
    const r = v({});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.onlineUrl).toBeNull();
  });
  test('in person needs city and venue; homes are not a venue type', () => {
    expect(v({ city: '' }).ok).toBe(false);
    expect(v({ venueName: '' }).ok).toBe(false);
    expect(v({ venueType: 'home' }).ok).toBe(false);
    expect(v({ venueType: 'online' }).ok).toBe(false);
  });
  test('online needs an https link; http and credentials are rejected', () => {
    expect(v({ format: 'online', onlineUrl: '' }).ok).toBe(false);
    expect(v({ format: 'online', onlineUrl: 'http://meet.example.com/x' }).ok).toBe(false);
    expect(v({ format: 'online', onlineUrl: 'https://u:p@meet.example.com/x' }).ok).toBe(false);
    const r = v({ format: 'online', onlineUrl: 'https://meet.example.com/abc', venueName: 'ignored' });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.value.venueType).toBe('online'); expect(r.value.venueName).toBeNull(); }
  });
  test('time, weekday, zone and start-date window', () => {
    expect(v({ time: '7pm' }).ok).toBe(false);
    expect(v({ weekday: 7 }).ok).toBe(false);
    expect(v({ timezone: 'Mars/Base' }).ok).toBe(false);
    expect(v({ startDate: '2026-10-26' }).ok).toBe(false);
    expect(v({ startDate: '2027-06-01' }).ok).toBe(false);
    expect(v({ startDate: '2026-02-30' }).ok).toBe(false);
    expect(v({ startDate: '2026-10-27' }).ok).toBe(true);
  });
  test('size is clamped to 3..12', () => {
    const lo = v({ maxMembers: 1 }); const hi = v({ maxMembers: 99 });
    expect(lo.ok && lo.value.maxMembers).toBe(3);
    expect(hi.ok && hi.value.maxMembers).toBe(12);
  });
});

describe('schedule helpers', () => {
  test('formatMeeting', () => {
    expect(schedule.formatMeeting(2, '19:00', 'America/New_York')).toBe('Tuesdays · 7:00 PM ET');
  });
  test('first meeting is the first matching weekday on or after start', () => {
    expect(schedule.firstMeeting('2026-11-01', 2)).toBe('2026-11-03');
    expect(schedule.firstMeeting('2026-11-03', 2)).toBe('2026-11-03');
  });
  test('upcoming meetings are weekly and start today when today matches', () => {
    expect(schedule.upcomingMeetings('2026-10-01', 2, 'America/New_York', 4, NOW)).toEqual(['2026-10-27', '2026-11-03', '2026-11-10', '2026-11-17']);
  });
  test('path week counts from the first meeting', () => {
    expect(schedule.pathWeek('2026-11-03', 2, '2026-11-03')).toBe(1);
    expect(schedule.pathWeek('2026-11-03', 2, '2026-11-17')).toBe(3);
  });
});

describe('12-week path', () => {
  test('twelve weeks, numbered, unique slugs, full guides', () => {
    expect(CIRCLE_PATH.length).toBe(12);
    expect(CIRCLE_PATH.map((r) => r.week)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(new Set(CIRCLE_PATH.map((r) => r.slug)).size).toBe(12);
    for (const r of CIRCLE_PATH) {
      expect(r.questions.length).toBeGreaterThanOrEqual(3);
      expect(r.context.length).toBeGreaterThan(80);
      expect(r.counterpoint.length).toBeGreaterThan(40);
      expect(r.practice.length).toBeGreaterThan(20);
    }
    expect(getReading(13)).toBeUndefined();
    expect(WEEKLY_LOOP.reduce((s, x) => s + x.minutes, 0)).toBe(90);
  });
  test('every source is an https public-domain host', () => {
    for (const r of CIRCLE_PATH) {
      expect(r.sources.length).toBeGreaterThan(0);
      for (const s of r.sources) expect(s.url).toMatch(/^https:\/\/(www\.gutenberg\.org|avalon\.law\.yale\.edu)\//);
    }
  });
});

// ---- API routes -------------------------------------------------------------
const members = [
  { id: ADA, display_name: 'Ada' }, { id: JULES, display_name: 'jules@example.test' },
  { id: BOB, display_name: 'Bob' }, { id: CARA, display_name: 'Cara' },
];
function circleRow(over: Record<string, unknown> = {}) {
  return {
    id: CIRCLE, book_id: CIRCLE_BOOK_ID, title: 'Tuesday Readers', description: null, max_members: 8,
    start_date: schedule.todayIn('America/New_York'), status: 'forming', created_by: ADA, created_at: '2026-10-01T00:00:00Z',
    circle_format: 'hybrid', circle_city: 'Boston', circle_region: 'MA', circle_venue_name: 'Main Library',
    circle_venue_type: 'library', circle_weekday: new Date().getDay(), circle_time: '19:00', circle_timezone: 'America/New_York',
    circle_hidden: false, ...over,
  };
}
function seed(extra: Record<string, any[]> = {}) {
  server.resetCircleSchemaCache();
  const fixture = resetDb({
    members,
    book_cohorts: [circleRow(), { id: '77777777-7777-4777-8777-777777777770', book_id: 'republic', title: 'Republic salon', status: 'forming', max_members: 8, book_cohort_members: [{ count: 0 }] }],
    book_cohort_members: [{ cohort_id: CIRCLE, member_id: ADA }],
    circle_private: [{ cohort_id: CIRCLE, online_url: 'https://meet.example.com/secret' }],
    circle_rsvps: [], circle_reports: [],
    ...extra,
  });
  installCircleMembershipRpc(fixture);
  return fixture;
}
const ip = (n: number) => ({ 'x-forwarded-for': `203.0.113.${n}` });
async function req(body: any, member?: string, url = 'http://localhost/api/circles', headers: Record<string, string> = ip(1)) {
  return makeReq(body, { url, headers: { origin: 'http://localhost', ...headers }, cookies: member ? { ...selectedCookies('wallet', member), soe_wallet_id: await walletCookie(member) } : {} });
}
let requestSequence = 0;
const keyed = (body: Record<string, unknown>, expectedRevision?: number, expectedMemberId = ADA) => ({ ...body, expectedMemberId,
  requestId: `aaaaaaaa-aaaa-4aaa-8aaa-${String(++requestSequence).padStart(12, '0')}`,
  ...(expectedRevision === undefined ? {} : { expectedRevision }) });
const createBody = (body: Record<string, unknown>, actor: string) => {
  const parsed = schedule.validateCircleInput(body, new Date(`${body.startDate}T12:00:00Z`));
  if (!parsed.ok) throw Error('Invalid synthetic Circle listing');
  return keyed(parsed.value, undefined, actor);
};
const P = (circleId: string) => ({ params: Promise.resolve({ circleId }) });
function schemaMissing() {
  Reflect.set(db, 'rpc', async () => ({ data: null, error: { code: 'PGRST202' } }));
  const orig = db.from.bind(db);
  (db as any).from = (t: string) => (t.startsWith('circle_')
    ? { select: () => ({ limit: async () => ({ data: null, error: { code: '42P01', message: 'relation does not exist' } }) }) }
    : orig(t));
}

describe('circle API', () => {
  beforeEach(() => { seed(); });

  test('GET /api/circles reports ready:false with an empty list when the migration is not applied', async () => {
    schemaMissing();
    const res = await list.GET(await req(undefined));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ready: false, circles: [] });
  });

  test('GET lists circles without private links and excludes hidden circles', async () => {
    db.rows('book_cohorts').push(circleRow({ id: '66666666-6666-4666-8666-666666666666', circle_hidden: true, title: 'Hidden' }));
    const res = await list.GET(await req(undefined));
    const data = await res.json();
    expect(data.ready).toBe(true);
    expect(data.circles.map((c: any) => c.title)).toEqual(['Tuesday Readers']);
    expect(JSON.stringify(data)).not.toContain('meet.example.com');
    expect(data.circles[0].host_name).toBe('Ada');
  });

  test('POST requires sign-in, then the schema', async () => {
    expect((await list.POST(await req(createBody(base, BOB)))).status).toBe(401);
    schemaMissing();
    expect((await list.POST(await req(createBody({ ...base, startDate: schedule.todayIn('America/New_York') }, BOB), BOB))).status).toBe(503);
  });

  test('POST creates a circle, adds the host and keeps the video link in circle_private', async () => {
    const res = await list.POST(await req(createBody({ ...base, format: 'hybrid', onlineUrl: 'https://meet.example.com/new', startDate: schedule.todayIn('America/New_York') }, CARA), CARA));
    expect(res.status).toBe(200);
    const id = (await res.json()).circleId;
    const row = db.rows('book_cohorts').find((r) => r.id === id)!;
    expect(row.book_id).toBe(CIRCLE_BOOK_ID);
    expect(row.created_by).toBe(CARA);
    expect(JSON.stringify(row)).not.toContain('meet.example.com');
    expect(db.rows('book_cohort_members').some((m) => m.cohort_id === id && m.member_id === CARA)).toBe(true);
    expect(db.rows('circle_private').find((p) => p.cohort_id === id)?.online_url).toBe('https://meet.example.com/new');
  });

  test('detail shows the video link to members only', async () => {
    const anon = await (await one.GET(await req(undefined), P(CIRCLE))).json();
    expect(anon.online_url).toBeNull();
    expect(anon.viewer).toEqual({ signed_in: false, is_member: false, is_host: false });
    const outsider = await (await one.GET(await req(undefined, BOB), P(CIRCLE))).json();
    expect(outsider.online_url).toBeNull();
    const host = await (await one.GET(await req(undefined, ADA), P(CIRCLE))).json();
    expect(host.online_url).toBe('https://meet.example.com/secret');
    expect(host.viewer.is_host).toBe(true);
    expect(host.meetings.length).toBe(4);
    expect((await one.GET(await req(undefined), P('nope'))).status).toBe(400);
    expect((await one.GET(await req(undefined), P('77777777-7777-4777-8777-777777777777'))).status).toBe(404);
  });

  test('RSVP: auth, membership and date are enforced; a second RSVP updates the first', async () => {
    const dates = schedule.upcomingMeetings(circleRow().start_date as string, circleRow().circle_weekday as number, 'America/New_York', 4);
    const url = `http://localhost/api/circles/${CIRCLE}/rsvp`;
    expect((await rsvp.POST(await req(keyed({ date: dates[0], status: 'going' }, 0), undefined, url), P(CIRCLE))).status).toBe(401);
    expect((await rsvp.POST(await req(keyed({ date: dates[0], status: 'going' }, 0, BOB), BOB, url), P(CIRCLE))).status).toBe(403);
    expect((await rsvp.POST(await req(keyed({ date: '2030-01-01', status: 'going' }, 0), ADA, url), P(CIRCLE))).status).toBe(400);
    expect((await rsvp.POST(await req(keyed({ date: dates[0], status: 'maybe' }, 0), ADA, url), P(CIRCLE))).status).toBe(400);
    const ok = await rsvp.POST(await req(keyed({ date: dates[1], status: 'going' }, 0), ADA, url), P(CIRCLE));
    expect(ok.status).toBe(200);
    expect((await ok.json()).receipt.status).toBe('going');
    const refreshed = await (await one.GET(await req(undefined, ADA), P(CIRCLE))).json();
    expect(refreshed.meetings.find((meeting: { date: string }) => meeting.date === dates[1]).going).toBe(1);
    await rsvp.POST(await req(keyed({ date: dates[1], status: 'not_going' }, 1), ADA, url), P(CIRCLE));
    const rows = db.rows('circle_rsvps').filter((r) => r.member_id === ADA);
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe('not_going');
  });

  test('report route validates and delegates to one atomic RPC; threshold behavior is tested against PostgreSQL', async () => {
    const url = 'http://localhost/api/circles/report';
    const requestId = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
    const originalRpc = db.rpc;
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    db.rpc = async (name: string, args: Record<string, unknown>) => { calls.push({ name, args }); return { data: { received: true }, error: null }; };
    try {
      expect((await report.POST(await req({ circleId: CIRCLE, requestId, reason: 'nope' }, undefined, url, { origin: 'http://localhost' }))).status).toBe(400);
      const response = await report.POST(await req({ circleId: CIRCLE, requestId, reason: 'spam' }, BOB, url, { origin: 'http://localhost' }));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ received: true });
      expect(calls.length).toBe(1);
      expect(calls[0].name).toBe('soe_circle_report');
      expect(calls[0].args.p_actor).toBe(BOB);
      expect(calls[0].args.p_request_id).toBe(requestId);
      expect(calls[0].args.p_reporter_key).toBeNull();
      expect(db.rows('circle_reports').length).toBe(0); // No sequential REST-write fallback.
      expect(db.rows('book_cohorts').find((row) => row.id === CIRCLE)!.circle_hidden).toBe(false);
    } finally { db.rpc = originalRpc; }
  });

  test('book salons never list or create circle rows', async () => {
    const data = await (await salons.GET(await req(undefined, undefined, 'http://localhost/api/book-salons'))).json();
    expect(data.cohorts.map((c: any) => c.book_id)).toEqual(['republic']);
    const res = await salons.POST(await req({ bookId: CIRCLE_BOOK_ID, title: 'Sneaky circle' }, BOB, 'http://localhost/api/book-salons'));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// ---- Page conventions -------------------------------------------------------
function walk(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((f) => {
    const p = `${dir}/${f}`;
    return statSync(join(root, p)).isDirectory() ? walk(p) : p.endsWith('.tsx') || p.endsWith('.ts') ? [p] : [];
  });
}
const circleFiles = [...walk('app/circles'), 'lib/circles/ui.ts'];

describe('circle pages', () => {
  test('all routes exist', () => {
    for (const f of ['page.tsx', 'start/page.tsx', '[circleId]/page.tsx', 'path/page.tsx', 'path/[week]/page.tsx', 'host/page.tsx', 'norms/page.tsx']) {
      expect(circleFiles).toContain(`app/circles/${f}`);
    }
  });
  test.each(circleFiles)('%s has no text under 12px', (f) => {
    for (const m of read(f).matchAll(/fontSize: '(\d+)px'/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(12);
  });
  test.each(circleFiles.filter((f) => f.endsWith('page.tsx')))('%s title has no site-name suffix', (f) => {
    expect(read(f)).not.toMatch(/^\s+title: [`'"][^\n]*Society of Explorers/m);
  });
  test('no fake circles: the only sample is labelled as an example', () => {
    const src = read('app/circles/CirclesBrowser.tsx');
    expect(src).toContain('EXAMPLE · NOT A REAL CIRCLE');
  });
  test('circle routes are public in the sitemap and nav', () => {
    expect(read('app/sitemap.ts')).toContain("'/circles'");
    expect(read('components/PublicNav.tsx')).toContain("h: '/circles'");
  });
});
