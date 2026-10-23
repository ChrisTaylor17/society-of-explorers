// S10 (production incident 2026-10-23, ~11:00 AM ET): wallet login on the live site answered
// "Unable to create wallet session." (500) and then, on retries, "Sign-in failed" (400) with the runtime
// log "TypeError: non-canonical s; use ._s" from ethers inside SiweMessage.verify.
//
// These tests use the real siwe + ethers libraries with a throwaway random key (no network, nothing real) and
// a PostgREST-faithful fake DB (.single() fails on 0 or 2+ rows). Each case failed on the release before this fix.
import { test, expect, beforeEach, afterEach } from 'bun:test';
import { installMocks, resetDb, makeReq, ADA, JULES, db } from './fakes';

installMocks();
const { Wallet, Signature, verifyMessage } = await import('ethers');
const { SiweMessage } = await import('siwe');
const nonceRoute = await import('../../app/api/auth/nonce/route.ts');
const siwe = await import('../../app/api/auth/siwe/route.ts');
const { verifyWalletSessionValue } = await import('../../lib/auth/walletSession.ts');

const SECRET = 'w'.repeat(48); // synthetic test-only value
const N = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');
const wallet = Wallet.createRandom();
const addr = wallet.address.toLowerCase();

let errors: string[] = [];
const origError = console.error, origWarn = console.warn;
beforeEach(() => {
  process.env.NEXTAUTH_SECRET = SECRET;
  errors = [];
  console.error = (...a: any[]) => { errors.push(a.map(String).join(' ')); };
  console.warn = (...a: any[]) => { errors.push(a.map(String).join(' ')); };
});
afterEach(() => { console.error = origError; console.warn = origWarn; });

function seed(members: any[], opts: { uniqueCi?: boolean } = {}) {
  const d = resetDb({ members });
  d.strictSingle = true;
  if (opts.uniqueCi) d.uniqueCi = { members: ['wallet_address'] };
  return d;
}

function toHighS(sig: string): string {
  const s = Signature.from(sig);
  const highS = (N - BigInt(s.s)).toString(16).padStart(64, '0');
  const v = s.v === 27 ? 28 : 27;
  return `0x${s.r.slice(2)}${highS}${v.toString(16)}`;
}

async function signIn(opts: { highS?: boolean } = {}) {
  const nres: any = await nonceRoute.GET(makeReq(undefined));
  const cookie = nres.cookies.jar.get('soe_siwe_nonce').value as string;
  const { nonce } = await nres.json();
  const message = new SiweMessage({
    domain: 'localhost', address: wallet.address, statement: 'Sign in to Society of Explorers.',
    uri: 'http://localhost', version: '1', chainId: 1, nonce,
  }).prepareMessage();
  let signature = await wallet.signMessage(message);
  if (opts.highS) signature = toHighS(signature);
  const res: any = await siwe.POST(makeReq({ message, signature, address: wallet.address }, {
    cookies: { soe_siwe_nonce: cookie }, headers: { host: 'localhost' },
  }));
  const body = await res.json();
  const session = res.cookies.jar.get('soe_wallet_id')?.value as string | undefined;
  return { res, body, session, message, signature };
}

test('control: a normal low-s signature for a known wallet signs in', async () => {
  seed([{ id: ADA, wallet_address: addr, created_at: '2026-01-01T00:00:00Z' }]);
  const { res, session } = await signIn();
  expect(res.status).toBe(200);
  expect(await verifyWalletSessionValue(session)).toBe(ADA);
});

test('high-s (non-canonical) signature from the wallet is accepted after normalisation', async () => {
  seed([{ id: ADA, wallet_address: addr, created_at: '2026-01-01T00:00:00Z' }]);
  // Reproduces the production log line: ethers v6 refuses the raw signature.
  const probe = await signIn({ highS: true });
  expect(() => verifyMessage(probe.message, probe.signature)).toThrow(/non-canonical s/);
  expect(probe.res.status).toBe(200);
  expect(await verifyWalletSessionValue(probe.session)).toBe(ADA);
});

test('a signature from a different key is still refused (normalisation does not weaken verification)', async () => {
  seed([{ id: ADA, wallet_address: addr, created_at: '2026-01-01T00:00:00Z' }]);
  const nres: any = await nonceRoute.GET(makeReq(undefined));
  const cookie = nres.cookies.jar.get('soe_siwe_nonce').value;
  const { nonce } = await nres.json();
  const message = new SiweMessage({ domain: 'localhost', address: wallet.address, uri: 'http://localhost', version: '1', chainId: 1, nonce }).prepareMessage();
  const forged = toHighS(await Wallet.createRandom().signMessage(message));
  const res: any = await siwe.POST(makeReq({ message, signature: forged, address: wallet.address }, { cookies: { soe_siwe_nonce: cookie }, headers: { host: 'localhost' } }));
  expect(res.status).toBe(401);
  expect(res.cookies.jar.get('soe_wallet_id')).toBeUndefined();
});

test('duplicate member rows for the wallet pick the oldest row instead of failing', async () => {
  // .single() returned no row here, the route inserted a third row and could not mint a session for it.
  const d = seed([
    { id: ADA, wallet_address: addr, created_at: '2026-03-01T00:00:00Z' },
    { id: JULES, wallet_address: addr, created_at: '2026-02-01T00:00:00Z' },
  ]);
  const { res, session } = await signIn();
  expect(res.status).toBe(200);
  expect(await verifyWalletSessionValue(session)).toBe(JULES);
  expect(d.log.some(l => l.table === 'members' && l.op === 'insert')).toBe(false);
});

test('a wallet stored in checksum (mixed) case is found, not re-inserted into a unique violation', async () => {
  seed([{ id: ADA, wallet_address: wallet.address, created_at: '2026-01-01T00:00:00Z' }], { uniqueCi: true });
  const { res, session } = await signIn();
  expect(res.status).toBe(200);
  expect(await verifyWalletSessionValue(session)).toBe(ADA);
});

test('a member id that is a well-formed UUID outside versions 1-5 still gets a session', async () => {
  const seededId = '00000000-0000-0000-0000-000000000001';
  seed([{ id: seededId, wallet_address: addr, created_at: '2026-01-01T00:00:00Z' }]);
  const { res, session } = await signIn();
  expect(res.status).toBe(200);
  expect(await verifyWalletSessionValue(session)).toBe(seededId);
});

test('a new wallet gets a member row and a session', async () => {
  const d = seed([]);
  // Make the fake assign a uuid like Postgres would.
  const from = d.from.bind(d);
  (d as any).from = (t: string) => { const q: any = from(t); const ins = q.insert.bind(q); q.insert = (p: any) => ins({ id: '33333333-3333-4333-8333-333333333333', ...p }); return q; };
  const { res, session } = await signIn();
  expect(res.status).toBe(200);
  expect(await verifyWalletSessionValue(session)).toBe('33333333-3333-4333-8333-333333333333');
  expect(db.rows('members')[0].wallet_address).toBe(addr);
});

test('when no session can be made, the user gets a generic message and the reason is logged server-side only', async () => {
  seed([{ id: 'not-a-uuid', wallet_address: addr, created_at: '2026-01-01T00:00:00Z' }]);
  const { res, body } = await signIn();
  expect(res.status).toBe(500);
  expect(body.error).toBe('Unable to create wallet session.');
  expect(JSON.stringify(body)).not.toContain('member_id_not_uuid');
  const line = errors.find(e => e.includes('[siwe] sign-in failed'));
  expect(line).toContain('member_id_not_uuid');
  expect(line).not.toContain(addr.slice(4, 38)); // wallet is truncated (0x12…ab)
});

// Second report, 2026-10-23 11:59 AM ET on dpl_DcS4: the signature verified, then the log said
// {"reason":"lookup_failed:"} - an empty PostgREST code, which postgrest-js only produces when fetch() itself
// throws. Production's Supabase hostname returns NXDOMAIN (paused or deleted project), so every DB call failed.
test('an unreachable member database is classified as db_unreachable and answered 503, never as a wallet problem', async () => {
  const d = seed([]);
  d.networkDown = { cause: 'ENOTFOUND' };
  const { res, body, session } = await signIn();
  expect(res.status).toBe(503);
  expect(body.error).toBe('Sign-in is temporarily unavailable. Please try again later.');
  expect(session).toBeUndefined();
  expect(JSON.stringify(body)).not.toMatch(/ENOTFOUND|supabase|db_unreachable/i);
  const line = errors.find(e => e.includes('[siwe] sign-in failed'))!;
  expect(line).toContain('"reason":"db_unreachable:ENOTFOUND"');
  expect(line).not.toContain('supabase.co');
  expect(line).not.toContain(addr.slice(4, 38));
  // No insert was attempted against a database that could not even be read.
  expect(d.log.filter(l => l.op === 'insert').length).toBe(0);
});

test('classifyDbError keeps real PostgREST codes and never leaks host names', async () => {
  const { classifyDbError } = await import('../../lib/auth/walletMember.ts');
  expect(classifyDbError('lookup_failed', { code: '42703', message: 'column does not exist' }, 400)).toBe('lookup_failed:42703');
  expect(classifyDbError('lookup_failed', { code: '', message: 'TypeError: fetch failed', details: 'Caused by: Error: connect ECONNREFUSED 1.2.3.4:443 (ECONNREFUSED)' }, 0)).toBe('db_unreachable:ECONNREFUSED');
  expect(classifyDbError('insert_failed', { code: '', message: 'TypeError: fetch failed' }, 0)).toBe('db_unreachable:fetch_failed');
  expect(classifyDbError('lookup_failed', { message: 'weird' }, 500)).toBe('lookup_failed:unknown');
});
