import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { offlineApp } from './support/offline-app.mjs';

const root = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const owner = '10000000-0000-4000-8000-000000000001';
const peer = '20000000-0000-4000-8000-000000000002';
const profile = { id: peer, display_name: 'Synthetic Explorer', bio: 'A public synthetic profile.', discipline: null,
  skills: ['Reading'], project_description: null, seeking: null, philosophy: null };
const receipt = (members = [profile], account = owner) => Response.json({ members }, { headers: { 'x-soe-directory-owner': account } });
const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : String(node ?? '');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

// Execute the actual page and its existing profile parser. Account, transport,
// timers and hook scheduling are synthetic; these are not hosted access tests.
function fixture({ session, token, transport } = {}) {
  const app = offlineApp({ root }), hooks = [], effects = [], cleanups = new Map(), calls = [], timers = new Map(), routes = [];
  let cursor = 0, dirty = true, mounted = true, tree, timerId = 0, updatesAfterUnmount = 0, providerChanged, focused = null;
  let getSession = session ?? (async () => ({ member: { id: owner, display_name: 'Synthetic Owner' } }));
  let getToken = token ?? (async () => 'SYNTHETIC_TOKEN_NOT_A_CREDENTIAL');
  let request = transport ?? (async () => receipt());
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const router = { push: route => routes.push(route) };
  app.setMock('react', () => ({
    useState(initial) { const i = cursor++; if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial;
      return [hooks[i], value => { if (!mounted) { updatesAfterUnmount++; return; } hooks[i] = typeof value === 'function' ? value(hooks[i]) : value; dirty = true; }]; },
    useRef(initial) { const i = cursor++; if (!(i in hooks)) hooks[i] = { current: initial }; return hooks[i]; },
    useCallback(fn, deps) { const i = cursor++; if (!same(hooks[i]?.deps, deps)) hooks[i] = { deps, fn }; return hooks[i].fn; },
    useEffect(fn, deps) { const i = cursor++; if (!same(hooks[i], deps)) { hooks[i] = deps; effects.push(() => {
      cleanups.get(i)?.(); const cleanup = fn(); if (cleanup) cleanups.set(i, cleanup); else cleanups.delete(i);
    }); } },
  }));
  app.setMock('react/jsx-runtime', () => ({ jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }));
  app.setMock('next/navigation', () => ({ useRouter: () => router }));
  app.setMock('next/link', () => ({ default: 'a' }));
  app.setMock('@/lib/auth/getSession', () => ({ getMemberSession: () => getSession(), getSupabaseAccessToken: () => getToken() }));
  app.setMock('@/lib/auth/providerSelection', () => ({ subscribeAuthProviderChanges: fn => { providerChanged = fn; return () => { providerChanged = null; }; } }));
  app.setMock('./DirectMessageBlocks', () => ({ default: () => null, sendBlockChange: () => { throw Error('No message changes authorized in fixture'); } }));
  app.setMock('./direct-message.module.css', () => ({ default: {} }));
  app.setMock('@/components/PublishedProfileLink', () => ({ default: () => null }));
  app.setMock('./MemberFinder', () => ({ default: () => null }));
  app.context.window = { setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id) };
  app.context.document = { visibilityState: 'visible' };
  app.context.fetch = async (url, options = {}) => {
    assert.ok(!options.method || options.method === 'GET', 'Fixture must never mutate');
    if (url === '/api/message') return Response.json({ unreadCount: 0 });
    assert.equal(url, '/api/members/discover'); calls.push({ url, options }); return request(url, options);
  };
  const Page = app.load('app/members/page.tsx').default;
  const walk = (node, result = []) => { if (Array.isArray(node)) node.forEach(n => walk(n, result)); else if (node && typeof node === 'object') { result.push(node); walk(node.props?.children, result); } return result; };
  const nodes = () => walk(tree);
  function render() { cursor = 0; dirty = false; tree = Page();
    for (const node of nodes()) if (node.props?.ref && typeof node.props.ref === 'object') node.props.ref.current = { focus: () => { focused = text(node); }, scrollIntoView() {} };
    while (effects.length) effects.shift()(); }
  async function flush() { for (let i = 0; i < 10; i++) { if (mounted && dirty) render(); await new Promise(resolve => setImmediate(resolve)); } }
  const retry = () => { const button = nodes().find(n => n.type === 'button' && text(n) === 'Try directory again'); assert.ok(button, 'Explicit directory retry'); return button.props.onClick(); };
  return { calls, routes, nodes, flush, retry, text: () => text(tree), timers, focused: () => focused,
    setSession: fn => { getSession = fn; }, setToken: fn => { getToken = fn; }, setTransport: fn => { request = fn; },
    fireDeadline: () => { for (const [id, timer] of [...timers]) if (timer.ms === 10_000) { timers.delete(id); timer.fn(); } },
    changeProvider: () => providerChanged?.(),
    unmount: () => { mounted = false; for (const cleanup of cleanups.values()) cleanup(); }, updatesAfterUnmount: () => updatesAfterUnmount };
}

test('directory read binds the selected account and only accepts its validated published response', async () => {
  const f = fixture(); await f.flush(); assert.match(f.text(), /Synthetic Explorer/);
  assert.match(f.text(), /1 PUBLISHED PROFILES/); assert.equal(f.calls.length, 1);
  const options = f.calls[0].options, headers = new Headers(options.headers);
  assert.equal(headers.get('x-soe-expected-member'), owner); assert.equal(options.cache, 'no-store');
  assert.equal(options.credentials, 'same-origin'); assert.equal(options.redirect, 'error'); assert.ok(options.signal);
  assert.equal(f.timers.size, 0);
});

test('HTTP failures and malformed or wrong-account receipts never become an empty or populated directory', async () => {
  const invalid = [() => Response.json({ error: 'unavailable' }, { status: 503 }), () => receipt([profile], peer),
    () => Response.json({ members: [profile] }), () => receipt([{ id: peer, display_name: 'Synthetic Explorer' }]),
    () => receipt([{ ...profile, email: 'private@example.invalid' }]), () => receipt([profile, profile]),
    () => new Response('not-json', { headers: { 'x-soe-directory-owner': owner } }),
    () => Response.json({ members: [], private: true }, { headers: { 'x-soe-directory-owner': owner } })];
  for (const transport of invalid) {
    const f = fixture({ transport }); await f.flush();
    assert.doesNotMatch(f.text(), /Synthetic Explorer|0 PUBLISHED PROFILES|No published profiles are available/);
    assert.ok(f.nodes().some(n => n.props?.role === 'alert')); assert.match(f.text(), /Try directory again/);
    assert.equal(f.calls.length, 1); assert.equal(f.timers.size, 0);
  }
});

test('membership denial is distinct from a service failure and a confirmed empty directory', async () => {
  const forbidden = fixture({ transport: async () => Response.json({}, { status: 403 }) }); await forbidden.flush();
  assert.match(forbidden.text(), /Join this community/); assert.doesNotMatch(forbidden.text(), /No published profiles/);
  const empty = fixture({ transport: async () => receipt([]) }); await empty.flush();
  assert.match(empty.text(), /0 PUBLISHED PROFILES/); assert.match(empty.text(), /No published profiles are available/);
  assert.ok(empty.nodes().some(n => n.props?.role === 'status' && /No published profiles/.test(text(n))));
});

test('a stalled directory fetch times out, aborts, and never retries automatically', async () => {
  const pending = deferred(), f = fixture({ transport: () => pending.promise }); await f.flush();
  assert.match(f.text(), /Loading published profiles/); assert.equal(f.timers.size, 1);
  f.fireDeadline(); await f.flush(); assert.equal(f.calls[0].options.signal.aborted, true);
  assert.match(f.text(), /Try directory again/); assert.doesNotMatch(f.text(), /Loading published profiles/); assert.equal(f.calls.length, 1);
  pending.resolve(receipt()); await f.flush(); assert.doesNotMatch(f.text(), /Synthetic Explorer/); assert.equal(f.timers.size, 0);
});

test('the deadline also covers sign-in lookup, token lookup, and response parsing', async () => {
  for (const step of ['session', 'token', 'body']) {
    const pending = deferred();
    const f = fixture(step === 'session' ? { session: () => pending.promise }
      : step === 'token' ? { token: () => pending.promise }
        : { transport: async () => ({ ok: true, status: 200, headers: new Headers({ 'x-soe-directory-owner': owner }), json: () => pending.promise }) });
    await f.flush(); f.fireDeadline(); await f.flush(); assert.match(f.text(), /Try directory again/, step);
    pending.resolve(step === 'session' ? { member: { id: owner, display_name: 'Synthetic Owner' } }
      : step === 'token' ? 'SYNTHETIC_TOKEN_NOT_A_CREDENTIAL' : { members: [profile] });
    await f.flush(); assert.doesNotMatch(f.text(), /Synthetic Explorer/);
    assert.equal(f.calls.length, step === 'body' ? 1 : 0);
  }
});

test('an explicit retry recovers without overlapping requests or late first-result replacement', async () => {
  const old = deferred(), next = deferred(), f = fixture({ transport: () => old.promise }); await f.flush();
  f.fireDeadline(); await f.flush(); f.setTransport(() => next.promise); f.retry(); f.retry(); await f.flush();
  assert.equal(f.calls.length, 2); assert.match(f.text(), /Loading published profiles/);
  old.resolve(receipt([{ ...profile, display_name: 'Stale Explorer' }])); await f.flush();
  assert.doesNotMatch(f.text(), /Stale Explorer/); assert.match(f.text(), /Loading published profiles/);
  assert.equal(f.timers.size, 1); next.resolve(receipt()); await f.flush(); assert.match(f.text(), /Synthetic Explorer/);
  assert.equal(f.focused(), '1 PUBLISHED PROFILES');
});

test('provider retirement cancels a pending directory read and closes the previous view', async () => {
  const pending = deferred(), f = fixture({ transport: () => pending.promise }); await f.flush();
  f.changeProvider(); await f.flush(); assert.equal(f.calls[0].options.signal.aborted, true);
  assert.match(f.text(), /Sign-in changed/); assert.equal(f.timers.size, 0);
  pending.resolve(receipt()); await f.flush(); assert.doesNotMatch(f.text(), /Synthetic Explorer/); assert.equal(f.calls.length, 1);
});

test('unmount aborts the read and ignores a delayed response body', async () => {
  const pending = deferred(), f = fixture({ transport: async () => ({ ok: true, status: 200, headers: new Headers({ 'x-soe-directory-owner': owner }), json: () => pending.promise }) });
  await f.flush(); f.unmount(); assert.equal(f.calls[0].options.signal.aborted, true);
  pending.resolve({ members: [profile] }); await f.flush(); assert.equal(f.updatesAfterUnmount(), 0); assert.equal(f.timers.size, 0);
});

test('missing session redirects without making a directory request', async () => {
  const f = fixture({ session: async () => null }); await f.flush(); assert.deepEqual(f.routes, ['/']); assert.equal(f.calls.length, 0);
});

test('rejected sign-in or transport preserves a usable explicit recovery path', async () => {
  for (const step of ['session', 'transport']) {
    const failure = async () => { throw Error('PRIVATE_SYNTHETIC_FAILURE'); };
    const f = fixture({ [step]: failure }); await f.flush();
    assert.match(f.text(), /Try directory again/); assert.doesNotMatch(f.text(), /PRIVATE_SYNTHETIC_FAILURE/);
    f.setSession(async () => ({ member: { id: owner, display_name: 'Synthetic Owner' } })); f.setTransport(async () => receipt());
    f.retry(); await f.flush(); assert.match(f.text(), /Synthetic Explorer/);
  }
});
