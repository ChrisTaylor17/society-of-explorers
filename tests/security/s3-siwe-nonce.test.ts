// S3 (medium): the SIWE nonce was generated but never stored, and verify() was
// called without a nonce, so a captured signed message could be replayed. The
// nonce must be bound to the client (signed, httpOnly, short-lived cookie) and
// checked on verify, then cleared.
import { test, expect, beforeEach } from 'bun:test';
import { installMocks, resetDb, makeReq, ADA } from './fakes';

let lastVerify: any = null;
let messageNonce = 'nonceAAAA1111';
installMocks({
  'siwe': () => ({
    generateNonce: () => 'nonceAAAA1111',
    SiweMessage: class {
      nonce: string; address = '0xAbCdEf0000000000000000000000000000000001';
      constructor(public m: any) { this.nonce = messageNonce; }
      async verify(opts: any) {
        lastVerify = opts;
        if (opts.nonce !== undefined && opts.nonce !== this.nonce) return { success: false, error: { type: 'Nonce does not match' } };
        return { success: true, data: { address: this.address, nonce: this.nonce } };
      }
    },
  }),
});
const SECRET = 'v'.repeat(48); // synthetic test-only value
const nonceRoute = await import('../../app/api/auth/nonce/route.ts');
const siwe = await import('../../app/api/auth/siwe/route.ts');

beforeEach(() => {
  process.env.NEXTAUTH_SECRET = SECRET;
  lastVerify = null; messageNonce = 'nonceAAAA1111';
  resetDb({ members: [{ id: ADA, display_name: 'Ada', wallet_address: '0xabcdef0000000000000000000000000000000001' }] });
});

async function issue() {
  const res: any = await nonceRoute.GET(makeReq(undefined));
  const c = res.cookies.jar.get('soe_siwe_nonce');
  return { res, c };
}

test('nonce route binds the nonce in a signed httpOnly short-lived cookie', async () => {
  const { res, c } = await issue();
  expect((await res.json()).nonce).toBe('nonceAAAA1111');
  expect(c).toBeDefined();
  expect(c.opts.httpOnly).toBe(true);
  expect(c.opts.maxAge).toBeLessThanOrEqual(600);
});
const refused = (status: number) => expect([400, 401]).toContain(status);
const B = { message: 'm', signature: '0xsig', address: '0xabc' };
test('siwe without the nonce cookie is refused', async () => {
  const res = await siwe.POST(makeReq(B));
  refused(res.status);
});
test('siwe passes the expected nonce to verify and rejects a mismatched message', async () => {
  const { c } = await issue();
  messageNonce = 'someOtherNonce';
  const res = await siwe.POST(makeReq(B, { cookies: { soe_siwe_nonce: c.value } }));
  expect(lastVerify?.nonce).toBe('nonceAAAA1111');
  refused(res.status);
});
test('siwe with a matching nonce succeeds and clears the nonce cookie', async () => {
  const { c } = await issue();
  const res: any = await siwe.POST(makeReq(B, { cookies: { soe_siwe_nonce: c.value } }));
  expect(res.status).toBe(200);
  const cleared = res.cookies.jar.get('soe_siwe_nonce');
  expect(cleared).toBeDefined();
  expect(cleared.value).toBe('');
});
test('a forged (unsigned, attacker-chosen) nonce cookie is refused before verify', async () => {
  // Replay: an attacker holding a captured (message, signature) pair sets the
  // nonce cookie to the nonce inside that message. Must be refused.
  const res = await siwe.POST(makeReq(B, { cookies: { soe_siwe_nonce: 'nonceAAAA1111' } }));
  refused(res.status);
  expect(res.status).not.toBe(200);
});
test('an expired signed nonce cookie is refused', async () => {
  const { signNonce } = await import('../../lib/auth/siweNonce.ts');
  const old = await signNonce('nonceAAAA1111', Date.now() - 3600_000);
  const res = await siwe.POST(makeReq(B, { cookies: { soe_siwe_nonce: old! } }));
  refused(res.status);
});
