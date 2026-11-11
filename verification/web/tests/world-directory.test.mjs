import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ts = createRequire(path.join(root, 'package.json'))('typescript');
const source = fs.readFileSync(path.join(root, 'app/world/space-directory.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const loaded = { exports: {} };
vm.runInNewContext(`(function(exports){${compiled}\n})`, { AbortController, setTimeout, clearTimeout })(loaded.exports);
const { parseSpaces, startSpaceDirectory } = loaded.exports;
const plain = value => JSON.parse(JSON.stringify(value));
const space = { id: 'sample', name: 'A public library', description: null, city: null, country: null, space_type: 'library', total_scans: 2, avg_quality: 80 };
const flush = () => new Promise(resolve => setImmediate(resolve));
function start(fetcher) {
  const states = [], timers = [];
  const dispose = startSpaceDirectory(value => states.push(plain(value)), fetcher, {
    set: (callback, delay) => { const timer = { callback, delay }; timers.push(timer); return timer; },
    clear: timer => { timer.cleared = true; },
  });
  return { states, timers, dispose };
}
test('only a valid successful response can establish empty or populated results', async () => {
  assert.deepEqual(plain(parseSpaces({ spaces: [] })), []);
  assert.deepEqual(plain(parseSpaces({ spaces: [space] })), [space]);
  for (const value of [{}, { error: 'offline', spaces: [] }, { spaces: [space, space] }, { spaces: [{ ...space, total_scans: -1 }] }, { spaces: [{ ...space, name: null }] }]) assert.throws(() => parseSpaces(value));
  const a = start(async (url, options) => {
    assert.equal(url, '/api/world/spaces'); assert.equal(options.credentials, 'omit'); assert.equal(options.cache, 'no-store'); assert.equal(options.redirect, 'error');
    return Response.json({ spaces: [space] });
  });
  await flush(); assert.deepEqual(a.states, [{ kind: 'ready', spaces: [space] }]); assert.equal(a.timers[0].cleared, true); a.dispose();
});
test('server failure, malformed body and network rejection remain errors, never empty results', async () => {
  for (const fetcher of [async () => Response.json({ spaces: [] }, { status: 500 }), async () => Response.json({}), async () => new Response('invalid json'), async () => { throw Error('offline'); }]) {
    const a = start(fetcher); await flush(); assert.deepEqual(a.states, [{ kind: 'error' }]); a.dispose();
  }
});
test('deadline covers a stalled response body and discards a late successful body', async () => {
  let resolveBody, signal;
  const a = start(async (_url, options) => { signal = options.signal; return { ok: true, json: () => new Promise(resolve => { resolveBody = resolve; }) }; });
  await flush(); assert.equal(a.timers[0].delay, 10_000); a.timers[0].callback();
  assert.equal(signal.aborted, true); assert.deepEqual(a.states, [{ kind: 'error' }]);
  resolveBody({ spaces: [space] }); await flush(); assert.deepEqual(a.states, [{ kind: 'error' }]); a.dispose();
});
test('unmount retires a request and a fresh retry can succeed independently', async () => {
  let resolveResponse, signal;
  const a = start((_url, options) => { signal = options.signal; return new Promise(resolve => { resolveResponse = resolve; }); });
  a.dispose(); assert.equal(signal.aborted, true); resolveResponse(Response.json({ spaces: [space] })); await flush(); assert.deepEqual(a.states, []);
  const retry = start(async () => Response.json({ spaces: [] })); await flush(); assert.deepEqual(retry.states, [{ kind: 'ready', spaces: [] }]); retry.dispose();
});
