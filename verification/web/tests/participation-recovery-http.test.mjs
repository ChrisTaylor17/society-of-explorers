import test from 'node:test';
import assert from 'node:assert/strict';
import { participationApp, IDS } from './support/participation-app.mjs';
import { creationInput, requestId } from './support/participation-db.mjs';

async function response(a, path, method = 'GET', body, expected = 200) {
  const reviewed = method === 'POST' && (path === '/api/circles' || path.endsWith('/complete')) ? { expectedMemberId: a.memberId, ...body } : body;
  const result = await a.dispatch(path, method, reviewed);
  assert.equal(result.status, expected, await result.clone().text());
  assert.match(result.headers.get('cache-control'), /private.*no-store/);
  return result.json();
}
function minimal(value, id) {
  assert.equal(value.kind, 'management'); assert.equal(value.circle.id, id);
  assert.deepEqual(Object.keys(value).sort(), ['capabilities', 'circle', 'kind', 'revision', 'viewer']);
  assert.deepEqual(Object.keys(value.capabilities).sort(), ['canComplete', 'canLeave']);
  assert.equal('ended' in value, false); assert.equal('online_url' in value, false);
}

test('actual HTTP→SQL malformed legacy calendar retains self-only fresh leave/host-completion controls and a discriminated list row', async t => {
  const a = await participationApp(); t.after(() => a.close());
  await a.db.query('UPDATE book_cohorts SET start_date=NULL WHERE id=$1', [IDS.circle]);
  a.setActor(IDS.reader);
  await response(a, '/api/circles/' + IDS.circle, 'GET', undefined, 503);
  const page = await response(a, '/api/circles/mine');
  const row = page.items.find(item => item.circle.id === IDS.circle); minimal(row, IDS.circle);
  const state = await response(a, '/api/circles/' + IDS.circle + '/membership'); minimal(state, IDS.circle);
  assert.equal(state.capabilities.canLeave, true); assert.equal(state.capabilities.canComplete, false);
  const left = await response(a, '/api/circles/' + IDS.circle + '/leave', 'POST', { requestId: requestId(), expectedRevision: state.revision });
  assert.equal(left.receipt.joined, false); assert.equal(left.state.isMember, false);
  await response(a, '/api/circles/' + IDS.circle + '/membership', 'GET', undefined, 404);
  a.setActor(IDS.host);
  const host = await response(a, '/api/circles/' + IDS.circle + '/membership'); minimal(host, IDS.circle);
  assert.equal(host.capabilities.canComplete, true);
  const completed = await response(a, '/api/circles/' + IDS.circle + '/complete', 'POST', { requestId: requestId(), expectedRevision: host.revision });
  assert.equal(completed.receipt.completed, true);
  a.setActor(IDS.newcomer);
  await response(a, '/api/circles/' + IDS.circle + '/membership', 'GET', undefined, 404);
  a.setActor(null);
  await response(a, '/api/circles/' + IDS.circle + '/membership', 'GET', undefined, 401);
});

test('actual HTTP→SQL missing private URL preserves honest full-detail failure and scoped membership recovery', async t => {
  const a = await participationApp(); t.after(() => a.close()); a.setActor(IDS.newcomer);
  const input = await creationInput(a.db, { format: 'online', venueType: 'online', city: null, venueName: null,
    onlineUrl: 'https://meet.example.invalid/PRIVATE_RECOVERY_FIXTURE' });
  const created = await response(a, '/api/circles', 'POST', { ...input, requestId: requestId() });
  const id = created.circleId;
  await a.db.query('DELETE FROM circle_private WHERE cohort_id=$1', [id]);
  await response(a, '/api/circles/' + id, 'GET', undefined, 503);
  const page = await response(a, '/api/circles/mine');
  const row = page.items.find(item => item.circle.id === id); minimal(row, id);
  assert.equal(JSON.stringify(row).includes(input.onlineUrl), false);
  const state = await response(a, '/api/circles/' + id + '/membership'); minimal(state, id);
  assert.equal(state.capabilities.canLeave, true); assert.equal(state.capabilities.canComplete, true);
  await response(a, '/api/circles/' + id + '/leave', 'POST', { requestId: requestId(), expectedRevision: state.revision });
  const formerHost = await response(a, '/api/circles/' + id + '/membership');
  assert.equal(formerHost.viewer.is_member, false); assert.equal(formerHost.capabilities.canLeave, false); assert.equal(formerHost.capabilities.canComplete, true);
  await response(a, '/api/circles/' + id + '/complete', 'POST', { requestId: requestId(), expectedRevision: formerHost.revision });
});
