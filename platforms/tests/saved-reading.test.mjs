import test from 'node:test';
import assert from 'node:assert/strict';
import { lstatSync } from 'node:fs';

const loaderFile = new URL('./load-source.mjs', import.meta.url), info = lstatSync(loaderFile);
assert.ok(info.isFile() && !info.isSymbolicLink() && (!info.size || info.blocks));
const { sourceLoader } = await import('./load-source.mjs');
const load = sourceLoader();
const { createSavedReading } = load('platforms/shared/saved-reading.ts');
const { GREAT_BOOKS } = load('lib/books/catalog.ts');
const { passageIndexPin } = load('lib/books/passages.ts');
const { encodeBookmarkLocator, interpretBookmark } = load('lib/books/bookmarks.ts');
const { parseReadingProgressMutation, readingProgressMutationBody } = load('lib/books/reading-progress.ts');
const MEMBER = '11111111-1111-4111-8111-111111111111', SUBJECT = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333', ORIGIN = 'https://saved-reading.invalid';
const clone = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const deferred = () => { let resolve; return { promise: new Promise(done => { resolve = done; }), resolve }; };
const position = (bookId = 'hamlet', blockIndex = 42) => ({ bookId, editionId: passageIndexPin(bookId).editionId, blockIndex });
function state(bookId = 'hamlet', { revision = 0, status = 'absent', blockIndex = 42, completed = false, sectionId } = {}) {
  const pin = passageIndexPin(bookId), edition = { editionId: pin.editionId, blockCount: pin.blockCount };
  const locator = sectionId === undefined ? encodeBookmarkLocator(pin.editionId, blockIndex) : sectionId;
  return { bookId, revision, status, sectionId: status === 'saved' ? locator : null,
    paragraphIndex: status === 'saved' ? 0 : null, completed: status === 'saved' ? completed : null,
    updatedAt: status === 'absent' ? null : '2026-11-04T12:00:00.000Z', edition,
    bookmark: status === 'saved' ? clone(interpretBookmark(locator, pin.editionId, pin.blockCount)) : null };
}
/** In-memory CAS oracle, never a server/SQL claim. The actual controller and DTO
 * parsers run unchanged; independent HTTP/SQL composition covers the backend. */
function fixture({ timeoutMs = 100, transportPresent = true, initialOnline = true } = {}) {
  let scope = 'checked-member', subject = SUBJECT, hook = null, proofHook = null, jsonHook = null;
  const owners = new Set(), calls = [], proofs = [], rows = new Map(GREAT_BOOKS.map(book => [book.id, state(book.id)]));
  const owner = { scope: () => scope, subscribe(fn) { owners.add(fn); return () => owners.delete(fn); },
    async credentials(expected) { proofs.push(expected); return proofHook ? proofHook(expected) : { bearer: 'NONISSUED_SAVED_READING_TOKEN', subject }; } };
  const envelope = bookId => ({ memberId: MEMBER, progress: clone(bookId ? [rows.get(bookId)] : GREAT_BOOKS.map(book => rows.get(book.id))) });
  const response = (url, body, status = 200) => ({ url, status, redirected: false, json: async () => jsonHook ? jsonHook(body) : clone(body) });
  const normal = (url, options) => {
    const book = new URL(url).searchParams.get('bookId');
    if (options.method === 'GET') return response(url, envelope(book));
    const mutation = parseReadingProgressMutation(JSON.parse(options.body));
    assert.ok(mutation, 'Controller sends a canonical mutation');
    assert.equal(options.body, readingProgressMutationBody(mutation));
    const old = rows.get(mutation.bookId);
    if (mutation.expectedMemberId !== MEMBER || mutation.expectedRevision !== old.revision) return response(url, { error: 'conflict' }, 409);
    const same = mutation.action === 'remove' ? old.status === 'removed'
      : old.status === 'saved' && old.sectionId === encodeBookmarkLocator(mutation.editionId, mutation.blockIndex)
        && old.paragraphIndex === 0 && old.completed === mutation.completed;
    if (!same) rows.set(mutation.bookId, state(mutation.bookId, { revision: old.revision + 1,
      status: mutation.action === 'remove' ? 'removed' : 'saved', blockIndex: mutation.blockIndex, completed: mutation.completed }));
    return response(url, envelope(mutation.bookId));
  };
  const transport = async (url, options) => { calls.push({ url, options }); return hook ? hook(url, options) : normal(url, options); };
  const session = createSavedReading({ origin: ORIGIN, memberId: MEMBER, owner, timeoutMs, initialOnline,
    ...(transportPresent ? { savedReadingTransport: transport } : {}) });
  session.connect();
  return { session, calls, proofs, owner, envelope, response, normal,
    row: book => clone(rows.get(book)), set: value => rows.set(value.bookId, clone(value)),
    hook: fn => { hook = fn; }, proof: fn => { proofHook = fn; }, json: fn => { jsonHook = fn; },
    notify(nextScope = scope, nextSubject = subject) { scope = nextScope; subject = nextSubject; for (const fn of [...owners]) fn(); },
    subject(value) { subject = value; }, get subscriptions() { return owners.size; }, close() { session.close(); } };
}
async function uncertain(f, bookId = 'hamlet', blockIndex = 42) {
  await f.session.prepareSave(position(bookId, blockIndex), false);
  assert.equal(f.session.model().phase, 'review');
  f.hook((url, options) => { if (options.method === 'POST') throw Error('Synthetic lost reply before delivery'); return f.normal(url, options); });
  await f.session.confirm(); f.hook(null);
  assert.equal(f.session.model().phase, 'unknown');
}

test('connect, reconnect and restored connectivity are inert; only explicit load uses the private lane', async () => {
  const f = fixture(); try {
    assert.equal(f.calls.length, 0); f.session.disconnect(); f.session.connect(); f.session.connectivity(false); f.session.connectivity(true);
    assert.equal(f.calls.length, 0); assert.equal(f.proofs.length, 0);
    await f.session.load(); assert.equal(f.session.model().entries.length, 8); assert.equal(f.proofs.length, 1);
    assert.deepEqual(f.session.model().entries.map(row => row.bookId), GREAT_BOOKS.map(book => book.id));
    const call = f.calls[0]; assert.equal(call.url, ORIGIN + '/api/great-books/progress');
    assert.deepEqual(clone(call.options.headers), { Authorization: 'Bearer NONISSUED_SAVED_READING_TOKEN' });
    assert.equal(call.options.credentials, 'omit'); assert.equal(call.options.cache, 'no-store'); assert.equal(call.options.redirect, 'error');
    assert.equal(call.options.body, undefined);
  } finally { f.close(); }
});
test('a missing private lane or offline start cannot dispatch through another capability', async () => {
  for (const config of [{ transportPresent: false }, { initialOnline: false }]) {
    const f = fixture(config); try { await f.session.load(); await f.session.prepareSave(position(), false); await f.session.confirm();
      assert.equal(f.session.model().canLoad, false); assert.equal(f.calls.length, 0); assert.equal(f.proofs.length, 0);
    } finally { f.close(); }
  }
});
test('save requires a fresh read, exact explicit review and separate confirmation followed by a fresh readback', async () => {
  const f = fixture(); try {
    const intended = position(); await f.session.prepareSave(intended, true);
    assert.equal(f.calls.length, 1); assert.equal(f.session.model().phase, 'review'); assert.equal(f.session.model().canNavigate, false);
    intended.blockIndex = 700; const view = f.session.model(); view.review.mutation.blockIndex = 701; view.review.previous.revision = 900;
    await f.session.confirm(); assert.deepEqual(f.calls.map(call => call.options.method), ['GET', 'POST', 'GET']);
    assert.equal(f.proofs.length, 3); assert.equal(f.calls[1].options.body, JSON.stringify({ expectedMemberId: MEMBER, expectedRevision: 0,
      bookId: 'hamlet', action: 'save', editionId: position().editionId, blockIndex: 42, completed: true }));
    assert.equal(f.session.model().phase, 'ready'); assert.match(f.session.model().message, /confirmed by a fresh read/);
    assert.equal(f.session.model().entries[0].completed, true); assert.equal(f.session.model().entries[0].bookmark.blockIndex, 42);
    const count = f.calls.length; await f.session.confirm(); assert.equal(f.calls.length, count);
  } finally { f.close(); }
});
test('cancel does not send and a subsequent review rechecks the current revision', async () => {
  const f = fixture(); try {
    await f.session.prepareSave(position(), false); f.session.cancel(); await f.session.confirm(); assert.equal(f.calls.length, 1);
    f.set(state('hamlet', { status: 'saved', revision: 3, blockIndex: 45 })); await f.session.prepareSave(position(), false);
    assert.equal(f.session.model().review.mutation.expectedRevision, 3); assert.equal(f.calls.length, 2);
  } finally { f.close(); }
});
test('invalid save coordinates and missing explicit completion fail before credentials or transport', async () => {
  const f = fixture(); try {
    for (const value of [{ ...position(), bookId: 'invented' }, { ...position(), editionId: 'old-edition' },
      { ...position(), blockIndex: -1 }, { ...position(), blockIndex: 1.5 }, { ...position(), blockIndex: passageIndexPin('hamlet').blockCount }]) await f.session.prepareSave(value, false);
    await f.session.prepareSave(position(), undefined); await f.session.load('invented'); await f.session.prepareRemove('invented');
    assert.equal(f.calls.length, 0); assert.equal(f.proofs.length, 0);
  } finally { f.close(); }
});
test('removal is explicitly reviewed and confirmed by an owner-bound tombstone readback', async () => {
  const f = fixture(); try {
    f.set(state('hamlet', { status: 'saved', revision: 2 })); await f.session.prepareRemove('hamlet');
    assert.equal(f.session.model().review.previous.status, 'saved'); assert.equal(f.calls.length, 1); await f.session.confirm();
    assert.equal(f.calls[1].options.body, JSON.stringify({ expectedMemberId: MEMBER, expectedRevision: 2, bookId: 'hamlet', action: 'remove' }));
    assert.equal(f.session.model().phase, 'ready'); assert.equal(f.session.model().entries[0].status, 'removed');
    assert.equal(f.session.model().entries[0].revision, 3); assert.equal(await f.session.open('hamlet'), null);
  } finally { f.close(); }
});
for (const action of ['save', 'remove']) test(`${action} no-op may retain its revision but still requires matching fresh readback`, async () => {
  const f = fixture(); try {
    f.set(state('hamlet', { status: action === 'save' ? 'saved' : 'removed', revision: 5 }));
    if (action === 'save') await f.session.prepareSave(position(), false); else await f.session.prepareRemove('hamlet');
    await f.session.confirm(); assert.equal(f.session.model().phase, 'ready'); assert.equal(f.row('hamlet').revision, 5);
    assert.equal(f.calls.filter(call => call.options.method === 'GET').length, 2);
  } finally { f.close(); }
});
test('an unknown attempt can only be explicitly retried with its original exact CAS values', async () => {
  const f = fixture(); try {
    await uncertain(f); const first = f.calls.find(call => call.options.method === 'POST').options.body;
    assert.deepEqual(clone(f.session.model().retryBooks), []); f.session.reviewRetry('hamlet'); assert.equal(f.session.model().review, null);
    await f.session.prepareSave(position('hamlet', 99), true); assert.equal(f.session.model().phase, 'unknown'); assert.equal(f.session.model().review, null);
    f.session.reviewRetry('hamlet'); assert.equal(f.session.model().review.retry, true); assert.equal(f.session.model().review.mutation.blockIndex, 42);
    f.session.model().review.mutation.expectedRevision = 99; await f.session.confirm();
    assert.equal(f.calls.filter(call => call.options.method === 'POST')[1].options.body, first); assert.equal(f.session.model().phase, 'ready');
  } finally { f.close(); }
});
test('fresh state after a lost applied receipt settles a newer revision without claiming the lost receipt', async () => {
  const f = fixture(); try {
    await f.session.prepareSave(position(), false); f.hook((url, options) => { const result = f.normal(url, options); if (options.method === 'POST') throw Error('Reply lost after commit'); return result; });
    await f.session.confirm(); assert.equal(f.session.model().phase, 'unknown'); f.hook(null); await f.session.load('hamlet');
    assert.equal(f.session.model().phase, 'ready'); assert.match(f.session.model().message, /no earlier receipt is assumed/);
    assert.deepEqual(clone(f.session.model().retryBooks), []); assert.equal(f.calls.filter(call => call.options.method === 'POST').length, 1);
  } finally { f.close(); }
});
for (const action of ['save', 'remove']) test(`an unknown no-op ${action} stays unresolved at the same revision and needs an exact retry`, async () => {
  const f = fixture(); try {
    f.set(state('hamlet', { status: action === 'save' ? 'saved' : 'removed', revision: 5 }));
    if (action === 'save') await f.session.prepareSave(position(), false); else await f.session.prepareRemove('hamlet');
    f.hook((url, options) => { const result = f.normal(url, options); if (options.method === 'POST') throw Error('Lost no-op reply'); return result; });
    await f.session.confirm(); f.hook(null); await f.session.load('hamlet'); assert.equal(f.session.model().phase, 'unknown');
    assert.deepEqual(clone(f.session.model().retryBooks), ['hamlet']); f.session.reviewRetry('hamlet'); await f.session.confirm();
    assert.equal(f.session.model().phase, 'ready'); assert.equal(f.row('hamlet').revision, 5);
  } finally { f.close(); }
});
for (const status of [400, 401, 403, 409]) test(`an initial ${status} refusal discards only that unsatisfied attempt, while a refused retry remains unknown`, async () => {
  const f = fixture(); try {
    await f.session.prepareSave(position(), false); f.hook((url, options) => options.method === 'POST' ? f.response(url, { error: 'refused' }, status) : f.normal(url, options));
    await f.session.confirm(); assert.equal(f.session.model().phase, status === 409 ? 'conflict' : 'unavailable'); f.hook(null);
    await f.session.prepareSave(position('hamlet', 43), false); assert.equal(f.session.model().phase, 'review'); f.session.cancel();
    await uncertain(f); await f.session.load('hamlet'); f.session.reviewRetry('hamlet');
    f.hook((url, options) => options.method === 'POST' ? f.response(url, { error: 'refused' }, status) : f.normal(url, options));
    await f.session.confirm(); assert.equal(f.session.model().phase, 'unknown'); f.hook(null); await f.session.load('hamlet');
    assert.deepEqual(clone(f.session.model().retryBooks), ['hamlet']);
  } finally { f.close(); }
});
test('a known save receipt followed by a newer conflicting state presents conflict without claiming the old position', async () => {
  const f = fixture(); try {
    await f.session.prepareSave(position(), false); f.hook((url, options) => { const result = f.normal(url, options);
      if (options.method === 'POST') f.set(state('hamlet', { status: 'saved', revision: 2, blockIndex: 90, completed: true })); return result; });
    await f.session.confirm(); assert.equal(f.session.model().phase, 'conflict'); assert.equal(f.session.model().entries[0].bookmark.blockIndex, 90);
    assert.match(f.session.model().message, /earlier change is not being claimed/); assert.deepEqual(clone(f.session.model().retryBooks), []);
  } finally { f.close(); }
});
test('a delayed earlier save cannot resurrect a removed position after its revision is fenced', async () => {
  const f = fixture(); let delayed; try {
    await f.session.prepareSave(position(), false); f.hook((url, options) => { if (options.method === 'POST') { delayed = { url, options }; throw Error('Delivery held'); } return f.normal(url, options); });
    await f.session.confirm(); f.hook(null); f.set(state('hamlet', { status: 'saved', revision: 1, blockIndex: 60 }));
    await f.session.prepareRemove('hamlet'); await f.session.confirm(); assert.equal(f.row('hamlet').revision, 2);
    assert.equal(f.normal(delayed.url, delayed.options).status, 409); assert.equal(f.row('hamlet').status, 'removed');
  } finally { f.close(); }
});
test('all-book reconciliation rejects any regressed pending revision before settling another pending book', async () => {
  const f = fixture(); try {
    f.set(state('hamlet', { status: 'saved', revision: 1, blockIndex: 30 })); f.set(state('apology', { status: 'saved', revision: 2, blockIndex: 15 }));
    await uncertain(f, 'hamlet'); await uncertain(f, 'apology', 20);
    f.set(state('hamlet', { status: 'saved', revision: 2 })); f.set(state('apology', { status: 'saved', revision: 1, blockIndex: 15 }));
    await f.session.load(); assert.equal(f.session.model().phase, 'unknown'); assert.deepEqual(clone(f.session.model().entries), []);
    f.set(state('hamlet', { status: 'saved', revision: 1, blockIndex: 30 })); f.set(state('apology', { status: 'saved', revision: 2, blockIndex: 15 }));
    await f.session.load(); assert.deepEqual([...f.session.model().retryBooks].sort(), ['apology', 'hamlet']);
  } finally { f.close(); }
});
const alteredReplies = {
  'wrong owner': body => { body.memberId = OTHER; }, 'extra envelope field': body => { body.privateEmail = 'unrequested'; },
  'missing state': body => { body.progress = []; }, 'duplicate state': body => { body.progress.push(clone(body.progress[0])); },
  'wrong selected book': body => { body.progress[0] = state('apology'); }, 'extra state field': body => { body.progress[0].secret = 'unexpected'; },
  'negative revision': body => { body.progress[0].revision = -1; }, 'unsafe revision': body => { body.progress[0].revision = Number.MAX_SAFE_INTEGER + 1; },
  'edition mismatch': body => { body.progress[0].edition.editionId = 'old-edition'; },
  'block count mismatch': body => { body.progress[0].edition.blockCount++; }, 'false absent completion': body => { body.progress[0].completed = false; },
  'fabricated bookmark': body => { body.progress[0].bookmark = { status: 'current', ...position() }; },
};
for (const [label, alter] of Object.entries(alteredReplies)) test(`a ${label} GET reply cannot expose private saved state`, async () => {
  const f = fixture(); try { f.hook((url) => { const body = f.envelope('hamlet'); alter(body); return f.response(url, body); });
    await f.session.load('hamlet'); assert.equal(f.session.model().phase, 'unavailable'); assert.deepEqual(clone(f.session.model().entries), []);
  } finally { f.close(); }
});
test('all-book replies must contain the complete canonical catalog in order', async () => {
  for (const transform of [body => body.progress.reverse(), body => body.progress.pop()]) {
    const f = fixture(); try { f.hook(url => { const body = f.envelope(); transform(body); return f.response(url, body); });
      await f.session.load(); assert.equal(f.session.model().phase, 'unavailable'); assert.equal(f.session.model().entries.length, 0);
    } finally { f.close(); }
  }
});
test('changed save receipts require a new revision and cannot claim an unchanged or oversized revision', async () => {
  for (const revision of [0, 2]) {
    const f = fixture(); try { await f.session.prepareSave(position(), false); f.hook((url, options) => options.method === 'POST'
      ? f.response(url, { memberId: MEMBER, progress: [state('hamlet', { status: 'saved', revision })] }) : f.normal(url, options));
      await f.session.confirm(); assert.equal(f.session.model().phase, 'unknown'); assert.equal(f.calls.length, 2); assert.equal(f.session.model().entries.length, 0);
    } finally { f.close(); }
  }
});
test('redirects, a different final URL, noninteger status and unreadable JSON are refused', async () => {
  for (const transform of [r => ({ ...r, redirected: true }), r => ({ ...r, url: r.url + '&other=1' }),
    r => ({ ...r, status: 200.5 }), r => ({ ...r, json: async () => { throw Error('Unreadable'); } })]) {
    const f = fixture(); try { f.hook((url, options) => transform(f.normal(url, options))); await f.session.load('hamlet');
      assert.equal(f.session.model().phase, 'unavailable'); assert.equal(f.session.model().entries.length, 0);
    } finally { f.close(); }
  }
});
for (const stage of ['credentials', 'transport', 'json']) test(`${stage} deadline refuses late private load restoration`, async () => {
  const f = fixture({ timeoutMs: 15 }), held = deferred(); try {
    if (stage === 'credentials') f.proof(() => held.promise); else if (stage === 'transport') f.hook(() => held.promise); else f.json(() => held.promise);
    await f.session.load('hamlet'); assert.equal(f.session.model().phase, 'unavailable'); assert.equal(f.session.model().busy, false);
    if (f.calls.length) assert.equal(f.calls[0].options.signal.aborted, true);
    held.resolve(stage === 'credentials' ? { bearer: 'TOKEN', subject: SUBJECT } : stage === 'transport'
      ? f.response(f.calls[0].url, f.envelope('hamlet')) : f.envelope('hamlet')); await tick();
    assert.equal(f.session.model().entries.length, 0); assert.equal(f.calls.length, stage === 'credentials' ? 0 : 1);
  } finally { f.close(); }
});
for (const stage of ['transport', 'json', 'readback']) test(`a ${stage} deadline after sending preserves only explicit same-CAS recovery`, async () => {
  const f = fixture({ timeoutMs: 15 }), held = deferred(); try {
    await f.session.prepareSave(position(), false);
    f.hook((url, options) => {
      if (options.method === 'POST') return stage === 'transport' ? held.promise
        : stage === 'json' ? { ...f.response(url, f.envelope('hamlet')), json: () => held.promise }
          : f.response(url, { memberId: MEMBER, progress: [state('hamlet', { status: 'saved', revision: 1 })] });
      return held.promise;
    });
    await f.session.confirm(); assert.equal(f.session.model().phase, 'unknown'); assert.equal(f.session.model().entries.length, 0);
    held.resolve(stage === 'json' ? { memberId: MEMBER, progress: [state('hamlet', { status: 'saved', revision: 1 })] }
      : f.response(f.calls.at(-1).url, f.envelope('hamlet'))); await tick(); assert.equal(f.session.model().phase, 'unknown');
    f.hook(null); await f.session.load('hamlet'); assert.deepEqual(clone(f.session.model().retryBooks), ['hamlet']);
  } finally { f.close(); }
});
for (const retirement of ['inactive', 'offline', 'disconnect', 'owner notification']) test(`${retirement} clears visible state and review but preserves private exact recovery without auto requests`, async () => {
  const f = fixture(); try {
    await uncertain(f); await f.session.load('hamlet'); f.session.reviewRetry('hamlet'); const count = f.calls.length;
    if (retirement === 'inactive') f.session.activity(false); else if (retirement === 'offline') f.session.connectivity(false);
    else if (retirement === 'disconnect') f.session.disconnect(); else f.notify();
    assert.equal(f.session.model().entries.length, 0); assert.equal(f.session.model().review, null); assert.equal(f.session.model().retryBooks.length, 0);
    f.session.activity(true); f.session.connectivity(true); f.session.connect(); assert.equal(f.calls.length, count);
    await f.session.confirm(); assert.equal(f.calls.length, count); await f.session.load('hamlet'); f.session.reviewRetry('hamlet');
    assert.equal(f.session.model().review.retry, true); assert.equal(f.session.model().review.mutation.blockIndex, 42);
  } finally { f.close(); }
});
test('same-scope subject substitution cannot send a pending action or disclose another account response', async () => {
  const f = fixture(); try {
    await uncertain(f); await f.session.load('hamlet'); f.session.reviewRetry('hamlet'); const count = f.calls.length;
    f.subject(OTHER); await f.session.confirm(); assert.equal(f.calls.length, count); assert.equal(f.session.model().phase, 'unknown');
    await f.session.load(); assert.equal(f.calls.length, count); assert.equal(f.session.model().entries.length, 0);
    f.subject(SUBJECT); await f.session.load('hamlet'); assert.deepEqual(clone(f.session.model().retryBooks), ['hamlet']);
  } finally { f.close(); }
});
test('terminal close clears recovery, detaches owner observation and prevents all stale actions', async () => {
  const f = fixture(); try {
    await uncertain(f); const count = f.calls.length; f.close(); assert.equal(f.subscriptions, 0); f.session.connect(); f.session.activity(true); f.session.connectivity(true);
    await f.session.load(); await f.session.prepareSave(position(), false); f.session.reviewRetry('hamlet'); await f.session.confirm();
    assert.equal(f.calls.length, count); assert.equal(f.session.model().phase, 'closed'); assert.equal(f.session.model().retryBooks.length, 0);
  } finally { f.close(); }
});
test('a reentrant observer retirement prevents credential checks and dispatch from a just-starting operation', async () => {
  const f = fixture(); try { const off = f.session.subscribe(model => { if (model.busy) f.close(); }); await f.session.load(); off();
    assert.equal(f.calls.length, 0); assert.equal(f.proofs.length, 0); assert.equal(f.session.model().phase, 'closed');
  } finally { f.close(); }
});
test('opening returns only a fresh current locator and never creates a write or inferred completion', async () => {
  const f = fixture(); try {
    f.set(state('hamlet', { status: 'saved', revision: 4, blockIndex: 99, completed: false })); await f.session.load('hamlet');
    f.set(state('hamlet', { status: 'saved', revision: 5, blockIndex: 101, completed: false })); const opened = await f.session.open('hamlet');
    assert.equal(opened.bookmark.blockIndex, 101); assert.equal(opened.completed, false); assert.equal(f.calls.length, 2);
    opened.bookmark.blockIndex = 900; f.session.model().entries[0].bookmark.blockIndex = 901; assert.equal(f.session.model().entries[0].bookmark.blockIndex, 101);
    assert.ok(f.calls.every(call => call.options.method === 'GET'));
  } finally { f.close(); }
});
for (const [label, sectionId] of [['legacy', '123'], ['changed edition', encodeBookmarkLocator('old-edition', 2)], ['invalid', 'bad-locator']]) test(`a ${label} saved place is visible but never remapped when opened`, async () => {
  const f = fixture(); try { f.set(state('hamlet', { status: 'saved', revision: 2, sectionId })); const opened = await f.session.open('hamlet');
    assert.equal(opened, null); assert.equal(f.session.model().entries[0].sectionId, sectionId); assert.match(f.session.model().message, /never remapped automatically/);
    await f.session.prepareRemove('hamlet'); assert.equal(f.session.model().phase, 'review');
  } finally { f.close(); }
});
test('retirement during the final ready notification also revokes the awaited open result', async () => {
  for (const retire of [f => f.close(), f => f.session.disconnect(), f => f.session.activity(false)]) {
    const f = fixture(); try { f.set(state('hamlet', { status: 'saved', revision: 2 }));
      const off = f.session.subscribe(model => { if (!model.busy && model.phase === 'ready') retire(f); });
      assert.equal(await f.session.open('hamlet'), null); off(); assert.equal(f.session.model().entries.length, 0);
    } finally { f.close(); }
  }
});
for (const stage of ['load', 'save-readback']) test(`${stage} helper continuations cannot restore private authority across microtask retirement depths`, async () => {
  for (let depth = 0; depth <= 8; depth++) {
    const f = fixture(); try {
      if (stage === 'save-readback') await f.session.prepareSave(position(), false);
      f.hook((url, options) => {
        const response = f.normal(url, options);
        if (options.method !== 'GET') return response;
        return { ...response, json: async () => {
          const body = await response.json(); let queued = Promise.resolve();
          for (let count = 0; count < depth; count++) queued = queued.then(() => {});
          queued.then(() => f.close()); return body;
        } };
      });
      await (stage === 'load' ? f.session.load('hamlet') : f.session.confirm()); await tick();
      assert.equal(f.session.model().phase, 'closed', `depth ${depth}`); assert.equal(f.session.model().entries.length, 0, `depth ${depth}`);
      assert.equal(f.session.model().review, null); assert.equal(f.session.model().retryBooks.length, 0);
    } finally { f.close(); }
  }
});
