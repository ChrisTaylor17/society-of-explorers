import test from 'node:test';
import assert from 'node:assert/strict';
import { participationApp, IDS } from './support/participation-app.mjs';
import { creationInput, requestId } from './support/participation-db.mjs';

async function read(a, path, status = 200) {
  const response = await a.dispatch(path); assert.equal(response.status, status, await response.clone().text());
  assert.match(response.headers.get('cache-control'), /no-store/); return response.json();
}
async function write(a, path, body, status = 200, headers) {
  const response = await a.dispatch(path, 'POST', body, headers); assert.equal(response.status, status, await response.clone().text());
  assert.match(response.headers.get('cache-control'), /no-store/); return response.json();
}
const action = (snapshot, extra = {}) => ({ expectedRevision: snapshot.revision, requestId: requestId(), ...extra });
const url = id => '/api/circles/' + id;
const online = db => creationInput(db, { format: 'online', venueType: 'online', venueName: null, city: null,
  onlineUrl: 'https://meet.example.invalid/PRIVATE_SYNTHETIC_MEMBER_LINK', maxMembers: 3 });

test('real HTTP→SQL creation, public discovery, second-member join, RSVP, human post, reload, leave and author withdrawal', async t => {
  const a = await participationApp(); t.after(() => a.close()); a.setActor(IDS.newcomer);
  assert.equal((await read(a, '/api/circles/start')).canCreate, true);
  const input = { ...await online(a.db), requestId: requestId() };
  const created = await write(a, '/api/circles', input), id = created.circleId;
  assert.equal(created.receipt.action, 'create'); assert.equal(created.state.isHost, true); assert.equal(created.state.isMember, true);
  assert.equal((await write(a, '/api/circles', input)).circleId, id);
  assert.equal((await a.db.query('SELECT count(*)::int n FROM book_cohorts WHERE created_by=$1', [IDS.newcomer])).rows[0].n, 1);
  let detail = await read(a, url(id)); assert.equal(detail.online_url, input.onlineUrl);
  assert.equal(detail.viewer.is_host, true); assert.equal(detail.viewer.is_member, true);
  a.setActor(null);
  const directory = await read(a, '/api/circles'); assert.equal(directory.circles.some(circle => circle.id === id), true);
  for (const secret of [input.onlineUrl, IDS.newcomer, IDS.newcomer2]) assert.equal(JSON.stringify(directory).includes(secret), false);
  const publicDetail = await read(a, url(id)); assert.equal(publicDetail.online_url, null); assert.equal(publicDetail.viewer.signed_in, false);
  a.setActor(IDS.newcomer2); detail = await read(a, url(id));
  const join = action(detail); const joined = await write(a, url(id) + '/join', join); assert.equal(joined.state.isMember, true);
  detail = await read(a, url(id)); assert.equal(detail.online_url, input.onlineUrl);
  assert.equal((await read(a, '/api/circles/mine')).items.some(item => item.circle.id === id), true);
  const date = detail.meetings[0].date;
  await write(a, url(id) + '/rsvp', action(detail, { date, status: 'going' }));
  detail = await read(a, url(id)); assert.equal(detail.meetings[0].my_status, 'going'); assert.equal(detail.meetings[0].going, 1);
  const text = 'A human discussion contribution through the actual participation journey.';
  const posted = await write(a, '/api/book-salons/' + id, { content: text, memberId: IDS.newcomer });
  assert.equal(posted.outcome, 'confirmed');
  const persisted = (await a.db.query('SELECT member_id FROM seminar_messages WHERE id=$1', [posted.message.id])).rows[0];
  assert.equal(persisted.member_id, IDS.newcomer2);
  assert.equal((await read(a, '/api/book-salons/' + id)).messages.some(message => message.content === text), true);
  detail = await read(a, url(id)); const leave = action(detail);
  const left = await write(a, url(id) + '/leave', leave); assert.equal(left.state.isMember, false);
  assert.equal((await read(a, url(id))).online_url, null);
  assert.equal((await read(a, '/api/circles/mine')).items.some(item => item.circle.id === id), false);
  await read(a, '/api/book-salons/' + id, 403);
  assert.equal((await a.db.query('SELECT count(*)::int n FROM circle_rsvps WHERE cohort_id=$1 AND member_id=$2', [id, IDS.newcomer2])).rows[0].n, 0);
  const oldJoin = await write(a, url(id) + '/join', join); assert.equal(oldJoin.replayed, true);
  assert.equal(oldJoin.receipt.joined, true); assert.equal(oldJoin.state.isMember, false);
  const own = await read(a, '/api/circles/contributions'); const message = own.items.find(item => item.message.id === posted.message.id);
  assert.equal(message.canWithdraw, true);
  await write(a, `${url(id)}/messages/${posted.message.id}`, { action: 'withdraw', expectedRevision: message.revision,
    contentHash: message.contentHash, requestId: requestId() });
  a.setActor(IDS.newcomer); detail = await read(a, url(id));
  const completed = await write(a, url(id) + '/complete', action(detail)); assert.equal(completed.state.completed, true);
  assert.equal((await read(a, '/api/circles')).circles.some(circle => circle.id === id), false);
  const wrapup = await write(a, '/api/book-salons/' + id, { content: 'A current member can reflect after the final meeting.' });
  assert.equal(wrapup.outcome, 'confirmed');
  const history = await read(a, '/api/book-salons/' + id);
  assert.equal(history.messages.find(item => item.id === posted.message.id).visibility, 'withdrawn');
  assert.equal(JSON.stringify(history).includes(text), false);
});

test('failed private-link insertion rolls creation back; exact manual retry creates one complete group', async t => {
  const a = await participationApp(); t.after(() => a.close()); a.setActor(IDS.newcomer);
  const input = { ...await online(a.db), requestId: requestId() };
  await a.db.exec("CREATE FUNCTION fixture_private_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'PRIVATE_FIXTURE_FAILURE'; END $$; CREATE TRIGGER fixture_private_failure BEFORE INSERT ON circle_private FOR EACH ROW EXECUTE FUNCTION fixture_private_failure();");
  const failed = await write(a, '/api/circles', input, 503); assert.equal(failed.outcome, 'unknown');
  assert.equal(JSON.stringify(failed).includes('PRIVATE_FIXTURE_FAILURE'), false);
  assert.equal((await a.db.query('SELECT count(*)::int n FROM book_cohorts WHERE created_by=$1', [IDS.newcomer])).rows[0].n, 0);
  assert.equal((await a.db.query('SELECT count(*)::int n FROM circle_participation_receipts WHERE actor_member_id=$1', [IDS.newcomer])).rows[0].n, 0);
  await a.db.exec('DROP TRIGGER fixture_private_failure ON circle_private');
  const confirmed = await write(a, '/api/circles', input);
  assert.equal((await read(a, url(confirmed.circleId))).online_url, input.onlineUrl);
  assert.equal((await write(a, '/api/circles', input)).replayed, true);
});

test('hidden current members can leave and hosts can complete; outsider access stays unavailable', async t => {
  const a = await participationApp(); t.after(() => a.close()); a.setActor(IDS.newcomer);
  const created = await write(a, '/api/circles', { ...await online(a.db), requestId: requestId() }), id = created.circleId;
  a.setActor(IDS.newcomer2); await write(a, url(id) + '/join', action(await read(a, url(id))));
  await a.db.query('UPDATE book_cohorts SET circle_hidden=true WHERE id=$1', [id]);
  const held = await read(a, url(id)); assert.equal(held.online_url, null); assert.equal(held.meetings.length, 0);
  assert.equal(held.capabilities.canLeave, true); assert.equal(held.capabilities.canReadConversation, false);
  assert.equal((await read(a, '/api/circles/mine')).items.find(item => item.circle.id === id).circle.hidden, true);
  await write(a, url(id) + '/leave', action(held)); await read(a, url(id), 404);
  a.setActor(IDS.newcomer); let host = await read(a, url(id)); await write(a, url(id) + '/leave', action(host));
  host = await read(a, url(id)); assert.equal(host.viewer.is_member, false); assert.equal(host.capabilities.canComplete, true);
  await write(a, url(id) + '/complete', action(host));
  await a.db.query('UPDATE book_cohorts SET circle_hidden=false WHERE id=$1', [id]);
  a.setActor(IDS.newcomer2); const closed = await read(a, url(id)); assert.equal(closed.ended, true);
  await write(a, url(id) + '/join', action(closed), 409);
});

test('legacy Circle joining requires the same keys/origin and ordinary salons retain unkeyed joining', async t => {
  const a = await participationApp(); t.after(() => a.close()); a.setActor(IDS.newcomer);
  const created = await write(a, '/api/circles', { ...await online(a.db), requestId: requestId() }), id = created.circleId;
  a.setActor(IDS.newcomer2); const current = await read(a, url(id));
  await write(a, '/api/book-salons/join', { cohortId: id }, 400);
  await write(a, '/api/book-salons/join', { cohortId: id, ...action(current) }, 403, { origin: 'https://foreign.invalid' });
  const joined = await write(a, '/api/book-salons/join', { cohortId: id, ...action(current) }); assert.equal(joined.state.isMember, true);
  assert.deepEqual(await write(a, '/api/book-salons/join', { cohortId: IDS.salon }), { joined: true });
});

test('private membership/RSVP query failures cannot become a false nonmember or empty state', async t => {
  const a = await participationApp(); t.after(() => a.close()); a.setActor(IDS.newcomer);
  const created = await write(a, '/api/circles', { ...await online(a.db), requestId: requestId() });
  await a.db.exec('REVOKE SELECT ON circle_rsvps FROM service_role');
  const result = await read(a, url(created.circleId), 503);
  assert.equal('viewer' in result, false); assert.equal('circle' in result, false);
  assert.doesNotMatch(JSON.stringify(result), /permission denied|circle_rsvps|service_role/);
});
