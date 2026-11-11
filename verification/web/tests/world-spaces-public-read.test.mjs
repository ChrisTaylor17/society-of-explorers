import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { offlineApp } from './support/offline-app.mjs';

// Actual handlers and installed Supabase client; identity and HTTP transport are
// synthetic. No hosted request, database mutation, provider call or real member.
const { createClient } = createRequire(new URL('../../../package.json', import.meta.url))('@supabase/supabase-js');
const ID = '11111111-1111-4111-8111-111111111111';
const PRIVATE_ID = '22222222-2222-4222-8222-222222222222';
const MEMBER = '33333333-3333-4333-8333-333333333333';
const AUTH = { memberId: MEMBER, member: { id: MEMBER, supabase_auth_id: MEMBER } };
const space = {
  id: ID, name: 'Public reading room', slug: 'public-reading-room', description: 'A published space summary.',
  city: 'Boston', country: 'US', space_type: 'library', status: 'active', total_scans: 2, avg_quality: 80,
  cover_url: 'https://example.invalid/public-cover.jpg', created_at: '2026-11-11T00:00:00Z', updated_at: '2026-11-11T00:00:00Z',
  address: 'Synthetic published location', lat: 42, lng: -71,
  host_id: 'PRIVATE_SYNTHETIC_HOST', metadata: { private: 'PRIVATE_SYNTHETIC_METADATA' }, private_notes: 'PRIVATE_SYNTHETIC_NOTES',
};
const summaryKeys = ['id', 'name', 'slug', 'description', 'city', 'country', 'space_type', 'total_scans', 'avg_quality', 'cover_url', 'created_at'];
const summary = Object.fromEntries(summaryKeys.map(key => [key, space[key]]));
const detailKeys = [...summaryKeys, 'address', 'lat', 'lng', 'status', 'updated_at'];

function fixture({ rows = [space], auth = null, error = false } = {}) {
  const app = offlineApp(), calls = [], counts = { admin: 0, auth: 0 };
  const tables = {
    spaces: rows,
    scan_uploads: [{ id: PRIVATE_ID, space_id: ID, scan_type: 'photo', quality_score: 80, verified: true, exp_awarded: 0, is_first_scan: true, created_at: space.created_at, file_url: 'PRIVATE_SYNTHETIC_FILE', scanner_id: 'PRIVATE_SYNTHETIC_SCANNER', metadata: { private: true } }],
    spatial_annotations: [{ id: PRIVATE_ID, space_id: ID, content: 'Synthetic member-visible annotation.', annotation_type: 'note', position_x: 0, position_y: 0, position_z: 0, exp_awarded: 0, created_at: space.created_at, author_id: 'PRIVATE_SYNTHETIC_AUTHOR', metadata: { private: true } }],
  };
  const client = createClient('https://world-fixture.invalid', 'UNISSUED_SYNTHETIC_KEY', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init = {}) => {
      const url = new URL(String(input));
      assert.equal(url.origin, 'https://world-fixture.invalid');
      assert.equal(init.method ?? 'GET', 'GET', 'Read handlers must not mutate data');
      const table = url.pathname.split('/').at(-1);
      assert.ok(Object.hasOwn(tables, table), 'Unreviewed table ' + table);
      calls.push({ table, query: Object.fromEntries(url.searchParams) });
      if (error) return Response.json({ code: '42501', message: 'PRIVATE_SYNTHETIC_DATABASE_FAILURE' }, { status: 403 });
      let selected = tables[table];
      for (const field of ['id', 'space_id', 'status']) {
        const filter = url.searchParams.get(field);
        if (filter !== null) { assert.ok(filter.startsWith('eq.')); selected = selected.filter(row => row[field] === filter.slice(3)); }
      }
      const city = url.searchParams.get('city');
      if (city !== null) {
        assert.ok(city.startsWith('ilike.%') && city.endsWith('%'));
        selected = selected.filter(row => row.city?.toLowerCase().includes(city.slice(7, -1).toLowerCase()));
      }
      // Deliberately return extra private columns so handler projection is tested
      // independently of the exact SELECT sent by the installed client.
      return Response.json(selected);
    } },
  });
  app.setMock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => { counts.admin++; return client; } }));
  app.setMock('@/lib/getAuthenticatedMember', () => ({ getAuthenticatedMember: async () => { counts.auth++; return auth; } }));
  const list = app.load('app/api/world/spaces/route.ts'), detail = app.load('app/api/world/spaces/[id]/route.ts');
  const request = path => Object.assign(new Request('https://soe.invalid' + path), { nextUrl: new URL('https://soe.invalid' + path) });
  return {
    calls, counts,
    list: (query = '') => list.GET(request('/api/world/spaces' + query)),
    detail: (id = ID) => detail.GET(request('/api/world/spaces/' + id), { params: Promise.resolve({ id }) }),
  };
}

async function receipt(response, status) {
  assert.equal(response.status, status);
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
  const body = await response.json();
  assert.doesNotMatch(JSON.stringify(body), /PRIVATE_SYNTHETIC|42501/);
  return body;
}

test('public directory rejects non-active status, duplicate and unknown query keys before authentication or admin access', async () => {
  const queries = ['pending', 'archived', 'draft', 'unknown', '', 'ACTIVE', ' active '].map(status => '?status=' + encodeURIComponent(status));
  queries.push('?status=active&status=pending', '?status=active&status=active', '?city=Boston&city=London', '?host_id=' + MEMBER, '?unexpected=1', '?city=' + 'x'.repeat(161));
  for (const auth of [null, AUTH]) {
    for (const query of queries) {
      const f = fixture({ auth });
      await receipt(await f.list(query), 400);
      assert.deepEqual(f.counts, { auth: 0, admin: 0 }); assert.deepEqual(f.calls, []);
    }
  }
});

test('anonymous directory reads only active rows and returns the existing coarse allowlist', async () => {
  for (const query of ['', '?status=active']) {
    const f = fixture({ rows: [space, ...['pending', 'archived', 'unknown', null, undefined].map(status => ({ ...space, id: PRIVATE_ID, status, name: 'PRIVATE_SYNTHETIC_HIDDEN' }))] });
    assert.deepEqual(await receipt(await f.list(query), 200), { spaces: [summary] });
    assert.deepEqual(f.counts, { auth: 0, admin: 1 }); assert.equal(f.calls.length, 1);
    assert.deepEqual(f.calls[0], { table: 'spaces', query: { select: summaryKeys.join(','), status: 'eq.active', order: 'created_at.desc' } });
  }
});

test('bounded city search keeps the active predicate and a real empty result remains distinguishable from error', async () => {
  const f = fixture();
  assert.deepEqual(await receipt(await f.list('?city=%20bos%20&status=active'), 200), { spaces: [summary] });
  assert.equal(f.calls[0].query.city, 'ilike.%bos%'); assert.equal(f.calls[0].query.status, 'eq.active');
  assert.deepEqual(await receipt(await f.list('?city=London'), 200), { spaces: [] });
  const failing = fixture({ error: true });
  assert.deepEqual(await receipt(await failing.list(), 500), { error: 'Failed to load spaces' });
});

test('full detail rejects anonymous and malformed requests before admin access', async () => {
  for (const id of [ID, PRIVATE_ID]) {
    const f = fixture();
    await receipt(await f.detail(id), 401);
    assert.deepEqual(f.counts, { auth: 1, admin: 0 }); assert.deepEqual(f.calls, []);
  }
  for (const id of ['bad-id', ID + 'x', "1' or '1'='1"]) {
    const f = fixture({ auth: AUTH });
    await receipt(await f.detail(id), 400);
    assert.deepEqual(f.counts, { auth: 0, admin: 0 }); assert.deepEqual(f.calls, []);
  }
});

test('pending, archived, unknown and absent full details match the missing response with no scan or annotation reads', async () => {
  for (const status of ['pending', 'archived', 'unknown', 'ACTIVE', 'active ', null, undefined]) {
    const f = fixture({ auth: AUTH, rows: [{ ...space, status, name: 'PRIVATE_SYNTHETIC_HIDDEN', host_id: MEMBER }] });
    assert.deepEqual(await receipt(await f.detail(), 404), { error: 'Space not found' });
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].table, 'spaces');
    assert.equal(f.calls[0].query.status, 'eq.active'); assert.equal(f.calls[0].query.id, 'eq.' + ID);
  }
  const absent = fixture({ auth: AUTH, rows: [] });
  assert.deepEqual(await receipt(await absent.detail(), 404), { error: 'Space not found' });
  assert.deepEqual(absent.calls.map(call => call.table), ['spaces']);
});

test('verified member detail preserves the active contract and excludes host, file, author and metadata fields', async () => {
  const f = fixture({ auth: AUTH }), body = await receipt(await f.detail(), 200);
  assert.deepEqual(body.space, Object.fromEntries(detailKeys.map(key => [key, space[key]])));
  assert.equal(body.scans.length, 1); assert.equal(body.annotations.length, 1);
  assert.equal(body.annotations[0].content, 'Synthetic member-visible annotation.');
  assert.deepEqual(f.calls.map(call => call.table), ['spaces', 'scan_uploads', 'spatial_annotations']);
  assert.equal(f.calls[0].query.status, 'eq.active');
  assert.equal(f.calls[1].query.space_id, 'eq.' + ID); assert.equal(f.calls[2].query.space_id, 'eq.' + ID);
  for (const call of f.calls) assert.doesNotMatch(call.query.select, /\*|host_id|file_url|author_id|scanner_id|metadata/);
});

test('detail lookup failure is generic and does not attempt secondary queries', async () => {
  const f = fixture({ auth: AUTH, error: true });
  assert.deepEqual(await receipt(await f.detail(), 500), { error: 'Failed to load space' });
  assert.deepEqual(f.calls.map(call => call.table), ['spaces']);
});
