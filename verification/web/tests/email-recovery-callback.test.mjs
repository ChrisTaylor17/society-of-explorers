import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { sourceLoader } from '../../../platforms/tests/load-source.mjs';

const require = createRequire(import.meta.url);
const { NextRequest } = require('next/server');
const subject = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const intent = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function data(method = 'oauth', claims = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: subject, exp: now + 3600, amr: [{ method, timestamp: now }], ...claims };
  const token = [Buffer.from('{"alg":"RS256"}').toString('base64url'), Buffer.from(JSON.stringify(payload)).toString('base64url'), 'synthetic_signature'].join('.');
  return { redirectType: null, session: { access_token: token, expires_at: now + 3600, token_type: 'bearer', user: { id: subject } }, user: { id: subject } };
}
function fixture(result = data(), options = {}) {
  const calls = [];
  const load = sourceLoader({
    'server-only': {},
    '@supabase/ssr': {
      createServerClient(_url, _key, config) {
        calls.push('create');
        return { auth: {
          async exchangeCodeForSession(code) {
            assert.equal(code, 'synthetic-code'); calls.push('exchange');
            config.cookies.setAll([{ name: 'sb-test-auth-token', value: 'synthetic-session', options: { path: '/', httpOnly: true } }]);
            if (options.exchangeThrows) throw Error('secret error must not be logged');
            return { data: result, error: options.exchangeError ?? null };
          },
          async getUser(token) {
            assert.equal(token, result.session.access_token); calls.push('proof');
            if (options.proofThrows) throw Error('private provider error');
            return { data: { user: { id: options.proofSubject ?? subject } }, error: options.proofError ?? null };
          },
        } };
      },
    },
  });
  return { calls, GET: load('app/auth/callback/route.ts').GET };
}
async function run(result, options, query = 'code=synthetic-code&next=%2Fpractice') {
  const f = fixture(result, options);
  const response = await f.GET(new NextRequest('https://soe.invalid/auth/callback?' + query + '&intent=' + intent, { headers: { cookie: 'soe_auth_intent=' + intent + '; soe_auth_pkce_intent=' + intent } }));
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
  return { ...f, response };
}
function rejected(response) {
  const location = new URL(response.headers.get('location')); assert.equal(location.pathname, '/login'); assert.equal(location.searchParams.get('auth_error'), '1');
  assert.equal(response.headers.get('set-cookie'), null);
}

for (const method of ['oauth']) test(`ordinary ${method} callback publishes cookies only after exact-token user proof`, async () => {
  const { response, calls } = await run(data(method));
  assert.deepEqual(calls, ['create', 'exchange', 'proof']);
  assert.equal(response.headers.get('location'), 'https://soe.invalid/auth/complete?next=%2Fpractice&intent=' + intent);
  assert.equal(response.cookies.get('sb-test-auth-token')?.value, 'synthetic-session');
  assert.equal(response.cookies.get('soe_auth_provider')?.value, 'supabase');
});

test('email signup confirmation cannot publish ordinary cookies through the OAuth callback', async () => {
  const { response, calls } = await run(data('email/signup')); rejected(response); assert.deepEqual(calls, ['create', 'exchange']);
});

test('recovery suffix never publishes cookies even with an ordinary AMR', async () => {
  const value = data(); value.redirectType = 'PASSWORD_RECOVERY';
  const { response, calls } = await run(value); rejected(response);
  assert.deepEqual(calls, ['create', 'exchange']);
});

test('stripped recovery suffix cannot bypass the provider AMR purpose check', async () => {
  const { response, calls } = await run(data('recovery')); rejected(response);
  assert.deepEqual(calls, ['create', 'exchange']);
});

test('missing, unknown, mixed and malformed AMRs require deliberate ordinary sign-in', async () => {
  const now = Math.floor(Date.now() / 1000);
  for (const amr of [undefined, null, [], [{ method: 'password', timestamp: now }],
    [{ method: 'oauth', timestamp: now }, { method: 'recovery', timestamp: now }],
    [{ method: 'oauth', timestamp: 'yesterday' }], [{ method: 'oauth', timestamp: now + 1000 }]]) {
    const { response, calls } = await run(data('oauth', { amr })); rejected(response);
    assert.deepEqual(calls, ['create', 'exchange']);
  }
});

test('missing or mismatched identities and stale credentials never reach user proof', async () => {
  const values = [null, {}, data('oauth', { sub: other }), data('oauth', { exp: 1 })];
  const mismatch = data(); mismatch.session.user.id = other; values.push(mismatch);
  const stale = data(); stale.session.expires_at = 1; values.push(stale);
  const malformed = data(); malformed.session.access_token = 'not-a-jwt'; values.push(malformed);
  for (const value of values) {
    const { response, calls } = await run(value); rejected(response);
    assert.deepEqual(calls, ['create', 'exchange']);
  }
});

test('failed or mismatched fresh user proof drops all buffered cookies', async () => {
  for (const options of [{ proofSubject: other }, { proofError: { message: 'private' } }, { proofThrows: true }]) {
    const { response, calls } = await run(data(), options); rejected(response);
    assert.deepEqual(calls, ['create', 'exchange', 'proof']);
  }
});

test('failed or thrown exchange drops its cookie writes', async () => {
  for (const options of [{ exchangeError: { message: 'private' } }, { exchangeThrows: true }]) {
    const { response, calls } = await run(data(), options); rejected(response);
    assert.deepEqual(calls, ['create', 'exchange']);
  }
});

test('ambiguous, oversized, error and recovery callbacks do not initialize an auth client', async () => {
  for (const query of ['code=a&code=b', 'code=', 'code=short', 'code=' + 'a'.repeat(1025),
    'code=synthetic-code&type=recovery', 'code=synthetic-code&error_code=denied', 'error_description=private']) {
    const { response, calls } = await run(data(), {}, query); rejected(response); assert.deepEqual(calls, []);
  }
});

test('ordinary callback keeps safe return paths and refuses external destinations', async () => {
  const { response } = await run(data(), {}, 'code=synthetic-code&next=https%3A%2F%2Fevil.invalid');
  assert.equal(response.headers.get('location'), 'https://soe.invalid/auth/complete?next=%2Fdashboard&intent=' + intent);
  const empty = await run(data(), {}, 'next=%2Fpractice');
  rejected(empty.response); assert.equal(new URL(empty.response.headers.get('location')).searchParams.get('next'), '/practice');
  assert.equal(empty.response.headers.get('set-cookie'), null);
  assert.deepEqual(empty.calls, []);
});

test('account documents receive private cache and no-referrer headers before client execution', () => {
  const { proxy, config } = sourceLoader()('proxy.ts');
  for (const pathname of ['/auth/recovery', '/auth/confirm', '/auth/complete', '/login']) {
    assert(config.matcher.includes(pathname));
    const response = proxy(new NextRequest('https://soe.invalid' + pathname + '?flow=synthetic&code=synthetic'));
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
    assert.equal(response.headers.get('set-cookie'), null);
  }
});
