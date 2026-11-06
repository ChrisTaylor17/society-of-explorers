import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { offlineApp } from './offline-app.mjs';

const [psql, socket, port, database, owner, memberId, mode, ...extra] = process.argv.slice(2);
assert.equal(extra.length, 0);
assert.equal(psql, '/opt/homebrew/opt/postgresql@17/bin/psql');
assert.match(realpathSync(socket), /^\/private\/tmp\/soe-waddle-privacy-[a-z0-9_]+\/db\/socket$/);
assert.match(port, /^\d{4,5}$/);
assert.match(database, /^soe_waddle_(stage|restored)$/);
assert.equal(owner, 'soe_fixture_owner');
assert.match(memberId, /^[0-9a-f-]{36}$/);
assert(['write-and-read', 'read-restored', 'read-before-review'].includes(mode));
assert(process.execArgv.some(arg => arg.endsWith('/deny-build-network.cjs')));

const origin = 'https://waddle-fixture.invalid';
const serviceKey = 'SYNTHETIC_WADDLE_SERVICE_ONLY';
const fields = 'id,audio_url,transcription,thinker_id,thinker_reaction,created_at';
const transcript = 'Synthetic reviewed publication';
const audioPrefix = origin + '/storage/v1/object/public/waddles/';
const stored = [];
const requests = [];
const query = sql => {
  const result = spawnSync(psql, ['-h',socket,'-p',port,'-U',owner,'-d',database,'-X','-qAt',
    '--no-password','-v','ON_ERROR_STOP=1','-c','SET ROLE service_role; ' + sql], {
    encoding: 'utf8', env: { PATH: '/usr/bin:/bin', LC_ALL: 'C' }, timeout: 5000,
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};
const client = createClient(origin, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(url.origin, origin);
    assert.equal(request.headers.get('authorization'), 'Bearer ' + serviceKey);
    if (url.pathname.startsWith('/storage/v1/object/waddles/')) {
      const path = url.pathname.slice('/storage/v1/object/waddles/'.length);
      assert.match(path, new RegExp('^' + memberId + '/[0-9]+-[a-f0-9-]{36}\\.webm$'));
      assert.equal(request.method, 'POST');
      assert.equal(request.headers.get('content-type'), 'audio/webm');
      assert.deepEqual([...new Uint8Array(await request.arrayBuffer())], [26,69,223,163,1]);
      stored.push(audioPrefix + path);
      requests.push('storage');
      return Response.json({ Key: 'waddles/' + path });
    }
    assert.equal(url.pathname, '/rest/v1/waddles');
    assert.equal(url.searchParams.get('select'), fields);
    if (request.method === 'GET') {
      assert.equal(url.searchParams.get('is_public'), 'eq.true');
      assert.equal(url.searchParams.get('public_consent_at'), 'not.is.null');
      assert.equal(url.searchParams.get('order'), 'created_at.desc');
      assert.equal(url.searchParams.get('limit'), '20');
      requests.push('list');
      return Response.json(query(`SELECT coalesce(jsonb_agg(to_jsonb(row) ORDER BY created_at DESC),'[]'::jsonb)
        FROM (SELECT ${fields} FROM public.waddles WHERE is_public IS TRUE AND public_consent_at IS NOT NULL
        ORDER BY created_at DESC LIMIT 20) row`));
    }
    assert.equal(request.method, 'POST');
    const { public_consent_at: consent, ...row } = await request.json();
    assert.match(consent, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    assert.deepEqual(row, { member_id: memberId, audio_url: stored[0], transcription: transcript,
      thinker_id: null, thinker_reaction: null, is_public: true });
    requests.push('publish');
    return Response.json(query(`WITH saved AS (
        INSERT INTO public.waddles(member_id,audio_url,transcription,is_public,public_consent_at)
        VALUES('${memberId}','${stored[0]}','${transcript}',true,'${consent}') RETURNING ${fields}
      ) SELECT to_jsonb(saved) FROM saved`));
  } },
});
const app = offlineApp();
app.context.process.env.NEXT_PUBLIC_SUPABASE_URL = origin;
app.context.File = File;
let signedIn = true;
let authChecks = 0;
app.setMock('@/lib/getAuthenticatedMember', () => ({
  getAuthenticatedMember: async () => {
    authChecks++;
    return signedIn ? { memberId, member: { id: memberId } } : null;
  },
}));
app.setMock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => client }));
const route = app.load('app/api/waddle/route.ts');

function publication({ confirm, expected = memberId, mime = 'audio/webm;codecs=opus', from = origin } = {}) {
  const body = new FormData();
  body.append('transcription', transcript);
  body.append('expectedMemberId', expected);
  if (confirm) body.append('publishPublicly', 'true');
  body.append('audio', new Blob([Uint8Array.of(26,69,223,163,1)], { type: mime }), 'waddle.webm');
  return new Request(origin + '/api/waddle', { method: 'POST', body, headers: { origin: from } });
}

if (mode === 'write-and-read') {
  assert.equal((await route.POST(publication({ confirm: true, from: 'https://unrelated.invalid' }))).status, 403);
  assert.equal(authChecks, 0);
  signedIn = false;
  assert.equal((await route.POST(publication({ confirm: true }))).status, 401);
  signedIn = true;
  assert.equal((await route.POST(publication())).status, 403);
  assert.equal((await route.POST(publication({ confirm: true, expected: 'different-account' }))).status, 409);
  assert.equal((await route.POST(publication({ confirm: true, mime: 'text/html' }))).status, 400);
  assert.deepEqual(requests, []);
  const accepted = await route.POST(publication({ confirm: true }));
  assert.equal(accepted.status, 200, await accepted.clone().text());
  assert.match(accepted.headers.get('cache-control'), /private.*no-store/);
  assert.equal((await accepted.json()).waddle.transcription, transcript);
  assert.deepEqual(requests, ['storage', 'publish']);
}

const response = await route.GET();
assert.equal(response.status, 200);
assert.match(response.headers.get('cache-control'), /private.*no-store/);
const { waddles } = await response.json();
assert.equal(waddles.length, mode === 'read-before-review' ? 0 : 4);
if (mode !== 'read-before-review') {
  assert(waddles.some(w => w.transcription === transcript && w.audio_url?.startsWith(audioPrefix + memberId)));
  assert(waddles.some(w => w.transcription === 'Synthetic public recording' && w.audio_url?.startsWith(audioPrefix)));
  for (const title of ['Synthetic public external link', 'Synthetic public escaped path']) {
    assert.equal(waddles.find(w => w.transcription === title)?.audio_url, null);
  }
}
assert(!JSON.stringify(waddles).includes('SYNTHETIC_PRIVATE_WADDLE'));
assert(!JSON.stringify(waddles).includes('SYNTHETIC_UNMARKED_WADDLE'));
assert(!JSON.stringify(waddles).includes('SYNTHETIC_PUBLIC_UNREVIEWED'));
assert(waddles.every(w => Object.keys(w).sort().join(',') === fields.split(',').sort().join(',')));
console.log(JSON.stringify({ mode, requests, publicRows: waddles.length, refusedBeforeEffects: mode === 'write-and-read' ? 5 : 0 }));
