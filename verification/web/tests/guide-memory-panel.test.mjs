import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryFixture, source, A, B, INTENT, OTHER_INTENT } from './support/guide-memory-fixture.mjs';

// Execute the actual component's handlers/state with a small hook scheduler.
// Real DOM, layout and browser behavior are checked separately in the local React preview.
function panelFixture() {
  const fixture = memoryFixture(), hooks = [], effects = [], calls = [], cleanups = new Map();
  let cursor = 0, dirty = true, tree;
  let mounted = true, updatesAfterUnmount = 0, unsubscriptions = 0;
  let intent = INTENT, retire = () => {};
  const equal = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useState(initial) { const index = cursor++; if (!(index in hooks)) hooks[index] = initial;
      return [hooks[index], value => { if (!mounted) { updatesAfterUnmount++; return; }
        hooks[index] = typeof value === 'function' ? value(hooks[index]) : value; dirty = true; }]; },
    useRef(value) { const index = cursor++; if (!(index in hooks)) hooks[index] = { current: value }; return hooks[index]; },
    useId() { cursor++; return 'synthetic-panel'; },
    useCallback(fn, deps) { const index = cursor++; if (!equal(hooks[index]?.deps, deps)) hooks[index] = { deps, fn }; return hooks[index].fn; },
    useEffect(fn, deps) { const index = cursor++; if (!equal(hooks[index], deps)) { hooks[index] = deps; effects.push(() => {
      cleanups.get(index)?.(); const cleanup = fn(); if (cleanup) cleanups.set(index, cleanup); else cleanups.delete(index);
    }); } },
  };
  fixture.app.setMock('react', () => react);
  fixture.app.setMock('react/jsx-runtime', () => ({ jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }));
  const intentModule = fixture.app.load('lib/auth/browserIntent.ts');
  fixture.app.setMock('@/lib/auth/browserIntent', () => ({ ...intentModule, currentBrowserAuthIntent: () => intent, isCurrentBrowserAuthIntent: value => value === intent }));
  fixture.app.setMock('@/lib/auth/providerSelection', () => ({ subscribeAuthProviderChanges: callback => { retire = callback; return () => { unsubscriptions++; retire = () => {}; }; } }));
  fixture.app.context.fetch = async (url, options = {}) => {
    assert.ok(['/api/thinker/memory/review', '/api/auth/member'].includes(url)); calls.push({ url, options });
    if (url === '/api/auth/member') {
      assert.equal(new Headers(options.headers).get('x-soe-auth-intent'), intent);
      return Response.json({ member: { id: fixture.getActor() } });
    }
    assert.ok(new Headers(options.headers).has('x-soe-expected-member'), 'Private memory request must bind the discovered member');
    const request = new Request('http://localhost' + url, options);
    return fixture.handlers[options.method === 'POST' ? 'POST' : 'GET'](request);
  };
  const Panel = fixture.app.load('components/memory/ReviewedMemoryPanel.tsx').default;
  function render() { cursor = 0; dirty = false; tree = Panel(); while (effects.length) effects.shift()(); }
  async function flush() { for (let i = 0; i < 8; i++) { if (mounted && dirty) render(); await new Promise(resolve => setImmediate(resolve)); } }
  const walk = (node, result = []) => {
    if (Array.isArray(node)) node.forEach(n => walk(n, result));
    else if (node && typeof node === 'object') { result.push(node); walk(node.props?.children, result); }
    return result;
  };
  const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : String(node ?? '');
  const nodes = () => walk(tree);
  const button = label => nodes().find(node => node.type === 'button' && text(node) === label);
  const permission = () => nodes().filter(node => node.type === 'input' && node.props.type === 'checkbox')[1];
  async function click(label) { const node = button(label); assert.ok(node, label); assert.equal(Boolean(node.props.disabled), false, label + ' disabled'); node.props.onClick(); await flush(); }
  return { ...fixture, flush, nodes, button, permission, click, calls, text: () => text(tree),
    unmount() { mounted = false; for (const cleanup of cleanups.values()) cleanup(); cleanups.clear(); },
    lifecycle: () => ({ updatesAfterUnmount, unsubscriptions }),
    switchAccount(notify = true) { intent = OTHER_INTENT; fixture.setIntent(intent); fixture.setActor(B); if (notify) retire(); } };
}

test('unmount invalidates late session, memory-read and suggestion responses without updating retired controls', async () => {
  for (const phase of ['session', 'memory-read', 'suggestions']) {
    const f = panelFixture(); let release;
    if (phase === 'suggestions') {
      f.controls.prepare = input => new Promise(resolve => { release = () => resolve([{ category: 'decision', text: 'SYNTHETIC_RETIRED_RESPONSE', sourceMessageId: input.messages[0].id }]); });
      await f.flush(); f.permission().props.onChange({ target: { checked: true } }); await f.flush();
      await f.click('Prepare memory suggestions');
    } else {
      const fetch = f.app.context.fetch;
      const target = phase === 'session' ? '/api/auth/member' : '/api/thinker/memory/review';
      f.app.context.fetch = async (url, options) => {
        const response = await fetch(url, options);
        return url === target ? new Promise(resolve => { release = () => resolve(response); }) : response;
      };
      await f.flush();
    }
    assert.ok(release, phase + ' must have a pending response');
    f.unmount(); const callCount = f.calls.length;
    release(); await f.flush();
    assert.deepEqual(f.lifecycle(), { updatesAfterUnmount: 0, unsubscriptions: 1 }, phase);
    assert.equal(f.calls.length, callCount, phase + ' must not start another request after unmount');
    assert.equal((await f.service.view(A)).memories.length, 0);
  }
});

test('refresh invalidates processing permission for changed source revisions, replacement sources and providers', async () => {
  for (const change of ['revision', 'source', 'provider', 'destination']) {
    const f = panelFixture(); await f.flush();
    assert.match(f.text(), /Memory is off/);
    f.permission().props.onChange({ target: { checked: true } }); await f.flush();
    assert.equal(f.permission().props.checked, true); assert.equal(f.button('Prepare memory suggestions').props.disabled, false);
    if (change === 'revision') f.setSource({ ...source(), revision: 'revision-2' });
    if (change === 'source') f.setSource({ ...source(), id: 'replacement-private-source' });
    if (change === 'provider') { f.provider.id = 'changed-synthetic-provider'; f.provider.name = 'Changed local demonstration'; }
    if (change === 'destination') f.provider.destination = 'a changed synthetic destination';
    await f.click('Refresh memory status');
    assert.equal(f.permission().props.checked, false); assert.equal(f.button('Prepare memory suggestions').props.disabled, true);
    assert.equal(f.calls.filter(call => call.options.method === 'POST').length, 0);
    f.permission().props.onChange({ target: { checked: true } }); await f.flush();
    await f.click('Prepare memory suggestions');
    const sent = JSON.parse(f.calls.find(call => call.options.method === 'POST').options.body);
    assert.equal(sent.sourceRevision, change === 'revision' ? 'revision-2' : 'revision-1');
    assert.equal(sent.sourceId, change === 'source' ? 'replacement-private-source' : 'synthetic-private-source');
    assert.equal(sent.consent.providerId, change === 'provider' ? 'changed-synthetic-provider' : 'synthetic-local');
    assert.equal(sent.consent.providerName, f.provider.name); assert.equal(sent.consent.destination, f.provider.destination);
    assert.equal((await f.service.view(A)).memories.length, 0);
  }
});

test('initial component load discovers identity only at the session endpoint before a bound private read', async () => {
  const f = panelFixture(); await f.flush();
  assert.deepEqual(f.calls.slice(0, 2).map(call => call.url), ['/api/auth/member', '/api/thinker/memory/review']);
  assert.equal(new Headers(f.calls[0].options.headers).get('x-soe-expected-member'), null);
  assert.equal(new Headers(f.calls[1].options.headers).get('x-soe-expected-member'), A);
  assert.equal(new Headers(f.calls[1].options.headers).get('x-soe-auth-intent'), INTENT);
  assert.match(f.text(), /Memory is off/);
});

test('account changes retire viewed notes and refuse stale controls even without a notification event', async () => {
  for (const notify of [true, false]) {
    const f = panelFixture(); await f.flush();
    const enable = f.nodes().filter(node => node.type === 'input' && node.props.type === 'checkbox')[0];
    f.switchAccount(notify); enable.props.onChange({ target: { checked: true } }); await f.flush();
    assert.equal(f.calls.filter(call => call.options.method === 'POST').length, 0);
    assert.match(f.text(), /sign-in changed/);
    assert.equal((await f.service.view(B)).enabled, false);
  }
});

test('late preparation responses are discarded after the viewed account changes', async () => {
  const f = panelFixture(); let release;
  f.controls.prepare = input => new Promise(resolve => { release = () => resolve([{ category: 'decision', text: 'PRIVATE_SYNTHETIC_LATE_NOTE', sourceMessageId: input.messages[0].id }]); });
  await f.flush(); f.permission().props.onChange({ target: { checked: true } }); await f.flush();
  await f.click('Prepare memory suggestions'); assert.ok(release);
  f.switchAccount(); release(); await f.flush();
  assert.doesNotMatch(f.text(), /PRIVATE_SYNTHETIC_LATE_NOTE/); assert.match(f.text(), /sign-in changed/);
  assert.equal((await f.service.view(B)).memories.length, 0);
});

test('actual panel keeps an edited note unsaved until its specific save action and refresh retains the saved result', async () => {
  const f = panelFixture(); await f.flush();
  f.permission().props.onChange({ target: { checked: true } }); await f.flush(); await f.click('Prepare memory suggestions');
  const textarea = f.nodes().find(node => node.type === 'textarea');
  textarea.props.onChange({ target: { value: 'Synthetic reviewed edit.' } }); await f.flush();
  assert.equal((await f.service.view('11111111-1111-4111-8111-111111111111')).memories.length, 0);
  await f.click('Save this reviewed memory');
  assert.match(f.text(), /reviewed memory was saved/); await f.click('Refresh memory status');
  assert.match(f.text(), /Synthetic reviewed edit/); assert.match(f.text(), /Memory is off/);
});

test('actual panel keeps an unconfirmed persistence result out of success messaging and requires refresh', async () => {
  const f = panelFixture(); await f.flush();
  f.permission().props.onChange({ target: { checked: true } }); await f.flush(); await f.click('Prepare memory suggestions');
  f.controls.failCommit = true; await f.click('Save this reviewed memory');
  assert.match(f.text(), /save could not be confirmed/); assert.doesNotMatch(f.text(), /reviewed memory was saved/);
  assert.equal(f.button('Save this reviewed memory').props.disabled, true);
  f.controls.failCommit = false; await f.click('Refresh memory status');
  assert.equal(f.button('Save this reviewed memory').props.disabled, false);
});
