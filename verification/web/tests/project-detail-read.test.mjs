import test from 'node:test';
import assert from 'node:assert/strict';
import { projectDetailFixture, projectTableTransport, publicProject, ID, OTHER_ID, jsonReply, upstreamError } from './support/project-detail-read-app.mjs';

async function outcome(transport) {
  const fixture = projectDetailFixture(); fixture.setTransport(transport);
  const response = await fixture.read();
  const body = await response.json();
  assert.doesNotMatch(JSON.stringify(body), /PRIVATE_SYNTHETIC|synthetic-project-read|42501|57014|PGRST/);
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
  assert.equal(response.headers.get('surrogate-control'), 'no-store');
  assert.match(response.headers.get('vary'), /Cookie/);
  assert.match(response.headers.get('vary'), /Authorization/);
  return { fixture, response, body };
}

test('permitted zero rows and denials remain indistinguishable, including unknown/custom errors', async () => {
  const absent = await outcome(() => upstreamError('PGRST116', 406, 'The result contains 0 rows'));
  assert.equal(absent.response.status, 404);
  const cases = [
    ['42501', 403], ['42501', 401], ['28P01', 403], ['0L000', 403], ['0P000', 403],
    ['PGRST300', 500], ['PGRST301', 401], ['PGRST302', 401], ['PGRST303', 401],
    ['PT401', 401], ['PT403', 403], ['PT404', 404], ['P0001', 500], ['PRIVATE_CUSTOM', 503],
    ['PGRST003', 403], ['57014', 404], ['PGRST116', 406],
  ];
  for (const [code, status] of cases) {
    const result = await outcome(() => upstreamError(code, status));
    assert.equal(result.response.status, 404, code);
    assert.deepEqual(result.body, absent.body, code);
    assert.deepEqual([...result.response.headers], [...absent.response.headers], code);
    assert.equal(result.fixture.merges.length, 0);
  }
});

test('recognized temporary connection, pool and query failures return generic recoverable status', async () => {
  for (const [code, status] of [['PGRST000', 503], ['PGRST001', 503], ['PGRST002', 503], ['PGRST003', 504], ['08006', 503], ['53300', 503], ['57014', 500], ['57P01', 500], ['57P02', 500], ['57P03', 503]]) {
    const result = await outcome(() => upstreamError(code, status));
    assert.equal(result.response.status, 503, code);
    assert.deepEqual(result.body, { error: 'Project temporarily unavailable' });
    assert.equal(result.fixture.calls.length, 1);
    assert.equal(result.fixture.merges.length, 0);
  }
});

test('installed client handles network, abort, malformed JSON and generic gateway failures locally', async () => {
  for (const transport of [
    () => { throw new TypeError('PRIVATE_SYNTHETIC_NETWORK'); },
    () => { throw new DOMException('PRIVATE_SYNTHETIC_ABORT', 'AbortError'); },
    () => new Response('{', { status: 200, headers: { 'content-type': 'application/json' } }),
    ...[429, 502, 503, 504].map(status => () => new Response('PRIVATE_SYNTHETIC_GATEWAY', { status })),
  ]) {
    const result = await outcome(transport);
    assert.equal(result.response.status, 503);
    assert.deepEqual(result.body, { error: 'Project temporarily unavailable' });
    assert.equal(result.fixture.calls.length, 1);
    assert.equal(result.fixture.merges.length, 0);
  }
});

test('unknown failure and malformed row shapes retain masking instead of disclosing diagnostics', async () => {
  for (const transport of [
    () => upstreamError('UNKNOWN_ERROR', 500),
    () => new Response('PRIVATE_SYNTHETIC_POLICY', { status: 403 }),
    () => jsonReply(null), () => jsonReply([]), () => jsonReply({ title: 'PRIVATE_SYNTHETIC_ROW' }),
  ]) {
    const result = await outcome(transport);
    assert.equal(result.response.status, 404);
    assert.deepEqual(result.body, { error: 'Project not found' });
  }
});

test('active-only query preserves public projection; enrichment is an explicit double', async () => {
  const result = await outcome(() => jsonReply({ ...publicProject, proposer_email: 'PRIVATE_SYNTHETIC_EMAIL', private_notes: 'PRIVATE_SYNTHETIC_NOTES' }));
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body, { project: publicProject });
  assert.equal(result.fixture.calls.length, 1);
  const call = result.fixture.calls[0], url = new URL(call.url);
  assert.equal(call.method, 'GET'); assert.equal(call.accept, 'application/vnd.pgrst.object+json');
  assert.deepEqual([...url.searchParams], [['select', result.fixture.projection.PROJECT_DETAIL_SELECT], ['id', 'eq.' + ID], ['status', 'eq.active']]);
  assert.deepEqual(result.fixture.merges, [[publicProject]]);
});

test('non-active records, including missing or unexpected status, match the absent response without enrichment', async () => {
  const absent = await outcome(projectTableTransport([]));
  assert.equal(absent.response.status, 404);
  // All values are synthetic coverage; this does not claim a hosted status schema.
  for (const status of ['pending', 'draft', 'inactive', 'rejected', 'private', 'completed', 'archived', 'cancelled', 'ACTIVE', 'active ', '', null, undefined]) {
    const row = { ...publicProject, status, title: 'PRIVATE_SYNTHETIC_TITLE', description: 'PRIVATE_SYNTHETIC_DESCRIPTION', proposer_email: 'PRIVATE_SYNTHETIC_EMAIL' };
    const result = await outcome(projectTableTransport([row]));
    assert.equal(result.response.status, 404, String(status));
    assert.deepEqual(result.body, absent.body, String(status));
    assert.deepEqual([...result.response.headers], [...absent.response.headers], String(status));
    assert.equal(result.fixture.calls.length, 1);
    assert.equal(result.fixture.merges.length, 0);
  }
});

test('active status and requested identifier are both required; active rows retain only the public projection', async () => {
  const transport = projectTableTransport([
    { ...publicProject, status: 'pending', title: 'PRIVATE_SYNTHETIC_PENDING' },
    { ...publicProject, id: OTHER_ID, proposer_email: 'PRIVATE_SYNTHETIC_EMAIL', private_notes: 'PRIVATE_SYNTHETIC_NOTES' },
  ]);
  const fixture = projectDetailFixture(); fixture.setTransport(transport);
  const hidden = await fixture.read(ID);
  assert.equal(hidden.status, 404); assert.equal(fixture.merges.length, 0);
  assert.deepEqual(await hidden.json(), { error: 'Project not found' });
  const active = await fixture.read(OTHER_ID);
  assert.equal(active.status, 200);
  assert.deepEqual(await active.json(), { project: { ...publicProject, id: OTHER_ID } });
  assert.equal(fixture.merges.length, 1);
});

test('actual catalog and detail agree on active visibility, with the existing catalog error contract retained', async () => {
  const fixture = projectDetailFixture();
  fixture.setTransport(projectTableTransport([
    { ...publicProject, proposer_email: 'PRIVATE_SYNTHETIC_EMAIL' },
    { ...publicProject, id: OTHER_ID, status: 'draft', title: 'PRIVATE_SYNTHETIC_DRAFT' },
  ]));
  const catalog = await fixture.readCatalog(), body = await catalog.json();
  assert.equal(catalog.status, 200);
  assert.deepEqual(body.projects.map(row => row.id), [ID]);
  assert.doesNotMatch(JSON.stringify(body), /PRIVATE_SYNTHETIC/);
  assert.equal(new URL(fixture.calls[0].url).searchParams.get('status'), 'eq.active');
  assert.match(catalog.headers.get('cache-control'), /private.*no-store/);
  assert.equal((await fixture.read(ID)).status, 200);
  assert.equal((await fixture.read(OTHER_ID)).status, 404);
  fixture.setTransport(() => upstreamError('PGRST003', 504));
  const failure = await fixture.readCatalog();
  assert.equal(failure.status, 500);
  assert.deepEqual(await failure.json(), { projects: [], error: 'Failed to load projects' });
});

test('invalid identifier makes no client, query or enrichment call', async () => {
  const fixture = projectDetailFixture(); const response = await fixture.read('not-a-uuid');
  assert.equal(response.status, 404); assert.deepEqual(await response.json(), { error: 'Project not found' });
  assert.equal(fixture.clientCalls(), 0); assert.equal(fixture.calls.length, 0); assert.equal(fixture.merges.length, 0);
});

test('slow synthetic read resolves through the same contract once, with no automatic retry', async () => {
  const fixture = projectDetailFixture(); let resolve;
  fixture.setTransport(() => new Promise(r => { resolve = r; }));
  const pending = fixture.read();
  for (let i = 0; i < 20 && !resolve; i++) await new Promise(r => setImmediate(r));
  assert.equal(fixture.calls.length, 1);
  resolve(upstreamError('PGRST003', 504));
  const response = await pending;
  assert.equal(response.status, 503); assert.equal(fixture.calls.length, 1);
});
