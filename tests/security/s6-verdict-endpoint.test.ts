// S6 (high): the council verdict endpoint. It must require a session, take the
// owner from that session (not the body), stay private unless the member opts
// in, and never overwrite another member's session.
import { test, expect, beforeEach } from 'bun:test';
import { installMocks, resetDb, makeReq, anthropicCalls, ADA, JULES } from './fakes';

installMocks();

const verdict = await import('../../app/api/council/verdict/route.ts');
const seed = () => ({
  members: [
    { id: ADA, display_name: 'Ada Example', exp_tokens: 3, supabase_auth_id: 'auth-ada' },
    { id: JULES, display_name: 'Jules Example', exp_tokens: 5, supabase_auth_id: 'auth-jules' },
  ],
  council_sessions: [{ id: 'cs-j', session_id: 'council-jules-1', member_id: JULES, question: 'Jules question', is_public: false, public_url_slug: 'jules-q-abcd' }],
});
const body = (extra: any = {}) => ({
  sessionId: 'council-ada-1', question: 'Is courage teachable?',
  responses: [{ thinker: 'Socrates', response: 'Ask what courage is.' }, { thinker: 'Plato', response: 'Courage is knowledge of what to fear.' }],
  ...extra,
});

beforeEach(() => { (globalThis as any).__authUser = null; });

test('S6a unauthenticated verdict request is refused before any paid model call or write', async () => {
  const db = resetDb(seed());
  const res = await verdict.POST(makeReq(body({ memberId: JULES })));
  expect(res.status).toBe(401);
  expect(anthropicCalls.length).toBe(0);
  expect(db.rows('council_sessions').length).toBe(1);
});

test('S6b owner comes from the session, not body memberId', async () => {
  const db = resetDb(seed());
  (globalThis as any).__authUser = { id: 'auth-ada' };
  const res = await verdict.POST(makeReq(body({ memberId: JULES })));
  expect(res.status).toBe(200);
  const row = db.rows('council_sessions').find(r => r.session_id === 'council-ada-1')!;
  expect(row.member_id).toBe(ADA);
});

test('S6c verdict is private by default; public only on explicit opt-in', async () => {
  const db = resetDb(seed());
  (globalThis as any).__authUser = { id: 'auth-ada' };
  const priv = await (await verdict.POST(makeReq(body()))).json();
  expect(db.rows('council_sessions').find(r => r.session_id === 'council-ada-1')!.is_public).toBe(false);
  expect(priv.publicUrl ?? null).toBeNull();
  const pub = await (await verdict.POST(makeReq(body({ sessionId: 'council-ada-2', makePublic: true })))).json();
  expect(db.rows('council_sessions').find(r => r.session_id === 'council-ada-2')!.is_public).toBe(true);
  expect(String(pub.publicUrl)).toContain('/council/verdict/');
});

test("S6d a member cannot overwrite another member's council session by reusing its sessionId", async () => {
  const db = resetDb(seed());
  (globalThis as any).__authUser = { id: 'auth-ada' };
  const res = await verdict.POST(makeReq(body({ sessionId: 'council-jules-1', makePublic: true })));
  expect(res.status).toBe(403);
  const row = db.rows('council_sessions').find(r => r.session_id === 'council-jules-1')!;
  expect(row.member_id).toBe(JULES);
  expect(row.is_public).toBe(false);
  expect(row.question).toBe('Jules question');
});
