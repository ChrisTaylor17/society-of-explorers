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
const feedFields = fields + ',member_id';
const transcript = 'Synthetic reviewed publication';
const textOnly = 'Synthetic text-only publication';
const audioPrefix = origin + '/storage/v1/object/public/waddles/';
const legacyKey = memberId + '/1793960000000.webm';
const audioBytes = Uint8Array.of(26,69,223,163,1);
const objectKeys = new Set([legacyKey]);
const stored = [];
const requests = [];
const playbackChecks = [];
let bucket = { id: 'waddles', public: false };
let failUpload = false;
let failInsert = false;
let audioFault;
const query = sql => {
  const result = spawnSync(psql, ['-h',socket,'-p',port,'-U',owner,'-d',database,'-X','-qAt',
    '--no-password','-v','ON_ERROR_STOP=1','-c','SET ROLE service_role; ' + sql], {
    encoding: 'utf8', env: { PATH: '/usr/bin:/bin', LC_ALL: 'C' }, timeout: 5000,
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};
if (mode === 'read-restored') {
  const restoredKey = query(`SELECT to_jsonb(audio_url) FROM public.waddles WHERE transcription='${transcript}'`);
  objectKeys.add(restoredKey);
}
const client = createClient(origin, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(url.origin, origin);
    assert.equal(request.headers.get('authorization'), 'Bearer ' + serviceKey);
    if (url.pathname === '/storage/v1/bucket/waddles') {
      assert.equal(request.method, 'GET');
      requests.push('bucket');
      return Response.json(bucket);
    }
    if (url.pathname.startsWith('/storage/v1/object/waddles/')) {
      const path = url.pathname.slice('/storage/v1/object/waddles/'.length);
      assert.match(path, new RegExp('^' + memberId + '/[0-9]+-[a-f0-9-]{36}\\.webm$'));
      assert.equal(request.method, 'POST');
      assert.equal(request.headers.get('content-type'), 'audio/webm');
      assert.deepEqual(new Uint8Array(await request.arrayBuffer()), audioBytes);
      assert.equal(request.headers.get('x-upsert'), 'false');
      requests.push('upload');
      if (failUpload) return Response.json({ error: 'fixture upload failure' }, { status: 500 });
      stored.push(path);
      objectKeys.add(path);
      return Response.json({ Key: 'waddles/' + path });
    }
    assert.equal(url.pathname, '/rest/v1/waddles');
    if (request.method === 'GET') {
      assert.equal(url.searchParams.get('is_public'), 'eq.true');
      assert.equal(url.searchParams.get('public_consent_at'), 'not.is.null');
      const idFilter = url.searchParams.get('id');
      if (idFilter) {
        assert.match(idFilter, /^eq\.[a-f0-9-]{36}$/);
        assert.equal(url.searchParams.get('select'), 'audio_url,member_id');
        requests.push('lookup');
        return Response.json(query(`SELECT coalesce(jsonb_agg(to_jsonb(row)),'[]'::jsonb)
          FROM (SELECT audio_url,member_id FROM public.waddles WHERE id='${idFilter.slice(3)}'
          AND is_public IS TRUE AND public_consent_at IS NOT NULL) row`));
      }
      assert.equal(url.searchParams.get('select'), feedFields);
      assert.equal(url.searchParams.get('order'), 'created_at.desc');
      assert.equal(url.searchParams.get('limit'), '20');
      requests.push('list');
      return Response.json(query(`SELECT coalesce(jsonb_agg(to_jsonb(row) ORDER BY created_at DESC),'[]'::jsonb)
        FROM (SELECT ${feedFields} FROM public.waddles WHERE is_public IS TRUE AND public_consent_at IS NOT NULL
        ORDER BY created_at DESC LIMIT 20) row`));
    }
    assert.equal(request.method, 'POST');
    assert.equal(url.searchParams.get('select'), feedFields);
    const { public_consent_at: consent, ...row } = await request.json();
    assert.match(consent, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    const withAudio = row.transcription === transcript;
    const key = withAudio ? stored.at(-1) : '';
    const text = withAudio ? transcript : textOnly;
    assert.deepEqual(row, { member_id: memberId, audio_url: key, transcription: text,
      thinker_id: null, thinker_reaction: null, is_public: true });
    requests.push('publish');
    if (failInsert) return Response.json({ code: 'XX000', message: 'fixture insert failure' }, { status: 500 });
    return Response.json(query(`WITH saved AS (
        INSERT INTO public.waddles(member_id,audio_url,transcription,is_public,public_consent_at)
        VALUES('${memberId}','${key}','${text}',true,'${consent}') RETURNING ${feedFields}
      ) SELECT to_jsonb(saved) FROM saved`));
  } },
});
const app = offlineApp();
app.context.process.env.NEXT_PUBLIC_SUPABASE_URL = origin;
app.context.File = File;
app.context.TransformStream = TransformStream;
app.context.fetch = async (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  const prefix = '/storage/v1/object/authenticated/waddles/';
  assert.equal(url.origin, origin);
  assert(url.pathname.startsWith(prefix));
  assert(objectKeys.has(url.pathname.slice(prefix.length)));
  assert.equal(request.cache, 'no-store');
  assert.equal(request.redirect, 'error');
  assert.equal(request.headers.get('authorization'), 'Bearer ' + serviceKey);
  assert.equal(request.headers.get('apikey'), serviceKey);
  assert.equal(request.headers.get('cookie'), null);
  assert.equal(request.headers.get('accept-encoding'), 'identity');
  const headers = new Headers({ 'Content-Type': 'audio/webm; codecs=opus', ETag: '"fixture-audio"' });
  if (request.method === 'HEAD') {
    requests.push('audio-head');
    assert.equal(request.headers.get('range'), null);
    headers.set('Content-Length', String(audioFault === 'oversize' ? 10 * 1024 * 1024 + 1 : audioBytes.length));
    if (audioFault === 'wrong-type') headers.set('Content-Type', 'text/html');
    return new Response(null, { headers });
  }
  assert.equal(request.method, 'GET');
  assert.equal(request.headers.get('if-match'), '"fixture-audio"');
  requests.push('audio-get');
  const range = request.headers.get('range');
  const match = range ? /^bytes=(\d+)-(\d+)$/.exec(range) : null;
  if (range) assert(match);
  const [start, end] = match ? match.slice(1).map(Number) : [0, audioBytes.length - 1];
  if (match) headers.set('Content-Range', `bytes ${start}-${end}/${audioBytes.length}`);
  if (audioFault === 'wrong-range') headers.set('Content-Range', `bytes 0-0/${audioBytes.length}`);
  headers.set('Content-Length', String(end - start + 1));
  const endOffset = audioFault === 'short-body' ? end : end + 1;
  return new Response(audioBytes.slice(start, endOffset), { headers, status: match ? 206 : 200 });
};
let signedIn = true;
let authChecks = 0;
app.setMock('@/lib/getAuthenticatedMember', () => ({
  getAuthenticatedMember: async () => {
    authChecks++;
    return signedIn ? { memberId, member: { id: memberId } } : null;
  },
}));
app.setMock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => client,
  getSupabaseAdminConfig: () => ({ url: origin, serviceRoleKey: serviceKey }),
}));
const route = app.load('app/api/waddle/route.ts');
const audio = app.load('app/api/waddle/[id]/audio/route.ts');

function publication({ confirm, expected = memberId, mime = 'audio/webm;codecs=opus', from = origin, bytes = audioBytes } = {}) {
  const body = new FormData();
  body.append('transcription', bytes ? transcript : textOnly);
  body.append('expectedMemberId', expected);
  if (confirm) body.append('publishPublicly', 'true');
  if (bytes) body.append('audio', new Blob([bytes], { type: mime }), 'waddle.webm');
  return new Request(origin + '/api/waddle', { method: 'POST', body, headers: { origin: from } });
}

function play(id, method = 'GET', headers = {}) {
  const context = { params: Promise.resolve({ id }) };
  return audio[method](new Request(`${origin}/api/waddle/${id}/audio`, { method, headers }), context);
}

function idFor(title) {
  return query(`SELECT to_jsonb(id) FROM public.waddles WHERE transcription='${title}'`);
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
  assert.equal((await route.POST(publication({ confirm: true, bytes: Uint8Array.of(1,2,3,4,5) }))).status, 400);
  assert.deepEqual(requests, []);

  for (const refusedBucket of [{ id: 'waddles', public: true }, { id: 'other', public: false }]) {
    bucket = refusedBucket;
    assert.equal((await route.POST(publication({ confirm: true }))).status, 503);
    assert.equal(requests.at(-1), 'bucket');
  }
  assert.deepEqual(requests, ['bucket', 'bucket']);
  bucket = { id: 'waddles', public: false };
  failUpload = true;
  assert.equal((await route.POST(publication({ confirm: true }))).status, 500);
  failUpload = false;
  assert.deepEqual(requests.slice(-2), ['bucket', 'upload']);
  failInsert = true;
  assert.equal((await route.POST(publication({ confirm: true }))).status, 500);
  failInsert = false;
  assert.equal(query(`SELECT to_jsonb(count(*)) FROM public.waddles WHERE transcription='${transcript}'`), 0);
  assert.deepEqual(requests.slice(-3), ['bucket', 'upload', 'publish']);
  const accepted = await route.POST(publication({ confirm: true }));
  assert.equal(accepted.status, 200, await accepted.clone().text());
  assert.match(accepted.headers.get('cache-control'), /private.*no-store/);
  const { waddle } = await accepted.json();
  assert.equal(waddle.transcription, transcript);
  assert.equal(waddle.audio_url, `/api/waddle/${waddle.id}/audio`);
  assert.deepEqual(requests.slice(-3), ['bucket', 'upload', 'publish']);
  assert.equal(stored.length, 2);
  bucket = { id: 'waddles', public: true };
  const acceptedText = await route.POST(publication({ confirm: true, bytes: null }));
  assert.equal(acceptedText.status, 200);
  assert.equal((await acceptedText.json()).waddle.audio_url, null);
  assert.deepEqual(requests.slice(-2), ['publish', 'publish']);
  bucket = { id: 'waddles', public: false };
}

const response = await route.GET();
assert.equal(response.status, 200);
assert.match(response.headers.get('cache-control'), /private.*no-store/);
const { waddles } = await response.json();
assert.equal(waddles.length, mode === 'read-before-review' ? 0 : 7);
if (mode !== 'read-before-review') {
  for (const title of [transcript, 'Synthetic public recording']) {
    const published = waddles.find(w => w.transcription === title);
    assert.equal(published.audio_url, `/api/waddle/${published.id}/audio`);
  }
  for (const title of [textOnly, 'Synthetic public external link', 'Synthetic public escaped path',
    'Synthetic public other owner', 'Synthetic archived Twiddle audio']) {
    assert.equal(waddles.find(w => w.transcription === title)?.audio_url, null);
  }
}
assert(!JSON.stringify(waddles).includes(audioPrefix));
assert(!JSON.stringify(waddles).includes(memberId));
assert(!JSON.stringify(waddles).includes('INTERNAL_FIXTURE_TOKEN'));
assert(!JSON.stringify(waddles).includes('SYNTHETIC_PRIVATE_WADDLE'));
assert(!JSON.stringify(waddles).includes('SYNTHETIC_UNMARKED_WADDLE'));
assert(!JSON.stringify(waddles).includes('SYNTHETIC_PUBLIC_UNREVIEWED'));
assert(waddles.every(w => Object.keys(w).sort().join(',') === fields.split(',').sort().join(',')));

const legacyId = idFor('Synthetic public recording');
let mark = requests.length;
assert.equal((await play('malformed-id')).status, 404);
assert.equal(requests.length, mark);
const denied = [
  'SYNTHETIC_PRIVATE_WADDLE', 'SYNTHETIC_PUBLIC_UNREVIEWED', 'Synthetic public external link',
  'Synthetic public escaped path', 'Synthetic public other owner', 'Synthetic archived Twiddle audio',
  mode === 'read-before-review' ? 'Synthetic public recording' : textOnly,
];
for (const title of denied) {
  const refused = await play(idFor(title));
  assert.equal(refused.status, 404);
  assert.equal(await refused.text(), '');
  assert.match(refused.headers.get('cache-control'), /private.*no-store/);
}
assert.deepEqual(requests.slice(mark), Array(denied.length).fill('lookup'));
playbackChecks.push('Unavailable, unconsented, cross-owner and unsupported rows never reach object storage.');

if (mode !== 'read-before-review') {
  for (const refusedBucket of [{ id: 'waddles', public: true }, { id: 'other', public: false }]) {
    bucket = refusedBucket;
    assert.equal((await play(legacyId)).status, 503);
    assert.deepEqual(requests.slice(-2), ['lookup', 'bucket']);
  }
  bucket = { id: 'waddles', public: false };
  playbackChecks.push('A public or mismatched bucket prevents playback before the object request.');

  const head = await play(legacyId, 'HEAD', { Range: 'bytes=0-1' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-length'), '5');
  assert.equal(head.headers.get('accept-ranges'), 'bytes');
  assert.equal(head.headers.get('content-type'), 'audio/webm');
  assert.equal(await head.text(), '');
  assert.deepEqual(requests.slice(-3), ['lookup', 'bucket', 'audio-head']);

  const full = await play(legacyId, 'GET', { Range: 'bytes=0-1', 'If-Range': '"old-etag"', Cookie: 'must-not-forward' });
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(full.headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.match(full.headers.get('cache-control'), /private.*no-store/);
  assert(!JSON.stringify([...full.headers]).includes(origin));
  assert(!JSON.stringify([...full.headers]).includes(serviceKey));
  assert.deepEqual(new Uint8Array(await full.arrayBuffer()), audioBytes);

  const newId = idFor(transcript);
  const part = await play(newId, 'GET', { Range: 'bytes=-3', 'If-Range': '"fixture-audio"' });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), 'bytes 2-4/5');
  assert.equal(part.headers.get('content-length'), '3');
  assert.deepEqual(new Uint8Array(await part.arrayBuffer()), audioBytes.slice(2));
  for (const Range of ['bytes=5-', 'bytes=0-1,3-4']) {
    const invalid = await play(newId, 'GET', { Range });
    assert.equal(invalid.status, 416);
    assert.equal(invalid.headers.get('content-range'), 'bytes */5');
    assert.deepEqual(requests.slice(-3), ['lookup', 'bucket', 'audio-head']);
  }
  playbackChecks.push('Legacy and new keys support same-origin HEAD, full GET, and a checked single byte range.');

  for (const fault of ['oversize', 'wrong-type', 'wrong-range', 'short-body']) {
    audioFault = fault;
    const refused = await play(newId, 'GET', { Range: 'bytes=1-3' });
    if (fault === 'short-body') await assert.rejects(refused.arrayBuffer(), /Incomplete Waddle audio/);
    else assert.equal(refused.status, 503);
    if (['oversize', 'wrong-type'].includes(fault)) assert.equal(requests.at(-1), 'audio-head');
  }
  audioFault = undefined;
  playbackChecks.push('Oversize metadata, a wrong MIME type, wrong Content-Range, and truncated bytes fail closed.');

  if (mode === 'write-and-read') {
    query(`WITH changed AS (UPDATE public.waddles SET public_consent_at=NULL WHERE id='${newId}' RETURNING id) SELECT to_jsonb(id) FROM changed`);
    mark = requests.length;
    assert.equal((await play(newId)).status, 404);
    assert.deepEqual(requests.slice(mark), ['lookup']);
    query(`WITH changed AS (UPDATE public.waddles SET public_consent_at=now() WHERE id='${newId}' RETURNING id) SELECT to_jsonb(id) FROM changed`);
    playbackChecks.push('Revoking recorded consent blocks the next request before any storage access.');
  }
}

console.log(JSON.stringify({ mode, requests, playbackChecks, publicRows: waddles.length, refusedBeforeEffects: mode === 'write-and-read' ? 6 : 0 }));
