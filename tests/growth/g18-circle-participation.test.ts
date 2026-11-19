// Actual shared core and route, fictional in-memory members only. No network.
import { test, expect, beforeEach } from 'bun:test';
import { installMocks, resetDb, makeReq, db, ADA, JULES } from '../security/fakes';
import { selectedCookies } from '../security/auth-request';
import { CIRCLE_BOOK_ID } from '../../lib/circles/path';
import { createCircleDiscussionComposer } from '../../lib/circles/discussion-composer';
import { installCircleMessageRpc } from './fixtures/circle-message-rpc';
installMocks();
const route = await import('../../app/api/book-salons/[cohortId]/route');
const CIRCLE = '33333333-3333-4333-8333-333333333333';
const context = { params: Promise.resolve({ cohortId: CIRCLE }) };
beforeEach(() => {
  process.env.NEXTAUTH_SECRET = 'OFFLINE_FIXTURE_ONLY_'.repeat(4);
  Reflect.set(globalThis, '__authUser', { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' });
  resetDb({
    members: [{ id: ADA, supabase_auth_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', display_name: 'Ada' }, { id: JULES, supabase_auth_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', display_name: 'Jules' }],
    book_cohorts: [{ id: CIRCLE, book_id: CIRCLE_BOOK_ID, title: 'Fictional circle', circle_hidden: false }],
    book_cohort_members: [{ id: 'original-membership', cohort_id: CIRCLE, member_id: JULES }], seminar_messages: [],
  });
  installCircleMessageRpc(db);
});
test('G18 authentic member binding confirms a scoped Circle post and refreshes it', async () => {
  const composer = createCircleDiscussionComposer({ send: async (_, content) => {
    const r = await route.POST(makeReq({ content, memberId: ADA }, { headers: { origin: 'http://localhost' }, cookies: selectedCookies('supabase', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') }), context); return { http: r.status, body: await r.json() };
  } }, CIRCLE);
  const initial = await route.GET(makeReq(undefined, { cookies: selectedCookies('supabase', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') }), context); expect(initial.status).toBe(200);
  composer.access(true, 1); composer.edit('A fictional contribution.'); expect(await composer.send()).toBe('confirmed');
  expect(composer.model().draft).toBe(''); expect(db.rows('seminar_messages')[0].member_id).toBe(JULES);
  const updated = await route.GET(makeReq(undefined, { cookies: selectedCookies('supabase', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') }), context); expect((await updated.json()).messages[0].content).toBe('A fictional contribution.');
  composer.dispose();
});
test('G18 hidden Circle refuses a post before any write', async () => {
  db.rows('book_cohorts')[0].circle_hidden = true;
  const r = await route.POST(makeReq({ content: 'hello' }, { headers: { origin: 'http://localhost' }, cookies: selectedCookies('supabase', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') }), context);
  expect(r.status).toBe(404); expect((await r.json()).outcome).toBe('not_attempted'); expect(db.rows('seminar_messages').length).toBe(0);
});
test('G18 lost confirmation never resends and requires a fresh read plus an explicit new-message choice', async () => {
  let calls = 0;
  const composer = createCircleDiscussionComposer({ send: async () => { calls++; throw Error('FICTIONAL_RESPONSE_LOST'); } }, CIRCLE);
  composer.access(true, 1); composer.edit('hello'); expect(await composer.send()).toBe('unknown');
  expect(await composer.send()).toBe('ignored'); expect(composer.startNewAfterReview()).toBe(false);
  composer.access(false, 1); composer.access(true, 2); expect(composer.startNewAfterReview()).toBe(true);
  expect(composer.model().draft).toBe(''); expect(calls).toBe(1); composer.dispose();
});
