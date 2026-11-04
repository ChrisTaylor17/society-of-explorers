import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { discoveryApp, IDS } from './support/discovery-app.mjs';

const editions = JSON.parse(await readFile(new URL('../../../lib/circles/reading-program-editions.json', import.meta.url), 'utf8'));
const endpoint = '/api/circles';
const cursorValue = value => JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
const cursorText = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const changeCursor = (value, changes) => cursorText({ ...cursorValue(value), ...changes });
async function get(a, search = '', status = 200) {
  const response = await a.dispatch(endpoint + (search ? '?' + search : ''));
  assert.equal(response.status, status, await response.clone().text());
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  return response.json();
}
const query = values => new URLSearchParams(values).toString();
const discoveryCalls = a => a.calls.filter(call => call.rpc === 'soe_circle_discovery_search');

// Every case loads the actual route/adapter/pure contracts and new SQL into a
// disposable database. Network is denied before importing this test module.
test('eligible global search is applied before limit beyond200 expired rows, then keyset pages reach every tied match', async t => {
  const a = await discoveryApp(); t.after(() => a.close()); await a.excludeOriginalCircles();
  await a.seedCircles(200, { ended: true });
  const ids = await a.seedCircles(57, { title: 'Far beyond former cap', sameTitle: true });
  const match = await get(a, query({ q: 'beyond cap' }));
  assert.equal(match.circles.length, 25); assert.ok(match.page.nextCursor); assert.equal('inventory' in match, false);
  const seen = [...match.circles.map(c => c.id)]; let current = match;
  while (current.page.nextCursor) {
    current = await get(a, query({ q: 'beyond cap', cursor: current.page.nextCursor }));
    seen.push(...current.circles.map(c => c.id));
  }
  assert.deepEqual(seen, ids.sort()); assert.equal(new Set(seen).size, 57);
  assert.equal(current.circles.length, 7); assert.equal(current.page.nextCursor, null);
  assert.equal(a.calls.some(call => call.table), false, 'GET performs no split table reads');
  assert.equal((await a.db.query('SELECT count(*)::int n FROM circle_message_states')).rows[0].n, 0);
});

test('literal accent-insensitive AND terms cross displayed fields; regex, SQL wildcards and private fields stay literal', async t => {
  const a = await discoveryApp(); t.after(() => a.close()); await a.excludeOriginalCircles();
  await a.db.query('UPDATE members SET display_name=$1 WHERE id=$2', ['Adèle', IDS.host]);
  const [id] = await a.seedCircles(1, { title: 'Tuesday [wisdom] 100% _ . Christmas', description: 'A welcoming group.', format: 'hybrid' });
  const matched = await get(a, query({ q: 'Tuesday Genesis ADELE', city: 'QUEBEC montreal', format: 'online', open: '1' }));
  assert.deepEqual(matched.circles.map(c => c.id), [id]);
  for (const q of ['[wisdom]', '100%', '_', '.']) assert.equal((await get(a, query({ q }))).circles.length, 1);
  for (const q of ['.*', 'Tuesday impossible', 'Synthetic public library', 'SYNTHETIC_PRIVATE_LINK']) assert.deepEqual((await get(a, query({ q }))).circles, []);
  assert.equal((await get(a, query({ format: 'in_person' }))).circles.length, 1);
  const terms = discoveryCalls(a)[0].args.p_query;
  assert.deepEqual(Array.from(terms.terms), ['tuesday', 'genesis', 'adele']); assert.deepEqual(Array.from(terms.cityTerms), ['quebec', 'montreal']);
});

test('title ordering preserves UTF16 including astral/BMP characters and folded-title UUID ties', async t => {
  const a = await discoveryApp(); t.after(() => a.close()); await a.excludeOriginalCircles();
  const ids = [];
  for (const title of ['\uE000', '😀', 'Álpha', 'alpha']) ids.push(...await a.seedCircles(1, { title, sameTitle: true }));
  const result = await get(a, 'sort=title&limit=2');
  const second = await get(a, query({ sort: 'title', limit: '2', cursor: result.page.nextCursor }));
  assert.deepEqual([...result.circles, ...second.circles].map(c => c.id), [ids[2], ids[3], ids[1], ids[0]]);
});

test('strict invalid or duplicate filters/cursors refuse before database dispatch rather than broadening search', async t => {
  const a = await discoveryApp(); t.after(() => a.close());
  for (const search of ['q=a&q=b', 'city=a&city=b', 'unknown=x', 'sort=random', 'format=hybrid', 'open=true', 'limit=0', 'limit=26', 'limit=01',
    'limit=1&limit=1', 'cursor=', 'cursor=++', 'cursor=YWJj', 'book=apology', 'book=apology&edition=old', 'from=0&to=1', 'q=%00']) {
    const result = await get(a, search, 400); assert.deepEqual(result.circles, []);
  }
  assert.equal(discoveryCalls(a).length, 0);
});

test('cursor binds canonical filters, limit, metadata/catalog and Unicode profile with no implicit restart', async t => {
  const a = await discoveryApp(); t.after(() => a.close()); await a.excludeOriginalCircles(); await a.seedCircles(3);
  const first = await get(a, 'limit=1'); const cursor = first.page.nextCursor; assert.ok(cursor);
  await get(a, query({ q: 'changed', limit: '1', cursor }), 400);
  await get(a, query({ limit: '2', cursor }), 400);
  const calls = discoveryCalls(a).length;
  for (const changes of [{ catalogHash: '0'.repeat(64) }, { profileHash: '0'.repeat(64) }]) {
    const refused = await get(a, query({ limit: '1', cursor: changeCursor(cursor, changes) }), 409);
    assert.equal(refused.restart_required, true);
  }
  assert.equal(discoveryCalls(a).length, calls);
  for (const malformed of [cursorText({ ...cursorValue(cursor), version: 2 }), cursorText({ ...cursorValue(cursor), private: 'extra' }),
    Buffer.from(' {"version":1} ').toString('base64url'), cursorText({ ...cursorValue(cursor), after: { ...cursorValue(cursor).after, id: 'invalid' } })]) {
    await get(a, query({ limit: '1', cursor: malformed }), 400);
  }
});

test('a changed calendar key produces actual SQL409 restart_required and leaves the public inventory untouched', async t => {
  const a = await discoveryApp(); t.after(() => a.close()); await a.excludeOriginalCircles(); await a.seedCircles(3);
  const first = await get(a, 'limit=1');
  const result = await get(a, query({ limit: '1', cursor: changeCursor(first.page.nextCursor, { calendarKey: '0'.repeat(64) }) }), 409);
  assert.equal(result.restart_required, true); assert.deepEqual(result.circles, []);
  const continued = await get(a, query({ limit: '1', cursor: first.page.nextCursor })); assert.notEqual(continued.circles[0].id, first.circles[0].id);
});

test('canonical continuation succeeds while a UTF8 BOM-prefixed cursor refuses before database dispatch', async t => {
  const a = await discoveryApp(); t.after(() => a.close()); await a.excludeOriginalCircles(); await a.seedCircles(3);
  const first = await get(a, 'limit=1'), cursor = first.page.nextCursor;
  const continued = await get(a, query({ limit: '1', cursor }));
  assert.notEqual(continued.circles[0].id, first.circles[0].id);
  const calls = discoveryCalls(a).length;
  const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(cursor, 'base64url')]).toString('base64url');
  await get(a, query({ limit: '1', cursor: withBom }), 400);
  assert.equal(discoveryCalls(a).length, calls);
});

test('current membership count establishes real seats and open filtering without roster identities', async t => {
  const a = await discoveryApp(); t.after(() => a.close()); await a.excludeOriginalCircles();
  const [id] = await a.seedCircles(1, { maxMembers: 3 });
  for (const member of [IDS.host, IDS.reader, IDS.author]) await a.db.query('INSERT INTO book_cohort_members(cohort_id,member_id) VALUES($1,$2)', [id, member]);
  const all = await get(a); assert.equal(all.circles[0].member_count, 3); assert.equal(all.circles[0].spots_left, 0);
  assert.deepEqual((await get(a, 'open=1')).circles, []);
  await a.db.query('DELETE FROM book_cohort_members WHERE cohort_id=$1 AND member_id=$2', [id, IDS.author]);
  const open = await get(a, 'open=1'); assert.equal(open.circles[0].member_count, 2); assert.equal(open.circles[0].spots_left, 1);
  for (const privateValue of [IDS.host, IDS.author, IDS.reader]) assert.equal(JSON.stringify(open).includes(privateValue), false);
});

test('hidden, completed, ended and malformed calendar/configuration rows cannot advertise invented availability', async t => {
  const a = await discoveryApp(); t.after(() => a.close()); await a.excludeOriginalCircles();
  const ids = await a.seedCircles(6);
  await a.db.query('UPDATE book_cohorts SET circle_hidden=true WHERE id=$1', [ids[0]]);
  await a.db.query("UPDATE book_cohorts SET status='completed' WHERE id=$1", [ids[1]]);
  await a.db.query('UPDATE book_cohorts SET start_date=NULL WHERE id=$1', [ids[2]]);
  await a.db.query("UPDATE book_cohorts SET circle_timezone='Invalid/Zone' WHERE id=$1", [ids[3]]);
  await a.db.query('UPDATE book_cohorts SET max_members=NULL WHERE id=$1', [ids[4]]);
  await a.seedCircles(2, { ended: true });
  const [missingUrl] = await a.seedCircles(1, { format: 'online' });
  await a.db.query('DELETE FROM circle_private WHERE cohort_id=$1', [missingUrl]);
  assert.deepEqual((await get(a)).circles.map(c => c.id), [ids[5]]);
});

test('masked host search uses exactly the public scalar-safe forty-unit label', async t => {
  const a = await discoveryApp(); t.after(() => a.close()); await a.excludeOriginalCircles(); await a.seedCircles(1);
  for (const name of ['private@example.invalid', 'A fictional\nprivate label']) {
    await a.db.query('UPDATE members SET display_name=$1 WHERE id=$2', [name, IDS.host]);
    const page = await get(a); assert.equal(page.circles[0].host_name, 'An explorer');
    assert.deepEqual((await get(a, query({ q: name.split('@')[0] }))).circles, []);
  }
  await a.db.query('UPDATE members SET display_name=$1 WHERE id=$2', ['A'.repeat(39) + '😀HIDDENSUFFIX', IDS.host]);
  const page = await get(a); assert.equal(page.circles[0].host_name, 'A'.repeat(39));
  assert.deepEqual((await get(a, 'q=HIDDENSUFFIX')).circles, []);
});

test('exact book/edition searches canonical metadata while ranges remain only bound hints', async t => {
  const a = await discoveryApp(); t.after(() => a.close()); await a.excludeOriginalCircles();
  const edition = editions.find(e => e.bookId === 'apology');
  const readingProgram = { version: 1, bookId: edition.bookId, editionId: edition.editionId, sessions: [{ from: 0, to: 10 }] };
  const [id] = await a.seedCircles(1, { readingProgram });
  const parameters = { book: edition.bookId, edition: edition.editionId, from: '50', to: '60', q: 'Plato' };
  const result = await get(a, query(parameters)); assert.deepEqual(result.circles.map(c => c.id), [id]);
  assert.equal(result.circles[0].reading, null); assert.equal(result.circles[0].program_length, 1);
  const other = editions.find(e => e.bookId !== edition.bookId);
  assert.deepEqual((await get(a, query({ book: other.bookId, edition: other.editionId }))).circles, []);
});

test('public projection discards private/authority extras and rejects malformed service calendar or page replies', async t => {
  const a = await discoveryApp(); t.after(() => a.close());
  a.transformRpc((name, args, result) => name === 'soe_circle_discovery_search' ? { ...result, data: { ...result.data,
    private: 'RAW_REPORT', items: result.data.items.map(item => ({ ...item, actor: IDS.host, reports: ['RAW_REPORT'],
      circle: { ...item.circle, created_by: IDS.host, online_url: 'PRIVATE_URL' } })) } } : result);
  const clean = await get(a); for (const value of [IDS.host, 'RAW_REPORT', 'PRIVATE_URL']) assert.equal(JSON.stringify(clean).includes(value), false);
  for (const tamper of [data => ({ ...data, calendarKey: '0'.repeat(64) }), data => ({ ...data, limit: 24 }),
    data => ({ ...data, items: data.items.map(item => ({ ...item, nextMeeting: '1999-01-01' })) }),
    data => ({ ...data, items: data.items.map(item => ({ ...item, memberCount: -1 })) }),
    data => ({ ...data, items: [...data.items, ...data.items] }), data => ({ ...data, next: { id: IDS.circle, title: 'wrong', nextMeeting: '2026-01-01' } })]) {
    a.transformRpc((name, args, result) => name === 'soe_circle_discovery_search' ? { ...result, data: tamper(result.data) } : result);
    await get(a, '', 503);
  }
});

test('missing new schema is opening-soon; permission/provider-shaped failures stay generic unavailable', async t => {
  const a = await discoveryApp(); t.after(() => a.close());
  for (const code of ['PGRST202', '42883', '42P01', '42703']) {
    a.transformRpc((name, args, result) => name === 'soe_circle_discovery_search' ? { data: null, error: { code, message: 'PRIVATE_DB_TEXT' } } : result);
    assert.deepEqual(await get(a), { ready: false, circles: [] });
  }
  for (const code of ['42501', 'PT503', 'XX000']) {
    a.transformRpc(() => ({ data: null, error: { code, message: 'PRIVATE_DB_TEXT', details: IDS.host } }));
    const result = await get(a, '', 503); assert.equal(JSON.stringify(result).includes('PRIVATE_DB_TEXT'), false); assert.equal(JSON.stringify(result).includes(IDS.host), false);
  }
});
