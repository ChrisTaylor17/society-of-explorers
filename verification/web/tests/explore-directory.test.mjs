import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { setImmediate as tick } from 'node:timers/promises';

// Load only the actual client reader. No backend, auth modules or security fixtures.
const require = createRequire(new URL('../../../package.json', import.meta.url));
const ts = require('typescript');
const filename = new URL('../../../app/explore/directory-read.ts', import.meta.url);
const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = vm.createContext({ exports: {}, Response, TextDecoder, AbortController, setTimeout, clearTimeout,
  fetch: () => { throw new Error('Network forbidden in this test'); } });
new vm.Script(source, { filename: filename.pathname }).runInContext(context);
const { createDirectoryReader, decodeDirectory, DIRECTORY_TIMEOUT_MS, DIRECTORY_MAX_BYTES } = context.exports;
const plain = value => JSON.parse(JSON.stringify(value));
const record = { id: 'fixture-one', slug: 'synthetic-reading-circle', name: 'Synthetic reading circle', description: 'Local fixture only.' };
const receipt = (rows = [record]) => Response.json({ discover: rows });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

function fixture(fetcher = async () => receipt()) {
  const states = [], requests = [], timers = new Map(); let counter = 0;
  const reader = createDirectoryReader({
    emit: value => states.push(plain(value)),
    fetcher: (url, options) => { requests.push({ url, options }); return fetcher(url, options); },
    clock: {
      setTimer(fn, delay) { const id = ++counter; timers.set(id, { fn, delay }); return id; },
      clearTimer(id) { timers.delete(id); },
    },
  });
  return { reader, states, requests, timers, last: () => states.at(-1),
    expire() { for (const [id, timer] of [...timers]) { timers.delete(id); timer.fn(); } },
  };
}

test('projects only public fields and treats safe text as text, not HTML', () => {
  const description = '<img src=x onerror=alert(1)> This is supplied text.';
  assert.deepEqual(plain(decodeDirectory({ discover: [{ ...record, description, deployment_status: 'deployed', wallet: 'ignored' }], mine: ['ignored'] })), [{ ...record, description }]);
  assert.deepEqual(plain(decodeDirectory({ discover: [] })), []);
});

test('invalid envelopes cannot masquerade as an empty directory', () => {
  for (const value of [null, [], {}, { discover: null }, { discover: {} }, { discover: [], error: 'database unavailable' }]) {
    assert.throws(() => decodeDirectory(value), /malformed/);
  }
});

test('rejects missing fields, unsafe destinations, duplicate identities and oversized lists', () => {
  const bad = [
    { ...record, id: '' }, { ...record, name: ' ' }, { ...record, name: 'n'.repeat(201) },
    { ...record, description: undefined }, { ...record, description: {} }, { ...record, description: 'x'.repeat(8193) },
    ...['../private', '//host.test', 'a?token=x', 'a#x', '%2e%2e', 'https://host.test', ''].map(slug => ({ ...record, slug })),
  ];
  for (const value of bad) assert.throws(() => decodeDirectory({ discover: [value] }), /malformed/);
  assert.throws(() => decodeDirectory({ discover: [record, { ...record, id: 'different' }] }), /malformed/);
  assert.throws(() => decodeDirectory({ discover: [record, { ...record, slug: 'different' }] }), /malformed/);
  assert.throws(() => decodeDirectory({ discover: Array.from({ length: 21 }, (_, i) => ({ ...record, id: String(i), slug: `fixture-${i}` })) }), /malformed/);
  assert.equal(decodeDirectory({ discover: [{ ...record, slug: '-safe--slug-' }] })[0].slug, '-safe--slug-');
});

test('public GET is credential-free, bounded, and never automatically retried', async () => {
  const f = fixture(); f.reader.load();
  assert.equal(f.last().kind, 'loading');
  assert.equal([...f.timers.values()][0].delay, DIRECTORY_TIMEOUT_MS);
  await tick();
  assert.equal(f.last().kind, 'ready'); assert.equal(f.timers.size, 0);
  assert.equal(f.requests.length, 1); assert.equal(f.requests[0].url, '/api/communities');
  const { signal, ...options } = f.requests[0].options;
  assert.deepEqual(plain(options), { method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', headers: { Accept: 'application/json' } });
  assert.equal(signal.aborted, false);
  f.expire(); await tick(); assert.equal(f.requests.length, 1);
  f.reader.dispose();
});

test('valid empty response is distinct from ready or unavailable', async () => {
  const f = fixture(async () => receipt([])); f.reader.load(); await tick();
  assert.deepEqual(f.states, [{ kind: 'loading' }, { kind: 'empty' }]);
  assert.equal(f.timers.size, 0); f.reader.dispose();
});

test('HTTP errors are not parsed as successful listings', async () => {
  const f = fixture(async () => Response.json({ discover: [record] }, { status: 503 }));
  f.reader.load(); await tick(); assert.deepEqual(f.last(), { kind: 'error', reason: 'http' });
  assert.equal(f.requests[0].options.signal.aborted, true); assert.equal(f.timers.size, 0);
  assert.equal(f.requests.length, 1); f.reader.dispose();
});

test('network rejection is explicit and retry can recover', async () => {
  let count = 0;
  const f = fixture(async () => { if (++count === 1) throw new Error('synthetic offline'); return receipt(); });
  f.reader.load(); await tick(); assert.deepEqual(f.last(), { kind: 'error', reason: 'network' });
  assert.equal(f.requests.length, 1); f.reader.load(); await tick();
  assert.equal(f.last().kind, 'ready'); assert.equal(f.requests.length, 2); f.reader.dispose();
});

test('invalid JSON, MIME and schema responses are explicit failures', async () => {
  for (const response of [
    new Response('{', { headers: { 'content-type': 'application/json' } }),
    new Response('<html>temporary error</html>', { headers: { 'content-type': 'text/html' } }),
    Response.json({ discover: [null] }), Response.json({ error: 'unavailable' }),
    new Response(new Uint8Array([0xff]), { headers: { 'content-type': 'application/json' } }),
  ]) {
    const f = fixture(async () => response); f.reader.load(); await tick();
    assert.deepEqual(f.last(), { kind: 'error', reason: 'malformed' });
    assert.equal(f.timers.size, 0); f.reader.dispose();
  }
});

test('body size is limited even when Content-Length is absent', async () => {
  let cancelled = false;
  const body = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(DIRECTORY_MAX_BYTES)); c.enqueue(new Uint8Array(1)); }, cancel() { cancelled = true; } });
  const f = fixture(async () => new Response(body, { headers: { 'content-type': 'application/json' } }));
  f.reader.load(); await tick(); assert.deepEqual(f.last(), { kind: 'error', reason: 'malformed' });
  assert.equal(cancelled, true); f.reader.dispose();
});

test('oversized declared content is rejected before reading', async () => {
  const f = fixture(async () => new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': String(DIRECTORY_MAX_BYTES + 1) } }));
  f.reader.load(); await tick(); assert.deepEqual(f.last(), { kind: 'error', reason: 'malformed' }); f.reader.dispose();
});

test('split UTF-8 chunks decode correctly; stream failures remain network failures', async () => {
  const bytes = new TextEncoder().encode(JSON.stringify({ discover: [{ ...record, name: 'Synthetic café' }] }));
  const f = fixture(async () => new Response(new ReadableStream({ start(c) { for (const b of bytes) c.enqueue(new Uint8Array([b])); c.close(); } }), { headers: { 'content-type': 'application/json' } }));
  f.reader.load(); await tick(); assert.equal(f.last().communities[0].name, 'Synthetic café'); f.reader.dispose();
  const failed = fixture(async () => new Response(new ReadableStream({ start(c) { c.error(new Error('synthetic stream failure')); } }), { headers: { 'content-type': 'application/json' } }));
  failed.reader.load(); await tick(); assert.deepEqual(failed.last(), { kind: 'error', reason: 'network' }); failed.reader.dispose();
});

test('deadline settles a fetch that ignores abort; repeat clicks do not overlap requests', async () => {
  const pending = deferred(), f = fixture(() => pending.promise);
  f.reader.load(); f.reader.load(); f.reader.load(); assert.equal(f.requests.length, 1);
  f.expire(); assert.deepEqual(f.last(), { kind: 'error', reason: 'timeout' });
  assert.equal(f.requests[0].options.signal.aborted, true); assert.equal(f.timers.size, 0);
  pending.resolve(receipt()); await tick(); assert.deepEqual(f.last(), { kind: 'error', reason: 'timeout' }); f.reader.dispose();
});

test('deadline also cancels a stalled body', async () => {
  let cancelled = false;
  const f = fixture(async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'content-type': 'application/json' } }));
  f.reader.load(); await tick(); f.expire(); await tick();
  assert.deepEqual(f.last(), { kind: 'error', reason: 'timeout' }); assert.equal(cancelled, true);
  assert.equal(f.timers.size, 0); f.reader.dispose();
});

test('late success and rejection cannot overwrite a newer retry', async () => {
  for (const failure of [false, true]) {
    const old = deferred(); let count = 0;
    const f = fixture(() => ++count === 1 ? old.promise : Promise.resolve(receipt([{ ...record, name: 'Newer result' }])));
    f.reader.load(); f.expire(); f.reader.load(); await tick();
    assert.equal(f.last().communities[0].name, 'Newer result');
    if (failure) old.reject(new Error('late rejection')); else old.resolve(receipt());
    await tick(); assert.equal(f.last().communities[0].name, 'Newer result');
    assert.equal(f.requests.length, 2); f.reader.dispose();
  }
});

test('unmount cleanup suppresses late updates, aborts work and removes the timer', async () => {
  const pending = deferred(), f = fixture(() => pending.promise);
  f.reader.load(); f.reader.dispose(); f.reader.dispose();
  assert.equal(f.requests[0].options.signal.aborted, true); assert.equal(f.timers.size, 0);
  pending.resolve(receipt()); await tick(); f.reader.load(); f.expire();
  assert.deepEqual(f.states, [{ kind: 'loading' }]); assert.equal(f.requests.length, 1);
});

test('unmount while reading a body cancels the body without another state update', async () => {
  let cancelled = false;
  const f = fixture(async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'content-type': 'application/json' } }));
  f.reader.load(); await tick(); f.reader.dispose(); await tick();
  assert.equal(cancelled, true); assert.equal(f.timers.size, 0); assert.deepEqual(f.states, [{ kind: 'loading' }]);
});
