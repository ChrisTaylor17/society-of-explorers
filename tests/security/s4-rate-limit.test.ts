// S4 (medium): /api/thinker allowed anonymous council and demo use with only a
// client-side delay, so anyone could script unlimited paid model calls. The
// server must rate limit per member / per IP, with a stricter anonymous budget.
import { test, expect, beforeEach } from 'bun:test';
import { existsSync } from 'fs';
import { installMocks, resetDb, makeReq, drain, settle, anthropicCalls, ADA, walletCookie } from './fakes';

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

test('anonymous demo is limited per IP; the over-limit call makes no model call', async () => {
  const { LIMITS } = await import(RL);
  const thinker = await import('../../app/api/thinker/route.ts');
  const demoFrom = (ip: string) => makeReq({ thinkerId: 'socrates', message: 'hi', demo: true }, { headers: { 'x-forwarded-for': `${ip}, 10.0.0.1` } });
  for (let i = 0; i < LIMITS.anonymous.max; i++) {
    const r = await thinker.POST(demoFrom('203.0.113.7')); await drain(r); await settle();
    expect(r.status).not.toBe(429);
  }
  const before = anthropicCalls.length;
  const over = await thinker.POST(demoFrom('203.0.113.7'));
  expect(over.status).toBe(429);
  expect(over.headers.get('retry-after')).toBeTruthy();
  expect(anthropicCalls.length).toBe(before);
  const other = await thinker.POST(demoFrom('198.51.100.9')); await drain(other); await settle();
  expect(other.status).not.toBe(429);
});

test('demo mode is limited too', async () => {
  const { LIMITS } = await import(RL);
  const thinker = await import('../../app/api/thinker/route.ts');
  const demo = () => makeReq({ thinkerId: 'socrates', message: 'hi', demo: true }, { headers: { 'x-forwarded-for': '192.0.2.44' } });
  for (let i = 0; i < LIMITS.anonymous.max; i++) { const r = await thinker.POST(demo()); await drain(r); await settle(); }
  expect((await thinker.POST(demo())).status).toBe(429);
});

test('signed-in members get their own (larger) budget, not the IP one, and are limited too', async () => {
  const { LIMITS } = await import(RL);
  expect(LIMITS.member.max).toBeGreaterThan(LIMITS.anonymous.max);
  const thinker = await import('../../app/api/thinker/route.ts');
  const demo50 = () => makeReq({ thinkerId: 'socrates', message: 'hi', demo: true }, { headers: { 'x-forwarded-for': '203.0.113.50' } });
  for (let i = 0; i < LIMITS.anonymous.max; i++) { const r = await thinker.POST(demo50()); await drain(r); await settle(); }
  expect((await thinker.POST(demo50())).status).toBe(429); // that IP's anonymous budget is spent
  const r = await thinker.POST(makeReq({ thinkerId: 'socrates', message: 'hello', isCouncilMode: true }, { headers: { 'x-forwarded-for': '203.0.113.50' }, cookies: { soe_wallet_id: await walletCookie(ADA) } }));
  await drain(r); await settle();
  expect(r.status).not.toBe(429);
  const cookie = await walletCookie(ADA);
  const member = () => makeReq({ thinkerId: 'socrates', message: 'hello', isCouncilMode: true }, { headers: { 'x-forwarded-for': '203.0.113.51' }, cookies: { soe_wallet_id: cookie } });
  for (let i = 1; i < LIMITS.member.max; i++) { const x = await thinker.POST(member()); await drain(x); }
  expect((await thinker.POST(member())).status).toBe(429);
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
