// These edge routes use the selected account and verify the signed wallet
// session through the same authority as other member routes.
import { test, expect, beforeEach, describe } from 'bun:test';
import { installMocks, resetDb, makeReq, drain, db, ADA, JULES, walletCookie } from './fakes';
import { selectedCookies } from './auth-request';

installMocks();
const SECRET = 'z'.repeat(48); // synthetic test-only value

const members = () => ({ members: [
  { id: ADA, display_name: 'Ada Example', tier: 'member', exp_tokens: 1 },
  { id: JULES, display_name: 'Jules Example', tier: 'member', exp_tokens: 1 },
] });

beforeEach(() => { resetDb(members()); process.env.NEXTAUTH_SECRET = SECRET; delete process.env.WALLET_SESSION_SECRET; });

const walletRequest = (value: string, memberId: string) => makeReq({}, {
  cookies: { ...selectedCookies('wallet', memberId), soe_wallet_id: value },
  headers: { origin: 'http://localhost' },
});

const ROUTES = [ 'projects/create', 'projects/invite', 'movement/pod/sync'];
describe('raw soe_wallet_id cookie is not identity on edge routes', () => {
  for (const r of ROUTES) {
    test(`${r}: soe_wallet_id=JULES alone -> 401`, async () => {
      const m = await import(`../../app/api/${r}/route.ts`);
      const res: Response = await m.POST(walletRequest(JULES, JULES));
      await drain(res);
      expect(res.status).toBe(401);
    });
    test(`${r}: forged signature -> 401`, async () => {
      const m = await import(`../../app/api/${r}/route.ts`);
      const forged = (await walletCookie(ADA)).replace(ADA, JULES);
      const res: Response = await m.POST(walletRequest(forged, JULES));
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
  for (const r of ROUTES) {
    test(`${r}: a signed selected session reaches payload validation`, async () => {
      const m = await import(`../../app/api/${r}/route.ts`);
      const res: Response = await m.POST(walletRequest(await walletCookie(ADA), ADA));
      await drain(res);
      expect(res.status).toBe(400);
    });
  }
});

test('matching remains unavailable for raw, forged and valid selected sessions without data access', async () => {
  const route = await import('../../app/api/match/route.ts');
  for (const cookie of [JULES, (await walletCookie(ADA)).replace(ADA, JULES), await walletCookie(ADA)]) {
    const response = await route.POST(walletRequest(cookie, ADA));
    expect(response.status).toBe(503); expect(await response.text()).toContain('MATCHING_NOT_AVAILABLE');
    expect(db.log).toEqual([]);
  }
});
