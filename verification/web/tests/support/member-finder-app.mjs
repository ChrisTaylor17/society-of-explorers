import assert from 'node:assert/strict';
import { offlineApp } from './offline-app.mjs';

export const IDS = { owner: '11111111-1111-4111-8111-111111111111', published: '22222222-2222-4222-8222-222222222222',
  private: '33333333-3333-4333-8333-333333333333', community: '44444444-4444-4444-8444-444444444444' };
const profile = (id, values) => ({ id, display_name: 'Fictional explorer', bio: null, discipline: null, skills: [],
  project_description: null, seeking: null, philosophy: null, profile_visibility: 'public', ...values });

/** Actual handlers, authority, signed wallet verification and DTO validation.
 * FakeDb plus an explicit FK-join transport adapter; no hosted/PostgREST proof.
 * Existing FakeDb wallet-session access is a mock; the erasure gate is disabled
 * in the offline environment. This is not revocation-store acceptance. */
export async function memberFinderApp() {
  const app = offlineApp();
  const db = app.fakes.resetDb({
    members: [profile(IDS.owner, { display_name: 'Fictional Owner', profile_visibility: 'private', bio: 'OWNER_PRIVATE_CANARY' }),
      profile(IDS.published, { display_name: 'Fictional Ada', discipline: 'History', skills: ['TypeScript', 'Design'],
        project_description: 'Scripture reading group', seeking: 'People to discuss early Christian history',
        email: 'CANDIDATE_PRIVATE_EMAIL_CANARY', coherence_data: { value: 'CANDIDATE_PRIVATE_SCORE_CANARY' } }),
      profile(IDS.private, { display_name: 'PRIVATE_PERSON_CANARY', skills: ['history'], profile_visibility: 'private' })],
    communities: [{ id: IDS.community, slug: 'society-of-explorers', is_active: true }],
    community_members: [IDS.owner, IDS.published, IDS.private].map((member_id, i) => ({ member_id, community_id: IDS.community, joined_at: `2026-01-0${i + 1}` })),
  });
  db.strictSingle = true;
  const from = db.from.bind(db);
  db.from = table => {
    const q = from(table), select = q.select.bind(q), eq = q.eq.bind(q), exec = q.exec.bind(q);
    let joined = false;
    q.select = (columns, ...options) => { joined = typeof columns === 'string' && columns.includes('profile:members!community_members_member_id_fkey!inner('); return select(columns, ...options); };
    q.eq = (column, value) => { if (column === 'profile.profile_visibility') { q.filters.push(['profile-eq', column, value]); return q; } return eq(column, value); };
    q.exec = () => {
      if (!joined) return exec();
      const limit = q.lim; q.lim = undefined; const response = exec(); q.lim = limit;
      if (response.error) return response;
      const publication = q.filters.find(filter => filter[1] === 'profile.profile_visibility');
      assert.equal(publication?.[2], 'public');
      const rows = response.data.flatMap(row => {
        const published = db.rows('members').find(member => member.id === row.member_id && member.profile_visibility === publication[2]);
        return published ? [{ community_id: row.community_id, member_id: row.member_id, profile: published }] : [];
      });
      return { data: rows.slice(0, limit), error: null };
    };
    return q;
  };
  app.setMock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => db }));
  const signed = new Map();
  for (const id of [IDS.owner, IDS.published]) signed.set(id, await app.load('lib/auth/walletSession.ts').createWalletSessionValue(id));
  const routes = { '/api/members/discover': app.load('app/api/members/discover/route.ts').GET,
    '/api/auth/member': app.load('app/api/auth/member/route.ts').GET };
  return { db, browserCookies: id => ({ soe_auth_provider: 'wallet', soe_auth_intent: id,
    soe_auth_selection_v1: `v1.${id}.wallet.${id}`, soe_wallet_id: signed.get(id) }),
    async dispatch(path, headers = {}, actor = IDS.owner) {
    assert(routes[path], 'Unexpected fixture route');
    const request = new Request('https://soe.invalid' + path, { headers }); request.nextUrl = new URL(request.url);
    const cookies = { soe_auth_provider: 'wallet', soe_auth_intent: actor,
      soe_auth_selection_v1: `v1.${actor}.wallet.${actor}`, soe_wallet_id: signed.get(actor) };
    request.cookies = { get: name => cookies[name] ? { value: cookies[name] } : undefined };
    return routes[path](request);
  } };
}
