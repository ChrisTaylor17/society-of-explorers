// S2 (high): memory leaking between members. One member's words must never be
// summarised into another member's thinker memory, and a member must not be
// able to load another member's private salon history into their own prompt.
import { test, expect, beforeEach } from 'bun:test';
import { installMocks, resetDb, makeReq, drain, settle, anthropicCalls, ADA, JULES } from './fakes';

installMocks({
  '@/lib/claude/thinkers': () => ({ buildSystemPrompt: () => 'You are a thinker.', THINKER_PROFILES: {}, getThinkerProfile: () => null, getAllThinkerIds: () => [] }),
  '@/lib/thinkerActions': () => ({ parseActions: (t: string) => ({ actions: [], cleanText: t }) }),
  '@/lib/actions/executeActions': () => ({ executeActionsWithResults: async () => [] }),
  '@/lib/memory/embeddings': () => ({ storeConversationEmbedding: async () => {} }),
  '@/lib/memory/sharedMemory': () => ({ getThinkerContext: async () => null, storeEpisode: async () => {}, extractMemory: async () => {} }),
  '@/lib/community/getCommunity': () => ({ getCommunityThinkerPrompts: async () => ({}) }),
  '@/lib/governance/hats': () => ({ checkPermission: async () => true }),
});

const JULES_SECRET = 'JULES-PRIVATE-PLAN-zebra';   // fictional marker text
const ADA_OWN = 'ADA-OWN-NOTE-heron';             // fictional marker text
const t = (n: number) => new Date(1_600_000_000_000 + n * 1000).toISOString();
const seed = (count: number) => ({
  members: [
    { id: ADA, display_name: 'Ada Example', exp_tokens: 3, supabase_auth_id: 'auth-ada' },
    { id: JULES, display_name: 'Jules Example', exp_tokens: 5, supabase_auth_id: 'auth-jules' },
  ],
  thinker_memory: [{ id: 'tm-ada', member_id: ADA, thinker_id: 'socrates', message_count: count, summary: '' }],
  salon_messages: [
    { salon_id: 'general', sender_type: 'member', sender_name: 'Jules Example', content: JULES_SECRET, created_at: t(1) },
    { salon_id: 'general', sender_type: 'member', sender_name: 'Ada Example', content: 'general hello', created_at: t(2) },
    { salon_id: `private-${JULES}`, sender_type: 'member', sender_name: 'Jules Example', content: JULES_SECRET, created_at: t(3) },
    { salon_id: `private-${ADA}`, sender_type: 'member', sender_name: 'Ada Example', content: ADA_OWN, created_at: t(4) },
  ],
});
const allPrompts = () => JSON.stringify(anthropicCalls);

const memory = await import('../../lib/thinkerMemory.ts');
const thinker = await import('../../app/api/thinker/route.ts');

beforeEach(() => { (globalThis as any).__authUser = null; });

test("S2a shared-salon summary never folds another member's words into Ada's memory", async () => {
  const db = resetDb(seed(7)); // next interaction is #8 -> summary + fact extraction
  await memory.recordInteraction(ADA, 'socrates', 'Socrates', 'general');
  await settle();
  expect(allPrompts()).not.toContain(JULES_SECRET);
  const row = db.rows('thinker_memory').find(r => r.member_id === ADA)!;
  expect(JSON.stringify(row)).not.toContain(JULES_SECRET);
});

test("S2b a member cannot pull another member's private salon into their prompt", async () => {
  resetDb(seed(0));
  (globalThis as any).__authUser = { id: 'auth-ada' };
  const res = await thinker.POST(makeReq({ thinkerId: 'socrates', message: 'what did they say?', salonId: `private-${JULES}` }));
  await drain(res); await settle();
  expect(res.status).toBe(403);
  expect(allPrompts()).not.toContain(JULES_SECRET);
});

test("S2c Ada's own private salon still feeds Ada's memory (feature preserved)", async () => {
  resetDb(seed(7));
  await memory.recordInteraction(ADA, 'socrates', 'Socrates', `private-${ADA}`);
  await settle();
  expect(allPrompts()).toContain(ADA_OWN);
  expect(allPrompts()).not.toContain(JULES_SECRET);
});

test("S2d Ada can still use her own private salon through the thinker route", async () => {
  resetDb(seed(0));
  (globalThis as any).__authUser = { id: 'auth-ada' };
  const res = await thinker.POST(makeReq({ thinkerId: 'socrates', message: 'continue', salonId: `private-${ADA}` }));
  await drain(res); await settle();
  expect(res.status).toBe(200);
  expect(allPrompts()).toContain(ADA_OWN);
});
