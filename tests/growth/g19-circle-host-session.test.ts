// Public fictional fixtures; shared host lifecycle, no provider/network account.
import { test, expect, beforeEach } from 'bun:test';
import { installMocks, resetDb, makeReq, db, ADA, JULES } from '../security/fakes';
import { selectedCookies } from '../security/auth-request';
import { CIRCLE_BOOK_ID } from '../../lib/circles/path';
import { createCircleParticipationSession } from '../../lib/circles/participation-session';
import { installCircleMessageRpc } from './fixtures/circle-message-rpc';
installMocks();
const route = await import('../../app/api/book-salons/[cohortId]/route');
const circleId = '33333333-3333-4333-8333-333333333333';
const context = { params: Promise.resolve({ cohortId: circleId }) };
beforeEach(() => {
  process.env.NEXTAUTH_SECRET = 'OFFLINE_FIXTURE_ONLY_'.repeat(4);
  Reflect.set(globalThis, '__authUser', { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' });
  resetDb({ members: [{ id: ADA, display_name: 'Ada' }, { id: JULES, supabase_auth_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', display_name: 'Jules' }],
    book_cohorts: [{ id: circleId, book_id: CIRCLE_BOOK_ID, title: 'Fictional circle', circle_hidden: false }],
    book_cohort_members: [{ id: 'membership-original', cohort_id: circleId, member_id: JULES }], seminar_messages: [] });
  installCircleMessageRpc(db);
});
const request = async (_: string, options: { method: 'GET' | 'POST'; body?: string }, guard: () => boolean) => {
  if (!guard()) throw Error('retired');
  const r = options.method === 'GET' ? await route.GET(makeReq(undefined, { cookies: selectedCookies('supabase', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') }), context) : await route.POST(makeReq(JSON.parse(options.body!), { headers: { origin: 'http://localhost' }, cookies: selectedCookies('supabase', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') }), context);
  return { http: r.status, body: await r.json() };
};
test('G19 host session wires authenticated read/post/refresh automatically', async () => {
  const session = createCircleParticipationSession(request, circleId);
  expect(session.edit('early')).toBe(false); await session.open(); session.edit('hello');
  expect(await session.post()).toBe('confirmed'); expect(session.model().read.conversation?.messages[0].content).toBe('hello');
  expect(db.rows('seminar_messages')[0].member_id).toBe(JULES); session.dispose();
});
test('G19 every retirement snapshot has both private views cleared', async () => {
  const session = createCircleParticipationSession(request, circleId); await session.open(); session.edit('private');
  const views: ReturnType<typeof session.model>[] = []; const off = session.subscribe(value => views.push(value)); views.length = 0;
  session.retire(); expect(views.length).toBeGreaterThan(0);
  expect(views.every(value => value.read.conversation === null && value.write.draft === '')).toBe(true); off(); session.dispose();
});
test('G19 activity return does not restore writing access before a fresh read', async () => {
  const session = createCircleParticipationSession(request, circleId); await session.open(); session.activity(false); session.activity(true);
  expect(session.model().write.canEdit).toBe(false); expect(session.model().read.conversation).toBe(null);
  await session.refresh(); expect(session.model().write.canEdit).toBe(true); session.dispose();
});
test('G19 disposed host cannot send or reopen', async () => {
  const session = createCircleParticipationSession(request, circleId); await session.open(); session.edit('private'); session.dispose();
  await session.open(); expect(await session.post()).toBe('ignored'); expect(session.model().write.draft).toBe(''); expect(db.rows('seminar_messages').length).toBe(0);
});
