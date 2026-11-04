// Narrow RPC-boundary fixture for the inherited G17 HTTP assertions. This is
// not a database/locking simulation; the root PostgreSQL suite proves atomic
// authorization, receipts, capacity, revisions and race behavior.
import type { FakeDb } from '../../security/fakes';
import { CIRCLE_BOOK_ID } from '../../../lib/circles/path';
import { upcomingMeetings, todayIn, TIMEZONES, type CircleInput } from '../../../lib/circles/schedule';
import { createHash } from 'node:crypto';
import { toPublicCircle, type CircleRow } from '../../../lib/circles/server';
import { discoverCircles } from '../../../lib/circles/discovery';

export function installCircleMembershipRpc(db: FakeDb) {
  Reflect.set(db, 'rpc', async (name: string, args: Record<string, unknown>) => {
    const fail = (code: string) => ({ data: null, error: { code } });
    if (name === 'soe_circle_discovery_search') return discoveryRpcFixture(db, args);
    if (name === 'soe_circle_create') {
      const input = args.p_input as CircleInput;
      const id = `99999999-9999-4999-8999-${String(++db.seq).padStart(12, '0')}`;
      db.rows('book_cohorts').push({ id, book_id: CIRCLE_BOOK_ID, title: input.title, description: input.description,
        max_members: input.maxMembers, start_date: input.startDate, status: 'forming', created_by: args.p_actor,
        created_at: new Date().toISOString(), circle_format: input.format, circle_city: input.city, circle_region: input.region,
        circle_venue_name: input.venueName, circle_venue_type: input.venueType, circle_weekday: input.weekday,
        circle_time: input.time, circle_timezone: input.timezone, circle_hidden: false, circle_participation_revision: 0 });
      db.rows('book_cohort_members').push({ cohort_id: id, member_id: args.p_actor });
      if (input.onlineUrl) db.rows('circle_private').push({ cohort_id: id, online_url: input.onlineUrl });
      return { data: { requestId: args.p_request_id, circleId: id, receipt: { action: 'create', joined: true, completed: false, date: null, status: null },
        state: { revision: 0, isMember: true, isHost: true, hidden: false, completed: false, ended: false,
          canJoin: false, canLeave: true, canRsvp: true, canComplete: true, canReadConversation: true }, replayed: false }, error: null };
    }
    const circle = db.rows('book_cohorts').find(row => row.id === args.p_circle_id && row.book_id === CIRCLE_BOOK_ID);
    if (!circle) return fail('PT404');
    const member = db.rows('book_cohort_members').some(row => row.cohort_id === circle.id && row.member_id === args.p_actor);
    const host = circle.created_by === args.p_actor;
    const dates = upcomingMeetings(circle.start_date, circle.circle_weekday, circle.circle_timezone, 4);
    const revision = circle.circle_participation_revision ?? 0;
    const caps = { canJoin: Boolean(args.p_actor) && !member, canLeave: member, canRsvp: member,
      canComplete: host, canReadConversation: member };
    if (name === 'soe_circle_detail') return { data: { circle: { ...circle, circle_reading_program: circle.circle_reading_program ?? null }, memberCount: db.rows('book_cohort_members').filter(row => row.cohort_id === circle.id).length,
      hostName: db.rows('members').find(row => row.id === circle.created_by)?.display_name ?? null, revision, ended: false,
      meetings: dates.map(date => ({ date, going: db.rows('circle_rsvps').filter(row => row.cohort_id === circle.id && row.meeting_date === date && row.status === 'going').length,
        my_status: db.rows('circle_rsvps').find(row => row.cohort_id === circle.id && row.meeting_date === date && row.member_id === args.p_actor)?.status ?? null })),
      viewer: { signed_in: Boolean(args.p_actor), is_member: member, is_host: host }, capabilities: caps,
      online_url: member ? db.rows('circle_private').find(row => row.cohort_id === circle.id)?.online_url ?? null : null }, error: null };
    if (name === 'soe_circle_rsvp') {
      if (!member) return fail('PT403');
      if (!dates.includes(String(args.p_date))) return fail('PT400');
      if (args.p_expected_revision !== revision) return fail('PT409');
      const row = db.rows('circle_rsvps').find(item => item.cohort_id === circle.id && item.member_id === args.p_actor && item.meeting_date === args.p_date);
      if (row) row.status = args.p_status;
      else db.rows('circle_rsvps').push({ cohort_id: circle.id, member_id: args.p_actor, meeting_date: args.p_date, status: args.p_status });
      circle.circle_participation_revision = revision + 1;
      return { data: { requestId: args.p_request_id, circleId: circle.id,
        receipt: { action: 'rsvp', joined: true, completed: false, date: args.p_date, status: args.p_status },
        state: { revision: revision + 1, isMember: member, isHost: host, hidden: false, completed: false, ended: false, ...caps }, replayed: false }, error: null };
    }
    return fail('PGRST202');
  });
}


// A wire-boundary adapter for the unchanged G17 assertions and G20 contract
// tests. It deliberately does not simulate SQL snapshots/normalization/RLS;
// actual discovery SQL is exercised by the root HTTP and PostgreSQL suites.
function discoveryRpcFixture(db: FakeDb, args: Record<string, unknown>) {
  const now = new Date();
  const calendarKey = createHash('sha256').update(JSON.stringify(Object.keys(TIMEZONES).map(zone => [zone, todayIn(zone, now)]))).digest('hex');
  if (args.p_calendar_key !== null && args.p_calendar_key !== calendarKey) return { data: null, error: { code: 'PT409' } };
  const input = args.p_query as { terms: string[]; cityTerms: string[]; format: '' | 'online' | 'in_person'; open: boolean;
    sort: 'next' | 'title'; book: string | null; edition: string | null };
  const query = { q: input.terms.join(' '), city: input.cityTerms.join(' '), format: input.format, open: input.open, sort: input.sort,
    ...(input.book ? { book: input.book, edition: input.edition! } : {}) };
  const rawRows = db.rows('book_cohorts').filter(row => row.book_id === CIRCLE_BOOK_ID && row.circle_hidden === false && row.status !== 'completed');
  const publicRows = rawRows.map(raw => {
    const row = { ...raw, circle_path_id: raw.circle_path_id ?? 'starter-12', circle_reading_program: raw.circle_reading_program ?? null } as unknown as CircleRow;
    const rawName = String(db.rows('members').find(member => member.id === raw.created_by)?.display_name ?? '').trim();
    let name = '';
    if (!rawName.includes('@') && !/[\u0000-\u001f\u007f]/u.test(rawName)) for (const character of rawName) {
      if (name.length + character.length > 40) break;
      name += character;
    }
    return toPublicCircle(row, { memberCount: db.rows('book_cohort_members').filter(member => member.cohort_id === raw.id).length,
      hostName: name || 'An explorer' }, now);
  }).filter(circle => circle.status !== 'completed');
  const folded = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('en-US');
  const after = args.p_after as { nextMeeting: string; title: string; id: string } | null;
  const compare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
  const circles = discoverCircles(publicRows, query).filter(circle => !after ||
    ((input.sort === 'next' ? compare(circle.next_meeting!, after.nextMeeting) : 0)
      || compare(folded(circle.title), folded(after.title)) || compare(circle.id, after.id)) > 0);
  const limit = args.p_limit as number;
  const page = circles.slice(0, limit);
  const items = page.map(circle => {
    const raw = rawRows.find(row => row.id === circle.id)!;
    return { circle: { ...raw, circle_path_id: raw.circle_path_id ?? 'starter-12', circle_reading_program: raw.circle_reading_program ?? null },
      memberCount: circle.member_count, hostName: circle.host_name, nextMeeting: circle.next_meeting, firstMeeting: circle.first_meeting,
      week: circle.week, programLength: circle.program_length, phase: circle.first_meeting > todayIn(circle.timezone, now) ? 'upcoming' : 'in_progress' };
  });
  const last = page.at(-1);
  return { data: { asOf: now.toISOString(), calendarKey, items, limit,
    next: circles.length > limit && last ? { nextMeeting: last.next_meeting, title: last.title, id: last.id } : null }, error: null };
}
