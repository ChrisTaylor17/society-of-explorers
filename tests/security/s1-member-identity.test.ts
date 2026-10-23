// S1 (high): fake member IDs. Identity must come from a verified session,
// never from a request body or a raw member-UUID cookie.
import { test, expect, beforeEach } from 'bun:test';
import { installMocks, resetDb, makeReq, drain, settle, anthropicCalls, ADA, JULES } from './fakes';

installMocks({
  '@/lib/claude/thinkers': () => ({ buildSystemPrompt: () => 'You are a thinker.', THINKER_PROFILES: {}, getThinkerProfile: () => null, getAllThinkerIds: () => [] }),
  '@/lib/thinkerMemory': () => ({ getMemory: async () => null, recordInteraction: async () => {} }),
  '@/lib/thinkerActions': () => ({ parseActions: (t: string) => ({ actions: [], cleanText: t }) }),
  '@/lib/actions/executeActions': () => ({ executeActionsWithResults: async () => [] }),
  '@/lib/memory/embeddings': () => ({ storeConversationEmbedding: async () => {} }),
  '@/lib/memory/sharedMemory': () => ({ getThinkerContext: async () => null, storeEpisode: async () => {}, extractMemory: async () => {} }),
  '@/lib/community/getCommunity': () => ({ getCommunityThinkerPrompts: async () => ({}) }),
  '@/lib/governance/hats': () => ({ checkPermission: async () => true }),
  'siwe': () => ({ SiweMessage: class { constructor(public m: any) {} async verify() { return { success: true, data: { address: '0xAbCdEf0000000000000000000000000000000001' } }; } } }),
});

const SECRET = 'x'.repeat(48); // synthetic test-only value
const members = () => ({
  members: [
    { id: ADA, display_name: 'Ada Example', exp_tokens: 3, wallet_address: '0xabcdef0000000000000000000000000000000001' },
    { id: JULES, display_name: 'Jules Example', exp_tokens: 5 },
  ],
});

const thinker = await import('../../app/api/thinker/route.ts');
const auth = await import('../../lib/getAuthenticatedMember.ts');
const siwe = await import('../../app/api/auth/siwe/route.ts');
// Round 2 (S3): SIWE now requires the signed nonce cookie issued by /api/auth/nonce.
// (Before the fix the module doesn't exist and production accepts the raw nonce.)
const signNonce: (n: string) => Promise<string | null> = await import('../../lib/auth/siweNonce.ts')
  .then(m => m.signNonce).catch(() => async (n: string) => n);
let NONCE_COOKIE = '';
const nonceCookie = () => ({ cookies: { soe_siwe_nonce: NONCE_COOKIE } });

beforeEach(async () => { resetDb(members()); process.env.NEXTAUTH_SECRET = SECRET; delete process.env.WALLET_SESSION_SECRET; NONCE_COOKIE = (await signNonce('synthNonce1'))!; });

test('S1a thinker: body memberId cannot impersonate another member (salon mode -> 401, no model call)', async () => {
  const res = await thinker.POST(makeReq({ thinkerId: 'socrates', message: 'hello', memberId: JULES }));
  await drain(res); await settle();
  expect(res.status).toBe(401);
  expect(anthropicCalls.length).toBe(0);
});

test('S1b thinker: body walletMemberId in council mode does not attach victim identity or award victim EXP', async () => {
  const { db } = await import('./fakes');
  const res = await thinker.POST(makeReq({ thinkerId: 'socrates', message: 'hello', isCouncilMode: true, walletMemberId: JULES }));
  await drain(res); await settle();
  const sys = anthropicCalls.map(c => c.system).join('\n');
  expect(sys).not.toContain('Jules Example');
  expect(db.rows('exp_events').filter(e => e.member_id === JULES).length).toBe(0);
});

test('S1c getAuthenticatedMember: a raw member UUID in the soe_wallet_id cookie is not accepted as identity', async () => {
  const r = await auth.getAuthenticatedMember(makeReq({}, { cookies: { soe_wallet_id: JULES } }));
  expect(r).toBeNull();
});

test('S1d SIWE login issues a signed httpOnly soe_wallet_id session that authenticates the signer only', async () => {
  const res = await siwe.POST(makeReq({ message: 'synthetic', signature: '0xsig', address: '0xabc' }, nonceCookie()));
  expect(res.status).toBe(200);
  const c = (res as any).cookies.jar.get('soe_wallet_id');
  expect(c).toBeDefined();
  expect(c.opts.httpOnly).toBe(true);
  expect(c.value).not.toBe(ADA);
  const ok = await auth.getAuthenticatedMember(makeReq({}, { cookies: { soe_wallet_id: c.value } }));
  expect(ok?.memberId).toBe(ADA);
  // Tampering: swap the member id but keep the signature -> refused.
  const forged = c.value.replace(ADA, JULES);
  expect(await auth.getAuthenticatedMember(makeReq({}, { cookies: { soe_wallet_id: forged } }))).toBeNull();
});

test('S1e fails closed when no server secret is configured, or the secret changes', async () => {
  const res = await siwe.POST(makeReq({ message: 'synthetic', signature: '0xsig', address: '0xabc' }, nonceCookie()));
  const c = (res as any).cookies.jar.get('soe_wallet_id');
  expect(c).toBeDefined();
  process.env.NEXTAUTH_SECRET = 'q'.repeat(48); // a different synthetic secret
  expect(await auth.getAuthenticatedMember(makeReq({}, { cookies: { soe_wallet_id: c.value } }))).toBeNull();
  delete process.env.NEXTAUTH_SECRET;
  delete process.env.WALLET_SESSION_SECRET;
  expect(await auth.getAuthenticatedMember(makeReq({}, { cookies: { soe_wallet_id: c.value } }))).toBeNull();
});

test('S1f new sessions carry a server-checked expiry (v2); expired or far-future ones are refused', async () => {
  const ws = await import('../../lib/auth/walletSession.ts');
  const v = (await ws.createWalletSessionValue(ADA))!;
  expect(v.startsWith('v2.')).toBe(true);
  expect(await ws.verifyWalletSessionValue(v)).toBe(ADA);
  const day = 86400_000;
  const old = (await ws.createWalletSessionValue(ADA, Date.now() - 31 * day))!;
  expect(await ws.verifyWalletSessionValue(old)).toBeNull();
  // An attacker can't extend the expiry without the key.
  const [ver, id, , sig] = v.split('.');
  const extended = [ver, id, String(Math.floor(Date.now() / 1000) + 3650 * 86400), sig].join('.');
  expect(await ws.verifyWalletSessionValue(extended)).toBeNull();
  // Extra segments are refused.
  expect(await ws.verifyWalletSessionValue(v + '.x')).toBeNull();
});

test('S1g legacy v1 cookies (issued before this release) keep working only until the cutoff', async () => {
  const ws = await import('../../lib/auth/walletSession.ts');
  const legacy = (await ws.createLegacyV1WalletSessionValueForTests(ADA))!;
  expect(legacy.startsWith('v1.')).toBe(true);
  const before = Date.parse(ws.LEGACY_V1_ACCEPT_UNTIL) - 1000;
  const after = Date.parse(ws.LEGACY_V1_ACCEPT_UNTIL) + 1000;
  expect(await ws.verifyWalletSessionValue(legacy, before)).toBe(ADA);
  expect(await ws.verifyWalletSessionValue(legacy, after)).toBeNull();
  expect(await ws.verifyWalletSessionValue(legacy.replace(ADA, JULES), before)).toBeNull();
});
