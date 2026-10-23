// S9 (round 3): POST /api/salon-message inserted into any salon, under any sender_name /
// sender_type / thinker_id, for anyone. It must require a signed session, take the author
// from that session, and only allow posting where the caller may post:
//   - 'general': any signed-in member
//   - private-<memberId>: never via this endpoint (production only accepts general or UUID ids)
//   - any other salon: the salon's owner (salons.guide_member_id) or a salon_members row.
import { test, expect, beforeEach } from 'bun:test';
import { installMocks, resetDb, makeReq, db, ADA, JULES, walletCookie } from './fakes';

installMocks();
const SECRET = 's'.repeat(48); // synthetic test-only value
const route = await import('../../app/api/salon-message/route.ts');

const OWNED = '33333333-3333-4333-8333-333333333333';  // guide = ADA, no members rows
const CLOSED = '44444444-4444-4444-8444-444444444444'; // guide = JULES, members: JULES only

beforeEach(() => {
  process.env.NEXTAUTH_SECRET = SECRET;
  (globalThis as any).__authUser = null;
  resetDb({
    members: [{ id: ADA, display_name: 'Ada Example' }, { id: JULES, display_name: 'Jules Example' }],
    salons: [{ id: OWNED, guide_member_id: ADA, title: 'Owned' }, { id: CLOSED, guide_member_id: JULES, title: 'Closed' }],
    salon_members: [{ salon_id: CLOSED, member_id: JULES }],
    salon_messages: [],
  });
});

const post = async (body: any, member?: string) =>
  route.POST(makeReq(body, { url: 'http://localhost/api/salon-message', cookies: member ? { soe_wallet_id: await walletCookie(member) } : {} }));
const inserts = () => db.log.filter(l => l.table === 'salon_messages' && l.op === 'insert');

test('anonymous -> 401 and nothing is written', async () => {
  const res = await post({ salon_id: 'general', content: 'hi', sender_name: 'Jules Example' });
  expect(res.status).toBe(401);
  expect(inserts().length).toBe(0);
});

test('raw soe_wallet_id cookie is not identity -> 401', async () => {
  const res = await route.POST(makeReq({ salon_id: 'general', content: 'hi' }, { cookies: { soe_wallet_id: JULES } }));
  expect(res.status).toBe(401);
  expect(inserts().length).toBe(0);
});

test('author comes from the session; body sender_name/sender_type/thinker_id/member ids ignored', async () => {
  const res = await post({ salon_id: 'general', content: 'hello all', sender_name: 'Jules Example', sender_type: 'thinker', thinker_id: 'aristotle', memberId: JULES, member_id: JULES }, ADA);
  expect(res.status).toBe(200);
  const rows = db.rows('salon_messages');
  expect(rows.length).toBe(1);
  expect(rows[0].sender_name).toBe('Ada Example');
  expect(rows[0].sender_type).toBe('member');
  expect(rows[0].thinker_id ?? null).toBe(null);
  expect(rows[0].salon_id).toBe('general');
  expect(JSON.stringify(rows[0])).not.toContain(JULES);
});

test("posting into another member's private salon -> refused", async () => {
  const res = await post({ salon_id: `private-${JULES}`, content: 'intrude' }, ADA);
  expect([400, 403]).toContain(res.status);
  expect(inserts().length).toBe(0);
});

test('private-<id> salons are written only server-side (thinker/onboarding), not via this endpoint', async () => {
  const res = await post({ salon_id: `private-${ADA}`, content: 'note to self' }, ADA);
  expect([400, 403]).toContain(res.status);
  expect(inserts().length).toBe(0);
});

test('salon the caller neither owns nor belongs to -> 403', async () => {
  const res = await post({ salon_id: CLOSED, content: 'let me in' }, ADA);
  expect(res.status).toBe(403);
  expect(inserts().length).toBe(0);
});

test('salon owner (guide) may post even without a salon_members row', async () => {
  const res = await post({ salon_id: OWNED, content: 'welcome' }, ADA);
  expect(res.status).toBe(200);
});

test('listed salon member may post', async () => {
  const res = await post({ salon_id: CLOSED, content: 'member post' }, JULES);
  expect(res.status).toBe(200);
  expect(db.rows('salon_messages')[0].sender_name).toBe('Jules Example');
});

test('unknown or malformed salon id -> refused (fail closed)', async () => {
  expect([400, 403]).toContain((await post({ salon_id: 'not-a-real-salon', content: 'x' }, ADA)).status);
  expect((await post({ salon_id: '77777777-7777-4777-8777-777777777777', content: 'x' }, ADA)).status).toBe(403);
  expect(inserts().length).toBe(0);
});

test('empty or non-string content -> 400; oversized content is capped at 4000 chars (production rule)', async () => {
  expect((await post({ salon_id: 'general', content: '' }, ADA)).status).toBe(400);
  expect((await post({ salon_id: 'general', content: '   ' }, ADA)).status).toBe(400);
  expect((await post({ salon_id: 'general', content: { a: 1 } }, ADA)).status).toBe(400);
  expect(inserts().length).toBe(0);
  await post({ salon_id: 'general', content: 'x'.repeat(8001) }, ADA);
  expect(db.rows('salon_messages').every(r => String(r.content).length <= 4000)).toBe(true);
});
