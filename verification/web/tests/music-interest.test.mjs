import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { offlineApp } from './support/offline-app.mjs';

const root = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const text = n => Array.isArray(n) ? n.map(text).join('') : n && typeof n === 'object' ? text(n.props?.children) : String(n ?? '');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

// Execute the actual TSX and event handlers. Hooks, transport, timers and focus
// are explicit local doubles. This is not browser or live lead-delivery proof.
function fixture() {
  const app = offlineApp({ root }), hooks = [], effects = [], cleanups = new Map(), timers = new Map(), calls = [];
  let cursor = 0, dirty = true, mounted = true, tree, timerId = 0, focused = '', lateUpdates = 0;
  let transport = async () => Response.json({ success: true });
  const equal = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  app.setMock('react', () => ({
    useState(initial) { const i = cursor++; if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial;
      return [hooks[i], v => { if (!mounted) { lateUpdates++; return; } hooks[i] = typeof v === 'function' ? v(hooks[i]) : v; dirty = true; }]; },
    useRef(initial) { const i = cursor++; if (!(i in hooks)) hooks[i] = { current: initial }; return hooks[i]; },
    useId() { cursor++; return 'music-interest-fixture'; },
    useCallback(fn, deps) { const i = cursor++; if (!hooks[i] || !equal(hooks[i].deps, deps)) hooks[i] = { fn, deps }; return hooks[i].fn; },
    useEffect(fn, deps) { const i = cursor++; if (!equal(hooks[i], deps)) { hooks[i] = deps; effects.push(() => { cleanups.get(i)?.(); const c = fn(); if (c) cleanups.set(i, c); else cleanups.delete(i); }); } },
  }));
  app.setMock('react/jsx-runtime', () => ({ jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }));
  app.setMock('@/components/PublicNav', () => ({ default: () => null }));
  app.setMock('@/components/PublicFooter', () => ({ default: () => null }));
  app.setMock('next/link', () => ({ default: 'a' }));
  app.context.window = { setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id) };
  app.context.navigator = { userAgent: 'synthetic-desktop' };
  app.context.document = { querySelectorAll: () => [] };
  app.context.IntersectionObserver = class { observe() {} disconnect() {} };
  app.context.fetch = async (url, options) => { assert.equal(url, '/api/music-therapy/interest'); calls.push({ url, options }); return transport(url, options); };
  const component = 'app/music-therapy/MusicInterestForm.tsx';
  const Form = app.load(fs.existsSync(path.join(root, component)) ? component : 'app/music-therapy/page.tsx').default;
  const walk = (n, out = []) => { if (Array.isArray(n)) n.forEach(x => walk(x, out)); else if (n && typeof n === 'object') { out.push(n); walk(n.props?.children, out); } return out; };
  const nodes = () => walk(tree);
  async function flush() { for (let i = 0; i < 8; i++) { if (mounted && dirty) { cursor = 0; dirty = false; tree = Form(); for (const n of nodes()) if (n.props?.ref?.current !== undefined) n.props.ref.current = { focus: () => { focused = text(n); } }; while (effects.length) effects.shift()(); } await new Promise(r => setImmediate(r)); } }
  const field = key => nodes().find(n => n.type === 'input' && (n.props.name === key || n.props.placeholder === ({ name: 'Your name', email: 'Your email' }[key])));
  const fill = async (key, value) => { const f = field(key); assert.ok(f, key); f.props.onChange({ target: { value } }); await flush(); };
  const submit = () => { const n = nodes().find(n => n.type === 'form'); assert.ok(n, 'form available'); return n.props.onSubmit({ preventDefault() {} }); };
  const click = label => { const n = nodes().find(n => n.type === 'button' && text(n) === label); assert.ok(n, label); return n.props.onClick(); };
  return { nodes, field, fill, submit, click, flush, calls, timers, focused: () => focused, text: () => text(tree),
    async seed() { await flush(); await fill('name', 'Synthetic Visitor'); await fill('email', 'visitor@example.invalid'); },
    setTransport(fn) { transport = fn; }, expire() { for (const [id, t] of [...timers]) { timers.delete(id); t.fn(); } },
    unmount() { mounted = false; for (const c of cleanups.values()) c(); }, lateUpdates: () => lateUpdates,
  };
}

test('waitlist rejects HTTP failures, malformed and contradictory receipts while keeping entered details', async () => {
  for (const reply of [() => Response.json({ error: 'failed' }, { status: 500 }), () => Response.json({ success: true }, { status: 503 }),
    () => Response.json({}), () => Response.json({ success: false }), () => Response.json({ success: 'true' }),
    () => Response.json({ success: true, error: 'failed' }), () => new Response('not-json'), () => new Response(null, { status: 204 })]) {
    const f = fixture(); await f.seed(); f.setTransport(reply); await f.submit(); await f.flush();
    assert.doesNotMatch(f.text(), /you.re on the list|interest received/i);
    assert.ok(f.nodes().some(n => n.props?.role === 'alert'));
    assert.equal(f.field('name').props.value, 'Synthetic Visitor'); assert.equal(f.field('email').props.value, 'visitor@example.invalid');
    assert.equal(f.calls.length, 1);
  }
});

test('explicit receipt confirms saved interest without promising a launch or email delivery', async () => {
  const f = fixture(); await f.seed(); await f.submit(); await f.flush();
  assert.match(f.text(), /interest received/i); assert.match(f.focused(), /interest received/i);
  assert.doesNotMatch(f.text(), /we.ll notify you|you.re on the list/i);
  assert.equal(f.nodes().some(n => n.type === 'form'), false); assert.equal(f.calls.length, 1);
});

test('every offered hardware preference survives the existing API allowlist', async () => {
  const api = fs.readFileSync(path.join(root, 'app/api/music-therapy/interest/route.ts'), 'utf8');
  const expected = ['learn', 'have_device', 'need_device', 'other'];
  for (const choice of expected) {
    assert.ok(api.includes(`'${choice}'`));
    const f = fixture(); await f.seed();
    const radio = f.nodes().find(n => n.type === 'input' && n.props.type === 'radio' && n.props.value === choice);
    assert.ok(radio, choice); radio.props.onChange(); await f.flush(); await f.submit();
    const req = f.calls[0].options; assert.equal(JSON.parse(req.body).hardware_status, choice);
    assert.equal(req.credentials, 'omit'); assert.equal(req.redirect, 'error'); assert.equal(req.cache, 'no-store');
  }
});

test('immediate repeated submit sends once and locks the submitted snapshot', async () => {
  const f = fixture(), gate = deferred(); await f.seed(); f.setTransport(() => gate.promise);
  const one = f.submit(), two = f.submit(); await f.flush();
  assert.equal(f.calls.length, 1); assert.ok(f.nodes().some(n => n.type === 'fieldset' && n.props.disabled));
  gate.resolve(Response.json({ success: true })); await Promise.all([one, two]); await f.flush(); assert.match(f.text(), /interest received/i);
});

test('network failure stays uncertain and a deliberate retry can recover', async () => {
  const f = fixture(); await f.seed(); f.setTransport(async () => { throw Error('private synthetic detail'); }); await f.submit(); await f.flush();
  assert.match(f.text(), /may have been saved/i); assert.doesNotMatch(f.text(), /private synthetic detail/);
  assert.equal(f.field('email').props.value, 'visitor@example.invalid'); assert.equal(f.calls.length, 1);
  f.setTransport(async () => Response.json({ success: true })); await f.submit(); await f.flush();
  assert.match(f.text(), /interest received/i); assert.equal(f.calls.length, 2);
});

test('stop waiting and timeout ignore late success without automatic retries', async () => {
  for (const timeout of [false, true]) {
    const f = fixture(), gate = deferred(); await f.seed(); f.setTransport(() => gate.promise);
    const one = f.submit(); await f.flush();
    if (timeout) { assert.equal([...f.timers.values()][0].delay, 20_000); f.expire(); } else f.click('Stop waiting');
    await f.flush(); assert.equal(f.calls[0].options.signal.aborted, true); assert.match(f.text(), /may have been saved/i);
    gate.resolve(Response.json({ success: true })); await one; await f.flush();
    assert.doesNotMatch(f.text(), /interest received/i); assert.equal(f.calls.length, 1); assert.equal(f.timers.size, 0);
  }
});

test('late receipt cannot overwrite a newer explicit retry or update an unmounted form', async () => {
  const f = fixture(), old = deferred(), current = deferred(); await f.seed(); f.setTransport(() => old.promise);
  const one = f.submit(); await f.flush(); f.click('Stop waiting'); await f.flush();
  await f.fill('name', 'Revised synthetic visitor'); f.setTransport(() => current.promise); const two = f.submit(); await f.flush();
  old.resolve(Response.json({ success: true })); await one; await f.flush(); assert.doesNotMatch(f.text(), /interest received/i);
  f.unmount(); assert.equal(f.calls[1].options.signal.aborted, true); current.resolve(Response.json({ success: true })); await two;
  assert.equal(f.lateUpdates(), 0); assert.equal(f.timers.size, 0);
});

test('validation failure remains editable and all fields have visible labels', async () => {
  const f = fixture(); await f.seed(); f.setTransport(async () => Response.json({ error: 'invalid' }, { status: 400 })); await f.submit(); await f.flush();
  assert.match(f.text(), /check your name and email/i);
  for (const key of ['name', 'email']) { const input = f.field(key); assert.ok(f.nodes().some(n => n.type === 'label' && n.props.htmlFor === input.props.id)); }
  assert.equal(f.field('name').props.value, 'Synthetic Visitor');
});

test('the page mounts the reviewed form and retains its existing audio lifecycle', () => {
  const page = fs.readFileSync(path.join(root, 'app/music-therapy/page.tsx'), 'utf8');
  assert.match(page, /import MusicInterestForm from '\.\/MusicInterestForm'/);
  assert.match(page, /<MusicInterestForm\s*\/>/);
  assert.doesNotMatch(page, /setSubmitted\(true\)|async function handleInterest/);
  assert.match(page, /const startSession = useCallback/);
  assert.match(page, /return \(\) => \{ endSession\(\); \}/);
});
