import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { participationApp, IDS } from './support/participation-app.mjs';
import { creationInput, requestId } from './support/participation-db.mjs';
const editions = JSON.parse(fs.readFileSync(new URL('../../../lib/circles/reading-program-editions.json', import.meta.url)));
const edition = editions.find(e => e.bookId === 'apology');
const program = { version: 1, bookId: edition.bookId, editionId: edition.editionId,
  sessions: [{ from: 20, to: 30 }, { from: 0, to: 10 }, { from: 20, to: 30 }] };
const url = id => '/api/circles/' + id;
async function read(a, path, status = 200) { const r = await a.dispatch(path); assert.equal(r.status, status, await r.clone().text()); return r.json(); }
async function write(a, path, body, status = 200) { const reviewed = path === '/api/circles' || path.endsWith('/complete') || path.endsWith('/rsvp') ? { expectedMemberId: a.memberId, ...body } : body; const r = await a.dispatch(path, 'POST', reviewed); assert.equal(r.status, status, await r.clone().text()); return r.json(); }
const action = d => ({ requestId: requestId(), expectedRevision: d.revision });

test('actual HTTP→SQL creates edition-bound program, discovers exact pair and range hint, joins/RSVPs finite dates and replays with current state', async t => {
 const a = await participationApp(); t.after(() => a.close()); a.setActor(IDS.newcomer);
 const body = { ...await creationInput(a.db, { format: 'online', city: null, venueName: null, venueType: 'online',
   onlineUrl: 'https://meet.example.invalid/PRIVATE_PROGRAM_LINK', readingProgram: program }), requestId: requestId() };
 const created = await write(a, '/api/circles', body), id = created.circleId;
 const stored = (await a.db.query('SELECT book_id,circle_path_id,circle_reading_program FROM book_cohorts WHERE id=$1', [id])).rows[0];
 assert.equal(stored.book_id, 'soe-circles-path'); assert.equal(stored.circle_path_id, 'book-v1'); assert.deepEqual(stored.circle_reading_program, program);
 let d = await read(a, url(id)); assert.equal(d.circle.reading, null); assert.equal(d.circle.program_length, 3); assert.deepEqual(d.circle.reading_program, program);
 assert.equal(d.meetings.length, 3); assert.equal(d.online_url, body.onlineUrl);
 const own = (await read(a, '/api/circles/mine')).items.find(item => item.circle.id === id);
 assert.deepEqual(own.circle.reading_program, program); assert.equal(own.circle.program_length, 3); assert.equal('online_url' in own, false);
 a.setActor(null);
 const params = new URLSearchParams({ book: edition.bookId, edition: edition.editionId, from: '50', to: '60', q: 'Plato' });
 const directory = await read(a, '/api/circles?' + params);
 assert.equal(directory.circles.some(c => c.id === id), true); assert.equal(JSON.stringify(directory).includes(body.onlineUrl), false);
 assert.equal(JSON.stringify(directory).includes(IDS.newcomer), false);
 const other = editions.find(e => e.bookId !== edition.bookId);
 assert.equal((await read(a, '/api/circles?' + new URLSearchParams({ book: other.bookId, edition: other.editionId }))).circles.some(c => c.id === id), false);
 await read(a, '/api/circles?book=apology&edition=wrong', 400);
 d = await read(a, url(id)); assert.equal(d.online_url, null);
 a.setActor(IDS.newcomer2); d = await read(a, url(id)); await write(a, url(id) + '/join', action(d));
 d = await read(a, url(id)); assert.equal(d.online_url, body.onlineUrl);
 const last = d.meetings.at(-1).date;
 await write(a, url(id) + '/rsvp', { ...action(d), date: last, status: 'going' });
 d = await read(a, url(id)); assert.equal(d.meetings.at(-1).my_status, 'going');
 const beyond = new Date(last + 'T00:00:00Z'); beyond.setUTCDate(beyond.getUTCDate() + 7);
 await write(a, url(id) + '/rsvp', { ...action(d), date: beyond.toISOString().slice(0, 10), status: 'going' }, 400);
 await write(a, url(id) + '/leave', action(d));
 a.setActor(IDS.newcomer); d = await read(a, url(id)); await write(a, url(id) + '/leave', action(d));
 const replay = await write(a, '/api/circles', body); assert.equal(replay.replayed, true); assert.equal(replay.receipt.joined, true); assert.equal(replay.state.isMember, false);
 await write(a, '/api/circles', { ...body, readingProgram: { ...program, sessions: [{ from: 1, to: 2 }] } }, 409);
 assert.equal((await a.db.query('SELECT count(*)::int n FROM book_cohorts WHERE created_by=$1', [IDS.newcomer])).rows[0].n, 1);
});

test('explicit null and invalid edition/positions never create a row; starter omission keeps exact legacy receipt representation', async t => {
 const a = await participationApp(); t.after(() => a.close()); a.setActor(IDS.newcomer);
 const base = { ...await creationInput(a.db), requestId: requestId() };
 for (const p of [null, { ...program, bookId: 'unknown' }, { ...program, editionId: edition.editionId + 'x' },
   { ...program, sessions: [{ from: 0, to: edition.blockCount }] }]) await write(a, '/api/circles', { ...base, requestId: requestId(), readingProgram: p }, 400);
 assert.equal((await a.db.query('SELECT count(*)::int n FROM book_cohorts WHERE created_by=$1', [IDS.newcomer])).rows[0].n, 0);
 const created = await write(a, '/api/circles', base);
 const receipt = (await a.db.query('SELECT payload FROM circle_participation_receipts WHERE request_id=$1', [base.requestId])).rows[0].payload;
 assert.equal(Object.hasOwn(receipt.input, 'readingProgram'), false);
 const d = await read(a, url(created.circleId)); assert.equal(d.circle.reading_program, null); assert.equal(d.circle.program_length, 12); assert.equal(d.circle.reading.week, 1);
 assert.equal((await write(a, '/api/circles', base)).replayed, true);
});
