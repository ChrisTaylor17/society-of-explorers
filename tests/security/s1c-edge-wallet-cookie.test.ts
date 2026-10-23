// S1c: the four edge-runtime routes parse the Cookie header themselves. They must
// accept only an HMAC-verified soe_wallet_id session (production's Web Crypto
// verifier in lib/auth/walletSession.ts), never a bare member UUID.
import { test, expect, beforeEach, describe } from 'bun:test';
import { installMocks, resetDb, makeReq, drain, ADA, JULES, walletCookie } from './fakes';

installMocks();
const SECRET = 'z'.repeat(48); // synthetic test-only value

const members = () => ({ members: [
  { id: ADA, display_name: 'Ada Example', tier: 'member', exp_tokens: 1 },
  { id: JULES, display_name: 'Jules Example', tier: 'member', exp_tokens: 1 },
] });

// pod/sync and friends may look members up over PostgREST; serve that offline.
function memberFetch() {
  (globalThis as any).fetch = async (u: any) => {
    const url = String(u);
    if (url.includes('/rest/v1/members')) {
      const id = decodeURIComponent(url).match(/id=eq\.([0-9a-f-]{36})/)?.[1];
      const { db } = await import('./fakes');
      return new Response(JSON.stringify(db.rows('members').filter(m => m.id === id)), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error('network access attempted in offline test: ' + url);
  };
}

beforeEach(() => { resetDb(members()); process.env.NEXTAUTH_SECRET = SECRET; delete process.env.WALLET_SESSION_SECRET; memberFetch(); });

const ROUTES = ['match', 'projects/create', 'projects/invite', 'movement/pod/sync'];
describe('raw soe_wallet_id cookie is not identity on edge routes', () => {
  for (const r of ROUTES) {
    test(`${r}: soe_wallet_id=JULES alone -> 401`, async () => {
      const m = await import(`../../app/api/${r}/route.ts`);
      const res: Response = await m.POST(makeReq({}, { headers: { cookie: `soe_wallet_id=${JULES}` } }));
      await drain(res);
      expect(res.status).toBe(401);
    });
    test(`${r}: forged signature -> 401`, async () => {
      const m = await import(`../../app/api/${r}/route.ts`);
      const forged = (await walletCookie(ADA)).replace(ADA, JULES);
      const res: Response = await m.POST(makeReq({}, { headers: { cookie: `soe_wallet_id=${encodeURIComponent(forged)}` } }));
      await drain(res);
      expect(res.status).toBe(401);
    });
  }
});

describe('the shared Web Crypto verifier works for edge routes', () => {
  test('verifier uses only Web Crypto (no node:crypto import), so it runs on the edge runtime', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync(new URL('../../lib/auth/walletSession.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/from ['"](node:)?crypto['"]/);
    expect(src).toContain('crypto.subtle');
  });
  test('accepts a genuine session, rejects forged / raw / wrong-secret', async () => {
    const { verifyWalletSessionValue } = await import('../../lib/auth/walletSession.ts');
    const good = await walletCookie(ADA);
    expect(await verifyWalletSessionValue(good)).toBe(ADA);
    expect(await verifyWalletSessionValue(good.replace(ADA, JULES))).toBeNull();
    expect(await verifyWalletSessionValue(JULES)).toBeNull();
    process.env.NEXTAUTH_SECRET = 'p'.repeat(48);
    expect(await verifyWalletSessionValue(good)).toBeNull();
  });
  for (const r of ['match', 'projects/invite']) {
    test(`${r}: a signed session passes authentication (not 401)`, async () => {
      const m = await import(`../../app/api/${r}/route.ts`);
      const res: Response = await m.POST(makeReq({}, { headers: { cookie: `soe_wallet_id=${encodeURIComponent(await walletCookie(ADA))}` } }));
      await drain(res);
      expect(res.status).not.toBe(401);
    });
  }
});
