import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader } from '../../../platforms/tests/load-source.mjs';
import { bookSalonDiscoveryFixture } from './support/book-salon-discovery-fixture.mjs';
const { parseBookSalonPage, parseBookSalonOffset, bookSalonListing } = sourceLoader()('lib/books/salon-discovery.ts');
const id = n => `99999999-9999-4999-8999-${String(n).padStart(12, '0')}`;
const json = value => JSON.parse(JSON.stringify(value));
const privateResponse = response => {
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
  assert.equal(response.headers.get('surrogate-control'), 'no-store');
};

test('public discovery uses the actual handler, SDK query and role-scoped SQL with stable pagination', async t => {
  const f = await bookSalonDiscoveryFixture(t);
  const before = Number((await f.db.query("SELECT count(*)::int n FROM book_cohorts WHERE book_id <> 'soe-circles-path'")).rows[0].n);
  for (let i = 1; i <= 61; i++) await f.db.query(`INSERT INTO book_cohorts(id,book_id,title,max_members,status,created_at,start_date,thinker_id)
    VALUES($1,'apology',$2,8,'forming','2026-11-08T12:00:00Z','2026-11-09T00:00:00Z','plato')`, [id(i), 'Fictional group ' + i]);
  const response = await f.dispatch('/api/book-salons'); assert.equal(response.status, 200); privateResponse(response);
  const first = await response.json(); assert.equal(first.cohorts.length, 50); assert.equal(first.page.total, before + 61); assert.equal(first.page.nextOffset, 50);
  assert(parseBookSalonPage(first, 0)); assert(first.cohorts.every(row => row.book_id !== 'soe-circles-path'));
  const second = await (await f.dispatch('/api/book-salons?offset=50')).json(); assert(parseBookSalonPage(second, 50));
  assert.equal(new Set([...first.cohorts, ...second.cohorts].map(row => row.id)).size, before + 61); assert.equal(second.page.nextOffset, null);
  assert.equal(f.reads.length, 2); assert.deepEqual(first.cohorts.filter(row => row.id.startsWith('9999')).map(row => row.id),
    [...first.cohorts.filter(row => row.id.startsWith('9999')).map(row => row.id)].sort().reverse());
  assert(first.cohorts.every(row => !('created_at' in row) && !('book_cohort_members' in row) && !('created_by' in row)));
  assert.equal(first.cohorts.find(row => row.id === id(61)).start_date, '2026-11-09');
});

test('actual zero membership and empty listing are distinct from failed/missing counts', async t => {
  const f = await bookSalonDiscoveryFixture(t);
  await f.db.query("DELETE FROM book_cohorts WHERE book_id <> 'soe-circles-path'");
  const empty = await f.dispatch('/api/book-salons'); assert.equal(empty.status, 200);
  assert.deepEqual(await empty.json(), { cohorts: [], page: { offset: 0, limit: 50, total: 0, nextOffset: null } });
  await f.db.query("INSERT INTO book_cohorts(id,book_id,title,max_members,status) VALUES($1,'apology','Fictional zero members',8,'forming')", [id(1)]);
  const populated = await (await f.dispatch('/api/book-salons')).json(); assert.equal(populated.cohorts[0].member_count, 0);
  f.missingCount = true; const unknown = await f.dispatch('/api/book-salons'); assert.equal(unknown.status, 503); privateResponse(unknown);
  assert.deepEqual(Object.keys(await unknown.json()), ['error']);
  f.missingCount = false; f.corrupt = rows => rows.map(row => ({ ...row, book_cohort_members: null }));
  assert.equal((await f.dispatch('/api/book-salons')).status, 503);
});

test('lookup failures, malformed rows and exceptions return generic failure, never fake emptiness', async t => {
  const f = await bookSalonDiscoveryFixture(t); f.unavailable = true;
  let result = await f.dispatch('/api/book-salons'); assert.equal(result.status, 503); assert(!(await result.text()).includes('CANARY'));
  f.unavailable = false;
  for (const corrupt of [() => null, rows => [{ ...rows[0], id: 'not-a-uuid' }], rows => [...rows, ...rows], rows => rows.map(row => ({ ...row, book_cohort_members: [{ count: -1 }] }))]) {
    f.corrupt = corrupt; result = await f.dispatch('/api/book-salons'); assert.equal(result.status, 503); privateResponse(result);
  }
  f.corrupt = () => { throw Error('PRIVATE_EXCEPTION_CANARY'); }; result = await f.dispatch('/api/book-salons'); assert.equal(result.status, 503);
  assert(!(await result.text()).includes('CANARY'));
});

test('bad page input is refused before a data client exists', async t => {
  const f = await bookSalonDiscoveryFixture(t);
  for (const query of ['offset=-1', 'offset=1.5', 'offset=01', 'offset=1e2', 'offset=9007199254740991', 'offset=0&offset=0', 'offset=']) {
    const response = await f.dispatch('/api/book-salons?' + query); assert.equal(response.status, 400); privateResponse(response);
  }
  assert.equal(f.clientCreations, 0); assert.equal(f.reads.length, 0);
  assert.equal(parseBookSalonOffset(null), 0); assert.equal(parseBookSalonOffset('50'), 50);
});

test('projection bounds content, preserves unknown capacity/date and never invents a thinker', () => {
  const value = bookSalonListing({ id: id(1), book_id: 'apology', title: 'x'.repeat(300), description: 'x'.repeat(1500),
    max_members: null, start_date: '2026-02-30', thinker_id: null, status: null, book_cohort_members: [{ count: 0 }], email: 'PRIVATE_CANARY' });
  assert.equal(value.title.length, 160); assert.equal(value.description.length, 1000); assert.equal(value.max_members, null);
  assert.equal(value.start_date, null); assert.equal(value.thinker_id, null); assert.equal(value.member_count, 0);
  assert(!JSON.stringify(value).includes('PRIVATE_CANARY')); assert(parseBookSalonPage({ cohorts: [value], page: { offset: 0, limit: 50, total: 1, nextOffset: null } }, 0));
});

test('browser page contract rejects bad rows, duplicate identifiers and dishonest pagination', () => {
  const row = { id: id(1), book_id: 'apology', title: 'Fictional group', description: null, max_members: 8, member_count: 0, thinker_id: null, status: 'forming', start_date: null };
  const base = { cohorts: [row], page: { offset: 0, limit: 50, total: 1, nextOffset: null } };
  assert.deepEqual(json(parseBookSalonPage(base, 0)), base);
  assert.equal(parseBookSalonPage({ cohorts: [row], page: { offset: 50, limit: 50, total: 50, nextOffset: null } }, 50), null);
  for (const bad of [null, {}, { ...base, cohorts: {} }, { ...base, cohorts: [{ ...row, member_count: null }] },
    { ...base, cohorts: [{ ...row, book_id: 'soe-circles-path' }] }, { ...base, cohorts: [row, row] },
    { ...base, page: { ...base.page, nextOffset: 0 } }, { ...base, page: { ...base.page, total: 10 } },
    { ...base, page: { ...base.page, offset: 50 } }, { ...base, cohorts: [], page: { ...base.page, nextOffset: 0 } }]) assert.equal(parseBookSalonPage(bad, 0), null);
});
