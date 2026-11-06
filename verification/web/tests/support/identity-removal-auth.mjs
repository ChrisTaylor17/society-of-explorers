import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const [psql, socket, port, database, dbUser, subject, mode, ...extra] = process.argv.slice(2);
assert.equal(extra.length, 0);
assert(process.execArgv.some(arg => arg.endsWith('/deny-build-network.cjs')));
assert.match(realpathSync(socket), /^\/private\/tmp\/soe-circle-departure-[a-z0-9_]+\/staged\/socket$/);
assert.equal(psql, '/opt/homebrew/opt/postgresql@17/bin/psql');
assert.equal(dbUser, 'soe_fixture_owner');
assert.match(port, /^\d{4,5}$/);
assert.match(subject, /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/);
assert(['refused','ack_only','reference_blocks','commit_without_reply','hard_delete','lookup_absent'].includes(mode));

function query(sql, expectedSqlstate) {
  const result = spawnSync(psql, [
    '-h',socket,'-p',port,'-U',dbUser,'-d',database,'-X','-qAt','--no-password','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose',
    '-c', 'SET ROLE supabase_auth_admin; ' + sql,
  ], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin', LC_ALL: 'C' }, timeout: 5000 });
  if (expectedSqlstate) {
    assert.equal(result.status, 1);
    assert(result.stderr.includes('ERROR:  ' + expectedSqlstate + ':'), result.stderr);
  } else assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

const origin = 'https://auth-removal-fixture.invalid';
const serviceKey = 'FICTIONAL_SERVICE_KEY_FOR_ISOLATED_AUTH_TEST';
const calls = [];
const client = createClient(origin, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: async (input, init) => {
    const request = new Request(input, init);
    assert.equal(request.url, origin + '/auth/v1/admin/users/' + subject);
    assert.equal(request.headers.get('authorization'), 'Bearer ' + serviceKey);
    assert.equal(request.headers.get('x-supabase-api-version'), '2024-01-01');
    calls.push(request.method);
    if (request.method === 'GET') {
      const id = query(`SELECT id FROM auth.users WHERE id='${subject}'`);
      return id ? Response.json({ id }) : Response.json({ code: 'user_not_found', message: 'Fixture user missing' }, {
        status: 404, headers: { 'x-supabase-api-version': '2024-01-01' },
      });
    }
    assert.equal(request.method, 'DELETE');
    assert.deepEqual(await request.json(), { should_soft_delete: false });
    if (mode === 'refused') return Response.json({ message: 'Fixture provider unavailable' }, { status: 503 });
    if (mode === 'reference_blocks') {
      query(`DELETE FROM auth.users WHERE id='${subject}'`, '23503');
      return Response.json({ message: 'Fixture provider reference blocks removal' }, { status: 500 });
    }
    if (mode !== 'ack_only') {
      assert.equal(query(`DELETE FROM auth.users WHERE id='${subject}' RETURNING id`), subject);
      if (mode === 'commit_without_reply') return Response.json({ message: 'Fixture response interrupted' }, { status: 502 });
    }
    return Response.json({ id: subject });
  } },
});

const before = await client.auth.admin.getUserById(subject);
if (mode === 'lookup_absent') {
  assert.equal(before.error?.status, 404);
  assert.equal(before.error?.code, 'user_not_found');
  assert.deepEqual(calls, ['GET']);
  console.log(JSON.stringify({ mode, calls, absentAfter: true }));
} else {
  assert.equal(before.data.user?.id, subject);
  assert.equal(before.error, null);
  const deleted = await client.auth.admin.deleteUser(subject, false);
  const refusedStatus = { refused: 503, reference_blocks: 500, commit_without_reply: 502 }[mode];
  if (refusedStatus) {
    assert.equal(deleted.error?.status, refusedStatus);
  } else {
    assert.equal(deleted.error, null);
    assert.equal(deleted.data.user?.id, subject);
  }
  const after = await client.auth.admin.getUserById(subject);
  const absentAfter = mode === 'commit_without_reply' || mode === 'hard_delete';
  if (absentAfter) {
    assert.equal(after.error?.status, 404);
    assert.equal(after.error?.code, 'user_not_found');
  } else {
    assert.equal(after.error, null);
    assert.equal(after.data.user?.id, subject);
  }
  assert.deepEqual(calls, ['GET','DELETE','GET']);
  console.log(JSON.stringify({ mode, calls, absentAfter }));
}
