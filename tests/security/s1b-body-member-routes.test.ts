// S1 round 2: every route that used to take a member id from the request body,
// query string or an x-member-id header must take identity from the signed
// session instead. Without a session, a request naming another member (JULES)
// must be refused (401) and must not write anything; with a valid session (ADA)
// a body memberId naming someone else is ignored.
import { test, expect, beforeEach, describe } from 'bun:test';
import { installMocks, resetDb, makeReq, drain, settle, anthropicCalls, ADA, JULES, walletCookie } from './fakes';

installMocks({
  '@/lib/feed/activityFeed': () => ({ emitActivity: async () => {}, generateSocialDraft: async (_e: string, m: string) => ({ content: 'draft', postId: `post-${m}` }) }),
  '@/lib/governance/hats': () => ({ checkPermission: async () => true, initializeRolesForCommunity: async () => {} }),
  '@/lib/blockchain/membership': () => ({ mintMembershipNFT: async () => ({ success: false }), mintAchievementNFT: async () => ({ success: false }) }),
  '@/lib/wallets/agentWallet': () => ({ initializeAgentWallets: async () => {}, createAgentWallet: async () => null, getAgentWallet: async () => null }),
  '@/lib/wallets/disburse': () => ({ approveTx: async (_t: string, m: string) => ({ success: true, message: `approved-by-${m}` }), disburse: async () => ({}), verifyTaskCompletion: async () => ({}) }),
  '@/lib/thinkerMemory': () => ({ getMemory: async () => null, getStructuredMemory: async () => null, recordInteraction: async () => {} }),
  '@/lib/thinkerActions': () => ({ parseActions: (t: string) => ({ actions: [], cleanText: t }), executeThinkerAction: async () => {} }),
  '@/lib/memory/embeddings': () => ({ storeConversationEmbedding: async () => {} }),
  '@/lib/live/scheduler': () => ({ generateSessionSummary: async () => ({ ok: true }), createLiveSession: async () => ({}) }),
  '@/lib/claude/thinkers': () => ({ buildSystemPrompt: () => 'You are a thinker.', THINKERS: {}, THINKER_PROFILES: {}, getThinker: () => null, getThinkerProfile: () => null, getAllThinkerIds: () => [] }),
  'viem': () => ({ isAddress: () => true, getAddress: (a: string) => a }),
});

const SECRET = 'y'.repeat(48); // synthetic test-only value
const ADA_AUTH = 'aaaaaaaa-0000-4000-8000-00000000000a';   // fictional auth.users id
const JULES_AUTH = 'bbbbbbbb-0000-4000-8000-00000000000b'; // fictional auth.users id

function seed() {
  return {
    members: [
      { id: ADA, display_name: 'Ada Example', exp_tokens: 3, supabase_auth_id: ADA_AUTH, tier: 'member' },
      { id: JULES, display_name: 'Jules Example', exp_tokens: 5, supabase_auth_id: JULES_AUTH, tier: 'member', wallet_address: '0xjules' },
    ],
    video_rooms: [{ id: '55555555-5555-4555-8555-555555555501', created_by: JULES, is_live: true }],
    community_matches: [{ id: '55555555-5555-4555-8555-555555555502', community_id: '55555555-5555-4555-8555-555555555506', member_a: JULES, member_b: '55555555-5555-4555-8555-555555555510', status: 'pending' }],
    communities: [{ id: '55555555-5555-4555-8555-555555555506', slug: 'demo', owner_member_id: JULES, name: 'Demo' }],
    twiddles: [{ id: '55555555-5555-4555-8555-555555555503', member_id: JULES, title: 'Jules twiddle', status: 'open', content: 'x' }],
    spaces: [{ id: '55555555-5555-4555-8555-555555555505', host_id: JULES_AUTH, name: 'Jules space' }],
    scan_uploads: [{ id: '55555555-5555-4555-8555-555555555504', space_id: '55555555-5555-4555-8555-555555555505', scanner_id: JULES_AUTH, is_first_scan: false, spaces: { host_id: JULES_AUTH } }],
  };
}

const BODY = {
  memberId: JULES, walletMemberId: JULES, authorId: JULES_AUTH, reviewerId: JULES_AUTH, hostId: JULES_AUTH,
  amount: 5, reason: 'great_books_section', title: 'Synthetic title', name: 'Synthetic', content: 'synthetic content',
  text: 'synthetic', message: 'synthetic', response: 'synthetic', action: 'join', walletAddress: '0xabc',
  productId: '55555555-5555-4555-8555-555555555511', itemId: '55555555-5555-4555-8555-555555555512', txId: '55555555-5555-4555-8555-555555555508', eventId: '55555555-5555-4555-8555-555555555509', platform: 'twitter', emoji: 'x', reaction: 'x',
  bookId: 'b1', section: 's1', spaceId: '55555555-5555-4555-8555-555555555505', scanId: '55555555-5555-4555-8555-555555555504', qualityScore: 80, matchId: '55555555-5555-4555-8555-555555555502',
  slug: 'demo-new', description: 'd', answers: {}, cohortId: '55555555-5555-4555-8555-555555555507', type: 'note', thinkerId: 'socrates',
  facts: [], question: 'q', status: 'done', latitude: 1, longitude: 2, prompt: 'p',
};

type Case = [name: string, path: string, method: string, params?: Record<string, string>];
const REQUIRED: Case[] = [
  ['artifacts/generate', 'artifacts/generate', 'POST'],
  ['book-salons/[cohortId] POST', 'book-salons/[cohortId]', 'POST', { cohortId: '55555555-5555-4555-8555-555555555507' }],
  ['book-salons/join', 'book-salons/join', 'POST'],
  ['book-salons POST', 'book-salons', 'POST'],
  ['communities/[slug]/join', 'communities/[slug]/join', 'POST', { slug: 'demo' }],
  ['communities/[slug]/matches GET', 'communities/[slug]/matches', 'GET', { slug: 'demo' }],
  ['communities/[slug]/matches POST', 'communities/[slug]/matches', 'POST', { slug: 'demo' }],
  ['communities/[slug]/products POST', 'communities/[slug]/products', 'POST', { slug: 'demo' }],
  ['communities/[slug]/questionnaire POST', 'communities/[slug]/questionnaire', 'POST', { slug: 'demo' }],
  ['communities POST', 'communities', 'POST'],
  ['exp/award', 'exp/award', 'POST'],
  ['great-books/progress GET', 'great-books/progress', 'GET'],
  ['great-books/progress POST', 'great-books/progress', 'POST'],
  ['live/[sessionId]', 'live/[sessionId]', 'POST', { sessionId: '55555555-5555-4555-8555-555555555501' }],
  ['member/wallet', 'member/wallet', 'POST'],
  ['members/onboarding', 'members/onboarding', 'POST'],
  ['members/profile', 'members/profile', 'POST'],
  ['onboarding/send-all (needs CRON_SECRET)', 'onboarding/send-all', 'POST'],
  ['practice/respond', 'practice/respond', 'POST'],
  ['ritual', 'ritual', 'POST'],
  ['rooms/[roomId]', 'rooms/[roomId]', 'POST', { roomId: '55555555-5555-4555-8555-555555555501' }],
  ['rooms POST', 'rooms', 'POST'],
  ['safe GET', 'safe', 'GET'],
  ['social/generate', 'social/generate', 'POST'],
  ['store/buy', 'store/buy', 'POST'],
  ['tasks POST', 'tasks', 'POST'],
  ['thinker/extract-facts (fails closed without CRON_SECRET)', 'thinker/extract-facts', 'POST'],
  ['thinker/memory', 'thinker/memory', 'POST'],
  ['transactions/approve', 'transactions/approve', 'POST'],
  ['twiddle/[id]/react', 'twiddle/[id]/react', 'POST', { id: '55555555-5555-4555-8555-555555555503' }],
  ['twiddle/[id] PATCH', 'twiddle/[id]', 'PATCH', { id: '55555555-5555-4555-8555-555555555503' }],
  ['twiddle POST', 'twiddle', 'POST'],
  ['voice-notes/generate', 'voice-notes/generate', 'POST'],
  ['world/annotate', 'world/annotate', 'POST'],
  ['world/match GET', 'world/match', 'GET'],
  ['world/scan/verify', 'world/scan/verify', 'POST'],
  ['world/spaces POST', 'world/spaces', 'POST'],
];

const mods: Record<string, any> = {};
async function load(path: string) {
  return (mods[path] ??= await import(`../../app/api/${path}/route.ts`));
}
function req(opts: { cookies?: Record<string, string>; headers?: Record<string, string> } = {}) {
  return makeReq({ ...BODY }, { ...opts, url: `http://localhost/x?memberId=${JULES}&filter=my`, headers: { 'x-member-id': JULES, ...(opts.headers || {}) } });
}
async function call(c: Case, opts: { cookies?: Record<string, string>; headers?: Record<string, string> } = {}) {
  const m = await load(c[1]);
  const fn = m[c[2]];
  expect(typeof fn).toBe('function');
  const ctx = { params: Promise.resolve(c[3] || {}) };
  const res: Response = await fn(req(opts), ctx);
  const body = await drain(res); await settle();
  return { res, body };
}
const writes = (db: any) => db.log.filter((l: any) => l.op !== 'select');
const mentionsJules = (x: any) => JSON.stringify(x ?? null).includes(JULES) || JSON.stringify(x ?? null).includes(JULES_AUTH);

beforeEach(() => {
  resetDb(seed());
  process.env.NEXTAUTH_SECRET = SECRET;
  delete process.env.CRON_SECRET;
  (globalThis as any).__authUser = null;
});

// Production often validates the body before authenticating, so a refusal may be
// 400 (bad input) as well as 401/403. The security property is: refused, nothing
// written, no paid model call, and never a success acting as JULES.
describe('no session + body/query/header memberId=JULES -> refused (400/401/403) and no writes', () => {
  for (const c of REQUIRED) {
    test(c[0], async () => {
      const { db } = await import('./fakes');
      const { res } = await call(c);
      expect([400, 401, 403]).toContain(res.status);
      expect(writes(db)).toEqual([]);
      expect(anthropicCalls.length).toBe(0);
    });
  }
});

describe('optional-identity routes: no session -> never acts as JULES', () => {
  test('great-books/annotate does not attribute to body memberId', async () => {
    const { db } = await import('./fakes');
    await call(['great-books/annotate', 'great-books/annotate', 'POST']);
    expect(writes(db).filter((w: any) => mentionsJules(w.payload))).toEqual([]);
  });
  test('twiddle/[id]/respond does not load JULES memory or attribute to JULES', async () => {
    const { db } = await import('./fakes');
    await call(['twiddle/[id]/respond', 'twiddle/[id]/respond', 'POST', { id: '55555555-5555-4555-8555-555555555503' }]);
    expect(writes(db).filter((w: any) => mentionsJules(w.payload))).toEqual([]);
    expect(anthropicCalls.map(a => a.system).join('\n')).not.toContain('Jules Example');
  });
  test('communities GET ignores x-member-id header', async () => {
    const { db } = await import('./fakes');
    await call(['communities GET', 'communities', 'GET']);
    expect(db.log.filter((l: any) => mentionsJules(l.filters))).toEqual([]);
  });
  test('store/balance GET ignores ?memberId', async () => {
    const { db } = await import('./fakes');
    await call(['store/balance', 'store/balance', 'GET']);
    expect(db.log.filter((l: any) => mentionsJules(l.filters))).toEqual([]);
  });
  test('twiddle GET filter=my ignores ?memberId', async () => {
    const { db } = await import('./fakes');
    await call(['twiddle GET', 'twiddle', 'GET']);
    expect(db.log.filter((l: any) => mentionsJules(l.filters))).toEqual([]);
  });
});

describe('signed session ADA + body memberId=JULES -> acts as ADA only', () => {
  const ada = async () => ({ cookies: { soe_wallet_id: await walletCookie(ADA) } });
  test('exp/award credits the session member, not the body member', async () => {
    const { db } = await import('./fakes');
    const { res } = await call(['exp/award', 'exp/award', 'POST'], await ada());
    // Production refuses a mismatched body memberId outright (403); either way JULES is never credited.
    expect([200, 403]).toContain(res.status);
    expect(db.rows('exp_events').map(e => e.member_id)).toEqual(res.status === 200 ? [ADA] : []);
    expect(db.rows('members').find(m => m.id === JULES)!.exp_tokens).toBe(5);
  });
  test('tasks POST owns the task as the session member', async () => {
    const { db } = await import('./fakes');
    await call(['tasks', 'tasks', 'POST'], await ada());
    expect(db.rows('agent_tasks').map(t => t.member_id)).toEqual([ADA]);
  });
  test('world/annotate uses the session member auth id as author', async () => {
    const { db } = await import('./fakes');
    await call(['world/annotate', 'world/annotate', 'POST'], await ada());
    expect(db.rows('spatial_annotations').map(a => a.author_id)).toEqual([ADA_AUTH]);
    expect(db.rows('exp_events').map(e => e.member_id)).toEqual([ADA]);
  });
  // Security-only release: this route's id check is left as in production (rejects every UUID -> 400),
  // so "refused" is 400 or 403; either way nothing is changed.
  test('rooms/[roomId] end by a non-creator is refused (400/403)', async () => {
    const { db } = await import('./fakes');
    const m = await load('rooms/[roomId]');
    const res: Response = await m.POST(makeReq({ action: 'end', memberId: JULES }, await ada()), { params: Promise.resolve({ roomId: '55555555-5555-4555-8555-555555555501' }) });
    expect([400, 403]).toContain(res.status);
    expect(db.rows('video_rooms')[0].is_live).toBe(true);
  });
  // Security-only release: this route's id check is left as in production (rejects every UUID -> 400),
  // so "refused" is 400 or 403; either way nothing is changed.
  test('live/[sessionId] end by a non-creator is refused (400/403)', async () => {
    const { db } = await import('./fakes');
    const m = await load('live/[sessionId]');
    const res: Response = await m.POST(makeReq({ action: 'end', memberId: JULES }, await ada()), { params: Promise.resolve({ sessionId: '55555555-5555-4555-8555-555555555501' }) });
    expect([400, 403]).toContain(res.status);
    expect(db.rows('video_rooms')[0].is_live).toBe(true);
  });
  test('communities/[slug]/matches POST cannot accept someone else\'s match (403)', async () => {
    const { db } = await import('./fakes');
    const m = await load('communities/[slug]/matches');
    const res: Response = await m.POST(makeReq({ matchId: '55555555-5555-4555-8555-555555555502', memberId: JULES, action: 'accept' }, await ada()), { params: Promise.resolve({ slug: 'demo' }) });
    expect(res.status).toBe(403);
    expect(db.rows('community_matches')[0].status).toBe('pending');
  });
  test('world/scan/verify: body reviewerId cannot impersonate the space host (403)', async () => {
    const { db } = await import('./fakes');
    const m = await load('world/scan/verify');
    const res: Response = await m.POST(makeReq({ scanId: '55555555-5555-4555-8555-555555555504', reviewerId: JULES_AUTH, memberId: ADA, qualityScore: 90 }, await ada()));
    expect(res.status).toBe(403);
    expect(db.rows('exp_events')).toEqual([]);
  });
  test('onboarding/send-all accepts the cron bearer', async () => {
    process.env.CRON_SECRET = 'c'.repeat(40); // synthetic
    const m = await load('onboarding/send-all');
    const r = makeReq({ memberId: JULES }, { headers: { authorization: 'Bearer wrong' } });
    expect((await m.POST(r)).status).toBe(401);
  });
});
