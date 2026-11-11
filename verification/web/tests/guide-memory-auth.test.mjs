import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryFixture, A, B, INTENT, OTHER_INTENT } from './support/guide-memory-fixture.mjs';

test('actual member guard requires session-only discovery and rejects stale-member review actions', async () => {
  const f = memoryFixture();
  const subjectA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const subjectB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const db = f.app.fakes.resetDb({ members: [{ id: A, supabase_auth_id: subjectA }, { id: B, supabase_auth_id: subjectB }] });
  f.app.setMock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => db }));
  f.app.setMock('@/lib/account/erasure-access', () => ({ erasureAllowsAccount: async () => true }));
  f.app.setUser({ id: subjectA });
  const { getAuthenticatedMember } = f.app.load('lib/getAuthenticatedMember.ts');
  const handlers = f.http.createMemoryReviewHandlers({ service: f.service,
    authenticate: async req => (await getAuthenticatedMember(req))?.memberId ?? null, originAllowed: () => true });
  function request(route, { expectedMember, intent = INTENT, cookieIntent = INTENT, subject = subjectA, command } = {}) {
    const headers = { 'x-soe-auth-intent': intent, ...(expectedMember ? { 'x-soe-expected-member': expectedMember } : {}) };
    const req = new Request('http://localhost' + route, { headers, ...(command ? { method: 'POST', body: JSON.stringify(command) } : {}) });
    const cookies = { soe_auth_provider: 'supabase', soe_auth_intent: cookieIntent,
      soe_auth_selection_v1: `v1.${cookieIntent}.supabase.${subject}` };
    Object.defineProperty(req, 'cookies', { value: { get: name => cookies[name] ? { value: cookies[name] } : undefined } });
    return req;
  }
  const identity = await getAuthenticatedMember(request('/api/auth/member'));
  assert.equal(identity.memberId, A);
  assert.equal(await getAuthenticatedMember(request('/api/thinker/memory/review')), null);
  assert.equal((await handlers.GET(request('/api/thinker/memory/review'))).status, 401);
  const view = await handlers.GET(request('/api/thinker/memory/review', { expectedMember: identity.memberId }));
  assert.equal(view.status, 200); assert.equal((await view.json()).memberId, A);
  const command = await f.command({ action: 'set-enabled', enabled: true });
  f.app.setUser({ id: subjectB });
  for (const intent of [INTENT, OTHER_INTENT]) {
    const result = await handlers.POST(request('/api/thinker/memory/review', { expectedMember: A, intent,
      cookieIntent: OTHER_INTENT, subject: subjectB, command }));
    assert.equal(result.status, 401);
  }
  assert.equal((await f.service.view(A)).enabled, false); assert.equal((await f.service.view(B)).enabled, false);
  assert.equal(f.calls.commits, 0);
});
