import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { offlineApp } from './offline-app.mjs';

const [psql, socket, port, database, user, reader, circleId, ...extra] = process.argv.slice(2);
assert.equal(extra.length, 0);
assert.match(realpathSync(socket), /^\/private\/tmp\/soe-circle-departure-[a-z0-9_]+\/staged\/socket$/);
assert.match(psql, /^\/opt\/homebrew\/opt\/postgresql@17\/bin\/psql$/);
for (const value of [reader, circleId]) assert.match(value, /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/);
assert.match(port, /^\d{4,5}$/);
assert.equal(user, 'soe_fixture_owner');

const app = offlineApp();
app.setMock('@/lib/getAuthenticatedMember', () => ({
  getAuthenticatedMember: async () => ({ memberId: reader, member: { id: reader } }),
}));
let queries = 0;
app.setMock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => ({
    async rpc(name, args) {
      assert.equal(name, 'soe_circle_detail_profiles');
      assert.equal(args.p_actor, reader);
      assert.equal(args.p_circle_id, circleId);
      queries++;
      const result = spawnSync(psql, [
        '-h', socket, '-p', port, '-U', user, '-d', database, '-X', '-qAt', '--no-password', '-v', 'ON_ERROR_STOP=1',
        '-c', `SET ROLE service_role; SELECT public.soe_circle_detail_profiles('${reader}','${circleId}');`,
      ], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin', LC_ALL: 'C' }, timeout: 5000 });
      assert.equal(result.status, 0, result.stderr);
      return { data: JSON.parse(result.stdout), error: null };
    },
  }),
}));

const { GET } = app.load('app/api/circles/[circleId]/route.ts');
const request = app.fakes.makeReq(undefined, { url: 'https://offline.invalid/api/circles/' + circleId });
request.method = 'GET';
const response = await GET(request, { params: Promise.resolve({ circleId }) });
assert.equal(response.status, 200, await response.clone().text());
assert.match(response.headers.get('cache-control'), /private.*no-store/);
const body = await response.json();
assert.equal(body.circle.id, circleId);
assert.equal(body.circle.status, 'completed');
assert.equal(body.circle.publicProfileId, null);
assert.equal(body.ended, true);
assert.equal(body.viewer.is_member, true);
assert.equal(body.viewer.is_host, false);
assert.equal(body.online_url, null);
assert.deepEqual(body.meetings, []);
assert.equal(body.capabilities.canReadConversation, true);
assert.equal(body.capabilities.canRsvp, false);
assert.equal(queries, 1);
console.log(JSON.stringify({ status: response.status, realDatabaseQueries: queries, canReadConversation: true, hasMeetingLink: false }));
