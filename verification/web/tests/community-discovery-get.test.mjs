import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { setImmediate as tick } from 'node:timers/promises';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(path.join(root, 'package.json'));
const ts = require('typescript');
const { NextResponse } = require('next/server');
const plain = value => JSON.parse(JSON.stringify(value));
const publicRecord = { id: 'synthetic-public', slug: 'synthetic-circle', name: 'Synthetic circle', description: null, branding: { color: 'gold' }, theme: 'classic' };
const privateRecord = { id: 'synthetic-private', slug: 'synthetic-private', name: 'Synthetic private circle', description: null, private_fixture: true };
const diagnostic = { message: 'PRIVATE_DATABASE_DIAGNOSTIC_NOT_REAL', code: 'SYNTHETIC', details: 'TEST_ONLY_DETAILS', hint: 'TEST_ONLY_HINT' };
const publicSteps = [
  ['from', 'communities'], ['select', 'id, slug, name, description, branding, theme'],
  ['eq', 'is_public', true], ['eq', 'is_active', true], ['order', 'created_at', { ascending: false }], ['limit', 20], ['returns'],
];

// Compile the real GET and unchanged privateJson helper. Auth/database dependencies
// are strict stubs; importing connected service implementations is impossible here.
function fixture({ auth = null, publicResult = { data: [publicRecord], error: null }, memberships = [], privateResult = [], rejectAt } = {}) {
  const queries = [], imports = [], loaded = [], authCalls = [], logs = [], cache = new Map();
  const forbidden = () => { throw new Error('Mutation or network is forbidden in the synthetic GET fixture'); };
  const database = { from(table) {
    const steps = [['from', table]]; queries.push(steps);
    const builder = {};
    for (const method of ['select','eq','in','order','limit']) builder[method] = (...args) => {
      steps.push([method, ...plain(args)]);
      if (rejectAt === method && table === 'communities') throw new Error('SYNTHETIC_BUILD_ERROR');
      return builder;
    };
    builder.returns = () => {
      steps.push(['returns']);
      if (table === 'community_members') return Promise.resolve({ data: memberships, error: null });
      assert.equal(table, 'communities');
      if (steps.some(step => step[0] === 'select' && step[1] === '*')) return Promise.resolve({ data: privateResult, error: null });
      return typeof publicResult === 'function' ? publicResult() : Promise.resolve(publicResult);
    };
    for (const method of ['insert','update','upsert','delete','rpc']) builder[method] = forbidden;
    return builder;
  } };
  const context = vm.createContext({ Headers, Request, Response, TextDecoder, AbortController, setTimeout, clearTimeout,
    fetch: forbidden, console: { log: (...args) => logs.push(args), error: (...args) => logs.push(args), warn: (...args) => logs.push(args) } });
  const permittedSources = new Set(['app/api/communities/route.ts','lib/http/routeError.ts','app/explore/directory-read.ts']);
  function load(name) {
    assert.ok(permittedSources.has(name), `Unexpected source import: ${name}`);
    if (cache.has(name)) return cache.get(name).exports;
    loaded.push(name);
    const loadedModule = { exports: {} }; cache.set(name, loadedModule);
    const compiled = ts.transpileModule(fs.readFileSync(path.join(root,name),'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const localRequire = specifier => {
      imports.push(specifier);
      if (specifier === 'server-only') return {};
      if (specifier === 'next/server') return { NextResponse };
      if (specifier === '@/lib/http/routeError') return load('lib/http/routeError.ts');
      if (specifier === '@/lib/getAuthenticatedMember') return { getAuthenticatedMember: async req => { authCalls.push(req); assert.equal(req.method, 'GET'); return auth; } };
      if (specifier === '@/lib/supabase/admin') return { getSupabaseAdmin: () => database };
      if (specifier === '@/lib/governance/hats') return { initializeRolesForCommunity: forbidden };
      if (specifier === '@/lib/wallets/agentWallet') return { initializeAgentWallets: forbidden };
      throw new Error(`Unstubbed import forbidden: ${specifier}`);
    };
    new vm.Script(`(function(require,module,exports){${compiled}\n})`,{filename:name}).runInContext(context)(localRequire,loadedModule,loadedModule.exports);
    return loadedModule.exports;
  }
  const route = load('app/api/communities/route.ts');
  return { queries, imports, loaded, authCalls, logs, load,
    get: () => route.GET(new Request('https://synthetic.invalid/api/communities', { method: 'GET' })),
  };
}

function headers(response) {
  assert.equal(response.headers.get('cache-control'), 'private, no-store, no-cache, max-age=0, must-revalidate');
  assert.equal(response.headers.get('surrogate-control'), 'no-store');
  assert.equal(response.headers.get('vary'), 'Cookie, Authorization');
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('content-security-policy'), "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  assert.match(response.headers.get('content-type'), /^application\/json/);
}
async function unavailable(response) {
  assert.equal(response.status, 503); headers(response);
  assert.deepEqual(await response.json(), { error: 'Community directory unavailable' });
}
function publicContract(f) {
  assert.deepEqual(f.queries.at(-1), publicSteps);
  assert.equal(f.authCalls.length, 1); assert.deepEqual(f.logs, []);
  assert.ok(f.loaded.every(name => ['app/api/communities/route.ts','lib/http/routeError.ts','app/explore/directory-read.ts'].includes(name)));
}

test('successful public rows preserve the response, query and private-header contract', async () => {
  const f = fixture(), response = await f.get();
  assert.equal(response.status,200); headers(response);
  assert.deepEqual(await response.json(), { mine: [], discover: [publicRecord] });
  assert.equal(f.queries.length,1); publicContract(f);
});

test('successful empty and successful null data retain the existing empty-success shape', async () => {
  for (const data of [[],null]) {
    const f = fixture({ publicResult: { data, error:null } }), response = await f.get();
    assert.equal(response.status,200); headers(response);
    assert.deepEqual(await response.json(), { mine:[], discover:[] }); publicContract(f);
  }
});

test('an explicit public-query error returns generic unavailability with no database diagnostics', async () => {
  const f = fixture({ publicResult:{ data:null, error:diagnostic } });
  await unavailable(await f.get()); publicContract(f);
});

test('an error wins over partial public data', async () => {
  const f = fixture({ publicResult:{ data:[publicRecord], error:diagnostic } });
  await unavailable(await f.get()); publicContract(f);
});

test('a rejected public query produces the same generic unavailable response', async () => {
  const f = fixture({ publicResult:() => Promise.reject(new Error(diagnostic.message)) });
  await unavailable(await f.get()); publicContract(f);
});

test('a synchronous public-query construction failure also stays generic', async () => {
  const f = fixture({ rejectAt:'select' });
  await unavailable(await f.get()); assert.deepEqual(f.logs,[]);
  assert.equal(f.queries.length,1); assert.deepEqual(f.queries[0], publicSteps.slice(0,2));
});

test('synthetic authenticated success retains the membership branch and role projection', async () => {
  const f = fixture({ auth:{ memberId:'synthetic-member' }, memberships:[{ community_id:privateRecord.id,role:'host' }], privateResult:[privateRecord] });
  const response = await f.get(); headers(response); assert.equal(response.status,200);
  assert.deepEqual(await response.json(), { mine:[{...privateRecord,role:'host'}], discover:[publicRecord] });
  assert.deepEqual(f.queries.slice(0,2), [
    [['from','community_members'],['select','community_id, role'],['eq','member_id','synthetic-member'],['returns']],
    [['from','communities'],['select','*'],['in','id',[privateRecord.id]],['eq','is_active',true],['returns']],
  ]); publicContract(f);
});

test('public failure never serializes prior private results or partial public rows', async () => {
  const f = fixture({ auth:{ memberId:'synthetic-member' }, memberships:[{community_id:privateRecord.id,role:'host'}], privateResult:[privateRecord], publicResult:{data:[publicRecord],error:diagnostic} });
  await unavailable(await f.get()); assert.equal(f.queries.length,3); publicContract(f);
});

test('the unchanged Explore reader distinguishes actual GET failure, empty and ready responses', async () => {
  let mode = 'error';
  const f = fixture({ publicResult:() => Promise.resolve(mode === 'error' ? { data:[publicRecord],error:diagnostic } : { data:mode === 'empty' ? [] : [publicRecord],error:null }) });
  const { createDirectoryReader } = f.load('app/explore/directory-read.ts');
  const states = [], options = [];
  const reader = createDirectoryReader({ emit:state=>states.push(plain(state)), fetcher:(url,init)=>{ assert.equal(url,'/api/communities'); options.push(plain({...init,signal:undefined})); return f.get(); } });
  try {
    reader.load(); await tick(); assert.deepEqual(states.at(-1),{kind:'error',reason:'http'});
    mode='empty'; reader.load(); await tick(); assert.deepEqual(states.at(-1),{kind:'empty'});
    mode='ready'; reader.load(); await tick(); assert.equal(states.at(-1).kind,'ready');
    assert.deepEqual(states.at(-1).communities,[{id:publicRecord.id,slug:publicRecord.slug,name:publicRecord.name,description:null}]);
    assert.equal(options.length,3); assert.ok(options.every(value=>value.method==='GET' && value.credentials==='omit'));
    assert.ok(f.queries.every(query=>JSON.stringify(query)===JSON.stringify(publicSteps)));
    assert.deepEqual(f.logs,[]);
  } finally { reader.dispose(); }
});
