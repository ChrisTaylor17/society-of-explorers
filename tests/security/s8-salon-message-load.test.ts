// S8 (round 2): /api/salon-message/load returned any salon's messages to anyone,
// including private-<memberId> salons. It must require sign-in and refuse other
// members' private salons and salons the caller doesn't belong to.
import { test, expect, beforeEach } from 'bun:test';
import { installMocks, resetDb, makeReq, ADA, JULES, walletCookie } from './fakes';

installMocks();
const SALON_X = '66666666-6666-4666-8666-666666666601'; // a members-only salon (production salon ids are 'general' or UUIDs)
const SECRET = 'w'.repeat(48); // synthetic test-only value
const route = await import('../../app/api/salon-message/load/route.ts');

beforeEach(() => {
  process.env.NEXTAUTH_SECRET = SECRET;
  resetDb({
    members: [{ id: ADA, display_name: 'Ada Example' }, { id: JULES, display_name: 'Jules Example' }],
    salon_messages: [
      { id: 'm1', salon_id: 'general', content: 'public hello', created_at: '2026-01-01' },
      { id: 'm2', salon_id: `private-${JULES}`, content: 'jules private note', created_at: '2026-01-02' },
      { id: 'm3', salon_id: SALON_X, content: 'members only', created_at: '2026-01-03' },
      { id: 'm4', salon_id: `private-${ADA}`, content: 'ada private note', created_at: '2026-01-04' },
    ],
    salon_members: [{ salon_id: SALON_X, member_id: JULES }],
  });
});
const get = async (salonId: string, member?: string) =>
  route.GET(makeReq(undefined, { url: `http://localhost/api/salon-message/load?salonId=${encodeURIComponent(salonId)}`, cookies: member ? { soe_wallet_id: await walletCookie(member) } : {} }));

test('anonymous -> 401', async () => {
  const res = await get('general');
  expect(res.status).toBe(401);
});
test("another member's private salon -> refused, no content", async () => {
  const res = await get(`private-${JULES}`, ADA);
  expect([400, 403]).toContain(res.status);
  expect(await res.text()).not.toContain('jules private note');
});
test('salon the caller is not a member of -> 403, no content', async () => {
  const res = await get(SALON_X, ADA);
  expect(res.status).toBe(403);
  expect(await res.text()).not.toContain('members only');
});
test('raw member UUID cookie is not identity -> 401', async () => {
  const res = await route.GET(makeReq(undefined, { url: `http://localhost/api/salon-message/load?salonId=general`, cookies: { soe_wallet_id: ADA } }));
  expect(res.status).toBe(401);
});
test('private-<id> salons are never served by this endpoint (production rule kept); general works', async () => {
  const own = await get(`private-${ADA}`, ADA);
  expect([400, 403]).toContain(own.status);
  const gen = await get('general', ADA);
  expect(gen.status).toBe(200);
  const txt = JSON.stringify(await gen.json());
  expect(txt).toContain('public hello');
  expect(txt).not.toContain('private note');
});
test('member of the members-only salon can read it', async () => {
  const res = await get(SALON_X, JULES);
  expect(res.status).toBe(200);
  expect(JSON.stringify(await res.json())).toContain('members only');
});
