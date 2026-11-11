// Real route, projection, response headers and installed PostgREST parser;
// only the database transport and financial-total enrichment are doubles.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const ID = '11111111-1111-4111-8111-111111111111';
export const OTHER_ID = '22222222-2222-4222-8222-222222222222';
export const publicProject = {
  id: ID, title: 'Synthetic read-contract project', short_description: 'Local fixture only',
  description: 'Synthetic read-only content, not a real venture.', category: 'community', status: 'active',
  funding_goal: 0, amount_raised: 0, backer_count: 0, proposer_name: null, use_of_funds: null,
  milestones: [], update_log: [], created_at: null,
};
export const jsonReply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
export const upstreamError = (code, status, details = 'PRIVATE_SYNTHETIC_DETAIL') => jsonReply({ code, message: 'PRIVATE_SYNTHETIC_MESSAGE', details, hint: 'PRIVATE_SYNTHETIC_HINT' }, status);

// Synthetic table transport evaluates the query the actual installed client
// sends. It does not add a visibility rule missing from the application query.
export function projectTableTransport(rows) {
  return (url, options) => {
    const predicates = [...url.searchParams].filter(([key]) => key === 'id' || key === 'status');
    const matching = rows.filter(row => predicates.every(([column, filter]) => {
      assert.ok(filter.startsWith('eq.'), 'Unexpected fixture predicate: ' + filter);
      return row[column] != null && String(row[column]) === filter.slice(3);
    }));
    const single = new Headers(options.headers).get('accept') === 'application/vnd.pgrst.object+json';
    if (single) return matching.length === 1
      ? jsonReply(matching[0])
      : upstreamError('PGRST116', 406, `The result contains ${matching.length} rows`);
    return jsonReply(matching);
  };
}

export function projectDetailFixture({ root = process.env.SOE_PROJECT_READ_TEST_ROOT || fileURLToPath(new URL('../../../../', import.meta.url)) } = {}) {
  root = path.resolve(root);
  const require = createRequire(path.join(root, 'package.json'));
  const ts = require('typescript');
  const next = require('next/server');
  const { PostgrestClient } = require('@supabase/postgrest-js');
  const calls = [], merges = [], cache = new Map();
  let transport = async () => jsonReply(publicProject), clientCalls = 0;
  const client = new PostgrestClient('https://synthetic-project-read.invalid/rest/v1', {
    fetch: async (input, options) => {
      const url = new URL(String(input));
      assert.equal(url.origin, 'https://synthetic-project-read.invalid');
      assert.equal(url.pathname, '/rest/v1/projects');
      assert.equal(options.method, 'GET');
      assert.equal(options.body, undefined);
      const headers = new Headers(options.headers);
      assert.equal(headers.has('authorization'), false);
      assert.equal(headers.has('apikey'), false);
      calls.push({ url: url.toString(), method: options.method, accept: headers.get('accept') });
      return transport(url, options);
    },
  });
  const allowed = new Set(['app/api/projects/[id]/route.ts', 'app/api/projects/route.ts', 'lib/projects/publicProject.ts', 'lib/ids/uuid.ts', 'lib/http/routeError.ts']);
  const context = vm.createContext({ console, URL, URLSearchParams, Headers, Request, Response, ReadableStream, TextEncoder, TextDecoder, AbortController, AbortSignal, setTimeout, clearTimeout, queueMicrotask, process: { env: {} }, fetch: () => { throw Error('Unconfigured network forbidden'); } });
  function load(filename) {
    assert.ok(allowed.has(filename), 'Unexpected application dependency: ' + filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const full = path.join(root, filename), stat = fs.statSync(full);
    assert.ok(!stat.size || stat.blocks, 'Offloaded source must be materialized: ' + full);
    const loadedModule = { exports: {} }; cache.set(filename, loadedModule);
    const code = ts.transpileModule(fs.readFileSync(full, 'utf8'), { fileName: full, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const scopedRequire = name => {
      if (name === 'server-only') return {};
      if (name === 'next/server') return next;
      if (name === '@/lib/supabase/admin') return { getSupabaseAdmin: () => { clientCalls++; return client; } };
      if (name === '@/lib/capital/projectFunding') return { mergeProjectPledgeTotals: async (instance, rows) => { assert.equal(instance, client); merges.push(JSON.parse(JSON.stringify(rows))); return rows; } };
      if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
      throw Error('Unexpected dependency: ' + name);
    };
    new vm.Script('(function(require,module,exports){' + code + '\n})', { filename: full }).runInContext(context)(scopedRequire, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  const route = load('app/api/projects/[id]/route.ts');
  return {
    calls, merges, clientCalls: () => clientCalls,
    setTransport: nextTransport => { transport = nextTransport; },
    read: (id = ID) => route.GET(new next.NextRequest('http://127.0.0.1/api/projects/' + id), { params: Promise.resolve({ id }) }),
    readCatalog: () => load('app/api/projects/route.ts').GET(),
    projection: load('lib/projects/publicProject.ts'),
  };
}
