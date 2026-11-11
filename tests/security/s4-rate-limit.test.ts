// S4 (medium): /api/thinker allowed anonymous council and demo use with only a
// client-side delay, so anyone could script unlimited paid model calls. The
// server must rate limit per member / per IP, with a stricter anonymous budget.
import { test, expect, beforeEach } from 'bun:test';
import { existsSync } from 'fs';
import { installMocks, resetDb, makeReq, drain, settle, anthropicCalls, ADA, walletCookie } from './fakes';
import { selectedCookies } from './auth-request';

installMocks({
  '@/lib/claude/thinkers': () => ({ buildSystemPrompt: () => 'You are a thinker.', THINKER_PROFILES: {}, getThinkerProfile: () => null, getAllThinkerIds: () => [] }),
  '@/lib/thinkerMemory': () => ({ getMemory: async () => null, recordInteraction: async () => {} }),
  '@/lib/thinkerActions': () => ({ parseActions: (t: string) => ({ actions: [], cleanText: t }) }),
  '@/lib/actions/executeActions': () => ({ executeActionsWithResults: async () => [] }),
  '@/lib/memory/embeddings': () => ({ storeConversationEmbedding: async () => {} }),
  '@/lib/memory/sharedMemory': () => ({ getThinkerContext: async () => null, storeEpisode: async () => {}, extractMemory: async () => {} }),
  '@/lib/community/getCommunity': () => ({ getCommunityThinkerPrompts: async () => ({}) }),
  '@/lib/governance/hats': () => ({ checkPermission: async () => true }),
});
const SECRET = 'u'.repeat(48); // synthetic test-only value
const RL = '../../lib/rateLimit.ts';

beforeEach(async () => {
  process.env.NEXTAUTH_SECRET = SECRET;
  resetDb({ members: [{ id: ADA, display_name: 'Ada Example', exp_tokens: 1 }] });
  if (existsSync(new URL(RL, import.meta.url))) (await import(RL)).resetRateLimits();
});

const council = (ip: string, extra: any = {}) => makeReq({ thinkerId: 'socrates', message: 'hello', isCouncilMode: true, ...extra }, { headers: { 'x-forwarded-for': `${ip}, 10.0.0.1` } });

test('rate limiter module exists', () => { expect(existsSync(new URL(RL, import.meta.url))).toBe(true); });

test('anonymous council is refused before any model call (production requires sign-in)', async () => {
  const thinker = await import('../../app/api/thinker/route.ts');
  const r = await thinker.POST(council('203.0.113.7')); await drain(r); await settle();
  expect(r.status).toBe(401);
  expect(anthropicCalls.length).toBe(0);
});

test('retired anonymous demo refuses every IP and never makes a model call', async () => {
  const { LIMITS } = await import(RL);
  const thinker = await import('../../app/api/thinker/route.ts');
  for (const ip of ['203.0.113.7', '198.51.100.9']) {
    for (let i = 0; i <= LIMITS.anonymous.max; i++) {
      const response = await thinker.POST(makeReq({ thinkerId: 'socrates', message: 'hi', demo: true }, { headers: { 'x-forwarded-for': ip } }));
      expect(response.status).toBe(410); await drain(response);
    }
  }
  expect(anthropicCalls).toEqual([]);
});

test('a selected signed-in session cannot revive the retired demo', async () => {
  const thinker = await import('../../app/api/thinker/route.ts');
  const response = await thinker.POST(makeReq({ thinkerId: 'socrates', message: 'hi', demo: true }, {
    cookies: { ...selectedCookies('wallet', ADA), soe_wallet_id: await walletCookie(ADA) },
  }));
  expect(response.status).toBe(410); expect(anthropicCalls).toEqual([]);
});

test('signed-in model calls exhaust their own budget before another provider call', async () => {
  const { LIMITS, limitModelCall } = await import(RL);
  const thinker = await import('../../app/api/thinker/route.ts');
  expect(LIMITS.member.max).toBeGreaterThan(LIMITS.anonymous.max);
  const ip = '203.0.113.50';
  // Exhaust the independent anonymous bucket through the actual limiter; the
  // retired demo route deliberately never spends that budget or calls a model.
  for (let i = 0; i < LIMITS.anonymous.max; i++) expect(limitModelCall(council(ip), null)).toBeNull();
  expect(limitModelCall(council(ip), null)?.status).toBe(429);
  const cookies = { ...selectedCookies('wallet', ADA), soe_wallet_id: await walletCookie(ADA) };
  const member = () => makeReq({ requestId: '33333333-3333-4333-8333-333333333333', thinkerId: 'socrates', message: 'hello', isCouncilMode: true }, { headers: { 'x-forwarded-for': ip }, cookies });
  for (let i = 0; i < LIMITS.member.max; i++) { const response = await thinker.POST(member()); expect(response.status).toBe(200); await drain(response); }
  const before = anthropicCalls.length;
  const rejected = await thinker.POST(member());
  expect(rejected.status).toBe(429); expect(rejected.headers.get('retry-after')).toBeTruthy();
  expect(anthropicCalls.length).toBe(before);
});

test('limiter unit: fixed window, independent keys', async () => {
  const { rateLimit } = await import(RL);
  const t0 = 1_000_000;
  expect(rateLimit('k', 2, 1000, t0).ok).toBe(true);
  expect(rateLimit('k', 2, 1000, t0 + 1).ok).toBe(true);
  const third = rateLimit('k', 2, 1000, t0 + 2);
  expect(third.ok).toBe(false);
  expect(third.retryAfterS).toBeGreaterThan(0);
  expect(rateLimit('other', 2, 1000, t0 + 2).ok).toBe(true);
  expect(rateLimit('k', 2, 1000, t0 + 1001).ok).toBe(true);
});
