import test from 'node:test';
import assert from 'node:assert/strict';
import { readingApp as fixture } from './support/reading-app.mjs';
const ADA = '11111111-1111-4111-8111-111111111111';
const JULES = '22222222-2222-4222-8222-222222222222';

test('explicit edition bookmark persists through actual route and PostgreSQL, with member isolation', async () => {
  const a = await fixture();
  try {
    await a.db.query('INSERT INTO reading_progress(member_id,book_id,section_id) VALUES($1,$2,$3),($4,$2,$5)', [ADA, 'hamlet', '3', JULES, '5']);
    let response = await a.route.GET(a.request());
    assert.equal(response.status, 200);
    assert.equal((await response.json()).progress[0].bookmark.status, 'legacy');
    assert.equal(a.calls.filter(call => call.action === 'upsert').length, 0);
    response = await a.route.POST(a.request({ bookId: 'hamlet', editionId: a.edition.editionId, blockIndex: 42, completed: false }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).bookmark.blockIndex, 42);
    // A fresh GET reads the committed record, rather than a UI receipt/cache.
    response = await a.route.GET(a.request());
    const body = await response.json();
    assert.equal(body.progress.length, 1);
    assert.equal(body.progress[0].bookmark.editionId, a.edition.editionId);
    assert.equal(body.progress[0].bookmark.blockIndex, 42);
    assert.equal((await a.db.query('SELECT section_id FROM reading_progress WHERE member_id=$1', [JULES])).rows[0].section_id, '5');
    a.actor(JULES);
    assert.equal((await (await a.route.GET(a.request())).json()).progress[0].bookmark.status, 'legacy');
    assert.equal((await a.route.POST(a.request({ bookId: 'hamlet', editionId: a.edition.editionId, blockIndex: 1, memberId: ADA }))).status, 403);
    a.actor(null);
    assert.equal((await a.route.GET(a.request())).status, 401);
    assert.equal(a.calls.filter(call => call.action === 'upsert').length, 1);
  } finally { await a.db.close(); }
});

test('edition conflict and out-of-bounds place cannot overwrite real persisted progress', async () => {
  const a = await fixture();
  try {
    assert.equal((await a.route.POST(a.request({ bookId: 'hamlet', editionId: 'other-edition', blockIndex: 0 }))).status, 409);
    assert.equal((await a.route.POST(a.request({ bookId: 'hamlet', editionId: a.edition.editionId, blockIndex: a.edition.blockCount }))).status, 400);
    assert.equal((await a.db.query('SELECT * FROM reading_progress')).rows.length, 0);
    assert.equal(a.calls.length, 0);
  } finally { await a.db.close(); }
});
