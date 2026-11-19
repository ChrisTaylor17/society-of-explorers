import test from 'node:test';
import assert from 'node:assert/strict';
import { lstatSync, readFileSync } from 'node:fs';
const read = name => { const path = new URL('../../' + name, import.meta.url), s = lstatSync(path);
  assert(s.isFile() && !s.isSymbolicLink() && (!s.size || s.blocks)); return readFileSync(path, 'utf8'); };
read('platforms/tests/load-source.mjs'); const { sourceLoader } = await import('./load-source.mjs');
const pins = JSON.parse(read('lib/books/passage-indexes.json'));
const load = sourceLoader({ './passage-indexes.json': pins,
  './reading-program-editions.json': JSON.parse(read('lib/circles/reading-program-editions.json')),
  './source-reader-catalog.json': JSON.parse(read('lib/books/source-reader-catalog.json')) });
const { createSourceReading } = load('platforms/shared/source-reading.ts');
function fixture(options = {}) {
  let scope = 'owner-1', calls = 0; const listeners = new Set();
  const owner = { scope: () => scope, bearer: () => { ++calls; throw Error('Forbidden member credentials'); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
  const context = { bookId: 'hamlet', editionId: pins.find(p => p.bookId === 'hamlet').editionId, from: 41, to: 43 };
  const config = { owner, context, available: true, initialOnline: true, ...options };
  const reader = createSourceReading(config); reader.connect();
  const event = (phase = 'ready') => ({ requestKey: reader.model().requestKey, blockIndex: reader.model().blockIndex, phase });
  return { reader, event, config, get calls() { return calls; }, get subscriptions() { return listeners.size; },
    ownerChange(same = false) { if (!same) scope = 'owner-2'; for (const fn of [...listeners]) fn(); } };
}
test('source loading exposes only pinned public coordinates and has no member transport', () => {
  const f = fixture(); assert.equal(f.reader.model().requestKey, null); f.reader.load();
  const m = f.reader.model(); assert.equal(m.phase, 'loading'); assert.equal(m.blockIndex, 41); assert.match(m.requestKey, /^source_\d+_\d+$/);
  assert.equal(f.calls, 0); f.reader.receive(f.event()); assert.equal(f.reader.model().phase, 'ready'); f.reader.close();
});
test('navigation stays within selection and each load fences prior renderer events', () => {
  const f = fixture(); f.reader.load(); const first = f.event(); f.reader.receive(first); f.reader.next(); const second = f.event();
  assert.notEqual(first.requestKey, second.requestKey); f.reader.receive(first); assert.equal(f.reader.model().phase, 'loading');
  f.reader.receive(second); f.reader.next(); f.reader.receive(f.event()); assert.equal(f.reader.model().blockIndex, 43);
  const end = f.reader.model().requestKey; f.reader.next(); assert.equal(f.reader.model().requestKey, end);
  f.reader.previous(); f.reader.receive(f.event()); f.reader.previous(); f.reader.receive(f.event());
  assert.equal(f.reader.model().blockIndex, 41); assert.equal(f.reader.model().canPrevious, false); f.reader.close();
});
for (const bad of ['key', 'index', 'phase']) test(`a mismatched ${bad} callback cannot approve a frame`, () => {
  const f = fixture(); f.reader.load(); const event = f.event();
  if (bad === 'key') event.requestKey += '_old'; if (bad === 'index') event.blockIndex++; if (bad === 'phase') event.phase = 'complete';
  f.reader.receive(event); assert.equal(f.reader.model().phase, 'loading'); f.reader.close();
});
test('ready cannot regress to loading; a later verified-resource failure clears the source', () => {
  const f = fixture(); f.reader.load(); const event = f.event(); f.reader.receive(event); f.reader.receive({ ...event, phase: 'loading' });
  assert.equal(f.reader.model().phase, 'ready'); f.reader.receive({ ...event, phase: 'unavailable' });
  assert.equal(f.reader.model().phase, 'unavailable'); assert.equal(f.reader.model().requestKey, null); f.reader.receive(event);
  assert.equal(f.reader.model().phase, 'unavailable'); f.reader.retry(); assert.notEqual(f.reader.model().requestKey, event.requestKey); f.reader.close();
});
for (const same of [false, true]) test(`owner notification (${same ? 'same' : 'new'} scope) permanently closes source`, () => {
  const f = fixture(); f.reader.load(); const event = f.event(); f.ownerChange(same); f.reader.receive(event);
  assert.equal(f.reader.model().phase, 'closed'); assert.equal(f.subscriptions, 0); assert.equal(f.reader.model().requestKey, null);
  f.reader.connect(); f.reader.load(); assert.equal(f.reader.model().phase, 'closed');
});
for (const kind of ['activity', 'connectivity']) test(`${kind} loss clears content and restoration needs explicit load`, () => {
  const f = fixture({ initialBlockIndex: 42 }); f.reader.load(); f.reader.receive(f.event()); f.reader.next(); const late = f.event();
  f.reader[kind](false); assert.equal(f.reader.model().requestKey, null); assert.equal(f.reader.model().blockIndex, 42);
  f.reader[kind](true); f.reader.receive(late); assert.equal(f.reader.model().phase, 'idle'); assert.equal(f.reader.model().requestKey, null);
  f.reader.load(); assert.equal(f.reader.model().blockIndex, 42); assert.notEqual(f.reader.model().requestKey, late.requestKey); f.reader.close();
});
test('source deadline discards late frames, with exact-position manual retry', async () => {
  const f = fixture({ timeoutMs: 10, initialBlockIndex: 42 }); f.reader.load(); const event = f.event();
  await new Promise(resolve => setTimeout(resolve, 25)); assert.equal(f.reader.model().phase, 'unavailable');
  f.reader.receive(event); assert.equal(f.reader.model().requestKey, null); f.reader.retry(); assert.equal(f.reader.model().blockIndex, 42); f.reader.close();
});
test('unavailable component never enables a source load', () => {
  const f = fixture({ available: false }); f.reader.load(); assert.equal(f.reader.model().canLoad, false); assert.equal(f.reader.model().requestKey, null); f.reader.close();
});
test('callbacks cannot cross separately mounted source lifetimes', () => {
  const a = fixture(), b = fixture(); a.reader.load(); b.reader.load(); b.reader.receive(a.event());
  assert.equal(b.reader.model().phase, 'loading'); a.reader.close(); b.reader.close();
});
test('immutable snapshots and input copies cannot expand a selection', () => {
  const f = fixture(); f.config.context.to = 99; const m = f.reader.model(); m.context.from = 0;
  assert.equal(f.reader.model().context.to, 43); assert.equal(f.reader.model().context.from, 41); f.reader.close();
});
test('invalid range, edition, starting position or added identity is rejected', () => {
  const base = fixture(); const context = base.reader.model().context; base.reader.close();
  for (const contextOverride of [{ ...context, from: -1 }, { ...context, to: 50000 }, { ...context, editionId: 'stale' }, { ...context, circleId: 'private' }])
    assert.throws(() => fixture({ context: contextOverride }));
  for (const initialBlockIndex of [40, 44, 42.5, NaN]) assert.throws(() => fixture({ initialBlockIndex }));
});
test('reentrant close removes the emitted load request before a renderer can mount', () => {
  const f = fixture(); f.reader.subscribe(m => { if (m.busy) f.reader.close(); }); f.reader.load();
  assert.equal(f.reader.model().requestKey, null); assert.equal(f.reader.model().phase, 'closed');
});
